'use strict';

const rounds = 3;
const bestKey = 'quick-flash-best-v1';
const pad = document.querySelector('#pad');
const headline = document.querySelector('#headline');
const detail = document.querySelector('#detail');
const roundLabel = document.querySelector('#round');
const bestLabel = document.querySelector('#best');
const announcement = document.querySelector('#announcement');
const results = [...document.querySelectorAll('.results strong')];

let state = 'ready';
let timer = 0;
let frame = 0;
let signalAt = 0;
let samples = [];
let best = null;
try {
  const saved = Number(localStorage.getItem(bestKey));
  if (Number.isFinite(saved) && saved > 0) best = saved;
} catch {}

function ms(value) {
  return `${Math.round(value)} ms`;
}

function render(next, title, hint, announce = true) {
  state = next;
  pad.dataset.state = next;
  headline.textContent = title;
  detail.textContent = hint;
  roundLabel.textContent = `${Math.min(samples.length + 1, rounds)} / ${rounds}`;
  bestLabel.textContent = best === null ? '—' : ms(best);
  results.forEach((result, i) => {
    result.textContent = i < samples.length ? ms(samples[i]) : '—';
  });
  if (announce) announcement.textContent = `${title}。${hint}`;
}

function cancelSignal() {
  clearTimeout(timer);
  cancelAnimationFrame(frame);
  signalAt = 0;
}

function beginRound() {
  render('waiting', 'まだ…', '光った瞬間に押す');
  timer = setTimeout(() => {
    frame = requestAnimationFrame(() => {
      if (document.hidden || state !== 'waiting') return;
      // Store the monotonic clock when the visible signal is committed for this frame.
      signalAt = performance.now();
      render('signal', '今！', 'タップ / Space', false);
    });
  }, 1100 + Math.random() * 2900);
}

function activate(stamp) {
  if (document.hidden || ArcadeResult.active) return;
  if (state === 'waiting' || state === 'signal' && stamp < signalAt) {
    cancelSignal();
    render('early', 'フライング！', '押してこの回をやり直す');
    return;
  }
  if (state === 'signal') {
    samples.push(stamp - signalAt);
    if (samples.length < rounds) {
      render('recorded', ms(samples.at(-1)), '押して次の測定');
      return;
    }
    const average = samples.reduce((sum, value) => sum + value, 0) / rounds;
    const record = best === null || average < best;
    if (record) {
      best = average;
      try { localStorage.setItem(bestKey, String(best)); } catch {}
    }
    render('finished', `平均 ${ms(average)}`, record ? '自己ベスト更新！' : '3回の測定完了');
    ArcadeResult.show({
      kind: 'clear',
      title: record ? `自己ベスト更新 · 平均 ${ms(average)}` : `平均 ${ms(average)}`,
      summary: samples.map(ms).join(' / '),
      action: 'もう一度測る',
      onAction: () => {
        samples = [];
        beginRound();
        pad.focus({ preventScroll: true });
      },
    });
    return;
  }
  beginRound();
}

function inputTime(event) {
  // Older browsers may provide epoch timestamps instead of the performance clock.
  const now = performance.now();
  const timestamp = event.timeStamp;
  return timestamp > 0 && timestamp <= now ? timestamp : now;
}

pad.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  pad.focus({ preventScroll: true });
  activate(inputTime(event));
});

document.addEventListener('keydown', event => {
  if (event.target !== pad && event.target !== document.body) return;
  if (event.code !== 'Space' && event.key !== 'Enter') return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  event.preventDefault();
  if (event.repeat) return;
  pad.focus({ preventScroll: true });
  activate(inputTime(event));
});

// Assistive technologies can activate the button without a pointer or a key event.
pad.addEventListener('click', event => {
  if (event.detail === 0) activate(inputTime(event));
});

pad.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || !['waiting', 'signal'].includes(state)) return;
  cancelSignal();
  render('interrupted', '測定を中断', '押してこの回をやり直す');
});

render('ready', '測定スタート', 'タップ / Space', false);
