/* Canvas effects use the game clock, so pausing also pauses the celebration. */
(() => {
  'use strict';
  const colors = ['#ffe487', '#fff9df', '#ffadca', '#92e6dd', '#c8b2ff', '#ffc376'];
  class PuzzleEffects {
    constructor(canvas, overlay) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.overlay = overlay;
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.resize();
      this.reset();
    }

    resize() {
      this.width = innerWidth;
      this.height = innerHeight;
      this.dpr = Math.min(devicePixelRatio || 1, 1.5);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
    }

    reset() {
      this.particles = [];
      this.labels = [];
      this.rings = [];
      this.completeAt = null;
      this.lastTime = null;
      this.overlay.hidden = true;
      document.body.classList.remove('celebrating');
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    burst(x, y, count, fountain = 0) {
      if (this.reduced) return;
      const size = Math.min(1, this.width / 700);
      for (let i = 0; i < count && this.particles.length < 640; i++) {
        const angle = fountain ? -Math.PI / 2 + (Math.random() - 0.5) * 1.2 : Math.random() * Math.PI * 2;
        const speed = (fountain ? 380 + Math.random() * 430 : 90 + Math.random() * 330) * size;
        this.particles.push({ x, y, vx: Math.cos(angle) * speed + fountain * 65 * size,
          vy: Math.sin(angle) * speed, gravity: (100 + Math.random() * 190) * size,
          life: 1700 + Math.random() * 1900, age: 0,
          size: (3 + Math.random() * 6) * Math.max(0.65, size),
          rotation: Math.random() * 6.28, spin: (Math.random() - 0.5) * 7,
          color: colors[Math.floor(Math.random() * colors.length)], kind: i % 3 });
      }
    }

    score(points, x, y, time) {
      this.labels.push({ text: `+${points.toLocaleString('ja-JP')}`, x, y, born: time, large: points >= 1_000_000 });
      if (this.labels.length > 8) this.labels.shift();
      this.burst(x, y, points >= 1_000_000 ? 32 : 15);
    }

    region(x, y) {
      if (this.reduced) return;
      this.burst(x, y, 96);
      this.rings.push({ x, y, age: 0, color: '#e9bc55' });
    }

    celebrate(time, duration = Infinity) {
      this.completeAt = time;
      this.duration = duration;
      this.nextWave = 0;
      this.nextFountain = 0;
      this.overlay.hidden = false;
      document.body.classList.add('celebrating');
      this.labels = [];
      this.burst(this.width * 0.5, this.height * 0.4, 200);
    }

    draw(time) {
      const c = this.ctx, w = this.width, h = this.height;
      const dt = this.lastTime === null ? 0 : Math.max(0, Math.min(70, time - this.lastTime));
      this.lastTime = time;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      if (this.completeAt !== null) {
        const age = time - this.completeAt;
        if (age >= this.duration) {
          this.completeAt = null;
          this.overlay.hidden = true;
          document.body.classList.remove('celebrating');
        } else {
          if (!this.reduced) {
            const alpha = Math.min(1, age / 300) * Math.min(1, (this.duration - age) / 900);
            c.save();
            c.translate(w / 2, h * 0.42);
            c.rotate(age / 12000);
            for (let i = 0; i < 14; i++) {
              c.rotate(Math.PI * 2 / 14);
              const glow = c.createLinearGradient(0, 0, 0, -h);
              glow.addColorStop(0, `rgba(255,211,99,${alpha * 0.15})`);
              glow.addColorStop(0.8, 'rgba(255,231,175,0)');
              c.fillStyle = glow;
              c.beginPath(); c.moveTo(0, 0); c.lineTo(-h * 0.09, -h); c.lineTo(h * 0.09, -h); c.fill();
            }
            c.restore();
            if (age >= this.nextWave && age < this.duration - 1000) {
              this.nextWave += 520;
              const x = w * (0.18 + Math.random() * 0.64), y = h * (0.16 + Math.random() * 0.43);
              this.burst(x, y, 55);
              this.rings.push({ x, y, age: 0, color: colors[this.rings.length % colors.length] });
            }
            if (age >= this.nextFountain && age < this.duration - 1500) {
              this.nextFountain += 150;
              this.burst(w * 0.04, h * 0.95, 9, 1);
              this.burst(w * 0.96, h * 0.95, 9, -1);
            }
          }
        }
      }
      for (const ring of this.rings) {
        ring.age += dt;
        c.globalAlpha = Math.max(0, 1 - ring.age / 900) * 0.7;
        c.strokeStyle = ring.color; c.lineWidth = 2;
        c.beginPath(); c.arc(ring.x, ring.y, 10 + ring.age * 0.16, 0, Math.PI * 2); c.stroke();
      }
      this.rings = this.rings.filter(r => r.age < 900);
      for (const p of this.particles) {
        p.age += dt;
        p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
        p.vy += p.gravity * dt / 1000;
        p.rotation += p.spin * dt / 1000;
        c.save(); c.translate(p.x, p.y); c.rotate(p.rotation);
        c.globalAlpha = Math.max(0, Math.min(1, (p.life - p.age) / 650));
        c.fillStyle = p.color;
        if (p.kind === 0) {
          c.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4, r = p.size * (i % 2 ? 0.25 : 1.3);
            c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          c.closePath(); c.fill();
        } else if (p.kind === 1) {
          c.scale(Math.cos(p.age / 180), 1);
          c.fillRect(-p.size / 2, -p.size, p.size, p.size * 2);
        } else {
          c.beginPath(); c.arc(0, 0, p.size * 0.4, 0, Math.PI * 2); c.fill();
        }
        c.restore();
      }
      this.particles = this.particles.filter(p => p.age < p.life && p.y < h + 30);
      c.globalAlpha = 1;
      for (const label of this.labels) {
        const age = time - label.born;
        const progress = Math.min(1, age / 1100);
        c.save();
        c.globalAlpha = this.reduced ? 1 - progress : Math.min(1, (1 - progress) * 3);
        const x = Math.max(w * 0.28, Math.min(w * 0.72, label.x));
        c.translate(x, label.y - (this.reduced ? 0 : progress * 65));
        if (!this.reduced) {
          const scale = 1 + (1 - Math.min(1, age / 180)) * 0.25;
          c.scale(scale, scale);
        }
        c.font = `900 ${label.large ? 29 : 22}px "Noto Sans JP",sans-serif`;
        c.textAlign = 'center'; c.lineWidth = 5; c.lineJoin = 'round';
        c.strokeStyle = '#fffef9'; c.strokeText(label.text, 0, 0);
        c.fillStyle = label.large ? '#ac7722' : '#2c645a'; c.fillText(label.text, 0, 0);
        c.restore();
      }
      this.labels = this.labels.filter(label => time - label.born < 1100);
      c.globalAlpha = 1;
    }
  }
  window.PuzzleEffects = PuzzleEffects;
})();
