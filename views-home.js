/* Loop — views-home.js: shared loop table, rule-based recommendations, Home dashboard. */
(function () {
  'use strict';
  const L = window.Loop, U = L.U, S = L.S, UI = L.UI, h = U.h, icon = U.icon;
  const V = (L.V = {});
  V.state = {
    home: { tab: 'mine', sort: { key: 'expected', dir: 1 }, rec: 0 },
    loops: { q: '', sector: '', stage: 'open', priority: '', flag: '', sort: { key: 'expected', dir: 1 } },
    cal: { mode: 'month', cursor: U.today() },
    rewards: { setup: null }
  };
  const go = (route) => L.app.go(route);
  V.showLoops = (filter) => { Object.assign(V.state.loops, { q: '', sector: '', stage: 'open', priority: '', flag: '' }, filter || {}); go('loops'); };

  /* ---------- shared loop table ---------- */
  const PRANK = { low: 0, medium: 1, high: 2, critical: 3 };
  const cmpDate = (a, b) => (a || '9999') < (b || '9999') ? -1 : (a || '9999') > (b || '9999') ? 1 : 0;
  const SORTS = {
    title: (a, b) => a.title.localeCompare(b.title),
    sector: (a, b) => (S.sectorNames(a)[0] || '~').localeCompare(S.sectorNames(b)[0] || '~'),
    stage: (a, b) => L.STAGES.indexOf(a.stage) - L.STAGES.indexOf(b.stage),
    expected: (a, b) => cmpDate(a.expectedDate, b.expectedDate),
    deadline: (a, b) => cmpDate(a.deadline, b.deadline),
    priority: (a, b) => PRANK[b.priority] - PRANK[a.priority]
  };
  const COLS = { title: 'Loop', sector: 'Sector', stage: 'Stage', expected: 'Expected', deadline: 'Deadline', next: 'Next step / Waiting on', priority: 'Priority' };
  V.badges = function (l) {
    return [
      l.sample && h('span', { class: 'badge sample', title: 'Sample data' }, 'Sample'),
      S.pastDeadline(l) ? h('span', { class: 'badge deadline' }, 'Past deadline') : S.dueForReview(l) && h('span', { class: 'badge review', title: 'The expected date has passed. Reschedule or resolve when ready.' }, 'Review date'),
      S.waitingOverdue(l) && h('span', { class: 'badge review' }, 'Reply overdue'),
      l.recurrence.freq !== 'none' && h('span', { class: 'badge', title: 'Repeats ' + l.recurrence.freq }, '↻'),
      l.appointment && h('span', { class: 'badge', title: 'Appointment' }, 'Appt')
    ];
  };
  V.nextCell = function (l) {
    if (l.stage === 'CLOSED') return h('span', { class: 'faint' }, L.RESOLUTIONS[l.resolution] + (l.completedAt ? ' · ' + U.fmtDate(l.completedAt) : ''));
    if (l.stage === 'WAITING' && l.waiting) return h('span', null, l.waiting.what || 'Waiting', l.waiting.who && h('span', { class: 'faint' }, ' · ' + l.waiting.who));
    const blocked = l.stage === 'STUCK' && S.blockedStep(l);
    if (blocked) return h('span', null, h('span', { class: 'faint' }, 'Stuck at: '), blocked.title);
    const n = S.nextLabel(l);
    return n ? h('span', null, n) : h('button', { type: 'button', class: 'linkish faint', onclick: () => UI.editLoop(l.id) }, 'Add a next action');
  };
  V.loopTable = function (list, opts) {
    opts = opts || {};
    const cols = opts.cols || ['title', 'sector', 'stage', 'expected', 'next', 'priority'];
    const sort = opts.sort;
    if (sort && SORTS[sort.key]) list = list.slice().sort((a, b) => SORTS[sort.key](a, b) * sort.dir || a.title.localeCompare(b.title));
    if (!list.length) return h('div', { class: 'empty' }, h('p', null, opts.empty || 'Nothing here.'), opts.emptyAction || '');
    const th = (k) => {
      if (!sort || !SORTS[k]) return h('th', { scope: 'col' }, COLS[k]);
      const on = sort.key === k;
      return h('th', { scope: 'col', 'aria-sort': on ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none' },
        h('button', { type: 'button', class: 'th-btn', onclick: () => { if (on) sort.dir = -sort.dir; else { sort.key = k; sort.dir = 1; } L.app.render(); } }, COLS[k], on ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''));
    };
    const cell = {
      title: (l) => h('td', { class: 'c-title' }, h('button', { type: 'button', class: 'linkish title', onclick: () => UI.editLoop(l.id) }, l.title), V.badges(l)),
      sector: (l) => h('td', { 'data-label': 'Sector' }, UI.sectorDots(l)),
      stage: (l) => h('td', { 'data-label': 'Stage' }, UI.chip(l.stage)),
      expected: (l) => h('td', { 'data-label': 'Expected', class: S.dueForReview(l) ? 'soft-warn' : '' }, l.expectedDate ? h('span', { title: U.rel(l.expectedDate) }, U.fmtDate(l.expectedDate)) : h('span', { class: 'faint' }, '—')),
      deadline: (l) => h('td', { 'data-label': 'Deadline', class: S.pastDeadline(l) ? 'soft-pink' : '' }, l.deadline ? h('span', { title: U.rel(l.deadline) }, U.fmtDate(l.deadline)) : h('span', { class: 'faint' }, '—')),
      next: (l) => h('td', { 'data-label': l.stage === 'WAITING' ? 'Waiting on' : 'Next', class: 'c-next' }, V.nextCell(l)),
      priority: (l) => h('td', { 'data-label': 'Priority' }, h('span', { class: 'prio p-' + l.priority }, L.PRIORITY_LABEL[l.priority]))
    };
    return h('div', { class: 'table-wrap' }, h('table', { class: 'ltable' },
      h('thead', null, h('tr', null, h('th', { scope: 'col', class: 'c-check' }, h('span', { class: 'sr' }, 'Close')), cols.map(th), h('th', { scope: 'col', class: 'c-act' }, h('span', { class: 'sr' }, 'Actions')))),
      h('tbody', null, list.map((l) => h('tr', { class: l.stage === 'CLOSED' ? 'is-closed' : '' },
        h('td', { class: 'c-check' }, l.stage === 'CLOSED'
          ? h('span', { class: 'tick done', title: L.RESOLUTIONS[l.resolution] }, icon('check', 13))
          : h('button', { type: 'button', class: 'tick', 'aria-label': 'Close “' + l.title + '”', title: 'Close this loop…', onclick: () => UI.closeDialog(l.id) })),
        cols.map((k) => cell[k](l)),
        h('td', { class: 'c-act' }, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Actions for “' + l.title + '”', 'aria-haspopup': 'menu', onclick: (e) => UI.loopMenu(e.currentTarget, l) }, icon('dots'))))))));
  };

  /* ---------- rule-based recommendations ("Loop says") ---------- */
  V.recommendations = function () {
    const st = S.state.settings, t = U.today(), open = S.openLoops(), recs = [];
    const add = (id, text, actions) => { if ((st.dismissed || {})[id] !== t) recs.push({ id: id, text: text, actions: actions || [] }); };
    const review = S.pendingReview();
    if (review && review.unresolved.length) add('review', U.monthName(review.plan.id) + ' ended with ' + U.plural(review.unresolved.length, 'loop') + ' unresolved. Each one needs a decision: carry forward, decide not to, supersede or archive.', [{ label: 'Review the month', run: () => go('rewards') }]);
    const items = S.todayItems(), planned = items.reduce((a, i) => a + i.mins, 0);
    if (planned > st.dailyCapacityMin) {
      const movable = items.filter((i) => i.loop.plannedFor === t && i.loop.deadline !== t && i.loop.expectedDate !== t).sort((a, b) => PRANK[a.loop.priority] - PRANK[b.loop.priority] || b.mins - a.mins)[0];
      add('overfull', 'Your plan is a bit full for today: about ' + U.mins(planned) + ' planned against ' + U.mins(st.dailyCapacityMin) + ' of capacity.' + (movable ? ' I’d suggest moving “' + movable.loop.title + '” to tomorrow.' : ' Something will need to give.'),
        movable ? [{ label: 'Adjust plan', run: () => { S.planFor(movable.loop.id, U.addDays(t, 1)); UI.toast('Moved to tomorrow.'); } }] : [{ label: 'Open calendar', run: () => go('calendar') }]);
    }
    const wo = open.filter((l) => S.waitingOverdue(l) || S.followUpDue(l));
    if (wo.length) add('waiting-' + wo[0].id, 'You expected to hear back about “' + wo[0].title + '”' + (wo[0].waiting.expectedResponse ? ' by ' + U.fmtDate(wo[0].waiting.expectedResponse) : '') + '. One follow-up, then set the next check date and let it go until then.' + (wo.length > 1 ? ' (' + (wo.length - 1) + ' more are similar.)' : ''),
      [{ label: 'Log a follow-up', run: () => UI.waitingDialog(wo[0].id) }, wo.length > 1 && { label: 'See all waiting', run: () => go('waiting') }]);
    const due = open.filter(S.dueForReview);
    if (due.length) add('due', U.plural(due.length, 'loop has', 'loops have') + ' passed the date you expected to finish. No verdict attached. Pick new dates, or close the ones that no longer matter.', [{ label: 'Review dates', run: () => V.showLoops({ flag: 'review' }) }]);
    const stuck = open.filter((l) => l.stage === 'STUCK' && Date.now() - new Date(l.stageSince) > 5 * 864e5).sort((a, b) => (a.stageSince < b.stageSince ? -1 : 1))[0];
    if (stuck) add('stuck-' + stuck.id, '“' + stuck.title + '” has been stuck for ' + Math.floor((Date.now() - new Date(stuck.stageSince)) / 864e5) + ' days' + (stuck.stuckNote ? ' (' + stuck.stuckNote + ')' : '') + '. Either break off a smaller next step, or decide not to do it.',
      [{ label: 'Open it', run: () => UI.editLoop(stuck.id) }, { label: 'Close by decision', run: () => UI.closeDialog(stuck.id) }]);
    if (!S.currentPlan() && open.length) add('noplan', 'No commitment pool is set for ' + U.monthName(U.monthKey(t)) + '. Choosing what counts this month is what makes the reward milestones mean something.', [{ label: 'Set up the month', run: () => go('rewards') }]);
    const noNext = open.filter((l) => l.stage === 'ACTIVE' && !S.nextLabel(l));
    if (noNext.length) add('nonext', U.plural(noNext.length, 'active loop has', 'active loops have') + ' no next action. A loop without a next step tends to sit.', [{ label: 'Add one', run: () => UI.editLoop(noNext[0].id) }]);
    const active = open.filter((l) => l.stage === 'ACTIVE').length;
    if (active > st.maxActive) add('active', active + ' loops are active at once (your limit is ' + st.maxActive + '). Moving a few back to Opened keeps the active list honest.', [{ label: 'See active loops', run: () => V.showLoops({ stage: 'ACTIVE' }) }]);
    const ins = S.insights();
    if (ins.effort.n >= 3 && ins.effort.ratio > 1.3) add('estimate', 'Across ' + ins.effort.n + ' completed loops, the work took a median of ' + ins.effort.ratio.toFixed(1) + '× your estimate. Worth padding new estimates by about that much.', [{ label: 'See insights', run: () => go('insights') }]);
    if (st.backupReminderDays > 0 && S.state.loops.some((l) => !l.sample)) {
      const days = st.lastBackupAt ? U.diffDays(U.isoToYmd(st.lastBackupAt), t) : null;
      if (days === null || days >= st.backupReminderDays) add('backup', (days === null ? 'You have not downloaded a backup yet.' : 'Your last backup was ' + days + ' days ago.') + ' Your loops live only in this browser.', [{ label: 'Back up now', run: () => go('settings') }]);
    }
    return recs;
  };

  /* ---------- Home ---------- */
  function hero() {
    const st = S.state.settings, hour = new Date().getHours();
    const part = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const open = S.openLoops(), need = open.filter((l) => S.dueForReview(l) || S.waitingOverdue(l)).length;
    const sub = !S.state.loops.length ? 'Nothing here yet. Capture the first thing on your mind.' : !open.length ? 'Every loop is resolved. Nothing is asking for you.'
      : 'Here’s the state of your loops today: ' + open.length + ' open' + (need ? ', ' + need + ' worth a look' : ', nothing pressing') + '.';
    return h('header', { class: 'hero' },
      h('div', { class: 'hero-art', 'aria-hidden': 'true', html: '<svg viewBox="0 0 1200 220" preserveAspectRatio="none"><path d="M0 170 L140 110 L260 150 L420 70 L560 140 L700 95 L860 150 L1000 85 L1200 150 L1200 220 L0 220Z" fill="var(--hill-1)"/><path d="M0 195 L180 150 L330 185 L520 130 L700 180 L900 140 L1060 180 L1200 160 L1200 220 L0 220Z" fill="var(--hill-2)"/></svg>' }),
      h('div', { class: 'hero-text' }, h('h1', null, st.greeting ? st.greeting : part + (st.name ? ', ' + st.name : '') + '.'), h('p', null, sub)),
      h('div', { class: 'hero-side' },
        h('button', { type: 'button', class: 'date-btn', onclick: () => go('calendar'), 'aria-label': 'Open calendar' }, U.fmtDay(U.today()), icon('calendar')),
        UI.pendingReminders().length ? h('button', { type: 'button', class: 'date-btn bell', onclick: UI.remindersDialog }, icon('bell'), U.plural(UI.pendingReminders().length, 'reminder')) : ''));
  }
  function ring(pct) {
    const c = 2 * Math.PI * 26;
    return h('span', { class: 'ring', html: '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--line)" stroke-width="6"/><circle cx="32" cy="32" r="26" fill="none" stroke="url(#rg)" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + (c * Math.min(100, pct) / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 32 32)"/><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/></linearGradient></defs></svg><b>' + pct + '%</b>' });
  }
  function cards() {
    const open = S.openLoops(), plan = S.currentPlan(), pr = plan ? S.planProgress(plan) : null, mk = U.monthKey(U.today());
    const n = (stage) => open.filter((l) => l.stage === stage).length;
    const closedMonth = S.state.loops.filter((l) => l.stage === 'CLOSED' && U.monthKey(l.completedAt) === mk).length;
    const card = (cls, ic, num, label, run) => h('button', { type: 'button', class: 'stat ' + cls, onclick: run }, h('span', { class: 'stat-ico' }, icon(ic, 22)), h('span', null, h('b', null, num), h('small', null, label)));
    return h('section', { class: 'stats', 'aria-label': 'Overview' },
      h('button', { type: 'button', class: 'stat wide', onclick: () => go('rewards') }, ring(pr ? pr.pct : 0), h('span', null, h('b', { class: 'serif' }, 'Monthly progress'), h('small', null, pr ? pr.resolvedCount + ' of ' + pr.count + ' loops resolved' : 'No plan set for this month')), icon('right')),
      card('s-active', 'target', n('ACTIVE'), 'Active', () => V.showLoops({ stage: 'ACTIVE' })),
      card('s-wait', 'pause', n('WAITING'), 'Waiting on', () => go('waiting')),
      card('s-stuck', 'alert', n('STUCK'), 'Stuck', () => V.showLoops({ stage: 'STUCK' })),
      card('s-closed', 'check', closedMonth, 'Closed (' + U.MONTHS[Number(mk.slice(5)) - 1] + ')', () => V.showLoops({ stage: 'CLOSED' })));
  }
  function loopPanel() {
    const hs = V.state.home, open = S.openLoops();
    const stuck = open.filter((l) => l.stage === 'STUCK'), waiting = open.filter((l) => l.stage === 'WAITING');
    const tabs = [['mine', 'My Loops'], ['sector', 'By Sector'], ['stuck', 'Stuck (' + stuck.length + ')'], ['waiting', 'Waiting On (' + waiting.length + ')'], ['recent', 'Recent Activity']];
    let body;
    const capture = UI.btn('Capture a loop', () => UI.quickCapture(), 'primary small');
    if (hs.tab === 'mine') body = V.loopTable(open, { sort: hs.sort, empty: 'No open loops. That is allowed.', emptyAction: capture });
    else if (hs.tab === 'stuck') body = V.loopTable(stuck, { sort: hs.sort, empty: 'Nothing is stuck.' });
    else if (hs.tab === 'waiting') body = V.loopTable(waiting, { sort: hs.sort, empty: 'You are not waiting on anyone.' });
    else if (hs.tab === 'sector') {
      const groups = S.activeSectors().map((s) => ({ s: s, list: open.filter((l) => l.sectorIds.indexOf(s.id) >= 0) })).filter((g) => g.list.length);
      const none = open.filter((l) => !l.sectorIds.some((id) => S.sector(id) && !S.sector(id).archived));
      body = groups.length || none.length ? h('div', null, groups.map((g) => h('div', { class: 'group' }, h('h3', null, h('span', { class: 'dot', style: 'background:' + g.s.color }), g.s.name, h('span', { class: 'faint' }, ' · ' + g.list.length)), V.loopTable(g.list, { cols: ['title', 'stage', 'expected', 'next'] }))),
        none.length ? h('div', { class: 'group' }, h('h3', null, 'No sector', h('span', { class: 'faint' }, ' · ' + none.length)), V.loopTable(none, { cols: ['title', 'stage', 'expected', 'next'] })) : '') : h('div', { class: 'empty' }, h('p', null, 'No open loops.'));
    } else {
      const ev = []; S.state.loops.forEach((l) => l.history.forEach((x) => ev.push({ l: l, x: x })));
      ev.sort((a, b) => (a.x.at < b.x.at ? 1 : -1));
      body = ev.length ? h('ul', { class: 'activity' }, ev.slice(0, 14).map((e) => h('li', null, h('span', { class: 'h-when' }, U.fmtStamp(e.x.at)), h('button', { type: 'button', class: 'linkish', onclick: () => UI.editLoop(e.l.id) }, e.l.title), h('span', { class: 'faint' }, ' · ' + UI.historyLine(e.x))))) : h('div', { class: 'empty' }, h('p', null, 'No activity yet.'));
    }
    return h('section', { class: 'panel' }, h('div', { class: 'tabs', role: 'tablist' }, tabs.map((t) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(hs.tab === t[0]), class: hs.tab === t[0] ? 'on' : '', onclick: () => { hs.tab = t[0]; L.app.render(); } }, t[1]))), body);
  }
  function says() {
    const recs = V.recommendations(), hs = V.state.home;
    if (hs.rec >= recs.length) hs.rec = 0;
    const r = recs[hs.rec];
    return h('section', { class: 'panel says', 'aria-label': 'Loop recommendations' }, h('span', { class: 'says-ico' }, icon('spark', 24)),
      h('div', { class: 'says-body' }, h('h2', null, 'Loop says…', recs.length > 1 && h('small', { class: 'faint' }, ' ' + (hs.rec + 1) + ' of ' + recs.length)),
        h('p', null, r ? r.text : S.openLoops().length ? 'Nothing needs adjusting. Today’s plan fits, and nothing is overdue for a decision.' : 'All quiet. Capture something when it comes to mind.'),
        h('p', { class: 'hint' }, 'Suggestions come from simple rules over your own loops. No AI model, nothing leaves this device.')),
      r && h('div', { class: 'says-actions' }, r.actions.filter(Boolean).map((a, i) => UI.btn(a.label, a.run, i === 0 ? 'primary' : 'ghost')),
        UI.btn(r.id === 'overfull' ? 'Keep as is' : 'Not today', () => { const d = prune(S.state.settings.dismissed); d[r.id] = U.today(); S.saveSettings({ dismissed: d }); }, 'ghost'),
        recs.length > 1 && UI.btn('Next', () => { hs.rec = (hs.rec + 1) % recs.length; L.app.render(); }, 'ghost')));
  }
  const prune = (d) => { const out = {}, t = U.today(); Object.keys(d || {}).forEach((k) => { if (d[k] === t) out[k] = t; }); return out; };
  function todayPanel() {
    const items = S.todayItems(), st = S.state.settings, planned = items.reduce((a, i) => a + i.mins, 0);
    return h('section', { class: 'panel side' }, h('div', { class: 'panel-head' }, h('h2', null, icon('calendar'), 'Today’s Plan'), h('small', { class: planned > st.dailyCapacityMin ? 'soft-warn' : 'faint' }, '≈ ' + U.mins(planned) + ' of ' + U.mins(st.dailyCapacityMin))),
      items.length ? h('ul', { class: 'today' }, items.map((it) => h('li', null,
        h('button', { type: 'button', class: 'tick', 'aria-label': 'Done: ' + it.label, title: it.step ? 'Mark this step done' : 'Close this loop…', onclick: () => { if (it.step) { S.setStepStatus(it.loop.id, it.step.id, 'done'); UI.toast('Step done.', { action: { label: 'Undo', run: () => S.setStepStatus(it.loop.id, it.step.id, 'todo') } }); } else UI.closeDialog(it.loop.id); } }),
        h('button', { type: 'button', class: 'linkish today-label', onclick: () => UI.editLoop(it.loop.id) }, it.label, it.label !== it.loop.title && h('small', { class: 'faint' }, it.loop.title)),
        h('span', { class: 'faint mins' }, it.mins ? '≈ ' + U.mins(it.mins) : ''))))
        : h('p', { class: 'faint' }, 'Nothing planned for today. Use “Plan for today” in any loop’s ⋯ menu.'),
      h('div', { class: 'row' }, UI.btn('Open day view', () => { V.state.cal.mode = 'day'; V.state.cal.cursor = U.today(); go('calendar'); }, 'ghost small')));
  }
  V.rewardBar = function (plan, pr) {
    return h('div', { class: 'reward-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pr.pct, 'aria-label': 'Resolution progress' },
      h('span', { class: 'fill', style: 'width:' + Math.min(100, pr.pct) + '%' }), plan.rewards.map((r) => h('span', { class: 'mark' + (pr.pct >= r.pct ? ' hit' : ''), style: 'left:' + r.pct + '%', title: r.pct + '% — ' + r.title })));
  };
  V.rewardList = (plan, pr) => h('ul', { class: 'rewards' }, plan.rewards.map((r) => h('li', { class: pr.pct >= r.pct ? 'hit' : '' }, h('span', { class: 'tick' + (pr.pct >= r.pct ? ' done' : '') }, pr.pct >= r.pct ? icon('check', 13) : ''), h('span', null, r.pct + '% — ' + r.title), pr.pct >= r.pct && h('small', null, 'Unlocked'))));
  function rewardPanel() {
    const plan = S.currentPlan(), name = U.MONTHS_LONG[new Date().getMonth()];
    if (!plan) return h('section', { class: 'panel side' }, h('div', { class: 'panel-head' }, h('h2', null, icon('gift'), name + ' Rewards')), h('p', { class: 'faint' }, 'No reward plan for this month yet.'), UI.btn('Set up the month', () => go('rewards'), 'ghost small'));
    const pr = S.planProgress(plan);
    return h('section', { class: 'panel side' }, h('div', { class: 'panel-head' }, h('h2', null, icon('gift'), name + ' Reward Progress'), h('b', null, pr.pct + '%')), V.rewardBar(plan, pr),
      plan.rewards.length ? V.rewardList(plan, pr) : h('p', { class: 'faint' }, 'No rewards defined.'), h('div', { class: 'row' }, UI.btn('Open rewards', () => go('rewards'), 'ghost small')));
  }
  function insightPanel() {
    const i = S.insights(), lines = [];
    if (i.effort.n >= 3) lines.push(['clock', 'Completed loops took a median of ' + i.effort.ratio.toFixed(1) + '× your estimate (' + i.effort.n + ' loops).']);
    const decided = i.res.DECIDED_NOT_TO + i.res.SUPERSEDED;
    if (decided) lines.push(['check', U.plural(decided, 'loop') + ' closed by decision rather than completion.']);
    if (i.late.n >= 2) lines.push(['calendar', i.late.median > 0 ? 'Completed loops finish a median of ' + i.late.median + ' days after the expected date.' : 'Completed loops usually finish on or before the expected date.']);
    if (i.reschedules.total) lines.push(['repeat', U.plural(i.reschedules.total, 'reschedule') + ' recorded so far.']);
    return h('section', { class: 'panel side' }, h('button', { type: 'button', class: 'panel-head linkhead', onclick: () => go('insights') }, h('h2', null, icon('chart'), 'Loop Insights'), icon('right')),
      lines.length ? h('ul', { class: 'insight-lines' }, lines.slice(0, 3).map((x) => h('li', null, icon(x[0]), h('span', null, x[1])))) : h('p', { class: 'faint' }, 'Patterns appear here once a few loops have been closed.'));
  }
  V.sampleBanner = () => S.hasSample() && h('div', { class: 'banner' }, h('span', null, h('b', null, 'Sample data is showing. '), 'Loops marked “Sample” are examples, not yours.'),
    UI.btn('Remove sample data', () => UI.confirm({ title: 'Remove sample data?', text: 'All sample loops and the sample reward plan are removed. Loops you created are untouched.', confirmLabel: 'Remove samples' }).then((ok) => { if (ok) S.removeSample().then(() => UI.toast('Sample data removed.')); }), 'small'));
  V.storageBanner = () => !S.adapter.persistent && h('div', { class: 'banner warn' }, h('span', null, h('b', null, 'Nothing is being saved. '), 'This browser is blocking storage (private window, or site data disabled). Anything you enter is lost when the tab closes. Download a backup before leaving.'));

  V.home = () => h('div', { class: 'view home' }, hero(), V.storageBanner(), V.legacyBanner(), V.sampleBanner(), cards(),
    h('div', { class: 'home-grid' }, h('div', { class: 'col-main' }, loopPanel(), says()), h('div', { class: 'col-side' }, todayPanel(), rewardPanel(), insightPanel())));
})();
