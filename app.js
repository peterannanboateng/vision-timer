// 20min -> beep 3s -> 20s -> beep 3s -> repeat until Stop

let phaseEndAtMs = null;   // when the current phase should end (ms since epoch)
let beepEndAtMs = null;    // when the beep should end (only used during beep phase)
let rafId = null;
let hiddenPollId = null;

const WORK_SEC = 20 * 60; // 20 minutes
const REST_SEC = 20;      // 20 seconds
const BEEP_SEC = 3;       // 3 seconds

const phaseEl = document.getElementById("phase");
const timeEl  = document.getElementById("time");
const hintEl  = document.getElementById("hint");

const startBtn = document.getElementById("startBtn");
const stopBtn  = document.getElementById("stopBtn");
const vibrateToggle = document.getElementById("vibrateToggle");

// --- Add a Test Beep button dynamically (so you don't have to edit HTML) ---
const testBtn = document.createElement("button");
testBtn.textContent = "Test Beep";
testBtn.className = "btn";
testBtn.style.marginTop = "14px";
document.querySelector(".wrap").appendChild(testBtn);

let running = false;
let timerId = null;

let phase = "ready";      // "work" | "rest" | "beep" | "ready"
let secondsLeft = WORK_SEC;
let nextAfterBeep = "rest";

// ---- Audio: WebAudio continuous tone (more reliable than short pulses) ----
let audioCtx = null;
let currentOsc = null;
let currentGain = null;
let keepAliveTimer = null;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (common on mobile)
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

// Keeps AudioContext from going to sleep on some mobile devices
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
  try {
    if (currentOsc) currentOsc.stop();
  } catch (_) {}
  currentOsc = null;
  currentGain = null;
}

function playToneFor(seconds) {
  ensureAudio();

  // Stop any prior tone
  stopTone();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  // Louder + clearer
  osc.type = "sine";
  osc.frequency.value = 880; // A5

  // Smooth ramp in/out to avoid clicks
  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.4, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);

  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + seconds);

  currentOsc = osc;
  currentGain = gain;

  // Optional vibration (mostly Android)
  if (vibrateToggle.checked && navigator.vibrate) {
    navigator.vibrate([300, 120, 300, 120, 300, 120, 300]); // ~3s-ish
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

function goToPhase(p) {
  phase = p;
  if (p === "work") secondsLeft = WORK_SEC;
  if (p === "rest") secondsLeft = REST_SEC;
  render();
}

function goToBeep(next) {
  phase = "beep";
  secondsLeft = BEEP_SEC;
  nextAfterBeep = next;
  render();

  // Beep continuously for 3 seconds
  playToneFor(BEEP_SEC);
}

// ---- Timer loop ----
function tick() {
  if (!running) return;

  if (secondsLeft > 0) {
    secondsLeft -= 1;
    render();
    return;
  }

  // Phase completed
  if (phase === "work") {
    goToBeep("rest");
  } else if (phase === "rest") {
    goToBeep("work");
  } else if (phase === "beep") {
    stopTone();
    goToPhase(nextAfterBeep);
  }
}

function start() {
  if (running) return;
  running = true;

  // Unlock audio on user gesture (this is critical on mobile)
  ensureAudio();
  startAudioKeepAlive();

  // Start from work
  phase = "work";
  secondsLeft = WORK_SEC;

  setButtons();
  render();

  if (timerId) clearInterval(timerId);
  timerId = setInterval(tick, 1000);
}

function stop() {
  running = false;

  if (timerId) clearInterval(timerId);
  timerId = null;

  stopTone();
  stopAudioKeepAlive();

  phase = "ready";
  secondsLeft = WORK_SEC;

  setButtons();
  render();
}

startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);

testBtn.addEventListener("click", () => {
  ensureAudio();
  startAudioKeepAlive();
  playToneFor(1); // 1 second test beep
});

// initial
render();
setButtons();

