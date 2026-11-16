import { createSurface } from './surfaces.js';
import { WashSound } from './sound.js';

const canvas = document.querySelector('#board');
const ctx = canvas.getContext('2d');
const job = document.querySelector('#job');
const jobNumber = document.querySelector('#job-number');
const percent = document.querySelector('#percent');
const progress = document.querySelector('#progress');
const pressureBar = document.querySelector('#pressure');
const pressureStatus = document.querySelector('#pressure-status');
const burstButton = document.querySelector('#burst');
const burstLabel = burstButton.querySelector('span');
const soundButton = document.querySelector('#sound');
const finish = document.querySelector('#finish');
const finishTitle = document.querySelector('#finish-title');
const finishCopy = document.querySelector('#finish-copy');
const next = document.querySelector('#next');
const status = document.querySelector('#status');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const width = canvas.width;
const height = canvas.height;
const cell = 6;
const cols = Math.ceil(width / cell);
const rows = Math.ceil(height / cell);
const surfaceCanvas = document.createElement('canvas');
surfaceCanvas.width = width;
surfaceCanvas.height = height;
const base = surfaceCanvas.getContext('2d');
const mask = document.createElement('canvas');
mask.width = cols;
mask.height = rows;
const maskCtx = mask.getContext('2d');
const grime = maskCtx.createImageData(cols, rows);
const layers = new Float32Array(cols * rows);
const weights = new Float32Array(layers.length);
const zoneIndex = new Uint8Array(layers.length);
const stainIndex = new Uint8Array(layers.length);
const cursor = { x: width / 2, y: height / 2 };
const keys = new Set();
const wet = [];
const drops = [];
const waves = [];
const completedKey = 'cleaning-room-jobs';
const mutedKey = 'cleaning-room-muted';

const materials = {
  scale: { light: [150, 137, 111], dark: [71, 65, 48], splash: '#f7f4d7', resistance: 1.06 },
  oil: { light: [191, 127, 59], dark: [84, 50, 28], splash: '#eec786', resistance: 1.26 },
  mud: { light: [155, 110, 64], dark: [65, 42, 32], splash: '#c79773', resistance: .9 },
};
const recipes = [
  { name: 'いつもの汚れ', count: 18, spanX: 108, spanY: 82, weight: 1 },
  { name: '油はね・飛び散り', count: 28, spanX: 57, spanY: 53, weight: .84 },
  { name: 'こびりつき', count: 11, spanX: 112, spanY: 91, weight: 1.16 },
  { name: '流れた筋汚れ', count: 22, spanX: 39, spanY: 115, weight: .91 },
];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

let completed = loadCount();
const audio = new WashSound(read(mutedKey) !== '1');
let stage;
let surface;
let zones;
let total;
let remaining;
let dirtyCells;
let stains;
let holdStain;
let heldFor;
let pressure;
let mode;
let finishedAt;
let pointer = null;
let strokeRemainder = 0;
let armed = false;
let aimVisible = false;
let drawingDirty;
let redraw = true;
let announcedPressure = false;
let previousTime = 0;
let latestSpray = 0;
let soundResistance = 0;
let nextImpact = 0;
let nextTrail = 0;
let t = 0;
let shownPercent = -1;

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function loadCount() {
  const value = Number(read(completedKey));
  return Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER - 1 ? value : 0;
}

function save(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Play continues with the current session's progress.
  }
}

function randomFor(seed) {
  let state = seed | 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function makeDirt(seed, recipe) {
  const random = randomFor(seed);
  const spots = Array.from({ length: recipe.count }, () => ({
    x: (random() * .86 + .07) * width,
    y: (random() * .82 + .09) * height,
    sizeX: 24 + random() * recipe.spanX,
    sizeY: 17 + random() * recipe.spanY,
    intensity: .45 + random() * .8,
  }));
  const { light, dark, resistance } = materials[surface.material];
  zones = Array.from({ length: 15 }, (_, i) => ({
    x: (i % 5 + .5) * width / 5, y: (Math.floor(i / 5) + .5) * height / 3, total: 0, remaining: 0, done: false,
  }));
  layers.fill(0);
  weights.fill(0);
  stainIndex.fill(0);
  grime.data.fill(0);
  total = 0;
  dirtyCells = 0;
  stains = [];
  const positions = [];
  for (let y = 110; y <= 265; y += 51) {
    for (let x = 135; x <= 441; x += 51) {
      if (base.isPointInPath(surface.bounds, x, y)) positions.push({ x, y });
    }
  }
  const kinds = stage === 1 ? ['hold', 'beat'] : ['hold', 'beat', stage % 2 ? 'hold' : 'beat'];
  for (const kind of kinds) {
    const index = Math.floor(random() * positions.length);
    const [position] = positions.splice(index, 1);
    stains.push({ ...position, kind, cells: [], hits: 0, pace: 0, lastBeat: -Infinity });
    for (let i = positions.length - 1; i >= 0; i--) {
      if (Math.hypot(positions[i].x - position.x, positions[i].y - position.y) < 85) positions.splice(i, 1);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = (col + .5) * cell;
      const y = (row + .5) * cell;
      if (!base.isPointInPath(surface.bounds, x, y)) continue;
      let stain = 0;
      for (const spot of spots) {
        const distance = ((spot.x - x) / spot.sizeX) ** 2 + ((spot.y - y) / spot.sizeY) ** 2;
        if (distance < 2.5) stain += Math.exp(-distance * 1.65) * spot.intensity;
      }
      stain = clamp(stain * .63 + random() * .2 + Math.sin(x * .08 + y * .035) * .075, 0, 1);
      const special = stains.findIndex((patch) => Math.hypot(x - patch.x, y - patch.y) < 23);
      if (special >= 0) stain = Math.max(.79, stain);
      if (stain < .17) continue;
      const i = row * cols + col;
      const region = Math.floor(x * 5 / width) + Math.floor(y * 3 / height) * 5;
      const weight = (.28 + stain * 1.16) * resistance * recipe.weight;
      const tint = clamp((stain - .16) * 1.1 + random() * .3, 0, 1);
      layers[i] = weight;
      weights[i] = layers[i];
      zoneIndex[i] = region;
      zones[region].total += layers[i];
      total += layers[i];
      dirtyCells += 1;
      if (special >= 0) {
        stainIndex[i] = special + 1;
        stains[special].cells.push(i);
      }
      for (let channel = 0; channel < 3; channel++) {
        grime.data[i * 4 + channel] = light[channel] + (dark[channel] - light[channel]) * tint + random() * 10;
      }
      grime.data[i * 4 + 3] = alpha(weight, weight);
    }
  }
  for (const zone of zones) zone.remaining = zone.total;
  remaining = total;
  drawingDirty = true;
}

function alpha(left, weight) {
  return Math.round((.39 + Math.min(1, weight) * .6) * (left / weight) ** .70 * 255);
}

function say(text) {
  if (status.textContent !== text) status.textContent = text;
}

function update() {
  const percentage = mode === 'work' ? Math.min(99, Math.floor(100 * (1 - remaining / total))) : 100;
  if (shownPercent !== percentage) {
    shownPercent = percentage;
    percent.firstChild.data = String(percentage);
    progress.value = percentage;
  }
  if (pressureBar.value !== pressure) pressureBar.value = pressure;
  const ready = pressure >= 100 && mode === 'work';
  if (burstButton.disabled === ready) burstButton.disabled = !ready;
  const state = armed ? '噴射待機中' : ready ? '満タン' : mode === 'work' ? '蓄圧中' : '洗浄完了';
  if (pressureStatus.textContent !== state) pressureStatus.textContent = state;
  if (ready && !announcedPressure) {
    announcedPressure = true;
    say('水圧満タン。強力噴射を選び、落としたい場所を押そう。');
    audio.chime();
  }
}

function armBurst(value) {
  armed = value;
  burstButton.setAttribute('aria-pressed', String(value));
  burstLabel.textContent = value ? '待機を解除' : '強力噴射';
  redraw = true;
}

function setSoundLabel() {
  soundButton.setAttribute('aria-pressed', String(audio.enabled));
  soundButton.textContent = audio.enabled ? '効果音 ON' : '効果音 OFF';
}

function loadJob() {
  stage = completed + 1;
  mode = 'work';
  pressure = 0;
  armBurst(false);
  announcedPressure = false;
  pressureBar.value = 0;
  wet.length = drops.length = waves.length = 0;
  keys.clear();
  pointer = null;
  holdStain = undefined;
  heldFor = 0;
  aimVisible = false;
  cursor.x = width / 2;
  cursor.y = height / 2;
  latestSpray = 0;
  soundResistance = 0;
  surface = createSurface(base, stage);
  const recipe = recipes[(stage - 1 + Math.floor(stage / 7)) % recipes.length];
  makeDirt(Math.floor(Math.random() * 4294967296) ^ stage, recipe);
  jobNumber.textContent = `依頼 ${String(stage).padStart(2, '0')} · ${recipe.name}`;
  job.textContent = surface.name;
  finish.hidden = true;
  canvas.tabIndex = 0;
  say('普通の汚れはなぞるだけ。マーク付きは長押し、または3拍で落とそう。');
  update();
}

function sprinkle(x, y, count, color, velocity = 110) {
  if (reduced.matches) count = Math.min(count, 3);
  for (let i = 0; i < count && drops.length < 360; i++) {
    const angle = Math.random() * Math.PI * 2;
    const power = (.35 + Math.random() * .65) * velocity;
    const life = .18 + Math.random() * .33;
    drops.push({
      x, y, vx: Math.cos(angle) * power, vy: Math.sin(angle) * power,
      life, maxLife: life, size: 1.4 + Math.random() * (surface.material === 'mud' ? 4.5 : 3),
      color: i % 3 ? color : '#efffff',
    });
  }
}

function detectZones(touched) {
  let cleared = false;
  for (const id of touched) {
    const zone = zones[id];
    if (zone.done || zone.total < 8 || zone.remaining > .0001) continue;
    zone.done = true;
    waves.push({ x: zone.x, y: zone.y, started: t, length: .42, radius: 50, kind: 'zone' });
    sprinkle(zone.x, zone.y, 12, '#a0f9df', 84);
    cleared = true;
  }
  if (cleared && t > nextImpact) {
    nextImpact = t + .18;
    audio.chime();
  }
}

function removeDirt(i, force, touched) {
  const before = layers[i];
  const after = before - force;
  layers[i] = after < .025 ? 0 : after;
  if (layers[i] === 0) dirtyCells -= 1;
  const change = before - layers[i];
  const zone = zoneIndex[i];
  zones[zone].remaining -= change;
  touched.add(zone);
  grime.data[i * 4 + 3] = alpha(layers[i], weights[i]);
  return change;
}

function recordWash(removed, touched) {
  if (removed <= 0) return;
  remaining = Math.max(0, remaining - removed);
  pressure = Math.min(100, pressure + removed / total * 410);
  drawingDirty = true;
  detectZones(touched);
}

function wash(x, y, radius, strength) {
  const lowX = Math.max(0, Math.floor((x - radius) / cell));
  const highX = Math.min(cols - 1, Math.floor((x + radius) / cell));
  const lowY = Math.max(0, Math.floor((y - radius) / cell));
  const highY = Math.min(rows - 1, Math.floor((y + radius) / cell));
  let removed = 0;
  const touched = new Set();
  for (let row = lowY; row <= highY; row++) {
    for (let col = lowX; col <= highX; col++) {
      const i = row * cols + col;
      if (!layers[i] || stainIndex[i]) continue;
      const distance = Math.hypot((col + .5) * cell - x, (row + .5) * cell - y) / radius;
      if (distance >= 1) continue;
      removed += removeDirt(i, strength * (1 - distance * distance * .89), touched);
    }
  }
  recordWash(removed, touched);
  return removed;
}

function stainAtCursor() {
  return stains.find((patch) => patch.cells.length && Math.hypot(cursor.x - patch.x, cursor.y - patch.y) <= 30);
}

function clearStain(patch) {
  const touched = new Set();
  let removed = 0;
  for (const i of patch.cells) removed += removeDirt(i, layers[i], touched);
  patch.cells.length = 0;
  recordWash(removed, touched);
  sprinkle(patch.x, patch.y, 34, materials[surface.material].splash, 190);
  waves.push({ x: patch.x, y: patch.y, started: t, length: .48, radius: 51, kind: 'burst' });
  audio.burst();
  say(patch.kind === 'hold' ? 'こびりつきが一気に剥がれた！' : 'リズム成功。汚れが一気に弾けた！');
}

function updateHold(elapsed) {
  const target = stainAtCursor();
  if (target !== holdStain) heldFor = 0;
  holdStain = target?.kind === 'hold' ? target : undefined;
  if (!holdStain) return;
  heldFor += elapsed;
  if (heldFor >= .7) {
    clearStain(holdStain);
    holdStain = undefined;
    heldFor = 0;
  } else {
    say('こびりつき。その場で0.7秒押し続けると剥がれます。');
  }
}

function tapStain() {
  const patch = stainAtCursor();
  if (patch?.kind !== 'beat') return;
  const now = performance.now() / 1000;
  const interval = now - patch.lastBeat;
  const inTime = interval >= .18 && interval <= .65 &&
    (patch.hits < 2 || Math.abs(interval - patch.pace) <= .16);
  patch.lastBeat = now;
  patch.hits = inTime ? patch.hits + 1 : 1;
  patch.pace = patch.hits === 2 ? interval : 0;
  if (patch.hits === 3) {
    clearStain(patch);
  } else {
    audio.chime();
    say(`リズム汚れ ${patch.hits}/3。同じ場所を一定の間隔でトン、トン、トン。`);
  }
}

function samePointWash(x, y, elapsed) {
  const removed = wash(x, y, 28, 14 * elapsed);
  const effect = Math.min(1, removed / 16);
  soundResistance = Math.max(soundResistance, effect);
  if (removed > .2) audio.impact(surface.material, effect);
  if (t >= nextTrail) {
    nextTrail = t + .028;
    if (wet.length < 80) wet.push({ x, y, life: .26 });
    sprinkle(x, y, removed > .3 ? 5 : 2, removed > .3 ? materials[surface.material].splash : '#9fe7e8', 100);
  }
}

function washStroke(x, y) {
  const distance = Math.hypot(x - cursor.x, y - cursor.y);
  if (distance > 0) {
    const spacing = 9;
    const strength = .32 + (surface.material === 'mud' ? .06 : 0);
    let byPath = 0;
    for (let travel = spacing - strokeRemainder; travel <= distance; travel += spacing) {
      const a = travel / distance;
      const px = cursor.x + (x - cursor.x) * a;
      const py = cursor.y + (y - cursor.y) * a;
      byPath += wash(px, py, 27, strength);
    }
    strokeRemainder = (strokeRemainder + distance) % spacing;
    if (byPath > 1) sprinkle(x, y, 4, materials[surface.material].splash);
    soundResistance = Math.max(soundResistance, Math.min(1, byPath / 35));
    if (byPath > 1) audio.impact(surface.material, soundResistance);
  }
  cursor.x = x;
  cursor.y = y;
  redraw = true;
  latestSpray = t + .045;
}

function commitWash() {
  if (mode !== 'work') return;
  if (dirtyCells === 0) finishJob();
  update();
}

function burst() {
  if (mode !== 'work' || pressure < 100) return;
  audio.unlock();
  pressure = 0;
  armBurst(false);
  announcedPressure = false;
  aimVisible = true;
  const { x, y } = cursor;
  const removed = wash(x, y, 92, 5);
  waves.push({ x, y, started: t, length: .58, radius: 103, kind: 'burst' });
  for (let ring = 0; ring < 5; ring++) {
    const angle = ring * Math.PI * 2 / 5;
    sprinkle(x + Math.cos(angle) * 23, y + Math.sin(angle) * 23, 16, '#87eee2', 275);
  }
  latestSpray = t + .12;
  audio.burst();
  say(removed ? '強力噴射で汚れが一気に落ちた。' : 'この場所に強力噴射で落とせる汚れはありません。');
  commitWash();
}

function stopInput() {
  if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  pointer = null;
  keys.clear();
  holdStain = undefined;
  heldFor = 0;
  latestSpray = 0;
  audio.spray(false);
}

function finishJob() {
  mode = 'polish';
  pressure = 0;
  armBurst(false);
  finishedAt = t;
  completed += 1;
  save(completedKey, completed);
  stopInput();
  canvas.tabIndex = -1;
  audio.chime(true);
  say('仕上げ完了！');
}

function animate(dt) {
  t += dt;
  if (mode === 'work') {
    const clock = performance.now() / 1000;
    for (const patch of stains) {
      if (patch.cells.length && patch.kind === 'beat' && patch.hits && clock - patch.lastBeat > .65) {
        patch.hits = 0;
        redraw = true;
      }
    }
    const dx = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
    const dy = Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'));
    const shooting = pointer !== null || keys.has('Space');
    if (dx || dy) {
      aimVisible = true;
      redraw = true;
      const stride = (dx && dy ? .707 : 1) * dt * 245;
      cursor.x = clamp(cursor.x + dx * stride, 0, width);
      cursor.y = clamp(cursor.y + dy * stride, 0, height);
    }
    if (shooting) {
      latestSpray = t + .04;
      samePointWash(cursor.x, cursor.y, dt);
      updateHold(dt);
      commitWash();
    } else {
      holdStain = undefined;
      heldFor = 0;
    }
    audio.spray(mode === 'work' && shooting, soundResistance);
    soundResistance = Math.max(0, soundResistance - dt * 4);
  } else if (mode === 'polish' && t - finishedAt >= (reduced.matches ? .12 : .82)) {
    mode = 'complete';
    finishCopy.textContent = `これまでに ${completed.toLocaleString('ja-JP')} 件きれいにしました。`;
    finish.hidden = false;
    redraw = true;
    finishTitle.focus({ preventScroll: true });
  }
  for (let i = drops.length - 1; i >= 0; i--) {
    const drop = drops[i];
    drop.life -= dt;
    if (drop.life <= 0) {
      drops.splice(i, 1);
      continue;
    }
    drop.x += drop.vx * dt;
    drop.y += drop.vy * dt;
    drop.vy += dt * 220;
    drop.vx *= Math.pow(.25, dt);
  }
  for (let i = wet.length - 1; i >= 0; i--) {
    wet[i].life -= dt;
    if (wet[i].life <= 0) wet.splice(i, 1);
  }
  for (let i = waves.length - 1; i >= 0; i--) {
    if (t - waves[i].started > waves[i].length) waves.splice(i, 1);
  }
}

function ring(x, y, radius, color, line = 2) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = color;
  ctx.lineWidth = line;
  ctx.stroke();
}

function drawStains() {
  if (remaining / total <= .1) {
    for (let i = 0; i < layers.length; i++) {
      if (!layers[i] || stainIndex[i]) continue;
      const x = (i % cols + .5) * cell;
      const y = (Math.floor(i / cols) + .5) * cell;
      ctx.fillStyle = '#fff8e8';
      ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.fillStyle = '#cf3c22';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }
  for (const patch of stains) {
    if (!patch.cells.length) continue;
    const { x, y, kind } = patch;
    const hold = kind === 'hold';
    const color = hold ? '#ffdb87' : '#f3c5ff';
    ring(x, y, 25, '#322a30', 4);
    ring(x, y, 25, color, 2);
    if (patch === holdStain) {
      ctx.beginPath();
      ctx.arc(x, y, 25, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * heldFor / .7);
      ctx.strokeStyle = '#fff9d5';
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    ctx.fillStyle = '#322a30';
    ctx.fillRect(x - 23, y - 9, 46, 18);
    ctx.fillStyle = color;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hold ? '長押し' : `3拍 ${patch.hits}/3`, x, y);
  }
}

function paint() {
  ctx.drawImage(surfaceCanvas, 0, 0);
  if (drawingDirty) {
    maskCtx.putImageData(grime, 0, 0);
    drawingDirty = false;
  }
  if (mode === 'work') {
    ctx.save();
    ctx.clip(surface.bounds);
    ctx.drawImage(mask, 0, 0, cols * cell, rows * cell);
    ctx.restore();
  }
  if (mode === 'polish' && !reduced.matches) {
    const x = (t - finishedAt) * 850 - 65;
    ctx.save();
    ctx.clip(surface.bounds);
    ctx.translate(x, height / 2);
    ctx.rotate(.39);
    const beam = ctx.createLinearGradient(-44, 0, 44, 0);
    beam.addColorStop(0, '#e6ffed00');
    beam.addColorStop(.5, '#ffffffed');
    beam.addColorStop(1, '#e6ffed00');
    ctx.fillStyle = beam;
    ctx.fillRect(-44, -height, 88, height * 2);
    ctx.restore();
  }
  ctx.save();
  ctx.clip(surface.bounds);
  for (const mark of wet) {
    ctx.globalAlpha = mark.life * .64;
    ring(mark.x, mark.y, 12 + (.26 - mark.life) * 43, '#e8ffff', 3);
  }
  ctx.restore();
  for (const wave of waves) {
    const fraction = clamp((t - wave.started) / wave.length, 0, 1);
    ctx.globalAlpha = (1 - fraction) * .95;
    const r = 10 + wave.radius * (1 - (1 - fraction) ** 2);
    ring(wave.x, wave.y, r, wave.kind === 'burst' ? '#eaffff' : '#f6fff1', wave.kind === 'burst' ? 5 : 2);
    if (wave.kind === 'burst') {
      ring(wave.x, wave.y, r * .74, '#8bffff', 3);
      if (!reduced.matches) {
        ctx.globalAlpha *= .55;
        ring(wave.x, wave.y, r * 1.18, '#adfff3', 2);
        ctx.fillStyle = '#e2fff6';
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, r * .57, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }
  for (const drop of drops) {
    ctx.globalAlpha = drop.life / drop.maxLife;
    ctx.fillStyle = drop.color;
    ctx.beginPath();
    ctx.ellipse(drop.x, drop.y, drop.size, drop.size * .69, drop.vx / 120, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (mode === 'work') drawStains();
  if (mode === 'work' && aimVisible) {
    const { x, y } = cursor;
    const flowing = t < latestSpray;
    const full = pressure >= 100;
    if (flowing) {
      const shine = ctx.createRadialGradient(x, y, 0, x, y, 28);
      shine.addColorStop(0, '#efffffea');
      shine.addColorStop(.45, '#a7faf6b0');
      shine.addColorStop(1, '#7baeb900');
      ctx.fillStyle = shine;
      ctx.fillRect(x - 28, y - 28, 56, 56);
    }
    ring(x, y, full ? 31 : 20, '#125b62bd', 3);
    ring(x, y, full ? 31 : 20, armed ? '#ffcf86' : full ? '#c8ffe4' : '#eeffff', 1.5);
    if (full) ring(x, y, armed ? 45 : 38, armed ? '#75420abd' : '#056f6b80', 1.5);
  }
}

function frame(now) {
  const dt = previousTime ? clamp((now - previousTime) / 1000, 0, .045) : 0;
  previousTime = now;
  const moving = mode === 'polish' || drops.length > 0 || wet.length > 0 || waves.length > 0 || t < latestSpray;
  animate(dt);
  if (redraw || drawingDirty || moving || t < latestSpray) {
    paint();
    redraw = false;
  }
  requestAnimationFrame(frame);
}

function point(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width * width, 0, width),
    y: clamp((event.clientY - rect.top) / rect.height * height, 0, height),
  };
}

canvas.addEventListener('pointerdown', (event) => {
  if (mode !== 'work' || !event.isPrimary || event.button !== 0) return;
  canvas.focus({ preventScroll: true });
  canvas.setPointerCapture(event.pointerId);
  pointer = event.pointerId;
  strokeRemainder = 0;
  audio.unlock();
  aimVisible = true;
  Object.assign(cursor, point(event));
  redraw = true;
  if (armed) {
    burst();
  } else {
    tapStain();
    samePointWash(cursor.x, cursor.y, .036);
    commitWash();
  }
});

canvas.addEventListener('pointermove', (event) => {
  if (mode !== 'work' || (event.pointerType !== 'mouse' && pointer !== event.pointerId)) return;
  const p = point(event);
  aimVisible = true;
  if (pointer === event.pointerId) {
    washStroke(p.x, p.y);
    commitWash();
  } else {
    Object.assign(cursor, p);
    redraw = true;
  }
});

function endPointer(event) {
  if (pointer === event.pointerId) {
    pointer = null;
    holdStain = undefined;
    heldFor = 0;
    redraw = true;
    audio.spray(keys.has('Space'));
  }
}

for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(event, endPointer);
}

canvas.addEventListener('keydown', (event) => {
  if (mode !== 'work' || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === 'KeyB') {
    if (!event.repeat) burst();
    return;
  }
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) {
    event.preventDefault();
    if (event.code === 'Space' && armed && !event.repeat) {
      burst();
      return;
    }
    keys.add(event.code);
    aimVisible = true;
    if (event.code === 'Space' && !event.repeat) {
      audio.unlock();
      tapStain();
      commitWash();
    }
  }
});

canvas.addEventListener('blur', () => keys.clear());
document.addEventListener('keyup', (event) => {
  if (keys.delete(event.code) && event.code === 'Space') {
    holdStain = undefined;
    heldFor = 0;
    redraw = true;
  }
});
window.addEventListener('blur', stopInput);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopInput();
  previousTime = 0;
});

burstButton.addEventListener('click', () => {
  if (mode !== 'work' || pressure < 100) return;
  armBurst(!armed);
  say(armed ? '押した場所に強力噴射。矢印キーで狙い、Spaceでも発射できます。' : '水圧満タン。強力噴射はいつでも使えます。');
  update();
  canvas.focus({ preventScroll: true });
});

soundButton.addEventListener('click', () => {
  audio.toggle(!audio.enabled);
  save(mutedKey, audio.enabled ? '0' : '1');
  setSoundLabel();
});

next.addEventListener('click', () => {
  if (mode !== 'complete') return;
  loadJob();
  canvas.focus({ preventScroll: true });
});

setSoundLabel();
loadJob();
requestAnimationFrame(frame);
