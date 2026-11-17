"use strict";

const canvas = document.querySelector("#wheel");
const context = canvas.getContext("2d");
const spinButton = document.querySelector("#spin");
const finishButton = document.querySelector("#finish");
const undoButton = document.querySelector("#undo");
const resetButton = document.querySelector("#reset");
const glazeName = document.querySelector("#glaze-name");
const stageLabel = document.querySelector("#stage-label");
const status = document.querySelector("#status");
const formButtons = [...document.querySelectorAll("[data-form]")];
const glazeButtons = [...document.querySelectorAll("[data-glaze]")];

const forms = {
  cylinder: [65, 74, 77, 79, 80, 80, 79],
  bowl: [52, 59, 74, 96, 118, 134, 143],
  vase: [61, 73, 104, 105, 80, 51, 55]
};
const glazes = {
  clay: { name: "素焼き", hue: 17, saturation: 41, lightness: 51, gloss: 0.24 },
  ivory: { name: "生成り", hue: 44, saturation: 46, lightness: 73, gloss: 0.69 },
  moss: { name: "苔色", hue: 101, saturation: 16, lightness: 48, gloss: 0.54 },
  indigo: { name: "藍色", hue: 211, saturation: 35, lightness: 48, gloss: 0.65 },
  plum: { name: "梅色", hue: 335, saturation: 30, lightness: 50, gloss: 0.59 }
};

const rings = 37;
const wheelY = 321;
const lowY = 310;
const highY = 144;
const tilt = 0.19;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
let form = "cylinder";
let glaze = "clay";
let profile = makeProfile(form);
let history = [];
let spinning = !matchMedia("(prefers-reduced-motion: reduce)").matches;
let finished = false;
let rotation = 0;
let lastFrame = 0;
let frame = 0;
let focused = false;
let cursorRing = 19;
let drag = null;
let view = { width: 1, height: 1, scale: 1, ratio: 1 };

function makeProfile(type) {
  const points = forms[type];
  return Array.from({ length: rings }, (_, index) => {
    const position = index / (rings - 1) * (points.length - 1);
    const left = Math.floor(position);
    const t = position - left;
    return points[left] + ((points[left + 1] ?? points[left]) - points[left]) * t * t * (3 - 2 * t);
  });
}

function snapshot() {
  return { form, profile: [...profile] };
}

function remember(previous = snapshot()) {
  history.push(previous);
  if (history.length > 40) history.shift();
}

function sync(message = "") {
  formButtons.forEach(button => {
    button.disabled = finished;
    button.setAttribute("aria-pressed", button.dataset.form === form);
  });
  glazeButtons.forEach(button => {
    button.disabled = finished;
    button.setAttribute("aria-pressed", button.dataset.glaze === glaze);
  });
  finishButton.textContent = finished ? "成形に戻る" : "仕上げる";
  canvas.classList.toggle("finished", finished);
  stageLabel.textContent = finished ? "作品の鑑賞" : "成形中";
  glazeName.textContent = glazes[glaze].name;
  spinButton.textContent = spinning ? "回転中" : "停止中";
  spinButton.setAttribute("aria-pressed", spinning);
  undoButton.disabled = finished || history.length === 0;
  resetButton.disabled = finished || makeProfile(form).every((radius, index) => radius === profile[index]);
  status.textContent = message;
  invalidate();
}

function resize() {
  const { width, height } = canvas.getBoundingClientRect();
  const ratio = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  view = { width, height, scale: Math.min(width / 434, height / 420), ratio };
  invalidate();
}

function ellipse(x, y, rx, ry, fill) {
  context.beginPath();
  context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
}

function wallColor(material, brightness) {
  return `hsl(${material.hue} ${material.saturation}% ${clamp(material.lightness + brightness, 8, 96)}%)`;
}

function paintWheel() {
  ellipse(13, 365, 189, 33, "#4e392649");
  const metal = context.createLinearGradient(-169, 0, 169, 0);
  metal.addColorStop(0, "#4b4e48");
  metal.addColorStop(.29, "#888c81");
  metal.addColorStop(.63, "#636760");
  metal.addColorStop(1, "#393c37");
  context.fillStyle = metal;
  context.fillRect(-169, wheelY, 338, 19);
  ellipse(0, wheelY + 19, 169, 36, metal);
  ellipse(0, wheelY, 169, 36, "#939689");
  for (let radius = 161; radius >= 117; radius -= 14) {
    context.beginPath();
    context.ellipse(0, wheelY, radius, radius * .208, 0, 0, Math.PI * 2);
    context.strokeStyle = "#41463d5e";
    context.lineWidth = .9;
    context.stroke();
  }
  for (let index = 0; index < 12; index++) {
    const angle = index * Math.PI / 6 + rotation;
    const x = Math.cos(angle);
    const y = Math.sin(angle) * .208;
    context.beginPath();
    context.moveTo(x * 151, wheelY + y * 151);
    context.lineTo(x * 158, wheelY + y * 158);
    context.strokeStyle = "#444840";
    context.lineWidth = 1.7;
    context.stroke();
  }
  ellipse(0, lowY + 3, profile[0] + 14, profile[0] * tilt + 7, "#27221f4d");
}

function paintPot() {
  const material = glazes[glaze];
  const lip = profile.at(-1);
  const inner = lip - 6;
  ellipse(0, highY, lip, lip * tilt, wallColor(material, 12));
  const cavity = context.createLinearGradient(0, highY - inner * tilt, 0, highY + inner * tilt);
  cavity.addColorStop(0, wallColor(material, -15));
  cavity.addColorStop(.7, wallColor(material, -34));
  cavity.addColorStop(1, wallColor(material, -33));
  ellipse(0, highY - 1, inner, inner * tilt, cavity);

  const slices = 38;
  const angles = Array.from({ length: slices + 1 }, (_, i) => Math.PI * i / slices);
  const xs = angles.map(Math.cos);
  const ys = angles.map(angle => Math.sin(angle) * tilt);
  const step = (lowY - highY) / (rings - 1);
  for (let row = rings - 2; row >= 0; row--) {
    const upper = profile[row + 1];
    const lower = profile[row];
    const top = lowY - (row + 1) * step;
    const bottom = top + step;
    const relief = clamp((upper - lower) * .95, -4, 4);
    for (let col = 0; col < slices; col++) {
      const angle = angles[col] + Math.PI / (slices * 2);
      const light = Math.cos(angle - 2.12);
      const highlight = Math.max(0, Math.cos(angle - 2.27)) ** 18;
      const variation = Math.sin(angle * 9 - rotation * 2 + row * .38) * 1.5
        + Math.sin(row * 2.38) * 1.08;
      const shade = -12 + 19 * light + material.gloss * 22 * highlight + relief + variation;
      const x0 = lower * xs[col];
      const x1 = lower * xs[col + 1];
      const u0 = upper * xs[col];
      const u1 = upper * xs[col + 1];
      context.beginPath();
      context.moveTo(u0, top + upper * ys[col]);
      context.lineTo(u1 - .45, top + upper * ys[col + 1]);
      context.lineTo(x1 - .45, bottom + lower * ys[col + 1] + .65);
      context.lineTo(x0, bottom + lower * ys[col] + .65);
      context.closePath();
      context.fillStyle = wallColor(material, shade);
      context.fill();
    }
  }

  context.beginPath();
  context.ellipse(0, highY, lip - .9, lip * tilt, 0, .03, Math.PI - .03);
  context.lineWidth = 1.5;
  context.strokeStyle = wallColor(material, 15);
  context.stroke();

  if (!finished && (focused || drag)) {
    const radius = profile[cursorRing];
    const y = lowY - cursorRing * step;
    context.beginPath();
    context.ellipse(0, y, radius, radius * tilt, 0, .12, Math.PI - .12);
    context.strokeStyle = "#fff5dcba";
    context.lineWidth = 1.5;
    context.setLineDash([4, 5]);
    context.stroke();
    context.setLineDash([]);
  }
}

function paint(now) {
  frame = 0;
  if (spinning && lastFrame) rotation = (rotation + Math.min(now - lastFrame, 45) * .0025) % (Math.PI * 2);
  lastFrame = now;
  const { width, height, scale, ratio } = view;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const backdrop = context.createRadialGradient(width * .26, height * .16, 0, width * .43, height * .48, Math.max(width, height) * .8);
  backdrop.addColorStop(0, finished ? "#f2e7d1" : "#e6d7c1");
  backdrop.addColorStop(1, finished ? "#a78c72" : "#ac9479");
  context.fillStyle = backdrop;
  context.fillRect(0, 0, width, height);
  context.translate(width / 2, (height - 420 * scale) / 2);
  context.scale(scale, scale);
  paintWheel();
  paintPot();
  if (spinning) invalidate();
}

function invalidate() {
  if (!frame) frame = requestAnimationFrame(paint);
}

function ringAt(y) {
  return clamp(Math.round((lowY - y) / (lowY - highY) * (rings - 1)), 0, rings - 1);
}

function point(event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left - view.width / 2) / view.scale;
  const y = (event.clientY - rect.top - (view.height - 420 * view.scale) / 2) / view.scale;
  return { x, y };
}

function sculpt(center, amount) {
  const reach = 6;
  for (let ring = Math.max(0, Math.floor(center - reach)); ring <= Math.min(rings - 1, Math.ceil(center + reach)); ring++) {
    const weight = Math.exp(-((ring - center) ** 2) / 10);
    const baseWeight = Math.min(1, ring / 4);
    profile[ring] = clamp(profile[ring] + amount * weight * baseWeight, 27, 155);
  }
  invalidate();
}

canvas.addEventListener("pointerdown", event => {
  if (finished || drag || event.button !== 0) return;
  const { x, y } = point(event);
  const ring = ringAt(y);
  if (y < highY - profile.at(-1) * tilt - 10 || y > lowY + 14 || Math.abs(x) > profile[ring] + 22) return;
  canvas.setPointerCapture(event.pointerId);
  cursorRing = ring;
  drag = { id: event.pointerId, x, ring, side: x < 0 ? -1 : 1, before: snapshot() };
  status.textContent = "";
  invalidate();
});

canvas.addEventListener("pointermove", event => {
  if (drag?.id !== event.pointerId) return;
  const { x, y } = point(event);
  const ring = ringAt(y);
  const amount = (x - drag.x) * drag.side * .72;
  const steps = Math.max(1, Math.ceil(Math.abs(ring - drag.ring) / 2));
  for (let step = 1; step <= steps; step++) {
    const center = drag.ring + (ring - drag.ring) * step / steps;
    sculpt(center, amount / steps);
  }
  cursorRing = ring;
  drag.x = x;
  drag.ring = ring;
});

function release(event) {
  if (drag?.id !== event.pointerId) return;
  const { before } = drag;
  drag = null;
  if (before.profile.some((radius, index) => radius !== profile[index])) remember(before);
  sync();
}

canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);
canvas.addEventListener("lostpointercapture", release);
canvas.addEventListener("focus", () => { focused = canvas.matches(":focus-visible"); invalidate(); });
canvas.addEventListener("blur", () => { focused = false; invalidate(); });
canvas.addEventListener("keydown", event => {
  if (finished || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  focused = true;
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    cursorRing = clamp(cursorRing + (event.key === "ArrowUp" ? 2 : -2), 0, rings - 1);
    invalidate();
  } else {
    const before = snapshot();
    sculpt(cursorRing, event.key === "ArrowRight" ? 3.4 : -3.4);
    if (before.profile.some((radius, index) => radius !== profile[index])) remember(before);
    sync();
  }
});

formButtons.forEach(button => button.addEventListener("click", () => {
  const nextForm = button.dataset.form;
  if (nextForm === form) return;
  remember();
  form = nextForm;
  profile = makeProfile(form);
  sync();
}));

glazeButtons.forEach(button => button.addEventListener("click", () => {
  glaze = button.dataset.glaze;
  sync();
}));

undoButton.addEventListener("click", () => {
  const previous = history.pop();
  if (!previous) return;
  ({ form, profile } = previous);
  sync("ひとつ前の形に戻しました。");
});

resetButton.addEventListener("click", () => {
  remember();
  profile = makeProfile(form);
  sync("選んだ形の初期状態に戻しました。");
});

spinButton.addEventListener("click", () => {
  spinning = !spinning;
  lastFrame = 0;
  sync();
});

finishButton.addEventListener("click", () => {
  finished = !finished;
  sync(finished ? `${glazes[glaze].name}の器ができました。` : "");
});

new ResizeObserver(resize).observe(canvas);
sync();
