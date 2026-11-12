/* Loop — views-loops.js: My Loops (search, filter, export), Waiting On, Calendar. */
(function () {
  'use strict';
  const L = window.Loop, U = L.U, S = L.S, UI = L.UI, V = L.V, h = U.h, icon = U.icon;
  const render = () => L.app.render();
  V.head = (title, sub, right) => h('header', { class: 'view-head' }, h('div', null, h('h1', null, title), sub && h('p', null, sub)), right && h('div', { class: 'row wrap' }, right));

  /* ---------- My Loops ---------- */
  V.filterLoops = function (f) {
    const q = f.q.trim().toLowerCase();
    return S.state.loops.filter((l) => {
      if (f.stage === 'open' ? l.stage === 'CLOSED' : f.stage && f.stage !== 'all' && l.stage !== f.stage) return false;
      if (f.sector === 'none' ? l.sectorIds.length : f.sector && l.sectorIds.indexOf(f.sector) < 0) return false;
      if (f.priority && l.priority !== f.priority) return false;
      if (f.flag === 'review' && !S.dueForReview(l)) return false;
      if (f.flag === 'deadline' && !S.pastDeadline(l)) return false;
      if (f.flag === 'nonext' && (l.stage === 'CLOSED' || S.nextLabel(l))) return false;
      if (f.flag === 'today' && l.plannedFor !== U.today()) return false;
      if (f.flag === 'sample' && !l.sample) return false;
      if (f.flag === 'mine' && l.sample) return false;
      if (q) { const hay = [l.title, l.description, l.notes, l.nextAction, l.tags.join(' '), S.sectorNames(l).join(' '), l.waiting ? l.waiting.what + ' ' + l.waiting.who : '']; S.walkSteps(l.steps, (s) => hay.push(s.title)); if (hay.join(' ').toLowerCase().indexOf(q) < 0) return false; }
      return true;
    });
  };
  V.loops = function () {
    const f = V.state.loops, list = V.filterLoops(f);
    const set = (k) => (v) => { f[k] = v; render(); };
    const active = f.q || f.sector || f.priority || f.flag || f.stage !== 'open';
    const stamp = U.today();
    return h('div', { class: 'view' }, V.head('My Loops', U.plural(list.length, 'loop') + (active ? ' match these filters' : ' open'), UI.btn([icon('plus', 16), 'New loop'], () => UI.editLoop(null), 'primary')),
      V.sampleBanner(),
      h('section', { class: 'panel' },
        h('div', { class: 'toolbar' },
          h('label', { class: 'search' }, icon('search', 16), h('span', { class: 'sr' }, 'Search loops'), h('input', { type: 'search', id: 'loop-search', placeholder: 'Search titles, notes, steps, tags…', value: f.q, oninput: (e) => { f.q = e.target.value; render(); } })),
          UI.sel(f.stage, [['open', 'All open'], ['OPENED', 'Opened'], ['ACTIVE', 'Active'], ['WAITING', 'Waiting'], ['STUCK', 'Stuck'], ['CLOSED', 'Closed'], ['all', 'Everything']], set('stage'), { 'aria-label': 'Filter by stage' }),
          UI.sel(f.sector, [['', 'All sectors']].concat(S.state.sectors.map((s) => [s.id, s.name + (s.archived ? ' (archived)' : '')]), [['none', 'No sector']]), set('sector'), { 'aria-label': 'Filter by sector' }),
          UI.sel(f.priority, [['', 'Any priority']].concat(L.PRIORITIES.map((p) => [p, L.PRIORITY_LABEL[p]])), set('priority'), { 'aria-label': 'Filter by priority' }),
          UI.sel(f.flag, [['', 'Any status'], ['review', 'Expected date passed'], ['deadline', 'Past deadline'], ['nonext', 'No next action'], ['today', 'Planned for today'], ['mine', 'Hide samples'], ['sample', 'Samples only']], set('flag'), { 'aria-label': 'Filter by status' }),
          active && UI.btn('Clear', () => { Object.assign(f, { q: '', sector: '', stage: 'open', priority: '', flag: '' }); render(); }, 'ghost small')),
        V.loopTable(list, { cols: ['title', 'sector', 'stage', 'expected', 'deadline', 'next', 'priority'], sort: f.sort, empty: active ? 'No loops match these filters.' : 'No open loops yet.', emptyAction: UI.btn('Capture a loop', () => UI.quickCapture(), 'primary small') }),
        h('div', { class: 'toolbar foot' }, h('span', { class: 'faint' }, 'Export what is listed:'),
          UI.btn([icon('download', 15), 'CSV'], () => { if (!list.length) return UI.toast('Nothing to export.'); U.download('loop-list-' + stamp + '.csv', S.loopsCsv(list), 'text/csv'); UI.toast(U.plural(list.length, 'loop') + ' exported as CSV.'); }, 'ghost small'),
          UI.btn([icon('download', 15), 'JSON'], () => { if (!list.length) return UI.toast('Nothing to export.'); U.download('loop-list-' + stamp + '.json', JSON.stringify(S.exportLoops(list), null, 2)); UI.toast(U.plural(list.length, 'loop') + ' exported as JSON.'); }, 'ghost small'))));
  };

  /* ---------- Waiting On ---------- */
  V.waiting = function () {
    const list = S.openLoops().filter((l) => l.stage === 'WAITING').sort((a, b) => ((a.waiting && a.waiting.since) || '') < ((b.waiting && b.waiting.since) || '') ? -1 : 1);
    const t = U.today();
    return h('div', { class: 'view' }, V.head('Waiting On', 'Things outside your hands. Loop only raises one when its response date or your follow-up date has passed.'),
      h('section', { class: 'panel' }, list.length ? h('ul', { class: 'wait-list' }, list.map((l) => {
        const w = l.waiting || {}, over = S.waitingOverdue(l), fu = S.followUpDue(l);
        return h('li', { class: 'wait-card' + (over || fu ? ' flag' : '') },
          h('div', { class: 'wait-main' }, h('button', { type: 'button', class: 'linkish title', onclick: () => UI.editLoop(l.id) }, l.title), V.badges(l),
            h('p', null, h('b', null, w.what || 'Not specified'), w.who && ' · depends on ' + w.who, h('span', { class: 'faint' }, ' · ' + (w.type || '')))),
          h('dl', { class: 'wait-meta' },
            h('div', null, h('dt', null, 'Waiting since'), h('dd', null, w.since ? U.fmtDate(w.since) + ' (' + Math.max(0, U.diffDays(w.since, t)) + ' d)' : '—')),
            h('div', null, h('dt', null, 'Expected response'), h('dd', { class: over ? 'soft-warn' : '' }, w.expectedResponse ? U.fmtDate(w.expectedResponse) + ' · ' + U.rel(w.expectedResponse) : '—')),
            h('div', null, h('dt', null, 'Next follow-up'), h('dd', { class: fu ? 'soft-warn' : '' }, w.followUp ? U.fmtDate(w.followUp) + ' · ' + U.rel(w.followUp) : '—'))),
          h('div', { class: 'row wrap' }, UI.btn('Log follow-up', () => UI.waitingDialog(l.id), over || fu ? 'primary small' : 'ghost small'),
            UI.btn('Response received', () => { S.setStage(l.id, 'ACTIVE', { note: 'Response received' }); UI.toast('Back to Active.'); }, 'ghost small'),
            UI.btn('Close…', () => UI.closeDialog(l.id), 'ghost small')));
      })) : h('div', { class: 'empty' }, h('p', null, 'You are not waiting on anyone or anything.'), h('p', { class: 'faint' }, 'Mark a loop as “Waiting on…” from its ⋯ menu when the next move belongs to someone else.'))));
  };

  /* ---------- Calendar ---------- */
  const KINDS = { deadline: 'Deadline', expected: 'Expected completion', review: 'Expected date passed', start: 'Start', closed: 'Closed', waiting: 'Waiting follow-up', reminder: 'Reminder', appt: 'Appointment', planned: 'Planned day' };
  V.calEvents = function () {
    const map = {}, t = U.today();
    const add = (date, loop, kind, time) => { if (!date) return; (map[date] = map[date] || []).push({ loop: loop, kind: kind, time: time || '' }); };
    S.state.loops.forEach((l) => {
      if (l.stage === 'CLOSED') { add(l.completedAt, l, 'closed'); return; }
      if (l.startDate && l.startDate !== l.expectedDate) add(l.startDate, l, 'start', l.startTime);
      add(l.expectedDate, l, l.expectedDate < t ? 'review' : 'expected', l.startDate === l.expectedDate ? l.startTime : l.endTime);
      if (l.deadline) add(l.deadline, l, 'deadline');
      if (l.stage === 'WAITING' && l.waiting) add(l.waiting.followUp || l.waiting.expectedResponse, l, 'waiting');
      if (l.reminderAt) add(l.reminderAt.slice(0, 10), l, 'reminder', l.reminderAt.slice(11, 16));
      if (l.appointment && l.appointment.at) add(l.appointment.at.slice(0, 10), l, 'appt', l.appointment.at.slice(11, 16));
      if (l.plannedFor && l.plannedFor !== l.expectedDate && l.plannedFor !== l.deadline) add(l.plannedFor, l, 'planned');
    });
    Object.keys(map).forEach((k) => map[k].sort((a, b) => (a.time || '99') < (b.time || '99') ? -1 : 1));
    return map;
  };
  const pill = (e, full) => h('button', { type: 'button', class: 'ev ev-' + e.kind, title: KINDS[e.kind] + ': ' + e.loop.title, onclick: (x) => { x.stopPropagation(); UI.editLoop(e.loop.id); } },
    h('span', { class: 'ev-mark' }), e.time && h('span', { class: 'ev-time' }, U.fmtTime(e.time)), h('span', { class: 'ev-title' }, e.loop.title), full && h('span', { class: 'ev-kind' }, KINDS[e.kind]));
  V.calendar = function () {
    const c = V.state.cal, t = U.today(), ws = S.state.settings.weekStart, ev = V.calEvents();
    const move = (dir) => { c.cursor = c.mode === 'month' ? U.addMonths(c.cursor.slice(0, 8) + '01', dir) : U.addDays(c.cursor, dir * (c.mode === 'week' ? 7 : 1)); render(); };
    const dayNames = []; for (let i = 0; i < 7; i++) dayNames.push(U.DAYS[(ws + i) % 7]);
    let title, body;
    if (c.mode === 'month') {
      const first = c.cursor.slice(0, 8) + '01', start = U.startOfWeek(first, ws), mk = U.monthKey(first);
      title = U.monthName(mk);
      const cells = [];
      for (let i = 0; i < 42; i++) {
        const d = U.addDays(start, i); if (i >= 35 && U.monthKey(d) !== mk) break;
        const list = ev[d] || [];
        cells.push(h('div', { class: 'cal-cell' + (U.monthKey(d) !== mk ? ' out' : '') + (d === t ? ' today' : ''), role: 'button', tabindex: 0, 'aria-label': U.fmtDay(d) + ', ' + U.plural(list.length, 'item'),
          onclick: () => { c.mode = 'day'; c.cursor = d; render(); }, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.mode = 'day'; c.cursor = d; render(); } } },
          h('span', { class: 'cal-num' }, U.parse(d).getDate()), h('div', { class: 'cal-evs' }, list.slice(0, 3).map((e) => pill(e)), list.length > 3 && h('span', { class: 'more' }, '+' + (list.length - 3) + ' more'))));
      }
      body = h('div', { class: 'cal-month' }, h('div', { class: 'cal-dow' }, dayNames.map((n) => h('span', null, n))), h('div', { class: 'cal-grid' }, cells));
    } else if (c.mode === 'week') {
      const start = U.startOfWeek(c.cursor, ws);
      title = U.fmtDate(start) + ' – ' + U.fmtDate(U.addDays(start, 6), true);
      const cols = []; for (let i = 0; i < 7; i++) { const d = U.addDays(start, i), list = ev[d] || []; cols.push(h('div', { class: 'week-col' + (d === t ? ' today' : '') }, h('button', { type: 'button', class: 'week-head', onclick: () => { c.mode = 'day'; c.cursor = d; render(); } }, U.DAYS[U.parse(d).getDay()] + ' ' + U.parse(d).getDate()), list.length ? list.map((e) => pill(e, true)) : h('span', { class: 'faint small' }, '—'))); }
      body = h('div', { class: 'cal-week' }, cols);
    } else if (c.mode === 'day') {
      const list = ev[c.cursor] || [];
      title = U.fmtDay(c.cursor) + (c.cursor === t ? ' · today' : '');
      body = h('div', { class: 'cal-day' }, list.length ? h('ul', { class: 'agenda' }, list.map((e) => h('li', null, h('span', { class: 'agenda-time' }, e.time ? U.fmtTime(e.time) : 'Any time'), pill(e, true),
        e.loop.stage !== 'CLOSED' && UI.btn('Reschedule', () => UI.rescheduleDialog(e.loop.id), 'ghost tiny')))) : h('div', { class: 'empty' }, h('p', null, 'Nothing on this day.')),
        UI.btn([icon('plus', 15), 'Add a loop expected this day'], () => UI.quickCapture({ expectedDate: c.cursor }), 'ghost small'));
    } else {
      title = 'Dates to look at';
      const open = S.openLoops(), by = (k) => (a, b) => (a[k] < b[k] ? -1 : 1), soon = U.addDays(t, 30);
      const sect = (name, list, key, note) => h('div', { class: 'group' }, h('h3', null, name, h('span', { class: 'faint' }, ' · ' + list.length)), note && list.length ? h('p', { class: 'hint' }, note) : '',
        list.length ? h('ul', { class: 'agenda' }, list.map((l) => h('li', null, h('span', { class: 'agenda-time' }, U.fmtDate(l[key]), h('small', { class: 'faint' }, ' ' + U.rel(l[key]))), h('button', { type: 'button', class: 'linkish title', onclick: () => UI.editLoop(l.id) }, l.title), UI.chip(l.stage),
          UI.btn('Reschedule', () => UI.rescheduleDialog(l.id), 'ghost tiny'), UI.btn('Close…', () => UI.closeDialog(l.id), 'ghost tiny')))) : h('p', { class: 'faint' }, 'None.'));
      body = h('div', null,
        sect('Expected date passed', open.filter(S.dueForReview).sort(by('expectedDate')), 'expectedDate', 'These are flagged for review, not marked as failed. Reschedule or resolve each when you are ready.'),
        sect('Past deadline', open.filter(S.pastDeadline).sort(by('deadline')), 'deadline'),
        sect('Upcoming deadlines (30 days)', open.filter((l) => l.deadline && l.deadline >= t && l.deadline <= soon).sort(by('deadline')), 'deadline'),
        sect('Expected completions (30 days)', open.filter((l) => l.expectedDate && l.expectedDate >= t && l.expectedDate <= soon).sort(by('expectedDate')), 'expectedDate'));
    }
    const modes = [['month', 'Month'], ['week', 'Week'], ['day', 'Day'], ['list', 'Deadlines & overdue']];
    return h('div', { class: 'view' }, V.head('Calendar', 'Forecasts, deadlines and follow-ups in one place.'),
      h('section', { class: 'panel' },
        h('div', { class: 'toolbar' }, h('div', { class: 'seg', role: 'tablist' }, modes.map((m) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(c.mode === m[0]), class: c.mode === m[0] ? 'on' : '', onclick: () => { c.mode = m[0]; render(); } }, m[1]))),
          c.mode !== 'list' && h('div', { class: 'row cal-nav' }, UI.iconBtn('left', 'Previous', () => move(-1)), UI.btn('Today', () => { c.cursor = t; render(); }, 'ghost small'), UI.iconBtn('right', 'Next', () => move(1))),
          h('h2', { class: 'cal-title' }, title)),
        body,
        h('ul', { class: 'legend', 'aria-label': 'Legend' }, ['expected', 'deadline', 'review', 'closed', 'waiting', 'appt', 'reminder', 'start', 'planned'].map((k) => h('li', null, h('span', { class: 'ev-mark ev-' + k }), KINDS[k])))));
  };
})();
