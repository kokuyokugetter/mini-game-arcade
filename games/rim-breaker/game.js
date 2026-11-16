'use strict';

const canvas = document.querySelector('#board');
const cabinet = document.querySelector('.cabinet');
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
const radius = 5;
const maxBalls = 12;
const launchSpread = [-.24, .24];
const pierceDuration = 2.8;
const bounceDuration = 4;
const rimThreshold = .61;
const upgradedSpread = [0, -.26, .26, .46];
const columns = 16;
const powerups = {
  split: { glyph: '+', color: '#72f6c2', label: '分裂 · 爆裂弾を最大6球追加！', frequency: 760 },
  pierce: { glyph: '↑', color: '#ff8abd', label: '貫通 · ブロックを突き抜けろ！', frequency: 510 },
  bounce: { glyph: '↗', color: '#ffe17d', label: '超反射 · 床で2球まで復帰！', frequency: 620 },
  beam: { glyph: 'ϟ', color: '#88eaff', label: 'ビーム · 5列の壁を焼く！', frequency: 210 },
};
const paddleY = 428;
const step = 1 / 240;
const bestKey = 'rim-breaker-best-v3';
const soundKey = 'rim-breaker-sound-v1';
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
  { id: 'quad', name: '四連発', description: '発射するたび4球に増える。', limit: 1 },
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
let audioBus;
let nextTone = 0;
let sound = readSound();

let previousTime = 0;
let accumulator = 0;
let drag = null;
let pendingBalls;
let beams;
let pierceTime;
let bounceTime;
let banner;
let bannerTime;
let floorCharges;
let returns;
let lastPowerTone = -Infinity;

function readSound() {
  try {
    return localStorage.getItem(soundKey) !== 'off';
  } catch {
    return true;
  }
}

function updateSoundButton() {
  soundButton.setAttribute('aria-pressed', String(sound));
  soundButton.textContent = sound ? '効果音 ON' : '効果音 OFF';
}

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
  return Math.max(94, 114 - (stage - 1) * 2) + loadout.wide * 14 - loadout.magnet * 12;
}

function speed() {
  const depth = Math.min(12, stage - 1);
  return 308 + depth * 10 + (stage % 5 === 0 ? 24 : 0) + loadout.blast * 22;
}

function position(x) {
  const half = paddleWidth() / 2;
  paddleX = clamp(x, half, width - half);
}

function buildField() {
  const formation = stage === 1 ? 0 : Math.floor(Math.random() * 4);
  const mirrored = Math.random() < .5;
  const reinforced = stage % 5 === 0;
  const rows = Math.min(7, 5 + Math.floor((stage - 1) / 3));
  const rewardLocations = [
    { row: 1, lane: 4, power: 'beam' },
    { row: 2, lane: 11, power: 'pierce' },
    { row: 3, lane: 2, power: 'bounce' },
    { row: rows - 2, lane: 13, power: 'split' },
  ];
  bricks = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const lane = mirrored ? columns - 1 - col : col;
      const power = rewardLocations.find((reward) => reward.row === row && reward.lane === lane)?.power ?? null;
      if (!power && row < rows - 1) {
        if (formation === 1 && (row + lane) % 5 === 0) continue;
        if (formation === 2 && row + Math.min(lane, columns - 1 - lane) < 3) continue;
        if (formation === 3 && row > 0 && (lane === 4 || lane === 11)) continue;
      }
      const kind = power ? 'power'
        : (row * 7 + lane * 5 + stage) % 17 === 0 ? 'core'
          : (reinforced && (row + lane) % 3 !== 0 || row === rows - 1 && (lane === 6 || lane === 9)) ? 'armor' : 'plain';
      bricks.push({ row, col, kind, power, hp: kind === 'armor' ? 2 : 1, x: 9 + col * 29, y: 52 + row * 25, w: 27, h: 21 });
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
  canvas.classList.toggle('is-ready', mode === 'ready');
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
  pierceTime = 0;
  bounceTime = 0;
  bannerTime = 0;
  floorCharges = 0;
  returns = 0;
  pendingBalls = [];
  beams = [];
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
  ready('盤面をタップして発射。パドルの光る端で返すと着弾が爆発。');
}

function start() {
  stage = 1;
  lives = 3;
  score = 0;
  loadout = { wide: 0, blast: 0, quad: 0, magnet: 0 };
  loadSector();
}

function launchHeading() {
  if (remainingBricks <= 3) return aimAtNearestBrick(paddleX, paddleY - radius - 1);
  return (width / 2 - paddleX) / 1800 + (serves % 2 === 0 ? .14 : -.14);
}

function aimAtNearestBrick(x, y) {
  const brick = bricks.reduce((nearest, target) => {
    if (!target.hp) return nearest;
    return !nearest || Math.abs(target.x + target.w / 2 - x) < Math.abs(nearest.x + nearest.w / 2 - x) ? target : nearest;
  }, null);
  return Math.atan2(brick.x + brick.w / 2 - x, y - brick.y - brick.h / 2);
}

function launch() {
  if (mode !== 'ready') return;
  const heading = launchHeading();
  const offsets = loadout.quad ? upgradedSpread : launchSpread;
  balls = offsets.map((offset) => createBall(paddleX + offset * 13, paddleY - radius - 1, heading + offset));
  serves += 1;
  mode = 'play';
  say(remainingBricks === 1 ? 'ラスト1個を狙って発射！' : `${balls.length}球発射！ 光るマークを狙おう。`);
  updateHud();
  tone(335, .08);
}

function createBall(x, y, angle, multiplier = 1) {
  const value = speed() * multiplier;
  return {
    x: clamp(x, radius, width - radius),
    y: clamp(y, radius, paddleY - radius - 1),
    vx: Math.sin(angle) * value,
    vy: -Math.cos(angle) * value,
    hot: false,
  };
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

function tone(frequency, duration, type = 'sine', priority = false) {
  if (!sound) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!audio) {
      audio = new AudioContext();
      audioBus = audio.createDynamicsCompressor();
      audioBus.threshold.value = -18;
      audioBus.ratio.value = 4;
      audioBus.connect(audio.destination);
    }
    if (audio.state !== 'running') {
      audio.resume().catch(() => {});
    }
    const time = audio.currentTime;
    if (!priority && time < nextTone) return;
    nextTone = time + .021;
    const oscillator = audio.createOscillator();
    const volume = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, frequency * .7), time + duration);
    volume.gain.setValueAtTime(.045, time);
    volume.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(volume).connect(audioBus);
    oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
    oscillator.start(time);
    oscillator.stop(time + duration);
  } catch {
    sound = false;
    updateSoundButton();
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
    for (let i = 0; i < 8 && particles.length < 260; i++) {
      const angle = Math.random() * Math.PI * 2;
      particles.push({ x, y, vx: Math.cos(angle) * (65 + Math.random() * 165), vy: Math.sin(angle) * (50 + Math.random() * 140), life: .36, color: powerups[brick.power]?.color ?? (brick.kind === 'core' ? '#ff976e' : palettes[brick.row % palettes.length][0]) });
    }
  }
  return true;
}

function activatePower(brick) {
  const { power, x, y, w, h, col } = brick;
  const effect = powerups[power];
  banner = effect;
  bannerTime = 1.65;
  say(effect.label);
  if (performance.now() - lastPowerTone > 85) {
    lastPowerTone = performance.now();
    tone(effect.frequency, power === 'beam' ? .18 : .12, power === 'beam' ? 'sawtooth' : 'triangle', true);
  }

  if (power === 'split') {
    for (const angle of [-.96, -.61, -.24, .24, .61, .96]) {
      if (balls.length + pendingBalls.length >= maxBalls) break;
      pendingBalls.push({ ...createBall(x + w / 2, y + h / 2, angle, 1.15), hot: true });
    }
  } else if (power === 'pierce') {
    pierceTime = pierceDuration;
  } else if (power === 'bounce') {
    bounceTime = bounceDuration;
    floorCharges = 2;
  } else if (power === 'beam') {
    beams.push({ x: x + w / 2, life: .46 });
    return bricks.filter((target) => target.hp > 0 && Math.abs(target.col - col) <= 2);
  }
  return [];
}

function strike(hit, hot, piercing) {
  const impacts = [{ brick: hit, damage: hot || piercing ? 2 : 1, blast: hot }];
  const detonations = new Set();
  for (const { brick, damage, blast } of impacts) {
    if (brick.power && brick !== hit) continue;
    const destroyed = awardHit(brick, damage);
    if (destroyed && brick.power) {
      for (const target of activatePower(brick)) impacts.push({ brick: target, damage: 2 });
    }
    if ((!blast && !(destroyed && brick.kind === 'core')) || detonations.has(brick)) continue;
    detonations.add(brick);
    bursts.push({ x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, life: .25 });
    for (const target of bricks) {
      const dx = Math.abs(target.col - brick.col);
      const dy = Math.abs(target.row - brick.row);
      const inBlast = blast || loadout.blast ? Math.max(dx, dy) <= 1 : dx + dy <= 1;
      if (inBlast && target.hp > 0) impacts.push({ brick: target, damage: 2 });
    }
  }
  if (detonations.size) {
    if (!reducedMotion.matches) hitFreeze = .014;
    tone(135, .11, 'triangle');
  } else if (hit.hp === 0 && bannerTime <= 0) {
    tone(430 + Math.min(combo, 14) * 34, .045);
    if (remainingBricks <= 3) say(`残り${remainingBricks}個。中央で返すと自動で狙う。`);
  }
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
    if (bounceTime > 0) ball.hot = true;
  }
  if (ball.y < radius) {
    ball.y = radius;
    ball.vy = Math.abs(ball.vy);
    if (bounceTime > 0) ball.hot = true;
  }

  const paddleContact = paddleY - radius;
  if (ball.vy > 0 && oldY <= paddleContact && ball.y >= paddleContact) {
    const fraction = (paddleContact - oldY) / (ball.y - oldY);
    const crossingX = oldX + (ball.x - oldX) * fraction;
    const half = paddleWidth() / 2;
    if (Math.abs(crossingX - paddleX) <= half + radius * .65) {
      const offset = clamp((crossingX - paddleX) / half, -1, 1);
      const rebound = offset * (loadout.wide ? 1.02 : 1.16);
      const aimAssist = remainingBricks <= 3 ? .40 : .10;
      const angle = Math.abs(offset) <= aimAssist
        ? aimAtNearestBrick(crossingX, paddleContact)
        : rebound;
      returns += 1;
      const rallyBoost = 1 + Math.min(returns * .018, .19);
      const powerBoost = pierceTime > 0 ? 1.28 : bounceTime > 0 ? 1.14 : 1;
      const value = speed() * Math.max(rallyBoost, powerBoost);
      ball.x = crossingX;
      ball.y = paddleContact;
      ball.vx = Math.sin(angle) * value;
      ball.vy = -Math.cos(angle) * value;
      ball.hot = Math.abs(offset) >= rimThreshold;
      if (ball.hot && bannerTime <= 0) say('リムショット！ 次の着弾で爆発。');
      tone(ball.hot ? 515 : 250, .07);
    }
  }

  const hit = bricks.find((brick) => brick.hp > 0 && touches(ball, brick));
  const piercing = pierceTime > 0 || hit?.power === 'pierce';
  if (hit && !piercing) {
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
  }
  if (hit) {
    strike(hit, ball.hot, piercing);
    ball.hot = false;
    if (hit.power === 'pierce') {
      const multiplier = speed() * 1.28 / Math.hypot(ball.vx, ball.vy);
      ball.vx *= multiplier;
      ball.vy *= multiplier;
    }
  }

  const netContact = height - 19;
  const rebound = bounceTime > 0 && floorCharges > 0;
  if (ball.vy > 0 && oldY <= netContact && ball.y >= netContact && (rebound || loadout.magnet && !spentNet)) {
    if (rebound) floorCharges -= 1;
    else spentNet = true;
    const angle = remainingBricks <= 3 ? aimAtNearestBrick(ball.x, netContact)
      : (width / 2 - ball.x) / width * .86 + Math.sign(ball.vx || 1) * .46;
    const multiplier = rebound ? 1.25 : 1;
    Object.assign(ball, createBall(ball.x, netContact, angle, multiplier), { y: netContact, hot: rebound });
    if (rebound) bursts.push({ x: ball.x, y: netContact, life: .25 });
    tone(rebound ? 510 : 300, .07, 'triangle');
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
  for (const beam of beams) beam.life -= dt;
  beams = beams.filter(({ life }) => life > 0);
  bannerTime -= dt;
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
  pierceTime -= dt;
  bounceTime -= dt;
  balls = balls.filter((ball) => remainingBricks > 0 && moveBall(ball, dt));
  balls.push(...pendingBalls);
  pendingBalls.length = 0;
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
  const activeFloor = bounceTime > 0 && floorCharges > 0;
  const lastBall = mode === 'play' && balls.length === 1;
  ctx.fillStyle = activeFloor ? '#ffe17d' : loadout.magnet && !spentNet ? '#77f2dc88' : lastBall ? '#ff7476ac' : '#ff74764a';
  ctx.fillRect(0, height - 19, width, activeFloor ? 3 : 1);

  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = '#d5e8fa';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(`残り  ${remainingBricks}`, 12, 25);
  ctx.textAlign = 'right';
  if (mode === 'play' || mode === 'clearing') {
    if (lastBall) ctx.fillStyle = '#ff9c96';
    ctx.fillText(`●  ${balls.length}`, width - 12, 25);
  }

  let timerX = 92;
  for (const [power, time, duration] of [['pierce', pierceTime, pierceDuration], ['bounce', bounceTime, bounceDuration]]) {
    if (time <= 0) continue;
    const effect = powerups[power];
    ctx.fillStyle = effect.color;
    ctx.textAlign = 'left';
    ctx.fillText(`${effect.glyph}  ${power === 'pierce' ? '貫通' : `超反射 ×${floorCharges}`}`, timerX, 23);
    ctx.fillRect(timerX, 34, time / duration * 76, 2);
    timerX += 94;
  }
  if (combo >= 4) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff1bd';
    ctx.fillText(`${combo} HIT`, width / 2, height - 8);
  }

  for (const brick of bricks) {
    if (brick.hp === 0) continue;
    const { x, y, w, h, kind, hp } = brick;
    ctx.fillStyle = '#04081388';
    ctx.fillRect(x + 2, y + 3, w, h);
    ctx.fillStyle = powerups[brick.power]?.color ?? (kind === 'core' ? '#fc956b' : kind === 'armor' && hp === 2 ? '#acb6d1' : brick.row % 2 ? dark : light);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffffff66';
    ctx.fillRect(x + 2, y + 2, w - 4, 2);
    if (brick.power) {
      ctx.fillStyle = '#17213d';
      ctx.font = '900 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(powerups[brick.power].glyph, x + w / 2, y + h / 2 + 1);
    }
    if (kind === 'core') {
      ctx.fillStyle = '#612b45';
      ctx.fillRect(x + w / 2 - 2, y + 6, 4, 12);
      ctx.fillRect(x + w / 2 - 6, y + 10, 12, 4);
    }
    if (kind === 'armor') {
      ctx.strokeStyle = '#253453';
      ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
      if (hp === 2) ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
    }
    if (remainingBricks === 1) {
      ctx.strokeStyle = '#fff1bd';
      ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
    }
  }

  const half = paddleWidth() / 2;
  const startX = paddleX - half;
  const edge = half * (1 - rimThreshold);
  ctx.fillStyle = '#233b57';
  ctx.fillRect(startX, paddleY, half * 2, 10);
  ctx.fillStyle = '#ffbe71';
  ctx.fillRect(startX, paddleY - 1, edge, 11);
  ctx.fillRect(paddleX + half - edge, paddleY - 1, edge, 11);
  ctx.fillStyle = '#97f6f1';
  ctx.fillRect(startX + edge, paddleY, (half - edge) * 2, 3);

  if (mode === 'ready') {
    const heading = launchHeading();
    for (const offset of (loadout.quad ? upgradedSpread : launchSpread)) {
      for (let i = 1; i <= 6; i++) {
        circle(paddleX + offset * 13 + Math.sin(heading + offset) * i * 13, paddleY - 10 - Math.cos(heading + offset) * i * 13, 2, '#97f6f180');
      }
      circle(paddleX + offset * 29, paddleY - radius - 2 - Math.abs(offset) * 10, radius, '#eefcff');
    }
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
  for (const beam of beams) {
    ctx.globalAlpha = beam.life / .46;
    ctx.fillStyle = '#36caff55';
    ctx.fillRect(beam.x - 72, 0, 144, paddleY);
    for (const offset of [-58, -29, 0, 29, 58]) {
      ctx.fillStyle = '#68d7ff';
      ctx.fillRect(beam.x + offset - 7, 0, 14, paddleY);
      ctx.fillStyle = '#effdff';
      ctx.fillRect(beam.x + offset - 1, 0, 2, paddleY);
    }
  }
  ctx.globalAlpha = 1;
  for (const ball of balls) {
    const aura = pierceTime > 0 ? '#ff8abd' : ball.hot ? '#ffe17d' : '#88eaff';
    if (!reducedMotion.matches) {
      ctx.globalAlpha = .28;
      circle(ball.x - ball.vx * .036, ball.y - ball.vy * .036, 3, aura);
      ctx.globalAlpha = .58;
      circle(ball.x - ball.vx * .017, ball.y - ball.vy * .017, 4, aura);
      ctx.globalAlpha = 1;
    }
    if (pierceTime > 0 || ball.hot) circle(ball.x, ball.y, 8, null, aura);
    circle(ball.x, ball.y, radius, '#f3ffff');
  }
  if (bannerTime > 0 && mode === 'play') {
    ctx.globalAlpha = Math.min(1, bannerTime * 3);
    ctx.fillStyle = '#0d192eee';
    ctx.fillRect(77, 256, width - 154, 33);
    ctx.strokeStyle = banner.color;
    ctx.strokeRect(77, 256, width - 154, 33);
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = banner.color;
    ctx.fillText(`${banner.glyph}  ${banner.label}`, width / 2, 273);
    ctx.globalAlpha = 1;
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

for (const type of ['contextmenu', 'selectstart']) {
  cabinet.addEventListener(type, (event) => event.preventDefault());
}

canvas.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0 || (mode !== 'ready' && mode !== 'play')) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  canvas.setPointerCapture(event.pointerId);
  pointPaddle(event);
});
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerId === drag?.id && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 9) drag.moved = true;
  if (event.pointerType === 'mouse' || event.pointerId === drag?.id) pointPaddle(event);
});
canvas.addEventListener('pointerup', (event) => {
  if (event.pointerId !== drag?.id) return;
  const tapped = !drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 9;
  drag = null;
  pointPaddle(event);
  if (tapped) launch();
});
for (const type of ['pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(type, () => { drag = null; });
}

action.addEventListener('click', playerAction);
pause.addEventListener('click', togglePause);
soundButton.addEventListener('click', () => {
  sound = !sound;
  updateSoundButton();
  try {
    localStorage.setItem(soundKey, sound ? 'on' : 'off');
  } catch {
    // The current session still retains the setting.
  }
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

updateSoundButton();
start();
requestAnimationFrame(frame);
