// Sample data shown on first run. Every item is flagged sample:true so it can
// be told apart from real data and removed in one step.
import { today, addDays, monthKey } from './dates.js';
import { newLoop, newStep, uid } from './model.js';
import { newPlan } from './logic.js';

const ago = (days, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
};
const steps = (titles, done = 0, doing = -1) =>
  titles.map((t, i) => ({ ...newStep(t), status: i < done ? 'done' : i === doing ? 'doing' : 'todo' }));

export function sampleData() {
  const t = today();
  const S = (n) => 'sec-' + n;
  const mk = (p, created, history = []) =>
    newLoop({ ...p, sample: true, createdAt: ago(created), updatedAt: ago(0), history: [{ at: ago(created), type: 'created' }, ...history] });
  const closed = (p, created, closedAgo, resolution, reason) =>
    mk({ ...p, stage: 'CLOSED', resolution, closureReason: reason, closedAt: ago(closedAgo), actualCompletionDate: addDays(t, -closedAgo) }, created, [
      { at: ago(created - 1), type: 'stage', from: 'OPENED', to: 'ACTIVE' },
      { at: ago(closedAgo), type: 'closed', from: 'ACTIVE', to: 'CLOSED', resolution, note: reason },
    ]);

  const loops = [
    mk({
      title: 'Submit research manuscript', sectorIds: [S('research-and-academia')], priority: 'high', stage: 'ACTIVE',
      description: 'Get the manuscript from full draft to submitted.',
      startDate: addDays(t, -20), expectedDate: addDays(t, 9), deadline: addDays(t, 16), estMinutes: 600,
      steps: steps(['Finalize results section', 'Revise discussion', 'Review references', 'Obtain co-author feedback', 'Format manuscript', 'Submit'], 1, 1),
      tags: ['writing'],
    }, 24, [
      { at: ago(22), type: 'stage', from: 'OPENED', to: 'ACTIVE' },
      { at: ago(6), type: 'reschedule', field: 'expectedDate', from: addDays(t, 2), to: addDays(t, 9), note: 'Results took longer than planned' },
    ]),
    mk({
      title: 'Follow up fellowship application', sectorIds: [S('employment')], priority: 'high', stage: 'WAITING',
      expectedDate: addDays(t, 12), deadline: addDays(t, 20),
      waiting: { what: 'Reference letter', who: 'Supervisor', type: 'Another person', since: addDays(t, -6), expectedResponse: addDays(t, -1), followUp: t },
    }, 15, [
      { at: ago(14), type: 'stage', from: 'OPENED', to: 'ACTIVE' },
      { at: ago(6), type: 'stage', from: 'ACTIVE', to: 'WAITING', note: 'Requested reference letter' },
    ]),
    mk({
      title: 'Clinic appointment C-014 — administrative follow-up', sectorIds: [S('clinical-practice')], priority: 'medium', stage: 'ACTIVE',
      nextAction: 'Confirm room booking', expectedDate: addDays(t, 2),
      appointment: { ref: 'C-014', date: addDays(t, 2), time: '10:00', status: 'Scheduled', followUpDate: addDays(t, 16), adminFollowUp: 'Send clinic letter request to records office' },
    }, 5, [{ at: ago(5), type: 'stage', from: 'OPENED', to: 'ACTIVE' }]),
    mk({ title: 'Plan family dinner', sectorIds: [S('family')], priority: 'low', stage: 'OPENED', nextAction: 'Choose menu', expectedDate: addDays(t, 3), estMinutes: 45 }, 3),
    mk({
      title: 'Book flights for conference', sectorIds: [S('travel'), S('research-and-academia')], priority: 'medium', stage: 'STUCK',
      nextAction: 'Decide on dates and budget', expectedDate: addDays(t, -2), deadline: addDays(t, 25), estMinutes: 40,
      steps: [{ ...newStep('Decide on dates and budget'), status: 'blocked', notes: 'Waiting to know whether the abstract is accepted.' }, newStep('Compare fares'), newStep('Book and file receipt')],
    }, 30, [
      { at: ago(28), type: 'stage', from: 'OPENED', to: 'ACTIVE' },
      { at: ago(21), type: 'reschedule', field: 'expectedDate', from: addDays(t, -20), to: addDays(t, -13) },
      { at: ago(13), type: 'reschedule', field: 'expectedDate', from: addDays(t, -13), to: addDays(t, -7) },
      { at: ago(9), type: 'stage', from: 'ACTIVE', to: 'STUCK', note: 'Cannot choose dates yet' },
      { at: ago(7), type: 'reschedule', field: 'expectedDate', from: addDays(t, -7), to: addDays(t, -2) },
    ]),
    mk({ title: 'Complete annual health check', sectorIds: [S('personal-health')], priority: 'medium', stage: 'ACTIVE', nextAction: 'Book appointment', expectedDate: addDays(t, 12), estMinutes: 120 }, 12, [{ at: ago(10), type: 'stage', from: 'OPENED', to: 'ACTIVE' }]),
    mk({ title: 'Read for pleasure', sectorIds: [S('hobbies')], priority: 'low', stage: 'OPENED', nextAction: 'Choose next book', recurrence: { freq: 'monthly', interval: 1 }, expectedDate: addDays(t, 18), weight: 0.5 }, 8),
    mk({ title: 'Pay electricity bill', sectorIds: [S('bills-and-finances')], priority: 'high', stage: 'ACTIVE', expectedDate: addDays(t, 3), deadline: addDays(t, 5), estMinutes: 15, plannedFor: t, nextAction: 'Pay via mobile money' }, 6, [{ at: ago(6), type: 'stage', from: 'OPENED', to: 'ACTIVE' }]),
    mk({ title: 'Prepare teaching slides', sectorIds: [S('employment')], priority: 'medium', stage: 'ACTIVE', expectedDate: t, estMinutes: 90, steps: steps(['Outline session', 'Build slides', 'Add case vignettes'], 1, 1) }, 7, [{ at: ago(6), type: 'stage', from: 'OPENED', to: 'ACTIVE' }]),
    closed({ title: 'Renew professional licence', sectorIds: [S('home-and-administration')], priority: 'high', expectedDate: addDays(t, -7), estMinutes: 60, actualMinutes: 150 }, 26, 4, 'COMPLETED', 'Renewed; receipt filed'),
    closed({ title: 'Draft conference poster', sectorIds: [S('research-and-academia')], priority: 'medium', expectedDate: addDays(t, -9), estMinutes: 120, actualMinutes: 200, tags: ['writing'] }, 28, 9, 'COMPLETED', ''),
    closed({ title: 'Join weekend hiking group', sectorIds: [S('extracurricular-activities')], priority: 'low', expectedDate: addDays(t, -12) }, 27, 8, 'DECIDED_NOT_TO', 'Not this season; weekends are full'),
  ];
  const plan = newPlan(monthKey(t), loops.filter((l) => l.title !== 'Read for pleasure'), [
    { threshold: 25, title: 'Movie outing' },
    { threshold: 50, title: 'New shoes' },
    { threshold: 75, title: 'Handbag' },
    { threshold: 100, title: 'E-reader' },
  ], true);
  plan.rewards.forEach((r) => (r.id = uid()));
  return { loops, plans: [plan] };
}
