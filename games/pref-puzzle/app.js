(() => {
  'use strict';
  const $ = id => document.getElementById(id), M = window.Matter;
  M.Common.setDecomp(window.decomp);
  const cv = $('game'), ctx = cv.getContext('2d'), wrap = $('canvas-wrap'), button = $('shuffle');
  const game = new PuzzleCore.Puzzle(M, PREFECTURE_DATA);
  const effects = new PuzzleEffects($('effects'), $('complete-celebration'));
  const sound = new PuzzleSound(), soundButton = $('sound');
  const falling = new WeakSet(), landings = new Map();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let displayedScore = 0, scorePulse = null;
  let regionQueue = [], regionUntil = null;
  let dpr = 1, cssW = 0, cssH = 0, holdingPointer = null, holdKey = null, aiming = null;
  let resetTimer = 0, toastTimer = 0, shownOver = false, lastStats = '', lastNext = -1, best = 0, paused = false;
  try { best = Number(localStorage.getItem('pref-puzzle-best')) || 0; } catch {}
  $('best').textContent = best.toLocaleString('ja-JP');

  function updateSoundButton() {
    soundButton.textContent = sound.supported ? `効果音 ${sound.enabled ? 'ON' : 'OFF'}` : '効果音 非対応';
    soundButton.setAttribute('aria-pressed', String(sound.enabled));
    soundButton.disabled = !sound.supported;
  }
  soundButton.addEventListener('click', () => { sound.toggle(); updateSoundButton(); });
  updateSoundButton();

  function unlockSound() {
    sound.unlock();
    if (!sound.supported) updateSoundButton();
  }

  function drop() {
    unlockSound();
    if (game.drop()) falling.add(game.groups.at(-1).body);
  }

  M.Events.on(game.engine, 'collisionStart', ({ pairs }) => {
    if (!sound.enabled) return;
    for (const { bodyA, bodyB, collision } of pairs) {
      const a = bodyA.parent, b = bodyB.parent;
      if (!falling.has(a) && !falling.has(b)) continue;
      const floor = game.walls.at(-1);
      const { x, y } = collision.normal;
      const speed = Math.abs((a.velocity.x - b.velocity.x) * x + (a.velocity.y - b.velocity.y) * y);
      if (speed < 2.2) continue;
      if (falling.has(a) && (b.group || b === floor)) landings.set(a, Math.max(landings.get(a) || 0, speed));
      if (falling.has(b) && (a.group || a === floor)) landings.set(b, Math.max(landings.get(b) || 0, speed));
    }
  });

  function playLandings() {
    let strongest = 0;
    for (const [body, speed] of landings) {
      falling.delete(body);
      if (game.groups.includes(body.group)) strongest = Math.max(strongest, speed);
    }
    landings.clear();
    if (strongest) sound.land(strongest);
  }

  function resetHold() {
    game.setShuffling(false);
    sound.releaseShuffle();
    holdingPointer = null;
    holdKey = null;
    button.classList.remove('holding');
    wrap.classList.remove('shaking');
    button.setAttribute('aria-pressed', 'false');
  }

  function announce(text) {
    $('toast').textContent = text;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2100);
  }

  function clearRegionNotices() {
    regionQueue = [];
    regionUntil = null;
    $('region-complete').hidden = true;
  }

  function updateRegionNotice() {
    if (game.over || game.completeAt !== null) { clearRegionNotices(); return; }
    if (regionUntil !== null && game.time < regionUntil) return;
    const region = regionQueue.shift();
    if (!region) { $('region-complete').hidden = true; regionUntil = null; return; }
    $('region-title').textContent = `${region.name}完成！`;
    $('region-points').textContent = `+${region.bonus.toLocaleString('ja-JP')}点`;
    const banner = $('region-complete');
    banner.hidden = false;
    if (!reducedMotion) banner.animate([
      { opacity: 0, transform: 'translate(-50%,10px) scale(.85)' },
      { opacity: 1, transform: 'translate(-50%,0) scale(1)' }
    ], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    regionUntil = game.time + 2300;
    const rect = banner.getBoundingClientRect();
    effects.region(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function start() {
    resetHold();
    sound.stop();
    clearTimeout(resetTimer);
    resetTimer = 0;
    $('reset').classList.remove('armed');
    $('reset-label').textContent = 'リセット';
    game.reset();
    effects.reset();
    clearRegionNotices();
    displayedScore = 0;
    shownOver = false;
    lastStats = '';
    lastNext = -1;
    $('result').hidden = true;
    $('empty-hint').style.opacity = 1;
    updateUI();
    cv.focus({ preventScroll: true });
  }
  function pulseScore() {
    if (reducedMotion) return;
    scorePulse?.cancel();
    scorePulse = $('score').animate([
      { transform: 'scale(1)', color: '#253f39' },
      { transform: 'scale(1.15)', color: '#bc8429', offset: 0.2 },
      { transform: 'scale(1)', color: '#253f39' }
    ], { duration: 480, easing: 'ease-out' });
  }
  game.onMerge = (count, points, group, regions = []) => {
    if (!regions.length) {
      announce(`${count}県合体`);
      sound.merge(count);
    }
    points += regions.reduce((sum, region) => sum + region.bonus, 0);
    const rect = cv.getBoundingClientRect(), scale = rect.width / game.width;
    effects.score(points, rect.left + group.body.position.x * scale,
      Math.max(70, Math.min(innerHeight - 80, rect.top + group.body.position.y * scale)), game.time);
    pulseScore();
  };
  game.onRegionComplete = region => {
    if (game.completeAt !== null) return;
    sound.region();
    clearTimeout(toastTimer); $('toast').classList.remove('show');
    regionQueue.push(region);
    updateRegionNotice();
    pulseScore();
  };
  game.onComplete = (round, bonus) => {
    resetHold();
    sound.complete();
    clearRegionNotices();
    clearTimeout(toastTimer); $('toast').classList.remove('show');
    $('complete-round').textContent = `${round}周目`;
    $('complete-total').textContent = PuzzleCore.ROUND_SCORE.toLocaleString('ja-JP');
    $('complete-bonus').textContent = `完成ボーナス +${bonus.toLocaleString('ja-JP')}点`;
    $('next-round').textContent = `${round + 1}周目へ`;
    effects.celebrate(game.time);
    $('next-round').focus({ preventScroll: true });
    pulseScore();
  };
  game.onRound = round => {
    resetHold(); sound.stop(); effects.reset(); announce(`${round}周目`);
    updateUI(); cv.focus({ preventScroll: true });
  };

  function resize() {
    const rect = cv.getBoundingClientRect();
    cssW = rect.width; cssH = rect.height;
    if (!cssW || !cssH) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    const worldW = cssW > 650 ? 850 : 600;
    // Match the actual canvas aspect ratio: extra room comes from the layout
    // and raised overflow line, never from squeezing the counties vertically.
    game.resize(worldW, worldW * cssH / cssW);
    effects.resize();
    lastNext = -1;
  }
  new ResizeObserver(resize).observe(wrap);

  function path(c, pts) {
    c.beginPath();
    pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
    c.closePath();
  }

  function drawShape(c, shape, x, y, angle = 0, scale = 1, labels = true, alpha = 1) {
    c.save(); c.globalAlpha = alpha; c.translate(x, y); c.rotate(angle); c.scale(scale, scale);
    for (const item of shape.shapes) {
      path(c, item.pts);
      c.fillStyle = item.pref.color; c.fill();
      // A thin colored seam replaces the old white outline that looked like air.
      c.strokeStyle = '#405c4338'; c.lineJoin = 'round'; c.lineWidth = 0.45 / scale; c.stroke();
    }
    if (labels) for (const item of shape.shapes) {
      const center = item.label || M.Vertices.centre(item.pts);
      const xs = item.pts.map(p => p.x), ys = item.pts.map(p => p.y);
      const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
      if (w < 17 || h < 15) continue;
      c.save(); c.translate(center.x, center.y); c.rotate(-angle);
      c.fillStyle = '#3d5146'; c.strokeStyle = '#fffef9b0';
      c.font = `600 ${Math.min(13, Math.max(8, w / 4))}px "Noto Sans JP",sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 2;
      c.strokeText(item.pref.label, 0, 0); c.fillText(item.pref.label, 0, 0); c.restore();
    }
    c.restore();
  }

  function draw() {
    if (!cssW || !cssH) return;
    const scale = dpr * cssW / game.width;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, game.width, game.height);
    ctx.fillStyle = '#fbfcf6'; ctx.fillRect(0, game.rim, game.width, game.floor - game.rim);
    ctx.fillStyle = '#aebfac3b';
    for (let x = 25; x < game.width; x += 30) for (let y = game.rim + 30; y < game.floor; y += 30) {
      ctx.beginPath(); ctx.arc(x, y, 0.65, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#afbdad'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, game.rim); ctx.lineTo(0, game.floor + 2.5);
    ctx.lineTo(game.width, game.floor + 2.5); ctx.lineTo(game.width, game.rim); ctx.stroke();
    ctx.strokeStyle = game.overSince !== null ? '#b54f3c' : '#c79985'; ctx.lineWidth = 1.2; ctx.setLineDash([7, 8]);
    ctx.beginPath(); ctx.moveTo(2, game.rim); ctx.lineTo(game.width - 2, game.rim); ctx.stroke(); ctx.setLineDash([]);
    for (const group of game.groups) {
      if (game.completeAt !== null) {
        const pts = group.shape.shapes.flatMap(item => item.pts);
        const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const fit = Math.min(game.width * 0.72 / (maxX - minX), game.height * 0.58 / (maxY - minY));
        ctx.save(); ctx.shadowColor = '#ffc956'; ctx.shadowBlur = 22;
        drawShape(ctx, group.shape, game.width / 2 - (maxX + minX) / 2 * fit,
          game.height * 0.67 - (maxY + minY) / 2 * fit, 0, fit);
        ctx.restore();
      } else {
        drawShape(ctx, group.shape, group.body.position.x, group.body.position.y, group.body.angle);
      }
    }
    if (game.current && !game.over && game.completeAt === null && game.time >= game.readyAt) {
      const shape = game.shape([game.current]);
      ctx.strokeStyle = '#8da98c66'; ctx.lineWidth = 1; ctx.setLineDash([3, 7]);
      ctx.beginPath(); ctx.moveTo(game.aim, 90); ctx.lineTo(game.aim, game.floor - 4); ctx.stroke(); ctx.setLineDash([]);
      drawShape(ctx, shape, game.aim, 54, 0, 1, true, 0.95);
    }
  }

  function drawNext() {
    if (lastNext === game.next) return;
    lastNext = game.next;
    const n = $('next'), c = n.getContext('2d'); c.clearRect(0, 0, n.width, n.height);
    if (!game.next) { $('next-name').textContent = game.completeAt !== null ? '次の周へ' : 'なし'; return; }
    const shape = game.shape([game.next]), pts = shape.shapes[0].pts;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const scale = Math.min(55 / (Math.max(...xs) - Math.min(...xs)), 43 / (Math.max(...ys) - Math.min(...ys)));
    drawShape(c, shape, 36 - (Math.max(...xs) + Math.min(...xs)) / 2 * scale,
      26 - (Math.max(...ys) + Math.min(...ys)) / 2 * scale, 0, scale, false);
    $('next-name').textContent = game.prefs.get(game.next).label;
  }

  function updateUI() {
    const stats = `${game.score}:${game.dropped}:${game.round}`;
    if (stats !== lastStats) {
      lastStats = stats;
      $('score').classList.toggle('long', game.score >= 1_000_000);
      $('count').textContent = game.dropped;
      $('count-bar').style.width = game.dropped / 47 * 100 + '%';
      const largest = game.groups.reduce((a, b) => !a || b.ids.length > a.ids.length ? b : a, null);
      $('largest').textContent = largest ? `${game.prefs.get(largest.ids[0]).label}${largest.ids.length > 1 ? ` ほか${largest.ids.length - 1}県` : ''}（${largest.ids.length}県）` : '—';
      $('empty-hint').style.opacity = game.dropped ? 0 : 1;
      if (game.score > best) {
        best = game.score; $('best').textContent = best.toLocaleString('ja-JP');
        try { localStorage.setItem('pref-puzzle-best', String(best)); } catch {}
      }
    }
    drawNext();
    button.disabled = game.over || game.completeAt !== null || !game.groups.length || paused;
    if (button.disabled && (holdingPointer !== null || holdKey !== null)) resetHold();
    button.classList.toggle('holding', game.shuffling);
    wrap.classList.toggle('shaking', game.shuffling && !reducedMotion);
    button.setAttribute('aria-pressed', String(game.shuffling));
    $('shuffle-label').textContent = game.shuffling ? 'シャッフル中' : 'シャッフル';
    $('hold-tag').textContent = game.shuffling ? '離すと止まる' : '押している間';
    const remaining = game.finalWait === null ? null : Math.max(0, (PuzzleCore.FINAL_LIMIT_MS - (game.time - game.finalWait)) / 1000);
    const overflowRemaining = game.overSince === null ? null : Math.max(0, (PuzzleCore.OVERFLOW_MS - (game.time - game.overSince)) / 1000);
    $('round-label').textContent = game.over ? `${game.round}周目 終了`
      : game.completeAt !== null ? '日本列島完成'
      : overflowRemaining !== null ? `${game.round}周目 あふれ ${overflowRemaining.toFixed(1)}秒`
      : remaining !== null ? `${game.round}周目 残り ${remaining.toFixed(1)}秒`
      : `${game.round}周目`;
    $('round-label').classList.toggle('urgent', !game.over && (overflowRemaining !== null || (remaining !== null && remaining <= 5)));
    if (game.over && !shownOver) {
      shownOver = true; resetHold(); $('result').hidden = false;
      $('result-title').textContent = 'GAME OVER';
      $('result-detail').textContent = game.endReason === 'timeout'
        ? `時間切れ。北海道の落下から15秒経過。完成回数：${game.completed}回。`
        : `盤面からあふれました。${game.round}周目・${game.dropped}県。完成回数：${game.completed}回。`;
      $('result-score').textContent = game.score.toLocaleString('ja-JP');
    }
  }

  function aim(e) {
    const rect = cv.getBoundingClientRect();
    game.setAim((e.clientX - rect.left) / rect.width * game.width);
  }
  cv.addEventListener('pointerdown', e => {
    if (e.button !== 0 || game.over || paused || aiming !== null) return;
    aiming = e.pointerId; cv.setPointerCapture(e.pointerId); aim(e); e.preventDefault();
  });
  cv.addEventListener('pointermove', e => { if (!paused && (aiming === e.pointerId || e.pointerType === 'mouse')) aim(e); });
  cv.addEventListener('pointerup', e => {
    if (aiming !== e.pointerId) return;
    aim(e); aiming = null;
    const rect = cv.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) drop();
    updateUI();
  });
  cv.addEventListener('pointercancel', () => { aiming = null; });
  cv.addEventListener('lostpointercapture', () => { aiming = null; });
  cv.addEventListener('keydown', e => {
    if (paused) return;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      game.setAim(game.aim + (e.code === 'ArrowLeft' ? -18 : 18)); e.preventDefault();
    } else if (e.code === 'Space' || e.code === 'Enter') { if (!e.repeat) drop(); e.preventDefault(); }
  });

  button.addEventListener('pointerdown', e => {
    if (button.disabled || e.button !== 0 || holdingPointer !== null || holdKey) return;
    e.preventDefault(); holdingPointer = e.pointerId; button.setPointerCapture(e.pointerId);
    unlockSound(); game.setShuffling(true); updateUI();
  });
  button.addEventListener('pointermove', e => {
    if (holdingPointer !== e.pointerId) return;
    const rect = button.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) resetHold();
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, e => {
    if (holdingPointer === e.pointerId) resetHold();
  });
  for (const event of ['contextmenu', 'selectstart']) {
    button.addEventListener(event, e => e.preventDefault());
  }
  button.addEventListener('keydown', e => {
    if (!['Space', 'Enter'].includes(e.code)) return;
    e.preventDefault(); if (e.repeat || button.disabled || holdKey || holdingPointer !== null) return;
    holdKey = e.code; unlockSound(); game.setShuffling(true); updateUI();
  });
  button.addEventListener('keyup', e => { if (e.code === holdKey) { e.preventDefault(); resetHold(); } });
  button.addEventListener('blur', resetHold);
  $('reset').addEventListener('click', () => {
    if (!game.totalDropped || resetTimer) { start(); return; }
    $('reset').classList.add('armed'); $('reset-label').textContent = 'もう一度押す';
    resetTimer = setTimeout(() => { resetTimer = 0; $('reset').classList.remove('armed'); $('reset-label').textContent = 'リセット'; }, 2500);
  });
  $('retry').addEventListener('click', start);
  $('next-round').addEventListener('click', () => game.nextRound());
  for (const [trigger, id] of [['help', 'help-dialog'], ['credits', 'credits-dialog']]) {
    const dialog = $(id);
    $(trigger).addEventListener('click', () => { paused = true; aiming = null; resetHold(); sound.stop(); dialog.showModal(); });
    dialog.addEventListener('close', () => { paused = false; updateUI(); });
    dialog.querySelectorAll('.dialog-close,.dialog-close-action').forEach(b => b.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', e => {
      if (e.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) dialog.close();
    });
  }
  window.addEventListener('blur', () => { resetHold(); sound.stop(); aiming = null; });
  document.addEventListener('visibilitychange', () => { resetHold(); sound.stop(); aiming = null; last = 0; });
  let last = 0, acc = 0;
  function frame(now) {
    const dt = Math.min(70, last ? now - last : 1000 / 60); last = now;
    if (!paused && !document.hidden) {
      acc += dt; let steps = 0;
      while (acc >= 1000 / 60 && steps++ < 4) { game.step(); acc -= 1000 / 60; }
      if (steps >= 4) acc = 0;
      playLandings();
      if (game.shuffling) sound.shuffle(game.shuffleStrength());
    } else acc = 0;
    draw(); updateUI();
    displayedScore = reducedMotion ? game.score : displayedScore + (game.score - displayedScore) * (1 - Math.exp(-dt / 110));
    if (Math.abs(game.score - displayedScore) < 1) displayedScore = game.score;
    $('score').textContent = Math.floor(displayedScore).toLocaleString('ja-JP');
    updateRegionNotice();
    effects.draw(game.time);
    requestAnimationFrame(frame);
  }
  resize(); updateUI(); requestAnimationFrame(frame);
})();
