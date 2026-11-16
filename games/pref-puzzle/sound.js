(() => {
  'use strict';

  const settingKey = 'pref-puzzle-sound';
  const pentatonic = [62, 64, 66, 69, 71, 74, 76, 78];
  const maxCues = 5;
  const hz = midi => 440 * 2 ** ((midi - 69) / 12);

  class PuzzleSound {
    constructor() {
      this.supported = Boolean(window.AudioContext || window.webkitAudioContext);
      this.enabled = this.supported;
      try { this.enabled = this.supported && localStorage.getItem(settingKey) !== 'off'; } catch {}
      this.active = [];
      this.resetTiming();
    }

    resetTiming() {
      this.lastImpact = -Infinity;
      this.lastMerge = -Infinity;
      this.lastRegion = -Infinity;
      this.lastAccent = -Infinity;
      this.nextShuffle = 0;
      this.shuffleBeat = 0;
      this.combo = 0;
    }

    unlock() {
      if (!this.enabled) return;
      try {
        if (!this.context) this.setup();
        if (this.context.state !== 'running' && !this.resuming) {
          this.resuming = this.context.resume()
            .catch(() => {})
            .finally(() => { this.resuming = null; });
        }
      } catch {
        this.enabled = this.supported = false;
      }
    }

    setup() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContext();
      const master = context.createGain();
      master.gain.value = .69;
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 15;
      compressor.ratio.value = 5;
      compressor.attack.value = .003;
      compressor.release.value = .13;
      master.connect(compressor).connect(context.destination);

      const noise = context.createBuffer(1, Math.ceil(context.sampleRate * .16), context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      this.context = context;
      this.master = master;
      this.noise = noise;
    }

    toggle() {
      if (!this.supported) return;
      this.enabled = !this.enabled;
      try { localStorage.setItem(settingKey, this.enabled ? 'on' : 'off'); } catch {}
      if (this.enabled) this.unlock();
      else this.stop();
      if (this.master) {
        const time = this.context.currentTime;
        this.master.gain.setTargetAtTime(this.enabled ? .69 : 0, time, .008);
      }
    }

    get time() {
      return this.enabled && this.context?.state === 'running' && !document.hidden
        ? this.context.currentTime : null;
    }

    silence(cue, time) {
      cue.gain.gain.cancelScheduledValues(time);
      cue.gain.gain.setTargetAtTime(0, time, .007);
    }

    stop() {
      if (this.context) {
        const time = this.context.currentTime;
        for (const cue of this.active) this.silence(cue, time);
      }
      this.active = [];
      this.resetTiming();
    }

    cue(time, strength = 1) {
      if (this.active.length >= maxCues) this.silence(this.active.shift(), time);
      const gain = this.context.createGain();
      gain.gain.value = strength;
      gain.connect(this.master);
      const cue = { gain, parts: 0 };
      this.active.push(cue);
      return cue;
    }

    envelope(cue, source, output, time, length, volume, attack) {
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(.0001, time);
      gain.gain.exponentialRampToValueAtTime(volume, time + attack);
      gain.gain.exponentialRampToValueAtTime(.0001, time + length);
      output.connect(gain).connect(cue.gain);
      cue.parts += 1;
      source.onended = () => {
        source.disconnect();
        if (source !== output) output.disconnect();
        gain.disconnect();
        cue.parts -= 1;
        if (cue.parts === 0) {
          cue.gain.disconnect();
          this.active = this.active.filter(active => active !== cue);
        }
      };
    }

    tone(cue, time, midi, length, volume, { type = 'sine', bend = 0, attack = .007 } = {}) {
      const osc = this.context.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(hz(midi + bend), time);
      if (bend) osc.frequency.exponentialRampToValueAtTime(hz(midi), time + length * .45);
      this.envelope(cue, osc, osc, time, length, volume, attack);
      osc.start(time);
      osc.stop(time + length);
    }

    tap(cue, time, center, length, volume) {
      const noise = this.context.createBufferSource();
      noise.buffer = this.noise;
      const filter = this.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(center, time);
      filter.frequency.exponentialRampToValueAtTime(center * .53, time + length);
      filter.Q.value = .9;
      noise.connect(filter);
      this.envelope(cue, noise, filter, time, length, volume, .002);
      noise.start(time, 0, length);
    }

    thump(cue, time, weight) {
      this.tone(cue, time, 38, .12 + weight * .035, .24 + weight * .10, { bend: 13, attack: .003 });
      // An octave higher keeps the hit audible on small speakers.
      this.tone(cue, time, 50, .083, .15 + weight * .045, { type: 'triangle', bend: 5, attack: .003 });
      this.tap(cue, time + .004, 1420, .055, .16 + weight * .10);
    }

    land(speed) {
      const now = this.time;
      if (now === null || now - this.lastImpact < .083 || now - this.lastAccent < .13) return;
      this.lastImpact = now;
      const time = now + .006;
      const strength = Math.min(1, speed / 12);
      const cue = this.cue(time, .48 + strength * .28);
      this.tone(cue, time, 43, .104, .19, { type: 'triangle', bend: 10, attack: .004 });
      this.tap(cue, time, 1040 + strength * 300, .043, .14);
    }

    merge(count) {
      const now = this.time;
      if (now === null || now - this.lastAccent < .058) return;
      this.combo = now - this.lastMerge < .83 ? this.combo + 1 : 0;
      this.lastMerge = this.lastAccent = now;
      const time = now + .006;
      const cue = this.cue(time);
      const weight = Math.min(1, Math.log2(count) / 5);
      this.thump(cue, time, weight);
      const note = pentatonic[this.combo % pentatonic.length];
      this.tone(cue, time + .017, note, .23, .19, { type: 'triangle' });
      this.tone(cue, time + .025, note + 12, .148, .039);
      if (this.combo >= 2) this.tap(cue, time + .036, 2200, .047, .07);
    }

    region() {
      const now = this.time;
      if (now === null || now - this.lastRegion < .058) return;
      this.lastMerge = this.lastAccent = this.lastRegion = now;
      this.combo = 0;
      const time = now + .006;
      const cue = this.cue(time);
      this.thump(cue, time, .85);
      this.tone(cue, time + .023, 57, .23, .093);
      [69, 74, 78].forEach((note, i) => this.tone(cue, time + .034 + i * .063, note, .25, .16, { type: 'triangle' }));
    }

    complete() {
      const now = this.time;
      if (now === null) return;
      this.stop();
      this.lastAccent = now;
      const time = now + .009;
      const cue = this.cue(time);
      this.thump(cue, time, 1);
      this.tone(cue, time + .012, 45, .24, .16, { type: 'triangle' });
      this.tone(cue, time + .137, 50, .56, .15, { type: 'triangle' });
      [69, 74, 78, 81, 83, 86].forEach((note, i) => this.tone(cue, time + .04 + i * .064, note, .35 + i * .055, .124, { type: 'triangle' }));
      this.tap(cue, time + .24, 3500, .14, .10);
    }

    shuffle(strength) {
      const now = this.time;
      if (now === null || now < this.nextShuffle || now - this.lastAccent < .12) return;
      this.nextShuffle = now + Math.max(.118, .25 / strength);
      const time = now + .005;
      const cue = this.cue(time, .53);
      const beat = this.shuffleBeat++ % 3;
      this.tap(cue, time, 780 + 220 * beat, .055, .12);
      this.tone(cue, time, beat === 0 ? 45 : 50, .071, .10, { type: 'triangle', bend: 4 });
    }

    releaseShuffle() {
      this.nextShuffle = 0;
      this.shuffleBeat = 0;
    }
  }

  window.PuzzleSound = PuzzleSound;
})();
