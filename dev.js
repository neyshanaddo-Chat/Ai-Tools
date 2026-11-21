// ============ DEVELOPER MODE (local copy only) ============
// Loaded only when the site is opened from your laptop folder (file://) or with ?dev=1.
// The public website never loads this file.
//
// Ctrl + Shift + D  → turn inspect on / off
// Hover             → outline + name of the thing under the mouse
// Click             → select it (Shift + click to select more than one)
// Type the change   → Send
// Send copies the request. Paste it into the Claude chat (Ctrl + V) and press Enter.
// No folders, no File Explorer.
(function devMode() {
  'use strict';
  let inspecting = false;
  let selected = [];          // [{ el, info }]
  let hoverEl = null;
  let draft = '';              // what you typed, kept if you close and reopen

  // ---------- styles ----------
  const css = document.createElement('style');
  css.textContent = `
    #devBadge, #devPanel, #devLabel, .dev-box, #devToast { font: 13px/1.4 system-ui, -apple-system, sans-serif; }
    #devBadge { position: fixed; left: 10px; bottom: 10px; z-index: 2147483000; display: flex; gap: 6px; align-items: center;
      background: #1a1206; color: #ffbf69; border: 1px solid #ff9f1c; border-radius: 8px; padding: 6px 9px; }
    body.dev-inspect #devBadge { display: none; }
    #devBadge { cursor: pointer; font-weight: 600; box-shadow: 0 2px 10px rgba(0,0,0,.25); }
    #devBadge:hover { background: #ff9f1c; color: #1a1206; }
    #devBadge kbd { font: inherit; font-weight: 700; background: rgba(255,159,28,.18); border: 1px solid currentColor;
      border-radius: 4px; padding: 0 5px; }
    .dev-box { position: fixed; z-index: 2147482990; pointer-events: none; box-sizing: border-box; border-radius: 3px; }
    .dev-box.hover { outline: 2px dashed #ff9f1c; background: rgba(255,159,28,.10); }
    .dev-box.sel { outline: 3px solid #ff3d7f; background: rgba(255,61,127,.12); }
    .dev-box .num { position: absolute; top: -10px; left: -10px; background: #ff3d7f; color: #fff; border-radius: 10px;
      min-width: 20px; height: 20px; text-align: center; font-weight: 700; font-size: 12px; line-height: 20px; }
    #devLabel { position: fixed; z-index: 2147482995; pointer-events: none; background: #1a1206; color: #ffbf69;
      border: 1px solid #ff9f1c; border-radius: 6px; padding: 3px 7px; white-space: nowrap; max-width: 80vw;
      overflow: hidden; text-overflow: ellipsis; }
    #devPanel { position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483001; background: rgba(17,24,33,.97);
      color: #e8eef5; border-top: 2px solid #ff9f1c; padding: 10px 14px 12px; display: flex; flex-direction: column; gap: 8px; }
    #devPanel .head { display: flex; justify-content: space-between; align-items: center; color: #ffbf69; font-weight: 700; }
    #devSel { max-height: 90px; overflow-y: auto; }
    #devSel div b { color: #ff7aa8; }
    #devSel .hint { color: #9aa7b4; }
    #devText { font: inherit; font-size: 14px; width: 100%; box-sizing: border-box; min-height: 56px; resize: vertical;
      background: #0b0f14; color: #e8eef5; border: 1px solid #3a4652; border-radius: 6px; padding: 6px 8px; }
    #devPanel .row { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
    #devPanel button { font: inherit; padding: 6px 14px; border-radius: 6px; cursor: pointer; border: 1px solid #3a4652;
      background: #1c2530; color: #e8eef5; }
    #devPanel button.primary { background: #ff9f1c; border-color: #ff9f1c; color: #1a1206; font-weight: 700; }
    #devPanel button:disabled { opacity: .4; cursor: default; }
    #devToast { position: fixed; left: 50%; top: 18px; transform: translateX(-50%); z-index: 2147483002;
      background: #0d2a12; color: #7dff9a; border: 1px solid #2fd35a; border-radius: 8px; padding: 8px 14px;
      box-shadow: 0 4px 16px rgba(0,0,0,.3); }
    #devToast.warn { background: #2a1a06; color: #ffbf69; border-color: #ff9f1c; }
    body.dev-inspect, body.dev-inspect * { cursor: crosshair !important; }
    body.dev-inspect #devPanel, body.dev-inspect #devPanel *, body.dev-inspect #devBadge, body.dev-inspect #devBadge * { cursor: auto !important; }`;
  document.head.appendChild(css);

  // ---------- small helpers ----------
  const $ = (tag, props = {}, kids = []) => {
    const el = Object.assign(document.createElement(tag), props);
    kids.forEach((k) => el.append(k));
    return el;
  };
  const isDevUI = (el) => !!(el && el.closest && el.closest('#devBadge, #devPanel, #devLabel, #devToast, .dev-box'));
  function toast(msg, warn) {
    document.getElementById('devToast')?.remove();
    const t = $('div', { id: 'devToast', textContent: msg, className: warn ? 'warn' : '' });
    document.body.append(t);
    setTimeout(() => t.remove(), warn ? 6000 : 3500);
  }

  // ---------- naming what you picked ----------
  const KIND = { H1: 'Heading', H2: 'Heading', H3: 'Sub-heading', H4: 'Small heading', P: 'Text', A: 'Link', BUTTON: 'Button',
    IMG: 'Image', NAV: 'Taskbar', HEADER: 'Header bar', MAIN: 'Page', SECTION: 'Page', SPAN: 'Text', DIV: 'Box',
    INPUT: 'Input', LABEL: 'Label', UL: 'List', LI: 'List item', SVG: 'Icon' };
  function shortText(el) {
    const t = (el.getAttribute('aria-label') || el.innerText || el.alt || '').replace(/\s+/g, ' ').trim();
    return t.length > 40 ? t.slice(0, 38) + '…' : t;
  }
  function where(el) {
    if (el.closest('#sidebar')) return 'in the Taskbar';
    if (el.closest('.header')) return 'in the header bar';
    const s = el.closest('.screen');
    if (s) { const n = s.id.replace('screen-', ''); return 'on the ' + n.charAt(0).toUpperCase() + n.slice(1) + ' page'; }
    return '';
  }
  function friendlyName(el) {
    if (el.dataset.devName) return el.dataset.devName;
    if (el.id === 'menuBtn') return 'Taskbar button (☰) in the header bar';
    if (el.classList.contains('title')) return 'Site title "' + shortText(el) + '" in the header bar';
    if (el.classList.contains('sidebar-title')) return 'Taskbar title "' + shortText(el) + '"';
    if (el.classList.contains('nav-link')) return 'Taskbar link "' + shortText(el) + '"';
    if (el.classList.contains('screen')) return where(el).replace('on the ', '') + ' (whole page)';
    const kind = KIND[el.tagName] || el.tagName.toLowerCase();
    const txt = shortText(el);
    return [kind, txt && '"' + txt + '"', where(el)].filter(Boolean).join(' ');
  }
  function selector(el) {
    if (el.id) return '#' + el.id;
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
      if (n.id) { parts.unshift('#' + n.id); break; }
      let p = n.tagName.toLowerCase();
      const cls = [...n.classList].filter((c) => !c.startsWith('dev-') && c !== 'active' && c !== 'open');
      if (cls.length) p += '.' + cls.join('.');
      const sibs = n.parentElement ? [...n.parentElement.children].filter((x) => x.tagName === n.tagName) : [];
      if (sibs.length > 1) p += `:nth-of-type(${sibs.indexOf(n) + 1})`;
      parts.unshift(p);
    }
    return parts.join(' > ');
  }
  function describe(el) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return {
      name: friendlyName(el),
      selector: selector(el),
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || '').trim().slice(0, 300),
      html: el.outerHTML.slice(0, 600),
      box: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
      style: { color: cs.color, background: cs.backgroundColor, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
        fontFamily: cs.fontFamily, textAlign: cs.textAlign, padding: cs.padding, margin: cs.margin }
    };
  }

  // ---------- highlight boxes ----------
  const boxes = [];
  function drawBox(el, kind, num) {
    const r = el.getBoundingClientRect();
    const b = $('div', { className: 'dev-box ' + kind });
    Object.assign(b.style, { left: r.left - 2 + 'px', top: r.top - 2 + 'px', width: r.width + 4 + 'px', height: r.height + 4 + 'px' });
    if (num) b.append($('span', { className: 'num', textContent: num }));
    document.body.append(b); boxes.push(b);
  }
  function redraw() {
    boxes.splice(0).forEach((b) => b.remove());
    document.getElementById('devLabel')?.remove();
    if (!inspecting) return;
    selected.forEach((s, i) => drawBox(s.el, 'sel', selected.length > 1 ? i + 1 : ''));
    if (hoverEl && !selected.some((s) => s.el === hoverEl)) {
      drawBox(hoverEl, 'hover');
      const r = hoverEl.getBoundingClientRect();
      const lab = $('div', { id: 'devLabel', textContent: friendlyName(hoverEl) });
      document.body.append(lab);
      const top = r.top > 28 ? r.top - 26 : r.bottom + 6;
      lab.style.left = Math.max(6, Math.min(r.left, innerWidth - lab.offsetWidth - 6)) + 'px';
      lab.style.top = top + 'px';
    }
  }
  addEventListener('scroll', redraw, true);
  addEventListener('resize', redraw);

  // ---------- badge (bottom-left) ----------
  const badge = $('div', { id: 'devBadge' });
  function updateBadge() {
    // Reminder: dev mode is off. Click it (or press Ctrl+Shift+D) to switch it on.
    badge.innerHTML = '🔒 PRIVATE PREVIEW (only you can see this copy) · Dev mode is off. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> or click here to pick something to change';
    badge.title = 'Turn on developer mode';
  }
  badge.addEventListener('click', () => setInspect(true));
  document.body.append(badge);

  // ---------- panel ----------
  let panel = null;
  function renderPanel() {
    if (!inspecting) { if (panel) draft = panel.querySelector('#devText').value; panel?.remove(); panel = null; return; }
    if (!panel) {
      panel = $('div', { id: 'devPanel' });
      panel.innerHTML = `
        <div class="head"><span>Developer mode</span><span style="font-weight:400;color:#9aa7b4">Esc or Ctrl+Shift+D to close</span></div>
        <div id="devSel"></div>
        <textarea id="devText" placeholder="What should change? e.g. make this bigger and blue"></textarea>
        <div class="row">
          <button id="devClear">Pick again</button>
          <button id="devCancel">Cancel</button>
          <button id="devSend" class="primary">Copy for Claude ▶</button>
        </div>`;
      document.body.append(panel);
      panel.querySelector('#devClear').onclick = () => { selected = []; renderPanel(); redraw(); };
      panel.querySelector('#devCancel').onclick = () => setInspect(false);
      panel.querySelector('#devSend').onclick = send;
      panel.querySelector('#devText').value = draft;
      panel.querySelector('#devText').addEventListener('input', updateSend);
    }
    const sel = panel.querySelector('#devSel');
    sel.innerHTML = selected.length
      ? selected.map((s, i) => `<div><b>${selected.length > 1 ? i + 1 + '. ' : ''}${escapeHtml(s.info.name)}</b></div>`).join('')
      : '<div class="hint">Click anything on the page to select it. Shift + click to select more than one. You can also send without selecting.</div>';
    updateSend();
  }
  function updateSend() {
    if (!panel) return;
    panel.querySelector('#devSend').disabled = !panel.querySelector('#devText').value.trim();
  }
  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function setInspect(on) {
    inspecting = on;
    document.body.classList.toggle('dev-inspect', on);
    if (!on) { selected = []; hoverEl = null; }
    redraw(); renderPanel(); updateBadge();
    if (on) setTimeout(() => panel?.querySelector('#devText').focus(), 0);
  }

  // ---------- mouse / keys while inspecting (capture phase, so the page's own clicks don't fire) ----------
  addEventListener('mousemove', (e) => {
    if (!inspecting) return;
    const el = isDevUI(e.target) ? null : e.target;
    if (el !== hoverEl) { hoverEl = el; redraw(); }
  }, true);
  ['mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach((t) => addEventListener(t, (e) => {
    if (inspecting && !isDevUI(e.target)) { e.preventDefault(); e.stopPropagation(); }
  }, true));
  addEventListener('click', (e) => {
    if (!inspecting || isDevUI(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    const el = e.target, i = selected.findIndex((s) => s.el === el);
    if (i >= 0) selected.splice(i, 1);                       // click again to unselect
    else if (e.shiftKey) selected.push({ el, info: describe(el) });
    else selected = [{ el, info: describe(el) }];
    renderPanel(); redraw();
  }, true);
  addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault(); e.stopPropagation();               // stops Chrome's "bookmark all tabs"
      setInspect(!inspecting);
    } else if (inspecting && e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation(); setInspect(false);
    } else if (inspecting && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); send();
    }
  }, true);

  // ---------- Send: copy a ready-to-paste message for Claude ----------
  function buildMessage(text) {
    const page = location.hash.slice(1) || 'home';
    const lines = [
      'Dev mode request for the Ai-Tools site:',
      'Change: ' + text,
      'Page: ' + page.charAt(0).toUpperCase() + page.slice(1) +
        (document.documentElement.dataset.theme === 'dark' ? ' (dark mode)' : ' (light mode)') +
        (document.getElementById('sidebar')?.classList.contains('open') ? ', Taskbar open' : '') +
        `, window ${innerWidth}×${innerHeight}`
    ];
    if (selected.length) {
      lines.push('Selected:');
      selected.forEach((x, i) => {
        const d = x.info, st = d.style;
        lines.push(`${i + 1}. ${d.name}`);
        lines.push(`   where: ${d.selector}`);
        if (d.text) lines.push(`   text: "${d.text.replace(/\s+/g, ' ').slice(0, 120)}"`);
        lines.push(`   now: ${st.fontSize}, weight ${st.fontWeight}, colour ${st.color}, background ${st.background}, ${d.box.width}×${d.box.height}px`);
      });
    } else lines.push('Selected: nothing (whole page)');
    return lines.join('\n');
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
    try {                                               // older fallback
      const ta = $('textarea', { value: text }); ta.style.cssText = 'position:fixed;opacity:0';
      document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (_) { return false; }
  }
  async function send() {
    const text = panel?.querySelector('#devText').value.trim();
    if (!text) return;
    const msg = buildMessage(text);
    if (!(await copy(msg))) {                           // couldn't copy: show it so it can be copied by hand
      panel.querySelector('#devText').value = msg; panel.querySelector('#devText').select();
      toast('Couldn\'t copy automatically. Press Ctrl + C, then paste it into the Claude chat.', true);
      return;
    }
    panel.querySelector('#devText').value = ''; draft = '';
    setInspect(false);
    if (location.hash && location.hash !== '#home') location.hash = '#home';
    toast('Copied ✓  Now paste it into the Claude chat (Ctrl + V) and press Enter.');
  }

  // ---------- auto refresh: Claude writes dev-stamp.js (local only) whenever the private copy changes ----------
  // (pages opened from a folder can't watch files, but they can load a script, so we load it every 1.5 s)
  let firstStamp;
  function checkStamp() {
    const sc = document.createElement('script');
    sc.src = 'dev-stamp.js?t=' + Date.now();
    sc.onload = () => {
      sc.remove();
      const st = window.__devStamp;
      if (firstStamp === undefined) { firstStamp = st; return; }
      if (st === firstStamp) return;
      if (inspecting && panel?.querySelector('#devText').value.trim()) return;   // don't lose what you're typing
      try { sessionStorage.setItem('dev-updated', '1'); } catch (_) {}
      location.reload();
    };
    sc.onerror = () => { sc.remove(); if (firstStamp === undefined) firstStamp = null; };
    document.head.appendChild(sc);
  }
  if (location.protocol === 'file:') { checkStamp(); setInterval(() => { if (!document.hidden) checkStamp(); }, 1500); }

  // ---------- start ----------
  updateBadge();
  try { if (sessionStorage.getItem('dev-updated')) { sessionStorage.removeItem('dev-updated'); toast('Updated ✓  (private preview)'); } } catch (_) {}
})();
