// Application state: everything is held in memory and written through to the
// storage adapter on every change, so a refresh always shows the saved state.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getAdapter } from './lib/storage.js';
import { today, nowISO, addDays, monthKey } from './lib/dates.js';
import {
  DEFAULT_SECTORS, DEFAULT_SETTINGS, TRACKED_FIELDS, newLoop, hist, isClosed, nextOccurrence, newWaiting, uid, APP_VERSION,
} from './lib/model.js';
import { newPlan } from './lib/logic.js';
import { sampleData } from './lib/seed.js';
import { mergeData } from './lib/backup.js';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function StoreProvider({ children }) {
  const [state, setState] = useState({ ready: false, loops: [], sectors: [], plans: [], settings: DEFAULT_SETTINGS, app: { id: 'app' }, storage: null, error: null });
  const ref = useRef(state);
  const adapter = useRef(null);

  const apply = (fn) => {
    const next = fn(ref.current);
    ref.current = next;
    setState(next);
  };
  const fail = (e) => {
    console.error(e);
    apply((s) => ({ ...s, error: 'A change could not be saved to browser storage: ' + (e?.message || e) + '. Download a backup now, then reload.' }));
  };
  const persist = (store, value) => adapter.current.put(store, value).catch(fail);
  const upsert = (key, value) => {
    apply((s) => ({ ...s, [key]: s[key].some((x) => x.id === value.id) ? s[key].map((x) => (x.id === value.id ? value : x)) : [...s[key], value] }));
    persist(key, value);
    return value;
  };

  useEffect(() => {
    (async () => {
      try {
        const a = (adapter.current = await getAdapter());
        let [loops, sectors, plans, meta] = await Promise.all(['loops', 'sectors', 'plans', 'meta'].map((s) => a.getAll(s)));
        let settings = { ...DEFAULT_SETTINGS, ...(meta.find((m) => m.id === 'settings') || {}) };
        let app = meta.find((m) => m.id === 'app');
        if (!app) {
          // First run on this browser: default sectors plus clearly labelled sample data.
          const sample = sampleData();
          sectors = DEFAULT_SECTORS;
          loops = sample.loops;
          plans = sample.plans;
          app = { id: 'app', firstRunAt: nowISO(), lastBackupAt: null, version: APP_VERSION };
          await a.replaceAll({ loops, sectors, plans, meta: [settings, app] });
        }
        apply(() => ({ ready: true, loops, sectors, plans, settings, app, storage: { kind: a.kind, label: a.label }, error: null }));
      } catch (e) {
        apply((s) => ({ ...s, ready: true, error: 'Loop could not open its storage: ' + (e?.message || e) }));
      }
    })();
  }, []);

  const actions = useMemo(() => {
    const get = (id) => ref.current.loops.find((l) => l.id === id);
    const withDefaultReminder = (loop, prev) => {
      const st = ref.current.settings;
      if (!st.defaultReminder || loop.reminderAt || !loop.expectedDate || prev?.expectedDate === loop.expectedDate) return loop;
      return { ...loop, reminderAt: `${addDays(loop.expectedDate, -Number(st.defaultReminderDaysBefore || 0))}T${st.defaultReminderTime || '09:00'}`, reminderFired: false };
    };
    const A = {
      createLoop(p = {}) {
        return upsert('loops', withDefaultReminder(newLoop(p)));
      },
      /** Patch a loop. Changes to tracked fields are written to its history. */
      updateLoop(id, patch, opts = {}) {
        const old = get(id);
        if (!old) return null;
        const h = [];
        for (const k of TRACKED_FIELDS) {
          if (!(k in patch) || same(old[k], patch[k])) continue;
          if (k === 'expectedDate' && old[k] && patch[k]) h.push(hist('reschedule', { field: k, from: old[k], to: patch[k], note: opts.note }));
          else h.push(hist('field', { field: k, from: old[k] ?? null, to: patch[k] ?? null }));
        }
        let next = { ...old, ...patch, updatedAt: nowISO(), history: [...old.history, ...h, ...(opts.history || [])] };
        if ('reminderAt' in patch && patch.reminderAt !== old.reminderAt) next.reminderFired = false;
        next = withDefaultReminder(next, old);
        return upsert('loops', next);
      },
      addNote(id, note) {
        return A.updateLoop(id, {}, { history: [hist('note', { note })] });
      },
      setStage(id, stage, note) {
        const old = get(id);
        if (!old || old.stage === stage || isClosed(old)) return old;
        const patch = { stage };
        if (stage === 'WAITING' && !old.waiting) patch.waiting = newWaiting();
        else if (stage === 'WAITING' && old.stage !== 'WAITING') patch.waiting = { ...old.waiting, since: today() };
        return A.updateLoop(id, patch, { history: [hist('stage', { from: old.stage, to: stage, note })] });
      },
      closeLoop(id, { resolution, reason = '', actualMinutes, date }) {
        const old = get(id);
        if (!old || isClosed(old)) return {};
        const patch = { stage: 'CLOSED', resolution, closureReason: reason, actualCompletionDate: date || today(), closedAt: nowISO(), plannedFor: null };
        if (actualMinutes) patch.actualMinutes = Number(actualMinutes);
        const loop = A.updateLoop(id, patch, { history: [hist('closed', { from: old.stage, to: 'CLOSED', resolution, note: reason })] });
        let next = null;
        if (resolution === 'COMPLETED') {
          const n = nextOccurrence(old);
          if (n) next = upsert('loops', n);
        }
        return { loop, next };
      },
      reopenLoop(id, stage = 'ACTIVE') {
        const old = get(id);
        if (!old || !isClosed(old)) return old;
        return A.updateLoop(id, { stage, resolution: null, closureReason: '', actualCompletionDate: null, closedAt: null }, {
          history: [hist('reopened', { from: 'CLOSED', to: stage, previousResolution: old.resolution, note: old.closureReason })],
        });
      },
      deleteLoop(id) {
        apply((s) => ({ ...s, loops: s.loops.filter((l) => l.id !== id) }));
        adapter.current.remove('loops', id).catch(fail);
      },
      saveSector(sec) {
        return upsert('sectors', sec.id ? sec : { ...sec, id: 'sec-' + uid(), archived: false, order: ref.current.sectors.length });
      },
      savePlan(plan) {
        return upsert('plans', plan);
      },
      /** Record a transparent change on a plan that is already in force. */
      changePlan(id, fn, note) {
        const plan = ref.current.plans.find((p) => p.id === id);
        if (!plan) return null;
        const next = fn(plan);
        const active = id <= monthKey();
        return upsert('plans', active && note ? { ...next, changes: [...(next.changes || []), { at: nowISO(), note }] } : next);
      },
      ensurePlan(id) {
        return ref.current.plans.find((p) => p.id === id) || upsert('plans', newPlan(id, [], ref.current.settings.rewardDefaults || []));
      },
      saveSettings(patch) {
        const settings = { ...ref.current.settings, ...patch, id: 'settings' };
        apply((s) => ({ ...s, settings }));
        persist('meta', settings);
      },
      saveApp(patch) {
        const app = { ...ref.current.app, ...patch, id: 'app' };
        apply((s) => ({ ...s, app }));
        persist('meta', app);
      },
      async removeSampleData() {
        const s = ref.current;
        const loops = s.loops.filter((l) => !l.sample);
        const keep = new Set(loops.map((l) => l.id));
        const plans = s.plans.filter((p) => !p.sample).concat(
          s.plans.filter((p) => p.sample && p.pool.some((x) => keep.has(x.loopId))).map((p) => ({ ...p, sample: false, pool: p.pool.filter((x) => keep.has(x.loopId)) }))
        );
        await A.replaceAll({ loops, sectors: s.sectors, plans, settings: s.settings, app: s.app });
      },
      /** Replace everything in storage atomically. */
      async replaceAll({ loops, sectors, plans, settings, app }) {
        settings = { ...DEFAULT_SETTINGS, ...settings, id: 'settings' };
        app = { ...app, id: 'app' };
        await adapter.current.replaceAll({ loops, sectors, plans, meta: [settings, app] });
        apply((s) => ({ ...s, loops, sectors, plans, settings, app }));
      },
      async mergeAll(incoming) {
        const s = ref.current;
        const m = mergeData(s, incoming);
        await A.replaceAll({ loops: m.loops, sectors: m.sectors, plans: m.plans, settings: s.settings, app: s.app });
        return m.stats;
      },
      async eraseAll() {
        const s = ref.current;
        await A.replaceAll({ loops: [], sectors: DEFAULT_SECTORS, plans: [], settings: s.settings, app: { id: 'app', firstRunAt: s.app.firstRunAt, lastBackupAt: null } });
      },
      clearError() {
        apply((s) => ({ ...s, error: null }));
      },
      getState: () => ref.current,
    };
    return A;
  }, []);

  return <Ctx.Provider value={{ ...state, actions }}>{children}</Ctx.Provider>;
}
