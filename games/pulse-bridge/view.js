'use strict';

class BridgeView {
  constructor(canvas) {
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.ocean = this.ctx.createLinearGradient(0, 0, 0, this.height);
    this.ocean.addColorStop(0, '#0c4a59');
    this.ocean.addColorStop(.57, '#116371');
    this.ocean.addColorStop(1, '#092c42');
    this.deck = this.ctx.createLinearGradient(0, 100, 0, this.height);
    this.deck.addColorStop(0, '#758e9d');
    this.deck.addColorStop(.62, '#a2aeb2');
    this.deck.addColorStop(1, '#d1c4ab');
  }

  project(x, z) {
    const depth = Math.max(0, z);
    const s = 1 / (1 + depth / 30);
    return { x: this.width / 2 + x * 187 * s, y: 592 - (1 - s) * 552, s };
  }

  polygon(points, fill, stroke) {
    const { ctx } = this;
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  lane(x, near, far, half, color) {
    const corners = [[x-half, near], [x+half, near], [x+half, far], [x-half, far]];
    this.polygon(corners.map(([lane, z]) => {
      const p = this.project(lane, z);
      return [p.x, p.y];
    }), color);
  }

  text(text, x, y, font, color = '#eeffff', outline) {
    const { ctx } = this;
    ctx.font = `800 ${font}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (outline) {
      ctx.lineWidth = Math.max(2, font * .2);
      ctx.strokeStyle = outline;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  bridge(time, night) {
    const { ctx, width, height } = this;
    ctx.fillStyle = night ? '#161634' : this.ocean;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 110; i++) {
      const x = (i * 61 + 12) % width;
      const y = (i * i * 41 + i * 19 + Math.sin(time + i) * 4 + height) % height;
      ctx.fillStyle = i % 3 ? '#87eced15' : '#071a2f53';
      ctx.fillRect(x, y, 8 + i % 28, 1 + (y > height / 2));
    }
    this.lane(0, 0, 180, 1.11, '#143246');
    this.lane(0, 0, 180, 1.04, night ? '#4c4a68' : this.deck);
    for (const rail of [-1, 1]) {
      this.lane(rail, 0, 180, .037, '#405466');
      this.lane(rail, 0, 180, .017, night ? '#c88bff' : '#ccd9d9');
      for (let i = 12; i >= 0; i--) {
        const z = i * 7.4 - (time * 13 % 7.4);
        if (z < 0) continue;
        const p = this.project(rail, z);
        ctx.fillStyle = '#3d5367';
        ctx.fillRect(p.x - 5 * p.s, p.y - 17 * p.s, 10 * p.s, 19 * p.s);
        ctx.fillStyle = '#d3dacf';
        ctx.fillRect(p.x - 6.5 * p.s, p.y - 19 * p.s, 13 * p.s, 4 * p.s);
      }
    }
    for (let i = 19; i >= 0; i--) {
      const z = i * 7.4 - (time * 13 % 7.4);
      if (z < 0) continue;
      this.lane(0, z, z + .15, .991, '#333e481b');
      this.lane(-.335, z, z + 2.7, .008, '#f3e9c0a8');
      this.lane(.335, z, z + 2.7, .008, '#f3e9c0a8');
    }
  }

  gate(x, z, option) {
    const { ctx } = this;
    const point = this.project(x, z);
    const { s } = point;
    const w = 86 * s, h = (option.kind === 'small' ? 28 : 55) * s;
    const { x: px, y } = point;
    const palette = {
      small: ['#87f1ff', '#0071cb'],
      crew: ['#95fcff', '#145fb4'],
      shield: ['#9ef9d5', '#187564'],
      drone: ['#ffe697', '#936022'],
    };
    const [light, dark] = palette[option.kind];
    this.polygon([[px-w/2,y], [px+w/2,y], [px+w/2+5*s,y-7*s], [px-w/2+5*s,y-7*s]], '#1f4f6a81');
    const height = y - h;
    ctx.fillStyle = dark;
    ctx.fillRect(px - w / 2, height, w, h);
    ctx.fillStyle = light;
    ctx.fillRect(px - w / 2, height, w, 3 * s);
    ctx.fillRect(px - w / 2, height, 3 * s, h);
    ctx.fillRect(px + w / 2 - 3 * s, height, 3 * s, h);
    if (option.kind === 'drone') {
      for (let i = 1; i <= 4; i++) ctx.fillRect(px - w / 2 + i * w / 5, height + 4 * s, 1.2 * s, h - 4 * s);
    }
    this.text(option.label, px, y - h * .48, Math.max(9, (option.kind === 'small' ? 24 : 23) * s), '#f5ffff', '#142f53');
    if (option.hp > 0) {
      ctx.fillStyle = '#172843';
      ctx.fillRect(px - w * .42, height - 8 * s, w * .84, 4 * s);
      ctx.fillStyle = light;
      ctx.fillRect(px - w * .42, height - 8 * s, w * .84 * option.hp / option.maxHp, 4 * s);
    }
  }

  warning(attack, time) {
    const { ctx } = this;
    const left = attack.x - attack.half, right = attack.x + attack.half;
    const hit = attack.resolved;
    const charge = Math.max(0, Math.min(1, 1 - (attack.at - time) / attack.duration));
    const edge = attack.kind === 'mortar' ? '#ffca72' : '#ffa89b';
    const far = attack.kind === 'mortar' ? 24 : 88;
    ctx.globalAlpha = hit ? .92 - Math.min(.7, (time - attack.at) * 2.6) : .46 + charge * .34;
    this.lane(attack.x, 0, far, attack.half, hit ? '#fa553f' : '#d62b4c9e');
    this.lane(left, 0, far, .014, edge);
    this.lane(right, 0, far, .014, edge);
    this.lane(attack.x, 13 - 12 * charge, 17 - 12 * charge, attack.half, edge);
    ctx.globalAlpha = 1;
    const p = this.project(attack.x, 13);
    if (!hit) this.text(attack.kind === 'mortar' ? '着弾' : attack.kind === 'ram' ? '突撃' : '!', p.x, p.y - 8, 18, '#fff4cf', '#8d2945');
    else if (attack.kind === 'laser') this.lane(attack.x, 0, 79, .04, '#fff4bbcd');
  }

  enemy(enemy, scene) {
    const { ctx } = this;
    const { x, y, s } = this.project(enemy.x, enemy.z);
    const firing = scene.warnings.some(warning => warning.source === enemy && !warning.resolved);
    const armor = enemy.kind === 'ram' ? '#bb4251' : enemy.kind === 'mortar' ? '#df8a58' : '#a95c80';
    const body = (points, color) => this.polygon(points.map(([dx, dy]) => [x + dx*s, y + dy*s]), color, '#47263f');
    body([[-35, 0], [-31, -25], [-17, -35], [17, -35], [31, -25], [35, 0]], armor);
    ctx.fillStyle = '#372b47';
    ctx.fillRect(x - 36*s, y - 11*s, 72*s, 8*s);
    if (enemy.kind === 'ram') {
      body([[-33, -6], [-11, -10], [0, 7], [11, -10], [33, -6], [23, 10], [-23, 10]], '#e2a4a8');
    } else if (enemy.kind === 'mortar') {
      body([[-13, -17], [-8, -51], [11, -51], [15, -17]], '#73485e');
    } else {
      body([[-7, -22], [-6, -7], [8, -7], [7, -22]], '#f49491');
    }
    ctx.fillStyle = firing ? '#fff2a8' : '#ff6e80';
    ctx.fillRect(x - 7*s, y - 26*s, 14*s, 6*s);
    ctx.fillStyle = '#251e36';
    ctx.fillRect(x - 27*s, y - 60*s, 54*s, 5*s);
    ctx.fillStyle = '#ffb18d';
    ctx.fillRect(x - 27*s, y - 60*s, 54*s * enemy.hp / enemy.maxHp, 5*s);
  }

  boss(boss, exposed) {
    const { ctx } = this;
    const p = this.project(boss.x, boss.z);
    const x = p.x, y = p.y, s = p.s * 1.2;
    const path = (parts, fill, stroke) => this.polygon(parts.map(([a, b]) => [x + a*s, y + b*s]), fill, stroke);
    ctx.fillStyle = '#16304588';
    ctx.beginPath();
    ctx.ellipse(x, y + 5 * s, 100 * s, 17 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    const armor = exposed ? '#e49455' : boss.second ? '#645cb0' : '#b5686b';
    path([[-66, -31], [-70, -74], [-32, -116], [36, -116], [69, -74], [67, -31], [42,-10], [-45,-10]], armor, '#452f46');
    path([[-90,-65], [-67,-90], [-54,-69], [-48,-16], [-78,-5], [-99,-30]], '#72475d', '#462d43');
    path([[90,-65], [67,-90], [54,-69], [48,-16], [78,-5], [99,-30]], '#72475d', '#462d43');
    path([[-38,-111], [-43,-144], [-26,-166], [29,-166], [43,-144], [39,-111]], '#e1a091', '#744b60');
    path([[-28,-127], [-39,-146], [37,-146], [28,-127]], '#352e4a');
    path([[-22,-140], [-7,-138], [-7,-132], [-22,-134]], '#ffe48b');
    path([[22,-140], [7,-138], [7,-132], [22,-134]], '#ffe48b');
    path([[-32,-85], [0,-106], [32,-85], [20,-55], [0,-38], [-20,-55]], '#563949');
    ctx.beginPath();
    ctx.ellipse(x, y - 72 * s, 12*s, 17*s, 0, 0, Math.PI * 2);
    ctx.fillStyle = boss.aligned ? '#fff2b3' : '#ffd584';
    ctx.fill();
    this.polyArmorLine(x, y, s);
    if (boss.second) {
      for (const side of [-1, 1]) {
        const a = side * 78;
        path([[a-22,-67],[a-22,-134],[a+22,-134],[a+22,-67]], '#554887', '#342546');
        path([[a-18,-132],[a-11,-145],[a+11,-145],[a+18,-132],[a+12,-118],[a-12,-118]], '#f8a1ec', '#473160');
      }
    }
    if (boss.aligned) this.text(exposed ? '装甲破壊 ×2' : 'コア命中', x, y - 181 * s, 14, '#fff2b3', '#472e46');
  }

  polyArmorLine(x, y, s) {
    const { ctx } = this;
    ctx.strokeStyle = '#ffd1a68c';
    ctx.lineWidth = 2 * s;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + side * 32 * s, y - 99 * s);
      ctx.lineTo(x + side * 55 * s, y - 75 * s);
      ctx.lineTo(x + side * 48 * s, y - 54 * s);
      ctx.stroke();
    }
  }

  beams(scene) {
    if (!scene.firing) return;
    const { ctx } = this;
    const from = this.project(scene.x, 6);
    const target = this.project(scene.targetX, scene.targetZ);
    const lift = scene.boss ? 86 * target.s : 18;
    const power = Math.min(15, 4 + Math.floor(scene.power / 6));
    const wide = scene.drone ? 24 : 11;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < power; i++) {
      const progress = (scene.time * (1.8 + i % 3 * .23) + i * .146) % 1;
      const x = from.x + (target.x - from.x) * progress + Math.sin(i * 2.45) * wide * (1 - progress * .55);
      const y = from.y + (target.y - from.y - lift) * progress - 12;
      ctx.strokeStyle = i % 5 ? '#21bfe9bd' : '#94f5ffe8';
      ctx.lineWidth = scene.drone ? 4 : scene.boss?.aligned ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (target.x - from.x) * .08, y - (scene.drone ? 27 : 15));
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  squad(scene) {
    const { ctx } = this;
    const display = Math.min(45, scene.units);
    const cols = Math.min(7, Math.max(3, Math.ceil(Math.sqrt(display * 1.35))));
    const rows = Math.ceil(display / cols);
    const origin = this.project(scene.x, 5);
    const half = this.project(squadSpread(scene.units), 5).x - this.project(0, 5).x;
    ctx.beginPath();
    ctx.ellipse(origin.x, origin.y + 22, half, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#15273cb0';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#bdfff1';
    ctx.stroke();
    if (scene.shield) {
      ctx.beginPath();
      ctx.ellipse(origin.x, origin.y - 10, 32 + cols * 4, 29, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#7bf0d12b';
      ctx.fill();
      ctx.strokeStyle = '#85efd6';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    for (let k = 0; k < display; k++) {
      const row = Math.floor(k / cols), col = k % cols;
      const inRow = Math.min(cols, display - row * cols);
      const x = origin.x + (col - (inRow - 1) / 2) * 13 + (row % 2 ? 3 : 0);
      const bob = this.reduced.matches ? 0 : Math.sin(scene.time * 17 + k) * 1.5;
      const y = origin.y + (row - (rows - 1) / 2) * 10 + bob;
      this.bot(x, y);
    }
    if (scene.drone) {
      const x = origin.x - 46, y = origin.y - 41;
      this.polygon([[x-15,y], [x+15,y], [x+22,y+6], [x-22,y+6]], '#8cf8ff', '#347aba');
      ctx.fillStyle = '#183e65';
      ctx.fillRect(x-8, y-5, 16, 11);
      ctx.fillStyle = '#e4f9ba';
      ctx.fillRect(x-3, y+1, 6, 4);
    }
    if (scene.units > 0) this.text(String(scene.units), origin.x, origin.y + 31, 18, '#ecffff', '#153164');
  }

  bot(x, y) {
    const { ctx } = this;
    ctx.fillStyle = '#172b5566';
    ctx.fillRect(x-8,y+1,17,6);
    this.polygon([[x-6,y-9],[x+6,y-9],[x+7,y+2],[x-8,y+2]], '#245fbc', '#194478');
    ctx.fillStyle = '#39a5e1';
    ctx.fillRect(x-4,y-10,9,6);
    ctx.fillStyle = '#c6f6ff';
    ctx.fillRect(x-2,y-8,5,2);
    ctx.fillStyle = '#193e8b';
    ctx.fillRect(x-6,y+1,4,4);
    ctx.fillRect(x+2,y+1,4,4);
  }

  shockwaves(scene) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const ring of scene.rings) {
      const strength = ring.life / ring.duration;
      const radius = ring.size * (this.reduced.matches ? .58 : .12 + (1 - strength) * .88);
      ctx.globalAlpha = strength;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 2 + strength * 6;
      for (const scale of [.64, 1]) {
        ctx.beginPath();
        ctx.ellipse(ring.x, ring.y, radius * scale, radius * scale * .44, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    const shot = scene.shot;
    if (shot) {
      const strength = Math.min(1, shot.life * 4);
      ctx.globalAlpha = strength;
      ctx.lineCap = 'round';
      const beam = ctx.createLinearGradient(shot.from.x, shot.from.y, shot.end.x, shot.end.y - shot.lift);
      beam.addColorStop(0, shot.counter ? '#47d4ff' : '#ff9c40');
      beam.addColorStop(1, shot.counter ? '#8bfff1' : '#fff2ab');
      ctx.beginPath();
      ctx.moveTo(shot.from.x, shot.from.y - 12);
      ctx.lineTo(shot.end.x, shot.end.y - shot.lift);
      ctx.strokeStyle = beam;
      ctx.lineWidth = (shot.counter ? 13 : 39) * strength;
      ctx.stroke();
      ctx.strokeStyle = '#fffce3';
      ctx.lineWidth *= .36;
      ctx.stroke();
    }
    ctx.restore();
  }

  effects(effects) {
    const { ctx } = this;
    for (const effect of effects) {
      ctx.globalAlpha = Math.max(0, effect.life / effect.duration);
      if (effect.text) this.text(effect.text, effect.x, effect.y, effect.size, effect.color, '#172641');
      else {
        ctx.fillStyle = effect.color;
        ctx.fillRect(effect.x, effect.y, effect.size, effect.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  bossBar(boss, timeLeft) {
    const { ctx, width } = this;
    ctx.fillStyle = '#101d30e9';
    ctx.fillRect(68, 13, width - 136, 39);
    this.text(boss.name, width / 2, 24, 13);
    this.text(`${timeLeft}秒`, width - 112, 24, 13, '#ffe4a6');
    ctx.fillStyle = '#422939';
    ctx.fillRect(81, 35, width - 162, 9);
    ctx.fillStyle = '#ff7b6f';
    ctx.fillRect(81, 35, (width - 162) * Math.max(0, boss.hp / boss.max), 9);
  }

  draw(scene) {
    const { ctx } = this;
    this.bridge(scene.travel, scene.stage === 2);
    ctx.save();
    if (scene.impact && !this.reduced.matches) {
      ctx.translate(Math.sin(scene.impact * 97) * scene.impact * 17, Math.cos(scene.impact * 78) * scene.impact * 12);
    }
    for (const attack of scene.warnings) this.warning(attack, scene.time);
    if (scene.boss && scene.boss.hp > 0) this.boss(scene.boss, scene.time < scene.breakUntil);
    for (const row of [...scene.rows].reverse()) {
      const z = 5 + (row.at - scene.time) * 13;
      if (row.done || z < 0 || z > 100) continue;
      for (const option of row.options) if (!option.taken) this.gate(option.x, z, option);
    }
    for (const enemy of scene.enemies.filter(enemy => !enemy.gone && scene.time >= enemy.at).sort((a, b) => b.z - a.z)) {
      this.enemy(enemy, scene);
    }
    this.beams(scene);
    this.squad(scene);
    this.shockwaves(scene);
    this.effects(scene.effects);
    ctx.restore();
    if (scene.boss && scene.time >= scene.bossAt) this.bossBar(scene.boss, Math.max(0, Math.ceil(scene.deadline - scene.time)));
  }
}
