import { songs } from './songs.js?v=2';
import { playTone, startAudio, voiceNames } from './audio.js?v=2';

const $ = id => document.getElementById(id);
const sheet = $('sheet');
const notes = $('notes');
const seek = $('seek');
const status = $('status');
const play = $('play');
const songPicker = $('song');
const modePicker = $('mode');
const voicePicker = $('voice');
const speedPicker = $('speed');
const minPitch = 57;
const maxPitch = 76;
const beatWidth = 64;
const lead = .8;
const pitchNames = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ'];
const staffSteps = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

let song;
let score;
let gapIndex;
let duration;
let position;
let pitch;
let chosen;
let solved;
let challenge;
let unlocked;
let playback;
let audio;
let output;
let audioRequest = 0;
let gesture;
let wheelPitch = 0;

for (const [index, item] of songs.entries()) {
  songPicker.add(new Option(item.name, index));
}
for (const [id, name] of Object.entries(voiceNames)) {
  voicePicker.add(new Option(name, id));
}

function currentVoice() {
  return voicePicker.value === 'auto' ? song.voice : voicePicker.value;
}

function makeChallenge() {
  const pool = songs.flatMap((item, songIndex) =>
    item.score.slice(2, -2).map((_, index) => ({ songIndex, gap: index + 2 })));
  const questions = Array.from({ length: 10 }, () =>
    pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return { questions, index: 0, correct: 0 };
}

function namePitch(value) {
  return pitchNames[value % 12] + (Math.floor(value / 12) - 1);
}

function staffY(value) {
  const step = Math.floor(value / 12) * 7 + staffSteps[value % 12] - 35;
  return 131 - step * 7.5;
}

function part(className, text) {
  const element = document.createElement('span');
  element.className = className;
  if (text) element.textContent = text;
  return element;
}

function drawNote(note, index, existing) {
  const element = existing || document.createElement('div');
  const gap = index === gapIndex;
  const value = gap ? pitch : note.pitch;
  const y = staffY(value);
  const hidden = gap && !chosen;
  element.className = 'note';
  element.classList.toggle('half', note.beats >= 2);
  element.classList.toggle('down', y <= 86);
  element.classList.toggle('flag', note.beats === .5);
  element.classList.toggle('gap', gap);
  element.classList.toggle('question', hidden);
  element.classList.toggle('solved', gap && solved);
  element.style.left = note.beat * beatWidth + 'px';
  element.style.top = (hidden ? 86 : y) + 'px';
  element.replaceChildren();
  if (!hidden) {
    for (const [start, step] of [[41, -15], [131, 15]]) {
      for (let ledger = start; step < 0 ? y <= ledger : y >= ledger; ledger += step) {
        const line = part('ledger');
        line.style.top = ledger - y + 5 + 'px';
        element.append(line);
      }
    }
    element.append(part('head'), part('stem'));
    if (pitchNames[value % 12].endsWith('♯')) element.append(part('accidental', '♯'));
    if (note.beats % 1 === .5 && note.beats > 1 || note.beats === 3) {
      element.append(part('dot', '·'));
    }
  }
  return element;
}

function setPosition(beat) {
  position = clamp(beat, -lead, duration);
  notes.style.transform = 'translateX(' + (-position * beatWidth) + 'px)';
  seek.value = position;
  seek.setAttribute('aria-valuetext', position < 0 ? '曲の手前' : position.toFixed(1) + '拍目');
  $('resume').disabled = position >= duration;
}

function updateControls() {
  $('stop').disabled = !playback;
  $('song-field').hidden = Boolean(challenge);
  $('round').hidden = !challenge;
  $('reset').hidden = Boolean(challenge);
  $('advance').hidden = !challenge || !solved;
  if (challenge) {
    const current = challenge.index + 1;
    const total = challenge.questions.length;
    $('round').textContent = current + ' / ' + total + '問 · 正解 ' + challenge.correct;
    $('advance').textContent = current === total ? 'もう一度挑戦' : '次の問題 →';
  }
  for (const id of ['lower', 'higher', 'preview', 'submit']) $(id).disabled = !unlocked || solved;
  if (unlocked && !solved) {
    $('lower').disabled = pitch === minPitch;
    $('higher').disabled = pitch === maxPitch;
  }
}

function reset(sameSong) {
  stop();
  const previous = sameSong ? gapIndex : -1;
  const question = challenge?.questions[challenge.index];
  song = songs[question?.songIndex ?? Number(songPicker.value)];
  duration = 0;
  score = song.score.map(([pitch, beats]) => {
    const note = { pitch, beats, beat: duration };
    duration += beats;
    return note;
  });
  const candidates = score.map((_, index) => index).slice(2, -2).filter(index => index !== previous);
  gapIndex = question?.gap ?? candidates[Math.floor(Math.random() * candidates.length)];
  pitch = 60;
  chosen = false;
  solved = false;
  unlocked = false;
  wheelPitch = 0;
  gesture = undefined;
  seek.min = -lead;
  seek.max = duration;
  seek.step = 'any';
  $('pitch').textContent = namePitch(pitch);
  $('track-title').textContent = song.name;
  $('source').href = song.source;
  notes.replaceChildren(...score.map((note, index) => drawNote(note, index)));
  setPosition(-lead);
  status.textContent = '抜けた音だけ無音で再生します。';
  updateControls();
}

function stop() {
  audioRequest += 1;
  if (!playback) return;
  playback.bus.disconnect();
  for (const cancel of playback.cancelTones) cancel();
  cancelAnimationFrame(playback.frame);
  playback = undefined;
  updateControls();
}

function playbackPosition() {
  if (!playback) return position;
  const { startBeat, startTime, beatLength } = playback;
  return startBeat + Math.max(0, audio.currentTime - startTime) / beatLength;
}

async function playSong(startBeat) {
  stop();
  const request = ++audioRequest;
  try {
    audio = await startAudio();
  } catch {
    if (request === audioRequest) status.textContent = '音声を開始できませんでした。再生ボタンをもう一度押してください。';
    return;
  }
  if (request !== audioRequest) return;
  if (!output) {
    output = audio.createDynamicsCompressor();
    output.threshold.value = -18;
    output.ratio.value = 5;
    output.connect(audio.destination);
  }

  const startTime = audio.currentTime + .045;
  const beatLength = 60 / (song.bpm * Number(speedPicker.value));
  const voice = currentVoice();
  const bus = audio.createGain();
  bus.connect(output);
  const cancelTones = [];
  score.forEach((note, index) => {
    const onset = Math.max(note.beat, startBeat);
    const remaining = (note.beat + note.beats - onset) * beatLength;
    if (remaining < .004 || (index === gapIndex && !solved)) return;
    cancelTones.push(playTone(audio, bus, voice, note.pitch,
      startTime + (onset - startBeat) * beatLength, remaining * .96));
  });
  playback = { bus, cancelTones, startBeat, startTime, beatLength, frame: 0 };
  unlocked = true;
  status.textContent = voiceNames[voice] + 'で再生中 · ' + speedPicker.value + '倍';
  setPosition(startBeat);
  updateControls();

  function tick() {
    const beat = playbackPosition();
    setPosition(beat);
    if (beat < duration + .2) {
      playback.frame = requestAnimationFrame(tick);
      return;
    }
    stop();
    setPosition(score[gapIndex].beat);
    status.textContent = solved ? '正解の音を入れて再生しました。' : '縦に動かして、抜けた音を選んでください。';
    updateControls();
  }
  playback.frame = requestAnimationFrame(tick);
}

function previewPitch(value, delay = 0) {
  if (audio?.state === 'running') {
    playTone(audio, output, currentVoice(), value, audio.currentTime + delay, .2, .12);
  }
}

function scrub(target) {
  const previous = playbackPosition();
  stop();
  const next = clamp(target, -lead, duration);
  const forward = next >= previous;
  const crossed = score.filter(note => forward
    ? previous < note.beat && note.beat <= next
    : next <= note.beat && note.beat < previous);
  if (!forward) crossed.reverse();
  let delay = 0;
  for (const note of crossed) {
    if (note !== score[gapIndex]) previewPitch(note.pitch, delay);
    else if (chosen) previewPitch(pitch, delay);
    delay += Math.min(.035, .22 / crossed.length);
  }
  setPosition(next);
}

function stepNote(direction) {
  const list = direction > 0 ? score : [...score].reverse();
  const beat = playbackPosition();
  const note = list.find(note => (note.beat - beat) * direction > .001);
  scrub(note?.beat ?? (direction > 0 ? duration : -lead));
}

function changePitch(amount) {
  if (!unlocked || solved) return;
  stop();
  const next = clamp(pitch + amount, minPitch, maxPitch);
  const direction = Math.sign(next - pitch);
  let delay = 0;
  while (pitch !== next) {
    pitch += direction;
    previewPitch(pitch, delay);
    delay += .035;
  }
  if (!chosen) setPosition(score[gapIndex].beat);
  chosen = true;
  $('pitch').textContent = namePitch(pitch);
  drawNote(score[gapIndex], gapIndex, notes.children[gapIndex]);
  updateControls();
}

function submitAnswer() {
  if (!unlocked || solved) return;
  const answer = score[gapIndex];
  stop();
  const correct = pitch === answer.pitch;
  solved = correct || Boolean(challenge);
  const submitted = pitch;
  if (challenge && correct) challenge.correct += 1;
  if (solved) pitch = answer.pitch;
  chosen = true;
  $('pitch').textContent = namePitch(pitch);
  drawNote(answer, gapIndex, notes.children[gapIndex]);
  if (solved) {
    setPosition(answer.beat);
    previewPitch(pitch);
    const answerText = '抜けていた音は ' + namePitch(pitch) + ' です。';
    status.textContent = (correct ? '正解！ ' : namePitch(submitted) + ' は不正解。') + answerText;
    if (challenge && challenge.index === challenge.questions.length - 1) {
      status.textContent += ' 結果は ' + challenge.questions.length + '問中 ' + challenge.correct + '問正解です。';
    }
  } else {
    status.textContent = namePitch(pitch) + ' は違うようです。曲を聴き直して、別の音を試してください。';
  }
  updateControls();
}

play.addEventListener('click', () => playSong(-lead));
$('resume').addEventListener('click', () => playSong(playbackPosition()));
$('stop').addEventListener('click', () => {
  const beat = playbackPosition();
  stop();
  setPosition(beat);
  status.textContent = '再生を停止しました。';
});
for (const picker of [voicePicker, speedPicker]) {
  picker.addEventListener('change', () => {
    const beat = playbackPosition();
    if (playback && beat < duration) playSong(beat);
  });
}
function changeMode() {
  challenge = modePicker.value === 'random' ? makeChallenge() : undefined;
  reset(false);
}

modePicker.addEventListener('change', changeMode);
$('advance').addEventListener('click', () => {
  if (!challenge || !solved) return;
  if (challenge.index + 1 === challenge.questions.length) challenge = makeChallenge();
  else challenge.index += 1;
  reset(false);
});
songPicker.addEventListener('change', () => reset(false));
$('reset').addEventListener('click', () => reset(true));
$('previous').addEventListener('click', () => stepNote(-1));
$('next').addEventListener('click', () => stepNote(1));
seek.addEventListener('input', () => scrub(Number(seek.value)));
$('lower').addEventListener('click', () => changePitch(-1));
$('higher').addEventListener('click', () => changePitch(1));
$('preview').addEventListener('click', () => {
  stop();
  previewPitch(pitch);
});
$('submit').addEventListener('click', submitAnswer);

sheet.addEventListener('wheel', event => {
  if (event.ctrlKey || event.metaKey) return;
  const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? sheet.clientWidth : 1;
  if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    event.preventDefault();
    scrub(playbackPosition() + (event.deltaX || event.deltaY) * scale / beatWidth);
    return;
  }
  if (!unlocked || solved) return;
  event.preventDefault();
  wheelPitch -= event.deltaY * scale / 40;
  const steps = Math.trunc(wheelPitch);
  if (steps) {
    wheelPitch -= steps;
    changePitch(steps);
  }
}, { passive: false });

sheet.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  sheet.focus({ preventScroll: true });
  sheet.setPointerCapture(event.pointerId);
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, position: playbackPosition(), axis: '', steps: 0 };
});

sheet.addEventListener('pointermove', event => {
  if (gesture?.id !== event.pointerId) return;
  const dx = gesture.x - event.clientX;
  const dy = gesture.y - event.clientY;
  if (!gesture.axis) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
    gesture.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
  }
  if (gesture.axis === 'x') {
    scrub(gesture.position + dx / beatWidth);
  } else {
    const steps = Math.trunc(dy / 24);
    if (steps !== gesture.steps) {
      changePitch(steps - gesture.steps);
      gesture.steps = steps;
    }
  }
});

sheet.addEventListener('lostpointercapture', () => { gesture = undefined; });
sheet.addEventListener('keydown', event => {
  const actions = {
    ArrowLeft: () => stepNote(-1),
    ArrowRight: () => stepNote(1),
    ArrowUp: () => changePitch(1),
    ArrowDown: () => changePitch(-1),
    Enter: submitAnswer,
  };
  const action = actions[event.key];
  if (!action) return;
  event.preventDefault();
  action();
});

changeMode();
