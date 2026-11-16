export class WashSound {
  constructor(enabled) {
    this.enabled = enabled;
    this.lastTick = 0;
    this.grain = 0;
    this.lastActive = false;
    this.lastResistance = 0;
  }

  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) this.setup();
      if (this.context.state !== 'running') this.context.resume().catch(() => {});
    } catch {
      this.enabled = false;
    }
  }

  setup() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContext();
    const ctx = this.context;
    this.master = ctx.createGain();
    this.master.gain.value = .8;
    const limiter = ctx.createDynamicsCompressor();
    this.master.connect(limiter).connect(ctx.destination);
    this.water = ctx.createGain();
    this.water.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'bandpass';
    this.filter.frequency.value = 1250;
    this.filter.Q.value = .8;
    this.filter.connect(this.water).connect(this.master);
    const length = Math.floor(ctx.sampleRate * 1.4);
    this.texture = ctx.createBuffer(1, length, ctx.sampleRate);
    const samples = this.texture.getChannelData(0);
    let shade = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      shade = .78 * shade + white * .22;
      samples[i] = .58 * white + .42 * shade;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = this.texture;
    noise.loop = true;
    noise.connect(this.filter);
    noise.start();
  }

  toggle(enabled) {
    this.enabled = enabled;
    if (enabled) this.unlock();
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? .8 : 0, this.context.currentTime, .015);
  }

  spray(active, resistance = 0) {
    if (!this.context) return;
    active = active && this.enabled;
    if (active === this.lastActive && (!active || Math.abs(resistance - this.lastResistance) < .065)) return;
    this.lastActive = active;
    this.lastResistance = resistance;
    const now = this.context.currentTime;
    this.water.gain.setTargetAtTime(active ? .16 + resistance * .085 : 0, now, .025);
    if (active) this.filter.frequency.setTargetAtTime(1350 + resistance * 700, now, .04);
  }

  tone(hz, time, duration, amount, end = hz, type = 'sine') {
    const osc = this.context.createOscillator();
    const volume = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, time);
    osc.frequency.exponentialRampToValueAtTime(end, time + duration);
    volume.gain.setValueAtTime(.0001, time);
    volume.gain.exponentialRampToValueAtTime(amount, time + .009);
    volume.gain.exponentialRampToValueAtTime(.0001, time + duration);
    osc.connect(volume).connect(this.master);
    osc.start(time);
    osc.stop(time + duration);
  }

  impact(material, strength) {
    if (!this.enabled || this.context?.state !== 'running') return;
    const now = this.context.currentTime;
    if (now - this.lastTick < .065) return;
    this.lastTick = now;
    this.grain = (this.grain + 1) % 5;
    const base = { scale: 530, mud: 150, oil: 320 }[material];
    const pitch = base * (1 + this.grain * .078);
    this.tone(pitch, now, .092, .024 + .024 * strength, pitch * .66, 'triangle');
    if (strength > .55) this.tone(pitch * 2.6, now + .012, .063, .014, pitch * 1.2);
  }

  burst() {
    if (!this.enabled || this.context?.state !== 'running') return;
    const time = this.context.currentTime;
    const jet = this.context.createBufferSource();
    const band = this.context.createBiquadFilter();
    const jetVolume = this.context.createGain();
    jet.buffer = this.texture;
    band.type = 'bandpass';
    band.frequency.setValueAtTime(2400, time);
    band.frequency.exponentialRampToValueAtTime(480, time + .24);
    jetVolume.gain.setValueAtTime(.0001, time);
    jetVolume.gain.exponentialRampToValueAtTime(.62, time + .023);
    jetVolume.gain.exponentialRampToValueAtTime(.0001, time + .25);
    jet.connect(band).connect(jetVolume).connect(this.master);
    jet.start(time, .24, .26);
    this.tone(145, time, .26, .12, 48, 'triangle');
    this.tone(410, time + .013, .15, .073, 690);
    this.tone(710, time + .04, .14, .055, 290);
  }

  chime(finished = false) {
    if (!this.enabled || this.context?.state !== 'running') return;
    const time = this.context.currentTime;
    const notes = finished ? [523, 659, 783, 1046, 1318] : [783, 1046];
    notes.forEach((note, i) => this.tone(note, time + i * .06, finished ? .44 : .2, finished ? .07 : .031));
  }
}
