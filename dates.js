// Local date/time helpers. Dates are stored as local 'YYYY-MM-DD' strings,
// times as 'HH:mm', and history timestamps as full ISO strings.
export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISO(new Date());
export const nowISO = () => new Date().toISOString();
export const parse = (s) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const addMonths = (s, n) => {
  const d = parse(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
};
/** a - b in whole days */
export const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
export const monthKey = (s = today()) => s.slice(0, 7);
export const stampDay = (iso) => toISO(new Date(iso));

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmtDate(s, st = {}, o = {}) {
  if (!s) return '';
  const d = parse(s);
  const y = d.getFullYear();
  const f = st.dateFormat || 'dmy';
  if (f === 'iso') return (o.dow ? DOW[d.getDay()] + ' ' : '') + toISO(d);
  const showY = o.year ?? y !== new Date().getFullYear();
  const m = MON[d.getMonth()];
  const day = d.getDate();
  const core = f === 'mdy' ? `${m} ${day}` : `${day} ${m}`;
  const out = showY ? (f === 'mdy' ? `${core}, ${y}` : `${core} ${y}`) : core;
  return o.dow ? `${DOW[d.getDay()]} ${out}` : out;
}
export function fmtTime(hm, st = {}) {
  if (!hm) return '';
  if (st.timeFormat === '24') return hm;
  let [h, m] = hm.split(':').map(Number);
  const ap = h < 12 ? 'am' : 'pm';
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${ap}`;
}
export function fmtStamp(iso, st) {
  const d = new Date(iso);
  return `${fmtDate(toISO(d), st)}, ${fmtTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`, st)}`;
}
export function relDay(s, t = today()) {
  const n = diffDays(s, t);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
export const fmtMin = (m) => {
  m = Math.round(Number(m) || 0);
  if (!m) return '';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h} h ${r} m` : `${h} h`) : `${r} m`;
};
export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
export function shiftMonth(key, n) {
  return addMonths(key + '-01', n).slice(0, 7);
}
export function startOfWeek(s, weekStart = 1) {
  const d = parse(s);
  return addDays(s, -((d.getDay() - weekStart + 7) % 7));
}
export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
