/* Loop — util.js: dates, DOM helper, icons, export helpers. No dependencies. */
(function () {
  'use strict';
  const L = (window.Loop = window.Loop || {});
  const U = (L.U = {});
  const pad = (n) => String(n).padStart(2, '0');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  U.MONTHS = MONTHS; U.MONTHS_LONG = MONTHS_LONG; U.DAYS = DAYS;

  U.uid = (p) => (p || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* ---------- dates: all calendar dates are local 'YYYY-MM-DD' strings ---------- */
  U.ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  U.today = () => U.ymd(new Date());
  U.nowISO = () => new Date().toISOString();
  U.nowLocal = () => { const d = new Date(); return U.ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  U.parse = (s) => { const p = String(s).slice(0, 10).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  U.isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(U.parse(s).getTime());
  U.addDays = (s, n) => { const d = U.parse(s); d.setDate(d.getDate() + n); return U.ymd(d); };
  U.addMonths = (s, n) => {
    const d = U.parse(s); const day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last)); return U.ymd(d);
  };
  U.diffDays = (a, b) => Math.round((U.parse(b) - U.parse(a)) / 864e5);
  U.monthKey = (s) => String(s).slice(0, 7);
  U.monthName = (key) => MONTHS_LONG[Number(key.slice(5, 7)) - 1] + ' ' + key.slice(0, 4);
  U.startOfWeek = (s, weekStart) => { const d = U.parse(s); const diff = (d.getDay() - weekStart + 7) % 7; return U.addDays(s, -diff); };
  U.isoToYmd = (iso) => (iso ? U.ymd(new Date(iso)) : '');

  const settings = () => (L.S && L.S.state.settings) || {};
  U.fmtDate = (s, withYear) => {
    if (!s) return '';
    const d = U.parse(s); const f = settings().dateFormat || 'dmy';
    if (f === 'iso') return String(s).slice(0, 10);
    const y = withYear || d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() : '';
    if (f === 'mdy') return MONTHS[d.getMonth()] + ' ' + d.getDate() + (y ? ', ' + y : '');
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + (y ? ' ' + y : '');
  };
  U.fmtDay = (s) => (s ? DAYS[U.parse(s).getDay()] + ', ' + U.fmtDate(s) : '');
  U.fmtTime = (hm) => {
    if (!hm) return '';
    const p = hm.split(':').map(Number);
    if ((settings().timeFormat || '24') === '24') return pad(p[0]) + ':' + pad(p[1]);
    return (p[0] % 12 || 12) + ':' + pad(p[1]) + (p[0] < 12 ? ' am' : ' pm');
  };
  U.fmtLocalDT = (s) => (s ? U.fmtDate(s.slice(0, 10)) + ', ' + U.fmtTime(s.slice(11, 16)) : '');
  U.fmtStamp = (iso) => { if (!iso) return ''; const d = new Date(iso); return U.fmtDate(U.ymd(d), true) + ', ' + U.fmtTime(pad(d.getHours()) + ':' + pad(d.getMinutes())); };
  U.rel = (s) => {
    if (!s) return '';
    const n = U.diffDays(U.today(), s);
    if (n === 0) return 'today'; if (n === 1) return 'tomorrow'; if (n === -1) return 'yesterday';
    return n > 0 ? 'in ' + n + ' days' : -n + ' days ago';
  };
  U.mins = (m) => {
    m = Math.round(Number(m) || 0); if (!m) return '0 m';
    const hh = Math.floor(m / 60), mm = m % 60;
    return (hh ? hh + ' h' : '') + (hh && mm ? ' ' : '') + (mm ? mm + ' m' : '');
  };
  U.median = (arr) => {
    if (!arr.length) return null;
    const a = arr.slice().sort((x, y) => x - y); const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  };
  U.clone = (o) => JSON.parse(JSON.stringify(o));
  U.plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');

  /* ---------- DOM ---------- */
  const PROPS = { value: 1, checked: 1, selected: 1, disabled: 1, indeterminate: 1 };
  function append(el, c) {
    if (c == null || c === false || c === true) return;
    if (Array.isArray(c)) { c.forEach((x) => append(el, x)); return; }
    el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  U.h = function (tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (PROPS[k]) el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  };

  const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    loop: '<path d="M7 8c-2.5 0-4 1.8-4 4s1.5 4 4 4c4 0 6-8 10-8 2.500 0 4 1.800 4 4s-1.500 4-4 4c-4 0-6-8-10-8z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    sectors: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    gift: '<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 13h18M12 9v12M12 9c-2-4-7-3-5 0M12 9c2-4 7-3 5 0"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.900 4.900l2.100 2.100M17 17l2.100 2.100M4.900 19.100L7 17M17 7l2.100-2.100"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.300-4.300"/>',
    dots: '<circle cx="5" cy="12" r="1.400"/><circle cx="12" cy="12" r="1.400"/><circle cx="19" cy="12" r="1.400"/>',
    check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.500v5M12 16v.500"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
    bell: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 21h4"/>',
    left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M4 20h16"/>',
    upload: '<path d="M12 16V5M7 9l5-5 5 5M4 20h16"/>',
    spark: '<path d="M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800z"/><path d="M19 15l.700 2 2 .700-2 .700-.700 2-.700-2-2-.700 2-.700z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    repeat: '<path d="M4 12a8 8 0 0114-5l2 2M20 12a8 8 0 01-14 5l-2-2M20 4v5h-5M4 20v-5h5"/>',
    up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>'
  };
  U.icon = (name, size) => {
    const s = size || 18;
    const span = document.createElement('span');
    span.className = 'ico'; span.setAttribute('aria-hidden', 'true');
    span.innerHTML = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
    return span;
  };

  /* ---------- export helpers ---------- */
  U.download = (filename, text, mime) => {
    const blob = new Blob([text], { type: mime || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
  };
  U.csv = (rows) => rows.map((r) => r.map((c) => {
    let v = c == null ? '' : String(c);
    if (/^[=+\-@]/.test(v)) v = "'" + v; // stop spreadsheet apps treating text as a formula
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }).join(',')).join('\r\n');
})();
