const voices = {
  piano: { name: 'ピアノ風', partials: [1, .31, .15, .08], attack: .007, decay: .31, release: .12 },
  strings: { name: '弦楽器風', partials: [1, .43, .27, .14, .07], attack: .08, decay: .78, release: .11 },
  koto: { name: '箏風', partials: [.8, .56, .25, .22, .12], attack: .004, decay: .16, release: .09 },
  flute: { name: 'フルート風', partials: [1, .12, .06, .025], attack: .045, decay: .86, release: .065 },
  clarinet: { name: 'クラリネット風', partials: [.8, .05, .51, .03, .26], attack: .034, decay: .76, release: .07 },
  glockenspiel: {
    name: '鉄琴風', partials: [1, .24, .14, .07], ratios: [1, 2.76, 5.4, 8.9],
    attack: .004, decay: .13, release: .12,
  },
};

export const voiceNames = Object.fromEntries(Object.entries(voices).map(([id, voice]) => [id, voice.name]));

let context;

export async function startAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  context ??= new Audio();
  if (context.state !== 'running') await context.resume();
  return context;
}

export function playTone(audio, destination, voice, pitch, time, length, volume = .16) {
  const { partials, ratios, attack, decay, release } = voices[voice];
  const frequency = 440 * 2 ** ((pitch - 69) / 12);
  const envelope = audio.createGain();
  const end = time + length;
  const peak = time + Math.min(attack, length / 2);
  const sustain = Math.max(peak + .001, end - Math.min(release, length * .4));
  envelope.gain.setValueAtTime(.0001, time);
  envelope.gain.exponentialRampToValueAtTime(volume, peak);
  envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, volume * decay), sustain);
  envelope.gain.exponentialRampToValueAtTime(.0001, end);
  envelope.connect(destination);

  const oscillators = partials.map((level, index) => {
    const oscillator = audio.createOscillator();
    const harmonic = audio.createGain();
    oscillator.frequency.value = frequency * (ratios?.[index] ?? (index + 1));
    harmonic.gain.value = level;
    oscillator.connect(harmonic).connect(envelope);
    oscillator.start(time);
    oscillator.stop(end);
    if (index === partials.length - 1) {
      oscillator.onended = () => envelope.disconnect();
    }
    return oscillator;
  });
  return () => oscillators.forEach(oscillator => oscillator.stop());
}
