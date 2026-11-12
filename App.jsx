import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store.jsx';
import { UICtx, Modal, Icon, Logo, SectorDot, Field } from './ui.jsx';
import { LoopPanel, QuickCapture, CloseDialog, RescheduleDialog } from './shared.jsx';
import Home from './views/Home.jsx';
import Loops from './views/Loops.jsx';
import Calendar from './views/Calendar.jsx';
import Sectors from './views/Sectors.jsx';
import Insights from './views/Insights.jsx';
import Rewards from './views/Rewards.jsx';
import Settings, { downloadBackup } from './views/Settings.jsx';
import { isClosed } from './lib/model.js';

const NAV = [
  ['home', 'Home', 'home'],
  ['loops', 'My Loops', 'loop'],
  ['calendar', 'Calendar', 'calendar'],
  ['sectors', 'Sectors', 'grid'],
  ['insights', 'Insights', 'chart'],
  ['rewards', 'Rewards', 'gift'],
  ['settings', 'Settings', 'settings'],
];
const VIEWS = { home: Home, loops: Loops, calendar: Calendar, sectors: Sectors, insights: Insights, rewards: Rewards, settings: Settings };

function readRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [v, q = ''] = h.split('?');
  return { view: VIEWS[v] ? v : 'home', params: Object.fromEntries(new URLSearchParams(q)) };
}
const nav = (view, params = {}) => {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''));
  const q = new URLSearchParams(clean).toString();
  location.hash = `/${view}${q ? '?' + q : ''}`;
};

function ConfirmDialog({ opts, onDone }) {
  const [text, setText] = useState('');
  return (
    <Modal title={opts.title} onClose={() => onDone(false)} footer={<>
      <button className="btn ghost" data-autofocus onClick={() => onDone(false)}>Cancel</button>
      <button className={'btn ' + (opts.danger ? 'danger' : 'primary')} disabled={!!opts.typed && text.trim().toUpperCase() !== opts.typed} onClick={() => onDone(true)}>{opts.confirmLabel || 'Confirm'}</button>
    </>}>
      <p>{opts.body}</p>
      {opts.typed && <Field label={`Type ${opts.typed} to confirm`}><input value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="characters" /></Field>}
    </Modal>
  );
}

export default function App() {
  const store = useStore();
  const { ready, loops, sectors, settings, app, storage, error, actions } = store;
  const [route, setRoute] = useState(readRoute);
  const [panel, setPanel] = useState(null);
  const [capture, setCapture] = useState(null);
  const [closing, setClosing] = useState(null);
  const [resched, setResched] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const main = useRef(null);

  useEffect(() => {
    const f = () => { setRoute(readRoute()); setMenuOpen(false); };
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  useEffect(() => { main.current?.scrollTo?.(0, 0); window.scrollTo(0, 0); }, [route.view]);

  const toast = useCallback((text, action, sticky) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, text, action }]);
    if (!sticky) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 9000 : 4500);
  }, []);
  const ui = useMemo(() => ({
    nav,
    toast,
    openLoop: (id) => setPanel(id),
    capture: (preset = {}) => setCapture(preset),
    closeLoop: (id) => setClosing(id),
    reschedule: (id) => setResched(id),
    confirm: (opts) => new Promise((resolve) => setConfirm({ opts, resolve })),
  }), [toast]);

  // Theme
  useEffect(() => {
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'auto' && !matchMedia('(prefers-color-scheme: light)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.dataset.motion = settings.reduceMotion ? 'reduce' : 'ok';
    };
    apply();
    const mq = matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [settings.theme, settings.reduceMotion]);

  // Keyboard shortcuts
  useEffect(() => {
    const key = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      if (document.querySelector('.modal-box')) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setCapture({}); }
      if (e.key === '/') { e.preventDefault(); nav('loops'); setTimeout(() => document.getElementById('loop-search')?.focus(), 60); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  // Reminders: checked while the app is open. At most three surface at once.
  useEffect(() => {
    if (!ready) return;
    const check = () => {
      const now = new Date();
      const due = actions.getState().loops.filter((l) => !isClosed(l) && l.reminderAt && !l.reminderFired && new Date(l.reminderAt) <= now);
      if (!due.length) return;
      const st = actions.getState().settings;
      due.forEach((l) => actions.updateLoop(l.id, { reminderFired: true }));
      const shown = due.slice(0, 3);
      if (st.inAppReminders) {
        shown.forEach((l) => toast(`Reminder: ${l.title}`, { label: 'Open', onClick: () => setPanel(l.id) }, true));
        if (due.length > 3) toast(`…and ${due.length - 3} more reminders came due.`, { label: 'See loops', onClick: () => nav('loops') }, true);
      }
      if (st.browserNotifications && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification('Loop reminder', { body: shown.map((l) => l.title).join('\n') + (due.length > 3 ? `\n+${due.length - 3} more` : ''), tag: 'loop-reminder' }); } catch {}
      }
    };
    check();
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
  }, [ready]);

  if (!ready) return <div className="boot"><Logo size={56} /><p>Opening your loops…</p></div>;

  const View = VIEWS[route.view];
  const open = loops.filter((l) => !isClosed(l));
  const real = loops.some((l) => !l.sample);
  const days = app.lastBackupAt ? (Date.now() - new Date(app.lastBackupAt)) / 864e5 : Infinity;
  const snoozed = app.backupSnoozeUntil && app.backupSnoozeUntil > new Date().toISOString();
  const backupDue = real && settings.backupReminderDays > 0 && days >= settings.backupReminderDays && !snoozed;

  return (
    <UICtx.Provider value={ui}>
      <a className="skip" href="#main">Skip to content</a>
      <div className={'shell' + (menuOpen ? ' menu-open' : '')}>
        <header className="topbar">
          <button className="icon-btn" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Icon name="menu" size={22} /></button>
          <span className="brand"><Logo size={28} /> Loop</span>
          <button className="icon-btn" aria-label="Quick Capture" onClick={() => setCapture({})}><Icon name="plus" size={22} /></button>
        </header>
        {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
        <nav className="sidebar" aria-label="Main">
          <a className="brand" href="#/home"><Logo /> <span>Loop</span></a>
          <ul>
            {NAV.map(([id, label, icon]) => (
              <li key={id}><a href={`#/${id}`} className={route.view === id ? 'on' : ''} aria-current={route.view === id ? 'page' : undefined}><Icon name={icon} />{label}</a></li>
            ))}
          </ul>
          <button className="btn primary capture" onClick={() => setCapture({})}><Icon name="plus" /> Quick Capture <kbd>N</kbd></button>
          <div className="side-sectors">
            <h2>Sectors</h2>
            <ul>
              {sectors.filter((s) => !s.archived).sort((a, b) => a.order - b.order).map((s) => (
                <li key={s.id}><a href={`#/loops?sector=${encodeURIComponent(s.id)}`}><SectorDot color={s.color} /><span>{s.name}</span><span className="n">{open.filter((l) => l.sectorIds.includes(s.id)).length}</span></a></li>
              ))}
            </ul>
          </div>
          <p className="tagline">Keep the thread.</p>
        </nav>

        <main id="main" ref={main} tabIndex={-1}>
          {error && <div className="banner review" role="alert"><span>{error}</span><span className="row-btns"><button className="btn sm" onClick={() => downloadBackup(store)}>Download backup</button><button className="btn sm ghost" onClick={actions.clearError}>Dismiss</button></span></div>}
          {storage?.kind === 'memory' && <div className="banner review" role="alert"><span>This browser is blocking local storage (private browsing can do this). Nothing you enter will survive a refresh. Download a backup before leaving.</span></div>}
          {backupDue && route.view !== 'settings' && (
            <div className="banner soft">
              <span>{app.lastBackupAt ? `Your last backup was ${Math.floor(days)} days ago.` : 'You have loops here and no backup yet.'} Loop’s data lives only in this browser.</span>
              <span className="row-btns"><button className="btn sm primary" onClick={() => { downloadBackup(store); toast('Backup downloaded.'); }}>Download backup</button><button className="btn sm ghost" onClick={() => actions.saveApp({ backupSnoozeUntil: new Date(Date.now() + 864e5).toISOString() })}>Tomorrow</button></span>
            </div>
          )}
          <View params={route.params} key={route.view} />
        </main>
      </div>

      {panel && <LoopPanel id={panel} onClose={() => setPanel(null)} />}
      {capture && <QuickCapture preset={capture} onClose={() => setCapture(null)} />}
      {resched && <RescheduleDialog id={resched} onClose={() => setResched(null)} />}
      {closing && <CloseDialog id={closing} onClose={() => setClosing(null)} />}
      {confirm && <ConfirmDialog opts={confirm.opts} onDone={(v) => { confirm.resolve(v); setConfirm(null); }} />}

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.text}</span>
            {t.action && <button className="btn sm" onClick={() => { t.action.onClick(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>{t.action.label}</button>}
            <button className="icon-btn" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><Icon name="x" size={14} /></button>
          </div>
        ))}
      </div>
    </UICtx.Provider>
  );
}
