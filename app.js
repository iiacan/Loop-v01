/* Loop — app.js: shell, navigation, keyboard shortcuts, reminder ticker, boot. */
(function () {
  'use strict';
  const L = window.Loop, U = L.U, S = L.S, UI = L.UI, V = L.V, h = U.h, icon = U.icon;
  const ROUTES = { home: ['Home', 'home'], loops: ['My Loops', 'loop'], calendar: ['Calendar', 'calendar'], sectors: ['Sectors', 'sectors'], insights: ['Insights', 'chart'], rewards: ['Rewards', 'gift'], settings: ['Settings', 'gear'], waiting: ['Waiting On', 'pause'] };
  const NAV = ['home', 'loops', 'calendar', 'sectors', 'insights', 'rewards', 'settings'];
  const app = (L.app = { route: 'home' });
  const $ = (id) => document.getElementById(id);
  const current = () => { const r = location.hash.replace(/^#\/?/, ''); return ROUTES[r] ? r : 'home'; };

  app.go = function (route) { if (current() === route) app.render(); else location.hash = route; };

  function navLink(r, compact) {
    const on = app.route === r || (r === 'loops' && app.route === 'waiting');
    return h('a', { href: '#' + r, class: 'nav-link' + (on ? ' on' : ''), 'aria-current': on ? 'page' : null }, icon(ROUTES[r][1], compact ? 20 : 18), h('span', null, ROUTES[r][0]));
  }
  function renderNav() {
    const counts = {}; S.openLoops().forEach((l) => l.sectorIds.forEach((id) => (counts[id] = (counts[id] || 0) + 1)));
    const rem = UI.pendingReminders().length;
    $('sidebar').replaceChildren(
      h('a', { href: '#home', class: 'brand', 'aria-label': 'Loop, home' }, icon('loop', 34), h('span', null, 'Loop')),
      h('nav', { 'aria-label': 'Main' }, NAV.map((r) => navLink(r))),
      h('button', { type: 'button', class: 'btn primary capture', onclick: () => UI.quickCapture(), title: 'Quick capture (N)' }, icon('plus', 18), 'Quick Capture'),
      rem ? h('button', { type: 'button', class: 'btn ghost capture', onclick: UI.remindersDialog }, icon('bell', 16), U.plural(rem, 'reminder')) : '',
      h('div', { class: 'side-sectors' }, h('h2', null, 'Sectors'), h('ul', null, S.activeSectors().map((s) => h('li', null, h('button', { type: 'button', onclick: () => V.showLoops({ sector: s.id }) }, h('span', { class: 'dot', style: 'background:' + s.color }), h('span', { class: 'grow' }, s.name), h('span', { class: 'faint' }, counts[s.id] || 0)))))),
      h('p', { class: 'side-foot' }, 'Keep the thread.'));
    $('tabbar').replaceChildren.apply($('tabbar'), NAV.map((r) => navLink(r, true)));
    const fab = $('fab'); fab.onclick = () => UI.quickCapture();
  }
  app.render = function () {
    const r = current(), changed = r !== app.route; app.route = r;
    document.documentElement.setAttribute('data-theme', S.state.settings.theme || 'midnight');
    renderNav();
    const main = $('main'), act = document.activeElement;
    let keep = null;
    if (act && act.id && main.contains(act)) { keep = { id: act.id }; try { keep.s = act.selectionStart; keep.e = act.selectionEnd; } catch (e) { /* not a text field */ } }
    const y = window.scrollY;
    let view;
    try { view = V[r](); }
    catch (err) { console.error(err); view = h('div', { class: 'view' }, h('section', { class: 'panel' }, h('h2', null, 'This view could not be drawn'), h('p', null, 'Your data is untouched. Try another section, or download a backup from Settings.'), h('pre', { class: 'hint' }, String(err && err.message)))); }
    main.replaceChildren(view);
    document.title = ROUTES[r][0] + ' · Loop';
    if (keep) { const el = $(keep.id); if (el) { el.focus(); try { if (keep.s != null) el.setSelectionRange(keep.s, keep.e); } catch (e) { /* ignore */ } } }
    window.scrollTo(0, changed ? 0 : y);
  };

  /* keyboard shortcuts */
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || UI.modalOpen()) return;
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (typing) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); UI.quickCapture(); }
    else if (e.key === '/') { e.preventDefault(); app.go('loops'); setTimeout(() => { const s = $('loop-search'); if (s) s.focus(); }, 30); }
  });

  /* reminders: checked while the app is open. A static site cannot do more than that. */
  let lastDay = U.today();
  function tick() {
    const now = U.nowLocal();
    const due = S.state.loops.filter((l) => l.stage !== 'CLOSED' && l.reminderAt && !l.reminderFired && l.reminderAt <= now);
    if (due.length) {
      due.forEach((l) => { l.reminderFired = true; l.reminderAck = false; S.putLoop(l, true); });
      S.emit();
      if (due.length <= 2) due.forEach((l) => UI.toast('Reminder: ' + l.title, { ms: 15000, action: { label: 'Open', run: () => UI.editLoop(l.id) } }));
      else UI.toast(due.length + ' reminders are due.', { ms: 15000, action: { label: 'Show', run: UI.remindersDialog } });
      if (S.state.settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification(due.length === 1 ? 'Loop reminder' : 'Loop: ' + due.length + ' reminders', { body: due.slice(0, 3).map((l) => l.title).join('\n'), tag: 'loop-reminder' }); } catch (e) { /* some mobile browsers only allow this from a service worker */ }
      }
    }
    if (U.today() !== lastDay) { lastDay = U.today(); S.housekeeping(); app.render(); }
  }

  let lastErr = 0;
  L.onStorageError = function () { if (Date.now() - lastErr < 20000) return; lastErr = Date.now(); UI.toast('A change could not be saved to this browser’s storage. Download a backup from Settings now.', { kind: 'warn', ms: 12000 }); };

  S.init().then(() => {
    S.subscribe(app.render);
    window.addEventListener('hashchange', app.render);
    $('skip').addEventListener('click', () => $('main').focus());
    app.render(); tick();
    setInterval(tick, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
  }).catch((err) => {
    console.error(err);
    $('main').replaceChildren(h('div', { class: 'view' }, h('section', { class: 'panel' }, h('h1', null, 'Loop could not start'), h('p', null, 'The app failed while loading its data. Nothing has been deleted.'), h('pre', null, String(err && err.message)))));
  });
})();
