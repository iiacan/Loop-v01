// Small shared UI primitives: icons, modal, inputs, badges, menus.
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { STAGE_LABEL, RESOLUTIONS } from './lib/model.js';

export const UICtx = createContext(null);
export const useUI = () => useContext(UICtx);

const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
  loop: 'M12 12c-2-2.700-3.500-4-5.500-4a4 4 0 100 8c2 0 3.500-1.300 5.500-4zm0 0c2 2.700 3.500 4 5.500 4a4 4 0 100-8c-2 0-3.500 1.300-5.500 4z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  gift: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.500-3-5-3.500-5-1.500S9 7 12 7zM12 7c1.500-3 5-3.500 5-1.500S15 7 12 7z',
  settings: 'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4M14 4v4M6 10v4M12 16v4',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.500l4.500 4.500L19 7.500',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  pause: 'M12 3a9 9 0 100 18 9 9 0 000-18zM10 9v6M14 9v6',
  alert: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7.500v5.500M12 16.200v.300',
  target: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8z',
  checkc: 'M12 3a9 9 0 100 18 9 9 0 000-18zM8 12.300l2.700 2.700L16 9.500',
  dots: 'M5 12h.010M12 12h.010M19 12h.010',
  chevR: 'M9 5l7 7-7 7',
  chevL: 'M15 5l-7 7 7 7',
  chevD: 'M5 9l7 7 7-7',
  chevU: 'M5 15l7-7 7 7',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
  download: 'M12 4v11M7 11l5 5 5-5M4 20h16',
  upload: 'M12 16V5M7 9l5-5 5 5M4 20h16',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  sparkle: 'M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800zM19 16l.700 2 2 .700-2 .700-.700 2-.700-2-2-.700 2-.700z',
  bell: 'M6 16v-5a6 6 0 1112 0v5l2 2H4zM10 20a2 2 0 004 0',
  menu: 'M4 6h16M4 12h16M4 18h16',
  undo: 'M8 6L4 10l4 4M4 10h11a5 5 0 010 10h-3',
  flag: 'M5 21V4M5 4h12l-2 4 2 4H5',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.500 1.500M17.500 17.500L19 19M5 19l1.500-1.500M17.500 6.500L19 5',
};
export const Icon = ({ name, size = 18, className = '' }) => (
  <svg className={'icon ' + className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'dots' ? 2.6 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[name] || ''} />
  </svg>
);
export const Logo = ({ size = 34 }) => {
  const id = React.useId();
  return (
  <svg width={size} height={size * 0.6} viewBox="0 0 40 24" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={id} x1="0" x2="1"><stop offset="0" stopColor="#f0abfc" /><stop offset="1" stopColor="#a78bfa" /></linearGradient>
    </defs>
    <path d="M20 12c-3.500-4.800-6-7-9.500-7a7 7 0 100 14c3.500 0 6-2.200 9.500-7zm0 0c3.500 4.800 6 7 9.500 7a7 7 0 100-14c-3.500 0-6 2.200-9.500 7z" stroke={`url(#${id})`} strokeWidth="3" strokeLinecap="round" />
  </svg>
  );
};

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible dialog: Esc closes, focus is trapped and restored. */
export function Modal({ title, onClose, children, footer, wide, drawer, labelledBy }) {
  const box = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const el = box.current;
    (el.querySelector('[data-autofocus]') || el.querySelector(FOCUSABLE) || el).focus();
    const key = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        // only the top-most dialog reacts
        const all = document.querySelectorAll('.modal-box');
        if (all[all.length - 1] === el) { e.preventDefault(); onClose(); }
      }
      if (e.key === 'Tab') {
        const f = [...el.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
        if (!f.length || !el.contains(document.activeElement)) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prev?.focus?.(); };
  }, []);
  return (
    <div className={'overlay' + (drawer ? ' overlay-drawer' : '')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className={'modal-box' + (wide ? ' wide' : '') + (drawer ? ' drawer' : '')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export const Field = ({ label, hint, warn, children, className = '' }) => (
  <label className={'field ' + className}>
    <span className="field-label">{label}</span>
    {children}
    {hint && <span className="field-hint">{hint}</span>}
    {warn && <span className="field-warn">{warn}</span>}
  </label>
);

/** Text input that saves when you leave it (or press Enter). */
export function BlurInput({ value, onCommit, multiline, number, ...rest }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  const commit = () => {
    const out = number ? (v === '' ? null : Number(v)) : typeof v === 'string' ? v.trim() : v;
    if (number && out != null && (Number.isNaN(out) || out < 0)) return setV(value ?? '');
    if (out !== (value ?? (number ? null : ''))) onCommit(out);
  };
  const props = { value: v, onChange: (e) => setV(e.target.value), onBlur: commit, ...rest };
  if (multiline) return <textarea rows={3} {...props} />;
  return <input type={number ? 'number' : 'text'} min={number ? 0 : undefined} {...props} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />;
}

export const StageBadge = ({ loop }) => (
  <span className={'badge stage-' + loop.stage.toLowerCase()}>
    {loop.stage === 'CLOSED' ? RESOLUTIONS[loop.resolution]?.label || 'Closed' : STAGE_LABEL[loop.stage]}
  </span>
);
export const SectorDot = ({ color }) => <span className="dot" style={{ background: color }} />;
export const SectorTags = ({ sectors }) =>
  sectors.length ? (
    <span className="sector-tags">
      {sectors.map((s) => (
        <span key={s.id} className="sector-tag" style={{ color: s.color }}><SectorDot color={s.color} />{s.name}</span>
      ))}
    </span>
  ) : <span className="muted">—</span>;

export const Empty = ({ icon = 'loop', title, children }) => (
  <div className="empty">
    <Icon name={icon} size={28} />
    <strong>{title}</strong>
    {children && <p>{children}</p>}
  </div>
);

/** Popover menu positioned next to its trigger (fixed, so tables can't clip it). */
export function Menu({ label = 'More actions', icon = 'dots', items }) {
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const pop = useRef(null);
  useLayoutEffect(() => {
    if (!pos || !pop.current) return;
    const r = pop.current.getBoundingClientRect();
    const b = btn.current.getBoundingClientRect();
    let top = b.bottom + 6, left = b.right - r.width;
    if (top + r.height > innerHeight - 8) top = Math.max(8, b.top - r.height - 6);
    if (left < 8) left = 8;
    if (pos.top !== top || pos.left !== left) setPos({ top, left });
    pop.current.querySelector('button')?.focus();
  }, [pos]);
  useEffect(() => {
    if (!pos) return;
    const close = (e) => { if (!pop.current?.contains(e.target) && !btn.current?.contains(e.target)) setPos(null); };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); setPos(null); btn.current?.focus(); } };
    const away = () => setPos(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', away);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', away); };
  }, [!!pos]);
  return (
    <>
      <button ref={btn} className="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={!!pos} onClick={(e) => { e.stopPropagation(); setPos(pos ? null : { top: -999, left: -999 }); }}>
        <Icon name={icon} />
      </button>
      {pos && createPortal(
        <div ref={pop} className="menu" role="menu" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
          {items.filter(Boolean).map((it, i) =>
            it === '-' ? <hr key={i} /> : (
              <button key={i} role="menuitem" className={it.danger ? 'danger' : ''} onClick={() => { setPos(null); it.onClick(); }}>
                {it.icon && <Icon name={it.icon} size={15} />}{it.label}
              </button>
            )
          )}
        </div>,
        document.body
      )}
    </>
  );
}

export const Tabs = ({ tabs, value, onChange, label }) => (
  <div className="tabs" role="tablist" aria-label={label}>
    {tabs.map((t) => (
      <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
        {t.label}{t.count != null && <span className="tab-count">{t.count}</span>}
      </button>
    ))}
  </div>
);

export const Ring = ({ pct, size = 64 }) => {
  const gid = React.useId();
  const r = size / 2 - 5, c = 2 * Math.PI * r;
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}%`}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#f9a8d4" /></linearGradient></defs>
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" strokeWidth="5" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={`url(#${gid})`} strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray={`${(Math.min(pct, 100) / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="ring-text">{pct}%</text>
    </svg>
  );
};

export const Bar = ({ value, max, color }) => (
  <span className="bar"><span style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%`, background: color }} /></span>
);
