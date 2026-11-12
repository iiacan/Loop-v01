import React, { useMemo } from 'react';
import { useStore } from '../store.jsx';
import { useUI, Empty, Bar, SectorDot, Icon } from '../ui.jsx';
import { fmtDate, fmtMin } from '../lib/dates.js';
import { STAGE_LABEL, RESOLUTIONS } from '../lib/model.js';
import { computeInsights, recommendations } from '../lib/logic.js';

const STAGE_COLOR = { OPENED: '#9ca3af', ACTIVE: '#6ee7b7', WAITING: '#60a5fa', STUCK: '#fb7185', CLOSED: '#a78bfa' };
const RES_COLOR = { COMPLETED: '#6ee7b7', DECIDED_NOT_TO: '#c084fc', SUPERSEDED: '#60a5fa', ARCHIVED: '#9ca3af' };

const Rows = ({ rows, max }) => (
  <ul className="bars">
    {rows.map((r) => (
      <li key={r.label}><span className="bar-label">{r.dot && <SectorDot color={r.dot} />}{r.label}</span><Bar value={r.value} max={max ?? Math.max(1, ...rows.map((x) => x.value))} color={r.color} /><span className="bar-val">{r.text ?? r.value}</span></li>
    ))}
  </ul>
);

export default function Insights() {
  const store = useStore();
  const { loops, sectors, settings } = store;
  const ui = useUI();
  const ins = useMemo(() => computeInsights(loops, sectors, settings.weekStart), [loops, sectors, settings.weekStart]);
  const recs = useMemo(() => recommendations(store, ins), [store, ins]);
  const real = loops.filter((l) => !l.sample).length;
  const maxWeek = Math.max(1, ...ins.weeks.map((w) => w.completed + w.other));
  const link = (l) => <button className="link" onClick={() => ui.openLoop(l.id)}>{l.title}</button>;

  if (!loops.length)
    return <div className="view"><header className="view-head"><div><h1>Insights</h1></div></header><section className="card"><Empty icon="chart" title="Nothing to describe yet">Insights are built from your loops' history. They appear as you create, move and close loops.</Empty></section></div>;

  return (
    <div className="view">
      <header className="view-head"><div><h1>Insights</h1><p className="muted">Plain counts from your own loop history. Descriptive only — Loop does not diagnose, infer mood or draw psychological conclusions.</p></div></header>
      {real === 0 && <p className="banner soft"><span className="chip sample">Sample</span> These figures come from the sample loops.</p>}

      <div className="tiles">
        <div className="tile"><strong>{ins.open}</strong><small>Open loops</small></div>
        <div className="tile"><strong>{ins.closed}</strong><small>Closed loops</small></div>
        <div className="tile"><strong>{ins.timing.n ? `${ins.timing.onTime}/${ins.timing.n}` : '—'}</strong><small>Completed by expected date</small></div>
        <div className="tile"><strong>{ins.effort.medianRatio ? ins.effort.medianRatio.toFixed(1) + '×' : '—'}</strong><small>Actual vs estimated effort (median)</small></div>
        <div className="tile"><strong>{ins.totalResched}</strong><small>Reschedules recorded</small></div>
        <div className="tile"><strong>{ins.waiting.n ? ins.waiting.avg.toFixed(1) + ' d' : '—'}</strong><small>Average time spent waiting</small></div>
      </div>

      <div className="grid-cards">
        <section className="card">
          <div className="card-head"><h2>Loops by stage</h2></div>
          <Rows rows={Object.entries(ins.byStage).map(([k, v]) => ({ label: STAGE_LABEL[k], value: v, color: STAGE_COLOR[k] }))} />
        </section>
        <section className="card">
          <div className="card-head"><h2>How loops were resolved</h2></div>
          {ins.closed ? <Rows rows={Object.entries(ins.byResolution).map(([k, v]) => ({ label: RESOLUTIONS[k].label, value: v, color: RES_COLOR[k] }))} /> : <p className="muted small">No loops closed yet.</p>}
          <p className="muted small">Completion and resolution are counted separately: deciding not to do something resolves a loop without completing it.</p>
        </section>

        <section className="card">
          <div className="card-head"><h2>Loops closed per week</h2><span className="muted small">last 8 weeks</span></div>
          <div className="cols" role="img" aria-label={'Loops closed per week: ' + ins.weeks.map((w) => `${fmtDate(w.start, settings)}: ${w.completed + w.other}`).join(', ')}>
            {ins.weeks.map((w) => (
              <div key={w.start} className="col">
                <span className="col-val">{w.completed + w.other || ''}</span>
                <span className="col-stack" style={{ height: `${((w.completed + w.other) / maxWeek) * 100}%` }}>
                  <span style={{ flex: w.other, background: RES_COLOR.DECIDED_NOT_TO }} /><span style={{ flex: w.completed, background: RES_COLOR.COMPLETED }} />
                </span>
                <small>{fmtDate(w.start, settings, { year: false })}</small>
              </div>
            ))}
          </div>
          <p className="legend"><span><i style={{ background: RES_COLOR.COMPLETED }} />Completed</span><span><i style={{ background: RES_COLOR.DECIDED_NOT_TO }} />Closed another way</span></p>
        </section>
        <section className="card">
          <div className="card-head"><h2>Day of week loops get closed</h2></div>
          <Rows rows={ins.weekdays.map((d) => ({ label: d.day, value: d.n, color: '#a78bfa' }))} />
        </section>

        <section className="card">
          <div className="card-head"><h2>Expected vs actual completion</h2></div>
          {ins.timing.n ? (
            <>
              <p>{ins.timing.onTime} of {ins.timing.n} completed loops finished on or before the expected date. Average difference: {Math.abs(ins.timing.avgLate).toFixed(1)} days {ins.timing.avgLate > 0 ? 'later' : 'earlier'} than expected.</p>
              <ul className="plain-list">{ins.timing.rows.map(({ loop, late }) => <li key={loop.id}>{link(loop)}<span className="muted">{late > 0 ? `${late} d after` : late < 0 ? `${-late} d before` : 'on the day'}</span></li>)}</ul>
            </>
          ) : <p className="muted small">Appears once completed loops have an expected date.</p>}
        </section>
        <section className="card">
          <div className="card-head"><h2>Estimated vs actual effort</h2></div>
          {ins.effort.n ? (
            <ul className="plain-list">{ins.effort.rows.map(({ loop, ratio }) => <li key={loop.id}>{link(loop)}<span className="muted">{fmtMin(loop.estMinutes)} est → {fmtMin(loop.actualMinutes)} actual ({ratio.toFixed(1)}×)</span></li>)}</ul>
          ) : <p className="muted small">Record an estimate on a loop and the actual effort when you close it, and the comparison appears here.</p>}
        </section>

        <section className="card">
          <div className="card-head"><h2>Most rescheduled</h2></div>
          {ins.resched.length ? <ul className="plain-list">{ins.resched.slice(0, 6).map(({ loop, n }) => <li key={loop.id}>{link(loop)}<span className="muted">{n}×</span></li>)}</ul> : <p className="muted small">No reschedules recorded.</p>}
        </section>
        <section className="card">
          <div className="card-head"><h2>Where loops stall</h2></div>
          {ins.stalls.length ? <ul className="plain-list">{ins.stalls.slice(0, 6).map(({ loop, n }) => <li key={loop.id}>{link(loop)}<span className="muted">stuck {n}×</span></li>)}</ul> : <p className="muted small">No loop has been marked stuck.</p>}
          <p className="muted small">Steps: {ins.steps.done} of {ins.steps.total} done{ins.steps.blocked ? `, ${ins.steps.blocked} marked “stuck here”` : ''}.</p>
        </section>

        <section className="card span2">
          <div className="card-head"><h2>By sector</h2></div>
          {ins.perSector.length ? (
            <div className="table-wrap"><table className="mini">
              <thead><tr><th>Sector</th><th>Open</th><th>Closed</th><th>Times stuck</th><th>Reschedules</th></tr></thead>
              <tbody>{ins.perSector.map((r) => <tr key={r.sector.id}><td><SectorDot color={r.sector.color} /> {r.sector.name}</td><td>{r.open}</td><td>{r.closed}</td><td>{r.stalls}</td><td>{r.reschedules}</td></tr>)}</tbody>
            </table></div>
          ) : <p className="muted small">Assign sectors to loops to compare them.</p>}
        </section>

        <section className="card span2">
          <div className="card-head"><h2><Icon name="sparkle" /> Schedule check</h2><span className="muted small">rule-based</span></div>
          <p>Next 7 days: {ins.load.n} loop(s) due, about {fmtMin(ins.load.minutes) || '0 m'} of estimated effort against {fmtMin(settings.dailyCapacityMinutes * 7)} at your stated daily capacity.</p>
          {recs.length ? <ul className="recs">{recs.map((r) => <li key={r.id}>{r.text}</li>)}</ul> : <p className="muted small">No flags right now.</p>}
        </section>
      </div>
    </div>
  );
}
