const voices = {
  piano: { partials: [1, .31, .15, .08], attack: .007, decay: .31, release: .12 },
  strings: { partials: [1, .43, .27, .14, .07], attack: .08, decay: .78, release: .11 },
  koto: { partials: [.8, .56, .25, .22, .12], attack: .004, decay: .16, release: .09 },
};

let context;

export async function startAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  context ??= new Audio();
  if (context.state !== 'running') await context.resume();
  return context;
}

export function playTone(audio, destination, voice, pitch, time, length, volume = .16) {
  const { partials, attack, decay, release } = voices[voice];
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
    oscillator.frequency.value = frequency * (index + 1);
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
