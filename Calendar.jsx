import React, { useMemo } from 'react';
import { useStore } from '../store.jsx';
import { useUI, Tabs, Empty, Icon, StageBadge } from '../ui.jsx';
import { today, addDays, addMonths, parse, toISO, fmtDate, fmtTime, relDay, startOfWeek, monthLabel, DOW } from '../lib/dates.js';
import { isClosed, isOverdue, deadlinePassed } from '../lib/model.js';
import { calendarEvents, EVENT_KINDS } from '../lib/logic.js';

const Ev = ({ e, settings, onOpen, full }) => (
  <button className={'ev ev-' + e.kind + (e.late ? ' late' : '')} title={`${EVENT_KINDS[e.kind]}: ${e.label}`} onClick={(x) => { x.stopPropagation(); onOpen(e.loop.id); }}>
    <span className="ev-mark" aria-hidden="true" />
    <span className="ev-label">{full && <b>{EVENT_KINDS[e.kind]}{e.time ? ` · ${fmtTime(e.time, settings)}` : ''} — </b>}{e.label}</span>
  </button>
);

export default function Calendar({ params }) {
  const { loops, settings } = useStore();
  const ui = useUI();
  const t = today();
  const tab = params.tab || 'month';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date || '') ? params.date : t;
  const ws = Number(settings.weekStart ?? 1);
  const events = useMemo(() => calendarEvents(loops, t), [loops, t]);
  const go = (p) => ui.nav('calendar', { tab, date, ...p });
  const dows = Array.from({ length: 7 }, (_, i) => DOW[(ws + i) % 7]);
  const open = loops.filter((l) => !isClosed(l));

  const step = (dir) => go({ date: tab === 'month' ? addMonths(date.slice(0, 8) + '01', dir) : addDays(date, dir * (tab === 'week' ? 7 : 1)) });
  const title = tab === 'month' ? monthLabel(date.slice(0, 7)) : tab === 'week' ? `Week of ${fmtDate(startOfWeek(date, ws), settings)}` : fmtDate(date, settings, { dow: true, year: true });

  let body;
  if (tab === 'month') {
    const first = date.slice(0, 8) + '01';
    const start = startOfWeek(first, ws);
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    const weeks = days[35].slice(0, 7) === date.slice(0, 7) ? 6 : 5;
    body = (
      <div className="cal-month" role="grid" aria-label={title}>
        {dows.map((d) => <div key={d} className="cal-dow" role="columnheader">{d}</div>)}
        {days.slice(0, weeks * 7).map((d) => {
          const evs = events[d] || [];
          return (
            <div key={d} role="gridcell" tabIndex={0} className={'cal-cell' + (d.slice(0, 7) !== date.slice(0, 7) ? ' out' : '') + (d === t ? ' today' : '')}
              onClick={() => go({ tab: 'day', date: d })} onKeyDown={(e) => e.key === 'Enter' && go({ tab: 'day', date: d })} aria-label={`${fmtDate(d, settings, { dow: true })}, ${evs.length} item${evs.length === 1 ? '' : 's'}`}>
              <span className="cal-num">{parse(d).getDate()}</span>
              {evs.slice(0, 3).map((e, i) => <Ev key={i} e={e} settings={settings} onOpen={ui.openLoop} />)}
              {evs.length > 3 && <span className="cal-more">+{evs.length - 3} more</span>}
            </div>
          );
        })}
      </div>
    );
  } else if (tab === 'week') {
    const start = startOfWeek(date, ws);
    body = (
      <div className="cal-week">
        {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => (
          <div key={d} className={'cal-day' + (d === t ? ' today' : '')}>
            <button className="cal-day-head" onClick={() => go({ tab: 'day', date: d })}>{fmtDate(d, settings, { dow: true, year: false })}</button>
            {(events[d] || []).map((e, i) => <Ev key={i} e={e} settings={settings} onOpen={ui.openLoop} />)}
            {!(events[d] || []).length && <span className="muted small">—</span>}
          </div>
        ))}
      </div>
    );
  } else if (tab === 'day') {
    const evs = events[date] || [];
    body = (
      <div className="agenda">
        {evs.length ? evs.map((e, i) => <Ev key={i} e={e} settings={settings} onOpen={ui.openLoop} full />) : <Empty icon="calendar" title="Nothing on this day">A clear day. Capture something for it if you need to.</Empty>}
        <button className="btn sm" onClick={() => ui.capture({ expectedDate: date })}><Icon name="plus" size={14} /> Capture a loop for this day</button>
      </div>
    );
  } else {
    const list = tab === 'deadlines'
      ? open.flatMap((l) => [l.deadline && l.deadline >= t && { l, d: l.deadline, kind: 'deadline' }, l.expectedDate && l.expectedDate >= t && { l, d: l.expectedDate, kind: 'expected' }].filter(Boolean)).sort((a, b) => a.d.localeCompare(b.d))
      : open.flatMap((l) => [deadlinePassed(l, t) && { l, d: l.deadline, kind: 'deadline' }, isOverdue(l, t) && { l, d: l.expectedDate, kind: 'overdue' }].filter(Boolean)).sort((a, b) => a.d.localeCompare(b.d));
    body = list.length ? (
      <ul className="date-list">
        {list.map(({ l, d, kind }, i) => (
          <li key={l.id + kind}>
            <span className={'ev ev-' + kind + ' static'}><span className="ev-mark" /></span>
            <span className="dl-date"><strong>{fmtDate(d, settings, { dow: true })}</strong><small>{EVENT_KINDS[kind]} · {relDay(d, t)}</small></span>
            <button className="link grow" onClick={() => ui.openLoop(l.id)}>{l.title}</button>
            <StageBadge loop={l} />
            {tab === 'overdue' && kind === 'overdue' && (
              <span className="row-btns">
                <button className="btn sm" onClick={() => ui.reschedule(l.id)}>Reschedule</button>
                <button className="btn sm" onClick={() => ui.closeLoop(l.id)}>Close…</button>
              </span>
            )}
          </li>
        ))}
      </ul>
    ) : tab === 'deadlines' ? <Empty icon="flag" title="No upcoming dates">Loops with an expected completion date or a deadline will be listed here in order.</Empty>
      : <Empty icon="checkc" title="Nothing is past its date">When an expected date passes without closure, the loop appears here for review — not as a failure.</Empty>;
  }

  return (
    <div className="view">
      <header className="view-head"><div><h1>Calendar</h1><p className="muted">Expected completions, deadlines and follow-ups, by date.</p></div></header>
      <Tabs label="Calendar views" value={tab} onChange={(id) => go({ tab: id })} tabs={[
        { id: 'month', label: 'Month' }, { id: 'week', label: 'Week' }, { id: 'day', label: 'Day' },
        { id: 'deadlines', label: 'Upcoming' }, { id: 'overdue', label: 'Due for review', count: open.filter((l) => isOverdue(l, t) || deadlinePassed(l, t)).length },
      ]} />
      <section className="card">
        {['month', 'week', 'day'].includes(tab) && (
          <div className="cal-nav">
            <button className="icon-btn" aria-label="Previous" onClick={() => step(-1)}><Icon name="chevL" /></button>
            <h2 aria-live="polite">{title}</h2>
            <button className="icon-btn" aria-label="Next" onClick={() => step(1)}><Icon name="chevR" /></button>
            <button className="btn sm" onClick={() => go({ date: t })} disabled={date === t}>Today</button>
          </div>
        )}
        {body}
        <div className="legend" aria-label="Legend">
          {['expected', 'deadline', 'overdue', 'done', 'waiting', 'appt', 'reminder', 'start'].map((k) => <span key={k} className={'ev static ev-' + k}><span className="ev-mark" />{EVENT_KINDS[k]}</span>)}
        </div>
      </section>
    </div>
  );
}
