/* Loop — sample.js: example loops so the app is not empty on first run.
   Everything made here is flagged `sample: true` and can be removed in one step (Settings → Sample data). */
(function () {
  'use strict';
  const L = window.Loop, U = L.U;

  L.buildSample = function () {
    const S = L.S, t = U.today(), d = (n) => U.addDays(t, n);
    const at = (n, hour) => { const x = U.parse(d(n)); x.setHours(hour || 9, 15, 0, 0); return x.toISOString(); };
    const sec = (name) => { const s = S.sectorByName(name); return s ? [s.id] : []; };
    const step = (title, status, est, children) => ({ id: U.uid('t'), title: title, status: status || 'todo', estMinutes: est || 0, expectedDate: '', notes: '', children: children || [] });
    const make = (o, events) => {
      const l = S.normaliseLoop(Object.assign({ sample: true }, o));
      l.history = [{ at: l.createdAt, type: 'created', to: 'OPENED', note: 'Loop opened (sample)' }].concat(events || []);
      const last = l.history.filter((h) => h.to && h.type !== 'reschedule').pop(); l.stageSince = last.at;
      return l;
    };
    const closed = (title, sector, res, daysAgo, est, actual, expectedOffset, reason) => make({
      title: title, sectorIds: sec(sector), stage: 'CLOSED', resolution: res, closureReason: reason || '', createdAt: at(-daysAgo - 12),
      completedAt: d(-daysAgo), expectedDate: expectedOffset == null ? '' : d(-daysAgo + expectedOffset), estMinutes: est || 0, actualMinutes: actual || 0
    }, [{ at: at(-daysAgo - 9), type: 'stage', from: 'OPENED', to: 'ACTIVE', note: '' }, { at: at(-daysAgo, 16), type: 'closed', from: 'ACTIVE', to: 'CLOSED', resolution: res, note: reason || '' }]);

    const loops = [
      make({
        title: 'Submit research manuscript', description: 'Revision for the journal resubmission.', sectorIds: sec('Research and academia'), stage: 'ACTIVE', priority: 'high',
        createdAt: at(-21), startDate: d(-14), expectedDate: d(6), deadline: d(12), estMinutes: 600, plannedFor: t, tags: ['writing'],
        steps: [step('Finalize results section', 'doing', 90), step('Revise discussion', 'todo', 120), step('Review references', 'todo', 45),
          step('Obtain co-author feedback', 'todo', 0, [step('Send draft to co-authors', 'todo', 15), step('Collate comments', 'todo', 60)]), step('Format manuscript', 'todo', 60), step('Submit', 'todo', 30)]
      }, [{ at: at(-14), type: 'stage', from: 'OPENED', to: 'ACTIVE', note: '' }]),
      make({
        title: 'Follow up fellowship application', sectorIds: sec('Research and academia'), stage: 'WAITING', priority: 'high', createdAt: at(-16), expectedDate: d(9),
        waiting: { type: 'Another person', what: 'Letter of support', who: 'Supervisor', since: d(-9), expectedResponse: d(-2), followUp: t }
      }, [{ at: at(-12), type: 'stage', from: 'OPENED', to: 'ACTIVE', note: '' }, { at: at(-9), type: 'stage', from: 'ACTIVE', to: 'WAITING', note: 'Waiting on: Letter of support (Supervisor)' }]),
      make({
        title: 'Clinic follow-up · ref A-014', description: 'Administrative scheduling only.', sectorIds: sec('Clinical practice'), stage: 'ACTIVE', priority: 'medium', createdAt: at(-5),
        expectedDate: d(2), nextAction: 'Confirm room booking', appointment: { ref: 'A-014', at: d(2) + 'T10:00', status: 'Scheduled', followUp: d(30), admin: 'Send follow-up slot to front desk' }
      }, [{ at: at(-5, 11), type: 'stage', from: 'OPENED', to: 'ACTIVE', note: '' }]),
      make({ title: 'Plan family dinner', sectorIds: sec('Family'), stage: 'OPENED', priority: 'low', createdAt: at(-3), expectedDate: d(3), nextAction: 'Choose menu', estMinutes: 30 }),
      make({
        title: 'Book flights for conference', sectorIds: sec('Travel'), stage: 'STUCK', priority: 'medium', createdAt: at(-20), expectedDate: d(-3), deadline: d(15), rescheduleCount: 2, stuckCount: 1,
        stuckNote: 'Budget not confirmed', steps: [step('Decide on dates and budget', 'blocked', 20), step('Compare routes', 'todo', 30), step('Book and file receipt', 'todo', 20)]
      }, [{ at: at(-15), type: 'stage', from: 'OPENED', to: 'ACTIVE', note: '' }, { at: at(-11), type: 'reschedule', from: d(-10), to: d(-6), note: 'Expected completion moved' },
        { at: at(-7), type: 'reschedule', from: d(-6), to: d(-3), note: 'Expected completion moved' }, { at: at(-6), type: 'stage', from: 'ACTIVE', to: 'STUCK', note: 'Budget not confirmed' }]),
      make({ title: 'Complete annual health check', sectorIds: sec('Personal health'), stage: 'ACTIVE', priority: 'medium', createdAt: at(-8), expectedDate: d(10), nextAction: 'Book appointment', estMinutes: 15, plannedFor: t },
        [{ at: at(-6), type: 'stage', from: 'OPENED', to: 'ACTIVE', note: '' }]),
      make({ title: 'Read for pleasure', sectorIds: sec('Hobbies'), stage: 'OPENED', priority: 'low', createdAt: at(-2), expectedDate: d(5), nextAction: 'Choose next book', recurrence: { freq: 'weekly', interval: 1 } }),
      make({ title: 'Pay electricity bill', sectorIds: sec('Bills and finances'), stage: 'ACTIVE', priority: 'high', createdAt: at(-4), deadline: d(5), expectedDate: d(1), estMinutes: 10, plannedFor: t },
        [{ at: at(-4, 13), type: 'stage', from: 'OPENED', to: 'ACTIVE', note: '' }]),
      closed('Submit ethics renewal', 'Research and academia', 'COMPLETED', 4, 60, 140, -3),
      closed('Renew professional licence', 'Employment', 'COMPLETED', 9, 30, 45, 0),
      closed('Draft conference abstract', 'Research and academia', 'COMPLETED', 16, 45, 85, -2),
      closed('Join weekend hiking group', 'Extracurricular activities', 'DECIDED_NOT_TO', 6, 0, 0, null, 'Not this season. Weekends are for rest.'),
      closed('Rebuild old budget spreadsheet', 'Bills and finances', 'SUPERSEDED', 8, 0, 0, null, 'Replaced by a simpler monthly review.')
    ];

    const key = U.monthKey(t), now = U.nowISO();
    const pool = loops.filter((l) => !/Read for pleasure|conference abstract/.test(l.title)).map((l) => ({ loopId: l.id, weight: /manuscript/.test(l.title) ? 3 : /fellowship|ethics/.test(l.title) ? 2 : 1, title: l.title, addedAt: now, how: 'initial' }));
    const rewards = [[25, 'Movie outing'], [50, 'Expensive shoes'], [75, 'Handbag'], [100, 'E-reader']].map((r) => ({ id: U.uid('r'), pct: r[0], title: r[1] }));
    const plan = { id: key, sample: true, createdAt: now, changes: [], review: null, final: null, pool: pool, rewards: rewards, original: { pool: U.clone(pool), rewards: U.clone(rewards) } };
    return { loops: loops, plan: plan };
  };
})();
