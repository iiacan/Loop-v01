// Components shared across views: the loop table, the loop detail panel,
// and the capture / close / reschedule dialogs.
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from './store.jsx';
import { useUI, Modal, Field, BlurInput, StageBadge, SectorTags, SectorDot, Empty, Menu, Icon } from './ui.jsx';
import { today, addDays, addMonths, fmtDate, fmtStamp, relDay, fmtMin, diffDays } from './lib/dates.js';
import {
  OPEN_STAGES, STAGE_LABEL, RESOLUTIONS, PRIORITIES, PRIORITY_RANK, WAIT_TYPES, STEP_STATUS, APPT_STATUS, RECUR, MAX_STEP_DEPTH,
  isClosed, isOverdue, deadlinePassed, waitingLate, nextStep, nextText, stepProgress, mapStep, dropStep, moveStep, newStep,
  newWaiting, newAppointment, describeHistory, sectorsOf, rescheduleCount, hist,
} from './lib/model.js';
import { download, exportLoopsJSON } from './lib/backup.js';

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// Loop table
// ---------------------------------------------------------------------------
export function rowActions(l, { actions, ui, sectors }) {
  const t = today();
  if (isClosed(l))
    return [
      { label: 'Open details', icon: 'chevR', onClick: () => ui.openLoop(l.id) },
      { label: 'Reopen', icon: 'undo', onClick: () => { actions.reopenLoop(l.id); ui.toast(`Reopened “${l.title}”. Its earlier history is kept.`); } },
    ];
  return [
    { label: 'Open details', icon: 'chevR', onClick: () => ui.openLoop(l.id) },
    l.plannedFor === t
      ? { label: 'Remove from today', icon: 'x', onClick: () => actions.updateLoop(l.id, { plannedFor: null }) }
      : { label: 'Add to today', icon: 'sun', onClick: () => { actions.updateLoop(l.id, { plannedFor: t }); ui.toast('Added to Today’s Plan.'); } },
    { label: 'Reschedule…', icon: 'calendar', onClick: () => ui.reschedule(l.id) },
    '-',
    ...OPEN_STAGES.filter((s) => s !== l.stage).map((s) => ({ label: `Move to ${STAGE_LABEL[s]}`, onClick: () => { actions.setStage(l.id, s); if (s === 'WAITING') ui.openLoop(l.id); } })),
    '-',
    { label: 'Close…', icon: 'checkc', onClick: () => ui.closeLoop(l.id) },
    { label: 'Export this loop', icon: 'download', onClick: () => download(`loop-${l.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.json`, exportLoopsJSON([l], sectors)) },
  ];
}

const SORTS = {
  title: (a, b) => a.title.localeCompare(b.title),
  sector: (a, b, ctx) => (ctx.sn(a) || '~').localeCompare(ctx.sn(b) || '~'),
  stage: (a, b) => OPEN_STAGES.indexOf(a.stage) - OPEN_STAGES.indexOf(b.stage),
  expected: (a, b) => (a.expectedDate || '9').localeCompare(b.expectedDate || '9'),
  deadline: (a, b) => (a.deadline || '9').localeCompare(b.deadline || '9'),
  priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  closed: (a, b) => (b.closedAt || '').localeCompare(a.closedAt || ''),
  since: (a, b) => (a.waiting?.since || '9').localeCompare(b.waiting?.since || '9'),
};

export function LoopList({ loops, mode = 'default', filters = true, initial = {}, empty, onFiltered, defaultSort = 'expected' }) {
  const { sectors, settings, actions } = useStore();
  const ui = useUI();
  const [f, setF] = useState({ sector: initial.sector || '', stage: initial.stage || '', priority: '', q: '' });
  const [sort, setSort] = useState({ key: mode === 'closed' ? 'closed' : mode === 'waiting' ? 'since' : defaultSort, dir: 1 });
  const t = today();
  const live = sectors.filter((s) => !s.archived);
  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const ctx = { sn: (l) => sectors.find((s) => s.id === l.sectorIds[0])?.name };
    const out = loops.filter(
      (l) =>
        (!f.sector || l.sectorIds.includes(f.sector)) &&
        (!f.stage || l.stage === f.stage) &&
        (!f.priority || l.priority === f.priority) &&
        (!q || [l.title, l.description, l.notes, l.nextAction, l.closureReason, l.waiting?.what, l.waiting?.who, ...(l.tags || []), ...l.steps.map((s) => s.title)].some((x) => x && x.toLowerCase().includes(q)))
    );
    return out.sort((a, b) => SORTS[sort.key](a, b, ctx) * sort.dir || SORTS.priority(a, b));
  }, [loops, f, sort, sectors]);
  useEffect(() => { onFiltered?.(rows); }, [rows]);

  const th = (k, label) => (
    <th aria-sort={sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      <button className="th-btn" onClick={() => setSort({ key: k, dir: sort.key === k ? -sort.dir : 1 })}>
        {label}{sort.key === k && <Icon name={sort.dir > 0 ? 'chevD' : 'chevU'} size={12} />}
      </button>
    </th>
  );
  const sel = (key, label, opts) => (
    <select aria-label={label} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })}>
      <option value="">{label}</option>
      {opts.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
    </select>
  );
  const filtered = f.sector || f.stage || f.priority || f.q;

  return (
    <div className="loop-list">
      {filters && (
        <div className="filters">
          <span className="search"><Icon name="search" size={15} /><input id="loop-search" type="search" placeholder="Search loops" aria-label="Search loops" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></span>
          {sel('sector', 'All sectors', live.map((s) => [s.id, s.name]))}
          {mode === 'default' && sel('stage', 'All stages', OPEN_STAGES.map((s) => [s, STAGE_LABEL[s]]))}
          {sel('priority', 'Any priority', PRIORITIES.map((p) => [p, cap(p)]))}
          {mode === 'default' && (
            <select aria-label="Sort by" value={sort.key} onChange={(e) => setSort({ key: e.target.value, dir: 1 })}>
              {[['expected', 'Sort: expected date'], ['deadline', 'Sort: deadline'], ['priority', 'Sort: priority'], ['stage', 'Sort: stage'], ['sector', 'Sort: sector'], ['title', 'Sort: title']].map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          )}
          {filtered && <button className="btn ghost sm" onClick={() => setF({ sector: '', stage: '', priority: '', q: '' })}>Clear</button>}
        </div>
      )}
      {!rows.length ? (
        filtered ? <Empty icon="search" title="Nothing matches these filters">Try clearing a filter or the search.</Empty> : empty || <Empty title="No loops here" />
      ) : (
        <div className="table-wrap">
          <table className={'loops mode-' + mode}>
            <thead>
              {mode === 'waiting' ? (
                <tr>{th('title', 'Loop')}<th>Waiting on</th><th>Depends on</th>{th('since', 'Since')}<th>Response expected</th><th>Next follow-up</th><th aria-label="Actions" /></tr>
              ) : mode === 'closed' ? (
                <tr>{th('title', 'Loop')}{th('sector', 'Sector')}<th>Resolution</th>{th('closed', 'Closed')}<th>Reason</th><th aria-label="Actions" /></tr>
              ) : (
                <tr>{th('title', 'Loop')}{th('sector', 'Sector')}{th('stage', 'Stage')}{th('expected', 'Expected')}<th>Next step / Waiting on</th>{th('priority', 'Priority')}<th aria-label="Actions" /></tr>
              )}
            </thead>
            <tbody>
              {rows.map((l) => {
                const secs = sectorsOf(l, sectors);
                const sp = stepProgress(l);
                const title = (
                  <td className="c-title">
                    <button className="row-title" onClick={() => ui.openLoop(l.id)}>{l.title}</button>
                    {l.sample && <span className="chip sample">Sample</span>}
                    {l.recurrence?.freq !== 'none' && <span className="chip" title="Repeats">↻</span>}
                    {sp.total > 0 && <span className="muted steps-count">{sp.done}/{sp.total}</span>}
                  </td>
                );
                const act = (
                  <td className="c-act">
                    {!isClosed(l) && <button className="icon-btn" title="Close this loop…" aria-label={`Close ${l.title}`} onClick={() => ui.closeLoop(l.id)}><Icon name="checkc" /></button>}
                    <Menu label={`Actions for ${l.title}`} items={rowActions(l, { actions, ui, sectors })} />
                  </td>
                );
                if (mode === 'waiting') {
                  const w = l.waiting || {};
                  return (
                    <tr key={l.id}>
                      {title}
                      <td data-l="Waiting on">{w.what || <span className="muted">Not recorded</span>}</td>
                      <td data-l="Depends on">{w.who || '—'}<span className="sub">{w.type}</span></td>
                      <td data-l="Since">{w.since ? <>{fmtDate(w.since, settings)}<span className="sub">{Math.max(0, diffDays(t, w.since))} days</span></> : '—'}</td>
                      <td data-l="Response expected">{w.expectedResponse ? fmtDate(w.expectedResponse, settings) : '—'}{waitingLate(l, t) && <span className="chip review">Past expected date</span>}</td>
                      <td data-l="Follow-up">{w.followUp ? <>{fmtDate(w.followUp, settings)}<span className="sub">{relDay(w.followUp, t)}</span></> : <span className="muted">None set</span>}</td>
                      {act}
                    </tr>
                  );
                }
                if (mode === 'closed')
                  return (
                    <tr key={l.id}>
                      {title}
                      <td data-l="Sector"><SectorTags sectors={secs} /></td>
                      <td data-l="Resolution"><StageBadge loop={l} /></td>
                      <td data-l="Closed">{fmtDate(l.actualCompletionDate, settings)}</td>
                      <td data-l="Reason" className="c-next">{l.closureReason || <span className="muted">—</span>}</td>
                      {act}
                    </tr>
                  );
                return (
                  <tr key={l.id}>
                    {title}
                    <td data-l="Sector"><SectorTags sectors={secs} /></td>
                    <td data-l="Stage"><StageBadge loop={l} /></td>
                    <td data-l="Expected" className="c-dates">
                      <span>{l.expectedDate ? fmtDate(l.expectedDate, settings) : <span className="muted">—</span>}
                        {isOverdue(l, t) && <span className="chip review" title="The expected date has passed. Reschedule or resolve when ready.">Review</span>}</span>
                      {l.deadline && <span className={'deadline' + (deadlinePassed(l, t) ? ' late' : '')} title="Deadline"><Icon name="flag" size={12} />{fmtDate(l.deadline, settings)}</span>}
                    </td>
                    <td data-l="Next" className="c-next">{nextText(l) || <span className="muted">No next step yet</span>}</td>
                    <td data-l="Priority"><span className={'prio p-' + l.priority}>{cap(l.priority)}</span></td>
                    {act}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Capture
// ---------------------------------------------------------------------------
export function QuickCapture({ preset = {}, onClose }) {
  const { sectors, actions } = useStore();
  const ui = useUI();
  const [title, setTitle] = useState('');
  const [sector, setSector] = useState(preset.sector || '');
  const [description, setDescription] = useState('');
  const [err, setErr] = useState('');
  const save = (open) => {
    if (!title.trim()) return setErr('Give the loop a title — a few words is enough.');
    const l = actions.createLoop({ title: title.trim(), description: description.trim(), sectorIds: sector ? [sector] : [], expectedDate: preset.expectedDate || null });
    onClose();
    if (open) ui.openLoop(l.id);
    else ui.toast(`Captured “${l.title}”.`, { label: 'Open', onClick: () => ui.openLoop(l.id) });
  };
  return (
    <Modal title="Quick Capture" onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>Cancel</button>
      <button className="btn" onClick={() => save(true)}>Capture &amp; add details</button>
      <button className="btn primary" onClick={() => save(false)}>Capture</button>
    </>}>
      <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="form">
        <Field label="What's the loop?" warn={err}>
          <input data-autofocus value={title} onChange={(e) => { setTitle(e.target.value); setErr(''); }} placeholder="e.g. Renew passport" maxLength={200} aria-invalid={!!err} />
        </Field>
        <Field label="Sector (optional)">
          <select value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">No sector yet</option>
            {sectors.filter((s) => !s.archived).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Description (optional)"><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        {preset.expectedDate && <p className="muted small">Expected completion will be set to {preset.expectedDate}.</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Close dialog
// ---------------------------------------------------------------------------
export function CloseDialog({ id, onClose }) {
  const { loops, actions } = useStore();
  const ui = useUI();
  const l = loops.find((x) => x.id === id);
  const [resolution, setResolution] = useState('COMPLETED');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(today());
  const [mins, setMins] = useState(l?.actualMinutes || '');
  if (!l) return null;
  const done = () => {
    const { next } = actions.closeLoop(id, { resolution, reason: reason.trim(), date, actualMinutes: mins });
    onClose();
    ui.toast(`Closed “${l.title}” — ${RESOLUTIONS[resolution].label.toLowerCase()}.` + (next ? ' Next occurrence opened.' : ''), { label: 'Undo', onClick: () => { actions.reopenLoop(id, l.stage); if (next) actions.deleteLoop(next.id); } });
  };
  return (
    <Modal title="Close this loop" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={done}>Close loop</button></>}>
      <p className="lede">“{l.title}”</p>
      <fieldset className="choices">
        <legend>How did it resolve?</legend>
        {Object.entries(RESOLUTIONS).map(([k, r], i) => (
          <label key={k} className={'choice' + (resolution === k ? ' on' : '')}>
            <input type="radio" name="res" data-autofocus={i === 0 ? '' : undefined} checked={resolution === k} onChange={() => setResolution(k)} />
            <span><strong>{r.label}</strong><small>{r.hint}</small></span>
          </label>
        ))}
      </fieldset>
      <div className="form">
        <Field label="Reason or note (optional)"><textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={resolution === 'COMPLETED' ? 'Anything worth remembering' : 'Why this was the right call'} /></Field>
        <div className="grid2">
          <Field label="Date resolved"><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} /></Field>
          {resolution === 'COMPLETED' && <Field label="Actual effort (minutes)" hint={l.estMinutes ? `Estimated: ${fmtMin(l.estMinutes)}` : 'Optional'}><input type="number" min="0" value={mins} onChange={(e) => setMins(e.target.value)} /></Field>}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Reschedule dialog
// ---------------------------------------------------------------------------
export function RescheduleDialog({ id, onClose }) {
  const { loops, settings, actions } = useStore();
  const ui = useUI();
  const l = loops.find((x) => x.id === id);
  const t = today();
  const [date, setDate] = useState(l?.expectedDate && l.expectedDate > t ? l.expectedDate : addDays(t, 1));
  const [note, setNote] = useState('');
  if (!l) return null;
  const quick = [['Tomorrow', addDays(t, 1)], ['In 3 days', addDays(t, 3)], ['In a week', addDays(t, 7)], ['In two weeks', addDays(t, 14)], ['In a month', addMonths(t, 1)]];
  const save = () => {
    actions.updateLoop(id, { expectedDate: date }, { note: note.trim() || undefined });
    onClose();
    ui.toast(`“${l.title}” now expected ${fmtDate(date, settings, { dow: true })}.`);
  };
  return (
    <Modal title="Reschedule" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!date}>Save new date</button></>}>
      <p className="lede">“{l.title}”</p>
      <p className="muted small">
        {l.expectedDate ? `Currently expected ${fmtDate(l.expectedDate, settings)} (${relDay(l.expectedDate, t)}).` : 'No expected date yet.'}
        {l.deadline ? ` The deadline stays at ${fmtDate(l.deadline, settings)}.` : ''}
        {rescheduleCount(l) > 0 ? ` Rescheduled ${rescheduleCount(l)} time${rescheduleCount(l) > 1 ? 's' : ''} so far.` : ''}
      </p>
      <div className="quick-dates">{quick.map(([n, d]) => <button key={n} className={'btn sm' + (date === d ? ' primary' : '')} onClick={() => setDate(d)}>{n}</button>)}</div>
      <div className="form">
        <Field label="New expected completion date" warn={l.deadline && date > l.deadline ? 'This is after the deadline.' : ''}><input type="date" data-autofocus value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Why it moved (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Helps future you spot patterns" /></Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Steps editor
// ---------------------------------------------------------------------------
function StepRow({ step, depth, nextId, settings, onChange, onRemove, onMove, onAddChild }) {
  const [open, setOpen] = useState(false);
  const [child, setChild] = useState(null);
  return (
    <li className={'step s-' + step.status}>
      <div className="step-row">
        <input type="checkbox" checked={step.status === 'done'} aria-label={`Mark “${step.title}” done`} onChange={(e) => onChange(step.id, { status: e.target.checked ? 'done' : 'todo' }, true)} />
        <BlurInput className="step-title" value={step.title} aria-label="Step title" onCommit={(v) => v && onChange(step.id, { title: v })} />
        {step.id === nextId && <span className="chip next">Next</span>}
        {step.status === 'blocked' && <span className="chip stuck">Stuck here</span>}
        <select className="step-status" aria-label="Step status" value={step.status} onChange={(e) => onChange(step.id, { status: e.target.value }, true)}>
          {Object.entries(STEP_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Menu label="Step actions" items={[
          { label: open ? 'Hide details' : 'Dates, estimate & notes', icon: 'calendar', onClick: () => setOpen(!open) },
          depth < MAX_STEP_DEPTH && { label: 'Add sub-step', icon: 'plus', onClick: () => setChild('') },
          { label: 'Move up', icon: 'chevU', onClick: () => onMove(step.id, -1) },
          { label: 'Move down', icon: 'chevD', onClick: () => onMove(step.id, 1) },
          '-',
          { label: 'Delete step', icon: 'trash', danger: true, onClick: () => onRemove(step) },
        ]} />
      </div>
      {(open || step.expectedDate || step.estMinutes || step.notes) && (
        <div className="step-detail">
          {open ? (
            <>
              <Field label="Expected"><input type="date" value={step.expectedDate || ''} onChange={(e) => onChange(step.id, { expectedDate: e.target.value || null })} /></Field>
              <Field label="Estimate (min)"><BlurInput number value={step.estMinutes} onCommit={(v) => onChange(step.id, { estMinutes: v })} /></Field>
              <Field label="Notes" className="grow"><BlurInput value={step.notes} onCommit={(v) => onChange(step.id, { notes: v })} /></Field>
            </>
          ) : (
            <button className="step-meta" onClick={() => setOpen(true)}>
              {[step.expectedDate && fmtDate(step.expectedDate, settings), step.estMinutes && '≈ ' + fmtMin(step.estMinutes), step.notes].filter(Boolean).join(' · ')}
            </button>
          )}
        </div>
      )}
      {(step.children?.length > 0 || child !== null) && (
        <ul className="steps">
          {step.children.map((c) => <StepRow key={c.id} step={c} depth={depth + 1} {...{ nextId, settings, onChange, onRemove, onMove, onAddChild }} />)}
          {child !== null && (
            <li className="step-add">
              <input autoFocus value={child} placeholder="Sub-step" aria-label="New sub-step" onChange={(e) => setChild(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && child.trim()) { onAddChild(step.id, child.trim()); setChild(''); } if (e.key === 'Escape') { e.preventDefault(); setChild(null); } }}
                onBlur={() => { if (child.trim()) onAddChild(step.id, child.trim()); setChild(null); }} />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

function Steps({ loop }) {
  const { settings, actions } = useStore();
  const ui = useUI();
  const [draft, setDraft] = useState('');
  const set = (steps, history) => actions.updateLoop(loop.id, { steps }, { history });
  const find = (id, steps = loop.steps) => { for (const s of steps) { if (s.id === id) return s; const c = find(id, s.children || []); if (c) return c; } return null; };
  const onChange = (id, patch, log) => {
    const s = find(id);
    set(mapStep(loop.steps, id, (x) => ({ ...x, ...patch })), log && patch.status !== s.status ? [hist('step', { note: `Step “${s.title}”: ${STEP_STATUS[s.status]} → ${STEP_STATUS[patch.status]}` })] : undefined);
  };
  const add = () => { if (!draft.trim()) return; set([...loop.steps, newStep(draft.trim())]); setDraft(''); };
  const ns = nextStep(loop);
  const sp = stepProgress(loop);
  return (
    <section className="sec">
      <h3>Steps {sp.total > 0 && <span className="muted">{sp.done} of {sp.total} done</span>}</h3>
      {ns && <p className="next-line"><Icon name="chevR" size={14} /> Next actionable step: <strong>{ns.title}</strong></p>}
      {loop.steps.length > 0 && (
        <ul className="steps">
          {loop.steps.map((s) => (
            <StepRow key={s.id} step={s} depth={0} nextId={ns?.id} settings={settings} onChange={onChange}
              onMove={(id, dir) => set(moveStep(loop.steps, id, dir))}
              onAddChild={(id, title) => set(mapStep(loop.steps, id, (x) => ({ ...x, children: [...(x.children || []), newStep(title)] })))}
              onRemove={async (st) => { if (!st.children?.length || (await ui.confirm({ title: 'Delete this step?', body: `“${st.title}” and its ${st.children.length} sub-step(s) will be removed.`, confirmLabel: 'Delete', danger: true }))) set(dropStep(loop.steps, st.id), [hist('step', { note: `Step removed: “${st.title}”` })]); }} />
          ))}
        </ul>
      )}
      <div className="step-add">
        <input value={draft} placeholder="Add a step and press Enter" aria-label="New step" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn sm" onClick={add} disabled={!draft.trim()}>Add</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Loop detail panel
// ---------------------------------------------------------------------------
export function LoopPanel({ id, onClose }) {
  const { loops, sectors, settings, actions } = useStore();
  const ui = useUI();
  const l = loops.find((x) => x.id === id);
  const [note, setNote] = useState('');
  const [allHist, setAllHist] = useState(false);
  useEffect(() => { if (!l) onClose(); }, [l]);
  if (!l) return null;
  const t = today();
  const up = (patch, opts) => actions.updateLoop(id, patch, opts);
  const closed = isClosed(l);
  const live = sectors.filter((s) => !s.archived || l.sectorIds.includes(s.id));
  const clinical = sectorsOf(l, sectors).some((s) => s.clinical);
  const w = l.waiting;
  const ap = l.appointment;
  const upW = (p) => up({ waiting: { ...(w || newWaiting()), ...p } });
  const upA = (p) => up({ appointment: { ...(ap || newAppointment()), ...p } });
  const dateIn = (key, label, extra = {}) => (
    <Field label={label} {...extra}><input type="date" value={l[key] || ''} onChange={(e) => up({ [key]: e.target.value || null })} /></Field>
  );
  const history = [...l.history].reverse();
  const del = async () => {
    if (await ui.confirm({ title: 'Delete this loop permanently?', body: `“${l.title}” and its whole history will be erased. If you just don't want to do it, closing it as “Decided not to” keeps the record.`, confirmLabel: 'Delete permanently', danger: true })) {
      actions.deleteLoop(id);
      ui.toast('Loop deleted.');
    }
  };

  return (
    <Modal drawer title="Loop details" onClose={onClose}>
      <div className="panel">
        <BlurInput className="panel-title" aria-label="Loop title" value={l.title} onCommit={(v) => v && up({ title: v })} />
        {l.sample && <p className="banner soft"><span className="chip sample">Sample</span> This is sample data, here to show how Loop works.</p>}

        <section className="sec">
          {closed ? (
            <div className="closed-box">
              <StageBadge loop={l} />
              <span>Closed {fmtDate(l.actualCompletionDate, settings)}{l.closureReason ? ` — ${l.closureReason}` : ''}</span>
              <button className="btn sm" onClick={() => actions.reopenLoop(id)}><Icon name="undo" size={14} /> Reopen</button>
            </div>
          ) : (
            <div className="stage-row">
              <div className="seg" role="group" aria-label="Stage">
                {OPEN_STAGES.map((s) => (
                  <button key={s} className={'stage-' + s.toLowerCase() + (l.stage === s ? ' on' : '')} aria-pressed={l.stage === s} onClick={() => actions.setStage(id, s)}>{STAGE_LABEL[s]}</button>
                ))}
              </div>
              <button className="btn sm primary" onClick={() => ui.closeLoop(id)}><Icon name="checkc" size={14} /> Close…</button>
            </div>
          )}
          {isOverdue(l, t) && (
            <div className="banner review">
              <span>The expected date ({fmtDate(l.expectedDate, settings)}) has passed. No verdict — it just needs a new date or a decision.</span>
              <span className="row-btns">
                <button className="btn sm" onClick={() => up({ expectedDate: addDays(t, 1) })}>Tomorrow</button>
                <button className="btn sm" onClick={() => up({ expectedDate: addDays(t, 7) })}>Next week</button>
                <button className="btn sm" onClick={() => ui.reschedule(id)}>Pick a date…</button>
              </span>
            </div>
          )}
        </section>

        <section className="sec">
          <h3>Next action</h3>
          <BlurInput value={l.nextAction} aria-label="Next action" placeholder={nextStep(l) ? `From steps: ${nextStep(l).title}` : 'The very next physical thing to do'} onCommit={(v) => up({ nextAction: v })} />
        </section>

        {(l.stage === 'WAITING' || w?.what) && (
          <section className="sec tint-wait">
            <h3>Waiting on</h3>
            <div className="form grid2">
              <Field label="What is being awaited"><BlurInput value={w?.what} placeholder="e.g. Signed form" onCommit={(v) => upW({ what: v })} /></Field>
              <Field label="Who or what it depends on"><BlurInput value={w?.who} placeholder="e.g. Finance office" onCommit={(v) => upW({ who: v })} /></Field>
              <Field label="Kind"><select value={w?.type || WAIT_TYPES[0]} onChange={(e) => upW({ type: e.target.value })}>{WAIT_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Waiting since"><input type="date" value={w?.since || ''} max={t} onChange={(e) => upW({ since: e.target.value || null })} /></Field>
              <Field label="Response expected by" warn={waitingLate(l, t) ? 'This date has passed.' : ''}><input type="date" value={w?.expectedResponse || ''} onChange={(e) => upW({ expectedResponse: e.target.value || null })} /></Field>
              <Field label="Next follow-up" hint="Loop will mention it on this day only."><input type="date" value={w?.followUp || ''} onChange={(e) => upW({ followUp: e.target.value || null })} /></Field>
            </div>
            {l.stage === 'WAITING' && (
              <div className="row-btns">
                <button className="btn sm" onClick={() => { actions.updateLoop(id, { waiting: { ...w, followUp: addDays(t, 7) } }, { history: [hist('note', { note: 'Followed up; next follow-up in a week' })] }); ui.toast('Follow-up logged. Next one in a week.'); }}>I followed up today</button>
                <button className="btn sm" onClick={() => actions.setStage(id, 'ACTIVE', 'Received what I was waiting for')}>It arrived — back to Active</button>
              </div>
            )}
          </section>
        )}

        <section className="sec">
          <h3>Details</h3>
          <div className="form">
            <Field label="Description"><BlurInput multiline value={l.description} onCommit={(v) => up({ description: v })} /></Field>
            <div className="field">
              <span className="field-label">Sectors</span>
              <div className="chips-pick">
                {live.map((s) => {
                  const on = l.sectorIds.includes(s.id);
                  return <button key={s.id} className={'pick' + (on ? ' on' : '')} aria-pressed={on} style={on ? { borderColor: s.color, color: s.color } : null} onClick={() => up({ sectorIds: on ? l.sectorIds.filter((x) => x !== s.id) : [...l.sectorIds, s.id] })}><SectorDot color={s.color} />{s.name}</button>;
                })}
              </div>
            </div>
            <div className="grid2">
              <Field label="Priority"><select value={l.priority} onChange={(e) => up({ priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{cap(p)}</option>)}</select></Field>
              <Field label="Tags" hint="Comma-separated"><BlurInput value={(l.tags || []).join(', ')} onCommit={(v) => up({ tags: v.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
            </div>
          </div>
        </section>

        <section className="sec">
          <h3>Schedule</h3>
          <div className="form grid2">
            {dateIn('startDate', 'Start date', { warn: l.startDate && l.expectedDate && l.startDate > l.expectedDate ? 'Starts after the expected completion.' : '' })}
            {dateIn('expectedDate', 'Expected completion', { hint: 'Your forecast of when you intend to finish.', warn: l.deadline && l.expectedDate > l.deadline ? 'This is after the deadline.' : '' })}
            {dateIn('deadline', 'Deadline', { hint: 'The date it must be resolved by, if there is one.' })}
            <Field label="Plan for today"><button className={'btn sm' + (l.plannedFor === t ? ' primary' : '')} aria-pressed={l.plannedFor === t} onClick={() => up({ plannedFor: l.plannedFor === t ? null : t })} disabled={closed}>{l.plannedFor === t ? 'In Today’s Plan ✓' : 'Add to Today’s Plan'}</button></Field>
            <Field label="Start time (optional)"><input type="time" value={l.startTime || ''} onChange={(e) => up({ startTime: e.target.value || null })} /></Field>
            <Field label="End time (optional)" warn={l.startTime && l.endTime && l.endTime <= l.startTime ? 'Ends before it starts.' : ''}><input type="time" value={l.endTime || ''} onChange={(e) => up({ endTime: e.target.value || null })} /></Field>
            <Field label="Reminder" hint="Shown in the app; browser notification if enabled and Loop is open."><input type="datetime-local" value={l.reminderAt || ''} onChange={(e) => up({ reminderAt: e.target.value || null })} /></Field>
            <Field label="Repeats" hint={l.recurrence.freq !== 'none' ? 'Completing it opens the next occurrence.' : ''}>
              <span className="inline">
                <select value={l.recurrence.freq} onChange={(e) => up({ recurrence: { ...l.recurrence, freq: e.target.value } })}>{Object.entries(RECUR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                {l.recurrence.freq !== 'none' && <><span className="muted">every</span><input className="tiny" type="number" min="1" max="99" aria-label="Repeat interval" value={l.recurrence.interval} onChange={(e) => up({ recurrence: { ...l.recurrence, interval: Math.max(1, Number(e.target.value) || 1) } })} /></>}
              </span>
            </Field>
          </div>
        </section>

        <Steps loop={l} />

        {(clinical || ap) && (
          <section className="sec">
            <h3>Appointment tracking</h3>
            <p className="banner soft">Administrative scheduling only. Use a non-identifying reference — no patient names, diagnoses or clinical notes. Loop is not a clinical record.</p>
            {ap ? (
              <div className="form grid2">
                <Field label="Reference (non-identifying)"><BlurInput value={ap.ref} placeholder="e.g. C-014" maxLength={24} onCommit={(v) => upA({ ref: v })} /></Field>
                <Field label="Status"><select value={ap.status} onChange={(e) => upA({ status: e.target.value })}>{APPT_STATUS.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Appointment date"><input type="date" value={ap.date || ''} onChange={(e) => upA({ date: e.target.value || null })} /></Field>
                <Field label="Time"><input type="time" value={ap.time || ''} onChange={(e) => upA({ time: e.target.value || null })} /></Field>
                <Field label="Expected follow-up date"><input type="date" value={ap.followUpDate || ''} onChange={(e) => upA({ followUpDate: e.target.value || null })} /></Field>
                <Field label="Administrative follow-up"><BlurInput value={ap.adminFollowUp} placeholder="e.g. Book review slot" onCommit={(v) => upA({ adminFollowUp: v })} /></Field>
                <div><button className="btn sm ghost" onClick={() => up({ appointment: null })}>Remove appointment tracking</button></div>
              </div>
            ) : <button className="btn sm" onClick={() => upA({})}><Icon name="plus" size={14} /> Track an appointment</button>}
          </section>
        )}

        <section className="sec">
          <h3>Effort &amp; commitment</h3>
          <div className="form grid3">
            <Field label="Estimated (min)"><BlurInput number value={l.estMinutes} onCommit={(v) => up({ estMinutes: v })} /></Field>
            <Field label="Actual (min)"><BlurInput number value={l.actualMinutes} onCommit={(v) => up({ actualMinutes: v })} /></Field>
            <Field label="Commitment weight" hint="1 = normal. 0 = doesn't count toward monthly progress."><input type="number" min="0" max="5" step="0.5" value={l.weight ?? 1} onChange={(e) => up({ weight: Math.min(5, Math.max(0, Number(e.target.value) || 0)) })} /></Field>
          </div>
        </section>

        <section className="sec">
          <h3>Notes</h3>
          <BlurInput multiline rows={4} aria-label="Notes" value={l.notes} placeholder="Anything that helps you pick the thread back up" onCommit={(v) => up({ notes: v })} />
        </section>

        <section className="sec">
          <h3>History <span className="muted">{l.history.length} entries</span></h3>
          <div className="step-add">
            <input value={note} placeholder="Add a note to the history" aria-label="History note" onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) { actions.addNote(id, note.trim()); setNote(''); } }} />
            <button className="btn sm" disabled={!note.trim()} onClick={() => { actions.addNote(id, note.trim()); setNote(''); }}>Add</button>
          </div>
          <ol className="timeline">
            {(allHist ? history : history.slice(0, 8)).map((h, i) => (
              <li key={i} className={'h-' + h.type}><span className="when">{fmtStamp(h.at, settings)}</span><span>{describeHistory(h, settings, sectors)}</span></li>
            ))}
          </ol>
          {history.length > 8 && <button className="btn sm ghost" onClick={() => setAllHist(!allHist)}>{allHist ? 'Show less' : `Show all ${history.length}`}</button>}
        </section>

        <section className="sec panel-foot">
          <span className="muted small">Created {fmtStamp(l.createdAt, settings)} · saved automatically</span>
          <span className="row-btns">
            <button className="btn sm" onClick={() => download(`loop-${l.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.json`, exportLoopsJSON([l], sectors))}><Icon name="download" size={14} /> Export</button>
            <button className="btn sm danger" onClick={del}><Icon name="trash" size={14} /> Delete</button>
          </span>
        </section>
      </div>
    </Modal>
  );
}
