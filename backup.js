// Backup, restore and export. The backup file is plain JSON the user owns.
import { today, nowISO } from './dates.js';
import { APP_VERSION, SCHEMA_VERSION, BACKUP_VERSION, STAGES, RESOLUTIONS, rescheduleCount, nextText, newLoop, DEFAULT_SETTINGS } from './model.js';

export function buildBackup({ loops, sectors, plans, settings, app }) {
  return {
    app: 'loop',
    backupVersion: BACKUP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: nowISO(),
    data: { loops, sectors, plans, settings, app },
  };
}

export function download(filename, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const backupFilename = () => `loop-backup-${today()}.json`;

/** Validate a parsed backup. Returns { ok, errors, warnings, summary, data }. */
export function validateBackup(obj) {
  const errors = [];
  const warnings = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['This file is not a Loop backup (not a JSON object).'], warnings };
  if (obj.app !== 'loop') errors.push('This file is not marked as a Loop backup.');
  if (typeof obj.schemaVersion !== 'number') errors.push('The backup has no schema version.');
  else if (obj.schemaVersion > SCHEMA_VERSION)
    errors.push(`This backup uses schema v${obj.schemaVersion}, newer than this app understands (v${SCHEMA_VERSION}). Update Loop first.`);
  const d = obj.data;
  if (!d || typeof d !== 'object') errors.push('The backup contains no data section.');
  if (errors.length) return { ok: false, errors, warnings };
  for (const k of ['loops', 'sectors', 'plans']) {
    if (d[k] == null) { d[k] = []; warnings.push(`No ${k} in this backup.`); }
    else if (!Array.isArray(d[k])) errors.push(`“${k}” should be a list.`);
  }
  if (errors.length) return { ok: false, errors, warnings };
  const ids = new Set();
  d.loops.forEach((l, i) => {
    if (!l || typeof l.id !== 'string' || typeof l.title !== 'string') return errors.push(`Loop #${i + 1} has no id or title.`);
    if (ids.has(l.id)) errors.push(`Duplicate loop id: ${l.id}`);
    ids.add(l.id);
    if (!STAGES.includes(l.stage)) errors.push(`“${l.title}” has an unknown stage: ${l.stage}`);
    if (l.stage === 'CLOSED' && !RESOLUTIONS[l.resolution]) errors.push(`“${l.title}” is closed without a valid resolution.`);
    if (!Array.isArray(l.history)) errors.push(`“${l.title}” has no history list.`);
  });
  d.sectors.forEach((s, i) => { if (!s || typeof s.id !== 'string' || typeof s.name !== 'string') errors.push(`Sector #${i + 1} has no id or name.`); });
  d.plans.forEach((p, i) => { if (!p || !/^\d{4}-\d{2}$/.test(p.id || '') || !Array.isArray(p.pool)) errors.push(`Monthly plan #${i + 1} is malformed.`); });
  if (errors.length > 8) errors.splice(8, errors.length, `…and ${errors.length - 8} more problems.`);
  if (errors.length) return { ok: false, errors, warnings };
  // Normalise: fill any fields missing from older/hand-edited files.
  const blank = newLoop();
  d.loops = d.loops.map((l) => ({ ...blank, ...l, sectorIds: l.sectorIds || [], steps: l.steps || [], tags: l.tags || [] }));
  d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}), id: 'settings' };
  d.app = { ...(d.app || {}), id: 'app' };
  return {
    ok: true, errors, warnings, data: d,
    summary: {
      exportedAt: obj.exportedAt, schemaVersion: obj.schemaVersion, appVersion: obj.appVersion,
      loops: d.loops.length, open: d.loops.filter((l) => l.stage !== 'CLOSED').length,
      steps: d.loops.reduce((a, l) => a + countSteps(l.steps), 0),
      history: d.loops.reduce((a, l) => a + l.history.length, 0),
      sectors: d.sectors.length, plans: d.plans.length, name: d.settings.name,
    },
  };
}
const countSteps = (steps) => (steps || []).reduce((a, s) => a + 1 + countSteps(s.children), 0);

/** Merge: add what's new; where both have an item, keep the most recently updated. */
export function mergeData(current, incoming) {
  const mergeList = (a, b, newer) => {
    const map = new Map(a.map((x) => [x.id, x]));
    let added = 0, updated = 0;
    for (const x of b) {
      const mine = map.get(x.id);
      if (!mine) { map.set(x.id, x); added++; }
      else if (newer(x, mine)) { map.set(x.id, x); updated++; }
    }
    return { list: [...map.values()], added, updated };
  };
  const loops = mergeList(current.loops, incoming.loops, (x, m) => (x.updatedAt || '') > (m.updatedAt || ''));
  const sectors = mergeList(current.sectors, incoming.sectors, () => false);
  const plans = mergeList(current.plans, incoming.plans, (x, m) => (x.changes?.length || 0) > (m.changes?.length || 0));
  return { loops: loops.list, sectors: sectors.list, plans: plans.list, stats: { loops, sectors, plans } };
}

const cell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // keep spreadsheets from treating text as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function loopsToCSV(loops, sectors) {
  const head = ['id', 'title', 'sectors', 'stage', 'resolution', 'priority', 'created', 'start', 'expected_completion', 'deadline', 'actual_completion', 'next_step_or_waiting_on', 'estimated_minutes', 'actual_minutes', 'commitment_weight', 'times_rescheduled', 'tags', 'closure_reason', 'description'];
  const rows = loops.map((l) => [
    l.id, l.title, l.sectorIds.map((id) => sectors.find((s) => s.id === id)?.name).filter(Boolean).join('; '),
    l.stage, l.resolution || '', l.priority, l.createdAt.slice(0, 10), l.startDate, l.expectedDate, l.deadline, l.actualCompletionDate,
    nextText(l), l.estMinutes, l.actualMinutes, l.weight, rescheduleCount(l), (l.tags || []).join('; '), l.closureReason, l.description,
  ]);
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}
export function exportLoopsJSON(loops, sectors) {
  return JSON.stringify({ app: 'loop', kind: 'loop-export', schemaVersion: SCHEMA_VERSION, exportedAt: nowISO(), sectors: sectors.filter((s) => loops.some((l) => l.sectorIds.includes(s.id))), loops }, null, 2);
}
