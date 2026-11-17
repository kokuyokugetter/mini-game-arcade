const tileSize = 16;
const columns = 17;
const rows = 9;
const maxHealth = 38;
const maxBossHealth = 103;
const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const arrows = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

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
  if (x === 5 && y === 1) return 'pond';
  if (x === 14 && y === 6) return 'grave';
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
      rect(px, py + 4, 16, 8, '#a37255');
      for (let i = 2; i < 16; i += 4) rect(px + i, py + 4, 1, 8, '#c69665');
    }
  } else if (type === 'forest' || type === 'crack') {
    rect(px, py, 16, 16, '#364b47');
    sprite(['.....ll.....', '....llll....', '...llllll...', '..llLLLLll..', '.llllllLLll.', '..LLLLLLLL..', '.....tt.....'], px + 2, py + 3);
    if (type === 'crack') {
      rect(px + 7, py + 1, 2, 5, '#d8adff');
      rect(px + 5, py + 5, 4, 2, '#d8adff');
      rect(px + 5, py + 7, 2, 6, '#d8adff');
    }
  } else if (type === 'pond') {
    rect(px + 2, py + 3, 12, 10, '#345580');
    if (!charted.has('sword')) sprite(['...w.', '..wg.', '.wg..', 'kt...', '.k...'], px + 5, py + 5);
  } else if (type === 'grave') {
    sprite(['.ww.', 'wwww', 'wkkw', 'wwww', '.ww.'], px + 6, py + 5);
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
  if (phase === 'field') {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) drawTile(tile(x, y), x, y);
    }
    sprite(hero, player.x * tileSize + 4, player.y * tileSize + 3);
    return;
  }

  const restored = outcome === 'ledger' || outcome === 'command';
  const victorious = Boolean(routes[outcome]);
  const sky = { sword: '#50342b', wrap: '#292147', shield: '#302b52' };
  rect(0, 0, 272, 144, restored ? '#394c62' : sky[outcome] ?? '#20172d');
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
  if (!victorious) sprite(monarch, 98 + (shieldReady ? 3 : 0), 50, 4);
  if ((phase === 'battle' && shieldReady) || outcome === 'shield') {
    rect(93, 66, 87, 2, '#d8adff');
    rect(95, 94, 29, 2, '#e55e66');
  }
  if (outcome !== 'loss') sprite(hero, 42, 99, 2);
  if (restored) {
    sprite(hero, 196, 101, 2);
    sprite(hero, 223, 96, 2);
  }
}

const canvas = document.querySelector('#scene');
const ctx = canvas.getContext('2d');
const area = document.querySelector('#area');
const stats = document.querySelector('#stats');
const message = document.querySelector('#message');
const field = document.querySelector('#field');
const battle = document.querySelector('#battle');
const ending = document.querySelector('#ending');
const journal = document.querySelector('#journal');
const hintList = document.querySelector('#hint-list');

const routes = {
  normal: {
    ending: '名簿の灰',
    story: '魔王を倒した。名簿は灰になり、村に朝が戻った。空き家の戸は開いたままだった。',
  },
  sword: {
    title: '水面の所有者',
    hintTitle: '村の北東',
    clue: '村の北東の小さな池に、陸にはないものが映っている。',
    answer: '池の青いマスに立ち、足元を調べると神剣を引き抜ける。魔王に神剣でとどめを刺すと、名簿も斬れる。',
    command: '神剣で攻撃',
    ending: '神剣の傷跡',
    story: '神剣は名簿と魔王を一緒に断った。村人が戻った夜、池に映った月には細い切れ目が残った。',
  },
  command: {
    title: '試し書きの命令',
    hintTitle: '村の空き家',
    clue: '村の赤い屋根の家に、魔王の部屋を作った人のメモがある。',
    answer: '家の中で調べる。玉座の間の合言葉に「さいしょ」と入力する。',
    ending: '最初の一日',
    story: '魔王の記録が最初の日に戻った。玉座には村の門番が座り込んでいた。彼は立ち上がり、村の鐘を鳴らしに帰った。',
  },
  wrap: {
    title: '地図のつなぎ目',
    hintTitle: '西の森',
    clue: '橋の立て札の裏には、西の森から帰った人の話がある。',
    answer: '村の南西、端の紫色の亀裂に踏み込む。折り目の向こうから城へ行ける。',
    command: '玉座を境界の外へ押す',
    ending: '地図にない王国',
    story: '玉座の向こうの折り目を押すと、城ごと世界の裏へ滑り落ちた。翌日、村の子供たちは空き地に新しい道を描いた。',
  },
  shield: {
    title: '守り255',
    hintTitle: '魔王戦の防御',
    clue: '魔王の攻撃を受け止めた直後には、盾に守りの数字が残る。',
    answer: '魔王の攻撃を防御した直後に盾を外す。守り255になったら、魔王が呪文を唱えようとするときに消去の文字を返す。',
    command: '消去を魔王に返す',
    ending: '鏡の向こうの名前',
    story: '呪文が名簿の最後の行に跳ね返った。魔王の名だけが消え、玉座の前には名前を知らない旅人がひとり立っていた。',
  },
  ledger: {
    title: '二重の墓碑',
    hintTitle: '城の南',
    clue: '城の南の白い墓碑には、村人の名前が彫ってある。',
    answer: '墓碑の上で足元を調べる。欠けた名前を写して玉座の間に持ち込める。',
    command: '墓碑の名前を名簿に返す',
    ending: '名前の帰る村',
    story: '墓碑と名簿に同じ名前が揃い、人を消す呪文が逆向きに流れた。翌朝、空き家の竈から煙が上がった。',
  },
};
const storageKey = 'bug-quest-journal-v2';
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem(storageKey)) ?? {};
} catch {
  // The journal still works for this page session.
}
const knownRoute = (id) => typeof id === 'string' && Object.hasOwn(routes, id);
const charted = new Set(Array.isArray(saved.charted) ? saved.charted.filter((id) => knownRoute(id) && routes[id].title) : []);
const completed = new Set(Array.isArray(saved.completed) ? saved.completed.filter(knownRoute) : []);
const moves = [
  { label: '剣を横に引いた。横薙ぎが来る。', damage: 9, blocked: 2 },
  { label: '名簿に手をかざした。次は消去の呪文。', damage: 28, blocked: 4 },
  { label: '大呪文の反動でよろめいた。今なら強く斬り込める。', damage: 7, blocked: 2 },
];

let phase;
let player;
let health;
let bossHealth;
let turn;
let herbs;
let equipped;
let guarded;
let shieldReady;
let outcome;

function say(text) {
  message.textContent = text;
}

function saveJournal() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ charted: [...charted], completed: [...completed] }));
  } catch {
    // Unavailable storage does not prevent discoveries or endings.
  }
  drawJournal();
}

function discover(id) {
  if (charted.has(id)) return '';
  charted.add(id);
  saveJournal();
  return ` 図鑑に「${routes[id].title}」を登録した。`;
}

function drawJournal() {
  document.querySelector('#journal-summary').textContent = `バグ図鑑 ${charted.size}/5　エンディング ${completed.size}/6`;
  journal.replaceChildren(...Object.entries(routes).map(([id, route]) => {
    const item = document.createElement('li');
    const title = id === 'normal' ? '正面突破' : charted.has(id) ? route.title : '？？？';
    item.textContent = `${title} — ${completed.has(id) ? route.ending : '結末は未到達'}`;
    return item;
  }));
}

function drawHints() {
  for (const route of Object.values(routes).filter((entry) => entry.title)) {
    const hint = document.createElement('details');
    const title = document.createElement('summary');
    title.textContent = route.hintTitle;
    const clue = document.createElement('p');
    clue.textContent = route.clue;
    const reveal = document.createElement('details');
    const revealLabel = document.createElement('summary');
    revealLabel.textContent = '見つけ方を見る';
    const answer = document.createElement('p');
    answer.textContent = route.answer;
    reveal.append(revealLabel, answer);
    hint.append(title, clue, reveal);
    hintList.append(hint);
  }
}

function update() {
  field.hidden = phase !== 'field';
  battle.hidden = phase !== 'battle';
  ending.hidden = phase !== 'ending';
  if (phase === 'field') {
    stats.textContent = `座標 ${player.x}, ${player.y}`;
  } else if (phase === 'battle') {
    stats.textContent = `HP ${health}/${maxHealth}　魔王 ${bossHealth}/${maxBossHealth}　守り ${shieldReady ? 255 : guarded ? 1 : 0}`;
  } else {
    stats.textContent = outcome === 'normal' || outcome === 'sword' ? `残りHP ${health}/${maxHealth}` : '';
  }
  draw();
  if (phase !== 'battle') return;
  document.querySelector('#tell').textContent = moves[turn % moves.length].label;
  const heal = document.querySelector('#heal');
  heal.disabled = herbs === 0 || health === maxHealth;
  heal.textContent = `薬草（${herbs}）`;
  document.querySelector('#shield').textContent = equipped ? '盾を外す' : '盾を装備';
  for (const button of document.querySelectorAll('[data-route]')) {
    const id = button.dataset.route;
    button.hidden = !charted.has(id);
  }
  document.querySelector('#passphrase').hidden = !charted.has('command');
}

function startField(fresh = true) {
  phase = 'field';
  outcome = undefined;
  if (fresh) player = { x: 3, y: 4 };
  area.textContent = player.x > 8 ? '魔王城の外' : '渡し場の村';
  canvas.setAttribute('aria-label', '村の東に橋、その先に魔王城。北に家と小さな池、南西に紫の亀裂。');
  say(fresh ? '東の橋を渡れば魔王城。村の空き家には、まだ灯りが残っている。' : '城の門前に戻った。');
  update();
}

function move(direction) {
  if (phase !== 'field') return;
  const [dx, dy] = directions[direction];
  const x = player.x + dx;
  const y = player.y + dy;
  const nextTile = tile(x, y);
  if (nextTile === 'castle') {
    startBattle();
    return;
  }
  if (nextTile === 'crack') {
    player = { x: columns - 2, y };
    say(`森を抜けたはずが、反対側の城壁に出た。振り返ると地図に折り目が見える。${discover('wrap')}`);
  } else if (nextTile !== 'forest' && nextTile !== 'water') {
    player = { x, y };
    const observations = {
      sign: '橋のたもとに立て札がある。',
      house: '赤い屋根の空き家。机の上にメモが残っている。',
      pond: '水面に刃が光る。岸には何も落ちていない。',
      grave: '白い墓碑が木陰に並んでいる。',
      bridge: '橋板の隙間から川の音が聞こえる。',
    };
    if (nextTile === 'pond' && charted.has('sword')) observations.pond = '剣が映っていた池は、静まり返っている。';
    say(observations[nextTile] ?? (x > 8 ? '城の門は北に開いている。' : '村から東へ続く道がある。'));
  } else {
    say(nextTile === 'water' ? '流れが速くて渡れない。中央に橋がある。' : '木々が行く手をふさいでいる。');
  }
  area.textContent = player.x > 8 ? '魔王城の外' : '渡し場の村';
  update();
}

function inspect() {
  if (phase !== 'field') return;
  const { x, y } = player;
  switch (tile(x, y)) {
    case 'sign':
      say('「城へは橋を渡り、東の道を北へ」 裏面には「西の森を出たら東の城壁にいた」と走り書きがある。');
      break;
    case 'house':
      say(`机のメモ「試運転用。玉座の間で合言葉『さいしょ』を入力すると、魔王の記録が初日に戻る」${discover('command')}`);
      break;
    case 'pond':
      say(charted.has('sword') ? '池には静かな水面だけが残っている。' : `水面に映る柄を握ると、そこから神剣が抜けた。${discover('sword')}`);
      break;
    case 'grave':
      say(`存在しないはずの村人の名前が、同じ墓碑に二度ずつ刻まれている。片方の名前を紙に写した。${discover('ledger')}`);
      break;
    default:
      if (x === 1 && y === 6) say('紫の亀裂の奥に、反対側の城壁が見える。');
      else if (x > 8) say('城の門は北。南の木陰には白い墓碑が見える。');
      else say('北に赤い屋根の家と小さな池。東の橋に立て札がある。');
  }
  update();
}

function startBattle() {
  phase = 'battle';
  health = maxHealth;
  bossHealth = maxBossHealth;
  turn = 0;
  herbs = 2;
  equipped = true;
  guarded = false;
  shieldReady = charted.has('shield');
  outcome = undefined;
  document.querySelector('#password').value = '';
  area.textContent = '魔王の間';
  canvas.setAttribute('aria-label', '玉座の間で勇者と魔王が向かい合う');
  say('魔王は剣を抜いた。次の動きを読んで戦おう。');
  update();
  area.focus();
}

function finish(id) {
  phase = 'ending';
  outcome = id;
  if (id === 'loss') {
    area.textContent = '敗北　消えた名前';
    say('次の呪文が見えたら盾を構え、魔王がよろめいた隙を狙おう。');
  } else {
    const route = routes[id];
    completed.add(id);
    saveJournal();
    area.textContent = `エンディング　${route.ending}`;
    say(route.story);
  }
  canvas.setAttribute('aria-label', area.textContent);
  update();
  ArcadeResult.show({
    kind: id === 'loss' ? 'over' : 'clear',
    title: id === 'loss' ? 'ゲームオーバー' : '魔王を突破！',
    summary: id === 'loss' ? '消えた名前。魔王に敗れた……。' : `エンディング「${routes[id].ending}」`,
    action: id === 'loss' ? '結果を見る' : 'エンディングを見る',
    onAction: () => area.focus(),
  });
}

function battleAction(action) {
  if (phase !== 'battle') return;
  const posture = turn % moves.length;
  const move = moves[posture];
  let text;
  if (action === 'heal' && (!herbs || health === maxHealth)) return;
  guarded = action === 'guard' && equipped;
  if (action === 'attack' || action === 'sword') {
    const damage = action === 'sword' ? 61 : posture === 2 ? 23 : 13;
    bossHealth = Math.max(0, bossHealth - damage);
    if (bossHealth === 0) {
      finish(action === 'sword' ? 'sword' : 'normal');
      return;
    }
    text = `${action === 'sword' ? '神剣' : '攻撃'}で${damage}ダメージ。`;
  } else if (action === 'heal') {
    herbs -= 1;
    const restored = Math.min(maxHealth - health, 21);
    health += restored;
    text = `薬草でHPが${restored}回復。`;
  } else {
    text = equipped ? '盾で受け止めた。' : '身をかがめた。';
  }
  const damage = guarded ? move.blocked : action === 'guard' ? Math.ceil(move.damage / 2) : move.damage;
  health = Math.max(0, health - damage);
  turn += 1;
  if (health === 0) {
    finish('loss');
    return;
  }
  say(`${text} ${damage}ダメージを受けた。`);
  update();
}

for (const action of ['attack', 'guard', 'heal']) {
  document.querySelector(`#${action}`).addEventListener('click', () => battleAction(action));
}

document.querySelector('#shield').addEventListener('click', () => {
  if (phase !== 'battle') return;
  if (equipped && guarded && !shieldReady) {
    shieldReady = true;
    say(`盾に残った守りを二度引いた。−1になるはずが255に跳ね上がり、消去の文字が逆さに映った。${discover('shield')}`);
  } else {
    say(equipped ? '盾を外した。ターンは進まない。' : '盾を装備した。ターンは進まない。');
  }
  equipped = !equipped;
  guarded = false;
  update();
});

for (const button of document.querySelectorAll('[data-route]')) {
  const id = button.dataset.route;
  button.textContent = routes[id].command;
  button.addEventListener('click', () => {
    if (phase !== 'battle' || !charted.has(id)) return;
    if (id === 'sword') {
      battleAction('sword');
    } else if (id === 'shield' && turn % moves.length !== 1) {
      say('盾に映す呪文がない。魔王が名簿に手をかざした隙を狙おう。');
    } else {
      finish(id);
    }
  });
}

document.querySelector('#passphrase').addEventListener('submit', (event) => {
  event.preventDefault();
  if (phase !== 'battle' || !charted.has('command')) return;
  const input = document.querySelector('#password');
  const phrase = input.value.trim().normalize('NFKC').toLowerCase();
  if (['さいしょ', 'サイショ', '最初', 'saisho'].includes(phrase)) finish('command');
  else say('玉座の裏で短い音がした。空き家のメモに合言葉が残っている。');
});

document.querySelector('#retry').addEventListener('click', startBattle);
document.querySelector('#leave').addEventListener('click', () => {
  startField(false);
  area.focus();
});
document.querySelector('#restart').addEventListener('click', () => {
  startField();
  area.focus();
});
document.querySelector('#inspect').addEventListener('click', inspect);
for (const button of document.querySelectorAll('[data-dir]')) {
  button.addEventListener('click', () => move(button.dataset.dir));
}
document.addEventListener('keydown', (event) => {
  if (ArcadeResult.active || phase !== 'field' || !Object.hasOwn(arrows, event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  event.preventDefault();
  move(arrows[event.key]);
});

drawHints();
drawJournal();
startField();
