import React, { useRef } from 'react';
import { useStore } from '../store.jsx';
import { useUI, Tabs, Empty, Icon } from '../ui.jsx';
import { LoopList } from '../shared.jsx';
import { today, fmtStamp } from '../lib/dates.js';
import { isClosed, isOverdue, deadlinePassed, describeHistory } from '../lib/model.js';
import { download, loopsToCSV, exportLoopsJSON } from '../lib/backup.js';

export default function Loops({ params }) {
  const { loops, sectors, settings } = useStore();
  const ui = useUI();
  const t = today();
  const tab = params.tab || 'open';
  const open = loops.filter((l) => !isClosed(l));
  const sets = {
    open,
    waiting: open.filter((l) => l.stage === 'WAITING'),
    stuck: open.filter((l) => l.stage === 'STUCK'),
    review: open.filter((l) => isOverdue(l, t) || deadlinePassed(l, t)),
    closed: loops.filter(isClosed),
  };
  const shown = useRef([]);
  const go = (id) => ui.nav('loops', id === 'open' ? {} : { tab: id });
  const exp = (kind) => {
    const rows = shown.current;
    if (!rows.length) return ui.toast('There is nothing in this view to export.');
    if (kind === 'csv') download(`loop-${tab}-${t}.csv`, loopsToCSV(rows, sectors), 'text/csv');
    else download(`loop-${tab}-${t}.json`, exportLoopsJSON(rows, sectors));
    ui.toast(`Exported ${rows.length} loop${rows.length === 1 ? '' : 's'} from this view.`);
  };
  const activity = loops.flatMap((l) => l.history.map((h) => ({ l, h }))).sort((a, b) => b.h.at.localeCompare(a.h.at)).slice(0, 60);
  const EMPTY = {
    open: <Empty title="No open loops">Capture one with the Quick Capture button, or press <kbd>N</kbd>.</Empty>,
    waiting: <Empty icon="pause" title="Nothing is waiting on anyone">When a loop depends on someone or something else, move it to Waiting and it will appear here.</Empty>,
    stuck: <Empty icon="alert" title="Nothing is stuck">If a loop stalls, mark it Stuck and flag the step where it stopped.</Empty>,
    review: <Empty icon="calendar" title="Nothing needs a fresh date">Loops show up here when their expected date or deadline has passed.</Empty>,
    closed: <Empty icon="checkc" title="No closed loops yet">Closed loops keep their full history and can be reopened.</Empty>,
  };

  return (
    <div className="view">
      <header className="view-head">
        <div><h1>My Loops</h1><p className="muted">Every commitment, with its state and its next move.</p></div>
        {tab !== 'activity' && (
          <div className="row-btns">
            <button className="btn sm" onClick={() => exp('csv')}><Icon name="download" size={14} /> CSV</button>
            <button className="btn sm" onClick={() => exp('json')}><Icon name="download" size={14} /> JSON</button>
          </div>
        )}
      </header>
      <Tabs label="Loop views" value={tab} onChange={go} tabs={[
        { id: 'open', label: 'Open', count: sets.open.length },
        { id: 'waiting', label: 'Waiting On', count: sets.waiting.length },
        { id: 'stuck', label: 'Stuck', count: sets.stuck.length },
        { id: 'review', label: 'Due for review', count: sets.review.length },
        { id: 'closed', label: 'Closed', count: sets.closed.length },
        { id: 'activity', label: 'Recent activity' },
      ]} />
      <section className="card">
        {tab === 'activity' ? (
          activity.length ? (
            <ol className="timeline activity">
              {activity.map(({ l, h }, i) => (
                <li key={i} className={'h-' + h.type}>
                  <span className="when">{fmtStamp(h.at, settings)}</span>
                  <span><button className="link" onClick={() => ui.openLoop(l.id)}>{l.title}</button> — {describeHistory(h, settings, sectors)}</span>
                </li>
              ))}
            </ol>
          ) : <Empty title="No activity yet" />
        ) : (
          <>
            {tab === 'waiting' && sets.waiting.length > 0 && <p className="muted small pad">These depend on someone or something else. Loop flags a passed response date once, here, and mentions follow-ups only on the day you chose.</p>}
            {tab === 'review' && sets.review.length > 0 && <p className="muted small pad">Their expected date or deadline has passed. Nothing here is failed — each just needs a new date or a decision.</p>}
            <LoopList key={tab + (params.stage || '') + (params.sector || '')} loops={sets[tab] || sets.open} mode={tab === 'waiting' ? 'waiting' : tab === 'closed' ? 'closed' : 'default'}
              initial={{ stage: params.stage, sector: params.sector }} empty={EMPTY[tab]} onFiltered={(r) => (shown.current = r)} />
          </>
        )}
      </section>
    </div>
  );
}
