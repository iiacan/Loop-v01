// Derived views of the data: monthly plans, today's plan, calendar events,
// descriptive insights and rule-based recommendations. All pure functions.
import { today, addDays, diffDays, monthKey, monthLabel, startOfWeek, stampDay, DOW, fmtMin } from './dates.js';
import {
  isClosed, isOverdue, deadlinePassed, waitingLate, nextStep, nextText, rescheduleCount, stuckCount,
  daysInStage, stageSince, flatSteps, closedDay, uid, PRIORITY_RANK,
} from './model.js';

// ---- monthly commitment pool & rewards ------------------------------------
export function newPlan(id, loops, rewards, sample = false) {
  const now = new Date().toISOString();
  return {
    id,
    createdAt: now,
    pool: loops.map((l) => ({ loopId: l.id, title: l.title, weight: l.weight ?? 1, addedAt: now, original: true })),
    rewards: rewards.filter((r) => r.title?.trim()).map((r) => ({ id: uid(), threshold: Number(r.threshold), title: r.title.trim(), claimedAt: null })),
    changes: [],
    review: { decisions: {} },
    sample,
  };
}

/**
 * Progress of a monthly plan.
 * - Only loops in the pool count; loops created later are not in it unless added.
 * - Archived (and deleted) loops leave the denominator.
 * - A loop carried forward and closed in a later month stays unresolved here:
 *   rollover is never completion.
 * - Weights let a big commitment count for more than a small one; weight 0 opts a loop out.
 */
export function planProgress(plan, loops) {
  const by = Object.fromEntries(loops.map((l) => [l.id, l]));
  let denom = 0, res = 0, comp = 0;
  const items = plan.pool.map((p) => {
    const l = by[p.loopId];
    const weight = Number(p.weight ?? 1);
    let status = 'open';
    if (!l) status = 'deleted';
    else if (isClosed(l) && (closedDay(l) || '').slice(0, 7) <= plan.id)
      status = l.resolution === 'ARCHIVED' ? 'archived' : l.resolution === 'COMPLETED' ? 'completed' : 'resolved';
    if (status !== 'deleted' && status !== 'archived') {
      denom += weight;
      if (status !== 'open') res += weight;
      if (status === 'completed') comp += weight;
    }
    return { ...p, weight, loop: l, status };
  });
  const pct = (n) => (denom ? Math.floor((n / denom) * 100) : 0);
  return {
    items, denom, res, comp,
    resolutionPct: pct(res),
    completionPct: pct(comp),
    counted: items.filter((i) => !['deleted', 'archived'].includes(i.status) && i.weight > 0),
    open: items.filter((i) => i.status === 'open'),
  };
}
/** Unresolved pool loops of a finished month that still need a decision. */
export function needsReview(plan, loops, t = today()) {
  if (plan.id >= monthKey(t)) return [];
  return planProgress(plan, loops).open.filter((i) => !plan.review?.decisions?.[i.loopId]);
}

// ---- today's plan ----------------------------------------------------------
export function todayItems(loops, t = today()) {
  const out = [];
  for (const l of loops) {
    if (isClosed(l)) continue;
    const ns = nextStep(l);
    const dated = flatSteps(l.steps).filter((x) => x.step.expectedDate === t && !['done', 'skipped'].includes(x.step.status));
    const isToday = l.plannedFor === t || l.expectedDate === t || l.deadline === t || l.startDate === t;
    if (isToday) {
      const step = ns && !dated.some((d) => d.step.id === ns.id) ? ns : null;
      out.push({ key: l.id, kind: step ? 'step' : 'loop', loop: l, step, label: step ? step.title : l.nextAction || l.title, sub: step || l.nextAction ? l.title : '', est: step?.estMinutes || (step ? null : l.estMinutes), time: l.startTime });
    }
    for (const d of dated) out.push({ key: d.step.id, kind: 'step', loop: l, step: d.step, label: d.step.title, sub: l.title, est: d.step.estMinutes });
    if (l.stage === 'WAITING' && l.waiting?.followUp && l.waiting.followUp <= t)
      out.push({ key: l.id + '-fu', kind: 'followup', loop: l, label: `Follow up: ${l.waiting.what || l.title}`, sub: l.waiting.who || l.title, est: 10 });
    if (l.appointment?.date === t)
      out.push({ key: l.id + '-ap', kind: 'appt', loop: l, label: `Appointment ${l.appointment.ref || ''}`.trim(), sub: l.title, time: l.appointment.time, est: null });
  }
  return out.sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || PRIORITY_RANK[a.loop.priority] - PRIORITY_RANK[b.loop.priority]);
}

// ---- calendar --------------------------------------------------------------
export const EVENT_KINDS = {
  expected: 'Expected completion',
  deadline: 'Deadline',
  overdue: 'Due for review',
  done: 'Closed',
  waiting: 'Waiting on',
  start: 'Start',
  reminder: 'Reminder',
  appt: 'Appointment',
};
export function calendarEvents(loops, t = today()) {
  const map = {};
  const add = (date, e) => date && (map[date] ||= []).push(e);
  for (const l of loops) {
    if (isClosed(l)) {
      add(l.actualCompletionDate || closedDay(l), { loop: l, kind: 'done', label: l.title });
      continue;
    }
    if (l.startDate && l.startDate !== l.expectedDate) add(l.startDate, { loop: l, kind: 'start', label: l.title, time: l.startTime });
    if (l.expectedDate) add(l.expectedDate, { loop: l, kind: l.expectedDate < t ? 'overdue' : 'expected', label: l.title, time: l.endTime || l.startTime });
    if (l.deadline) add(l.deadline, { loop: l, kind: 'deadline', label: l.title, late: l.deadline < t });
    if (l.stage === 'WAITING' && l.waiting) {
      add(l.waiting.expectedResponse, { loop: l, kind: 'waiting', label: `Response expected: ${l.waiting.what || l.title}` });
      if (l.waiting.followUp !== l.waiting.expectedResponse) add(l.waiting.followUp, { loop: l, kind: 'waiting', label: `Follow up: ${l.waiting.what || l.title}` });
    }
    if (l.reminderAt) add(l.reminderAt.slice(0, 10), { loop: l, kind: 'reminder', label: l.title, time: l.reminderAt.slice(11, 16) });
    if (l.appointment?.date) add(l.appointment.date, { loop: l, kind: 'appt', label: `Appointment ${l.appointment.ref || ''} — ${l.title}`, time: l.appointment.time });
    if (l.appointment?.followUpDate) add(l.appointment.followUpDate, { loop: l, kind: 'appt', label: `Follow-up due ${l.appointment.ref || ''} — ${l.title}` });
    for (const { step } of flatSteps(l.steps))
      if (step.expectedDate && !['done', 'skipped'].includes(step.status)) add(step.expectedDate, { loop: l, kind: 'expected', label: `${step.title} · ${l.title}`, step: true });
  }
  for (const d in map) map[d].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  return map;
}

// ---- insights --------------------------------------------------------------
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function computeInsights(loops, sectors, weekStart = 1) {
  const t = today();
  const closed = loops.filter(isClosed);
  const open = loops.filter((l) => !isClosed(l));
  const completed = closed.filter((l) => l.resolution === 'COMPLETED');
  const byStage = Object.fromEntries(['OPENED', 'ACTIVE', 'WAITING', 'STUCK', 'CLOSED'].map((s) => [s, loops.filter((l) => l.stage === s).length]));
  const byResolution = Object.fromEntries(['COMPLETED', 'DECIDED_NOT_TO', 'SUPERSEDED', 'ARCHIVED'].map((r) => [r, closed.filter((l) => l.resolution === r).length]));

  const timed = completed.filter((l) => l.expectedDate && l.actualCompletionDate).map((l) => ({ loop: l, late: diffDays(l.actualCompletionDate, l.expectedDate) }));
  const timing = {
    n: timed.length,
    onTime: timed.filter((x) => x.late <= 0).length,
    late: timed.filter((x) => x.late > 0).length,
    avgLate: mean(timed.map((x) => x.late)),
    rows: timed.sort((a, b) => b.late - a.late).slice(0, 6),
  };

  const eff = closed.filter((l) => l.estMinutes > 0 && l.actualMinutes > 0).map((l) => ({ loop: l, ratio: l.actualMinutes / l.estMinutes }));
  const effort = { n: eff.length, medianRatio: median(eff.map((x) => x.ratio)), rows: eff.sort((a, b) => b.ratio - a.ratio).slice(0, 6) };

  const resched = loops.map((l) => ({ loop: l, n: rescheduleCount(l) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const stalls = loops.map((l) => ({ loop: l, n: stuckCount(l) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const waits = loops.map((l) => daysInStage(l, 'WAITING')).filter((d) => d > 0);

  const perSector = sectors.filter((s) => !s.archived).map((s) => {
    const mine = loops.filter((l) => l.sectorIds.includes(s.id));
    return {
      sector: s,
      open: mine.filter((l) => !isClosed(l)).length,
      closed: mine.filter(isClosed).length,
      stalls: mine.reduce((a, l) => a + stuckCount(l), 0),
      reschedules: mine.reduce((a, l) => a + rescheduleCount(l), 0),
    };
  }).filter((x) => x.open + x.closed > 0);

  const allSteps = loops.flatMap((l) => flatSteps(l.steps).map((x) => x.step));
  const steps = { total: allSteps.length, done: allSteps.filter((s) => s.status === 'done').length, blocked: allSteps.filter((s) => s.status === 'blocked').length };

  const w0 = startOfWeek(t, weekStart);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(w0, -7 * (7 - i));
    const end = addDays(start, 6);
    const inWeek = closed.filter((l) => { const d = closedDay(l); return d >= start && d <= end; });
    return { start, completed: inWeek.filter((l) => l.resolution === 'COMPLETED').length, other: inWeek.filter((l) => l.resolution !== 'COMPLETED').length };
  });
  const weekdays = DOW.map((d, i) => ({ day: d, n: closed.filter((l) => { const c = closedDay(l); return c && new Date(c + 'T12:00').getDay() === i; }).length }));

  const horizon = addDays(t, 7);
  const upcoming = open.filter((l) => [l.expectedDate, l.deadline].some((d) => d && d >= t && d <= horizon));
  const load = { n: upcoming.length, minutes: upcoming.reduce((a, l) => a + (Number(l.estMinutes) || 0), 0) };

  return {
    total: loops.length, open: open.length, closed: closed.length, byStage, byResolution, timing, effort,
    resched, totalResched: resched.reduce((a, x) => a + x.n, 0), stalls, steps, weeks, weekdays, perSector, load,
    waiting: { n: waits.length, avg: mean(waits) },
    overdue: open.filter((l) => isOverdue(l, t)).length,
  };
}

/** Short, descriptive one-liners for the dashboard. Descriptive only. */
export function insightLines(ins) {
  const out = [];
  if (ins.effort.n >= 2 && ins.effort.medianRatio)
    out.push({ icon: 'clock', text: `Across ${ins.effort.n} closed loops with both figures, actual effort was a median ${ins.effort.medianRatio.toFixed(1)}× your estimate.` });
  const decided = ins.byResolution.DECIDED_NOT_TO + ins.byResolution.SUPERSEDED;
  if (ins.closed) out.push({ icon: 'checkc', text: `${ins.closed} loops closed so far: ${ins.byResolution.COMPLETED} completed, ${decided} resolved by decision.` });
  if (ins.timing.n >= 2) out.push({ icon: 'calendar', text: `${ins.timing.onTime} of ${ins.timing.n} completed loops finished on or before the expected date.` });
  if (ins.totalResched) out.push({ icon: 'undo', text: `${ins.totalResched} reschedules recorded across ${ins.resched.length} loops.` });
  if (ins.waiting.n) out.push({ icon: 'pause', text: `Loops that waited on something waited ${ins.waiting.avg.toFixed(1)} days on average.` });
  if (!out.length) out.push({ icon: 'chart', text: 'Insights appear here once a few loops have some history.' });
  return out;
}

// ---- rule-based recommendations -------------------------------------------
export function recommendations({ loops, settings, app, plans }, ins) {
  const t = today();
  const open = loops.filter((l) => !isClosed(l));
  const recs = [];
  const items = todayItems(loops, t);
  const planned = items.reduce((a, i) => a + (Number(i.est) || 0), 0);
  const cap = Number(settings.dailyCapacityMinutes) || 0;
  if (cap && planned > cap) {
    const movable = items.filter((i) => i.loop.plannedFor === t || i.loop.expectedDate === t).sort((a, b) => PRIORITY_RANK[b.loop.priority] - PRIORITY_RANK[a.loop.priority])[0];
    recs.push({
      id: 'cap-' + t,
      text: `Today's plan adds up to about ${fmtMin(planned)}, more than the ${fmtMin(cap)} you set as a realistic day.` + (movable ? ` The lowest-priority item is “${movable.loop.title}”. Move it to tomorrow?` : ''),
      action: movable && { label: 'Move to tomorrow', type: 'tomorrow', loopId: movable.loop.id },
    });
  }
  for (const l of open.filter((l) => l.stage === 'WAITING' && l.waiting?.followUp && l.waiting.followUp <= t))
    recs.push({ id: 'fu-' + l.id + l.waiting.followUp, text: `Follow-up on “${l.title}” is due${l.waiting.who ? ` with ${l.waiting.who}` : ''}. One nudge, then it can go back to waiting.`, action: { label: 'Open loop', type: 'open', loopId: l.id } });
  for (const l of open.filter((l) => l.stage === 'STUCK')) {
    const days = Math.floor((Date.now() - new Date(stageSince(l))) / 864e5);
    if (days >= 7) recs.push({ id: 'stuck-' + l.id, text: `“${l.title}” has been stuck for ${days} days. Name the smallest next step, or decide it's not happening — both resolve it.`, action: { label: 'Open loop', type: 'open', loopId: l.id } });
  }
  for (const l of open) {
    const n = rescheduleCount(l);
    if (n >= 3) recs.push({ id: 'res-' + l.id + n, text: `“${l.title}” has been rescheduled ${n} times. Is the timeline unrealistic, the loop too big, or is this one to let go?`, action: { label: 'Open loop', type: 'open', loopId: l.id } });
  }
  if (cap && ins.load.minutes > cap * 5)
    recs.push({ id: 'load-' + t, text: `${ins.load.n} loops are due in the next 7 days with about ${fmtMin(ins.load.minutes)} of estimated effort — more than five full days at your stated capacity. Something probably needs to move.`, action: { label: 'See calendar', type: 'nav', view: 'calendar', params: { tab: 'deadlines' } } });
  const due = open.filter((l) => isOverdue(l, t));
  if (due.length >= 3)
    recs.push({ id: 'due-' + t, text: `${due.length} loops have passed their expected date. Nothing is failed; they just want a fresh date or a decision.`, action: { label: 'Review them', type: 'nav', view: 'loops', params: { tab: 'review' } } });
  if (ins.effort.n >= 3 && ins.effort.medianRatio > 1.3)
    recs.push({ id: 'est-' + ins.effort.n, text: `Your closed loops took a median ${ins.effort.medianRatio.toFixed(1)}× their estimate. Consider multiplying new estimates by about ${ins.effort.medianRatio.toFixed(1)}.`, action: { label: 'See insights', type: 'nav', view: 'insights' } });
  const noNext = open.filter((l) => l.stage === 'ACTIVE' && !nextText(l));
  if (noNext.length)
    recs.push({ id: 'nonext-' + noNext[0].id, text: `“${noNext[0].title}” is active but has no next step${noNext.length > 1 ? ` (and ${noNext.length - 1} more like it)` : ''}. A concrete next action makes it easier to pick up.`, action: { label: 'Add next step', type: 'open', loopId: noNext[0].id } });
  const late = open.filter((l) => waitingLate(l, t) && !(l.waiting.followUp && l.waiting.followUp > t));
  if (late.length)
    recs.push({ id: 'wl-' + late[0].id + (late[0].waiting.followUp || ''), text: `“${late[0].title}” has passed its expected response date. Set a follow-up date, or leave it — it is outside your control.`, action: { label: 'Open loop', type: 'open', loopId: late[0].id } });
  const mk = monthKey(t);
  if (!plans.some((p) => p.id === mk) && open.length)
    recs.push({ id: 'plan-' + mk, text: `No commitment pool is set for ${monthLabel(mk)} yet. Setting one fixes what this month's progress is measured against.`, action: { label: 'Set it up', type: 'nav', view: 'rewards' } });
  const dismissed = app.dismissed?.date === t ? app.dismissed.ids : [];
  return recs.filter((r) => !dismissed.includes(r.id));
}

export { deadlinePassed, stampDay };
