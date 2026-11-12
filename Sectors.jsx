import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { useUI, Modal, Field, Icon, SectorDot, Empty } from '../ui.jsx';
import { isClosed } from '../lib/model.js';

const SWATCHES = ['#a78bfa', '#c084fc', '#e879f9', '#f9a8d4', '#fb7185', '#f87171', '#fdba74', '#fcd34d', '#6ee7b7', '#5eead4', '#38bdf8', '#60a5fa'];

function SectorForm({ sector, onClose }) {
  const { sectors, actions } = useStore();
  const [name, setName] = useState(sector?.name || '');
  const [color, setColor] = useState(sector?.color || SWATCHES[sectors.length % SWATCHES.length]);
  const [clinical, setClinical] = useState(!!sector?.clinical);
  const [err, setErr] = useState('');
  const save = () => {
    const n = name.trim();
    if (!n) return setErr('A sector needs a name.');
    if (sectors.some((s) => s.id !== sector?.id && s.name.toLowerCase() === n.toLowerCase())) return setErr('There is already a sector with this name.');
    actions.saveSector({ ...(sector || {}), name: n, color, clinical });
    onClose();
  };
  return (
    <Modal title={sector ? 'Edit sector' : 'New sector'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save sector</button></>}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Name" warn={err}><input data-autofocus value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setErr(''); }} /></Field>
        <div className="field">
          <span className="field-label">Colour</span>
          <div className="swatches">
            {SWATCHES.map((c) => <button type="button" key={c} className={'swatch' + (c === color ? ' on' : '')} style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={c === color} onClick={() => setColor(c)} />)}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Custom colour" />
          </div>
        </div>
        <label className="check"><input type="checkbox" checked={clinical} onChange={(e) => setClinical(e.target.checked)} /> Offer appointment tracking on loops in this sector</label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function Sectors() {
  const { loops, sectors, actions } = useStore();
  const ui = useUI();
  const [edit, setEdit] = useState(null); // sector | 'new'
  const live = sectors.filter((s) => !s.archived).sort((a, b) => a.order - b.order);
  const archived = sectors.filter((s) => s.archived);
  const n = (s, f) => loops.filter((l) => l.sectorIds.includes(s.id) && f(l)).length;
  const archive = async (s) => {
    const open = n(s, (l) => !isClosed(l));
    if (await ui.confirm({ title: `Archive “${s.name}”?`, body: `It disappears from pickers and filters. ${open ? `Its ${open} open loop(s) keep the label and stay exactly where they are.` : 'No loops are affected.'} You can restore it any time.`, confirmLabel: 'Archive sector' })) {
      actions.saveSector({ ...s, archived: true });
      ui.toast(`Archived “${s.name}”.`, { label: 'Undo', onClick: () => actions.saveSector({ ...s, archived: false }) });
    }
  };
  return (
    <div className="view">
      <header className="view-head">
        <div><h1>Sectors</h1><p className="muted">Areas of your life. Labels on loops, not separate lists — a loop can sit in several.</p></div>
        <button className="btn primary" onClick={() => setEdit('new')}><Icon name="plus" size={16} /> New sector</button>
      </header>
      {live.length ? (
        <div className="sector-grid">
          {live.map((s) => (
            <article key={s.id} className="card sector-card" style={{ '--c': s.color }}>
              <h2><SectorDot color={s.color} /> {s.name}</h2>
              <p className="sector-nums"><strong>{n(s, (l) => !isClosed(l))}</strong> open<span>·</span><strong>{n(s, (l) => l.stage === 'STUCK')}</strong> stuck<span>·</span><strong>{n(s, isClosed)}</strong> closed</p>
              <div className="row-btns">
                <button className="btn sm" onClick={() => ui.nav('loops', { sector: s.id })}>View loops</button>
                <button className="btn sm ghost" onClick={() => ui.capture({ sector: s.id })}>Capture</button>
                <button className="btn sm ghost" onClick={() => setEdit(s)}>Edit</button>
                <button className="btn sm ghost" onClick={() => archive(s)}>Archive</button>
              </div>
            </article>
          ))}
        </div>
      ) : <section className="card"><Empty icon="grid" title="No sectors">Create one to start organising loops by area of life.</Empty></section>}
      {archived.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>Archived sectors</h2></div>
          <ul className="plain-list">
            {archived.map((s) => <li key={s.id}><span><SectorDot color={s.color} /> {s.name}</span><button className="btn sm" onClick={() => actions.saveSector({ ...s, archived: false })}>Restore</button></li>)}
          </ul>
        </section>
      )}
      {edit && <SectorForm sector={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
