import { PALETTES, makeTrials, isRing, dotColor, summarize } from './core.mjs';
const $ = selector => document.querySelector(selector);
const answerButtons = [...document.querySelectorAll('[data-answer]')];
let trials = [];
let answers = [];
let selected = null;
let practice = true;
let completedAt = '';
let active = false;
function draw(canvas, trial) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  const size = canvas.width;
  context.fillStyle = '#e8e8e0';
  context.fillRect(0, 0, size, size);
  // Geometry/noise are sampled without depending on figure membership.
  const step = 0.068;
  for (let row = -14; row <= 14; row++) {
    for (let col = -14; col <= 14; col++) {
      const x = (col + (Math.random() - 0.5) * 0.4) * step;
      const y = (row + (Math.random() - 0.5) * 0.4) * step;
      if (Math.hypot(x, y) > 0.92) continue;
      const radius = (0.021 + Math.random() * 0.008) * size * 0.47;
      context.fillStyle = dotColor(trial, isRing(x, y, trial.direction), Math.random());
      context.beginPath();
      context.arc(size / 2 + x * size * 0.47, size / 2 + y * size * 0.47, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
}
function show(id) {
  for (const name of ['setup', 'session', 'result']) $(`#${name}`).hidden = name !== id;
  const target = id === 'setup' ? $('#setup-title') : $(`#${id}-title`);
  target.tabIndex = -1;
  target.focus({ preventScroll: true });
  $(`#${id}`).scrollIntoView({ block: 'start' });
}
function clearChoice() {
  selected = null;
  answerButtons.forEach(button => button.setAttribute('aria-pressed', 'false'));
  $('#next').disabled = true;
  $('#feedback').textContent = '';
}
function renderTrial() {
  clearChoice();
  const trial = practice ? { practice: true, direction: 0 } : trials[answers.length];
  $('#phase').textContent = practice ? '02 / 練習' : `02 / 観察 ${answers.length + 1} / 12`;
  $('#progress').value = answers.length;
  $('#instruction').textContent = practice
    ? 'まずは明暗の差がある練習です。右に開いた輪っかを探してください。'
    : `${answers.length + 1}枚目。輪っかが見えたら切れ目の向きを。見えなければ「わからない」を選んでください。`;
  $('#next').textContent = practice ? '12枚の観察を始める →' : answers.length === 11 ? '観察メモを見る →' : '次の一枚へ →';
  $('#plate').setAttribute('aria-label', practice ? '明暗の点で描いた、右に開いた練習用の輪っか。' : '色の点で描かれた輪っか。切れ目の向きを選んでください。');
  draw($('#plate'), trial);
}
$('#setup-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  trials = makeTrials();
  answers = [];
  practice = true;
  active = true;
  try {
    renderTrial();
    show('session');
  } catch {
    active = false;
    $('#start').disabled = true;
    $('#start').textContent = 'このブラウザでは図を表示できません';
  }
});
answerButtons.forEach(button => button.addEventListener('click', () => {
  if (!active) return;
  selected = button.dataset.answer === 'unsure' ? 'unsure' : Number(button.dataset.answer);
  answerButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  $('#next').disabled = false;
  $('#feedback').textContent = '選択しました。次へ進めます。';
}));
$('#next').addEventListener('click', () => {
  if (!active || selected === null) return;
  if (practice) {
    if (selected !== 0) {
      $('#feedback').textContent = '練習は右が切れています。図が見えない・操作が難しいときは、中断してください。';
      return;
    }
    practice = false;
  } else {
    answers.push({ ...trials[answers.length], choice: selected });
  }
  if (answers.length === 12) finish();
  else {
    renderTrial();
    $('#session-title').focus({ preventScroll: true });
  }
});
function finish() {
  active = false;
  completedAt = new Date().toLocaleString('ja-JP');
  $('#summary').replaceChildren();
  for (const group of summarize(answers)) {
    const row = document.createElement('tr');
    [group.name, group.matched, group.different, group.unsure].forEach((value, index) => {
      const cell = document.createElement(index === 0 ? 'th' : 'td');
      if (index === 0) cell.scope = 'row';
      cell.textContent = value;
      row.append(cell);
    });
    $('#summary').append(row);
  }
  const hasDifficulty = answers.some(answer => answer.choice !== answer.direction);
  $('#result-message').textContent = hasDifficulty
    ? '向きが合わなかった・わからなかった枚がありました。画面や照明、課題の難しさでも起こります。色覚異常を示す結果ではありません。'
    : '今回は12枚とも向きが一致しました。ただし、色覚異常がないことの確認にはなりません。';
  $('#progress').value = 12;
  selected = null;
  show('result');
}
function reset() {
  active = false;
  answers = [];
  trials = [];
  completedAt = '';
  clearChoice();
  $('#summary').replaceChildren();
  $('#result-message').textContent = '';
  $('#setup-form').reset();
  const context = $('#plate').getContext('2d');
  context?.clearRect(0, 0, 640, 640);
  show('setup');
}
$('#quit').addEventListener('click', reset);
$('#reset').addEventListener('click', reset);
$('#download').addEventListener('click', () => {
  if (answers.length !== 12) return;
  const names = ['右', '下', '左', '上'];
  const lines = ['いろのわ 観察メモ v1.0', completedAt,
    '独自の未検証課題。診断・正常判定・色覚の型や程度・適性判断には使えません。',
    '今回の端末・環境での記録です。全て一致しても色覚異常は否定できません。',
    '環境チェック3項目：本人確認済み（機器による校正・検証なし）。',
    '観察：両眼、または普段の見方。眼別の検査ではありません。', '',
    ...summarize(answers).map(group => `${group.name}：一致 ${group.matched} / 不一致 ${group.different} / わからない ${group.unsure}`), '',
    ...answers.map((answer, i) => `${i + 1}枚目 / ${PALETTES[answer.palette].name} / 色差段階${answer.level + 1} / 図の向き:${names[answer.direction]} / 回答:${answer.choice === 'unsure' ? 'わからない' : names[answer.choice]}`), '',
    '根拠・限界：https://pubmed.ncbi.nlm.nih.gov/40793535/',
    'https://www.nichigan.or.jp/public/disease/name.html?pdid=33'];
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ironowa-observation.txt';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
try { draw($('#cover'), { palette: 0, level: 0, direction: 0 }); } catch { $('#cover').hidden = true; }
