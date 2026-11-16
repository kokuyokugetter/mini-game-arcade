const canvas = document.querySelector('#scene');
const ctx = canvas.getContext('2d');
const screen = document.querySelector('.screen');
const area = document.querySelector('#area');
const stats = document.querySelector('#stats');
const message = document.querySelector('#message');
const field = document.querySelector('#field');
const battle = document.querySelector('#battle');
const ending = document.querySelector('#ending');
const hints = document.querySelector('#hints');
const hintList = document.querySelector('#hint-list');

const attack = document.querySelector('#attack');
const guard = document.querySelector('#guard');
const shield = document.querySelector('#shield');
const heal = document.querySelector('#heal');
const reflect = document.querySelector('#reflect');
const restore = document.querySelector('#restore');
const retry = document.querySelector('#retry');

const tileSize = 16;
const columns = 17;
const rows = 9;
const maxHealth = 38;
const maxBossHealth = 96;
const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const arrows = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

let phase;
let player;
let cracks;
let health;
let bossHealth;
let turn;
let herbs;
let guarding;
let equipped;
let overflow;
let reflected;
let outcome;

const colors = {
  k: '#20192c', w: '#fff1d8', g: '#e5a84f', b: '#4284c7', B: '#28577f',
  r: '#e55e66', R: '#8a344f', p: '#9f63c7', P: '#5a397c', s: '#ffc492',
  t: '#7a4d40', l: '#69ac77', L: '#416d5a',
};

const hero = [
  '...kkk...', '..kgggk..', '..ksssk..', '..ksksk..', '...kkk...',
  '..kbwbk..', '.kbwwbbk.', '.ksbBksk.', '..kbBbk..', '..kk.kk..',
];

const monarch = [
  '.....g...g...g.....', '.....ggggggggg.....', '.....kgwgwgk.......',
  '......kkkkkkk......', '...PkkpppppppkkP...', '..PpkprwkwrpkpP..',
  '.PppkpwkkkwpkppP.', '.PppkkpppppkkppP.', 'PppPPkwwwwwkPPppP',
  'PpPRRkkkkkkkRRPpP', 'PPPRRrRrRrRrRRPPP', '..kRrRrRrRrRrRk..',
  '.kRrRrRrRrRrRrRk.', '.kkRRRRRRRRRRRkk.', '...kkk.....kkk...',
];

function rect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function sprite(pattern, x, y, scale = 1) {
  const width = Math.max(...pattern.map((row) => row.length));
  pattern.forEach((row, dy) => {
    const offset = Math.floor((width - row.length) / 2);
    [...row].forEach((pixel, dx) => {
      if (colors[pixel]) rect(x + (dx + offset) * scale, y + dy * scale, scale, scale, colors[pixel]);
    });
  });
}

function tile(x, y) {
  if (x === 0 && y === 6) return 'crack';
  if (x === 0 || x === columns - 1 || y === 0 || y === rows - 1) return 'forest';
  if (x === 8) return y === 4 ? 'bridge' : 'water';
  if (x === 13 && y === 2) return 'castle';
  if (x === 3 && y === 2) return 'house';
  if (x === 6 && y === 4) return 'sign';
  if (y === 4 || (x === 13 && y > 2 && y < 7) || (y === 6 && x >= 13)) return 'path';
  if ((x * 17 + y * 13) % 11 === 0) return 'forest';
  return 'grass';
}

function drawTile(type, x, y) {
  const px = x * tileSize;
  const py = y * tileSize;
  rect(px, py, 16, 16, (x + y) % 2 ? '#466954' : '#4b7059');
  if (type === 'water' || type === 'bridge') {
    rect(px, py, 16, 16, '#345580');
    rect(px + 2, py + 4, 8, 1, '#6599be');
    rect(px + 7, py + 12, 7, 1, '#6599be');
    if (type === 'bridge') {
      rect(px, py + 4, 5, 8, '#a37255');
      rect(px + 11, py + 4, 5, 8, '#a37255');
    }
  } else if (type === 'forest' || type === 'crack') {
    rect(px, py, 16, 16, '#364b47');
    sprite(['.....ll.....', '....llll....', '...llllll...', '..llLLLLll..', '.llllllLLll.', '..LLLLLLLL..', '.....tt.....'], px + 2, py + 3);
    if (type === 'crack') {
      rect(px + 7, py + 1, 2, 5, '#d8adff');
      rect(px + 5, py + 5, 4, 2, '#d8adff');
      rect(px + 5, py + 7, 2, 6, '#d8adff');
    }
  } else if (type === 'path' || type === 'sign') {
    rect(px, py + 3, 16, 10, '#8e785d');
    rect(px + 3, py + 6, 2, 1, '#b5976c');
    rect(px + 11, py + 10, 2, 1, '#b5976c');
    if (type === 'sign') sprite(['ttttttt', 'tgggggt', 'ttttttt', '...t...', '...t...'], px + 5, py + 3);
  } else if (type === 'house' || type === 'castle') {
    const building = type === 'house'
      ? ['.....rr.....', '....rrrr....', '...rrrrrr...', '..rrrrrrrr..', '.rrrrrrrrrr.', 'ttwwwwwwwwtt', '.tgwttwwgt.', '.twwttwwwt.', '.ttttttttt.']
      : ['P.P......P.P', 'PPP..PP..PPP', 'PPP.PPPP.PPP', 'PppppppppppP', 'PpPppppPpppP', 'PpppkkkppppP', 'PPppkkkpppPP', 'PPPPkkkPPPPP'];
    sprite(building, px + 2, py + 4);
  } else {
    rect(px + 4, py + 10, 3, 1, '#65836b');
  }
}

function draw() {
  screen.classList.toggle('shift-one', phase === 'field' && cracks === 1);
  screen.classList.toggle('shift-two', phase === 'field' && cracks === 2);
  if (phase === 'field') {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) drawTile(tile(x, y), x, y);
    }
    if (cracks === 2) {
      drawTile('castle', 0, 6);
      rect(0, 6 * tileSize + 4, 20, 1, '#d8adff');
      rect(1, 6 * tileSize + 11, 8, 2, '#e55e66');
    }
    sprite(hero, player.x * tileSize + 4, player.y * tileSize + 3);
    return;
  }

  const restored = outcome === 'restore';
  const victorious = outcome === 'victory';
  rect(0, 0, 272, 144, restored ? '#394c62' : '#20172d');
  for (let i = 0; i < 12; i++) {
    const x = (i * 47 + 23) % 272;
    const y = (i * 19 + 9) % 83;
    rect(x, y, 2, 2, restored ? '#ffe5a2' : '#77578f');
  }
  for (let i = 0; i < 5; i++) {
    rect(i * 59 + 8, 14, 8, 85, '#433352');
    rect(i * 59 + 5, 15, 14, 3, '#6a5180');
  }
  rect(0, 103, 272, 41, restored ? '#627267' : '#382844');
  for (let y = 105; y < 144; y += 10) rect(0, y, 272, 1, '#513c60');
  rect(105, 111, 62, 4, '#211a30');
  if (!victorious) sprite(monarch, 98 + (overflow ? 3 : 0), 50, 4);
  if (overflow) {
    rect(93, 66, 87, 2, '#d8adff');
    rect(95, 94, 29, 2, '#e55e66');
  }
  if (outcome !== 'loss') sprite(hero, 42, 99, 2);
  if (restored) {
    sprite(hero, 196, 101, 2);
    sprite(hero, 223, 96, 2);
  }
}

function say(text) {
  message.textContent = text;
}

function drawHints() {
  const lines = phase === 'field'
    ? ['壊れた橋のそばの立て札を調べると、渡った人の書き置きが読める。', '西の森にある紫色の亀裂に正面からぶつかると、地図がずれる。', '亀裂に向かって左へ3回。左のボタンを一度ずつ押す。']
    : ['魔王は毎ターン傷を治す。攻撃だけでは回復に追いつかない。', '盾を装備して防御し、その直後に「盾を外す」。装備の変更ではターンが進まない。', '守りが255になったら「呪文を反射」。魔王がひるんだら、攻撃と村人の記録を返す選択で結末が変わる。'];
  const titles = ['手掛かり', 'もう少し詳しく', '操作手順'];
  hintList.replaceChildren(...lines.map((line, index) => {
    const item = document.createElement('li');
    const detail = document.createElement('details');
    const label = document.createElement('summary');
    const text = document.createElement('p');
    label.textContent = titles[index];
    text.textContent = line;
    detail.append(label, text);
    item.append(detail);
    return item;
  }));
  hints.open = false;
}

function update() {
  field.hidden = phase !== 'field';
  battle.hidden = phase !== 'battle';
  ending.hidden = phase !== 'ending';
  stats.textContent = phase === 'field'
    ? `座標 ${player.x}, ${player.y}`
    : `HP ${health}/${maxHealth}　魔王 ${bossHealth}/${maxBossHealth}　守り ${overflow ? 255 : guarding ? 1 : 0}`;

  attack.disabled = overflow;
  guard.disabled = overflow || reflected;
  shield.disabled = overflow || reflected;
  heal.disabled = overflow || reflected || herbs === 0;
  shield.textContent = equipped ? '盾を外す' : '盾を装備';
  heal.textContent = `薬草（${herbs}）`;
  reflect.hidden = !overflow;
  restore.hidden = !reflected;
  retry.hidden = outcome !== 'loss';
  draw();
}

function startField() {
  phase = 'field';
  outcome = undefined;
  player = { x: 3, y: 4 };
  cracks = 0;
  area.textContent = '渡し場の村';
  canvas.setAttribute('aria-label', '川を隔てて東に魔王城。村の南西、地図の端に紫の亀裂。');
  say('橋の立て札に、消えた村人が残した書き置きがある。');
  drawHints();
  update();
}

function move(direction, repeating = false) {
  if (phase !== 'field') return;
  const [dx, dy] = directions[direction];
  const x = player.x + dx;
  const y = player.y + dy;
  const nextTile = tile(x, y);

  if (nextTile === 'crack') {
    if (repeating) return;
    cracks += 1;
    if (cracks === 3) {
      player = { x: columns - 2, y: 6 };
      cracks = 0;
      area.textContent = '魔王城の外';
      say('地図の左端を踏み抜いた。気がつくと右端に立っていた。城は北西だ。');
    } else {
      say(cracks === 1 ? '森にぶつかった。足元は同じなのに、地図が半歩ずれた。' : 'もう一度押すと、地図の向こうに城壁がのぞいた。');
    }
  } else {
    cracks = 0;
    if (nextTile === 'castle') {
      startBattle();
      return;
    }
    if (nextTile === 'bridge') {
      say('橋板の中央が落ちている。ここは渡れない。');
    } else if (nextTile !== 'forest' && nextTile !== 'water' && nextTile !== 'house') {
      player = { x, y };
      if (nextTile === 'sign') inspect();
      else if (x === 1 && y === 6) say('西の森に紫のひび。ここだけ地図の線がつながっていない。');
      else if (x === 13 && y === 3) say('北に魔王城。扉の奥から呪文の声が聞こえる。');
    }
  }
  update();
}

function inspect() {
  const { x, y } = player;
  if (x === 6 && y === 4) {
    say('書き置き「橋は落ちた。でも、西の端を押すたびに地図がずれた。左へ、もう一歩ずつ。」');
  } else if (x === 1 && y === 6) {
    say('亀裂の中で、地図の左端と右端が一瞬だけ重なる。');
  } else if (x > 8) {
    say('城の門は北に開いている。石垣には消えた村人たちの名前が残っている。');
  } else {
    say('東は川。橋の前に立て札があり、西の森に紫の亀裂が見える。');
  }
}

function startBattle() {
  phase = 'battle';
  health = maxHealth;
  bossHealth = maxBossHealth;
  turn = 0;
  herbs = 2;
  guarding = false;
  equipped = true;
  overflow = false;
  reflected = false;
  outcome = undefined;
  area.textContent = '魔王の間';
  canvas.setAttribute('aria-label', '玉座の間で勇者と魔王が向かい合う');
  say('魔王「この名簿に載った者は、世界から消える。次はお前だ。」');
  drawHints();
  update();
  area.focus();
}

function finish(result) {
  phase = 'ending';
  outcome = result;
  if (result === 'loss') {
    area.textContent = '敗北　消えた名前';
    say('勇者の名も消えた。魔王は傷を治し、戦いを繰り返す。防御のあと、守りの表示はなぜ残ったままなのだろう。');
  } else if (result === 'victory') {
    area.textContent = 'エンディング　名簿の灰';
    say('魔王を倒した。名簿は灰になり、村に朝が戻った。空き家の戸は開いたままだった。');
  } else {
    area.textContent = 'エンディング　名前の帰る村';
    say('勇者は名簿を奪い、消された名前を読み上げた。魔王は剣を置いた。翌朝、村の空き家から竈の煙が上がった。');
  }
  canvas.setAttribute('aria-label', area.textContent);
  update();
  area.focus();
}

function bossTurn(action) {
  turn += 1;
  const spell = turn % 2 === 0;
  const damage = spell ? (guarding ? 17 : 34) : (guarding ? 4 : 8);
  const recovered = Math.min(10, maxBossHealth - bossHealth);
  bossHealth += recovered;
  health = Math.max(0, health - damage);

  if (health === 0) {
    finish('loss');
    return;
  }

  const recovery = recovered ? `魔王はHPを${recovered}回復。` : '';
  const clue = guarding ? ' 防御の表示が残っている。' : spell ? '' : ' 魔王は次の呪文を唱え始めた。';
  say(`${action} ${recovery}${spell ? '消去の呪文' : '魔王の一撃'}で${damage}ダメージ。${clue}`);
  update();
}

attack.addEventListener('click', () => {
  guarding = false;
  bossHealth -= Math.min(7, bossHealth);
  if (bossHealth === 0) finish('victory');
  else bossTurn('攻撃。魔王に7ダメージ。');
});

guard.addEventListener('click', () => {
  guarding = equipped;
  bossTurn(guarding ? '盾を構えた。' : '盾なしで身をかがめた。');
});

shield.addEventListener('click', () => {
  if (equipped && guarding) {
    overflow = true;
    guarding = false;
    say('盾を外すと、守りが二度引かれた。守り −1 → 255。消去の呪文の文字が、盾の残像に逆さまに浮かんだ。');
  } else {
    say(equipped ? '盾を外した。ターンは進まない。' : '盾を装備した。ターンは進まない。');
  }
  equipped = !equipped;
  update();
  if (overflow) reflect.focus();
});

heal.addEventListener('click', () => {
  herbs -= 1;
  guarding = false;
  const restored = Math.min(16, maxHealth - health);
  health += restored;
  bossTurn(`薬草でHPが${restored}回復。`);
});

reflect.addEventListener('click', () => {
  overflow = false;
  reflected = true;
  bossHealth = 1;
  say('消去の呪文が跳ね返った。魔王はひざをつき、名簿を落とした。最後の一撃を放つか、名簿の名前を村へ返すか。');
  update();
  attack.focus();
});

restore.addEventListener('click', () => finish('restore'));
retry.addEventListener('click', startBattle);
document.querySelector('#restart').addEventListener('click', () => {
  startField();
  area.focus();
});
document.querySelector('#inspect').addEventListener('click', inspect);
for (const button of document.querySelectorAll('[data-dir]')) {
  button.addEventListener('click', () => move(button.dataset.dir));
}
document.addEventListener('keydown', (event) => {
  if (phase !== 'field' || !Object.hasOwn(arrows, event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  event.preventDefault();
  move(arrows[event.key], event.repeat);
});

startField();
