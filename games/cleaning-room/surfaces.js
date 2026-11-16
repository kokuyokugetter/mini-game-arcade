const palettes = [
  { floor: '#c0ddd4', grout: '#a7c3b9', ink: '#3d746d', cream: '#e5f5ed', shine: '#ffffff' },
  { floor: '#d3d8e8', grout: '#b7bad1', ink: '#666e9d', cream: '#e9eaf7', shine: '#ffffff' },
  { floor: '#efdfbf', grout: '#cfb99c', ink: '#937253', cream: '#faf0da', shine: '#fff8ec' },
  { floor: '#d6e4c6', grout: '#b8cea8', ink: '#547d5c', cream: '#edf6db', shine: '#fffef0' },
];

function rounded(x, y, w, h, r) {
  const path = new Path2D();
  path.roundRect(x, y, w, h, r);
  return path;
}

function ellipse(x, y, rx, ry) {
  const path = new Path2D();
  path.ellipse(x, y, rx, ry, 0, 0, 2 * Math.PI);
  return path;
}

function fill(ctx, path, color) {
  ctx.fillStyle = color;
  ctx.fill(path);
}

function stroke(ctx, path, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(path);
}

function slab(ctx, bounds, base, bottom) {
  const gradient = ctx.createLinearGradient(0, 26, 0, 348);
  gradient.addColorStop(0, base);
  gradient.addColorStop(1, bottom);
  fill(ctx, bounds, gradient);
}

function tiles(ctx, p, tilesPath) {
  fill(ctx, tilesPath, p.grout);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      const x = 36 + col * 102;
      const y = 42 + row * 97;
      const tile = rounded(x, y, 96, 91, 9);
      slab(ctx, tile, (row + col) % 2 ? p.cream : p.shine, p.floor);
      stroke(ctx, rounded(x + 3, y + 3, 90, 85, 7), '#ffffff8c', 2);
      if ((row * 5 + col) % 4 === 0) {
        stroke(ctx, ellipse(x + 47, y + 45, 18, 18), p.grout);
        fill(ctx, ellipse(x + 47, y + 45, 4, 4), p.ink);
      }
    }
  }
}

function stove(ctx, p, bounds) {
  slab(ctx, bounds, '#eaf1f3', '#a8b9bd');
  fill(ctx, rounded(43, 42, 490, 235, 17), '#294145');
  [[149, 102, 44], [403, 102, 44], [149, 211, 48], [403, 211, 48]].forEach(([x, y, radius]) => {
    fill(ctx, ellipse(x, y, radius, radius), '#4b6462');
    stroke(ctx, ellipse(x, y, radius - 4, radius - 4), '#9fb1ac', 2);
    stroke(ctx, ellipse(x, y, radius * .66, radius * .66), '#769993', 3);
    fill(ctx, ellipse(x, y, 12, 12), '#172b2c');
  });
  for (let i = 0; i < 4; i++) {
    const x = 198 + i * 60;
    fill(ctx, ellipse(x, 305, 16, 16), '#314747');
    fill(ctx, rounded(x - 2, 292, 4, 14, 2), p.cream);
  }
}

function plate(ctx, p, bounds) {
  slab(ctx, bounds, p.shine, p.floor);
  fill(ctx, ellipse(288, 187, 195, 135), p.cream);
  stroke(ctx, ellipse(288, 187, 200, 139), p.ink, 2);
  stroke(ctx, ellipse(288, 187, 186, 126), p.grout, 2);
  fill(ctx, ellipse(288, 187, 160, 104), p.shine);
  stroke(ctx, ellipse(288, 187, 159, 104), p.grout, 2);
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2;
    fill(ctx, ellipse(288 + 173 * Math.cos(a), 187 + 115 * Math.sin(a), 4, 4), p.ink);
  }
}

function board(ctx, p, bounds) {
  slab(ctx, bounds, '#ffdfaa', '#c99266');
  stroke(ctx, rounded(52, 55, 472, 263, 26), '#9f6f4d', 2);
  stroke(ctx, rounded(57, 60, 462, 253, 23), '#ffe2ad', 2);
  for (let i = 0; i < 20; i++) {
    const y = 55 + i * 13;
    ctx.beginPath();
    ctx.moveTo(52, y);
    ctx.bezierCurveTo(160, y - 13, 370, y + 15, 520, y);
    ctx.lineWidth = 1 + i % 3;
    ctx.strokeStyle = i % 2 ? '#985b3b30' : '#fff0cb66';
    ctx.stroke();
  }
  fill(ctx, rounded(445, 140, 43, 94, 20), '#986743');
  fill(ctx, rounded(451, 144, 34, 84, 16), p.floor);
}

function tray(ctx, p, bounds) {
  slab(ctx, bounds, p.cream, p.grout);
  fill(ctx, rounded(53, 55, 470, 258, 41), p.ink);
  fill(ctx, rounded(63, 65, 450, 238, 32), p.floor);
  stroke(ctx, rounded(67, 70, 442, 228, 30), '#ffffff89', 2);
  for (let y = 103; y < 291; y += 23) {
    for (let x = 104; x < 488; x += 23) {
      fill(ctx, ellipse(x, y, 4, 4), '#ffffff70');
    }
  }
}

function sink(ctx, p, bounds) {
  slab(ctx, bounds, '#f0f7f8', '#a2b9bd');
  const bowl = ellipse(288, 207, 201, 114);
  const steel = ctx.createRadialGradient(288, 213, 20, 288, 207, 205);
  steel.addColorStop(0, '#afc2c5');
  steel.addColorStop(.64, '#708e94');
  steel.addColorStop(.83, '#c7d9db');
  steel.addColorStop(1, '#edf9f8');
  fill(ctx, bowl, steel);
  stroke(ctx, bowl, '#eaffff', 4);
  fill(ctx, ellipse(288, 232, 22, 17), '#3b5059');
  stroke(ctx, ellipse(288, 232, 18, 13), '#d0e3e6', 2);
  for (let i = -2; i <= 2; i++) fill(ctx, rounded(286 + i * 5, 225, 2, 14, 1), '#c2d5d9');
  const faucet = rounded(266, 54, 44, 87, 19);
  fill(ctx, ellipse(288, 65, 31, 16), '#879fa7');
  slab(ctx, faucet, '#faffff', '#69808a');
  stroke(ctx, faucet, '#c1d2d7', 2);
  fill(ctx, rounded(282, 135, 12, 11, 4), '#40535f');
  fill(ctx, rounded(275, 50, 26, 10, 5), p.ink);
}

function windowPane(ctx, p, bounds) {
  fill(ctx, bounds, '#e9f1ef');
  const light = ctx.createLinearGradient(0, 60, 0, 315);
  light.addColorStop(0, '#83becb');
  light.addColorStop(.63, '#c8e6e2');
  light.addColorStop(1, '#efefcf');
  for (const x of [49, 296]) {
    const pane = rounded(x, 50, 231, 271, 5);
    ctx.save();
    ctx.clip(pane);
    fill(ctx, pane, light);
    fill(ctx, ellipse(x + 208, 129, 47, 47), '#ffffffa0');
    fill(ctx, ellipse(x + 71, 311, 141, 87), '#6daaa1a3');
    fill(ctx, ellipse(x + 220, 319, 129, 76), '#518f80a3');
    ctx.strokeStyle = '#ffffff80';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(x + 19, 275);
    ctx.lineTo(x + 215, 84);
    ctx.stroke();
    ctx.restore();
    stroke(ctx, pane, p.ink, 2);
  }
  fill(ctx, rounded(269, 154, 9, 52, 4), '#f9fbf3');
  fill(ctx, rounded(298, 154, 9, 52, 4), '#f9fbf3');
}

const surfaces = [
  { name: '浴室のタイル', material: 'scale', path: () => rounded(29, 35, 518, 306, 12), draw: tiles },
  { name: 'キッチンのコンロ', material: 'oil', path: () => rounded(26, 26, 524, 318, 28), draw: stove },
  { name: '夕食のお皿', material: 'oil', path: () => ellipse(288, 187, 221, 153), draw: plate },
  { name: '木のまな板', material: 'mud', path: () => rounded(33, 35, 510, 304, 37), draw: board },
  { name: '玄関の靴トレー', material: 'mud', path: () => rounded(27, 29, 522, 316, 49), draw: tray },
  { name: '銀色の洗面台', material: 'scale', path: () => rounded(27, 28, 522, 318, 42), draw: sink },
  { name: 'ベランダの窓', material: 'scale', path: () => rounded(32, 34, 512, 305, 10), draw: windowPane },
];

export function createSurface(ctx, stage) {
  const index = (stage - 1) % surfaces.length;
  const batch = Math.floor((stage - 1) / surfaces.length);
  const surface = surfaces[index];
  const palette = palettes[(index + batch) % palettes.length];
  const bounds = surface.path();
  ctx.fillStyle = palette.floor;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.globalAlpha = .25;
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = i % 2 ? palette.shine : palette.ink;
    ctx.fillRect((i * 137 + 11) % 576, (i * i * 43 + i * 119) % 374, i % 4 === 0 ? 2 : 1, 1);
  }
  ctx.restore();
  ctx.save();
  ctx.shadowColor = '#30484970';
  ctx.shadowBlur = 15;
  ctx.shadowOffsetY = 7;
  fill(ctx, bounds, palette.grout);
  ctx.restore();
  ctx.save();
  ctx.clip(bounds);
  surface.draw(ctx, palette, bounds);
  ctx.restore();
  stroke(ctx, bounds, '#ffffffb3', 2);
  return { name: surface.name, material: surface.material, bounds };
}
