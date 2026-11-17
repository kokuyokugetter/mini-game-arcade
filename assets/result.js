(() => {
  'use strict';

  const wait = 1100;
  let dialog;
  function lock(controls, surface) {
    let until = performance.now() + wait;
    const listeners = new AbortController();
    for (const control of controls) {
      if (control instanceof HTMLButtonElement) control.disabled = true;
      else {
        control.setAttribute('aria-disabled', 'true');
        control.tabIndex = -1;
      }
    }

    surface.addEventListener('click', event => {
      if (controls.some(control => control.contains(event.target))) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, { capture: true, signal: listeners.signal });
    const hold = () => { until = Math.max(until, performance.now() + 350); };
    for (const name of ['pointerdown', 'keydown']) {
      surface.addEventListener(name, hold, { capture: true, signal: listeners.signal });
    }

    function unlock() {
      const remaining = until - performance.now();
      if (remaining > 0) {
        setTimeout(unlock, remaining);
        return;
      }
      listeners.abort();
      for (const control of controls) {
        if (control instanceof HTMLButtonElement) control.disabled = false;
        else {
          control.removeAttribute('aria-disabled');
          control.removeAttribute('tabindex');
        }
      }
    }
    setTimeout(unlock, wait);
  }

  function textElement(tag, className, value) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = value;
    return element;
  }

  function share(title, summary) {
    const game = document.querySelector('h1')?.textContent.trim() || document.title.split(' | ')[0];
    const slug = location.pathname.match(/\/games\/([a-z0-9-]+)(?:\/|$)/)?.[1];
    const base = 'https://kokuyokugetter.github.io/mini-game-arcade/';
    const url = slug ? new URL(`games/${slug}/`, base).href : base;
    const message = [`『${game}』 ${title}`, summary].filter(Boolean).join('\n');
    const content = `${message}\n${url}`;

    const panel = document.createElement('div');
    panel.className = 'arcade-share';
    const copy = textElement('button', 'arcade-share-button', '結果をコピー');
    copy.type = 'button';
    const post = textElement('a', 'arcade-share-button', 'Xに投稿');
    const intent = new URL('https://twitter.com/intent/tweet');
    intent.search = new URLSearchParams({ text: message, url }).toString();
    post.href = intent.href;
    post.target = '_blank';
    post.rel = 'noopener noreferrer';

    const feedback = textElement('p', 'arcade-share-feedback', '');
    feedback.setAttribute('role', 'status');
    const field = document.createElement('textarea');
    field.className = 'arcade-share-text';
    field.readOnly = true;
    field.hidden = true;
    field.rows = 3;
    field.value = content;
    field.setAttribute('aria-label', '共有用テキスト');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(content);
        feedback.textContent = '結果をコピーしました';
      } catch {
        field.hidden = false;
        feedback.textContent = '下のテキストを選んでコピーできます';
        field.focus({ preventScroll: true });
        field.select();
      }
    });
    panel.append(copy, post, feedback, field);
    return panel;
  }

  function confetti() {
    const particles = document.createElement('span');
    particles.className = 'arcade-result-confetti';
    particles.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 34; i++) {
      const particle = document.createElement('i');
      particle.style.setProperty('--x', `${(i * 37) % 100}%`);
      particle.style.setProperty('--delay', `${(i % 8) * 48}ms`);
      particle.style.setProperty('--spin', `${(i % 2 ? 1 : -1) * (90 + i * 12)}deg`);
      particle.style.setProperty('--hue', String([44, 168, 194, 325][i % 4]));
      particles.append(particle);
    }
    return particles;
  }

  function show({ kind, title, summary, action, onAction, alternate, onAlternate, choices }) {
    if (dialog?.open) return;
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'arcade-result';
      dialog.setAttribute('aria-labelledby', 'arcade-result-title');
      dialog.setAttribute('aria-describedby', 'arcade-result-summary');
      dialog.addEventListener('cancel', event => event.preventDefault());
      dialog.addEventListener('keydown', event => {
        if (event.repeat && (event.key === 'Enter' || event.code === 'Space')) event.preventDefault();
      });
      document.body.append(dialog);
    }

    dialog.dataset.kind = kind;
    const badge = textElement('p', 'arcade-result-badge', { clear: 'CLEAR!!', over: 'GAME OVER', result: 'RESULT' }[kind]);
    const heading = textElement('h2', 'arcade-result-heading', title);
    heading.id = 'arcade-result-title';
    heading.tabIndex = -1;
    const description = textElement('p', 'arcade-result-summary', summary);
    description.id = 'arcade-result-summary';
    const controls = document.createElement('div');
    controls.className = 'arcade-result-actions';
    let options = choices;
    if (!options) {
      options = [{ label: action, onSelect: onAction }];
      if (alternate && onAlternate) options.push({ label: alternate, onSelect: onAlternate });
    }
    const buttons = options.map(({ label, detail, onSelect }) => {
      const button = textElement('button', 'arcade-result-action', label);
      button.type = 'button';
      if (detail) button.append(textElement('small', 'arcade-result-action-detail', detail));
      button.addEventListener('click', () => {
        if (!dialog.open || button.disabled) return;
        dialog.close();
        onSelect();
      });
      controls.append(button);
      return button;
    });
    const sharing = share(title, summary);
    dialog.replaceChildren(badge, heading, description, sharing, controls);
    if (kind === 'clear') dialog.prepend(confetti());
    lock([...buttons, ...sharing.querySelectorAll('.arcade-share-button')], dialog);
    dialog.showModal();
    heading.focus({ preventScroll: true });
  }

  window.ArcadeResult = { show, share, lock, get active() { return Boolean(dialog?.open); } };
})();
