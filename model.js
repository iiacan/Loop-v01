// The Loop data model: constants, factories and pure helpers.
import { today, nowISO, addDays, addMonths, diffDays, fmtDate, stampDay } from './dates.js';

export const APP_VERSION = '0.1.0';
export const SCHEMA_VERSION = 1;
export const BACKUP_VERSION = 1;

export const OPEN_STAGES = ['OPENED', 'ACTIVE', 'WAITING', 'STUCK'];
export const STAGES = [...OPEN_STAGES, 'CLOSED'];
export const STAGE_LABEL = { OPENED: 'Opened', ACTIVE: 'Active', WAITING: 'Waiting', STUCK: 'Stuck', CLOSED: 'Closed' };
export const RESOLUTIONS = {
  COMPLETED: { label: 'Completed', hint: 'Done — the objective was met.' },
  DECIDED_NOT_TO: { label: 'Decided not to', hint: 'A deliberate choice not to do this. A legitimate outcome.' },
  SUPERSEDED: { label: 'Superseded', hint: 'Replaced by another loop or overtaken by events.' },
  ARCHIVED: { label: 'Archived', hint: 'Set aside without a verdict. Leaves monthly progress untouched.' },
};
export const PRIORITIES = ['critical', 'high', 'medium', 'low'];
export const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
export const WAIT_TYPES = ['Another person', 'An institution', 'A document', 'A payment', 'An external event', 'A response', 'A resource'];
export const STEP_STATUS = { todo: 'To do', doing: 'In progress', blocked: 'Stuck here', done: 'Done', skipped: 'Skipped' };
export const APPT_STATUS = ['Scheduled', 'Attended', 'Rescheduled', 'Cancelled', 'Did not attend'];
export const RECUR = { none: 'Does not repeat', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
export const MAX_STEP_DEPTH = 2; // step → sub-step → sub-sub-step

export const uid = () =>
  globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export const DEFAULT_SECTORS = [
  ['Employment', '#a78bfa'],
  ['Clinical practice', '#60a5fa', true],
  ['Research and academia', '#c084fc'],
  ['Family', '#f9a8d4'],
  ['Friends', '#fdba74'],
  ['Hobbies', '#fb7185'],
  ['Extracurricular activities', '#f87171'],
  ['Travel', '#38bdf8'],
  ['Bills and finances', '#7dd3fc'],
  ['Personal health', '#6ee7b7'],
  ['Home and administration', '#fcd34d'],
  ['Creative projects', '#e879f9'],
].map(([name, color, clinical], i) => ({
  id: 'sec-' + name.toLowerCase().replace(/[^a-z]+/g, '-'),
  name,
  color,
  clinical: !!clinical,
  archived: false,
  order: i,
}));

export const DEFAULT_REWARDS = [
  { threshold: 25, title: '' },
  { threshold: 50, title: '' },
  { threshold: 75, title: '' },
  { threshold: 100, title: '' },
];

export const DEFAULT_SETTINGS = {
  id: 'settings',
  name: '',
  greeting: '',
  dateFormat: 'dmy',
  timeFormat: '12',
  weekStart: 1,
  theme: 'dark',
  reduceMotion: false,
  inAppReminders: true,
  browserNotifications: false,
  defaultReminder: false,
  defaultReminderDaysBefore: 1,
  defaultReminderTime: '09:00',
  dailyCapacityMinutes: 240,
  backupReminderDays: 7,
  rewardDefaults: DEFAULT_REWARDS,
};

export const hist = (type, data = {}) => ({ at: nowISO(), type, ...data });

export function newLoop(p = {}) {
  const now = nowISO();
  return {
    id: uid(),
    title: '',
    description: '',
    sectorIds: [],
    priority: 'medium',
    stage: 'OPENED',
    createdAt: now,
    updatedAt: now,
    startDate: null,
    expectedDate: null,
    deadline: null,
    actualCompletionDate: null,
    closedAt: null,
    startTime: null,
    endTime: null,
    reminderAt: null,
    reminderFired: false,
    plannedFor: null,
    recurrence: { freq: 'none', interval: 1 },
    nextAction: '',
    waiting: null,
    appointment: null,
    notes: '',
    steps: [],
    estMinutes: null,
    actualMinutes: null,
    weight: 1,
    tags: [],
    resolution: null,
    closureReason: '',
    sample: false,
    history: [{ at: now, type: 'created' }],
    ...p,
  };
}
export const newStep = (title) => ({ id: uid(), title, status: 'todo', expectedDate: null, estMinutes: null, notes: '', children: [] });
export const newWaiting = () => ({ what: '', who: '', type: WAIT_TYPES[0], since: today(), expectedResponse: null, followUp: null });
export const newAppointment = () => ({ ref: '', date: null, time: null, status: APPT_STATUS[0], followUpDate: null, adminFollowUp: '' });

export const isClosed = (l) => l.stage === 'CLOSED';
/** Expected completion passed without closure: due for review, not failed. */
export const isOverdue = (l, t = today()) => !isClosed(l) && !!l.expectedDate && l.expectedDate < t;
export const deadlinePassed = (l, t = today()) => !isClosed(l) && !!l.deadline && l.deadline < t;
export const waitingLate = (l, t = today()) =>
  l.stage === 'WAITING' && !!l.waiting?.expectedResponse && l.waiting.expectedResponse < t;

// ---- steps -----------------------------------------------------------------
export function flatSteps(steps = [], depth = 0, out = []) {
  for (const s of steps) {
    out.push({ step: s, depth });
    flatSteps(s.children || [], depth + 1, out);
  }
  return out;
}
const leafFirst = (steps, pred) => {
  for (const s of steps || []) {
    const kids = (s.children || []).filter((c) => c.status !== 'done' && c.status !== 'skipped');
    if (pred(s) && !kids.length) return s;
    if (s.status !== 'done' && s.status !== 'skipped') {
      const inner = leafFirst(s.children, pred);
      if (inner) return inner;
    }
  }
  return null;
};
/** First step that can be acted on now (depth-first, unfinished leaves first). */
export const nextStep = (l) => leafFirst(l.steps, (s) => s.status === 'todo' || s.status === 'doing');
export const blockedStep = (l) => flatSteps(l.steps).find((x) => x.step.status === 'blocked')?.step || null;
export function stepProgress(l) {
  const all = flatSteps(l.steps).filter((x) => x.step.status !== 'skipped');
  return { total: all.length, done: all.filter((x) => x.step.status === 'done').length };
}
export const mapStep = (steps, id, fn) =>
  steps.map((s) => (s.id === id ? fn(s) : { ...s, children: mapStep(s.children || [], id, fn) }));
export const dropStep = (steps, id) =>
  steps.filter((s) => s.id !== id).map((s) => ({ ...s, children: dropStep(s.children || [], id) }));
export function moveStep(steps, id, dir) {
  const i = steps.findIndex((s) => s.id === id);
  if (i >= 0) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return steps;
    const out = [...steps];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  }
  return steps.map((s) => ({ ...s, children: moveStep(s.children || [], id, dir) }));
}

/** What the table shows under "Next step / Waiting on". */
export function nextText(l) {
  if (isClosed(l)) return RESOLUTIONS[l.resolution]?.label || 'Closed';
  if (l.stage === 'WAITING' && l.waiting?.what) return l.waiting.what + (l.waiting.who ? ` — ${l.waiting.who}` : '');
  if (l.stage === 'STUCK') {
    const b = blockedStep(l);
    if (b) return `Stuck at: ${b.title}`;
  }
  return l.nextAction || nextStep(l)?.title || '';
}

// ---- history-derived measures ---------------------------------------------
export const rescheduleCount = (l) => l.history.filter((h) => h.type === 'reschedule').length;
export const stuckCount = (l) => l.history.filter((h) => h.to === 'STUCK' && (h.type === 'stage' || h.type === 'reopened')).length;
export function daysInStage(l, stage) {
  let total = 0;
  let since = null;
  for (const h of l.history) {
    if (!['stage', 'closed', 'reopened'].includes(h.type)) continue;
    if (since && h.to !== stage) {
      total += (new Date(h.at) - new Date(since)) / 864e5;
      since = null;
    }
    if (h.to === stage && !since) since = h.at;
  }
  if (since) total += (Date.now() - new Date(since)) / 864e5;
  return total;
}
export function stageSince(l) {
  for (let i = l.history.length - 1; i >= 0; i--) {
    const h = l.history[i];
    if (['stage', 'closed', 'reopened'].includes(h.type) && h.to === l.stage) return h.at;
  }
  return l.createdAt;
}

export function nextOccurrence(l) {
  const { freq, interval = 1 } = l.recurrence || {};
  if (!freq || freq === 'none') return null;
  const n = Math.max(1, Number(interval) || 1);
  const shift = (d) =>
    !d ? null : freq === 'daily' ? addDays(d, n) : freq === 'weekly' ? addDays(d, 7 * n) : freq === 'monthly' ? addMonths(d, n) : addMonths(d, 12 * n);
  const reset = (steps) => steps.map((s) => ({ ...s, id: uid(), status: 'todo', expectedDate: null, children: reset(s.children || []) }));
  let expected = shift(l.expectedDate || today());
  while (expected < today()) expected = shift(expected);
  const delta = l.expectedDate ? diffDays(expected, l.expectedDate) : 0;
  const move = (d) => (d ? addDays(d, delta) : null);
  return newLoop({
    title: l.title,
    description: l.description,
    sectorIds: l.sectorIds,
    priority: l.priority,
    tags: l.tags,
    estMinutes: l.estMinutes,
    weight: l.weight,
    recurrence: l.recurrence,
    notes: l.notes,
    nextAction: '',
    steps: reset(l.steps),
    startDate: move(l.startDate),
    expectedDate: expected,
    deadline: move(l.deadline),
    startTime: l.startTime,
    endTime: l.endTime,
    history: [hist('created', { note: 'Next occurrence of a recurring loop' })],
  });
}

const FIELD_LABEL = {
  title: 'Title',
  priority: 'Priority',
  expectedDate: 'Expected completion',
  deadline: 'Deadline',
  startDate: 'Start date',
  estMinutes: 'Estimated effort (min)',
  sectorIds: 'Sectors',
};
export const TRACKED_FIELDS = Object.keys(FIELD_LABEL);

export function describeHistory(h, st, sectors = []) {
  const v = (field, x) => {
    if (x == null || x === '') return 'none';
    if (['expectedDate', 'deadline', 'startDate'].includes(field)) return fmtDate(x, st);
    if (field === 'sectorIds') return x.map((id) => sectors.find((s) => s.id === id)?.name || '?').join(', ') || 'none';
    return String(x);
  };
  switch (h.type) {
    case 'created':
      return 'Loop opened' + (h.note ? ` — ${h.note}` : '');
    case 'stage':
      return `${STAGE_LABEL[h.from]} → ${STAGE_LABEL[h.to]}` + (h.note ? ` — ${h.note}` : '');
    case 'closed':
      return `Closed: ${RESOLUTIONS[h.resolution]?.label || ''}` + (h.note ? ` — ${h.note}` : '');
    case 'reopened':
      return `Reopened as ${STAGE_LABEL[h.to]}` + (h.previousResolution ? ` (was ${RESOLUTIONS[h.previousResolution]?.label})` : '');
    case 'reschedule':
      return `Rescheduled: ${v('expectedDate', h.from)} → ${v('expectedDate', h.to)}` + (h.note ? ` — ${h.note}` : '');
    case 'field':
      return `${FIELD_LABEL[h.field] || h.field}: ${v(h.field, h.from)} → ${v(h.field, h.to)}`;
    default:
      return h.note || h.type;
  }
}

export const sectorsOf = (l, sectors) => l.sectorIds.map((id) => sectors.find((s) => s.id === id)).filter(Boolean);
export const closedDay = (l) => (l.closedAt ? stampDay(l.closedAt) : l.actualCompletionDate);
