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
  ...challenges,
};

const instructions = {
  spiral: '外側から渦巻きをたどり、中心の穴を目指します。',
  twin: '同じ傾きで2球が動きます。AとBを、それぞれ同じ記号の穴へ。',
  swap: '同じ傾きで2球が動きます。壁を使って、AとBの出発位置を入れ替えます。',
  gates: '① → ② → ③ の順に球を通すと、ゴールの穴が開きます。',
  slider: '左右に傾けると壁もレールを滑ります。壁をよけてから球を通します。',
};
const ballColors = [
  { rim: '#286d64', mid: '#8ed5bc', dark: '#204e48', light: '#f6fff5' },
  { rim: '#9a4839', mid: '#ffc38c', dark: '#763e3d', light: '#fff4de' },
];

const canvas = document.querySelector('#board');
const ctx = canvas.getContext('2d');
const backdrop = document.createElement('canvas');
const level = document.querySelector('#level');
const tilt = document.querySelector('#tilt');
const calibrate = document.querySelector('#calibrate');
const status = document.querySelector('#status');
const clock = document.querySelector('#time');
const objective = document.querySelector('#objective');
const bestLabel = document.querySelector('#best');
const win = document.querySelector('#win');
const next = document.querySelector('#next');
const keys = new Set();
const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const radius = .29;
const step = 1 / 120;
const unit = 48;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const seconds = value => `${value.toFixed(1)} 秒`;

let maze;
let balls = [];
let checkpoints;
let checkpointIndex;
let slider;
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

function stopMomentum() {
  for (const ball of balls) ball.vx = ball.vy = 0;
  if (slider) slider.vx = 0;
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
  stopMomentum();
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
  stopMomentum();
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
  return y < 0 ? null : { x: maze[y].indexOf(mark) + .5, y: y + .5 };
}

function updateObjective() {
  const message = instructions[level.value] ?? '球をゴールの穴に入れます。';
  if (checkpoints.length) {
    objective.textContent = `${message} 通過 ${checkpointIndex}/${checkpoints.length}`;
  } else if (balls.length > 1) {
    objective.textContent = `${message} 到着 ${balls.filter(ball => ball.done).length}/${balls.length}`;
  } else {
    objective.textContent = message;
  }
}

function disc(paint, x, y, radius, fill, stroke) {
  paint.beginPath();
  paint.arc(x, y, radius, 0, Math.PI * 2);
  paint.fillStyle = fill;
  paint.fill();
  if (stroke) {
    paint.strokeStyle = stroke;
    paint.lineWidth = 3;
    paint.stroke();
  }
}

function marker(paint, x, y, value, color) {
  paint.font = 'bold 16px system-ui, sans-serif';
  paint.textAlign = 'center';
  paint.textBaseline = 'middle';
  paint.fillStyle = color;
  paint.fillText(value, x, y);
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

  if (slider) {
    paint.fillStyle = '#705436';
    for (const offset of [-.32, .32]) {
      paint.fillRect((slider.min - .43) * unit, (slider.y + offset) * unit, (slider.max - slider.min + .86) * unit, 3);
    }
  }
  for (const [index, position] of checkpoints.entries()) {
    const x = position.x * unit, y = position.y * unit;
    const visited = index < checkpointIndex;
    disc(paint, x, y, 15, visited ? '#416d56' : '#7b592c', index === checkpointIndex ? '#fff0b5' : '#d9bd81');
    marker(paint, x, y, String(index + 1), '#fff6d0');
  }
  for (const ball of balls) {
    const { start, goal, colors } = ball;
    paint.setLineDash([3, 3]);
    disc(paint, start.x * unit, start.y * unit, 15, '#00000000', colors.dark);
    paint.setLineDash([]);
    const x = goal.x * unit, y = goal.y * unit;
    const locked = checkpointIndex < checkpoints.length;
    disc(paint, x, y, 17, locked ? '#7b592c' : '#182a26', balls.length > 1 ? colors.rim : '#fff2b6');
    if (balls.length > 1 || locked || ball.done) {
      marker(paint, x, y, ball.done ? '✓' : locked ? '×' : ball.label, colors.light);
    } else {
      disc(paint, x, y, 3.4, '#fff2b6');
    }
  }
}

function reset() {
  maze = mazes[level.value];
  const starts = ['S', 'T'].map(locationOf).filter(Boolean);
  const goals = level.value === 'swap' ? [starts[1], starts[0]] : ['G', 'H'].map(locationOf);
  balls = starts.map((start, index) => ({
    ...start, start, vx: 0, vy: 0, goal: goals[index], label: index === 0 ? 'A' : 'B',
    colors: ballColors[index], done: false,
  }));
  checkpoints = ['1', '2', '3'].map(locationOf).filter(Boolean);
  checkpointIndex = 0;
  const railStart = locationOf('M');
  slider = null;
  if (railStart) {
    const rail = maze[Math.floor(railStart.y)];
    let min = Math.floor(railStart.x), max = min;
    while (rail[min - 1] === '=') min -= 1;
    while (rail[max + 1] === '=') max += 1;
    slider = { ...railStart, min: min + .5, max: max + .5, vx: 0 };
  }
  keys.clear();
  pointer = undefined;
  elapsed = 0;
  state = 'ready';
  clock.textContent = seconds(0);
  win.hidden = true;
  next.hidden = level.selectedIndex === level.options.length - 1;
  canvas.width = maze[0].length * unit;
  canvas.height = maze.length * unit;
  best = null;
  try {
    const stored = Number(localStorage.getItem(`tilt-maze-best-${level.value}`));
    if (stored > 0 && Number.isFinite(stored)) best = stored;
  } catch {}
  updateBest();
  updateObjective();
  say(motionState === 'on' ? 'スマホを傾けるとスタートします。' : '「傾き操作を使う」を押すか、指や矢印キーでスタート。');
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
    const reference = balls.length > 1 ? pointer.start : balls[0];
    x = (pointer.x - reference.x) / 1.6;
    y = (pointer.y - reference.y) / 1.6;
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

function touchesSlider(x, y, wallX) {
  const dx = x - clamp(x, wallX - .46, wallX + .46);
  const dy = y - clamp(y, slider.y - .44, slider.y + .44);
  return dx * dx + dy * dy < radius * radius;
}

function moveSlider(input, dt) {
  if (!slider) return false;
  slider.vx = clamp((slider.vx + input * 33 * dt) * Math.exp(-4 * dt), -7.2, 7.2);
  const x = clamp(slider.x + slider.vx * dt, slider.min, slider.max);
  const delta = x - slider.x;
  if (Math.abs(delta) < 1e-5) {
    slider.vx = 0;
    return false;
  }
  const ball = balls[0];
  if (!ball.done && touchesSlider(ball.x, ball.y, x)) {
    if (!fits(ball.x + delta, ball.y)) {
      slider.vx = 0;
      return false;
    }
    ball.x += delta;
    ball.vx = slider.vx;
  }
  slider.x = x;
  return true;
}

function fitsBall(ball, x, y) {
  if (!fits(x, y) || slider && touchesSlider(x, y, slider.x)) return false;
  return !balls.some(other => other !== ball && !other.done && Math.hypot(x - other.x, y - other.y) < radius * 2);
}

function moveBall(dt) {
  if (state === 'clear') return false;
  const input = inputVector();
  if (state === 'ready') {
    if (!input.x && !input.y) return false;
    state = 'playing';
    say('球が転がり始めました。');
  }
  elapsed += dt;
  const drag = Math.exp(-3.4 * dt);
  let changed = false;
  let redrawBackdrop = false;
  for (const ball of balls) {
    if (ball.done) continue;
    ball.vx = clamp((ball.vx + input.x * 23 * dt) * drag, -6.6, 6.6);
    ball.vy = clamp((ball.vy + input.y * 23 * dt) * drag, -6.6, 6.6);
    const beforeX = ball.x, beforeY = ball.y;
    const x = ball.x + ball.vx * dt, y = ball.y + ball.vy * dt;
    if (fitsBall(ball, x, ball.y)) ball.x = x;
    else ball.vx *= -.14;
    if (fitsBall(ball, ball.x, y)) ball.y = y;
    else ball.vy *= -.14;
    changed ||= ball.x !== beforeX || ball.y !== beforeY;

    const checkpoint = checkpoints[checkpointIndex];
    if (checkpoint && near(ball, checkpoint)) {
      checkpointIndex += 1;
      say(checkpointIndex === checkpoints.length ? 'ゴールの穴が開きました。' : 'チェックポイント通過。次の番号へ。');
      redrawBackdrop = true;
    }
    if (checkpointIndex === checkpoints.length && near(ball, ball.goal)) {
      ball.done = true;
      ball.vx = ball.vy = 0;
      redrawBackdrop = true;
      if (balls.length > 1) say(`${ball.label}が到着。残りの球を運ぼう。`);
    }
  }
  if (redrawBackdrop) {
    updateObjective();
    drawBackdrop();
  }
  if (balls.every(ball => ball.done)) {
    finish();
    return true;
  }
  return moveSlider(input.x, dt) || changed || redrawBackdrop;
}

function near(ball, point) {
  return Math.hypot(point.x - ball.x, point.y - ball.y) <= .28;
}

function finish() {
  state = 'clear';
  stopMomentum();
  keys.clear();
  pointer = undefined;
  if (best === null || elapsed < best) {
    best = elapsed;
    try { localStorage.setItem(`tilt-maze-best-${level.value}`, String(elapsed)); } catch {}
    updateBest();
  }
  document.querySelector('#result').textContent = seconds(elapsed);
  win.hidden = false;
  say(level.value === 'swap' ? '2球の出発位置を入れ替えました。'
    : balls.length > 1 ? '2球ともゴールの穴に入りました。' : 'ゴールの穴に入りました。');
  document.querySelector('#win-title').focus({ preventScroll: true });
}

function paint() {
  ctx.drawImage(backdrop, 0, 0);
  if (slider) {
    const x = slider.x * unit, y = slider.y * unit;
    ctx.fillStyle = '#322d2b80';
    ctx.fillRect(x - 18, y - 16, 44, 42);
    ctx.fillStyle = '#684745';
    ctx.fillRect(x - .46 * unit, y - .44 * unit, .92 * unit, .88 * unit);
    ctx.fillStyle = '#e09e78';
    ctx.fillRect(x - 19, y - 19, 38, 4);
    marker(ctx, x, y + 2, '↔', '#fff1cc');
  }
  if (state === 'clear') return;
  for (const ball of balls) {
    if (!ball.done) paintBall(ball);
  }
}

function paintBall(ball) {
  const x = ball.x * unit, y = ball.y * unit, r = radius * unit;
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 6, r + 1, r * .83, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#37291465';
  ctx.fill();
  const metal = ctx.createRadialGradient(x - 4, y - 6, 1, x + 2, y, r);
  metal.addColorStop(0, ball.colors.light);
  metal.addColorStop(.43, ball.colors.mid);
  metal.addColorStop(1, ball.colors.dark);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = metal;
  ctx.fill();
  if (balls.length > 1) marker(ctx, x, y, ball.label, '#172929');
}

function frame(now) {
  if (document.hidden) {
    requestAnimationFrame(frame);
    return;
  }
  if (previousTime !== undefined) accumulator += Math.min((now - previousTime) / 1000, .045);
  previousTime = now;
  let redraw = false;
  while (accumulator >= step) {
    redraw = moveBall(step) || redraw;
    accumulator -= step;
  }
  if (redraw) paint();
  const time = seconds(elapsed);
  if (clock.textContent !== time) clock.textContent = time;
  requestAnimationFrame(frame);
}

function point(event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width * maze[0].length;
  const y = (event.clientY - rect.top) / rect.height * maze.length;
  pointer = {
    id: event.pointerId,
    x, y, start: pointer?.start ?? { x, y },
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
    stopMomentum();
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
