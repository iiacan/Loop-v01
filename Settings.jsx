import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { useUI, Modal, Field, BlurInput, Icon } from '../ui.jsx';
import { RewardEditor } from './Rewards.jsx';
import { today, fmtStamp, nowISO } from '../lib/dates.js';
import { APP_VERSION, SCHEMA_VERSION } from '../lib/model.js';
import { buildBackup, backupFilename, download, validateBackup, loopsToCSV, exportLoopsJSON } from '../lib/backup.js';

export function downloadBackup(store) {
  download(backupFilename(), JSON.stringify(buildBackup(store), null, 2));
  store.actions.saveApp({ lastBackupAt: nowISO() });
}

function RestoreDialog({ file, onClose }) {
  const store = useStore();
  const ui = useUI();
  const { result, name } = file;
  const [mode, setMode] = useState('merge');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const s = result.summary;
  const run = async () => {
    setBusy(true);
    try {
      if (mode === 'replace') {
        await store.actions.replaceAll(result.data);
        ui.toast(`Restored ${s.loops} loops from the backup. Previous data was replaced.`);
      } else {
        const st = await store.actions.mergeAll(result.data);
        ui.toast(`Merged: ${st.loops.added} loops added, ${st.loops.updated} updated, ${st.sectors.added} sectors added.`);
      }
      onClose();
    } catch (e) {
      setBusy(false);
      ui.toast('The restore failed and nothing was changed: ' + (e?.message || e));
    }
  };
  if (!result.ok)
    return (
      <Modal title="This backup can’t be restored" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>OK</button>}>
        <p className="lede">{name}</p>
        <ul className="recs">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        <p className="muted small">Nothing was changed.</p>
      </Modal>
    );
  return (
    <Modal title="Restore from backup" onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>Cancel</button>
      <button className={'btn ' + (mode === 'replace' ? 'danger' : 'primary')} disabled={busy || (mode === 'replace' && !sure)} onClick={run}>{mode === 'replace' ? 'Replace everything' : 'Merge into my data'}</button>
    </>}>
      <p className="lede">{name}</p>
      <dl className="kv">
        <dt>Exported</dt><dd>{s.exportedAt ? fmtStamp(s.exportedAt, store.settings) : 'Unknown'}</dd>
        <dt>Format</dt><dd>Schema v{s.schemaVersion}{s.appVersion ? ` · Loop ${s.appVersion}` : ''} — compatible</dd>
        <dt>Loops</dt><dd>{s.loops} ({s.open} open) with {s.steps} steps and {s.history} history entries</dd>
        <dt>Sectors</dt><dd>{s.sectors}</dd>
        <dt>Monthly plans</dt><dd>{s.plans}</dd>
      </dl>
      {result.warnings.map((w, i) => <p key={i} className="field-warn">{w}</p>)}
      <fieldset className="choices">
        <legend>How should it be imported?</legend>
        <label className={'choice' + (mode === 'merge' ? ' on' : '')}><input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} /><span><strong>Merge</strong><small>Adds anything from the backup that isn’t here. Where a loop exists in both, the most recently edited version is kept. Nothing is deleted; your settings stay as they are.</small></span></label>
        <label className={'choice' + (mode === 'replace' ? ' on' : '')}><input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /><span><strong>Replace</strong><small>Erases everything currently in this browser — {store.loops.length} loops, sectors, plans and settings — and loads the backup instead.</small></span></label>
      </fieldset>
      {mode === 'replace' && (
        <div className="banner review col">
          <span>This cannot be undone. Download a backup of the current data first if there is any chance you want it.</span>
          <button className="btn sm" onClick={() => downloadBackup(store)}><Icon name="download" size={14} /> Download current data first</button>
          <label className="check"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> I understand the current data will be erased</label>
        </div>
      )}
    </Modal>
  );
}

function Toggle({ k, children }) {
  const { settings, actions } = useStore();
  return <label className="check"><input type="checkbox" checked={!!settings[k]} onChange={(e) => actions.saveSettings({ [k]: e.target.checked })} /> {children}</label>;
}
function Select({ k, label, opts, num }) {
  const { settings, actions } = useStore();
  return <Field label={label}><select value={settings[k]} onChange={(e) => actions.saveSettings({ [k]: num ? Number(e.target.value) : e.target.value })}>{opts.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></Field>;
}

export default function Settings() {
  const store = useStore();
  const { loops, sectors, plans, settings, app, storage, actions } = store;
  const ui = useUI();
  const set = actions.saveSettings;
  const fileRef = useRef(null);
  const [restore, setRestore] = useState(null);
  const [est, setEst] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  useEffect(() => {
    navigator.storage?.estimate?.().then(setEst).catch(() => {});
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
  }, [loops.length]);

  const onFile = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let result;
    try {
      if (f.size > 50 * 1024 * 1024) throw new Error('The file is larger than 50 MB.');
      result = validateBackup(JSON.parse(await f.text()));
    } catch (err) {
      result = { ok: false, errors: [err instanceof SyntaxError ? 'The file is not valid JSON. It may be damaged or not a Loop backup.' : String(err.message || err)], warnings: [] };
    }
    setRestore({ name: f.name, result });
  };
  const askNotify = async () => {
    if (typeof Notification === 'undefined') return ui.toast('This browser does not support notifications.');
    const p = await Notification.requestPermission();
    setPerm(p);
    set({ browserNotifications: p === 'granted' });
    ui.toast(p === 'granted' ? 'Browser notifications are on while Loop is open.' : 'Notifications were not allowed. In-app reminders still work.');
  };
  const sample = loops.filter((l) => l.sample).length;
  return (
    <div className="view settings">
      <header className="view-head"><div><h1>Settings</h1><p className="muted">Changes save as you make them.</p></div></header>

      <section className="card">
        <div className="card-head"><h2><Icon name="download" /> Your data: backup &amp; restore</h2></div>
        <p>Everything in Loop lives in this browser on this device. A backup is a single JSON file that you own and can keep anywhere.</p>
        <div className="row-btns">
          <button className="btn primary lg" onClick={() => { downloadBackup(store); ui.toast('Backup downloaded. Keep it somewhere outside this browser.'); }}><Icon name="download" /> Download Backup</button>
          <button className="btn lg" onClick={() => fileRef.current.click()}><Icon name="upload" /> Restore from backup…</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFile} />
        </div>
        <p className="muted small">Last backup: {app.lastBackupAt ? fmtStamp(app.lastBackupAt, settings) : 'never'}. Each download is a new dated file (loop-backup-{today()}.json); Loop never overwrites an earlier backup.</p>
        <div className="form grid2">
          <Select k="backupReminderDays" num label="Remind me to back up" opts={[[0, 'Never'], [1, 'Every day'], [7, 'Every week'], [14, 'Every two weeks'], [30, 'Every month']]} />
        </div>
        <h3>Export</h3>
        <p className="muted small">For spreadsheets or other tools. Filtered exports and single-loop exports are available from My Loops and from each loop.</p>
        <div className="row-btns">
          <button className="btn sm" onClick={() => download(`loop-all-loops-${today()}.csv`, loopsToCSV(loops, sectors), 'text/csv')} disabled={!loops.length}><Icon name="download" size={14} /> All loops as CSV</button>
          <button className="btn sm" onClick={() => download(`loop-all-loops-${today()}.json`, exportLoopsJSON(loops, sectors))} disabled={!loops.length}><Icon name="download" size={14} /> All loops as JSON</button>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>Where your data is stored</h2></div>
        <dl className="kv">
          <dt>Storage method</dt><dd>{storage?.label}</dd>
          <dt>Contents</dt><dd>{loops.length} loops · {sectors.length} sectors · {plans.length} monthly plans</dd>
          {est?.usage != null && <><dt>Space used by this site</dt><dd>{(est.usage / 1048576).toFixed(2)} MB</dd></>}
          <dt>Protected from automatic clearing</dt><dd>{persisted == null ? 'Unknown in this browser' : persisted ? 'Yes' : 'No'}{persisted === false && navigator.storage?.persist && <> <button className="btn sm" onClick={async () => { const ok = await navigator.storage.persist(); setPersisted(ok); ui.toast(ok ? 'The browser agreed to keep Loop’s data.' : 'The browser declined for now. Keep regular backups.'); }}>Ask the browser to keep it</button></>}</dd>
        </dl>
        <ul className="recs">
          <li>Data does not sync between devices or browsers. Your phone and your laptop each hold their own separate copy.</li>
          <li>GitHub Pages only delivers the app’s code. It never receives, stores or synchronises your loops.</li>
          <li>Clearing this browser’s site data, or uninstalling the browser, erases your loops. If there is no backup file, they cannot be recovered.</li>
          <li>To move to another device: download a backup here, then restore it there.</li>
        </ul>
      </section>

      <section className="card">
        <div className="card-head"><h2>You</h2></div>
        <div className="form grid2">
          <Field label="Name" hint="Used in the greeting."><BlurInput value={settings.name} maxLength={40} onCommit={(v) => set({ name: v })} /></Field>
          <Field label="Custom greeting" hint="Leave empty for “Good morning / afternoon / evening”."><BlurInput value={settings.greeting} maxLength={40} placeholder="e.g. Welcome back" onCommit={(v) => set({ greeting: v })} /></Field>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>Dates, time &amp; appearance</h2></div>
        <div className="form grid3">
          <Select k="dateFormat" label="Date format" opts={[['dmy', '31 Aug 2026'], ['mdy', 'Aug 31, 2026'], ['iso', '2026-08-31']]} />
          <Select k="timeFormat" label="Time format" opts={[['12', '2:30 pm'], ['24', '14:30']]} />
          <Select k="weekStart" num label="Week starts on" opts={[[1, 'Monday'], [0, 'Sunday'], [6, 'Saturday']]} />
          <Select k="theme" label="Theme" opts={[['dark', 'Dark'], ['light', 'Light'], ['auto', 'Match device']]} />
        </div>
        <Toggle k="reduceMotion">Reduce animations</Toggle>
      </section>

      <section className="card">
        <div className="card-head"><h2><Icon name="bell" /> Reminders &amp; notifications</h2></div>
        <Toggle k="inAppReminders">Show reminders inside Loop when they come due</Toggle>
        <div className="row-btns">
          <span>Browser notifications: <strong>{perm === 'granted' && settings.browserNotifications ? 'on' : perm === 'denied' ? 'blocked in browser settings' : perm === 'unsupported' ? 'not supported here' : 'off'}</strong></span>
          {perm === 'granted' ? <button className="btn sm" onClick={() => set({ browserNotifications: !settings.browserNotifications })}>{settings.browserNotifications ? 'Turn off' : 'Turn on'}</button> : perm !== 'unsupported' && <button className="btn sm" onClick={askNotify}>Allow notifications</button>}
        </div>
        <p className="muted small">Reminders fire only while Loop is open in a tab. A static web app cannot notify you when the browser is closed; that needs a future backend or native app.</p>
        <Toggle k="defaultReminder">Add a reminder automatically when a loop gets an expected date</Toggle>
        {settings.defaultReminder && (
          <div className="form grid2">
            <Select k="defaultReminderDaysBefore" num label="When" opts={[[0, 'On the day'], [1, 'The day before'], [2, 'Two days before'], [7, 'A week before']]} />
            <Field label="At"><input type="time" value={settings.defaultReminderTime} onChange={(e) => set({ defaultReminderTime: e.target.value || '09:00' })} /></Field>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head"><h2>Planning &amp; rewards</h2></div>
        <div className="form grid2">
          <Field label="Realistic focused time per day (minutes)" hint="Loop flags a day’s plan that goes beyond this."><BlurInput number value={settings.dailyCapacityMinutes} onCommit={(v) => set({ dailyCapacityMinutes: v || 0 })} /></Field>
        </div>
        <h3>Default reward milestones</h3>
        <p className="muted small">Used as the starting point when you set up a new month.</p>
        <RewardEditor key={JSON.stringify(settings.rewardDefaults)} value={settings.rewardDefaults || []} saveLabel="Save defaults" onSave={(r) => { set({ rewardDefaults: r.map(({ threshold, title }) => ({ threshold, title })) }); ui.toast('Default rewards saved.'); }} />
      </section>

      <section className="card">
        <div className="card-head"><h2>Sectors</h2></div>
        <p className="muted small">{sectors.filter((s) => !s.archived).length} active sectors.</p>
        <button className="btn sm" onClick={() => ui.nav('sectors')}>Manage sectors <Icon name="chevR" size={14} /></button>
      </section>

      <section className="card">
        <div className="card-head"><h2>Data housekeeping</h2></div>
        <div className="row-btns">
          <button className="btn sm" disabled={!sample} onClick={async () => { if (await ui.confirm({ title: 'Remove sample data?', body: `${sample} sample loop(s) and the sample monthly plan will be removed. Anything you created stays.`, confirmLabel: 'Remove sample data' })) { await actions.removeSampleData(); ui.toast('Sample data removed.'); } }}>{sample ? `Remove sample data (${sample} loops)` : 'No sample data left'}</button>
          <button className="btn sm danger" onClick={async () => { if (await ui.confirm({ title: 'Erase all Loop data in this browser?', body: `All ${loops.length} loops, their history and all monthly plans will be erased. Settings are kept. This cannot be undone — download a backup first if unsure.`, confirmLabel: 'Erase everything', danger: true, typed: 'ERASE' })) { await actions.eraseAll(); ui.toast('All loop data erased.'); } }}>Erase all data…</button>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>About</h2></div>
        <dl className="kv">
          <dt>Application</dt><dd>Loop {APP_VERSION} — Keep the thread.</dd>
          <dt>Data schema</dt><dd>v{SCHEMA_VERSION}</dd>
          <dt>First opened here</dt><dd>{app.firstRunAt ? fmtStamp(app.firstRunAt, settings) : '—'}</dd>
          <dt>Shortcuts</dt><dd><kbd>N</kbd> quick capture · <kbd>/</kbd> search loops · <kbd>Esc</kbd> close a dialog</dd>
        </dl>
      </section>

      {restore && <RestoreDialog file={restore} onClose={() => setRestore(null)} />}
    </div>
  );
}
