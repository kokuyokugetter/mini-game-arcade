'use strict';

const board = document.querySelector('#board');
const view = new BridgeView(board);
const overlay = document.querySelector('#overlay');
const title = document.querySelector('#overlay-title');
const description = document.querySelector('#overlay-copy');
const startButton = document.querySelector('#start');
const pauseButton = document.querySelector('#pause');
const soundButton = document.querySelector('#sound');
const status = document.querySelector('#status');
const progress = document.querySelector('#run-progress');
const hud = Object.fromEntries(['units', 'power', 'score', 'best'].map(id => [id, document.getElementById(id)]));
const maximum = 60;
const entrance = 28;
const deadline = 58;
const bossHealth = 2380;
const fixedStep = 1 / 120;
const bestKey = 'pulse-bridge-best';
const muteKey = 'pulse-bridge-sound';
const normalize = new Intl.NumberFormat('ja-JP');
const keys = new Set();
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

let game;
let state = 'ready';
let last;
let accumulator = 0;
let pointer = null;
let audio;
let output;
let sound = load(muteKey) !== 'off';
const storedBest = Number(load(bestKey));
let best = Number.isSafeInteger(storedBest) && storedBest > 0 ? storedBest : 0;
let nextSound = 0;

function load(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function store(key, value) {
  try { localStorage.setItem(key, String(value)); } catch {}
}

function say(text) {
  if (status.textContent !== text) status.textContent = text;
}

function option(x, kind, amount) {
  const label = kind === 'shield' ? 'シールド' : kind === 'drone' ? 'ドローン' : `+${amount}`;
  const hp = kind === 'drone' ? amount : 0;
  return { x, kind, amount, label, hp, maxHp: hp, taken: false };
}

function course() {
  const rail = (begin, x, length) => Array.from({ length }, (_, i) => ({
    at: begin + i * .32, options: [option(x, 'small', 1)],
  }));
  const rows = [
    { at: 1.25, options: [option(0, 'crew', 5)] },
    { at: 3.2, options: [option(-.67, 'crew', 8), option(.67, 'shield', 1)] },
    ...rail(5.65, .67, 12),
    { at: 10.35, options: [option(-.67, 'crew', 10), option(.67, 'shield', 1)] },
    ...rail(12.2, -.67, 9),
    { at: 16.5, options: [option(-.67, 'crew', 10), option(.67, 'drone', 46)] },
    ...rail(18.7, .67, 11),
    { at: 23.1, options: [option(-.67, 'shield', 1), option(.67, 'crew', 9)] },
    { at: 26.45, options: [option(0, 'crew', 5)] },
  ];
  const attacks = [
    [4.9, -.67, .28, 5],
    [7.5, .67, .27, 6],
    [11.6, 0, .29, 5],
    [13.9, -.67, .27, 7],
    [16.1, .67, .28, 6],
    [20.45, .67, .28, 8],
    [22.35, -.67, .28, 5],
    [25, 0, .28, 7],
  ];
  for (let n = 0; n < 11; n++) {
    const at = entrance + 2.3 + n * 2.45;
    if (n % 3 === 2) {
      attacks.push([at, -.70, .29, 8], [at, .70, .29, 8]);
    } else {
      const lane = n % 3 === 0 ? (n % 2 ? .67 : -.67) : 0;
      attacks.push([at, lane, .33, Math.min(11, 7 + Math.floor(n / 2))]);
    }
  }
  return { rows, attacks: attacks.map(([at, x, half, damage]) => ({ at, x, half, damage, resolved: false })) };
}

function createRun() {
  const { rows, attacks } = course();
  return {
    time: 0, travel: 0, x: 0, aim: 0, units: 8, power: 8, score: 0, shield: 0, ammo: 0,
    rows, attacks, warnings: [], effects: [], firing: false, targetX: 0, targetZ: 80,
    bossAt: entrance, deadline, boss: { x: 0, z: 86, hp: bossHealth, max: bossHealth, aligned: false }, drone: false,
    lastHit: -Infinity, lastSpark: -Infinity, lastUpdate: -Infinity,
  };
}

function unlockAudio() {
  if (!sound) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!audio) {
      audio = new AudioContext();
      output = audio.createDynamicsCompressor();
      output.threshold.value = -19;
      output.ratio.value = 4;
      output.connect(audio.destination);
    }
    if (audio.state !== 'running') audio.resume().catch(() => {});
  } catch {
    sound = false;
    displaySound();
  }
}

function displaySound() {
  soundButton.setAttribute('aria-pressed', String(sound));
  soundButton.textContent = sound ? '効果音 ON' : '効果音 OFF';
}

function tone(frequency, duration = .105, volume = .085, delay = 0, type = 'triangle') {
  if (!sound || audio?.state !== 'running') return;
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const envelope = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(47, frequency * .78), start + duration);
  envelope.gain.setValueAtTime(.0001, start);
  envelope.gain.exponentialRampToValueAtTime(volume, start + .008);
  envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
  osc.connect(envelope).connect(output);
  osc.start(start);
  osc.stop(start + duration);
  osc.onended = () => { osc.disconnect(); envelope.disconnect(); };
}

function cue(kind) {
  if (kind === 'small' || kind === 'crew') {
    if (game.time < nextSound) return;
    nextSound = game.time + .085;
    tone(kind === 'small' ? 625 + game.units % 5 * 46 : 510, .10);
    if (kind === 'crew') tone(805, .141, .062, .035);
  } else if (kind === 'hit') {
    tone(109, .19, .14);
    tone(267, .092, .06, 0, 'square');
  } else if (kind === 'win') {
    [523, 659, 784, 1047].forEach((note, index) => tone(note, .26, .09, index * .085));
  } else if (kind === 'loss') {
    tone(190, .24, .08);
    tone(109, .26, .055, .075);
  } else {
    tone(440, .17, .10);
    tone(880, .18, .065, .06);
  }
}

function burst(x, z, color, label = '', count = 16) {
  const p = view.project(x, z);
  if (label) game.effects.push({ x: p.x, y: p.y - 32, vx: 0, vy: -45, life: .86, duration: .86, text: label, size: 22, color });
  if (view.reduced.matches) return;
  for (let i = 0; i < count && game.effects.length < 155; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 150;
    const life = .24 + Math.random() * .22;
    game.effects.push({ x: p.x, y: p.y - 15, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life, duration: life, size: 2.3 + Math.random() * 3.5, color });
  }
}

function reward(item) {
  item.taken = true;
  if (item.kind === 'shield') {
    game.shield = 1;
    game.score += 300;
    burst(item.x, 5, '#a9ffd6', 'シールド');
    say('シールドが次の直撃を一度防ぎます。');
  } else if (item.kind === 'drone') {
    game.ammo += 7;
    game.score += 520;
    burst(item.x, 5, '#ffe5a0', 'ドローン装填', 28);
    say('ドローン装填。ボス戦で7秒間、火力が上がります。');
  } else {
    const added = Math.min(item.amount, maximum - game.units);
    game.units += added;
    game.score += item.amount * 42;
    burst(item.x, 5, '#8affef', added ? `+${added}` : 'MAX', item.kind === 'small' ? 10 : 26);
    if (item.kind === 'crew') say(`増援 +${added}。赤い帯を見たら横へ避けよう。`);
  }
  cue(item.kind);
}

function attack(attackRow) {
  if (game.time - game.lastHit < .2) return;
  const spread = .055 + Math.min(.15, game.units * .0025);
  if (Math.abs(game.x - attackRow.x) >= attackRow.half + spread) return;
  game.lastHit = game.time;
  if (game.shield) {
    game.shield = 0;
    burst(game.x, 5, '#a9ffdc', 'ガード', 24);
    cue('shield');
    say('シールドで攻撃を防ぎました。');
    return;
  }
  const loss = Math.min(game.units, attackRow.damage);
  game.units -= loss;
  burst(game.x, 5, '#ff9f97', `−${loss}`, 30);
  cue('hit');
  say(`赤い攻撃帯に直撃。機体 −${loss}。`);
  if (game.units === 0) finish(false, '赤い攻撃帯に当たり、機体が全滅しました。');
}

function move(dt) {
  const direction = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  if (direction) game.aim = clamp(game.aim + direction * 2.6 * dt, -.84, .84);
  game.x += clamp(game.aim - game.x, -3.7 * dt, 3.7 * dt);
}

function resolveRows(dt) {
  for (const row of game.rows) {
    if (row.done) continue;
    const until = row.at - game.time;
    const crate = row.options.find(item => item.kind === 'drone');
    if (crate && until <= 2.65 && until >= 0 && Math.abs(crate.x - game.x) < .28) {
      const activeDrone = game.ammo > 0 && game.time >= entrance;
      crate.hp -= game.units * (activeDrone ? 3.5 : 2.65) * dt;
      game.targetZ = 5 + until * 13;
      game.targetX = crate.x;
      if (game.time - game.lastSpark > .11) {
        game.lastSpark = game.time;
        burst(crate.x, game.targetZ, '#d5f8ff', '', 4);
      }
      if (crate.hp <= 0) {
        reward(crate);
        row.done = true;
        continue;
      }
    }
    if (until > 0) continue;
    const chosen = row.options.find(item => item.kind !== 'drone' && Math.abs(item.x - game.x) <= .30);
    if (chosen) reward(chosen);
    else if (crate && Math.abs(crate.x - game.x) <= .30) say('ドローン箱を開けられず通過。手前から射線を合わせよう。');
    row.done = true;
  }
}

function fightBoss(dt) {
  const bossTime = game.time - entrance;
  game.boss.z = 19 + Math.max(0, 1 - bossTime) * 6;
  game.boss.x = Math.sin(bossTime * .77) * .62;
  game.targetX = game.boss.x;
  game.targetZ = game.boss.z;
  game.drone = game.ammo > 0;
  if (game.drone) game.ammo = Math.max(0, game.ammo - dt);
  const aligned = game.boss.aligned = Math.abs(game.x - game.boss.x) < .32;
  const scale = (aligned ? 3.05 : 1.31) * (game.drone ? 1.85 : 1);
  const damage = Math.min(game.boss.hp, game.units * scale * dt);
  game.boss.hp -= damage;
  game.score += damage * 1.38;
  if (aligned && game.time - game.lastSpark > .10) {
    game.lastSpark = game.time;
    burst(game.boss.x, game.boss.z, '#94eeff', '', game.drone ? 9 : 4);
  }
  if (game.boss.hp <= 0) finish(true);
}

function tick(dt) {
  if (state !== 'play') return;
  game.time += dt;
  game.travel = game.time < entrance ? game.time : entrance;
  move(dt);
  game.firing = true;
  game.targetX = game.x;
  game.targetZ = 95;
  game.warnings = game.attacks.filter(row => row.at - game.time <= 1.14 && row.at - game.time > -.23);
  for (const row of game.warnings) {
    if (!row.resolved && game.time >= row.at) {
      row.resolved = true;
      attack(row);
      if (state !== 'play') return;
    }
  }
  resolveRows(dt);
  if (game.time >= entrance) {
    if (game.time - dt < entrance) say('ボス戦。赤い帯を避けながら、光るコアに射線を合わせよう。');
    fightBoss(dt);
  } else {
    game.boss.z = 19 + (entrance - game.time) * 2.4;
  }
  if (state === 'play' && game.time >= deadline) finish(false, '時間切れ。増援を集め、ボスのコアに射線を合わせよう。');
  stepEffects(dt);
  if (game.time - game.lastUpdate >= .10) {
    game.lastUpdate = game.time;
    updateHud();
  }
}

function stepEffects(dt) {
  for (const effect of game.effects) {
    effect.life -= dt;
    effect.x += effect.vx * dt;
    effect.y += effect.vy * dt;
  }
  game.effects = game.effects.filter(effect => effect.life > 0);
}

function updateHud() {
  game.power = Math.round(game.units * (game.drone ? 1.85 : 1));
  hud.units.textContent = game.units;
  hud.power.textContent = game.power;
  hud.score.textContent = normalize.format(Math.floor(game.score));
  hud.best.textContent = normalize.format(best);
  progress.value = Math.min(100, game.time / entrance * 100);
  pauseButton.disabled = state !== 'play';
}

function openPanel(heading, text, action) {
  title.textContent = heading;
  description.textContent = text;
  startButton.textContent = action;
  overlay.hidden = false;
  title.focus({ preventScroll: true });
}

function finish(won, reason) {
  state = won ? 'victory' : 'defeat';
  keys.clear();
  pointer = null;
  game.firing = false;
  if (won) {
    game.score += game.units * 90 + Math.max(0, deadline - game.time) * 56;
    burst(game.boss.x, game.boss.z, '#ffe8ae', '撃破', 54);
  }
  const score = Math.floor(game.score);
  if (score > best) {
    best = score;
    store(bestKey, best);
  }
  updateHud();
  const info = won ? `${game.time.toFixed(1)}秒 · 生存 ${game.units}機 · ${normalize.format(score)}点` : `${reason} ${normalize.format(score)}点`;
  openPanel(won ? '巨像撃破！' : '作戦終了', info, 'もう一度出撃');
  say(won ? '海上橋を突破しました。' : reason);
  cue(won ? 'win' : 'loss');
}

function start() {
  const resuming = state === 'paused';
  if (!resuming) {
    game = createRun();
    nextSound = 0;
  }
  unlockAudio();
  state = 'play';
  last = undefined;
  accumulator = 0;
  overlay.hidden = true;
  updateHud();
  say(resuming ? '作戦再開。' : '青いゲートで増援。赤い帯の外へ避けよう。');
  board.focus({ preventScroll: true });
}

function pause() {
  if (state !== 'play') return;
  state = 'paused';
  keys.clear();
  pointer = null;
  openPanel('一時停止', '部隊とボスの状況を保ったまま再開できます。', '再開');
  updateHud();
  say('作戦を一時停止しました。');
}

function point(event) {
  const rect = board.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width * board.width;
  const center = view.project(0, 5).x;
  game.aim = clamp((x - center) / (view.project(1, 5).x - center), -.84, .84);
}

function frame(now) {
  const dt = last === undefined ? 0 : Math.min((now - last) / 1000, .046);
  if (state === 'play') {
    accumulator += dt;
    while (accumulator >= fixedStep) {
      tick(fixedStep);
      accumulator -= fixedStep;
    }
    view.draw(game);
  } else if ((state === 'victory' || state === 'defeat') && game.effects.length) {
    stepEffects(dt);
    view.draw(game);
  }
  last = now;
  requestAnimationFrame(frame);
}

startButton.addEventListener('click', start);
pauseButton.addEventListener('click', pause);
soundButton.addEventListener('click', () => {
  sound = !sound;
  store(muteKey, sound ? 'on' : 'off');
  displaySound();
  unlockAudio();
  if (sound) tone(520);
});

board.addEventListener('pointerdown', event => {
  if (state !== 'play' || !event.isPrimary || event.button !== 0) return;
  pointer = event.pointerId;
  board.setPointerCapture(pointer);
  board.focus({ preventScroll: true });
  point(event);
});
board.addEventListener('pointermove', event => {
  if (state === 'play' && (pointer === event.pointerId || event.pointerType === 'mouse')) point(event);
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  board.addEventListener(name, event => {
    if (pointer === event.pointerId) pointer = null;
  });
}
board.addEventListener('touchstart', event => event.preventDefault(), { passive: false });
for (const name of ['selectstart', 'contextmenu']) document.addEventListener(name, event => event.preventDefault());

document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (state === 'play' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    keys.add(event.key);
  }
  if (event.key === 'Escape') pause();
});
document.addEventListener('keyup', event => keys.delete(event.key));
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

game = createRun();
displaySound();
updateHud();
view.draw(game);
requestAnimationFrame(frame);
