"use strict";

const get = id => document.getElementById(id);
const canvas = get("wheel");
const context = canvas.getContext("2d");
const ink = document.createElement("canvas");
const inkContext = ink.getContext("2d");
const spinButton = get("spin");
const widthInput = get("width");
const speedInput = get("speed");
const repeatInput = get("repeat");
const undoButton = get("undo");
const clearButton = get("clear");
const saveButton = get("save");
const swatches = [...document.querySelectorAll("[data-ink]")];

const fullTurn = Math.PI * 2;
const radius = 380;
const rim = 411;
ink.width = ink.height = radius * 2;
let color = swatches[0].dataset.ink;
let spinning = !matchMedia("(prefers-reduced-motion: reduce)").matches;
let angle = 0;
let lastFrame = 0;
let frame = 0;
let strokes = [];
let current = null;
let pointer = null;
let cursor = { x: 0, y: -radius / 2 };
let keyboardFocus = false;
let view = { width: 1, height: 1, scale: 1, ratio: 1, centerY: 0 };

function circle(ctx, x, y, size, color) {
  ctx.beginPath();
  ctx.arc(x, y, size, 0, fullTurn);
  ctx.fillStyle = color;
  ctx.fill();
}

function updateButtons() {
  spinButton.textContent = spinning ? "⏸ 回転を止める" : "▶ 回転させる";
  spinButton.setAttribute("aria-pressed", spinning);
  undoButton.disabled = clearButton.disabled = saveButton.disabled = strokes.length === 0 && !current?.points.length;
}

function resize() {
  const { width, height } = canvas.getBoundingClientRect();
  const ratio = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  const small = width < 475;
  const diameter = Math.min(width - (small ? 28 : 60), height - (small ? 68 : 84));
  view = {
    width, height, ratio,
    scale: Math.max(1, diameter) / (rim * 2),
    centerY: height / 2 + (small ? 19 : 16)
  };
  invalidate();
}

function drawSegment(stroke, previous, point) {
  const { color, width, repeat } = stroke;
  inkContext.save();
  inkContext.translate(radius, radius);
  inkContext.lineWidth = width;
  inkContext.lineCap = "round";
  inkContext.strokeStyle = color;
  for (let copy = 0; copy < repeat; copy++) {
    if (previous) {
      inkContext.beginPath();
      inkContext.moveTo(previous.x, previous.y);
      inkContext.lineTo(point.x, point.y);
      inkContext.stroke();
    } else {
      circle(inkContext, point.x, point.y, width / 2, color);
    }
    inkContext.rotate(fullTurn / repeat);
  }
  inkContext.restore();
}

function rebuild() {
  inkContext.clearRect(0, 0, ink.width, ink.height);
  for (const stroke of strokes) {
    let previous = null;
    for (const point of stroke.points) {
      if (point) drawSegment(stroke, previous, point);
      previous = point;
    }
  }
  updateButtons();
  invalidate();
}

function sample(point) {
  const previous = current.points.at(-1);
  if (Math.hypot(point.x, point.y) > radius) {
    if (previous) current.points.push(null);
    return;
  }

  // Map the stationary pen onto the paper after accounting for the wheel's rotation.
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const local = { x: point.x * c + point.y * s, y: point.y * c - point.x * s };
  if (previous && Math.hypot(previous.x - local.x, previous.y - local.y) < .6) return;
  drawSegment(current, previous, local);
  current.points.push(local);
}

function start(point) {
  current = { color, width: Number(widthInput.value) * 2, repeat: Number(repeatInput.value), points: [] };
  sample(point);
  updateButtons();
  invalidate();
}

function end() {
  if (!current) return;
  if (current.points.length) strokes.push(current);
  current = null;
  updateButtons();
  invalidate();
}

function advance(now) {
  if (spinning && lastFrame) {
    const elapsed = Math.min(Math.max(0, now - lastFrame), 45);
    angle = (angle + elapsed * Number(speedInput.value) * fullTurn / 60000) % fullTurn;
  }
  if (now > lastFrame) lastFrame = now;
}

function paint(now) {
  frame = 0;
  advance(now);
  if (current) sample(pointer?.point ?? cursor);

  const { width, height, scale, ratio, centerY } = view;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const backdrop = context.createLinearGradient(0, 0, width, height);
  backdrop.addColorStop(0, "#3a393f");
  backdrop.addColorStop(1, "#18181e");
  context.fillStyle = backdrop;
  context.fillRect(0, 0, width, height);
  context.save();
  context.translate(width / 2, centerY);
  context.scale(scale, scale);

  context.shadowColor = "#000a";
  context.shadowOffsetY = 21 * scale * ratio;
  context.shadowBlur = 22 * scale * ratio;
  circle(context, 0, 0, rim, "#121217");
  context.shadowColor = "transparent";
  const metal = context.createLinearGradient(-rim, -rim, rim, rim);
  metal.addColorStop(0, "#89868b");
  metal.addColorStop(.47, "#4c4b50");
  metal.addColorStop(1, "#212128");
  circle(context, 0, -5, rim, metal);
  circle(context, 0, 0, radius + 10, "#2c2b2f");

  context.save();
  context.rotate(angle);
  for (let index = 0; index < 48; index++) {
    const tick = index * fullTurn / 48;
    circle(context, Math.cos(tick) * 398, Math.sin(tick) * 398, index % 12 ? 1.5 : 3.5, "#d2cbd289");
  }
  circle(context, 0, 0, radius, "#fffefa");
  context.save();
  context.clip();
  context.drawImage(ink, -radius, -radius);
  context.restore();
  context.restore();

  if (keyboardFocus && !pointer) {
    context.beginPath();
    context.arc(cursor.x, cursor.y, 12, 0, fullTurn);
    context.strokeStyle = "#2a3047";
    context.lineWidth = 3;
    context.stroke();
  }
  context.restore();
  if (spinning) invalidate();
}

function invalidate() {
  if (!frame) frame = requestAnimationFrame(paint);
}

function pointAt(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - view.width / 2) / view.scale,
    y: (event.clientY - rect.top - view.centerY) / view.scale
  };
}

canvas.addEventListener("pointerdown", event => {
  if (event.button !== 0 || pointer) return;
  const point = pointAt(event);
  if (Math.hypot(point.x, point.y) > radius) return;
  end();
  pointer = { id: event.pointerId, point };
  canvas.setPointerCapture(event.pointerId);
  start(point);
});

canvas.addEventListener("pointermove", event => {
  if (pointer?.id !== event.pointerId) return;
  const points = event.getCoalescedEvents?.() ?? [];
  for (const input of points.length ? points : [event]) {
    pointer.point = pointAt(input);
    sample(pointer.point);
  }
  invalidate();
});

function release(event) {
  if (pointer?.id !== event.pointerId) return;
  if (event.type === "pointerup") sample(pointAt(event));
  pointer = null;
  end();
}

canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);
canvas.addEventListener("lostpointercapture", release);
canvas.addEventListener("focus", () => { keyboardFocus = canvas.matches(":focus-visible"); invalidate(); });
canvas.addEventListener("blur", () => { keyboardFocus = false; if (!pointer) end(); invalidate(); });
canvas.addEventListener("keydown", event => {
  if (pointer) return;
  const moves = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  if (event.code === "Space") {
    event.preventDefault();
    if (event.repeat) return;
    keyboardFocus = true;
    if (current) end();
    else start(cursor);
    return;
  }
  const move = moves[event.key];
  if (!move) return;
  event.preventDefault();
  keyboardFocus = true;
  const x = cursor.x + move[0] * 10;
  const y = cursor.y + move[1] * 10;
  const limit = Math.max(1, Math.hypot(x, y) / (radius - 9));
  cursor = { x: x / limit, y: y / limit };
  if (current) sample(cursor);
  invalidate();
});

spinButton.addEventListener("click", () => {
  spinning = !spinning;
  lastFrame = 0;
  updateButtons();
  invalidate();
});

swatches.forEach(button => button.addEventListener("click", () => {
  color = button.dataset.ink;
  swatches.forEach(swatch => swatch.setAttribute("aria-pressed", swatch === button));
}));
widthInput.addEventListener("input", () => { get("width-value").value = widthInput.value; });
speedInput.addEventListener("input", () => { get("speed-value").value = `${speedInput.value} rpm`; });

function stopActiveStroke() {
  if (pointer) {
    const { id } = pointer;
    pointer = null;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  end();
}

undoButton.addEventListener("click", () => {
  stopActiveStroke();
  strokes.pop();
  rebuild();
  get("status").textContent = "ひとつ前の線を取り消しました。";
});

clearButton.addEventListener("click", () => {
  stopActiveStroke();
  strokes = [];
  rebuild();
  get("status").textContent = "円盤の模様をすべて消しました。";
});

saveButton.addEventListener("click", () => {
  const image = document.createElement("canvas");
  image.width = image.height = ink.width;
  const output = image.getContext("2d");
  circle(output, radius, radius, radius, "#fffefa");
  output.clip();
  output.translate(radius, radius);
  output.rotate(angle);
  output.drawImage(ink, -radius, -radius);
  const link = document.createElement("a");
  link.href = image.toDataURL("image/png");
  link.download = "rokuro-art.png";
  link.click();
  ArcadeResult.show({
    kind: "clear",
    title: "作品完成！",
    summary: "ろくろで描いた模様をPNGにしました。",
    action: "作品に戻る",
    onAction: () => canvas.focus({ preventScroll: true }),
  });
});

new ResizeObserver(resize).observe(canvas);
updateButtons();
