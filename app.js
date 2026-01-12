// PAB 20/20 Vision Timer (Web/PWA)
// Cycle: 20 min -> beep 3s -> 20s -> beep 3s -> repeat until Stop
// Fixes: Uses wall-clock timing (Date.now) so it doesn't "pause" visually when tab/app isn't visible.
// Note: Browsers may still block audio while hidden; timer state will stay accurate and catch up.

const WORK_SEC = 20 * 60; // 20 minutes
const REST_SEC = 20;      // 20 seconds
const BEEP_SEC = 3;       // 3 seconds

const phaseEl = document.getElementById("phase");
const timeEl  = document.getElementById("time");
const hintEl  = document.getElementById("hint");

const startBtn = document.getElementById("startBtn");
const stopBtn  = document.getElementById("stopBtn");
const vibrateToggle = document.getElementById("vibrateToggle");

// --- Add a Test Beep button (no HTML edit needed) ---
const testBtn = document.createElement("button");
testBtn.textContent = "Test Beep";
testBtn.className = "btn";
testBtn.style.marginTop = "14px";
document.querySelector(".wrap")?.appendChild(testBtn);

// App state
let running = false;
let phase = "ready";           // "work" | "rest" | "beep" | "ready"
let secondsLeft = WORK_SEC;
let nextAfterBeep = "rest";    // where to go after beep ends

// Wall-clock timing
let phaseEndAtMs = null;       // absolute end time for current phase
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

  // Optional vibration (mostly Android)
  if (vibrateToggle?.checked && navigator.vibrate) {
    navigator.vibrate([300, 120, 300, 120, 300, 120, 300]); // ~3s
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
  stopBtn.disabled = !running;
}

function durationSecondsFor(p) {
  if (p === "work") return WORK_SEC;
  if (p === "rest") return REST_SEC;
  if (p === "beep") return BEEP_SEC;
  return WORK_SEC;
}

// ---- Phase engine (wall-clock based) ----
function startPhase(p, nextAfter = null) {
  phase = p;

  if (p === "beep") {
    nextAfterBeep = nextAfter || "work";
    // Start beep tone now (may be blocked while hidden; that's OK)
    playToneFor(BEEP_SEC);
  } else {
    stopTone();
  }

  const durSec = durationSecondsFor(p);
  phaseEndAtMs = Date.now() + durSec * 1000;
  secondsLeft = durSec;
  render();
}

function advanceIfNeeded(nowMs) {
  // If we were hidden/suspended, we may have missed multiple transitions.
  while (running && phaseEndAtMs && nowMs >= phaseEndAtMs) {
    if (phase === "work") {
      startPhase("beep", "rest");
    } else if (phase === "rest") {
      startPhase("beep", "work");
    } else if (phase === "beep") {
      stopTone();
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
  const secLeft = Math.max(0, Math.ceil(msLeft / 1000));
  secondsLeft = secLeft;
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

  ensureAudio();            // unlock audio on user gesture
  startAudioKeepAlive();    // keep audio context alive

  setButtons();

  // Always start at work
  startPhase("work");

  // Visual updates
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frameLoop);

  // Safety poll (helps catch up sooner after background throttling)
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
});

// If you tab away and come back, immediately catch up
document.addEventListener("visibilitychange", () => {
  if (!running) return;
  const now = Date.now();
  advanceIfNeeded(now);
  updateRemaining(now);
});

// Init
render();
setButtons();
