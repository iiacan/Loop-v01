import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { useUI, Icon, Empty, Field } from '../ui.jsx';
import { RewardList } from './Home.jsx';
import { today, monthKey, monthLabel, shiftMonth, fmtStamp, nowISO } from '../lib/dates.js';
import { isClosed, RESOLUTIONS, uid, hist } from '../lib/model.js';
import { newPlan, planProgress, needsReview } from '../lib/logic.js';

export function RewardEditor({ value, onSave, onCancel, saveLabel = 'Save rewards' }) {
  const [rows, setRows] = useState(() => (value.length ? value : [{ threshold: 50, title: '' }]).map((r) => ({ ...r, key: r.id || uid() })));
  const [err, setErr] = useState('');
  const set = (key, p) => { setRows(rows.map((r) => (r.key === key ? { ...r, ...p } : r))); setErr(''); };
  const save = () => {
    const out = rows.filter((r) => String(r.title).trim()).map((r) => ({ id: r.id || uid(), claimedAt: r.claimedAt || null, threshold: Math.round(Number(r.threshold)), title: String(r.title).trim() }));
    if (out.some((r) => !(r.threshold >= 1 && r.threshold <= 100))) return setErr('Each milestone needs a percentage between 1 and 100.');
    if (new Set(out.map((r) => r.threshold)).size !== out.length) return setErr('Two rewards share the same milestone.');
    onSave(out.sort((a, b) => a.threshold - b.threshold));
  };
  return (
    <div className="reward-edit">
      {rows.map((r) => (
        <div key={r.key} className="reward-row">
          <input type="number" min="1" max="100" aria-label="Milestone percent" value={r.threshold} onChange={(e) => set(r.key, { threshold: e.target.value })} /><span className="muted">%</span>
          <input aria-label="Reward" placeholder="Something you'd actually enjoy" value={r.title} maxLength={80} onChange={(e) => set(r.key, { title: e.target.value })} />
          <button className="icon-btn" aria-label="Remove reward" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}><Icon name="x" size={15} /></button>
        </div>
      ))}
      {err && <p className="field-warn">{err}</p>}
      <div className="row-btns">
        <button className="btn sm ghost" onClick={() => setRows([...rows, { key: uid(), threshold: Math.min(100, (Number(rows[rows.length - 1]?.threshold) || 0) + 25), title: '' }])}><Icon name="plus" size={14} /> Add milestone</button>
        {onCancel && <button className="btn sm ghost" onClick={onCancel}>Cancel</button>}
        <button className="btn sm primary" onClick={save}>{saveLabel}</button>
      </div>
    </div>
  );
}

function PlanSetup({ month }) {
  const { loops, settings, actions } = useStore();
  const ui = useUI();
  const open = loops.filter((l) => !isClosed(l));
  const [picked, setPicked] = useState(() => new Set(open.filter((l) => (l.weight ?? 1) > 0).map((l) => l.id)));
  const toggle = (id) => { const n = new Set(picked); n.has(id) ? n.delete(id) : n.add(id); setPicked(n); };
  const future = month > monthKey();
  return (
    <section className="card">
      <div className="card-head"><h2>Set the commitment pool for {monthLabel(month)}</h2></div>
      <p className="muted">The pool is the set of loops this month’s progress is measured against. It is fixed once set: loops you create later only count if you add them deliberately, and every change after that is logged.</p>
      {open.length ? (
        <>
          <div className="row-btns"><button className="btn sm ghost" onClick={() => setPicked(new Set(open.map((l) => l.id)))}>Select all</button><button className="btn sm ghost" onClick={() => setPicked(new Set())}>Select none</button><span className="muted small">{picked.size} of {open.length} selected</span></div>
          <ul className="pick-list">
            {open.map((l) => (
              <li key={l.id}><label className="check"><input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} /> <span>{l.title}</span>{l.sample && <span className="chip sample">Sample</span>}<span className="muted small">weight {l.weight ?? 1}</span></label></li>
            ))}
          </ul>
        </>
      ) : <Empty title="No open loops to commit to">Capture some loops first; you can still set rewards now.</Empty>}
      <h3>Rewards</h3>
      <RewardEditor value={settings.rewardDefaults || []} saveLabel={future ? `Save plan for ${monthLabel(month)}` : 'Establish this month’s pool'} onSave={(rewards) => {
        actions.savePlan(newPlan(month, open.filter((l) => picked.has(l.id)), rewards));
        ui.toast(`Plan set for ${monthLabel(month)}.`);
      }} />
    </section>
  );
}

const STATUS = { open: 'Open', completed: 'Completed', resolved: 'Resolved', archived: 'Archived — not counted', deleted: 'Deleted — not counted' };
const DECISIONS = { carry: 'Carry forward', DECIDED_NOT_TO: 'Close as decided not to', SUPERSEDED: 'Supersede', ARCHIVED: 'Archive' };

function Review({ plan }) {
  const { loops, actions } = useStore();
  const ui = useUI();
  const pending = needsReview(plan, loops);
  const [choice, setChoice] = useState({});
  if (!pending.length) return null;
  const apply = () => {
    const mk = monthKey();
    const decided = pending.filter((i) => choice[i.loopId]);
    for (const i of decided) {
      const c = choice[i.loopId];
      if (c === 'carry') {
        actions.ensurePlan(mk);
        actions.changePlan(mk, (p) => (p.pool.some((x) => x.loopId === i.loopId) ? p : { ...p, pool: [...p.pool, { loopId: i.loopId, title: i.loop.title, weight: i.weight, addedAt: nowISO(), original: false, carriedFrom: plan.id }] }), `Carried forward from ${monthLabel(plan.id)}: “${i.loop.title}”`);
        actions.updateLoop(i.loopId, {}, { history: [hist('note', { note: `Carried forward from ${monthLabel(plan.id)} at month-end review` })] });
      } else actions.closeLoop(i.loopId, { resolution: c, reason: `Month-end review of ${monthLabel(plan.id)}` });
    }
    const fresh = actions.getState().plans.find((p) => p.id === plan.id);
    actions.savePlan({ ...fresh, review: { at: nowISO(), decisions: { ...(fresh.review?.decisions || {}), ...Object.fromEntries(decided.map((i) => [i.loopId, choice[i.loopId]])) } } });
    ui.toast(`${decided.length} decision${decided.length === 1 ? '' : 's'} recorded.`);
    setChoice({});
  };
  return (
    <section className="card review-card">
      <div className="card-head"><h2>Month-end review — {monthLabel(plan.id)}</h2><span className="muted small">{pending.length} unresolved</span></div>
      <p className="muted">These loops were in the pool and weren’t resolved by month end. Choose what happens to each. Carrying forward is not completion — it stays unresolved for {monthLabel(plan.id)} and joins this month’s pool.</p>
      <ul className="review-list">
        {pending.map((i) => (
          <li key={i.loopId}>
            <button className="link" onClick={() => ui.openLoop(i.loopId)}>{i.loop.title}</button>
            <select aria-label={`Decision for ${i.loop.title}`} value={choice[i.loopId] || ''} onChange={(e) => setChoice({ ...choice, [i.loopId]: e.target.value })}>
              <option value="">Decide later</option>
              {Object.entries(DECISIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </li>
        ))}
      </ul>
      <div className="row-btns"><button className="btn primary" disabled={!Object.values(choice).some(Boolean)} onClick={apply}>Apply decisions</button></div>
    </section>
  );
}

function PlanView({ plan }) {
  const { loops, settings, actions } = useStore();
  const ui = useUI();
  const [editing, setEditing] = useState(false);
  const mk = monthKey();
  const prog = planProgress(plan, loops);
  const active = plan.id <= mk;
  const past = plan.id < mk;
  const inPool = new Set(plan.pool.map((p) => p.loopId));
  const outside = loops.filter((l) => !isClosed(l) && !inPool.has(l.id));
  const resolvedN = prog.counted.filter((i) => i.status !== 'open').length;
  const completedN = prog.counted.filter((i) => i.status === 'completed').length;
  const describe = (rs) => rs.map((r) => `${r.threshold}% ${r.title}`).join('; ') || 'none';

  return (
    <>
      <section className="card">
        <div className="card-head"><h2>{monthLabel(plan.id)} {plan.sample && <span className="chip sample">Sample</span>}</h2><strong className="big">{prog.resolutionPct}%</strong></div>
        <div className="progress lg" role="progressbar" aria-valuenow={prog.resolutionPct} aria-valuemin={0} aria-valuemax={100} aria-label="Resolution progress">
          <span style={{ width: prog.resolutionPct + '%' }} />
          {plan.rewards.map((r) => <i key={r.id} className={prog.resolutionPct >= r.threshold ? 'hit' : ''} style={{ left: r.threshold + '%' }} title={`${r.threshold}% — ${r.title}`} />)}
        </div>
        <div className="tiles two">
          <div className="tile"><strong>{prog.resolutionPct}%</strong><small>Resolution — {resolvedN} of {prog.counted.length} pool loops resolved (completed, decided not to, or superseded)</small></div>
          <div className="tile"><strong>{prog.completionPct}%</strong><small>Completion — {completedN} of {prog.counted.length} actually completed</small></div>
        </div>
        <p className="muted small">Rewards unlock on resolution. Progress is weighted by each loop’s commitment weight; archived loops leave the count entirely.</p>
      </section>

      {past && <Review plan={plan} />}

      <section className="card">
        <div className="card-head"><h2><Icon name="gift" /> Rewards</h2>{!editing && <button className="btn sm" onClick={() => setEditing(true)}>Edit rewards</button>}</div>
        {editing ? (
          <>
            {active && <p className="banner soft">This plan is already in force, so the change will be recorded in its log.</p>}
            <RewardEditor value={plan.rewards} onCancel={() => setEditing(false)} onSave={(rewards) => {
              actions.changePlan(plan.id, (p) => ({ ...p, rewards }), `Rewards changed from [${describe(plan.rewards)}] to [${describe(rewards)}]`);
              setEditing(false);
            }} />
          </>
        ) : <RewardList plan={plan} pct={prog.resolutionPct} onClaim={(r) => actions.savePlan({ ...plan, rewards: plan.rewards.map((x) => (x.id === r.id ? { ...x, claimedAt: nowISO() } : x)) })} />}
      </section>

      <section className="card">
        <div className="card-head"><h2>Commitment pool</h2><span className="muted small">{plan.pool.length} loops</span></div>
        {plan.pool.length ? (
          <div className="table-wrap"><table className="mini">
            <thead><tr><th>Loop</th><th>Status</th><th>Weight</th><th>In pool since</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {prog.items.map((i) => (
                <tr key={i.loopId}>
                  <td>{i.loop ? <button className="link" onClick={() => ui.openLoop(i.loopId)}>{i.loop.title}</button> : <span className="muted">{i.title}</span>}</td>
                  <td><span className={'chip st-' + i.status}>{i.status === 'resolved' ? RESOLUTIONS[i.loop.resolution].label : STATUS[i.status]}</span>{plan.review?.decisions?.[i.loopId] === 'carry' && <span className="chip">Carried forward</span>}</td>
                  <td>{past ? i.weight : <input className="tiny" type="number" min="0" max="5" step="0.5" aria-label={`Weight of ${i.title}`} value={i.weight} onChange={(e) => { const w = Math.min(5, Math.max(0, Number(e.target.value) || 0)); actions.changePlan(plan.id, (p) => ({ ...p, pool: p.pool.map((x) => (x.loopId === i.loopId ? { ...x, weight: w } : x)) }), `Weight of “${i.title}” changed from ${i.weight} to ${w}`); }} />}</td>
                  <td className="muted small">{i.original ? 'Original plan' : `Added ${fmtStamp(i.addedAt, settings)}`}</td>
                  <td>{!past && <button className="icon-btn" aria-label={`Remove ${i.title} from pool`} title="Remove from pool" onClick={async () => { if (await ui.confirm({ title: 'Remove from this month’s pool?', body: `“${i.title}” will no longer count toward ${monthLabel(plan.id)}. ${active ? 'The removal is recorded in the plan’s log.' : ''}`, confirmLabel: 'Remove' })) actions.changePlan(plan.id, (p) => ({ ...p, pool: p.pool.filter((x) => x.loopId !== i.loopId) }), `Removed from pool: “${i.title}”`); }}><Icon name="x" size={15} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <Empty title="The pool is empty">Add loops below to measure this month against them.</Empty>}
        {!past && outside.length > 0 && (
          <>
            <h3>Not in this month’s pool</h3>
            <p className="muted small">Open loops that don’t count toward {monthLabel(plan.id)} — usually ones created after the pool was set.</p>
            <ul className="plain-list">
              {outside.map((l) => <li key={l.id}><button className="link" onClick={() => ui.openLoop(l.id)}>{l.title}</button><button className="btn sm" onClick={() => actions.changePlan(plan.id, (p) => ({ ...p, pool: [...p.pool, { loopId: l.id, title: l.title, weight: l.weight ?? 1, addedAt: nowISO(), original: false }] }), `Added to pool: “${l.title}”`)}>Add to pool</button></li>)}
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head"><h2>Plan record</h2></div>
        <ol className="timeline">
          <li><span className="when">{fmtStamp(plan.createdAt, settings)}</span><span>Plan established with {plan.pool.filter((p) => p.original).length} loops still in the pool from the original set.</span></li>
          {(plan.changes || []).map((c, i) => <li key={i}><span className="when">{fmtStamp(c.at, settings)}</span><span>{c.note}</span></li>)}
          {plan.review?.at && <li><span className="when">{fmtStamp(plan.review.at, settings)}</span><span>Month-end review: {Object.keys(plan.review.decisions).length} decision(s) recorded.</span></li>}
        </ol>
      </section>
    </>
  );
}

export default function Rewards({ params }) {
  const { plans } = useStore();
  const ui = useUI();
  const mk = monthKey(today());
  const month = /^\d{4}-\d{2}$/.test(params.month || '') ? params.month : mk;
  const plan = plans.find((p) => p.id === month);
  const earliest = plans.reduce((a, p) => (p.id < a ? p.id : a), mk);
  const latest = shiftMonth(mk, 1);
  return (
    <div className="view">
      <header className="view-head"><div><h1>Rewards</h1><p className="muted">Rewards you choose, unlocked by resolving what you committed to this month.</p></div></header>
      <div className="cal-nav">
        <button className="icon-btn" aria-label="Previous month" disabled={month <= earliest} onClick={() => ui.nav('rewards', { month: shiftMonth(month, -1) })}><Icon name="chevL" /></button>
        <h2 aria-live="polite">{monthLabel(month)}{month === mk ? ' · this month' : month > mk ? ' · upcoming' : ''}</h2>
        <button className="icon-btn" aria-label="Next month" disabled={month >= latest} onClick={() => ui.nav('rewards', { month: shiftMonth(month, 1) })}><Icon name="chevR" /></button>
        {month !== mk && <button className="btn sm" onClick={() => ui.nav('rewards')}>This month</button>}
      </div>
      {plan ? <PlanView key={plan.id} plan={plan} /> : month >= mk ? <PlanSetup key={month} month={month} /> : <section className="card"><Empty icon="gift" title={`No plan was set for ${monthLabel(month)}`} /></section>}
    </div>
  );
}
