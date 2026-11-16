'use strict';

const canvas = document.querySelector('#board');
const ctx = canvas.getContext('2d');
const overlay = document.querySelector('#overlay');
const title = document.querySelector('#overlay-title');
const copy = document.querySelector('#overlay-copy');
const choices = document.querySelector('#choices');
const action = document.querySelector('#action');
const pause = document.querySelector('#pause');
const soundButton = document.querySelector('#sound');
const status = document.querySelector('#status');
const hud = Object.fromEntries(['sector', 'lives', 'score', 'best'].map((key) => [key, document.getElementById(key)]));

const width = canvas.width;
const height = canvas.height;
const radius = 6;
const paddleY = 428;
const step = 1 / 240;
const bestKey = 'rim-breaker-best-v1';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const number = new Intl.NumberFormat('ja-JP');
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const keys = new Set();
const palettes = [
  ['#6accf5', '#776ff1', '#0d192e'],
  ['#77f2bc', '#26a3a1', '#0b2029'],
  ['#ffb69a', '#e871a7', '#281732'],
  ['#e9bdfc', '#856ffc', '#17152e'],
];
const upgrades = [
  { id: 'wide', name: 'ワイドパドル', description: 'パドル幅＋14。反射の角度が少し穏やかになる。', limit: 2 },
  { id: 'blast', name: '連鎖炉', description: '爆風が斜めにも届く。そのぶん発射・反射の球速が上がる。', limit: 1 },
  { id: 'twin', name: '双発コア', description: '次に装填するたび2球で発射。飛んでいる球が尽きるまで続行。', limit: 1 },
  { id: 'magnet', name: 'セーフティネット', description: '各セクターで一度だけ落球を防ぐ。装備中はパドルが少し短くなる。', limit: 1 },
];

let mode;
let pausedMode;
let stage;
let lives;
let score;
let best = readBest();
let loadout;
let paddleX;
let balls;
let bricks;
let bursts;
let particles;
let spentNet;
let combo;
let serves;
let remainingBricks;
let hitFreeze;
let clearTime;
let audio;
let sound = false;
let previousTime = 0;
let accumulator = 0;
let dragId = null;

function readBest() {
  try {
    const value = Number(localStorage.getItem(bestKey));
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function saveBest() {
  if (score <= best) return;
  best = score;
  try {
    localStorage.setItem(bestKey, String(best));
  } catch {
    // The current session still retains its record.
  }
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function paddleWidth() {
  return 104 + loadout.wide * 14 - loadout.magnet * 12;
}

function speed() {
  const depth = Math.min(12, stage - 1);
  return 295 + depth * 9 + (stage % 5 === 0 ? 27 : 0) + loadout.blast * 44;
}

function position(x) {
  const half = paddleWidth() / 2;
  paddleX = clamp(x, half, width - half);
}

function buildField() {
  const formation = stage === 1 ? 0 : Math.floor(Math.random() * 4);
  const mirrored = Math.random() < .5;
  const reinforced = stage % 5 === 0;
  const rows = stage === 1 ? 3 : reinforced ? 5 : Math.min(4, 3 + Math.floor(stage / 3));
  const explosive = stage === 1 ? 3 : Math.floor(Math.random() * 4) + 1;
  bricks = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < 8; col++) {
      const lane = mirrored ? 7 - col : col;
      if (stage === 1 && (col === 0 || col === 7 || (row === 0 && (col === 1 || col === 6)))) continue;
      if (formation === 1 && (row + lane) % 4 === 0) continue;
      if (formation === 2 && row + Math.min(lane, 7 - lane) < 2) continue;
      if (formation === 3 && row > 0 && (lane === 2 || lane === 5)) continue;
      const kind = (row === rows - 1 && (col === explosive || col === 7 - explosive))
        || (row === 0 && formation === 2 && col === 4)
        ? 'core'
        : (reinforced && (row + lane) % 3 !== 0) || (stage >= 3 && row === 1 && lane % 3 === 0)
          ? 'armor'
          : 'plain';
      bricks.push({ row, col, kind, hp: kind === 'armor' ? 2 : 1, x: 26 + col * 54, y: 58 + row * 30, w: 50, h: 24 });
    }
  }
  remainingBricks = bricks.length;
}

function say(text) {
  status.textContent = text;
}

function updateHud() {
  hud.sector.textContent = String(stage).padStart(2, '0');
  hud.lives.textContent = lives;
  hud.score.textContent = number.format(score);
  hud.best.textContent = number.format(best);
  action.disabled = mode !== 'ready';
  pause.disabled = mode !== 'ready' && mode !== 'play' && mode !== 'pause';
  pause.textContent = mode === 'pause' ? '再開' : '一時停止';
}

function showOverlay(heading, description, options) {
  title.textContent = heading;
  copy.textContent = description;
  choices.replaceChildren(...options.map(({ name, description: detail, choose }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    if (detail) {
      const span = document.createElement('span');
      span.textContent = detail;
      button.append(span);
    }
    button.addEventListener('click', choose, { once: true });
    return button;
  }));
  overlay.hidden = false;
  title.focus({ preventScroll: true });
}

function hideOverlay() {
  overlay.hidden = true;
}

function ready(text) {
  mode = 'ready';
  combo = 0;
  balls = [];
  hitFreeze = 0;
  hideOverlay();
  say(text);
  updateHud();
}

function loadSector() {
  spentNet = false;
  serves = 0;
  position(width / 2);
  bursts = [];
  particles = [];
  buildField();
  ready(stage % 5 === 0 ? '装甲セクター。爆風を当てると装甲ごと壊せる。' : '狙いを決めて発射。光る端で返すと爆発。');
}

function start() {
  stage = 1;
  lives = 3;
  score = 0;
  loadout = { wide: 0, blast: 0, twin: 0, magnet: 0 };
  loadSector();
}

function launchHeading() {
  if (remainingBricks === 1) return aimAtLastBrick(paddleX, paddleY - radius - 1);
  return (width / 2 - paddleX) / 1800 + (serves % 2 === 0 ? .14 : -.14);
}

function aimAtLastBrick(x, y) {
  const brick = bricks.find(({ hp }) => hp > 0);
  return Math.atan2(brick.x + brick.w / 2 - x, y - brick.y - brick.h / 2);
}

function launch() {
  if (mode !== 'ready') return;
  const value = speed();
  const heading = launchHeading();
  const angles = loadout.twin ? [heading, heading + (heading < 0 ? -.30 : .30)] : [heading];
  balls = angles.map((angle, i) => ({
    x: paddleX + (i === 1 ? 8 : 0),
    y: paddleY - radius - 1,
    vx: Math.sin(angle) * value, vy: -Math.cos(angle) * value, hot: false,
  }));
  serves += 1;
  mode = 'play';
  say(remainingBricks === 1 ? 'ラスト1個。中央で返すと残ったブロックを狙う。' : '中央は浅く、光る両端は鋭く反射。');
  updateHud();
  tone(335, .08);
}

function playerAction() {
  if (mode === 'ready') launch();
  else if (mode === 'pause') togglePause();
}

function togglePause() {
  if (mode === 'pause') {
    mode = pausedMode;
    hideOverlay();
    say(mode === 'ready' ? '狙いを決めて発射。' : 'プレイ再開。');
    pause.focus({ preventScroll: true });
  } else if (mode === 'ready' || mode === 'play') {
    pausedMode = mode;
    mode = 'pause';
    keys.clear();
    showOverlay('一時停止', '盤面をそのまま再開できます。', [{ name: '再開', choose: togglePause }]);
  }
  updateHud();
}

function nextSector() {
  stage += 1;
  loadSector();
  action.focus({ preventScroll: true });
}

function sectorClear() {
  score += 400 + Math.min(stage, 100) * 100;
  saveBest();
  tone(660, .18, 'triangle');
  if (stage !== 1 && stage % 3 !== 0) {
    const cleared = stage;
    nextSector();
    say(stage % 5 === 0 ? '次は装甲セクター。爆風は装甲ごと壊せる。' : `セクター ${cleared} 突破。狙いを決めて発射。`);
    return;
  }
  mode = 'reward';
  const available = shuffle(upgrades.filter(({ id, limit }) => loadout[id] < limit));
  const rewards = available.slice(0, 2).map((upgrade) => ({
    ...upgrade,
    choose: () => {
      loadout[upgrade.id] += 1;
      nextSector();
    },
  }));
  rewards.push(lives < 5
    ? { name: '補給', description: '残機を1つ回復。最大5。', choose: () => { lives += 1; nextSector(); } }
    : { name: 'スコア換金', description: 'スコア＋750。残機は満タン。', choose: () => { score += 750; saveBest(); nextSector(); } });
  showOverlay(`セクター ${stage} 突破`, rewards.length > 1 ? '次のセクターに持ち込む報酬を選ぶ。' : '報酬を受け取って次へ。', rewards);
  say('セクター突破。');
  updateHud();
}

function miss() {
  lives -= 1;
  if (lives > 0) {
    ready('落球。位置を整えて再発射。');
    return;
  }
  mode = 'over';
  saveBest();
  showOverlay('航行終了', `セクター ${stage} · ${number.format(score)} 点`, [{
    name: 'もう一度',
    choose: () => {
      start();
      action.focus({ preventScroll: true });
    },
  }]);
  say('残機がなくなりました。');
  updateHud();
  tone(110, .2, 'triangle');
}

function tone(frequency, duration, type = 'sine') {
  if (!sound) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audio ??= new AudioContext();
    if (audio.state !== 'running') {
      audio.resume().catch(() => {});
      return;
    }
    const oscillator = audio.createOscillator();
    const volume = audio.createGain();
    const time = audio.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, frequency * .7), time + duration);
    volume.gain.setValueAtTime(.045, time);
    volume.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(volume).connect(audio.destination);
    oscillator.start(time);
    oscillator.stop(time + duration);
  } catch {
    sound = false;
    soundButton.setAttribute('aria-pressed', 'false');
  }
}

function awardHit(brick, power) {
  if (brick.hp === 0) return false;
  brick.hp = Math.max(0, brick.hp - power);
  if (brick.hp > 0) {
    tone(195, .055, 'triangle');
    return false;
  }
  remainingBricks -= 1;
  combo += 1;
  score += (brick.kind === 'core' ? 175 : 100) * Math.min(5, 1 + Math.floor((combo - 1) / 2));
  const x = brick.x + brick.w / 2;
  const y = brick.y + brick.h / 2;
  if (!reducedMotion.matches) {
    for (let i = 0; i < 6 && particles.length < 110; i++) {
      const angle = Math.random() * Math.PI * 2;
      particles.push({ x, y, vx: Math.cos(angle) * 120, vy: Math.sin(angle) * 95, life: .32, color: brick.kind === 'core' ? '#ff976e' : '#9ce9fa' });
    }
  }
  return true;
}

function strike(hit, hot) {
  const detonations = [];
  const scheduled = new Set();
  function detonate(brick) {
    if (scheduled.has(brick)) return;
    scheduled.add(brick);
    detonations.push(brick);
  }
  const destroyed = awardHit(hit, hot ? 2 : 1);
  if (hot || (destroyed && hit.kind === 'core')) detonate(hit);
  for (const source of detonations) {
    bursts.push({ x: source.x + source.w / 2, y: source.y + source.h / 2, life: .25 });
    for (const brick of bricks) {
      const dx = Math.abs(brick.col - source.col);
      const dy = Math.abs(brick.row - source.row);
      const inBlast = loadout.blast ? Math.max(dx, dy) <= 1 : dx + dy <= 1;
      if (inBlast && awardHit(brick, 2) && brick.kind === 'core') detonate(brick);
    }
  }
  if (detonations.length > 0) {
    if (!reducedMotion.matches) hitFreeze = .026;
    say(combo >= 2 ? `${combo}連鎖！` : '爆発！');
    tone(135, .13, 'triangle');
  } else if (hit.hp === 0) {
    tone(430 + Math.min(combo, 9) * 40, .055);
  }
  if (remainingBricks === 1) say('ラスト1個。パドルの中央で返すと残ったブロックを狙う。');
  saveBest();
  updateHud();
}

function touches(ball, brick) {
  const x = clamp(ball.x, brick.x, brick.x + brick.w);
  const y = clamp(ball.y, brick.y, brick.y + brick.h);
  return (ball.x - x) ** 2 + (ball.y - y) ** 2 <= radius ** 2;
}

function moveBall(ball, dt) {
  const oldX = ball.x;
  const oldY = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  if (ball.x < radius || ball.x > width - radius) {
    ball.x = clamp(ball.x, radius, width - radius);
    ball.vx = ball.x === radius ? Math.abs(ball.vx) : -Math.abs(ball.vx);
  }
  if (ball.y < radius) {
    ball.y = radius;
    ball.vy = Math.abs(ball.vy);
  }

  const paddleContact = paddleY - radius;
  if (ball.vy > 0 && oldY <= paddleContact && ball.y >= paddleContact) {
    const fraction = (paddleContact - oldY) / (ball.y - oldY);
    const crossingX = oldX + (ball.x - oldX) * fraction;
    const half = paddleWidth() / 2;
    if (Math.abs(crossingX - paddleX) <= half + radius * .65) {
      const offset = clamp((crossingX - paddleX) / half, -1, 1);
      const rebound = offset * (loadout.wide ? 1.02 : 1.16);
      const drift = Math.sign(offset || width / 2 - crossingX || 1) * .055;
      const angle = remainingBricks === 1 && Math.abs(offset) <= .24
        ? aimAtLastBrick(crossingX, paddleContact)
        : Math.abs(rebound) < .055 ? drift : rebound;
      const value = speed();
      ball.x = crossingX;
      ball.y = paddleContact;
      ball.vx = Math.sin(angle) * value;
      ball.vy = -Math.cos(angle) * value;
      ball.hot = Math.abs(offset) >= .65;
      combo = 0;
      if (ball.hot) say('リムショット！ 次の着弾で爆発。');
      tone(ball.hot ? 515 : 250, .07);
    }
  }

  const hit = bricks.find((brick) => brick.hp > 0 && touches(ball, brick));
  if (hit) {
    const left = hit.x - radius;
    const right = hit.x + hit.w + radius;
    const top = hit.y - radius;
    const bottom = hit.y + hit.h + radius;
    const horizontalDepth = Math.min(Math.abs(ball.x - left), Math.abs(ball.x - right));
    const verticalDepth = Math.min(Math.abs(ball.y - top), Math.abs(ball.y - bottom));
    const crossedSide = oldX <= left || oldX >= right;
    const crossedCap = oldY <= top || oldY >= bottom;
    if (crossedSide && !crossedCap || crossedSide === crossedCap && horizontalDepth < verticalDepth) {
      ball.x = oldX <= left || ball.x < hit.x + hit.w / 2 ? left - .01 : right + .01;
      ball.vx = ball.x < hit.x ? -Math.abs(ball.vx) : Math.abs(ball.vx);
    } else {
      ball.y = oldY <= top || ball.y < hit.y + hit.h / 2 ? top - .01 : bottom + .01;
      ball.vy = ball.y < hit.y ? -Math.abs(ball.vy) : Math.abs(ball.vy);
    }
    strike(hit, ball.hot);
    ball.hot = false;
  }

  if (ball.y > height + radius && loadout.magnet && !spentNet) {
    spentNet = true;
    ball.y = paddleY - radius - 1;
    ball.vy = -Math.abs(ball.vy);
    say('ネットが落球を防いだ。このセクターでは使用済み。');
    tone(300, .12);
  }
  return ball.y <= height + radius;
}

function simulate(dt) {
  if (mode !== 'ready' && mode !== 'play' && mode !== 'clearing') return;
  const movement = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  if (movement && mode !== 'clearing') position(paddleX + movement * 530 * dt);
  for (const particle of particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
  }
  particles = particles.filter(({ life }) => life > 0);
  for (const burst of bursts) burst.life -= dt;
  bursts = bursts.filter(({ life }) => life > 0);
  if (mode === 'clearing') {
    clearTime -= dt;
    if (clearTime <= 0) sectorClear();
    return;
  }
  if (mode !== 'play') return;
  if (hitFreeze > 0) {
    hitFreeze -= dt;
    return;
  }
  balls = balls.filter((ball) => moveBall(ball, dt));
  if (remainingBricks === 0) {
    if (reducedMotion.matches) {
      sectorClear();
    } else {
      mode = 'clearing';
      clearTime = .2;
      updateHud();
    }
  } else if (balls.length === 0) miss();
}

function circle(x, y, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function paint() {
  const [light, dark, background] = palettes[(Math.floor((stage - 1) / 5)) % palettes.length];
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#6a97cc22';
  ctx.beginPath();
  for (let x = 24; x < width; x += 24) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = 23; y < height; y += 24) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.fillStyle = '#94afe088';
  for (let i = 0; i < 40; i++) {
    ctx.fillRect((i * 139 + 37) % width, (i * i * 61 + i * 143 + 95) % height, i % 5 ? 1 : 2, i % 5 ? 1 : 2);
  }
  ctx.fillStyle = '#ff74764a';
  ctx.fillRect(0, height - 17, width, 1);
  if (loadout.magnet && !spentNet) {
    ctx.fillStyle = '#77f2dc88';
    ctx.fillRect(0, height - 12, width, 2);
  }

  for (const brick of bricks) {
    if (brick.hp === 0) continue;
    const { x, y, w, h, kind, hp } = brick;
    ctx.fillStyle = '#04081388';
    ctx.fillRect(x + 2, y + 3, w, h);
    ctx.fillStyle = kind === 'core' ? '#fc956b' : kind === 'armor' && hp === 2 ? '#acb6d1' : brick.row % 2 ? dark : light;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffffff66';
    ctx.fillRect(x + 2, y + 2, w - 4, 2);
    if (kind === 'core') {
      ctx.fillStyle = '#612b45';
      ctx.fillRect(x + w / 2 - 2, y + 6, 4, 12);
      ctx.fillRect(x + w / 2 - 6, y + 10, 12, 4);
    }
    if (kind === 'armor') {
      ctx.strokeStyle = '#253453';
      ctx.strokeRect(x + 5, y + 6, w - 10, h - 11);
      if (hp === 2) ctx.strokeRect(x + 9, y + 9, w - 18, h - 17);
    }
    if (remainingBricks === 1) {
      ctx.strokeStyle = '#fff1bd';
      ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
    }
  }

  const half = paddleWidth() / 2;
  const startX = paddleX - half;
  const edge = (half - half * .65);
  ctx.fillStyle = '#233b57';
  ctx.fillRect(startX, paddleY, half * 2, 10);
  ctx.fillStyle = '#ffbe71';
  ctx.fillRect(startX, paddleY - 1, edge, 11);
  ctx.fillRect(paddleX + half - edge, paddleY - 1, edge, 11);
  ctx.fillStyle = '#97f6f1';
  ctx.fillRect(startX + edge, paddleY, (half - edge) * 2, 3);

  if (mode === 'ready') {
    const heading = launchHeading();
    for (let i = 1; i <= 6; i++) {
      circle(paddleX + Math.sin(heading) * i * 13, paddleY - 10 - Math.cos(heading) * i * 13, 2, '#97f6f1a0');
    }
    circle(paddleX, paddleY - radius - 1, radius, '#eefcff');
  }

  for (const burst of bursts) {
    ctx.globalAlpha = burst.life * 3;
    circle(burst.x, burst.y, 18 + (.25 - burst.life) * 215, null, '#ffd39d');
  }
  for (const particle of particles) {
    ctx.globalAlpha = particle.life * 3;
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, 3, 3);
  }
  ctx.globalAlpha = 1;
  for (const ball of balls) {
    if (ball.hot) {
      circle(ball.x, ball.y, 10, '#ffb46d50');
      circle(ball.x - ball.vx * .025, ball.y - ball.vy * .025, 4, '#ffb46d90');
    }
    circle(ball.x, ball.y, radius, ball.hot ? '#ffd399' : '#f3ffff');
  }
}

function frame(time) {
  if (previousTime) accumulator += Math.min((time - previousTime) / 1000, .045);
  previousTime = time;
  while (accumulator >= step) {
    simulate(step);
    accumulator -= step;
  }
  paint();
  requestAnimationFrame(frame);
}

function pointPaddle(event) {
  if (mode !== 'ready' && mode !== 'play') return;
  const box = canvas.getBoundingClientRect();
  position((event.clientX - box.left) / box.width * width);
}

canvas.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0 || (mode !== 'ready' && mode !== 'play')) return;
  dragId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  pointPaddle(event);
});
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse' || event.pointerId === dragId) pointPaddle(event);
});
canvas.addEventListener('lostpointercapture', () => { dragId = null; });

action.addEventListener('click', playerAction);
pause.addEventListener('click', togglePause);
soundButton.addEventListener('click', () => {
  sound = !sound;
  soundButton.setAttribute('aria-pressed', String(sound));
  tone(380, .1);
});
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if ((mode === 'ready' || mode === 'play') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    keys.add(event.key);
  }
  if (!event.repeat && event.code === 'Space' && mode === 'ready' && !event.target.closest('button, a, summary')) {
    event.preventDefault();
    playerAction();
  }
  if (!event.repeat && (event.code === 'KeyP' || event.code === 'Escape')) togglePause();
});
document.addEventListener('keyup', (event) => keys.delete(event.key));
window.addEventListener('blur', () => {
  keys.clear();
  if (mode === 'play') togglePause();
});
document.addEventListener('visibilitychange', () => {
  previousTime = 0;
  accumulator = 0;
  if (document.hidden && mode === 'play') togglePause();
});

start();
requestAnimationFrame(frame);
