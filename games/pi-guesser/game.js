"use strict";

const ROUND_COUNT = 5;
const RADIUS = 5;
const BROWSE_RADIUS = 16;
const formatter = new Intl.NumberFormat("ja-JP");
const ui = Object.fromEntries(
  Array.from(document.querySelectorAll("[id]"), element => [element.id, element])
);
let limit;
let rounds;
let roundIndex;
let total;
let answered;
let dragStart;

function centerTarget() {
  const target = ui.digits.querySelector(".target");
  ui.viewport.scrollLeft = target.offsetLeft + target.offsetWidth / 2 - ui.viewport.clientWidth / 2;
}

function moveDigits(direction) {
  ui.viewport.scrollBy({ left: direction * ui.viewport.clientWidth * 0.65 });
}

function segmentAt(position) {
  const start = Math.max(1, position - RADIUS);
  const end = Math.min(PI_DIGITS.length, position + RADIUS);
  return PI_DIGITS.slice(start - 1, end);
}

function featureAt(position) {
  const digits = segmentAt(position);
  const repeated = digits.match(/(\d)\1{2,}/g)?.sort((a, b) => b.length - a.length)[0];
  if (repeated) {
    return { weight: repeated.length, label: `「${repeated[0]}」が${repeated.length}つ連続` };
  }
  const ascending = ["012", "123", "234", "345", "456", "567", "678", "789"];
  const ordered = ascending.find(pattern => digits.includes(pattern) || digits.includes([...pattern].reverse().join("")));
  if (ordered) {
    return { weight: 2, label: "連番が見える" };
  }
  if (/(\d\d)\1/.test(digits)) {
    return { weight: 2, label: "同じ2桁が連続" };
  }
  return { weight: 1, label: "枠の数字を基準に位置を探そう" };
}

function chooseRounds(size) {
  const band = size / ROUND_COUNT;
  const questions = Array.from({ length: ROUND_COUNT }, (_, index) => {
    // 桁列の端が見えて正解を特定できないよう、出題位置を内側に取る。
    const start = Math.max(index * band + 1, BROWSE_RADIUS + 2);
    const end = Math.min((index + 1) * band, PI_DIGITS.length - BROWSE_RADIUS - 1);
    const candidates = Array.from({ length: end - start + 1 }, (_, offset) => {
      const position = start + offset;
      return { position, ...featureAt(position) };
    });
    const featured = candidates.filter(candidate => candidate.weight >= 2);
    const pool = featured.length ? featured : candidates;
    return pool[Math.floor(Math.random() * pool.length)];
  });
  for (let index = questions.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [questions[index], questions[other]] = [questions[other], questions[index]];
  }
  return questions;
}

function renderRound() {
  const { position, label } = rounds[roundIndex];
  const cells = Array.from({ length: 2 * BROWSE_RADIUS + 1 }, (_, index) => {
    const offset = index - BROWSE_RADIUS;
    const digit = PI_DIGITS[position + offset - 1];
    const cell = document.createElement("span");
    cell.textContent = digit;
    if (offset === 0) {
      cell.className = "target";
      cell.setAttribute("aria-label", `予想する数字 ${digit}`);
    }
    return cell;
  });
  const hintBand = limit / 5;
  const hintStart = Math.floor((position - 1) / hintBand) * hintBand + 1;
  const hintEnd = hintStart + hintBand - 1;
  answered = false;
  ui.digits.replaceChildren(...cells);
  centerTarget();
  ui.feature.textContent = label;
  ui.landmarks.textContent = `${formatter.format(hintStart)}〜${formatter.format(hintEnd)}桁目の間。先頭の10桁は 1415926535。`;
  ui.landmarks.parentElement.open = false;
  ui.progress.textContent = `第 ${roundIndex + 1} / ${ROUND_COUNT} 問 ・ ${formatter.format(total)} 点`;
  ui.result.textContent = "";
  ui["map-result"].hidden = true;
  ui.guess.value = "";
  ui.position.value = String(limit / 2);
  ui.guess.disabled = false;
  ui.position.disabled = false;
  ui.submit.hidden = false;
  ui.next.hidden = true;
}

function startGame() {
  limit = Number(ui.difficulty.value);
  rounds = chooseRounds(limit);
  roundIndex = 0;
  total = 0;
  ui.position.max = String(limit);
  ui.guess.max = String(limit);
  ui["range-end"].textContent = `${formatter.format(limit)}桁目`;
  renderRound();
}

function score(distance, size) {
  return Math.round(1000 * Math.max(0, 1 - distance / (size - 1)) ** 5);
}

ui.center.addEventListener("click", centerTarget);
ui["previous-digits"].addEventListener("click", () => moveDigits(-1));
ui["next-digits"].addEventListener("click", () => moveDigits(1));
ui.viewport.addEventListener("keydown", event => {
  const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
  if (!direction) return;
  event.preventDefault();
  moveDigits(direction);
});
ui.viewport.addEventListener("pointerdown", event => {
  if (event.pointerType !== "mouse" || event.button !== 0 || event.target === ui.viewport) return;
  dragStart = { left: ui.viewport.scrollLeft, x: event.clientX };
  ui.viewport.setPointerCapture(event.pointerId);
  ui.viewport.classList.add("dragging");
});
ui.viewport.addEventListener("pointermove", event => {
  if (dragStart) ui.viewport.scrollLeft = dragStart.left + dragStart.x - event.clientX;
});
ui.viewport.addEventListener("lostpointercapture", () => {
  dragStart = undefined;
  ui.viewport.classList.remove("dragging");
});

ui.position.addEventListener("input", () => {
  ui.guess.value = ui.position.value;
});
ui.guess.addEventListener("input", () => {
  if (ui.guess.value && ui.guess.validity.valid) {
    ui.position.value = ui.guess.value;
  }
});
ui["guess-form"].addEventListener("submit", event => {
  event.preventDefault();
  if (answered || !ui.guess.value || !ui.guess.validity.valid) return;

  const { position } = rounds[roundIndex];
  const guess = ui.guess.valueAsNumber;
  const distance = Math.abs(position - guess);
  const points = score(distance, limit);
  const last = roundIndex === ROUND_COUNT - 1;
  total += points;
  answered = true;
  ui.guess.disabled = true;
  ui.position.disabled = true;
  ui.submit.hidden = true;
  ui.next.hidden = false;
  ui.next.textContent = last ? "もう一度遊ぶ" : "次の問題";
  ui.result.textContent = `正解は ${formatter.format(position)} 桁目。予想との差は ${formatter.format(distance)} 桁で、+${formatter.format(points)} 点。`;
  ui.progress.textContent = `第 ${roundIndex + 1} / ${ROUND_COUNT} 問 ・ ${formatter.format(total)} 点`;
  if (last) {
    ui.result.textContent += ` 最終スコアは ${formatter.format(total)} / 5,000 点。`;
  }
  ui.position.value = String(position);
  const map = ui["map-result"];
  const mapPosition = value => `${(value - 1) / (limit - 1) * 100}%`;
  map.style.setProperty("--guess", mapPosition(guess));
  map.style.setProperty("--answer", mapPosition(position));
  map.hidden = false;
  ui.next.focus();
});
ui.next.addEventListener("click", () => {
  roundIndex++;
  if (roundIndex === ROUND_COUNT) startGame();
  else renderRound();
  ui.viewport.focus({ preventScroll: true });
});
ui.difficulty.addEventListener("change", startGame);
startGame();
