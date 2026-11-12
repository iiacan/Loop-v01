/* Loop — views-more.js: Sectors, Insights, Rewards (monthly plan + month-end review), Settings (backup, restore). */
(function () {
  'use strict';
  const L = window.Loop, U = L.U, S = L.S, UI = L.UI, V = L.V, h = U.h, icon = U.icon;
  const render = () => L.app.render();

  /* ---------- Sectors ---------- */
  function sectorDialog(sec) {
    const d = sec ? { name: sec.name, color: sec.color } : { name: '', color: '#b79cf2' };
    const err = h('p', { class: 'form-error', role: 'alert' });
    const m = UI.modal({ title: sec ? 'Edit sector' : 'New sector' });
    m.body.append(h('div', { class: 'grid2' }, UI.field('Name', UI.inp(d, 'name', { 'data-autofocus': true, maxlength: 40 })), UI.field('Colour', UI.inp(d, 'color', { type: 'color' }))), err);
    m.foot.append(UI.btn('Cancel', () => m.close(), 'ghost'), UI.btn(sec ? 'Save' : 'Add sector', () => {
      const name = d.name.trim(); if (!name) { err.textContent = 'Give the sector a name.'; return; }
      const clash = S.sectorByName(name); if (clash && (!sec || clash.id !== sec.id)) { err.textContent = 'A sector with that name already exists.'; return; }
      if (sec) S.updateSector(sec.id, { name: name, color: d.color }); else S.addSector(name, d.color);
      m.close(); UI.toast('Sector saved.');
    }, 'primary'));
  }
  V.sectors = function () {
    const card = (s) => {
      const mine = S.state.loops.filter((l) => l.sectorIds.indexOf(s.id) >= 0), open = mine.filter((l) => l.stage !== 'CLOSED').length;
      return h('li', { class: 'sector-card' + (s.archived ? ' archived' : '') }, h('span', { class: 'dot big', style: 'background:' + s.color }),
        h('div', { class: 'grow' }, h('button', { type: 'button', class: 'linkish title', onclick: () => V.showLoops({ sector: s.id, stage: 'all' }) }, s.name), h('small', { class: 'faint' }, open + ' open · ' + (mine.length - open) + ' closed')),
        UI.btn('Edit', () => sectorDialog(s), 'ghost tiny'),
        UI.btn(s.archived ? 'Restore' : 'Archive', () => { S.updateSector(s.id, { archived: !s.archived }); UI.toast(s.archived ? 'Sector archived. Its loops keep the label.' : 'Sector restored.'); }, 'ghost tiny'));
    };
    const live = S.state.sectors.filter((s) => !s.archived), arch = S.state.sectors.filter((s) => s.archived);
    return h('div', { class: 'view' }, V.head('Sectors', 'Labels for the parts of your life. A loop can carry several; they are not separate task lists.', UI.btn([icon('plus', 16), 'New sector'], () => sectorDialog(null), 'primary')),
      h('section', { class: 'panel' }, live.length ? h('ul', { class: 'sector-grid' }, live.map(card)) : h('div', { class: 'empty' }, h('p', null, 'No sectors. Add one to start grouping loops.'))),
      arch.length ? h('section', { class: 'panel' }, h('h2', null, 'Archived'), h('ul', { class: 'sector-grid' }, arch.map(card))) : '');
  };

  /* ---------- Insights ---------- */
  const tile = (num, label, note) => h('div', { class: 'tile' }, h('b', null, num), h('span', null, label), note && h('small', { class: 'faint' }, note));
  const hbars = (rows) => { const max = Math.max.apply(null, rows.map((r) => r.value).concat([1])); return h('ul', { class: 'hbars' }, rows.map((r) => h('li', null, h('span', { class: 'hb-label' }, r.label), h('span', { class: 'hb-track' }, h('span', { class: 'hb-fill', style: 'width:' + (r.value / max) * 100 + '%;' + (r.color ? 'background:' + r.color : '') })), h('span', { class: 'hb-val' }, r.text || r.value)))); };
  V.insights = function () {
    const i = S.insights(), closedN = i.counts.closed, resolved = closedN - i.res.ARCHIVED;
    const need = (n, min, what) => h('p', { class: 'faint' }, 'Needs at least ' + min + ' ' + what + ' (' + n + ' so far).');
    const wmax = Math.max.apply(null, i.weeks.map((w) => Math.max(w.created, w.closed)).concat([1]));
    const ws = S.state.settings.weekStart, wd = []; for (let k = 0; k < 7; k++) wd.push({ label: U.DAYS[(ws + k) % 7], value: i.weekday[(ws + k) % 7] });
    return h('div', { class: 'view' }, V.head('Insights', 'Plain counts from your own loop history. Descriptive only: Loop does not diagnose anything or guess how you feel.'),
      V.sampleBanner(),
      h('section', { class: 'tiles' },
        tile(i.counts.open, 'Open loops'), tile(i.counts.closed30, 'Closed in 30 days'),
        tile(closedN ? Math.round((resolved / closedN) * 100) + '%' : '—', 'Closed with a resolution', closedN ? i.res.COMPLETED + ' completed · ' + (i.res.DECIDED_NOT_TO + i.res.SUPERSEDED) + ' by decision · ' + i.res.ARCHIVED + ' archived' : null),
        tile(i.effort.n >= 3 ? i.effort.ratio.toFixed(1) + '×' : '—', 'Actual vs estimated effort', i.effort.n >= 3 ? 'median over ' + i.effort.n + ' loops' : 'needs 3 loops with both'),
        tile(i.late.n >= 2 ? (i.late.median > 0 ? '+' : '') + i.late.median + ' d' : '—', 'Finish vs expected date', i.late.n >= 2 ? i.late.onTime + ' of ' + i.late.n + ' on or before the date' : 'needs 2 completed loops with dates'),
        tile(i.reschedules.total, 'Reschedules'), tile(i.stalls.total, 'Times stuck', i.stalls.now + ' stuck now'),
        tile(i.waits.n ? i.waits.median.toFixed(1) + ' d' : '—', 'Median time waiting', i.waits.n ? 'across ' + U.plural(i.waits.n, 'loop') : null),
        tile(i.steps.total ? Math.round((i.steps.done / i.steps.total) * 100) + '%' : '—', 'Steps done', i.steps.total ? i.steps.done + ' of ' + i.steps.total : null)),
      h('div', { class: 'two-col' },
        h('section', { class: 'panel' }, h('h2', null, 'Opened and closed, last 8 weeks'),
          h('div', { class: 'cols', role: 'img', 'aria-label': 'Loops opened and closed per week: ' + i.weeks.map((w) => U.fmtDate(w.start) + ' opened ' + w.created + ', closed ' + w.closed).join('; ') },
            i.weeks.map((w) => h('div', { class: 'col' }, h('div', { class: 'col-bars' }, h('span', { class: 'cb opened', style: 'height:' + (w.created / wmax) * 100 + '%', title: w.created + ' opened' }), h('span', { class: 'cb closed', style: 'height:' + (w.closed / wmax) * 100 + '%', title: w.closed + ' closed' })), h('small', null, U.fmtDate(w.start))))),
          h('ul', { class: 'legend' }, h('li', null, h('span', { class: 'ev-mark', style: 'background:var(--accent)' }), 'Opened'), h('li', null, h('span', { class: 'ev-mark', style: 'background:var(--ok)' }), 'Closed'))),
        h('section', { class: 'panel' }, h('h2', null, 'How loops ended'), closedN ? hbars(Object.keys(L.RESOLUTIONS).map((k) => ({ label: L.RESOLUTIONS[k], value: i.res[k], color: { COMPLETED: 'var(--ok)', DECIDED_NOT_TO: 'var(--accent)', SUPERSEDED: 'var(--wait)', ARCHIVED: 'var(--faint)' }[k] }))) : need(0, 1, 'closed loop'),
          h('p', { class: 'hint' }, 'Completion and resolution are counted separately. Deciding not to is a resolution, not a miss.')),
        h('section', { class: 'panel' }, h('h2', null, 'Estimated vs actual effort'), i.effort.n ? h('table', { class: 'mini-table' }, h('thead', null, h('tr', null, h('th', null, 'Loop'), h('th', null, 'Estimate'), h('th', null, 'Actual'), h('th', null, 'Ratio'))),
          h('tbody', null, i.effort.rows.map((l) => h('tr', null, h('td', null, l.title), h('td', null, U.mins(l.estMinutes)), h('td', null, U.mins(l.actualMinutes)), h('td', null, (l.actualMinutes / l.estMinutes).toFixed(1) + '×'))))) : need(0, 1, 'completed loop with both an estimate and an actual time')),
        h('section', { class: 'panel' }, h('h2', null, 'Closures by day of week'), closedN ? hbars(wd) : need(0, 1, 'closed loop')),
        h('section', { class: 'panel' }, h('h2', null, 'Stalls and reschedules by sector'), i.bySector.some((x) => x.stalls + x.reschedules) ? hbars(i.bySector.filter((x) => x.stalls + x.reschedules).sort((a, b) => b.stalls + b.reschedules - a.stalls - a.reschedules).map((x) => ({ label: x.sector.name, value: x.stalls + x.reschedules, color: x.sector.color, text: x.stalls + ' stuck · ' + x.reschedules + ' moved' }))) : h('p', { class: 'faint' }, 'No stalls or reschedules recorded yet.')),
        h('section', { class: 'panel' }, h('h2', null, 'Most rescheduled'), i.reschedules.top.length ? h('ul', { class: 'plain-list' }, i.reschedules.top.map((l) => h('li', { class: 'row between' }, h('button', { type: 'button', class: 'linkish', onclick: () => UI.editLoop(l.id) }, l.title), h('span', { class: 'faint' }, l.rescheduleCount + '×')))) : h('p', { class: 'faint' }, 'Nothing has been rescheduled yet.'))));
  };

  /* ---------- Rewards ---------- */
  const weightSel = (value, onchange, label) => UI.sel(value, L.WEIGHTS, (v) => onchange(Number(v)), { class: 'mini', 'aria-label': label || 'Commitment weight' });
  function rewardEditor(rows, onchange) {
    return h('div', { class: 'reward-edit' }, rows.map((r, i) => h('div', { class: 'row' },
      h('input', { type: 'number', min: 1, max: 100, class: 'mini num', value: r.pct, 'aria-label': 'Milestone percent', id: 'rw-p' + i, oninput: (e) => { r.pct = Number(e.target.value) || 0; } }), h('span', { class: 'faint' }, '%'),
      h('input', { type: 'text', value: r.title, placeholder: 'Reward, e.g. movie outing', 'aria-label': 'Reward', id: 'rw-t' + i, maxlength: 80, oninput: (e) => { r.title = e.target.value; } }),
      UI.iconBtn('trash', 'Remove milestone', () => { rows.splice(i, 1); onchange(); }))),
      UI.btn('+ Add milestone', () => { rows.push({ pct: 100, title: '' }); onchange(); }, 'ghost small'));
  }
  function startSetup(key) {
    V.state.rewards.setup = { key: key, items: S.defaultPool(key).map((x) => ({ id: x.loop.id, checked: x.checked, weight: 1 })), rewards: U.clone(S.state.settings.rewardTiers) };
    render();
  }
  function setupPanel(su) {
    const picked = su.items.filter((x) => x.checked);
    return h('section', { class: 'panel' }, h('h2', null, 'Set up ' + U.monthName(su.key)),
      h('p', { class: 'hint' }, 'Choose the loops that count this month. Progress is the weighted share of this pool that gets resolved. Loops created later do not count unless you add them on purpose, and every change after the month starts is logged.'),
      h('h3', null, 'Commitment pool · ' + picked.length + ' chosen'),
      su.items.length ? h('ul', { class: 'pool-pick' }, su.items.map((it) => { const l = S.get(it.id); return l && h('li', null,
        h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'pool-' + it.id, checked: it.checked, onchange: (e) => { it.checked = e.target.checked; render(); } }), h('span', null, l.title, V.badges(l), h('small', { class: 'faint' }, l.expectedDate ? ' · expected ' + U.fmtDate(l.expectedDate) : l.deadline ? ' · deadline ' + U.fmtDate(l.deadline) : ' · no date'))),
        weightSel(it.weight, (v) => (it.weight = v), 'Weight for ' + l.title)); })) : h('p', { class: 'faint' }, 'There are no open loops to commit to yet. Capture some first.'),
      h('p', { class: 'hint' }, 'Weights stop small loops inflating progress: a light loop counts ½, a major one 3.'),
      h('h3', null, 'Rewards'), rewardEditor(su.rewards, render),
      h('div', { class: 'row end' }, UI.btn('Cancel', () => { V.state.rewards.setup = null; render(); }, 'ghost'),
        UI.btn('Start ' + U.monthName(su.key) + ' plan', () => {
          if (!picked.length) { UI.toast('Choose at least one loop for the pool.'); return; }
          S.createPlan(su.key, picked.map((x) => ({ loopId: x.id, weight: x.weight })), su.rewards);
          V.state.rewards.setup = null; UI.toast('Plan saved. The original is kept on record.'); render();
        }, 'primary')));
  }
  function planPanel(plan, upcoming) {
    const pr = S.planProgress(plan), name = U.monthName(plan.id), locked = !!plan.review;
    const inPool = {}; plan.pool.forEach((it) => (inPool[it.loopId] = 1));
    const candidates = S.state.loops.filter((l) => !inPool[l.id] && l.stage !== 'CLOSED');
    const add = { id: '', weight: 1 };
    const edit = U.clone(plan.rewards);
    const fmtPool = (pool) => pool.map((p) => p.title + ' (×' + p.weight + ')').join(', ') || 'none';
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', null, name + (upcoming ? ' · planned ahead' : '') + (plan.sample ? ' ' : ''), plan.sample && h('span', { class: 'badge sample' }, 'Sample')), !upcoming && h('b', { class: 'big-pct' }, pr.pct + '%')),
      !upcoming && V.rewardBar(plan, pr),
      !upcoming && h('div', { class: 'tiles small' }, h('div', { class: 'tile' }, h('b', null, pr.pct + '%'), h('span', null, 'Resolution'), h('small', { class: 'faint' }, pr.resolvedCount + ' of ' + pr.count + ' loops · any resolution except archived')),
        h('div', { class: 'tile' }, h('b', null, pr.completionPct + '%'), h('span', null, 'Completion'), h('small', { class: 'faint' }, pr.completedCount + ' of ' + pr.count + ' loops completed as intended')),
        h('div', { class: 'tile' }, h('b', null, pr.archivedCount), h('span', null, 'Archived'), h('small', { class: 'faint' }, 'left out of the denominator'))),
      h('h3', null, 'Rewards'), plan.rewards.length ? V.rewardList(plan, upcoming ? { pct: -1 } : pr) : h('p', { class: 'faint' }, 'No rewards set.'),
      !locked && h('details', null, h('summary', null, 'Edit rewards'), (function () { const box = h('div'); const draw = () => box.replaceChildren(rewardEditor(edit, draw)); draw(); return box; })(), h('p', { class: 'hint' }, upcoming ? 'Free to change until the month begins.' : 'The month has started, so this change will be written to the plan’s change log.'),
        UI.btn('Save rewards', () => {
          const clean = edit.filter((r) => r.title.trim()).map((r) => ({ id: r.id || U.uid('r'), pct: Math.min(100, Math.max(1, Number(r.pct) || 0)), title: r.title.trim() })).sort((a, b) => a.pct - b.pct);
          const fmt = (rs) => rs.map((r) => r.pct + '% ' + r.title).join('; ') || 'none';
          S.planChange(plan, 'Rewards changed from [' + fmt(plan.rewards) + '] to [' + fmt(clean) + ']', (p) => (p.rewards = clean)); UI.toast('Rewards saved.');
        }, 'small')),
      h('h3', null, 'Commitment pool · ' + plan.pool.length),
      h('div', { class: 'table-wrap' }, h('table', { class: 'mini-table' }, h('thead', null, h('tr', null, h('th', null, 'Loop'), h('th', null, 'Weight'), h('th', null, 'Joined'), h('th', null, 'Status'), h('th', null, h('span', { class: 'sr' }, 'Remove')))),
        h('tbody', null, plan.pool.map((it) => { const l = S.get(it.loopId); return h('tr', null,
          h('td', null, l ? h('button', { type: 'button', class: 'linkish', onclick: () => UI.editLoop(l.id) }, l.title) : h('span', { class: 'faint' }, it.title + ' (deleted)')),
          h('td', null, locked ? '×' + it.weight : weightSel(it.weight, (v) => S.planChange(plan, 'Weight of “' + it.title + '” changed from ' + it.weight + ' to ' + v, () => (it.weight = v)), 'Weight for ' + it.title)),
          h('td', null, { initial: 'Original plan', added: 'Added later', carried: 'Carried forward' }[it.how] || it.how),
          h('td', null, S.poolStatus(plan, it)),
          h('td', null, !locked && UI.iconBtn('x', 'Remove from pool', () => UI.confirm({ title: 'Remove from this month’s pool?', text: '“' + it.title + '” will stop counting toward ' + name + '. The loop itself is not changed' + (upcoming ? '.' : ', and the removal is logged.'), confirmLabel: 'Remove' }).then((ok) => { if (ok) S.planChange(plan, 'Removed from pool: “' + it.title + '”', (p) => (p.pool = p.pool.filter((x) => x.loopId !== it.loopId))); })))); })))),
      !locked && candidates.length ? h('div', { class: 'row wrap add-pool' }, UI.sel('', [['', 'Add a loop to this pool…']].concat(candidates.map((l) => [l.id, l.title])), (v) => (add.id = v), { 'aria-label': 'Loop to add to pool' }), weightSel(1, (v) => (add.weight = v)),
        UI.btn('Add to pool', () => { const l = S.get(add.id); if (!l) { UI.toast('Pick a loop first.'); return; } S.planChange(plan, 'Added to pool' + (upcoming ? '' : ' after the month began') + ': “' + l.title + '” (×' + add.weight + ')', (p) => p.pool.push({ loopId: l.id, weight: add.weight, title: l.title, addedAt: U.nowISO(), how: upcoming ? 'initial' : 'added' })); UI.toast('Added to the pool.'); }, 'small')) : '',
      h('details', null, h('summary', null, 'Plan record · ' + U.plural(plan.changes.length, 'change') + ' since it started'),
        h('p', { class: 'hint' }, 'Created ' + U.fmtStamp(plan.createdAt) + '.'),
        h('p', null, h('b', null, 'Original pool: '), fmtPool(plan.original.pool)), h('p', null, h('b', null, 'Original rewards: '), plan.original.rewards.map((r) => r.pct + '% ' + r.title).join('; ') || 'none'),
        plan.changes.length ? h('ol', { class: 'history' }, plan.changes.slice().reverse().map((c) => h('li', null, h('span', { class: 'h-when' }, U.fmtStamp(c.at)), h('span', null, c.note)))) : h('p', { class: 'faint' }, 'No changes since the plan started.')));
  }
  function reviewPanel(rv) {
    const plan = rv.plan, pr = S.planProgress(plan), dec = (V.state.rewards.decisions = V.state.rewards.decisions || {});
    rv.unresolved.forEach((l) => { if (!dec[l.id]) dec[l.id] = 'carry'; });
    return h('section', { class: 'panel review' }, h('h2', null, 'Month-end review · ' + U.monthName(plan.id)),
      h('p', null, U.monthName(plan.id) + ' finished at ', h('b', null, pr.pct + '% resolution'), ' (' + pr.completionPct + '% completion). That score is now fixed. ' + U.plural(rv.unresolved.length, 'loop is', 'loops are') + ' still open; choose what happens to each.'),
      h('p', { class: 'hint' }, 'Carrying forward is not completion, and decisions made here do not raise last month’s score.'),
      h('ul', { class: 'pool-pick' }, rv.unresolved.map((l) => h('li', null, h('span', null, h('button', { type: 'button', class: 'linkish', onclick: () => UI.editLoop(l.id) }, l.title), ' ', UI.chip(l.stage)),
        UI.sel(dec[l.id], [['carry', 'Carry forward'], ['DECIDED_NOT_TO', 'Close: decided not to'], ['SUPERSEDED', 'Close: superseded'], ['ARCHIVED', 'Archive']], (v) => (dec[l.id] = v), { 'aria-label': 'Decision for ' + l.title })))),
      h('div', { class: 'row end' }, UI.btn('Complete review', () => { const out = {}; rv.unresolved.forEach((l) => (out[l.id] = dec[l.id])); S.completeReview(plan, out); V.state.rewards.decisions = {}; UI.toast('Review complete. ' + U.monthName(plan.id) + ' is on record.'); }, 'primary')));
  }
  V.rewards = function () {
    const t = U.today(), key = U.monthKey(t), plan = S.currentPlan(), rv = S.pendingReview(), su = V.state.rewards.setup;
    const nextKey = U.monthKey(U.addMonths(key + '-01', 1)), nextPlan = S.plan(nextKey);
    const past = S.state.plans.filter((p) => p.id < key).sort((a, b) => (a.id < b.id ? 1 : -1));
    return h('div', { class: 'view' }, V.head('Rewards', 'Rewards you choose, unlocked by resolving what you committed to. Resolving includes deciding not to.'),
      rv && rv.unresolved.length ? reviewPanel(rv) : '',
      su ? setupPanel(su) : '',
      !su && !plan ? h('section', { class: 'panel' }, h('h2', null, U.monthName(key)), h('div', { class: 'empty' }, h('p', null, 'No plan for this month yet.'), h('p', { class: 'faint' }, 'Pick the loops that count and the rewards you are working toward.'), UI.btn('Set up ' + U.monthName(key), () => startSetup(key), 'primary'))) : '',
      !su && plan ? planPanel(plan, false) : '',
      !su && nextPlan ? planPanel(nextPlan, true) : '',
      !su && !nextPlan ? h('div', { class: 'row' }, UI.btn('Plan ' + U.monthName(nextKey) + ' ahead', () => startSetup(nextKey), 'ghost')) : '',
      past.length ? h('section', { class: 'panel' }, h('h2', null, 'Earlier months'), h('ul', { class: 'plain-list' }, past.map((p) => { const pr = S.planProgress(p); return h('li', { class: 'row between wrap' }, h('span', null, h('b', null, U.monthName(p.id)), h('span', { class: 'faint' }, ' · ' + pr.pct + '% resolution · ' + pr.completionPct + '% completion' + (p.review ? '' : ' · review pending'))),
        h('span', { class: 'faint' }, p.rewards.filter((r) => pr.pct >= r.pct).map((r) => r.title).join(', ') || 'No rewards unlocked')); }))) : '');
  };

  /* ---------- Settings ---------- */
  V.downloadBackup = function () {
    U.download('loop-backup-' + U.today() + '.json', JSON.stringify(S.exportAll(), null, 2));
    S.saveSettings({ lastBackupAt: U.nowISO() });
    UI.toast('Backup downloaded. Keep the file somewhere outside this browser.');
  };
  V.legacyData = function () {
    if (S.state.settings.legacyHandled) return null;
    try { const raw = localStorage.getItem('loop.v1'); if (!raw) return null; const obj = JSON.parse(raw); return obj && Array.isArray(obj.loops) && obj.loops.length ? obj : null; } catch (e) { return null; }
  };
  V.importLegacy = function () {
    const obj = V.legacyData(); if (!obj) return;
    const v = S.validateBackup(obj); if (!v.ok) { UI.toast('The earlier data could not be read.', { kind: 'warn' }); return; }
    S.importData(v.data, 'merge').then(() => { S.saveSettings({ legacyHandled: true }); UI.toast(U.plural(v.data.loops.length, 'loop') + ' brought in from the earlier Loop.'); });
  };
  V.legacyBanner = function () {
    const obj = V.legacyData(); if (!obj) return '';
    return h('div', { class: 'banner' }, h('span', null, h('b', null, 'Your earlier Loop is still on this device. '), U.plural(obj.loops.length, 'loop') + ' from the previous version can be brought in. The old copy is left untouched.'),
      h('span', { class: 'row' }, UI.btn('Bring them in', V.importLegacy, 'small'), UI.btn('Ignore', () => S.saveSettings({ legacyHandled: true }), 'ghost small')));
  };
  function restoreFlow(file) {
    const reader = new FileReader();
    reader.onerror = () => UI.toast('That file could not be read.', { kind: 'warn' });
    reader.onload = () => {
      let obj; try { obj = JSON.parse(reader.result); } catch (e) { obj = null; }
      const v = obj ? S.validateBackup(obj) : { ok: false, errors: ['This file is not valid JSON, so it cannot be a Loop backup.'] };
      if (!v.ok) { const m = UI.modal({ title: 'Backup not imported' }); m.body.append(h('p', null, 'Nothing was changed. The file was rejected because:'), h('ul', null, v.errors.map((e) => h('li', null, e)))); m.foot.append(UI.btn('Close', () => m.close(), 'primary')); return; }
      const s = v.summary, partial = v.kind !== 'full', d = { mode: 'merge', sure: false };
      const m = UI.modal({ title: 'Restore backup' });
      const row = (k, val) => h('div', null, h('dt', null, k), h('dd', null, val));
      function draw() {
        m.body.replaceChildren(h('p', { class: 'strong' }, file.name),
          h('dl', { class: 'summary' }, row('Exported', s.exportedAt ? U.fmtStamp(s.exportedAt) : 'Unknown'), row('Schema', String(s.schema)), row('Loops', s.loops + ' (' + s.open + ' open)'), row('Steps', s.steps), row('History entries', s.history), row('Sectors', s.sectors), row('Monthly plans', s.plans), row('Settings', s.hasSettings ? 'Included' : 'Not included')),
          v.warnings.map((w) => h('p', { class: 'note-box' }, w)),
          h('div', { class: 'radio-cards' },
            h('label', { class: 'radio-card' + (d.mode === 'merge' ? ' on' : '') }, h('input', { type: 'radio', name: 'mode', checked: d.mode === 'merge', onchange: () => { d.mode = 'merge'; draw(); } }), h('span', null, h('b', null, 'Merge'), h('small', null, 'Adds the backup to what is here now (' + S.state.loops.length + ' loops). If the same loop is in both, the backup’s copy replaces yours. Your current settings stay.'))),
            !partial && h('label', { class: 'radio-card' + (d.mode === 'replace' ? ' on' : '') }, h('input', { type: 'radio', name: 'mode', checked: d.mode === 'replace', onchange: () => { d.mode = 'replace'; draw(); } }), h('span', null, h('b', null, 'Replace everything'), h('small', null, 'Deletes all ' + S.state.loops.length + ' loops, sectors, plans and settings on this device, then loads the backup. This cannot be undone.')))),
          partial && h('p', { class: 'hint' }, 'This file is a partial export, so it can only be merged.'),
          d.mode === 'replace' && h('div', { class: 'note-box' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: d.sure, onchange: (e) => { d.sure = e.target.checked; } }), 'I understand that what is here now will be deleted.'),
            UI.btn('Download what is here first', V.downloadBackup, 'ghost small')));
      }
      draw();
      m.foot.append(UI.btn('Cancel', () => m.close(), 'ghost'), UI.btn('Import', () => {
        if (d.mode === 'replace' && !d.sure) { UI.toast('Tick the confirmation box to replace everything.'); return; }
        S.importData(v.data, d.mode).then(() => { m.close(); UI.toast(d.mode === 'replace' ? 'Backup restored. ' + s.loops + ' loops loaded.' : 'Backup merged. ' + s.loops + ' loops imported.'); }, (err) => { console.error(err); UI.toast('Import failed. Nothing further was changed.', { kind: 'warn' }); });
      }, 'primary'));
    };
    reader.readAsText(file);
  }
  V.settings = function () {
    const st = S.state.settings, save = (k, num) => (v) => { const p = {}; p[k] = num ? Number(v) : v; S.saveSettings(p); };
    const text = (k, attrs) => h('input', Object.assign({ type: 'text', id: 'set-' + k, value: st[k] }, attrs || {}, { onchange: (e) => { const p = {}; p[k] = attrs && attrs.type === 'number' ? Math.max(Number(attrs.min) || 0, Number(e.target.value) || 0) : e.target.value.trim(); S.saveSettings(p); UI.toast('Saved.', { ms: 1500 }); } }));
    const card = (title, ...kids) => h('section', { class: 'panel set' }, h('h2', null, title), kids);
    const F = UI.field;
    const notifSupported = 'Notification' in window, perm = notifSupported ? Notification.permission : 'unsupported';
    const storageInfo = h('p', { class: 'hint' }, '');
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then((e) => { const kb = (e.usage || 0) / 1024; navigator.storage.persisted().then((p) => { storageInfo.textContent = 'About ' + (kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.round(kb) + ' KB') + ' used on this device. ' + (p ? 'The browser has agreed to keep it.' : 'The browser may clear it if the device runs low on space.'); }); }).catch(() => {});
    const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'sr', 'aria-label': 'Choose a backup file', onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) restoreFlow(f); } });
    const tiers = U.clone(st.rewardTiers);
    const realCount = S.state.loops.filter((l) => !l.sample).length;
    return h('div', { class: 'view' }, V.head('Settings'), V.legacyBanner(),
      card('Your data',
        h('p', null, h('b', null, 'Stored in: '), S.adapter.label + '.'), storageInfo,
        h('ul', { class: 'facts' }, h('li', null, 'Your loops stay in this browser on this device. They do not sync to your other devices.'), h('li', null, 'GitHub Pages only delivers the app’s files. It never receives, stores or syncs anything you enter.'), h('li', null, 'Clearing this browser’s site data deletes your loops. Without a backup file they cannot be recovered.')),
        h('div', { class: 'row wrap' }, UI.btn([icon('download', 16), 'Download Backup'], V.downloadBackup, 'primary'), UI.btn([icon('upload', 16), 'Restore from backup…'], () => fileInput.click(), ''), fileInput,
          navigator.storage && navigator.storage.persist ? UI.btn('Ask browser to keep this data', () => navigator.storage.persist().then((ok) => { UI.toast(ok ? 'The browser will keep Loop’s data.' : 'The browser declined for now. Installing Loop to the home screen usually helps.'); render(); }), 'ghost') : ''),
        h('p', { class: 'hint' }, (st.lastBackupAt ? 'Last backup: ' + U.fmtStamp(st.lastBackupAt) + '.' : 'No backup downloaded yet.') + ' Each backup is a new dated file; Loop never overwrites an earlier one.'),
        h('div', { class: 'grid3' }, F('Remind me to back up', UI.sel(st.backupReminderDays, [[0, 'Never'], [7, 'Every week'], [14, 'Every 2 weeks'], [30, 'Every month']], save('backupReminderDays', true)), 'A gentle note on Home, nothing more.')),
        h('h3', null, 'Export'), h('div', { class: 'row wrap' },
          UI.btn('All loops as CSV', () => { U.download('loop-all-' + U.today() + '.csv', S.loopsCsv(S.state.loops), 'text/csv'); UI.toast('CSV exported.'); }, 'ghost small'),
          UI.btn('Open loops as CSV', () => { U.download('loop-open-' + U.today() + '.csv', S.loopsCsv(S.openLoops()), 'text/csv'); UI.toast('CSV exported.'); }, 'ghost small'),
          UI.btn('Filtered export…', () => V.showLoops(), 'ghost small')),
        h('p', { class: 'hint' }, 'A single loop can be exported from its details. Filtered lists export from My Loops.')),
      card('You', h('div', { class: 'grid3' }, F('Name', text('name', { maxlength: 40 })), F('Custom greeting', text('greeting', { maxlength: 80, placeholder: 'Leave empty for time-based' }), 'Replaces “Good morning, …”.'))),
      card('Dates, time and look', h('div', { class: 'grid3' },
        F('Date format', UI.sel(st.dateFormat, [['dmy', '12 Nov 2026'], ['mdy', 'Nov 12, 2026'], ['iso', '2026-11-12']], save('dateFormat'))),
        F('Time format', UI.sel(st.timeFormat, [['24', '24-hour (14:30)'], ['12', '12-hour (2:30 pm)']], save('timeFormat'))),
        F('Week starts on', UI.sel(st.weekStart, [[1, 'Monday'], [0, 'Sunday'], [6, 'Saturday']], save('weekStart', true))),
        F('Theme', UI.sel(st.theme, [['midnight', 'Midnight (default)'], ['dusk', 'Dusk'], ['light', 'Daylight']], save('theme'))))),
      card('Planning', h('div', { class: 'grid3' },
        F('Daily capacity (minutes)', text('dailyCapacityMin', { type: 'number', min: 15 }), 'Loop flags a day’s plan that exceeds this.'),
        F('Active loops limit', text('maxActive', { type: 'number', min: 1 }), 'Loop mentions it when more are active at once.'))),
      card('Reminders and notifications',
        h('p', null, 'Reminders always appear inside Loop while it is open. Browser notifications are optional.'),
        h('p', { class: 'note-box' }, 'Loop is a static site. It cannot wake a closed browser, so do not rely on it for anything time-critical. Use your phone’s clock or calendar for those.'),
        h('div', { class: 'row wrap' }, h('span', null, h('b', null, 'Browser notifications: '), !notifSupported ? 'not supported in this browser' : perm === 'denied' ? 'blocked in browser settings' : st.notifications && perm === 'granted' ? 'on' : 'off'),
          notifSupported && perm !== 'denied' ? (st.notifications && perm === 'granted' ? UI.btn('Turn off', () => S.saveSettings({ notifications: false }), 'ghost small') : UI.btn('Turn on', () => { try { Promise.resolve(Notification.requestPermission()).then((p) => { S.saveSettings({ notifications: p === 'granted' }); UI.toast(p === 'granted' ? 'Notifications on.' : 'Permission was not given.'); }); } catch (e) { UI.toast('This browser would not ask for permission.'); } }, 'small')) : ''),
        h('div', { class: 'grid3' }, F('Default reminder', UI.sel(st.defaultReminder, [['none', 'On the expected date'], ['day-before-deadline', 'The day before the deadline']], save('defaultReminder')), 'Used by the “Default” button in a loop.'),
          F('Default reminder time', h('input', { type: 'time', value: st.defaultReminderTime, onchange: (e) => S.saveSettings({ defaultReminderTime: e.target.value || '09:00' }) })))),
      card('Reward defaults', h('p', { class: 'hint' }, 'Milestones offered when you set up a new month. Changing these does not alter a plan that already exists.'), (function () { const box = h('div'); const draw = () => box.replaceChildren(rewardEditor(tiers, draw)); draw(); return box; })(),
        UI.btn('Save defaults', () => { S.saveSettings({ rewardTiers: tiers.filter((r) => r.pct > 0).map((r) => ({ pct: Math.min(100, r.pct), title: r.title.trim() })) }); UI.toast('Reward defaults saved.'); }, 'small')),
      card('Sample data', h('p', null, S.hasSample() ? 'Sample loops are present. They are labelled “Sample” wherever they appear.' : 'No sample data is loaded.'),
        h('div', { class: 'row wrap' }, S.hasSample() ? UI.btn('Remove sample data', () => S.removeSample().then(() => UI.toast('Sample data removed.')), 'small') : UI.btn('Load sample data', () => S.loadSample().then(() => UI.toast('Sample data loaded.')), 'ghost small'))),
      card('About', h('p', null, 'Loop ' + L.APP_VERSION + ' · data schema ' + L.SCHEMA_VERSION + ' · backup format ' + L.BACKUP_VERSION), h('p', { class: 'hint' }, 'Keep the thread. Shortcuts: N quick capture, / search, Esc close, Ctrl/⌘+Enter save a loop.'),
        h('h3', null, 'Erase'), h('p', { class: 'hint' }, 'Deletes every loop and monthly plan on this device (' + realCount + ' of your own loops). Sectors and settings stay.'),
        UI.btn('Erase all loops…', () => UI.confirm({ title: 'Erase all loops?', text: 'This deletes all ' + S.state.loops.length + ' loops and every monthly plan from this browser. It cannot be undone. Download a backup first if there is any doubt.', confirmLabel: 'Erase everything', danger: true, extra: UI.btn('Download Backup first', V.downloadBackup, 'ghost small') }).then((ok) => { if (ok) S.eraseAll().then(() => UI.toast('All loops erased.')); }), 'ghost danger-text small')));
  };
})();
