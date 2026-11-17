'use strict';

const board = document.querySelector('#board');
const view = new BridgeView(board);
const overlay = document.querySelector('#overlay');
const title = document.querySelector('#overlay-title');
const description = document.querySelector('#overlay-copy');
const startButton = document.querySelector('#start');
const pulseButton = document.querySelector('#pulse');
const pauseButton = document.querySelector('#pause');
const soundButton = document.querySelector('#sound');
const status = document.querySelector('#status');
const stageLabel = document.querySelector('#stage');
const progress = document.querySelector('#run-progress');
const hud = Object.fromEntries(['units', 'chain', 'score', 'best'].map(id => [id, document.getElementById(id)]));
const maximum = 48;
const fixedStep = 1 / 120;
const bestKey = 'pulse-bridge-best-v3';
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
let finishDelay = 0;
let checkpoint;

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

function course(stage) {
  const gate = (at, ...options) => ({ at, options });
  const crew = (x, size) => option(x, 'crew', size);
  const shield = x => option(x, 'shield', 1);
  const drone = x => option(x, 'drone', stage === 1 ? 74 : 94);
  const rail = (begin, x, length) => Array.from({ length }, (_, i) => gate(begin + i * .27, option(x, 'small', 1)));
  const rows = stage === 1 ? [
    gate(1, crew(0, 5)), gate(3, crew(-.67, 6), shield(.67)),
    ...rail(5.2, .67, 6), gate(8, crew(-.67, 8), shield(.67)),
    gate(12.6, crew(0, 7)), gate(15.5, crew(-.67, 8), drone(.67)),
    ...rail(17, .67, 5), gate(21, crew(0, 6), shield(.67)),
  ] : [
    gate(1, crew(-.67, 5), shield(.67)), ...rail(3.8, .67, 5),
    gate(7.2, crew(.67, 8), shield(-.67)), gate(11, crew(0, 6)),
    gate(14.8, crew(-.67, 9), drone(.67)), ...rail(17.5, -.67, 5),
    gate(21, shield(0), crew(.67, 7)), gate(24, crew(0, 5)),
  ];
  const waves = stage === 1 ? [
    [1.4, -.63, 'gunner'], [4.3, .62, 'gunner'], [6.5, .04, 'mortar'],
    [9.9, -.70, 'ram'], [12.1, .67, 'gunner'], [14.8, -.66, 'mortar'],
    [17.6, 0, 'ram'], [19.1, .64, 'gunner'],
  ] : [
    [.9, .67, 'mortar'], [2, -.64, 'gunner'], [4.6, 0, 'ram'],
    [6.4, -.67, 'mortar'], [7.3, .67, 'gunner'], [9.5, .50, 'ram'],
    [11.5, .65, 'mortar'], [13.9, -.65, 'ram'], [15.1, -.67, 'gunner'],
    [17, .67, 'mortar'], [19.1, -.54, 'ram'], [21.2, 0, 'mortar'],
  ];
  const hp = { gunner: 100, mortar: 138, ram: 195 };
  const enemies = waves.map(([at, x, kind]) => ({
    at, x, kind, hp: hp[kind] + (stage - 1) * 47, maxHp: hp[kind] + (stage - 1) * 47,
    z: 64, nextAttack: at + 1.14, gone: false,
  }));
  return { rows, enemies };
}

function createRun(stage = 1, carry = {}) {
  const { rows, enemies } = course(stage);
  const bossAt = stage === 1 ? 23 : 26;
  return {
    stage, time: 0, travel: 0, x: 0, aim: 0, units: carry.units ?? 8, power: 8,
    score: carry.score ?? 0, shield: 0, ammo: 0, kills: 0, bossVolley: 0,
    rows, enemies, warnings: [], effects: [], firing: false, targetX: 0, targetZ: 80,
    bossAt, deadline: bossAt + (stage === 1 ? 27 : 33), boss: null, drone: false,
    charge: carry.charge ?? 64, chain: 0, peak: carry.peak ?? 0, rings: [], shot: null, impact: 0,
    breakUntil: 0, lastDodge: -Infinity, lastHit: -Infinity, lastSpark: -Infinity, lastUpdate: -Infinity,
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
  } else if (kind === 'dodge') {
    tone(261.63, .13, .12, 0, 'square');
    tone(783.99, .17, .095, .025);
  } else if (kind === 'pulse') {
    tone(58, .46, .32, 0, 'sawtooth');
    tone(147, .35, .19, .025, 'square');
    [392, 523, 659, 784].forEach((note, index) => tone(note, .27, .12, index * .052));
  } else if (kind === 'enemy') {
    tone(126, .18, .145, 0, 'sawtooth');
    tone(698, .14, .095, .035);
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

function burst(x, z, color, label = '', count = 16, lift = 15) {
  const p = view.project(x, z);
  if (label) game.effects.push({ x: p.x, y: p.y - lift - 17, vx: 0, vy: -45, life: .86, duration: .86, text: label, size: 22, color });
  if (view.reduced.matches) return;
  for (let i = 0; i < count && game.effects.length < 155; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 150;
    const life = .24 + Math.random() * .22;
    game.effects.push({ x: p.x, y: p.y - lift, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life, duration: life, size: 2.3 + Math.random() * 3.5, color });
  }
}

function ring(x, z, color, size, lift = 15) {
  const p = view.project(x, z);
  game.rings.push({ x: p.x, y: p.y - lift, color, size, life: .48, duration: .48 });
}

function addCharge(amount) {
  const wasReady = game.charge === 100;
  game.charge = Math.min(100, game.charge + amount);
  if (!wasReady && game.charge === 100) {
    tone(659, .13, .11);
    tone(988, .21, .10, .065);
  }
}

function damageBoss(amount) {
  const damage = Math.min(game.boss.hp, amount);
  game.boss.hp -= damage;
  game.score += damage * 1.38;
}

function firePulse() {
  if (state !== 'play' || game.charge < 100 || game.boss && game.time - game.bossAt < 1) return;
  game.charge = 0;
  game.impact = .38;
  const boss = game.boss;
  const aimed = boss && Math.abs(boss.x - game.x) < .31;
  const x = aimed ? boss.x : game.x;
  const z = boss ? boss.z : 62;
  const end = view.project(x, z);
  game.shot = { from: view.project(game.x, 5), end, lift: boss ? 86 * end.s : 0, life: .46 };
  cue('pulse');
  ring(x, z, '#ffca62', 150, game.shot.lift);
  if (boss) {
    const damage = aimed ? 410 + game.units * 6 : 0;
    damageBoss(damage);
    if (aimed) game.breakUntil = game.time + 3;
    burst(x, z, '#ffda78', aimed ? `装甲破壊 −${damage}` : 'コアを外した', aimed ? 72 : 22, game.shot.lift);
    say(aimed ? '装甲破壊。3秒間、射撃ダメージが2倍！' : 'コアと同じレーンからパルス砲を撃とう。');
    if (boss.hp <= 0) finish(true);
  } else {
    const targets = game.enemies.filter(enemy => activeEnemy(enemy) && Math.abs(enemy.x - game.x) < .55);
    for (const enemy of targets) damageEnemy(enemy, enemy.hp);
    const canceled = game.warnings.filter(warning => warning.at > game.time && Math.abs(warning.x - game.x) < .55);
    game.warnings = game.warnings.filter(warning => !canceled.includes(warning));
    burst(game.x, 5, '#ffe7a0', targets.length ? `${targets.length}機を撃破！` : 'パルス砲', 48);
    if (canceled.length) say('パルス砲で前方の攻撃を相殺。');
  }
  updateHud();
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
  addCharge(item.kind === 'small' ? 2 : 7);
  cue(item.kind);
}

function squadSpread(units) {
  return .048 + Math.min(.082, units * .002);
}

function clearance(attack) {
  return Math.abs(game.x - attack.x) - attack.half - squadSpread(game.units);
}

function announceAttack(x, half, damage, delay, source, kind) {
  game.warnings.push({
    x, half, damage, source, kind, at: game.time + delay, duration: delay,
    innerX: null, resolved: false,
  });
  tone(kind === 'ram' ? 164 : 310, .13, .07, 0, 'square');
}

function resolveAttacks() {
  game.warnings = game.warnings.filter(attack => attack.at + .26 > game.time);
  const incoming = [];
  for (const warning of game.warnings) {
    if (warning.resolved) continue;
    if (game.time >= warning.at) incoming.push(warning);
    else if (warning.at - game.time <= .46 && warning.innerX === null && clearance(warning) < 0) {
      warning.innerX = game.x;
    }
  }
  // One impact per volley, with hits taking precedence over any other strip.
  const hit = incoming.find(warning => clearance(warning) < 0);
  for (const warning of incoming) warning.resolved = true;
  if (hit) {
    if (game.time - game.lastHit >= .18) takeHit(hit);
    return;
  }
  const dodge = incoming.find(warning => warning.innerX !== null
    && Math.abs(game.x - warning.innerX) >= .16 && clearance(warning) < .26);
  if (dodge && game.time - game.lastDodge >= .20) rewardDodge(dodge);
}

function rewardDodge(warning) {
  game.lastDodge = game.time;
  game.chain++;
  game.peak = Math.max(game.peak, game.chain);
  game.score += 180 * Math.min(game.chain, 8);
  addCharge(22);
  game.impact = Math.max(game.impact, .14);
  ring(game.x, 5, '#85fff2', 77);
  burst(game.x, 5, '#a4fff2', `ギリ避け ×${game.chain}`, 32);
  const target = warning.source;
  if (target?.hp > 0 && !target.gone) {
    if (target === game.boss) damageBoss(48 + Math.min(game.chain, 8) * 7);
    else damageEnemy(target, 65);
    const end = view.project(target.x, target.z);
    if (!game.shot) game.shot = { from: view.project(game.x, 5), end, lift: (target === game.boss ? 86 : 27) * end.s, life: .30, counter: true };
  }
  cue('dodge');
  say('ギリ避け成功。反撃してパルス充填！');
}

function takeHit(attack) {
  game.lastHit = game.time;
  game.impact = Math.max(game.impact, .24);
  game.chain = 0;
  ring(attack.x, 5, '#ff795e', 95);
  if (game.shield) {
    game.shield = 0;
    burst(game.x, 5, '#a9ffdc', 'ガード', 24);
    cue('shield');
    say('シールドで攻撃を防ぎました。');
    return;
  }
  const loss = Math.min(game.units, attack.damage);
  game.units -= loss;
  const lostCharge = Math.min(14, Math.floor(game.charge));
  game.charge = Math.max(0, game.charge - 14);
  burst(game.x, 5, '#ff9f97', `機体 −${loss}`, 46);
  cue('hit');
  say(`${attack.kind === 'contact' ? '敵と接触' : '直撃'}。機体 −${loss}、パルス −${lostCharge}%。`);
  if (game.units === 0) finish(false, '部隊が全滅しました。');
}

function activeEnemy(enemy) {
  return !enemy.gone && game.time >= enemy.at;
}

function damageEnemy(enemy, damage) {
  enemy.hp -= damage;
  if (enemy.hp > 0) return;
  enemy.gone = true;
  // A fired shell stays live, but destroying the weapon cancels its charge.
  game.warnings = game.warnings.filter(warning => warning.source !== enemy || warning.kind === 'mortar' || warning.resolved);
  game.kills++;
  game.score += enemy.kind === 'ram' ? 530 : 370;
  game.units = Math.min(maximum, game.units + 2);
  addCharge(10);
  burst(enemy.x, enemy.z, '#ffce8a', '撃破 +2機', 26);
  ring(enemy.x, enemy.z, '#ffa95e', 57);
  cue('enemy');
}

function fightWaves(dt) {
  let target;
  for (const enemy of game.enemies) {
    if (!activeEnemy(enemy)) continue;
    const age = game.time - enemy.at;
    enemy.z = enemy.kind === 'ram' ? 62 - age * 15 : 62 - age * 10;
    if (game.time >= enemy.nextAttack) {
      const second = game.stage === 2;
      if (enemy.kind === 'ram') {
        announceAttack(enemy.x, .31, second ? 16 : 12, 1.05, enemy, 'ram');
        enemy.nextAttack = Infinity;
      } else {
        const mortar = enemy.kind === 'mortar';
        announceAttack(mortar ? game.x : enemy.x, mortar ? .32 : .28,
          (mortar ? 13 : 10) + (second ? 4 : 0), mortar ? .91 : .86, enemy, enemy.kind);
        enemy.nextAttack += mortar ? 2.1 : 1.72;
      }
    }
    if (enemy.z <= 5) {
      enemy.gone = true;
      if (Math.abs(enemy.x - game.x) < .22 + squadSpread(game.units) && game.time - game.lastHit >= .18) {
        takeHit({ x: enemy.x, damage: game.stage === 2 ? 13 : 9, kind: 'contact' });
        if (state !== 'play') return;
      }
      continue;
    }
    if (Math.abs(enemy.x - game.x) < (enemy.kind === 'ram' ? .33 : .29) && (!target || enemy.z < target.z)) target = enemy;
  }
  if (target) {
    game.targetX = target.x;
    game.targetZ = target.z;
    damageEnemy(target, (17 + game.units * 4.2) * dt);
    if (game.time - game.lastSpark > .11) {
      game.lastSpark = game.time;
      burst(target.x, target.z, '#b7f7ff', '', 6, 27 * view.project(0, target.z).s);
    }
  }
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
    if (crate && game.targetZ === 95 && until <= 2.65 && until >= 0 && Math.abs(crate.x - game.x) < .28) {
      crate.hp -= game.units * 2.65 * dt;
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

function deployBoss() {
  const second = game.stage === 2;
  const hp = second ? 6500 : 4200;
  game.boss = {
    x: 0, z: 39, hp, max: hp, aligned: false, nextAttack: game.time + 1.2,
    name: second ? '要塞の双砲機' : '橋の巨像', second,
  };
  game.warnings = [];
  game.enemies.forEach(enemy => { enemy.gone = true; });
  say(second ? '双砲機出現。左右の挟撃と、隙間を狙う追撃に注意！' : '巨像出現。光るコアを撃ち、赤い予告が出たら横へ！');
  tone(73, .42, .20, 0, 'sawtooth');
}

function bossAttack(boss, enraged) {
  const n = game.bossVolley++;
  const second = boss.second;
  const damage = (second ? 16 : 12) + (enraged ? 3 : 0);
  if (second && n % 3 === 1) {
    announceAttack(-.72, .26, damage, .87, boss, 'laser');
    announceAttack(.72, .26, damage, .87, boss, 'laser');
    announceAttack(0, .27, damage, 1.51, boss, 'laser');
    boss.nextAttack += enraged ? 1.85 : 2.15;
  } else {
    announceAttack(game.x, second ? .34 : .28, damage, second ? .86 : .99, boss, 'laser');
    if (enraged && n % 2 === 0) {
      const side = game.x > 0 ? -.69 : .69;
      announceAttack(side, .25, damage, 1.55, boss, 'laser');
    }
    boss.nextAttack += second ? 1.69 : enraged ? 1.82 : 2.35;
  }
}

function fightBoss(dt) {
  const boss = game.boss;
  const time = game.time - game.bossAt;
  boss.z = 20 + Math.max(0, 1.1 - time) * 17;
  const enraged = boss.hp < boss.max * .46;
  if (boss.second) {
    const lane = [-.66, .66, 0, .66, -.66, 0][Math.floor(time / (enraged ? 1.43 : 1.92)) % 6];
    boss.x += clamp(lane - boss.x, -1.7 * dt, 1.7 * dt);
  } else {
    boss.x = Math.sin(time * .97) * .65;
  }
  if (game.time >= boss.nextAttack) bossAttack(boss, enraged);
  game.targetZ = boss.z;
  game.drone = game.ammo > 0;
  if (game.drone) game.ammo = Math.max(0, game.ammo - dt);
  const aligned = boss.aligned = Math.abs(game.x - boss.x) < .30;
  game.targetX = aligned ? boss.x : game.x;
  const exposed = game.time < game.breakUntil;
  if (time >= 1 && aligned) {
    damageBoss((10 + game.units * 4.7) * (game.drone ? 1.45 : 1) * (exposed ? 2 : 1) * dt);
    addCharge((6 + Math.min(3, game.units / 15)) * dt);
    if (game.time - game.lastSpark > .10) {
      game.lastSpark = game.time;
      burst(boss.x, boss.z, '#94eeff', '', exposed ? 18 : game.drone ? 9 : 4, 86 * view.project(0, boss.z).s);
    }
  }
}

function tick(dt) {
  if (state !== 'play') return;
  game.time += dt;
  game.travel = Math.min(game.time, game.bossAt);
  move(dt);
  game.firing = true;
  game.targetX = game.x;
  game.targetZ = 95;
  if (game.time >= game.bossAt) {
    if (!game.boss) deployBoss();
    fightBoss(dt);
  } else {
    fightWaves(dt);
    if (state !== 'play') return;
    resolveRows(dt);
  }
  resolveAttacks();
  if (state !== 'play') return;
  if (game.boss?.hp <= 0) {
    finish(true);
    return;
  }
  if (game.time >= game.deadline) {
    finish(false, '時間切れ。パルス砲でコアを割り、装甲が開いている間に撃ち込もう。');
    return;
  }
  stepEffects(dt);
  if (game.time - game.lastUpdate >= .10) {
    game.lastUpdate = game.time;
    updateHud();
  }
}

function stepEffects(dt) {
  game.impact = Math.max(0, game.impact - dt);
  if (game.shot) {
    game.shot.life -= dt;
    if (game.shot.life <= 0) game.shot = null;
  }
  for (const shock of game.rings) shock.life -= dt;
  game.rings = game.rings.filter(shock => shock.life > 0);
  for (const effect of game.effects) {
    effect.life -= dt;
    effect.x += effect.vx * dt;
    effect.y += effect.vy * dt;
  }
  game.effects = game.effects.filter(effect => effect.life > 0);
}

function updateHud() {
  game.power = Math.round(game.units * (game.drone ? 1.45 : 1));
  hud.units.textContent = game.units;
  hud.units.classList.toggle('critical', game.units > 0 && game.units <= 12);
  hud.chain.textContent = `×${game.chain}`;
  const charged = game.charge >= 100;
  pulseButton.disabled = state !== 'play' || !charged || Boolean(game.boss && game.time - game.bossAt < 1);
  pulseButton.textContent = charged ? '⚡ パルス砲 発射' : `パルス砲 ${Math.floor(game.charge)}%`;
  pulseButton.style.setProperty('--charge', `${game.charge}%`);
  hud.score.textContent = normalize.format(Math.floor(game.score));
  hud.best.textContent = normalize.format(best);
  stageLabel.textContent = game.stage === 1 ? '01 / 海上橋' : '02 / 夜の要塞';
  progress.value = Math.min(100, game.time / game.bossAt * 100);
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
  state = won ? (game.stage === 1 ? 'stage-clear' : 'victory') : 'defeat';
  keys.clear();
  pointer = null;
  game.firing = false;
  if (won) {
    finishDelay = .8;
    game.impact = .55;
    ring(game.boss.x, game.boss.z, '#fff1bc', 212, 55);
    ring(game.boss.x, game.boss.z, '#ff8c49', 260, 30);
    game.score += game.units * 90 + Math.max(0, game.deadline - game.time) * 56;
    burst(game.boss.x, game.boss.z, '#ffe8ae', '撃破', 88, 62);
  }
  const score = Math.floor(game.score);
  if (score > best) {
    best = score;
    store(bestKey, best);
  }
  updateHud();
  if (!won) {
    ArcadeResult.show({
      kind: 'over',
      title: 'ゲームオーバー',
      summary: `${game.stage}面 · ${reason} ${normalize.format(score)}点`,
      action: game.stage === 2 ? '2面に再挑戦' : 'もう一度出撃',
      onAction: start,
      alternate: game.stage === 2 ? '1面から出撃' : undefined,
      onAlternate: () => {
        state = 'ready';
        start();
      },
    });
  }
  say(won ? (game.stage === 1 ? '海上橋を突破。次は夜の要塞。' : '全2面を突破！') : reason);
  cue(won ? 'win' : 'loss');
}

function start() {
  const resuming = state === 'paused';
  if (!resuming) {
    if (state === 'stage-clear') {
      checkpoint = {
        units: clamp(game.units + 6, 20, 30),
        charge: 48, score: game.score, peak: game.peak,
      };
      game = createRun(2, checkpoint);
    } else if (state === 'defeat' && game.stage === 2) {
      game = createRun(2, checkpoint);
    } else {
      checkpoint = undefined;
      game = createRun();
    }
    nextSound = 0;
    finishDelay = 0;
  }
  unlockAudio();
  state = 'play';
  last = undefined;
  accumulator = 0;
  overlay.hidden = true;
  updateHud();
  say(resuming ? '作戦再開。' : '敵と同じレーンで攻撃。赤い帯の外へ避けよう。');
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
  } else if (state === 'victory' || state === 'stage-clear' || state === 'defeat') {
    if (game.effects.length || game.rings.length || game.shot || game.impact) {
      stepEffects(dt);
      view.draw(game);
    }
    if (finishDelay > 0) {
      finishDelay -= dt;
      if (finishDelay <= 0) {
        const score = normalize.format(Math.floor(game.score));
        const midway = state === 'stage-clear';
        ArcadeResult.show({
          kind: 'clear',
          title: midway ? '1面クリア！' : '全2面クリア！',
          summary: midway
            ? `生存 ${game.units}機 · ${score}点。部隊を補給して夜の要塞へ。`
            : `生存 ${game.units}機 · 最大連鎖 ×${game.peak} · ${score}点`,
          action: midway ? '2面へ' : '1面から出撃',
          onAction: start,
        });
      }
    }
  }
  last = now;
  requestAnimationFrame(frame);
}

startButton.addEventListener('click', () => {
  if (state === 'ready' || state === 'paused') start();
});
pauseButton.addEventListener('click', pause);
pulseButton.addEventListener('click', () => {
  board.focus({ preventScroll: true });
  firePulse();
});
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
  if (state === 'play' && event.code === 'Space' && (event.target === board || event.target === document.body)) {
    event.preventDefault();
    if (!event.repeat) firePulse();
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
