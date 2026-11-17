'use strict';

const mazes = {
  easy: [
    '#########',
    '#S#.....#',
    '#.......#',
    '#.......#',
    '#.#.#.#.#',
    '#.#.#...#',
    '#.#.#...#',
    '#.......#',
    '###...#.#',
    '#......G#',
    '#########',
  ],
  normal: [
    '###########',
    '#S#.......#',
    '#.#.###.#.#',
    '#.#.....#.#',
    '#.####.##.#',
    '#.........#',
    '#.#.####..#',
    '#.#.#.....#',
    '#...#.###.#',
    '#...#.....#',
    '#####..##.#',
    '#.....G...#',
    '###########',
  ],
  hard: [
    '#############',
    '#S..#.#.....#',
    '###...#.#.###',
    '#...#...#...#',
    '#.#########.#',
    '#...........#',
    '###########.#',
    '#.....#...#.#',
    '###.#.#.###.#',
    '#...#.......#',
    '#.#######.#.#',
    '#.#...#...#.#',
    '#.#.#.#.###.#',
    '#...#.G.....#',
    '#############',
  ],
};

const canvas = document.querySelector('#board');
const ctx = canvas.getContext('2d');
const backdrop = document.createElement('canvas');
const level = document.querySelector('#level');
const tilt = document.querySelector('#tilt');
const calibrate = document.querySelector('#calibrate');
const status = document.querySelector('#status');
const clock = document.querySelector('#time');
const bestLabel = document.querySelector('#best');
const win = document.querySelector('#win');
const next = document.querySelector('#next');
const keys = new Set();
const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const radius = .29;
const step = 1 / 120;
const unit = 48;
const ball = { x: 0, y: 0, vx: 0, vy: 0 };
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const seconds = value => `${value.toFixed(1)} 秒`;

let maze;
let goal;
let elapsed;
let best;
let state;
let pointer;
let previousTime;
let accumulator = 0;
let motionState = 'off';
let motionTimeout;
let sample;
let neutral;

function say(text) {
  status.textContent = text;
}

function gravity(beta, gamma, angle) {
  const radians = Math.PI / 180;
  const x = Math.cos(beta * radians) * Math.sin(gamma * radians);
  const y = Math.sin(beta * radians);
  const rotation = angle * radians;
  return {
    x: x * Math.cos(rotation) + y * Math.sin(rotation),
    y: y * Math.cos(rotation) - x * Math.sin(rotation),
    angle,
  };
}

function orientationAngle() {
  return screen.orientation?.angle ?? window.orientation ?? 0;
}

function receiveTilt(event) {
  if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
  sample = gravity(event.beta, event.gamma, orientationAngle());
  if (motionState === 'waiting') {
    clearTimeout(motionTimeout);
    motionState = 'on';
    updateMotionControls();
  }
  if (!neutral || neutral.angle !== sample.angle) setNeutral();
}

function setNeutral() {
  if (!sample) return;
  neutral = sample;
  ball.vx = ball.vy = 0;
  say('基準を合わせました。少しずつ傾けて球を転がそう。');
}

function updateMotionControls() {
  tilt.setAttribute('aria-pressed', String(motionState !== 'off'));
  tilt.textContent = motionState === 'on' ? '傾き操作を切る'
    : motionState === 'waiting' ? 'センサー待機中 · 解除' : '傾き操作を使う';
  calibrate.disabled = motionState !== 'on';
}

function stopMotion(message) {
  window.removeEventListener('deviceorientation', receiveTilt);
  clearTimeout(motionTimeout);
  motionState = 'off';
  sample = neutral = undefined;
  ball.vx = ball.vy = 0;
  updateMotionControls();
  say(message);
}

async function toggleMotion() {
  if (motionState !== 'off') {
    stopMotion('盤面を押すか、矢印キーで操作できます。');
    return;
  }
  const sensor = window.DeviceOrientationEvent;
  if (!window.isSecureContext || !sensor) {
    say('傾きセンサーを使えません。盤面を押すか矢印キーで遊べます。');
    return;
  }
  tilt.disabled = true;
  try {
    if (typeof sensor.requestPermission === 'function' && await sensor.requestPermission() !== 'granted') {
      say('センサーが許可されていません。指や矢印キーで遊べます。');
      return;
    }
    motionState = 'waiting';
    updateMotionControls();
    say('いつもの持ち方で、スマホを軽く動かしてください。');
    motionTimeout = setTimeout(() => stopMotion('センサーから値を受け取れませんでした。指や矢印キーで遊べます。'), 3500);
    window.addEventListener('deviceorientation', receiveTilt);
  } catch {
    stopMotion('傾き操作を開始できませんでした。指や矢印キーで遊べます。');
  } finally {
    tilt.disabled = false;
  }
}

function locationOf(mark) {
  const y = maze.findIndex(row => row.includes(mark));
  return { x: maze[y].indexOf(mark) + .5, y: y + .5 };
}

function drawBackdrop() {
  backdrop.width = canvas.width;
  backdrop.height = canvas.height;
  const paint = backdrop.getContext('2d');
  const floor = paint.createLinearGradient(0, 0, 0, backdrop.height);
  floor.addColorStop(0, '#f2d9a1');
  floor.addColorStop(1, '#bc935a');
  paint.fillStyle = floor;
  paint.fillRect(0, 0, backdrop.width, backdrop.height);
  for (let i = 0; i < 180; i++) {
    paint.fillStyle = i % 2 ? '#fff8d429' : '#70532e19';
    paint.fillRect((i * 103 + 11) % backdrop.width, (i * i * 83 + 17) % backdrop.height, 48 + i % 81, 1);
  }
  for (const [y, row] of maze.entries()) {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      paint.fillStyle = '#78543880';
      paint.fillRect(x * unit + 3, y * unit + 5, unit, unit);
    }
  }
  for (const [y, row] of maze.entries()) {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      paint.fillStyle = (x + y) % 2 ? '#486258' : '#506a5d';
      paint.fillRect(x * unit, y * unit, unit, unit);
      paint.fillStyle = '#a9c0aa66';
      paint.fillRect(x * unit, y * unit, unit, 2);
    }
  }

  const start = locationOf('S');
  paint.beginPath();
  paint.arc(start.x * unit, start.y * unit, 15, 0, Math.PI * 2);
  paint.setLineDash([3, 3]);
  paint.strokeStyle = '#5d694d';
  paint.lineWidth = 2;
  paint.stroke();
  paint.setLineDash([]);
  const x = goal.x * unit, y = goal.y * unit;
  paint.fillStyle = '#21322b';
  paint.beginPath();
  paint.arc(x, y, 17, 0, Math.PI * 2);
  paint.fill();
  paint.strokeStyle = '#fff2b6';
  paint.lineWidth = 3;
  paint.stroke();
  paint.fillStyle = '#fff2b6';
  paint.beginPath();
  paint.arc(x, y, 3.4, 0, Math.PI * 2);
  paint.fill();
}

function reset() {
  maze = mazes[level.value];
  goal = locationOf('G');
  Object.assign(ball, locationOf('S'), { vx: 0, vy: 0 });
  keys.clear();
  pointer = undefined;
  elapsed = 0;
  state = 'ready';
  clock.textContent = seconds(0);
  win.hidden = true;
  next.hidden = level.value === 'hard';
  canvas.width = maze[0].length * unit;
  canvas.height = maze.length * unit;
  best = null;
  try {
    const stored = Number(localStorage.getItem(`tilt-maze-best-${level.value}`));
    if (stored > 0 && Number.isFinite(stored)) best = stored;
  } catch {}
  updateBest();
  drawBackdrop();
  paint();
}

function updateBest() {
  bestLabel.textContent = best === null ? 'ベスト —' : `ベスト ${seconds(best)}`;
}

function inputVector() {
  let x = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  let y = Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'));
  if (x || y) {
    const scale = Math.hypot(x, y);
    return { x: x / scale, y: y / scale };
  }
  if (pointer) {
    x = (pointer.x - ball.x) / 1.6;
    y = (pointer.y - ball.y) / 1.6;
  } else if (motionState === 'on' && neutral && sample.angle === neutral.angle) {
    x = (sample.x - neutral.x) / .34;
    y = (sample.y - neutral.y) / .34;
  }
  const length = Math.hypot(x, y);
  if (length < .065) return { x: 0, y: 0 };
  const scale = Math.max(1, length);
  return { x: x / scale, y: y / scale };
}

function fits(x, y) {
  for (let row = Math.floor(y - radius); row <= Math.floor(y + radius); row++) {
    for (let col = Math.floor(x - radius); col <= Math.floor(x + radius); col++) {
      const tile = maze[row]?.[col];
      if (tile && tile !== '#') continue;
      const dx = x - clamp(x, col, col + 1);
      const dy = y - clamp(y, row, row + 1);
      if (dx * dx + dy * dy < radius * radius) return false;
    }
  }
  return true;
}

function moveBall(dt) {
  if (state === 'clear') return;
  const input = inputVector();
  if (state === 'ready' && !input.x && !input.y) return;
  state = 'playing';
  elapsed += dt;
  const drag = Math.exp(-3.4 * dt);
  ball.vx = clamp((ball.vx + input.x * 23 * dt) * drag, -6.6, 6.6);
  ball.vy = clamp((ball.vy + input.y * 23 * dt) * drag, -6.6, 6.6);
  const x = ball.x + ball.vx * dt, y = ball.y + ball.vy * dt;
  if (fits(x, ball.y)) ball.x = x;
  else ball.vx *= -.14;
  if (fits(ball.x, y)) ball.y = y;
  else ball.vy *= -.14;
  if (Math.hypot(goal.x - ball.x, goal.y - ball.y) <= .28) finish();
}

function finish() {
  state = 'clear';
  ball.x = goal.x;
  ball.y = goal.y;
  keys.clear();
  pointer = undefined;
  if (best === null || elapsed < best) {
    best = elapsed;
    try { localStorage.setItem(`tilt-maze-best-${level.value}`, String(elapsed)); } catch {}
    updateBest();
  }
  document.querySelector('#result').textContent = seconds(elapsed);
  win.hidden = false;
  say('ゴールの穴に入りました。');
  document.querySelector('#win-title').focus({ preventScroll: true });
}

function paint() {
  ctx.drawImage(backdrop, 0, 0);
  if (state === 'clear') return;
  const x = ball.x * unit, y = ball.y * unit, r = radius * unit;
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 6, r + 1, r * .83, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#37291465';
  ctx.fill();
  const metal = ctx.createRadialGradient(x - 4, y - 6, 1, x + 2, y, r);
  metal.addColorStop(0, '#fffef4');
  metal.addColorStop(.43, '#a5d5bf');
  metal.addColorStop(1, '#274b49');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = metal;
  ctx.fill();
}

function frame(now) {
  if (document.hidden) {
    requestAnimationFrame(frame);
    return;
  }
  if (previousTime !== undefined) accumulator += Math.min((now - previousTime) / 1000, .045);
  previousTime = now;
  const x = ball.x, y = ball.y, before = state;
  while (accumulator >= step) {
    moveBall(step);
    accumulator -= step;
  }
  if (x !== ball.x || y !== ball.y || state !== before) paint();
  const time = seconds(elapsed);
  if (clock.textContent !== time) clock.textContent = time;
  requestAnimationFrame(frame);
}

function point(event) {
  const rect = canvas.getBoundingClientRect();
  pointer = {
    id: event.pointerId,
    x: (event.clientX - rect.left) / rect.width * maze[0].length,
    y: (event.clientY - rect.top) / rect.height * maze.length,
  };
}

canvas.addEventListener('pointerdown', event => {
  if (state === 'clear' || pointer || event.button !== 0 || !event.isPrimary) return;
  canvas.focus({ preventScroll: true });
  canvas.setPointerCapture(event.pointerId);
  point(event);
});

canvas.addEventListener('pointermove', event => {
  if (pointer?.id === event.pointerId) point(event);
});

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(type, event => {
    if (pointer?.id === event.pointerId) pointer = undefined;
  });
}
for (const type of ['contextmenu', 'selectstart']) {
  document.addEventListener(type, event => event.preventDefault());
}
canvas.addEventListener('touchstart', event => event.preventDefault(), { passive: false });

canvas.addEventListener('keydown', event => {
  if (!arrowKeys.includes(event.key) || event.altKey || event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  keys.add(event.key);
});
window.addEventListener('keyup', event => keys.delete(event.key));
canvas.addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    keys.clear();
    pointer = undefined;
    ball.vx = ball.vy = 0;
    previousTime = undefined;
    accumulator = 0;
  }
});

level.addEventListener('change', reset);
for (const id of ['reset', 'again']) {
  document.getElementById(id).addEventListener('click', () => { reset(); canvas.focus(); });
}
next.addEventListener('click', () => { level.selectedIndex += 1; reset(); canvas.focus(); });
tilt.addEventListener('click', toggleMotion);
calibrate.addEventListener('click', setNeutral);
reset();
requestAnimationFrame(frame);
