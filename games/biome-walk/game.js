import { BIOMES, makeJourney, random, readSave } from './core.mjs';
const $ = id => document.getElementById(id);
const canvas = $('world');
const ctx = canvas.getContext('2d', { alpha: false });
const KEY = 'arcade-biome-walk-v1';
let saved = null;
let canSave = true;
try { saved = readSave(localStorage.getItem(KEY)); } catch { canSave = false; }
const seed = saved?.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
let steps = saved?.steps ?? 0;
const journey = makeJourney(seed);
let current = journey.at(steps);
let auto = false;
let holding = false;
const keys = new Set();
let motion = false;
let width = 0, height = 0, focal = 0, horizon = 0;
let lastTime = 0, lastSaved = 0, arrivalUntil = 0;
let bob = 0;
let polygons = [];
let fog = BIOMES[current.biome].fog;
let camera = steps * 1.5;
const colorCache = new Map();
function rgb(hex) {
  if (!colorCache.has(hex)) colorCache.set(hex, hex.match(/[a-f\d]{2}/gi).map(n => parseInt(n, 16)));
  return colorCache.get(hex);
}
function mix(a, b, t) { return `rgb(${rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t)).join(',')})`; }
function shade(hex, amount) { return mix(hex, amount > 0 ? '#ffffff' : '#000000', Math.abs(amount)); }
function resize() {
  width = innerWidth; height = Math.max(540, innerHeight);
  const dpr = Math.min(devicePixelRatio || 1, 1.6);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  focal = Math.min(width * .9, height * .9); horizon = height * .44;
}
addEventListener('resize', resize);
resize();
function project([x, y, z]) {
  const depth = z - camera;
  return [width / 2 + x * focal / depth, horizon + (4.3 + bob - y) * focal / depth];
}
function face(points, color) {
  if (points.some(p => p[2] - camera < .65)) return;
  const depth = points.reduce((a, p) => a + p[2] - camera, 0) / points.length;
  polygons.push({ points, color, depth });
}
function box(x, y, z, w, h, d, color) {
  const a = x - w / 2, b = x + w / 2, n = z - d / 2, f = z + d / 2, t = y + h;
  face([[a,y,n],[b,y,n],[b,t,n],[a,t,n]], shade(color, -.12));
  if (x > 0) face([[a,y,n],[a,t,n],[a,t,f],[a,y,f]], shade(color, -.25));
  else face([[b,y,n],[b,y,f],[b,t,f],[b,t,n]], shade(color, -.25));
  face([[a,t,n],[b,t,n],[b,t,f],[a,t,f]], shade(color, .13));
}
function elevation(x, z) {
  const edge = Math.min(1, Math.max(0, (Math.abs(x) - 6) / 18));
  return edge * (Math.sin(x * .14 + z * .025) * 2 + Math.cos(z * .055 - x * .12) * 1.5 + .7);
}
function object(x, z, biome, r) {
  const y = elevation(x, z), size = .75 + r() * .65;
  const kind = biome.kind;
  if (kind === 'canyon') {
    const h = 3 + r() * 13;
    box(x, y, z, 3 * size, h, 3 * size, biome.leaf);
    box(x, y + h * .55, z, 3.1 * size, .65, 3.1 * size, '#d49b6d');
  } else if (kind === 'desert') {
    box(x, y, z, .65, 3 * size, .65, biome.leaf);
    box(x + .8, y + 1.4, z, 1.2, .5, .5, biome.leaf);
    box(x + 1.2, y + 1.4, z, .5, 1, .5, biome.leaf);
  } else if (kind === 'mushroom') {
    box(x, y, z, .65, 2.5 * size, .65, '#c6becb');
    box(x, y + 2.5 * size, z, 3 * size, .7, 3 * size, r() > .5 ? '#bb9adb' : '#78b9c0');
    box(x, y + 3 * size, z, 1.7 * size, .7, 1.7 * size, '#d6bfdc');
  } else if (kind === 'highland') {
    box(x, y, z, 2 * size, 1.5 * size, 2 * size, '#adbcb4');
    box(x, y + 1.5 * size, z, size, .6, size, '#d5ddd1');
  } else if (kind === 'water') {
    box(x, y - 2, z, .45, 5 * size, .45, '#637d50');
    box(x, y + 2 * size, z, 2.5 * size, .65, 2.5 * size, biome.leaf);
  } else if (kind === 'snow') {
    box(x, y, z, .6, 5 * size, .6, '#6f7771');
    for (let i = 0; i < 3; i++) box(x, y + (1.5 + i * 1.3) * size, z, (3.5 - i) * size, 1.3 * size, (3.5 - i) * size, i === 0 ? '#69958d' : biome.leaf);
  } else {
    if (kind === 'meadow' && r() > .24) {
      box(x, y, z, .18, .7, .18, '#5b833d');
      box(x, y + .6, z, .45, .35, .45, r() > .5 ? '#f0db88' : '#f0e9ce');
    } else {
      box(x, y, z, .6 * size, 4 * size, .6 * size, '#776a4a');
      box(x, y + 2.8 * size, z, 3.6 * size, 2.2 * size, 3.5 * size, biome.leaf);
      box(x - .35, y + 4.5 * size, z, 2.7 * size, 1.3 * size, 2.6 * size, biome.leaf);
    }
  }
}
function drawSky(biome, next, blend) {
  const sky = mix(biome.sky, next.sky, blend);
  const gradient = ctx.createLinearGradient(0, 0, 0, height * .65);
  gradient.addColorStop(0, sky); gradient.addColorStop(1, fog);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = biome.kind === 'mushroom' ? '#eee9cf' : '#fff3c3';
  ctx.globalAlpha = .85; ctx.fillRect(width * .74, height * .19, 44, 44); ctx.globalAlpha = 1;
  for (let i = 0; i < 7; i++) {
    const x = ((i * .19 + .08 - camera * .00004) % 1.4) * width;
    ctx.fillStyle = mix(biome.fog, '#ffffff', .35); ctx.globalAlpha = .45;
    ctx.fillRect(x, height * (.12 + (i % 3) * .065), 80 + i * 9, 14);
    ctx.fillRect(x + 20, height * (.12 + (i % 3) * .065) - 12, 50 + i * 5, 14);
  }
  ctx.globalAlpha = 1;
  for (let layer = 0; layer < 2; layer++) {
    ctx.fillStyle = mix(biome.ground, biome.fog, .68 + layer * .12);
    ctx.beginPath(); ctx.moveTo(0, height * .63);
    for (let i = 0; i <= 20; i++) {
      const x = i * width / 20;
      const y = horizon - 10 - Math.abs(Math.sin(i * .7 + seed % 9 + layer) * 58) - layer * 22;
      ctx.lineTo(x, y); ctx.lineTo(x + width / 40, y);
    }
    ctx.lineTo(width, height * .63); ctx.fill();
  }
}
function render(time, moving) {
  camera = steps * 1.5;
  bob = motion && moving ? Math.sin(steps * Math.PI) * .055 : 0;
  const biome = BIOMES[current.biome];
  const next = BIOMES[journey.at(current.end + .01).biome];
  const blend = Math.max(0, 1 - (current.end - steps) / 20) * .55;
  fog = mix(biome.fog, next.fog, blend);
  // Convert mixed fog once; face shading uses numeric channels below.
  const fogRGB = fog.match(/\d+/g).map(Number);
  drawSky(biome, next, blend);
  polygons = [];
  const start = Math.floor(camera / 5) * 5;
  for (let z = start; z < camera + 185; z += 5) {
    const front = Math.max(z, camera + .7);
    const b = BIOMES[journey.at(z / 1.5).biome];
    for (let col = -10; col < 10; col++) {
      const x = col * 5;
      const noise = Math.sin(x * 73.7 + z * 9.17) * .035;
      face([[x,elevation(x,front),front],[x+5,elevation(x+5,front),front],[x+5,elevation(x+5,z+5),z+5],[x,elevation(x,z+5),z+5]], shade(b.ground, noise));
    }
    face([[-1.5,.035,front],[1.5,.035,front],[1.5,.035,z+5],[-1.5,.035,z+5]], shade(b.path, (z / 5 % 2) * .045));
    if (b.kind === 'water') {
      box(-1.65, -.4, z + 2.5, .16, .6, 5, '#d0b893');
      box(1.65, -.4, z + 2.5, .16, .6, 5, '#d0b893');
    }
    if (z % 10 === 0) {
      const r = random((seed + z * 1337) >>> 0);
      for (let side = -1; side <= 1; side += 2) {
        object(side * (4 + r() * 12), z + r() * 3, b, r);
        object(side * (23 + r() * 16), z + r() * 3, b, r);
      }
    }
  }
  polygons.sort((a, b) => b.depth - a.depth);
  for (const p of polygons) {
    const points = p.points.map(project);
    if (points.every(v => v[0] < -20) || points.every(v => v[0] > width + 20)) continue;
    const t = Math.min(.98, (p.depth / 185) ** 1.6);
    const c = rgb(p.color.startsWith('#') ? p.color : '#ffffff');
    const source = p.color.startsWith('rgb') ? p.color.match(/\d+/g).map(Number) : c;
    ctx.fillStyle = `rgb(${source.map((v, i) => Math.round(v + (fogRGB[i] - v) * t)).join(',')})`;
    ctx.beginPath(); points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); ctx.fill();
  }
  if (biome.kind === 'snow' || biome.kind === 'cherry' || biome.kind === 'mushroom') {
    ctx.fillStyle = biome.kind === 'cherry' ? '#f7d2df' : '#f0f1d5';
    const drift = motion && moving ? time * .012 : 0;
    for (let i = 0; i < 30; i++) {
      const r = random(seed + i * 39);
      const x = (r() * width + Math.sin(drift * .01 + i) * 14 + width) % width;
      const y = (r() * height + drift) % height;
      ctx.globalAlpha = .25 + r() * .45; ctx.fillRect(x, y, 2 + r() * 3, 2 + r() * 2);
    }
    ctx.globalAlpha = 1;
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ seed, steps })); canSave = true; } catch { canSave = false; }
}
function updateHUD() {
  const visited = journey.visited(steps);
  const found = new Set(visited.map(s => s.biome));
  $('region').textContent = BIOMES[current.biome].name;
  $('description').textContent = BIOMES[current.biome].note;
  $('region-number').textContent = `LANDSCAPE ${String(visited.length).padStart(2, '0')}`;
  $('steps').textContent = Math.floor(steps).toLocaleString('ja-JP');
  $('visits').textContent = `訪れた地帯 ${visited.length}`;
  $('collection').textContent = `${found.size} / ${BIOMES.length}`;
  $('next').textContent = `次の風景まで あと${Math.ceil(current.end - steps)}歩`;
  $('progress-fill').style.width = `${(steps - current.start) / (current.end - current.start) * 100}%`;
}
function stop() {
  auto = false; holding = false; keys.clear();
  $('auto').setAttribute('aria-pressed', 'false'); $('auto').textContent = '自動で歩く';
}
$('walk').addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  holding = true; $('walk').setPointerCapture(e.pointerId); e.preventDefault();
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) $('walk').addEventListener(event, () => { holding = false; });
$('walk').addEventListener('contextmenu', e => e.preventDefault());
$('auto').addEventListener('click', () => {
  auto = !auto; $('auto').setAttribute('aria-pressed', String(auto)); $('auto').textContent = auto ? '立ち止まる' : '自動で歩く';
});
addEventListener('keydown', e => {
  if ($('journal').open || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.code === 'Space' && /^(BUTTON|A)$/.test(e.target.tagName)) return;
  if (['KeyW', 'ArrowUp', 'Space'].includes(e.code)) { e.preventDefault(); keys.add(e.code); }
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { stop(); save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); save(); } lastTime = 0; });
addEventListener('pagehide', save);
$('motion').addEventListener('click', () => {
  motion = !motion; $('motion').textContent = `揺れ ${motion ? 'ON' : 'OFF'}`; $('motion').setAttribute('aria-pressed', String(motion));
});
$('journal-open').addEventListener('click', () => {
  stop(); save();
  const visited = journey.visited(steps);
  $('entries').replaceChildren();
  BIOMES.forEach((b, i) => {
    const first = visited.find(s => s.biome === i);
    const entry = document.createElement('div'); entry.className = `entry${first ? '' : ' unknown'}`;
    const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.background = first ? b.leaf : '#79908a';
    const title = document.createElement('strong'); title.textContent = first ? b.name : 'まだ見ぬ風景';
    const note = document.createElement('p'); note.textContent = first ? `${first.start}歩で発見 · ${b.note}` : '道の先で、いつか出会える。';
    entry.append(swatch, title, note); $('entries').append(entry);
  });
  $('save-status').textContent = canSave ? '旅は保存済み。次に開くと、この場所から。' : 'このブラウザでは保存できません。今の旅はこの画面で続けられます。';
  $('journal').showModal();
});
$('journal-close').addEventListener('click', () => $('journal').close());
function frame(time) {
  const dt = lastTime ? Math.min((time - lastTime) / 1000, .08) : 0; lastTime = time;
  const moving = !document.hidden && !$('journal').open && (holding || auto || keys.size > 0);
  if (moving) {
    steps = Math.min(1000000, steps + dt * 3.3);
    const region = journey.at(steps);
    if (region !== current) {
      const already = journey.visited(current.start).some(s => s.biome === region.biome);
      current = region;
      const complete = new Set(journey.visited(steps).map(s => s.biome)).size === BIOMES.length;
      $('arrival').textContent = `${already ? 'ふたたび、' : '新しい風景 — '}${BIOMES[region.biome].name}${!already && complete ? ' · 全10地帯を発見！' : ''}`;
      arrivalUntil = time + 4200; save();
    }
  }
  $('walk').classList.toggle('active', Boolean(moving));
  $('hint').textContent = moving ? '一歩ずつ、知らない風景へ。' : '長押し、または自動で歩く。道はずっと続きます。';
  $('arrival').classList.toggle('show', time < arrivalUntil);
  updateHUD(); render(time, moving);
  if (time - lastSaved > 4000) { save(); lastSaved = time; }
  requestAnimationFrame(frame);
}
updateHUD(); requestAnimationFrame(frame);
