const totalQuestions = 10;
const noteNames = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ'];
const firstNote = 48; // MIDI C3
const endNote = 84; // MIDI C6, excluded
const partials = [
  { ratio: 1, volume: 0.13, fade: 1.45 },
  { ratio: 2, volume: 0.055, fade: 0.85 },
  { ratio: 3.003, volume: 0.023, fade: 0.5 },
  { ratio: 4.01, volume: 0.012, fade: 0.28 },
  { ratio: 6.02, volume: 0.006, fade: 0.16 },
];

const setup = document.querySelector('#setup');
const noteCountInput = document.querySelector('#note-count');
const practice = document.querySelector('#practice');
const game = document.querySelector('#game');
const question = document.querySelector('#question');
const scoreLabel = document.querySelector('#score');
const play = document.querySelector('#play');
const choices = document.querySelector('#choices');
const selectionCount = document.querySelector('#selection-count');
const octaves = document.querySelector('#octaves');
const feedback = document.querySelector('#feedback');
const submit = document.querySelector('#submit');
const next = document.querySelector('#next');
const result = document.querySelector('#result');
const resultTitle = document.querySelector('#result-title');
const finalScore = document.querySelector('#final-score');

const noteButtons = new Map();
const selection = new Set();
let audio;
let playback;
let challengeMode;
let round;
let score;
let target;

function stopPlayback() {
  if (!playback) return;
  const now = audio.currentTime;
  playback.output.gain.setTargetAtTime(0, now, 0.008);
  for (const voice of playback.voices) voice.stop(now + 0.025);
  playback = undefined;
}

function playChord(notes) {
  stopPlayback();
  const start = audio.currentTime + 0.02;

  const output = audio.createGain();
  output.connect(audio.destination);
  const voices = [];
  for (const note of notes) {
    const frequency = 440 * 2 ** ((note - 69) / 12);
    for (const { ratio, volume, fade } of partials) {
      const oscillator = audio.createOscillator();
      const envelope = audio.createGain();
      oscillator.frequency.value = frequency * ratio;
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(volume, start + 0.007);
      envelope.gain.exponentialRampToValueAtTime(volume * 0.45, start + 0.055);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + fade);
      oscillator.connect(envelope).connect(output);
      oscillator.start(start);
      oscillator.stop(start + fade);
      voices.push(oscillator);
    }
  }

  const current = { output, voices };
  playback = current;
  let remaining = voices.length;
  for (const voice of voices) {
    voice.onended = () => {
      remaining -= 1;
      if (remaining === 0) {
        output.disconnect();
        if (playback === current) playback = undefined;
      }
    };
  }
}

function noteName(note) {
  return noteNames[note % 12] + (Math.floor(note / 12) - 1);
}

function updateSelection() {
  selectionCount.textContent = `回答の音を選ぶ（${selection.size} / ${target.length}音）`;
  submit.disabled = choices.disabled || selection.size !== target.length;
}

for (let base = firstNote; base < endNote; base += 12) {
  const heading = document.createElement('h3');
  heading.textContent = `オクターブ ${Math.floor(base / 12) - 1}`;
  const keys = document.createElement('div');
  keys.className = 'keys';
  for (let note = base; note < base + 12; note += 1) {
    const key = document.createElement('button');
    key.type = 'button';
    key.textContent = noteName(note);
    key.classList.toggle('sharp', key.textContent.includes('♯'));
    key.setAttribute('aria-pressed', 'false');
    key.addEventListener('click', () => {
      if (selection.has(note)) {
        selection.delete(note);
      } else if (selection.size < target.length) {
        selection.add(note);
      } else {
        feedback.textContent = '選び直すには、選択済みの音を押して外してください。';
        return;
      }
      key.setAttribute('aria-pressed', String(selection.has(note)));
      feedback.textContent = '';
      updateSelection();
    });
    noteButtons.set(note, key);
    keys.append(key);
  }
  octaves.append(heading, keys);
}

function showQuestion() {
  stopPlayback();
  const count = challengeMode ? Math.ceil(round / 2) : Number(noteCountInput.value);
  const available = [...noteButtons.keys()];
  target = Array.from({ length: count }, () => {
    const index = Math.floor(Math.random() * available.length);
    return available.splice(index, 1)[0];
  }).sort((a, b) => a - b);
  const progress = challengeMode ? `第${round}問 / 全${totalQuestions}問` : `第${round}問`;
  question.textContent = `${progress} · ${count}音`;
  scoreLabel.textContent = `${score}点`;
  selection.clear();
  for (const key of noteButtons.values()) {
    key.setAttribute('aria-pressed', 'false');
    key.classList.remove('correct', 'incorrect');
  }
  choices.disabled = true;
  updateSelection();
  feedback.textContent = '';
  play.textContent = '出題音を聴く';
  submit.hidden = false;
  next.hidden = true;
}

play.addEventListener('click', async () => {
  const requested = target;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      feedback.textContent = 'このブラウザは音声再生に対応していません。';
      return;
    }
    audio ??= new AudioContext();
    if (audio.state !== 'running') await audio.resume();
    if (game.hidden || requested !== target) return;
    playChord(target);
    play.textContent = 'もう一度聴く';
    if (next.hidden) {
      choices.disabled = false;
      feedback.textContent = '';
      updateSelection();
    }
  } catch {
    if (!game.hidden && requested === target) {
      feedback.textContent = '音を再生できませんでした。もう一度お試しください。';
    }
  }
});

submit.addEventListener('click', () => {
  choices.disabled = true;
  const correct = target.every((note) => selection.has(note));
  if (correct) score += 1;
  scoreLabel.textContent = `${score}点`;
  for (const [note, key] of noteButtons) {
    if (target.includes(note)) key.classList.add('correct');
    else if (selection.has(note)) key.classList.add('incorrect');
  }
  const answer = target.map(noteName).join('、');
  feedback.textContent = correct ? `正解！ ${answer}` : `不正解。正解は ${answer} です。`;
  submit.hidden = true;
  next.textContent = challengeMode && round === totalQuestions ? '結果を見る' : '次の問題へ';
  next.hidden = false;
  next.focus();
});

next.addEventListener('click', () => {
  if (challengeMode && round === totalQuestions) {
    stopPlayback();
    finalScore.textContent = `${totalQuestions}点満点中 ${score}点`;
    game.hidden = true;
    result.hidden = false;
    resultTitle.focus();
    return;
  }

  round += 1;
  showQuestion();
  question.focus();
});

function startGame(random) {
  challengeMode = random;
  round = 1;
  score = 0;
  setup.hidden = true;
  result.hidden = true;
  game.hidden = false;
  showQuestion();
  question.focus();
}

function showSetup() {
  stopPlayback();
  game.hidden = true;
  result.hidden = true;
  setup.hidden = false;
  (challengeMode ? document.querySelector('#challenge') : practice).focus();
}

practice.addEventListener('click', () => startGame(false));
document.querySelector('#challenge').addEventListener('click', () => startGame(true));
document.querySelector('#restart').addEventListener('click', () => startGame(true));
document.querySelector('#back-to-setup').addEventListener('click', showSetup);
document.querySelector('#result-to-setup').addEventListener('click', showSetup);
