// PAB 20/20 Vision Timer (Web/PWA)
// Cycle: 20 min -> beep 3s -> 20s -> beep 3s -> repeat until Stop
// Fix: wall-clock timing (Date.now) so the timer catches up after tab/app isn't visible.
// Note: browsers may block audio while hidden; timer state stays accurate and catches up.
// Added: white full-screen flash during the 3-second beep phase.

const WORK_SEC = 20 * 60; // 20 minutes
const REST_SEC = 20;      // 20 seconds
const BEEP_SEC = 3;       // 3 seconds

const phaseEl = document.getElementById("phase");
const timeEl  = document.getElementById("time");
const hintEl  = document.getElementById("hint");

const startBtn = document.getElementById("startBtn");
const stopBtn  = document.getElementById("stopBtn");
const vibrateToggle = document.getElementById("vibrateToggle");

// ---- White flash overlay for beep ----
let flashEl = document.getElementById("beep-flash");
if (!flashEl) {
  flashEl = document.createElement("div");
  flashEl.id = "beep-flash";
  document.body.appendChild(flashEl);
}
function startFlash() { flashEl.classList.add("active"); }
function stopFlash()  { flashEl.classList.remove("active"); }

// ---- Add a Test Beep button (no HTML changes needed) ----
const testBtn = document.createElement("button");
testBtn.textContent = "Test Beep";
testBtn.className = "btn";
testBtn.style.marginTop = "14px";
document.querySelector(".wrap")?.appendChild(testBtn);

// App state
let running = false;
let phase = "ready";           // "work" | "rest" | "beep" | "ready"
let secondsLeft = WORK_SEC;
let nextAfterBeep = "rest";

// Wall-clock timing
let phaseEndAtMs = null;
let rafId = null;
let backgroundPollId = null;

// ---- Audio: WebAudio continuous tone ----
let audioCtx = null;
let currentOsc = null;
let keepAliveTimer = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

// Keeps AudioContext from sleeping on some devices
function startAudioKeepAlive() {
  stopAudioKeepAlive();
  keepAliveTimer = setInterval(() => {
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
  }, 2000);
}

function stopAudioKeepAlive() {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = null;
}

function stopTone() {
  try { currentOsc?.stop(); } catch (_) {}
  currentOsc = null;
}

function playToneFor(seconds) {
  ensureAudio();
  stopTone();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "sine";
  osc.frequency.value = 880;

  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.45, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);

  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + seconds);

  currentOsc = osc;

  if (vibrateToggle?.checked && navigator.vibrate) {
    navigator.vibrate([300, 120, 300, 120, 300, 120, 300]);
  }
}

// ---- UI helpers ----
function fmt(sec) {
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function render() {
  timeEl.textContent = fmt(secondsLeft);

  if (phase === "ready") {
    phaseEl.textContent = "Ready";
    hintEl.textContent = "Tap Start to begin";
  } else if (phase === "work") {
    phaseEl.textContent = "Work (20:00)";
    hintEl.textContent = "Focus time";
  } else if (phase === "rest") {
    phaseEl.textContent = "Rest (00:20)";
    hintEl.textContent = "Look ~20 feet away";
  } else if (phase === "beep") {
    phaseEl.textContent = "Beep (3s)";
    hintEl.textContent = "Transition";
  }
}

function setButtons() {
  startBtn.disabled = running;
  stopBtn.disabled  = !running;
}

function durationSecondsFor(p) {
  if (p === "work") return WORK_SEC;
  if (p === "rest") return REST_SEC;
  if (p === "beep") return BEEP_SEC;
  return WORK_SEC;
}

// ---- Phase engine (wall-clock) ----
function startPhase(p, nextAfter = null) {
  phase = p;

  if (p === "beep") {
    nextAfterBeep = nextAfter || "work";
    playToneFor(BEEP_SEC); // audio (may be blocked if hidden)
    startFlash();          // visual alert
  } else {
    stopTone();
    stopFlash();
  }

  const durSec = durationSecondsFor(p);
  phaseEndAtMs = Date.now() + durSec * 1000;
  secondsLeft = durSec;
  render();
}

function advanceIfNeeded(nowMs) {
  // Catch up across multiple transitions if the page was suspended.
  while (running && phaseEndAtMs && nowMs >= phaseEndAtMs) {
    if (phase === "work") {
      startPhase("beep", "rest");
    } else if (phase === "rest") {
      startPhase("beep", "work");
    } else if (phase === "beep") {
      stopTone();
      stopFlash();
      startPhase(nextAfterBeep);
    } else {
      startPhase("work");
    }
    nowMs = Date.now();
  }
}

function updateRemaining(nowMs) {
  if (!phaseEndAtMs) return;
  const msLeft = Math.max(0, phaseEndAtMs - nowMs);
  secondsLeft = Math.max(0, Math.ceil(msLeft / 1000));
  render();
}

function frameLoop() {
  if (!running) return;
  const now = Date.now();
  advanceIfNeeded(now);
  updateRemaining(now);
  rafId = requestAnimationFrame(frameLoop);
}

// ---- Controls ----
function start() {
  if (running) return;
  running = true;

  ensureAudio();         // unlock audio on user gesture
  startAudioKeepAlive();

  setButtons();
  startPhase("work");

  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frameLoop);

  // Safety poll to advance phases even if rAF is throttled
  if (backgroundPollId) clearInterval(backgroundPollId);
  backgroundPollId = setInterval(() => {
    if (!running) return;
    advanceIfNeeded(Date.now());
  }, 1000);
}

function stop() {
  running = false;

  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;

  if (backgroundPollId) clearInterval(backgroundPollId);
  backgroundPollId = null;

  stopTone();
  stopFlash();
  stopAudioKeepAlive();

  phase = "ready";
  secondsLeft = WORK_SEC;
  phaseEndAtMs = null;

  setButtons();
  render();
}

startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);

testBtn?.addEventListener("click", () => {
  ensureAudio();
  startAudioKeepAlive();
  playToneFor(1);
  // quick flash for test beep
  startFlash();
  setTimeout(stopFlash, 200);
});

// Catch up immediately when returning to the tab/window
document.addEventListener("visibilitychange", () => {
  if (!running) return;
  const now = Date.now();
  advanceIfNeeded(now);
  updateRemaining(now);
});

// Init
render();
setButtons();
