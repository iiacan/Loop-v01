/* Loop — store.js: data model, state machine, monthly plans, insights, backup. No DOM. */
(function () {
  'use strict';
  const L = window.Loop, U = L.U;
  const S = (L.S = {});

  L.APP_VERSION = '0.1.0';
  L.SCHEMA_VERSION = 1;
  L.BACKUP_VERSION = 1;
  L.STAGES = ['OPENED', 'ACTIVE', 'WAITING', 'STUCK', 'CLOSED'];
  L.STAGE_LABEL = { OPENED: 'Opened', ACTIVE: 'Active', WAITING: 'Waiting', STUCK: 'Stuck', CLOSED: 'Closed' };
  L.RESOLUTIONS = { COMPLETED: 'Completed', DECIDED_NOT_TO: 'Decided not to', SUPERSEDED: 'Superseded', ARCHIVED: 'Archived' };
  L.PRIORITIES = ['low', 'medium', 'high', 'critical'];
  L.PRIORITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
  L.WAIT_TYPES = ['Another person', 'An institution', 'A document', 'A payment', 'An external event', 'A response', 'A resource'];
  L.STEP_STATUS = { todo: 'To do', doing: 'In progress', blocked: 'Stuck here', done: 'Done', skipped: 'Skipped' };
  L.APPT_STATUS = ['Scheduled', 'Attended', 'Rescheduled', 'Cancelled', 'Did not attend'];
  L.WEIGHTS = [[0.5, 'Light (½)'], [1, 'Standard (1)'], [2, 'Substantial (2)'], [3, 'Major (3)']];
  L.SECTOR_SEED = [
    ['Employment', '#a78bfa'], ['Clinical practice', '#7fb0f0'], ['Research and academia', '#c4a1ff'], ['Family', '#f4a6c8'],
    ['Friends', '#f2c188'], ['Hobbies', '#f08fa8'], ['Extracurricular activities', '#e59a86'], ['Travel', '#6fc7d6'],
    ['Bills and finances', '#8fb8ff'], ['Personal health', '#7fd1a6'], ['Home and administration', '#b9b3c9'], ['Creative projects', '#d99cf0']
  ];
  const DEFAULTS = {
    name: 'Acan', greeting: '', timeFormat: '24', dateFormat: 'dmy', weekStart: 1, theme: 'midnight',
    dailyCapacityMin: 240, maxActive: 7, notifications: false, defaultReminder: 'none', defaultReminderTime: '09:00',
    rewardTiers: [{ pct: 25, title: '' }, { pct: 50, title: '' }, { pct: 75, title: '' }, { pct: 100, title: '' }],
    backupReminderDays: 14, lastBackupAt: '', dismissed: {}, legacyHandled: false
  };

  const state = (S.state = { loops: [], sectors: [], plans: [], settings: Object.assign({}, DEFAULTS) });
  let adapter = null;
  const subs = [];
  S.subscribe = (f) => subs.push(f);
  const emit = (S.emit = () => subs.forEach((f) => f()));
  const persist = (store, obj) => adapter.put(store, obj).catch((err) => { console.error(err); if (L.onStorageError) L.onStorageError(err); });

  /* ---------- init ---------- */
  S.init = async function () {
    adapter = S.adapter = await L.openStorage();
    const res = await Promise.all(L.STORES.map((s) => adapter.getAll(s)));
    const meta = {}; res[3].forEach((r) => (meta[r.id] = r.value));
    state.settings = Object.assign({}, DEFAULTS, meta.settings || {});
    state.loops = res[0].map(S.normaliseLoop);
    state.sectors = res[1].sort((a, b) => (a.order || 0) - (b.order || 0));
    state.plans = res[2];
    if (!meta.initialised) {
      state.sectors = L.SECTOR_SEED.map((s, i) => ({ id: U.uid('s') + i, name: s[0], color: s[1], archived: false, order: i }));
      await adapter.bulkPut('sectors', state.sectors);
      await S.loadSample();
      await adapter.put('meta', { id: 'initialised', value: U.nowISO() });
    }
    S.housekeeping();
  };
  S.saveSettings = (patch) => { Object.assign(state.settings, patch); persist('meta', { id: 'settings', value: state.settings }); emit(); };

  /* ---------- sectors ---------- */
  S.sector = (id) => state.sectors.find((s) => s.id === id);
  S.sectorByName = (name) => state.sectors.find((s) => s.name.toLowerCase() === String(name).toLowerCase());
  S.activeSectors = () => state.sectors.filter((s) => !s.archived);
  S.addSector = (name, color) => { const s = { id: U.uid('s'), name: name.trim(), color: color || '#a78bfa', archived: false, order: state.sectors.length }; state.sectors.push(s); persist('sectors', s); emit(); return s; };
  S.updateSector = (id, patch) => { const s = S.sector(id); if (!s) return; Object.assign(s, patch); persist('sectors', s); emit(); };
  S.sectorNames = (loop) => loop.sectorIds.map((id) => { const s = S.sector(id); return s ? s.name : null; }).filter(Boolean);

  /* ---------- loops ---------- */
  function blankLoop() {
    const now = U.nowISO();
    return {
      id: U.uid('l'), title: '', description: '', sectorIds: [], priority: 'medium', stage: 'OPENED', resolution: null, closureReason: '',
      createdAt: now, updatedAt: now, stageSince: now, startDate: '', expectedDate: '', deadline: '', startTime: '', endTime: '', completedAt: '',
      reminderAt: '', reminderFired: false, reminderAck: false, nextAction: '', waiting: null, stuckNote: '', notes: '', steps: [],
      estMinutes: 0, actualMinutes: 0, tags: [], recurrence: { freq: 'none', interval: 1 }, history: [], plannedFor: '',
      appointment: null, rescheduleCount: 0, stuckCount: 0, carried: null, sample: false
    };
  }
  S.blankLoop = blankLoop;
  function normaliseSteps(steps, depth) {
    if (!Array.isArray(steps)) return [];
    return steps.filter((s) => s && typeof s === 'object').map((s) => ({
      id: String(s.id || U.uid('t')), title: String(s.title || ''), status: L.STEP_STATUS[s.status] ? s.status : 'todo',
      expectedDate: U.isDate(s.expectedDate) ? s.expectedDate : '', estMinutes: Math.max(0, Number(s.estMinutes) || 0), notes: String(s.notes || ''),
      children: depth < 2 ? normaliseSteps(s.children, depth + 1) : []
    }));
  }
  S.normaliseLoop = function (raw) {
    const l = Object.assign(blankLoop(), raw || {});
    l.id = String(l.id); l.title = String(l.title || 'Untitled loop');
    if (L.STAGES.indexOf(l.stage) < 0) l.stage = 'OPENED';
    if (L.PRIORITIES.indexOf(l.priority) < 0) l.priority = 'medium';
    if (l.stage === 'CLOSED' && !L.RESOLUTIONS[l.resolution]) l.resolution = 'COMPLETED';
    if (l.stage !== 'CLOSED') l.resolution = null;
    ['startDate', 'expectedDate', 'deadline', 'completedAt', 'plannedFor'].forEach((k) => { if (!U.isDate(l[k])) l[k] = ''; else l[k] = l[k].slice(0, 10); });
    l.sectorIds = Array.isArray(l.sectorIds) ? l.sectorIds.map(String) : [];
    l.tags = Array.isArray(l.tags) ? l.tags.map(String) : [];
    l.history = Array.isArray(l.history) ? l.history : [];
    l.steps = normaliseSteps(l.steps, 0);
    l.estMinutes = Math.max(0, Number(l.estMinutes) || 0); l.actualMinutes = Math.max(0, Number(l.actualMinutes) || 0);
    if (!l.recurrence || typeof l.recurrence !== 'object') l.recurrence = { freq: 'none', interval: 1 };
    return l;
  };
  S.get = (id) => state.loops.find((l) => l.id === id);
  S.openLoops = () => state.loops.filter((l) => l.stage !== 'CLOSED');
  S.putLoop = function (loop, quiet) {
    loop.updatedAt = U.nowISO();
    const i = state.loops.findIndex((l) => l.id === loop.id);
    if (i >= 0) state.loops[i] = loop; else state.loops.push(loop);
    persist('loops', loop);
    if (!quiet) emit();
    return loop;
  };
  const log = (loop, type, extra) => loop.history.push(Object.assign({ at: U.nowISO(), type: type }, extra || {}));
  S.addLoop = function (fields) {
    const loop = S.normaliseLoop(Object.assign(blankLoop(), fields));
    log(loop, 'created', { to: loop.stage, note: 'Loop opened' });
    return S.putLoop(loop);
  };
  S.removeLoop = (id) => { state.loops = state.loops.filter((l) => l.id !== id); adapter.del('loops', id).catch(L.onStorageError || (() => {})); emit(); };

  /* State machine. Every transition is written to the loop's history. */
  S.transition = function (loop, to, meta) {
    meta = meta || {};
    const from = loop.stage;
    if (from === to) return false;
    if (to === 'CLOSED' && !L.RESOLUTIONS[meta.resolution]) throw new Error('A closed loop needs a resolution.');
    loop.stage = to; loop.stageSince = U.nowISO();
    if (to === 'STUCK') { loop.stuckCount++; if (meta.note) loop.stuckNote = meta.note; }
    if (to === 'WAITING') {
      loop.waiting = Object.assign({ type: L.WAIT_TYPES[0], what: '', who: '', since: U.today(), expectedResponse: '', followUp: '' }, loop.waiting || {}, meta.waiting || {});
      if (from !== 'WAITING' && !(meta.waiting && meta.waiting.since)) loop.waiting.since = U.today();
    }
    if (to === 'CLOSED') {
      loop.resolution = meta.resolution; loop.closureReason = meta.reason || ''; loop.completedAt = U.today(); loop.plannedFor = '';
      if (meta.actualMinutes) loop.actualMinutes = Number(meta.actualMinutes) || 0;
      log(loop, 'closed', { from: from, to: to, resolution: meta.resolution, note: meta.reason || '' });
    } else if (from === 'CLOSED') {
      log(loop, 'reopened', { from: from, to: to, note: (meta.note ? meta.note + ' · ' : '') + 'Was ' + L.RESOLUTIONS[loop.resolution] + (loop.closureReason ? ' (' + loop.closureReason + ')' : '') });
      loop.resolution = null; loop.closureReason = ''; loop.completedAt = '';
    } else {
      let note = meta.note || '';
      if (to === 'WAITING' && loop.waiting.what) note = 'Waiting on: ' + loop.waiting.what + (loop.waiting.who ? ' (' + loop.waiting.who + ')' : '');
      log(loop, 'stage', { from: from, to: to, note: note });
    }
    return true;
  };
  S.setStage = function (id, to, meta) {
    const loop = S.get(id); if (!loop) return;
    if (!S.transition(loop, to, meta)) return;
    if (meta && meta.stepId) { const st = S.findStep(loop, meta.stepId); if (st) st.status = 'blocked'; }
    S.putLoop(loop, true);
    if (to === 'CLOSED' && meta.resolution === 'COMPLETED') S.spawnRecurrence(loop);
    emit();
  };
  S.spawnRecurrence = function (loop) {
    const r = loop.recurrence; if (!r || r.freq === 'none') return null;
    const n = Math.max(1, Number(r.interval) || 1);
    const shift = (d) => { if (!d) return ''; let x = d; do { x = r.freq === 'daily' ? U.addDays(x, n) : r.freq === 'weekly' ? U.addDays(x, 7 * n) : r.freq === 'monthly' ? U.addMonths(x, n) : U.addMonths(x, 12 * n); } while (x <= U.today()); return x; };
    const reset = (steps) => steps.map((s) => Object.assign({}, s, { id: U.uid('t'), status: 'todo', expectedDate: '', children: reset(s.children || []) }));
    const next = S.normaliseLoop({
      title: loop.title, description: loop.description, sectorIds: loop.sectorIds.slice(), priority: loop.priority, estMinutes: loop.estMinutes,
      tags: loop.tags.slice(), recurrence: U.clone(r), steps: reset(loop.steps), nextAction: loop.nextAction, sample: loop.sample,
      startDate: shift(loop.startDate), expectedDate: shift(loop.expectedDate || U.today()), deadline: shift(loop.deadline), startTime: loop.startTime, endTime: loop.endTime
    });
    next.id = U.uid('l');
    log(next, 'created', { to: 'OPENED', note: 'Next occurrence of a recurring loop' });
    S.putLoop(next, true);
    return next;
  };

  /* Save an edited copy of a loop, recording what changed. `orig` is null for a new loop. */
  const TRACKED = [['title', 'Title'], ['description', 'Description'], ['priority', 'Priority'], ['startDate', 'Start date'], ['deadline', 'Deadline'],
    ['nextAction', 'Next action'], ['estMinutes', 'Estimated effort'], ['actualMinutes', 'Actual effort'], ['reminderAt', 'Reminder'], ['plannedFor', 'Planned day']];
  S.commitDraft = function (orig, draft, meta) {
    const loop = S.normaliseLoop(draft);
    if (!orig) {
      const stage = loop.stage; loop.stage = 'OPENED'; loop.resolution = null;
      log(loop, 'created', { to: 'OPENED', note: 'Loop opened' });
      if (stage !== 'OPENED') S.transition(loop, stage, meta);
    } else {
      loop.stage = orig.stage; loop.resolution = orig.resolution; loop.history = orig.history.slice(); loop.stageSince = orig.stageSince;
      if (draft.stage !== orig.stage) S.transition(loop, draft.stage, meta);
      else if (loop.stage === 'CLOSED') { loop.resolution = draft.resolution; if (draft.resolution !== orig.resolution) log(loop, 'edit', { note: 'Resolution: ' + L.RESOLUTIONS[orig.resolution] + ' → ' + L.RESOLUTIONS[draft.resolution] }); }
      TRACKED.forEach((f) => { const a = orig[f[0]] || '', b = loop[f[0]] || ''; if (String(a) !== String(b)) log(loop, 'edit', { note: f[1] + ': ' + (a === '' ? '—' : a) + ' → ' + (b === '' ? '—' : b) }); });
      if ((orig.expectedDate || '') !== (loop.expectedDate || '')) {
        if (orig.expectedDate && loop.expectedDate) { loop.rescheduleCount++; log(loop, 'reschedule', { from: orig.expectedDate, to: loop.expectedDate, note: 'Expected completion moved' }); }
        else log(loop, 'edit', { note: 'Expected completion: ' + (orig.expectedDate || '—') + ' → ' + (loop.expectedDate || '—') });
      }
      if (orig.sectorIds.join() !== loop.sectorIds.join()) log(loop, 'edit', { note: 'Sectors: ' + (S.sectorNames(loop).join(', ') || 'none') });
      if (JSON.stringify(orig.waiting) !== JSON.stringify(loop.waiting) && loop.stage === 'WAITING' && orig.stage === 'WAITING') log(loop, 'waiting', { note: 'Waiting details updated' });
      const before = {}; S.walkSteps(orig.steps, (s) => (before[s.id] = s));
      let added = 0;
      S.walkSteps(loop.steps, (s) => { const o = before[s.id]; if (!o) added++; else if (o.status !== s.status) log(loop, 'step', { note: '“' + s.title + '”: ' + L.STEP_STATUS[o.status] + ' → ' + L.STEP_STATUS[s.status] }); delete before[s.id]; });
      const removed = Object.keys(before).length;
      if (added || removed) log(loop, 'step', { note: (added ? U.plural(added, 'step') + ' added' : '') + (added && removed ? ', ' : '') + (removed ? U.plural(removed, 'step') + ' removed' : '') });
      if (orig.reminderAt !== loop.reminderAt) { loop.reminderFired = false; loop.reminderAck = false; }
    }
    S.putLoop(loop, true);
    if (loop.stage === 'CLOSED' && loop.resolution === 'COMPLETED' && (!orig || orig.stage !== 'CLOSED')) S.spawnRecurrence(loop);
    emit();
    return loop;
  };
  S.reschedule = function (id, date, note) {
    const loop = S.get(id); if (!loop || !date) return;
    const from = loop.expectedDate;
    loop.expectedDate = date;
    if (from) { loop.rescheduleCount++; log(loop, 'reschedule', { from: from, to: date, note: note || 'Expected completion moved' }); }
    else log(loop, 'edit', { note: 'Expected completion set to ' + date });
    if (loop.plannedFor && loop.plannedFor < U.today()) loop.plannedFor = '';
    S.putLoop(loop);
  };
  S.planFor = (id, date) => { const loop = S.get(id); if (!loop) return; loop.plannedFor = date || ''; S.putLoop(loop); };
  S.addNote = (id, text) => { const loop = S.get(id); if (!loop || !text.trim()) return; log(loop, 'note', { note: text.trim() }); S.putLoop(loop); };
  S.logFollowUp = function (id, nextDate, note) {
    const loop = S.get(id); if (!loop || !loop.waiting) return;
    loop.waiting.followUp = nextDate || '';
    log(loop, 'waiting', { note: 'Followed up' + (note ? ': ' + note : '') + (nextDate ? ' · next check ' + nextDate : '') });
    S.putLoop(loop);
  };

  /* ---------- steps ---------- */
  S.walkSteps = function (steps, fn, depth, parent) { (steps || []).forEach((s) => { fn(s, depth || 0, parent || null); S.walkSteps(s.children, fn, (depth || 0) + 1, s); }); };
  S.findStep = (loop, id) => { let f = null; S.walkSteps(loop.steps, (s) => { if (s.id === id) f = s; }); return f; };
  const stepOpen = (s) => s.status !== 'done' && s.status !== 'skipped';
  S.nextStep = function (loop) {
    const find = (steps) => { for (const s of steps || []) { if (!stepOpen(s)) continue; const c = find(s.children); return c || s; } return null; };
    return find(loop.steps);
  };
  S.blockedStep = (loop) => { let f = null; S.walkSteps(loop.steps, (s) => { if (!f && s.status === 'blocked') f = s; }); return f; };
  S.stepStats = function (loop) { let total = 0, done = 0; S.walkSteps(loop.steps, (s) => { if (s.children && s.children.length) return; if (s.status === 'skipped') return; total++; if (s.status === 'done') done++; }); return { total: total, done: done }; };
  S.setStepStatus = function (id, stepId, status) {
    const loop = S.get(id); const st = loop && S.findStep(loop, stepId); if (!st || st.status === status) return;
    log(loop, 'step', { note: '“' + st.title + '”: ' + L.STEP_STATUS[st.status] + ' → ' + L.STEP_STATUS[status] });
    st.status = status;
    if (status === 'done') S.walkSteps(loop.steps, (p) => { if (p.children.length && p.children.every((c) => !stepOpen(c)) && stepOpen(p)) p.status = 'done'; });
    S.putLoop(loop);
  };
  S.nextLabel = (loop) => { const n = S.nextStep(loop); return n ? n.title : loop.nextAction || ''; };

  /* ---------- flags (described as "for review", never as failure) ---------- */
  S.dueForReview = (l) => l.stage !== 'CLOSED' && !!l.expectedDate && l.expectedDate < U.today();
  S.pastDeadline = (l) => l.stage !== 'CLOSED' && !!l.deadline && l.deadline < U.today();
  S.waitingOverdue = (l) => l.stage === 'WAITING' && !!l.waiting && !!l.waiting.expectedResponse && l.waiting.expectedResponse < U.today() && !(l.waiting.followUp && l.waiting.followUp > U.today());
  S.followUpDue = (l) => l.stage === 'WAITING' && !!l.waiting && !!l.waiting.followUp && l.waiting.followUp <= U.today();

  /* ---------- today ---------- */
  S.todayItems = function () {
    const t = U.today();
    return S.openLoops().filter((l) => l.plannedFor === t || l.expectedDate === t || l.deadline === t || l.startDate === t || (l.appointment && l.appointment.at && l.appointment.at.slice(0, 10) === t))
      .map((l) => { const n = S.nextStep(l); return { loop: l, step: n, label: n ? n.title : l.nextAction || l.title, mins: n ? n.estMinutes || 0 : l.estMinutes || 0 }; });
  };

  /* ---------- monthly plans & rewards ---------- */
  S.plan = (key) => state.plans.find((p) => p.id === key);
  S.currentPlan = () => S.plan(U.monthKey(U.today()));
  S.putPlan = (plan) => { const i = state.plans.findIndex((p) => p.id === plan.id); if (i >= 0) state.plans[i] = plan; else state.plans.push(plan); persist('plans', plan); emit(); };
  S.defaultPool = function (key) {
    const end = key + '-31';
    return S.openLoops().map((l) => { const d = [l.expectedDate, l.deadline].filter(Boolean).sort()[0]; return { loop: l, checked: !!(l.carried && l.carried.to === key) || (!!d && d <= end) }; })
      .sort((a, b) => Number(b.checked) - Number(a.checked) || a.loop.title.localeCompare(b.loop.title));
  };
  S.createPlan = function (key, pool, rewards, extra) {
    const now = U.nowISO();
    const plan = Object.assign({
      id: key, createdAt: now, changes: [], review: null, final: null,
      pool: pool.map((p) => { const l = S.get(p.loopId); return { loopId: p.loopId, weight: Number(p.weight) || 1, title: l ? l.title : p.title || '', addedAt: now, how: l && l.carried && l.carried.to === key ? 'carried' : 'initial' }; }),
      rewards: rewards.filter((r) => r.title && r.title.trim()).map((r) => ({ id: U.uid('r'), pct: Math.min(100, Math.max(1, Number(r.pct) || 0)), title: r.title.trim() })).sort((a, b) => a.pct - b.pct)
    }, extra || {});
    plan.original = { pool: U.clone(plan.pool), rewards: U.clone(plan.rewards) };
    S.putPlan(plan); return plan;
  };
  const planStarted = (plan) => U.today() >= plan.id + '-01';
  S.planChange = function (plan, note, fn) { fn(plan); if (planStarted(plan)) plan.changes.push({ at: U.nowISO(), note: note }); else plan.original = { pool: U.clone(plan.pool), rewards: U.clone(plan.rewards) }; S.putPlan(plan); };
  S.planProgress = function (plan) {
    if (plan.final) return plan.final;
    const out = { total: 0, resolved: 0, completed: 0, count: 0, resolvedCount: 0, completedCount: 0, archivedCount: 0, pct: 0, completionPct: 0 };
    plan.pool.forEach((it) => {
      const l = S.get(it.loopId); if (!l) return;
      const inMonth = l.stage === 'CLOSED' && U.monthKey(l.completedAt || U.today()) <= plan.id;
      if (inMonth && l.resolution === 'ARCHIVED') { out.archivedCount++; return; }
      out.total += it.weight; out.count++;
      if (inMonth) { out.resolved += it.weight; out.resolvedCount++; if (l.resolution === 'COMPLETED') { out.completed += it.weight; out.completedCount++; } }
    });
    out.pct = out.total ? Math.floor((out.resolved / out.total) * 100) : 0;
    out.completionPct = out.total ? Math.floor((out.completed / out.total) * 100) : 0;
    return out;
  };
  S.poolStatus = function (plan, it) {
    const l = S.get(it.loopId);
    if (!l) return 'Deleted';
    if (l.stage !== 'CLOSED') return L.STAGE_LABEL[l.stage];
    return U.monthKey(l.completedAt || U.today()) <= plan.id ? L.RESOLUTIONS[l.resolution] : 'Closed later (' + L.RESOLUTIONS[l.resolution] + ')';
  };
  S.unresolved = (plan) => plan.pool.map((it) => S.get(it.loopId)).filter((l) => l && l.stage !== 'CLOSED');
  S.pendingReview = function () {
    const cur = U.monthKey(U.today());
    const p = state.plans.filter((x) => x.id < cur && !x.review).sort((a, b) => (a.id < b.id ? 1 : -1))[0];
    return p ? { plan: p, unresolved: S.unresolved(p) } : null;
  };
  /* Month-end review. The month's score is frozen first, so decisions made here
     never raise it: carrying forward is not completion, and neither is tidying up. */
  S.completeReview = function (plan, decisions) {
    plan.final = Object.assign({}, S.planProgress(plan));
    const cur = U.monthKey(U.today()); const curPlan = S.plan(cur);
    Object.keys(decisions).forEach((id) => {
      const l = S.get(id); const d = decisions[id]; if (!l) return;
      if (d === 'carry') {
        l.carried = { from: plan.id, to: cur, at: U.nowISO() };
        log(l, 'plan', { note: 'Carried forward from ' + U.monthName(plan.id) + ' to ' + U.monthName(cur) });
        S.putLoop(l, true);
        if (curPlan && !curPlan.pool.some((x) => x.loopId === id)) {
          const old = plan.pool.find((x) => x.loopId === id);
          curPlan.pool.push({ loopId: id, weight: old ? old.weight : 1, title: l.title, addedAt: U.nowISO(), how: 'carried' });
          curPlan.changes.push({ at: U.nowISO(), note: 'Carried forward from ' + U.monthName(plan.id) + ': “' + l.title + '”' });
        }
      } else if (L.RESOLUTIONS[d]) {
        S.transition(l, 'CLOSED', { resolution: d, reason: 'Month-end review, ' + U.monthName(plan.id) });
        S.putLoop(l, true);
      }
    });
    plan.review = { at: U.nowISO(), decisions: decisions };
    if (curPlan) persist('plans', curPlan);
    S.putPlan(plan);
  };
  S.housekeeping = function () {
    const cur = U.monthKey(U.today());
    state.plans.forEach((p) => { if (p.id < cur && !p.review && S.unresolved(p).length === 0) { p.final = Object.assign({}, S.planProgress(p)); p.review = { at: U.nowISO(), decisions: {}, auto: true }; persist('plans', p); } });
  };

  /* ---------- insights (descriptive statistics only) ---------- */
  S.timeInStage = function (loop, stage) {
    let ms = 0, cur = null, since = null;
    loop.history.forEach((h) => {
      if (!h.to || ['created', 'stage', 'closed', 'reopened'].indexOf(h.type) < 0) return;
      if (cur === stage && since) ms += new Date(h.at) - new Date(since);
      cur = h.to; since = h.at;
    });
    if (cur === stage && since && loop.stage === stage) ms += Date.now() - new Date(since);
    return ms;
  };
  S.insights = function () {
    const loops = state.loops, closed = loops.filter((l) => l.stage === 'CLOSED'), open = S.openLoops(), today = U.today();
    const res = { COMPLETED: 0, DECIDED_NOT_TO: 0, SUPERSEDED: 0, ARCHIVED: 0 };
    closed.forEach((l) => res[l.resolution]++);
    const effort = closed.filter((l) => l.resolution === 'COMPLETED' && l.estMinutes > 0 && l.actualMinutes > 0);
    const late = closed.filter((l) => l.resolution === 'COMPLETED' && l.expectedDate && l.completedAt).map((l) => U.diffDays(l.expectedDate, l.completedAt));
    const waits = loops.map((l) => S.timeInStage(l, 'WAITING') / 864e5).filter((d) => d > 0.01);
    let stepsTotal = 0, stepsDone = 0; loops.forEach((l) => { const s = S.stepStats(l); stepsTotal += s.total; stepsDone += s.done; });
    const weekStart = U.startOfWeek(today, state.settings.weekStart);
    const weeks = []; for (let i = 7; i >= 0; i--) { const s = U.addDays(weekStart, -7 * i); weeks.push({ start: s, end: U.addDays(s, 6), created: 0, closed: 0 }); }
    const weekday = [0, 0, 0, 0, 0, 0, 0];
    loops.forEach((l) => {
      const c = U.isoToYmd(l.createdAt);
      weeks.forEach((w) => { if (c >= w.start && c <= w.end) w.created++; if (l.completedAt && l.completedAt >= w.start && l.completedAt <= w.end) w.closed++; });
      if (l.stage === 'CLOSED' && l.completedAt) weekday[U.parse(l.completedAt).getDay()]++;
    });
    const bySector = S.activeSectors().map((s) => {
      const mine = loops.filter((l) => l.sectorIds.indexOf(s.id) >= 0);
      return { sector: s, open: mine.filter((l) => l.stage !== 'CLOSED').length, closed: mine.filter((l) => l.stage === 'CLOSED').length, stalls: mine.reduce((a, l) => a + l.stuckCount, 0), reschedules: mine.reduce((a, l) => a + l.rescheduleCount, 0) };
    }).filter((x) => x.open + x.closed > 0);
    return {
      counts: { open: open.length, closed: closed.length, closed30: closed.filter((l) => l.completedAt >= U.addDays(today, -30)).length },
      res: res,
      effort: { n: effort.length, ratio: U.median(effort.map((l) => l.actualMinutes / l.estMinutes)), rows: effort.slice().sort((a, b) => b.actualMinutes / b.estMinutes - a.actualMinutes / a.estMinutes).slice(0, 6) },
      late: { n: late.length, median: U.median(late), onTime: late.filter((d) => d <= 0).length },
      reschedules: { total: loops.reduce((a, l) => a + l.rescheduleCount, 0), top: loops.filter((l) => l.rescheduleCount > 0).sort((a, b) => b.rescheduleCount - a.rescheduleCount).slice(0, 5) },
      stalls: { total: loops.reduce((a, l) => a + l.stuckCount, 0), now: open.filter((l) => l.stage === 'STUCK').length },
      waits: { n: waits.length, median: U.median(waits) },
      steps: { total: stepsTotal, done: stepsDone },
      weeks: weeks, weekday: weekday, bySector: bySector
    };
  };

  /* ---------- backup, restore, export ---------- */
  S.exportAll = function () {
    return {
      app: 'loop', kind: 'full', backupVersion: L.BACKUP_VERSION, schemaVersion: L.SCHEMA_VERSION, appVersion: L.APP_VERSION, exportedAt: U.nowISO(),
      data: { loops: state.loops, sectors: state.sectors, plans: state.plans, settings: state.settings }
    };
  };
  S.exportLoops = function (loops) {
    const ids = {}; loops.forEach((l) => l.sectorIds.forEach((id) => (ids[id] = 1)));
    return { app: 'loop', kind: 'partial', backupVersion: L.BACKUP_VERSION, schemaVersion: L.SCHEMA_VERSION, appVersion: L.APP_VERSION, exportedAt: U.nowISO(), data: { loops: loops, sectors: state.sectors.filter((s) => ids[s.id]), plans: [] } };
  };
  S.loopsCsv = function (loops) {
    const rows = [['Title', 'Sectors', 'Stage', 'Resolution', 'Priority', 'Start', 'Expected completion', 'Deadline', 'Closed on', 'Next action', 'Waiting on', 'Estimated min', 'Actual min', 'Tags', 'Times rescheduled', 'Times stuck', 'Created']];
    loops.forEach((l) => rows.push([l.title, S.sectorNames(l).join('; '), L.STAGE_LABEL[l.stage], l.resolution ? L.RESOLUTIONS[l.resolution] : '', L.PRIORITY_LABEL[l.priority], l.startDate, l.expectedDate, l.deadline, l.completedAt,
      S.nextLabel(l), l.stage === 'WAITING' && l.waiting ? l.waiting.what + (l.waiting.who ? ' (' + l.waiting.who + ')' : '') : '', l.estMinutes || '', l.actualMinutes || '', l.tags.join('; '), l.rescheduleCount, l.stuckCount, U.isoToYmd(l.createdAt)]));
    return U.csv(rows);
  };
  /* The first Loop (single-file version) kept its data in localStorage under 'loop.v1'. */
  S.convertLegacy = function (obj) {
    const stageMap = { opened: 'OPENED', active: 'ACTIVE', waiting: 'WAITING', stuck: 'STUCK', closed: 'CLOSED' };
    const resMap = { completed: 'COMPLETED', decided: 'DECIDED_NOT_TO', superseded: 'SUPERSEDED' };
    const iso = (t) => { const d = new Date(t || Date.now()); return isNaN(d) ? U.nowISO() : d.toISOString(); };
    const loops = obj.loops.map((o) => {
      const stage = stageMap[o.stage] || 'ACTIVE';
      const hist = (Array.isArray(o.history) ? o.history : []).map((x) => ({ at: iso(x.t || x.at), type: 'note', note: String(x.text || x.note || '') }));
      hist.push({ at: U.nowISO(), type: 'note', note: 'Imported from the earlier version of Loop' });
      return S.normaliseLoop({
        id: 'legacy-' + String(o.id || U.uid()), title: o.title, stage: stage, resolution: stage === 'CLOSED' ? resMap[o.reason || o.closeReason || o.resolution] || 'COMPLETED' : null,
        priority: { 1: 'low', 2: 'medium', 3: 'high' }[o.weight] || 'medium', estMinutes: o.est, actualMinutes: o.actual, notes: String(o.notes || ''),
        waiting: stage === 'WAITING' ? { type: L.WAIT_TYPES[0], what: String(o.waitingOn || ''), who: '', since: U.isoToYmd(iso(o.createdAt)), expectedResponse: '', followUp: '' } : null,
        steps: (Array.isArray(o.steps) ? o.steps : []).map((s) => ({ id: String(s.id || U.uid('t')), title: String(s.text || s.title || ''), status: s.done ? 'done' : 'todo' })),
        createdAt: iso(o.createdAt), completedAt: o.closedAt ? U.isoToYmd(iso(o.closedAt)) : '', history: hist
      });
    });
    return { loops: loops, sectors: [], plans: [], settings: null };
  };
  S.validateBackup = function (obj) {
    const errors = [], warnings = [];
    if (!obj || typeof obj !== 'object') return { ok: false, errors: ['This file is not a Loop backup (it does not contain a JSON object).'] };
    let data, legacy = false, kind = obj.kind || 'full';
    if (!obj.app && obj.v === 1 && Array.isArray(obj.loops)) { legacy = true; kind = 'partial'; data = S.convertLegacy(obj); warnings.push('This backup comes from the earlier single-file Loop. Its loops will be converted; monthly commitments from that version are not carried over.'); }
    else {
      if (obj.app !== 'loop') errors.push('This file is not marked as a Loop backup.');
      if (typeof obj.schemaVersion !== 'number') errors.push('The backup has no schema version.');
      else if (obj.schemaVersion > L.SCHEMA_VERSION) errors.push('This backup was made by a newer Loop (schema ' + obj.schemaVersion + '). This version understands schema ' + L.SCHEMA_VERSION + '. Update Loop first.');
      data = obj.data;
      if (!data || !Array.isArray(data.loops)) errors.push('The backup contains no list of loops.');
      else {
        const bad = data.loops.filter((l) => !l || typeof l !== 'object' || !l.id || typeof l.title !== 'string').length;
        if (bad) errors.push(bad + ' loop record(s) are missing an ID or title.');
        if (data.sectors && !Array.isArray(data.sectors)) errors.push('The sector list is malformed.');
        if (data.plans && !Array.isArray(data.plans)) errors.push('The monthly plan list is malformed.');
      }
    }
    if (errors.length) return { ok: false, errors: errors };
    const loops = data.loops.map(S.normaliseLoop);
    const sectors = (data.sectors || []).filter((s) => s && s.id && s.name);
    const plans = (data.plans || []).filter((p) => p && p.id && Array.isArray(p.pool));
    let steps = 0, hist = 0; loops.forEach((l) => { S.walkSteps(l.steps, () => steps++); hist += l.history.length; });
    return {
      ok: true, warnings: warnings, legacy: legacy, kind: kind,
      data: { loops: loops, sectors: sectors, plans: plans, settings: kind === 'full' && data.settings && typeof data.settings === 'object' ? data.settings : null },
      summary: { exportedAt: obj.exportedAt || '', schema: legacy ? 'earlier Loop' : obj.schemaVersion, loops: loops.length, open: loops.filter((l) => l.stage !== 'CLOSED').length, steps: steps, history: hist, sectors: sectors.length, plans: plans.length, hasSettings: !!(kind === 'full' && data.settings) }
    };
  };
  S.importData = async function (data, mode) {
    if (mode === 'replace') {
      await Promise.all(['loops', 'sectors', 'plans'].map((s) => adapter.clear(s)));
      state.loops = data.loops; state.sectors = data.sectors; state.plans = data.plans;
      if (data.settings) state.settings = Object.assign({}, DEFAULTS, data.settings);
    } else {
      const merge = (cur, inc) => { const m = new Map(cur.map((x) => [x.id, x])); inc.forEach((x) => m.set(x.id, x)); return Array.from(m.values()); };
      const byName = {}; state.sectors.forEach((s) => (byName[s.name.toLowerCase()] = s.id));
      const remap = {};
      const incSectors = data.sectors.filter((s) => { const hit = byName[s.name.toLowerCase()]; if (hit && hit !== s.id) { remap[s.id] = hit; return false; } return true; });
      data.loops.forEach((l) => (l.sectorIds = l.sectorIds.map((id) => remap[id] || id)));
      state.loops = merge(state.loops, data.loops); state.sectors = merge(state.sectors, incSectors); state.plans = merge(state.plans, data.plans);
    }
    await adapter.bulkPut('loops', state.loops); await adapter.bulkPut('sectors', state.sectors); await adapter.bulkPut('plans', state.plans);
    await adapter.put('meta', { id: 'settings', value: state.settings });
    emit();
  };
  S.eraseAll = async function () {
    await Promise.all(['loops', 'plans'].map((s) => adapter.clear(s)));
    state.loops = []; state.plans = []; emit();
  };

  /* ---------- sample data ---------- */
  S.hasSample = () => state.loops.some((l) => l.sample) || state.plans.some((p) => p.sample);
  S.removeSample = async function () {
    const ids = state.loops.filter((l) => l.sample).map((l) => l.id);
    state.loops = state.loops.filter((l) => !l.sample);
    await Promise.all(ids.map((id) => adapter.del('loops', id)));
    const keep = [], drop = [];
    state.plans.forEach((p) => {
      const n = p.pool.length; p.pool = p.pool.filter((it) => ids.indexOf(it.loopId) < 0);
      if (p.sample && !p.pool.length) { drop.push(p); return; }
      if (p.sample) { p.sample = false; p.original = { pool: U.clone(p.pool), rewards: U.clone(p.rewards) }; }
      if (p.pool.length !== n) persist('plans', p);
      keep.push(p);
    });
    state.plans = keep;
    await Promise.all(drop.map((p) => adapter.del('plans', p.id)));
    emit();
  };
  S.loadSample = async function () {
    const made = L.buildSample();
    made.loops.forEach((l) => state.loops.push(l));
    await adapter.bulkPut('loops', made.loops);
    if (made.plan && !S.plan(made.plan.id)) { state.plans.push(made.plan); await adapter.put('plans', made.plan); }
    emit();
  };
})();
