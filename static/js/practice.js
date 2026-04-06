import { API, UI, tg } from "./utils.js";
import { state } from "./state.js";
import { T } from "./toast.js";
import { showScreen } from "./ui.js";

/** --- State --- */

let sessionWords = [];
let sessionIdx = 0;
let sessionStats = { good: 0, hard: 0, again: 0 };
let practiceHistory = [];
let isGrading = false;
let isSwiping = false;
let pointerStartX = 0,
  pointerStartY = 0,
  pointerStartTime = 0;
let rafId = null;

/** --- Session --- */

export async function startPractice() {
  try {
    const data = await API.get("/api/session");
    const words = data.result.words;
    if (!words || words.length === 0) return;
    sessionWords = words;
    sessionIdx = 0;
    sessionStats = { good: 0, hard: 0, again: 0 };
    practiceHistory = [];
    showScreen("practice");
    initSwipe();
    renderWord();
  } catch (e) {
    console.error(e);
    UI.toast(T.SESSION_FAIL, "error");
  }
}

/** --- Swipe Handlers --- */

function handleStart(x, y) {
  if (isGrading) return;
  pointerStartX = x;
  pointerStartY = y;
  pointerStartTime = Date.now();
  isSwiping = false;
  const card = document.getElementById("word-card");
  if (card) {
    card.classList.add("swiping");
    card.style.cursor = "grabbing";
  }
}

function handleMove(x, y) {
  if (isGrading || (pointerStartX === 0 && pointerStartY === 0)) return;
  const deltaX = x - pointerStartX;
  const deltaY = y - pointerStartY;
  if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
    isSwiping = true;
  }

  if (isSwiping) {
    const card = document.getElementById("word-card");
    if (!card) return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const isFlipped = card.classList.contains("flipped");
      const baseRot = isFlipped ? 180 : 0;
      let swipeDir = null;
      if (Math.abs(deltaY) > Math.abs(deltaX) * 1.5 && deltaY < -40)
        swipeDir = "up";
      else if (Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        if (deltaX < -60) swipeDir = "left";
        else if (deltaX > 100) swipeDir = "right";
      }

      const tilt = isFlipped ? -deltaX * 0.1 : deltaX * 0.1;
      card.style.transform = `translate(${deltaX}px, ${deltaY}px) rotateY(${baseRot}deg) rotateZ(${tilt}deg)`;
      card.classList.toggle("swipe-left", swipeDir === "left");
      card.classList.toggle("swipe-right", swipeDir === "right");
      card.classList.toggle("swipe-up", swipeDir === "up");
      if (swipeDir && card.dataset.lastDir !== swipeDir)
        tg.HapticFeedback.impactOccurred("light");
      card.dataset.lastDir = swipeDir || "";
    });
  }
}

function handleEnd(x, y) {
  if (isGrading || (pointerStartX === 0 && pointerStartY === 0)) return;
  if (rafId) cancelAnimationFrame(rafId);
  const card = document.getElementById("word-card");
  if (!card) return;
  card.classList.remove("swiping");
  card.style.cursor = "grab";

  const deltaTime = Date.now() - pointerStartTime;
  const deltaX = x - pointerStartX;
  const deltaY = y - pointerStartY;
  const velocity = Math.abs(deltaX) / (deltaTime || 1);

  if (!isSwiping) {
    card.classList.toggle("flipped");
    tg.HapticFeedback.impactOccurred("light");
    const rot = card.classList.contains("flipped") ? 180 : 0;
    card.style.transform = `rotateY(${rot}deg)`;
  } else {
    const isFlick = velocity > 0.5;
    if (
      (deltaX < -60 || (deltaX < -30 && isFlick)) &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.1
    )
      grade(1);
    else if (
      (deltaX > 100 || (deltaX > 30 && isFlick)) &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.1
    )
      grade(5);
    else if (
      (deltaY < -80 || (deltaY < -30 && isFlick)) &&
      Math.abs(deltaY) > Math.abs(deltaX) * 1.3
    )
      grade(3);
    else {
      card.classList.remove("swipe-left", "swipe-right", "swipe-up");
      const rot = card.classList.contains("flipped") ? 180 : 0;
      card.style.transform = `rotateY(${rot}deg)`;
    }
  }
  pointerStartX = 0;
  pointerStartY = 0;
}

/** --- Swipe Initialization --- */

function initSwipe() {
  const card = document.getElementById("word-card");
  if (!card) return;

  card.onpointerdown = (e) => {
    card.setPointerCapture(e.pointerId);
    handleStart(e.clientX, e.clientY);
  };
  card.onpointermove = (e) => {
    handleMove(e.clientX, e.clientY);
  };
  card.onpointerup = (e) => {
    card.releasePointerCapture(e.pointerId);
    handleEnd(e.clientX, e.clientY);
  };
  card.onpointercancel = (e) => {
    card.releasePointerCapture(e.pointerId);
    pointerStartX = 0;
    pointerStartY = 0;
  };
}

/** --- Render --- */

function renderWord() {
  if (sessionIdx >= sessionWords.length) {
    exitPractice();
    return;
  }

  const btnUndo = document.getElementById("btn-undo");
  if (btnUndo)
    btnUndo.style.visibility =
      practiceHistory.length > 0 ? "visible" : "hidden";

  const word = sessionWords[sessionIdx];
  const progEl = document.getElementById("practice-progress");
  if (progEl) progEl.textContent = `${sessionIdx + 1} / ${sessionWords.length}`;
  const typeEl = document.getElementById("practice-type");
  if (typeEl) {
    const isReview = !!word.started_at;
    typeEl.textContent = isReview ? "Review" : "New";
    typeEl.className =
      "practice-badge " +
      (isReview ? "practice-badge-review" : "practice-badge-new");
  }

  const card = document.getElementById("word-card");
  card.querySelector("#word-front").textContent =
    state.practiceMode === "translation_to_word" ? word.translation : word.word;
  card.querySelector("#word-translation").textContent =
    state.practiceMode === "translation_to_word" ? word.word : word.translation;

  const exEl = card.querySelector("#word-ex");
  exEl.textContent = word.example || "";
  exEl.style.display = word.example ? "block" : "none";

  const bLvl = card.querySelector("#word-back-level");
  bLvl.textContent = word.level || "";
  bLvl.style.display = word.level ? "block" : "none";
  card.classList.remove("flipped", "swipe-left", "swipe-right", "swipe-up");
  card.style.transition = "none";
  card.style.opacity = "0";
  card.style.transform = "rotateY(0deg)";
  void card.offsetHeight; // force reflow — fixes Android Chrome style batching
  card.style.transition = "";
  card.style.opacity = "1";
}

/** --- Grading --- */

async function grade(quality) {
  if (isGrading) return;
  isGrading = true;
  try {
    const word = sessionWords[sessionIdx];

    practiceHistory.push({
      sessionIdx,
      word: JSON.parse(JSON.stringify(word)),
      stats: { ...sessionStats },
    });

    if (quality === 5) sessionStats.good++;
    else if (quality === 3) sessionStats.hard++;
    else sessionStats.again++;

    const card = document.getElementById("word-card");
    const isFlipped = card.classList.contains("flipped");
    const baseRot = isFlipped ? 180 : 0;
    if (quality === 1) {
      card.style.transform = `translate(-1000px, 0) rotateY(${baseRot}deg) rotateZ(-30deg)`;
      tg.HapticFeedback.notificationOccurred("warning");
    } else if (quality === 5) {
      card.style.transform = `translate(1000px, 0) rotateY(${baseRot}deg) rotateZ(30deg)`;
      tg.HapticFeedback.notificationOccurred("success");
    } else if (quality === 3) {
      card.style.transform = `translate(0, -1000px) rotateY(${baseRot}deg) scale(0.5)`;
      tg.HapticFeedback.impactOccurred("medium");
    }
    card.style.opacity = "0";

    sessionIdx++;
    API.post("/api/grade", { word_id: word.id, quality }).catch((e) => {
      console.error("Grade failed, word progress may not be saved:", e);
      UI.toast(T.GRADE_FAIL, "error");
    });
    setTimeout(() => {
      isGrading = false;
      renderWord();
    }, 300);
  } catch (e) {
    console.error("Grade failed", e);
    isGrading = false;
  }
}

/** --- Undo --- */

export async function undo() {
  if (isGrading) return;
  if (practiceHistory.length === 0) return;
  const last = practiceHistory.pop();

  try {
    await API.post("/api/undo", {
      word_id: last.word.id,
      old_state: {
        repetitions: last.word.repetitions ?? 0,
        easiness: last.word.easiness ?? 2.5,
        interval: last.word.interval ?? 1,
        next_review: last.word.next_review ?? null,
        last_reviewed_at: last.word.last_reviewed_at ?? null,
        started_at: last.word.started_at ?? null,
      },
    });
  } catch (e) {
    console.error("Undo failed", e);
    UI.toast(T.UNDO_FAIL, "error");
  }

  sessionIdx = last.sessionIdx;
  sessionStats = last.stats;
  renderWord();
}

/** --- Audio --- */

export function playAudio(e) {
  if (e) e.stopPropagation();
  const word = sessionWords[sessionIdx];
  if (!word || !window.speechSynthesis) return;

  const card = document.getElementById("word-card");
  const isFlipped = card && card.classList.contains("flipped");
  const text = isFlipped && word.example ? word.example : word.word;

  const synth = window.speechSynthesis;
  synth.cancel();
  const msg = new SpeechSynthesisUtterance(text);
  msg.lang = state.ttsCode || "de-DE";
  msg.rate = 0.85;
  tg.HapticFeedback.impactOccurred("light");
  synth.speak(msg);
}

/** --- Confetti Effect --- */

function launchConfetti() {
  const canvas = document.getElementById("confetti-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ["#0a84ff", "#30d158", "#bf5af2", "#ff9f0a", "#ff453a"];

  for (let i = 0; i < 100; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: -10,
      r: Math.random() * 6 + 4,
      dx: Math.random() * 4 - 2,
      dy: Math.random() * 5 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let finished = true;

    particles.forEach((p) => {
      p.y += p.dy;
      p.x += p.dx;
      p.tilt = Math.sin(p.y * 0.1) * 10;

      if (p.y < canvas.height + 20) finished = false;

      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.r / 2);
      ctx.stroke();
    });

    if (!finished) {
      requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // Handle resize during animation
  window.addEventListener(
    "resize",
    () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    },
    { once: true },
  );

  requestAnimationFrame(draw);
}

/** --- Exit --- */

export function exitPractice() {
  isGrading = false;
  const total = sessionStats.good + sessionStats.hard + sessionStats.again;

  if (total > 0) {
    const isComplete = sessionIdx >= sessionWords.length;

    const statsHtml = `
      <span class="stat-again">${sessionStats.again}</span>
      <span class="stat-hard">${sessionStats.hard}</span>
      <span class="stat-good">${sessionStats.good}</span>
    `;
    UI.toast(statsHtml, "stats");

    if (isComplete) launchConfetti();
    state.currentStats = null; // Trigger stats refresh
  }
  showScreen("home");
}
