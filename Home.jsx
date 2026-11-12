import React, { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { useUI, Icon, Ring, Empty } from '../ui.jsx';
import { LoopList } from '../shared.jsx';
import { today, addDays, fmtDate, fmtTime, fmtMin, monthKey, monthLabel, greeting, MON } from '../lib/dates.js';
import { isClosed, isOverdue, closedDay, mapStep, hist, STEP_STATUS } from '../lib/model.js';
import { planProgress, needsReview, todayItems, computeInsights, insightLines, recommendations } from '../lib/logic.js';

export function RewardList({ plan, pct, onClaim }) {
  if (!plan.rewards.length) return <p className="muted small">No rewards set for this month.</p>;
  return (
    <ul className="rewards">
      {[...plan.rewards].sort((a, b) => a.threshold - b.threshold).map((r) => {
        const unlocked = pct >= r.threshold;
        return (
          <li key={r.id} className={unlocked ? 'unlocked' : ''}>
            <span className="r-check">{unlocked && <Icon name="check" size={12} />}</span>
            <span className="r-text">{r.threshold}% — {r.title}</span>
            {unlocked && onClaim && (r.claimedAt ? <span className="chip done">Enjoyed</span> : <button className="btn sm" onClick={() => onClaim(r)}>Mark enjoyed</button>)}
            {unlocked && !onClaim && <span className="chip done">Unlocked</span>}
          </li>
        );
      })}
    </ul>
  );
}

export default function Home() {
  const store = useStore();
  const { loops, sectors, plans, settings, app, actions } = store;
  const ui = useUI();
  const t = today();
  const mk = monthKey(t);
  const [recIdx, setRecIdx] = useState(0);

  const open = loops.filter((l) => !isClosed(l));
  const count = (s) => open.filter((l) => l.stage === s).length;
  const closedMonth = loops.filter((l) => isClosed(l) && (closedDay(l) || '').startsWith(mk));
  const plan = plans.find((p) => p.id === mk);
  const prog = plan ? planProgress(plan, loops) : null;
  const review = plans.filter((p) => needsReview(p, loops, t).length);
  const items = useMemo(() => todayItems(loops, t), [loops, t]);
  const planned = items.reduce((a, i) => a + (Number(i.est) || 0), 0);
  const ins = useMemo(() => computeInsights(loops, sectors, settings.weekStart), [loops, sectors, settings.weekStart]);
  const recs = useMemo(() => recommendations(store, ins), [loops, plans, settings, app, ins]);
  const rec = recs[Math.min(recIdx, recs.length - 1)];
  const due = open.filter((l) => isOverdue(l, t)).length;

  const summary = !loops.length
    ? 'No loops yet. Capture the first thing on your mind.'
    : `${open.length} open loop${open.length === 1 ? '' : 's'}` +
      (count('WAITING') ? `, ${count('WAITING')} waiting` : '') +
      (count('STUCK') ? `, ${count('STUCK')} stuck` : '') +
      (due ? ` · ${due} ready for a fresh date` : '') + '.';

  const checkItem = (it) => {
    if (it.kind === 'step') {
      actions.updateLoop(it.loop.id, { steps: mapStep(it.loop.steps, it.step.id, (s) => ({ ...s, status: 'done' })) }, { history: [hist('step', { note: `Step “${it.step.title}”: ${STEP_STATUS[it.step.status]} → Done` })] });
      ui.toast(`Done: ${it.step.title}`);
    } else if (it.kind === 'followup') {
      actions.updateLoop(it.loop.id, { waiting: { ...it.loop.waiting, followUp: addDays(t, 7) } }, { history: [hist('note', { note: 'Followed up; next follow-up in a week' })] });
      ui.toast('Follow-up logged. Next one in a week.');
    } else if (it.kind === 'appt') ui.openLoop(it.loop.id);
    else ui.closeLoop(it.loop.id);
  };
  const doRec = (a) => {
    if (a.type === 'open') ui.openLoop(a.loopId);
    else if (a.type === 'nav') ui.nav(a.view, a.params);
    else if (a.type === 'tomorrow') {
      const l = loops.find((x) => x.id === a.loopId);
      actions.updateLoop(a.loopId, { plannedFor: null, ...(l.expectedDate === t ? { expectedDate: addDays(t, 1) } : {}) }, { note: 'Moved to make today realistic' });
      ui.toast(`Moved “${l.title}” to tomorrow.`);
    }
  };
  const dismiss = () => {
    const ids = app.dismissed?.date === t ? app.dismissed.ids : [];
    actions.saveApp({ dismissed: { date: t, ids: [...ids, rec.id] } });
    setRecIdx(0);
  };

  const Card = ({ icon, n, label, tone, to }) => (
    <button className={'stat tone-' + tone} onClick={() => ui.nav('loops', to)}>
      <span className="stat-icon"><Icon name={icon} size={22} /></span>
      <span><strong>{n}</strong><small>{label}</small></span>
    </button>
  );

  return (
    <div className="home">
      <header className="hero">
        <svg className="hero-art" viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <path d="M0 150 L120 110 L210 135 L330 80 L430 125 L540 70 L640 120 L760 60 L860 115 L980 85 L1090 125 L1200 95 V220 H0Z" fill="rgba(88,60,120,.55)" />
          <path d="M0 180 L140 140 L260 170 L380 125 L520 165 L660 120 L800 165 L940 130 L1080 168 L1200 140 V220 H0Z" fill="rgba(38,26,58,.9)" />
        </svg>
        <div className="hero-text">
          <h1>{settings.greeting?.trim() || greeting()}{settings.name ? `, ${settings.name}` : ''}.</h1>
          <p>Here’s the state of your loops today. {summary}</p>
        </div>
        <button className="hero-date" onClick={() => ui.nav('calendar', { tab: 'day' })} title="Open today's agenda">{fmtDate(t, settings, { dow: true, year: false })} <Icon name="calendar" /></button>
      </header>

      {loops.some((l) => l.sample) && (
        <div className="banner soft">
          <span><span className="chip sample">Sample</span> You’re looking at sample loops. They’re labelled and separate from anything you create.</span>
          <button className="btn sm" onClick={async () => { if (await ui.confirm({ title: 'Remove sample data?', body: 'All loops and the monthly plan marked “Sample” will be removed. Anything you created stays.', confirmLabel: 'Remove sample data' })) { await actions.removeSampleData(); ui.toast('Sample data removed.'); } }}>Remove sample data</button>
        </div>
      )}
      {review.map((p) => (
        <div className="banner" key={p.id}>
          <span>{monthLabel(p.id)} ended with {needsReview(p, loops, t).length} unresolved loop(s). Each one gets a decision — carrying forward is fine.</span>
          <button className="btn sm primary" onClick={() => ui.nav('rewards', { month: p.id, review: 1 })}>Review</button>
        </div>
      ))}

      <div className="stats">
        <button className="stat stat-wide" onClick={() => ui.nav('rewards')}>
          <Ring pct={prog ? prog.resolutionPct : 0} />
          <span><strong className="stat-title">Monthly progress</strong><small>{prog ? `${prog.counted.filter((i) => i.status !== 'open').length} of ${prog.counted.length} loops resolved` : `No pool set for ${MON[Number(mk.slice(5)) - 1]} yet`}</small></span>
          <Icon name="chevR" />
        </button>
        <Card icon="target" n={count('ACTIVE')} label="Active" tone="active" to={{ stage: 'ACTIVE' }} />
        <Card icon="pause" n={count('WAITING')} label="Waiting on" tone="waiting" to={{ tab: 'waiting' }} />
        <Card icon="alert" n={count('STUCK')} label="Stuck" tone="stuck" to={{ tab: 'stuck' }} />
        <Card icon="checkc" n={closedMonth.length} label={`Closed (${MON[Number(mk.slice(5)) - 1]})`} tone="closed" to={{ tab: 'closed' }} />
      </div>

      <div className="home-grid">
        <div className="col-main">
          <section className="card">
            <div className="card-head"><h2>My Loops</h2><button className="btn sm ghost" onClick={() => ui.nav('loops')}>All views <Icon name="chevR" size={14} /></button></div>
            <LoopList loops={open} empty={<Empty title="No open loops">Everything is resolved, or nothing is captured yet. Press <kbd>N</kbd> to capture one.</Empty>} />
          </section>

          <section className="card says">
            <Icon name="sparkle" size={26} className="says-icon" />
            <div className="says-body">
              <h2>Loop says…</h2>
              {rec ? <p>{rec.text}</p> : <p className="muted">Nothing needs flagging right now. Your plan looks workable.</p>}
              {recs.length > 1 && <p className="muted small">Suggestion {Math.min(recIdx, recs.length - 1) + 1} of {recs.length} · rule-based, from your own data</p>}
            </div>
            {rec && (
              <div className="says-actions">
                {rec.action && <button className="btn primary" onClick={() => doRec(rec.action)}>{rec.action.label}</button>}
                {recs.length > 1 && <button className="btn" onClick={() => setRecIdx((recIdx + 1) % recs.length)}>Next suggestion</button>}
                <button className="btn ghost" onClick={dismiss}>Not today</button>
              </div>
            )}
          </section>
        </div>

        <aside className="col-side">
          <section className="card">
            <div className="card-head"><h2><Icon name="calendar" /> Today’s Plan</h2>{planned > 0 && <span className={'muted small' + (planned > settings.dailyCapacityMinutes ? ' over' : '')}>≈ {fmtMin(planned)} of {fmtMin(settings.dailyCapacityMinutes)}</span>}</div>
            {items.length ? (
              <ul className="today">
                {items.map((it) => (
                  <li key={it.key}>
                    <input type="checkbox" checked={false} onChange={() => checkItem(it)} aria-label={it.kind === 'loop' ? `Resolve ${it.label}` : it.kind === 'appt' ? `Open ${it.label}` : `Mark done: ${it.label}`} />
                    <button className="today-text" onClick={() => ui.openLoop(it.loop.id)}>
                      <span>{it.label}</span>{it.sub && <small>{it.sub}</small>}
                    </button>
                    <span className="muted small">{it.time ? fmtTime(it.time, settings) : it.est ? `≈ ${fmtMin(it.est)}` : ''}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted small">Nothing is planned for today. Use “Add to today” on any loop, or enjoy the space.</p>}
          </section>

          <section className="card">
            <div className="card-head"><h2><Icon name="gift" /> {monthLabel(mk).split(' ')[0]} Reward Progress</h2>{prog && <strong>{prog.resolutionPct}%</strong>}</div>
            {plan ? (
              <>
                <div className="progress" role="progressbar" aria-valuenow={prog.resolutionPct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: prog.resolutionPct + '%' }} /></div>
                <RewardList plan={plan} pct={prog.resolutionPct} />
              </>
            ) : <p className="muted small">Set this month’s commitment pool to start tracking rewards.</p>}
            <button className="btn sm ghost" onClick={() => ui.nav('rewards')}>{plan ? 'Open rewards' : 'Set up this month'} <Icon name="chevR" size={14} /></button>
          </section>

          <section className="card">
            <div className="card-head"><h2><Icon name="chart" /> Loop Insights</h2><button className="icon-btn" aria-label="Open insights" onClick={() => ui.nav('insights')}><Icon name="chevR" /></button></div>
            <ul className="insight-lines">
              {insightLines(ins).slice(0, 3).map((x, i) => <li key={i}><Icon name={x.icon} size={16} /><span>{x.text}</span></li>)}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
