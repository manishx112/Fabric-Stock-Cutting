/* Pure helpers — server aur client dono jagah kaam karte hain. */

export const LOCALE = 'en-IN';                 // 2,11,614 — Indian grouping. 'en-US' = 211,614
const NF = new Intl.NumberFormat(LOCALE);

export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const MFULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export const nfmt = (v) => NF.format(Math.round(Number(v) || 0));

export function compact(v) {
  v = Number(v) || 0;
  if (Math.abs(v) >= 100000) return (v / 100000).toFixed(2) + ' L';
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'K';
  return String(Math.round(v));
}

export const fmt = (d) =>
  d ? String(d.getDate()).padStart(2, '0') + ' ' + MONTHS[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2) : '—';

export const mkey = (d) => (d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') : '');
export const mlabel = (k) => { const p = String(k).split('-'); return MONTHS[+p[1] - 1] + " '" + p[0].slice(2); };
export const iso = (d) =>
  d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : '';

export const days = (a, b) => Math.round((b - a) / 86400000);
export const pctOf = (a, b) => (b ? (a / b) * 100 : 0);
export const sum = (a, f) => a.reduce((t, x) => t + (f ? f(x) : x), 0);

export function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function parseDate(s) {
  if (s instanceof Date) return isNaN(s) ? null : s;
  s = String(s || '').trim();
  if (!s) return null;
  /* Sheet se "21/12/2025 11:17:43" jaisa timestamp bhi aata hai (getDisplayValues).
     Time hissa pehle alag karte hain — warna neeche ka new Date() fallback ise US m/d/y
     maan leta hai: "05/08/2026 09:15:00" -> 8 May, chup-chaap galat mahina. */
  const dpart = s.split(/[ T]/)[0];
  let m = dpart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = dpart.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]); }
  m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-]+(\d{4})$/);
  if (m) {
    const mi = MONTHS.map((x) => x.toLowerCase()).indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return new Date(+m[3], mi, +m[1]);
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

export function toNum(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v || '').replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

export function monthIdx(s) {
  s = String(s || '').trim().toLowerCase();
  if (!s) return 0;
  for (let i = 0; i < 12; i++) if (MFULL[i].toLowerCase() === s || MONTHS[i].toLowerCase() === s) return i + 1;
  return 0;
}

/* CSV text -> array of objects (Apps Script CSV export ya manual upload ke liye) */
export function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim());
  return rows.filter((r) => r.join('').trim()).map((r) => {
    const o = {};
    head.forEach((h, j) => { o[h] = (r[j] || '').trim(); });
    return o;
  });
}

/* chart helpers */
export function niceMax(v) {
  if (v <= 0) return 10;
  const e = Math.pow(10, Math.floor(Math.log10(v))), n = v / e;
  const s = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 7.5 ? 7.5 : 10;
  return s * e;
}

export function barPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}a${r},${r} 0 0 1 ${r},-${r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}V${y + h}Z`;
}

/* horizontal bar, rounded on the leading (right) edge — x,y is the top-left corner, w is the length */
export function hBarPath(x, y, w, h, r) {
  if (w <= 0) return '';
  r = Math.min(r, h / 2, w / 2);
  return `M${x},${y}H${x + w - r}a${r},${r} 0 0 1 ${r},${r}V${y + h - r}a${r},${r} 0 0 1 ${-r},${r}H${x}Z`;
}

/* Roll cutting hoti hai teen jagah — labels yahan se aate hain */
export const LOCS = {
  'Ladies Gandhi nagar': { short: 'GN Ladies', title: 'Gandhi Nagar — Ladies', code: 'LGN', color: 'var(--s-in)', blurb: 'Ladies denim ki main cutting line' },
  'Mens Gandhi nagar':   { short: 'GN Mens',   title: 'Gandhi Nagar — Mens',   code: 'MGN', color: 'var(--s-cut)', blurb: 'Mens denim cutting, same premises' },
  'G-104 Roll cut':      { short: 'G-104',     title: 'G-104 roll cutting unit', code: 'G104', color: 'var(--s-bal)', blurb: 'Alag unit — roll cut aur stock holding' }
};
export const locMeta = (name) => LOCS[name] || { short: name, title: name, code: name, color: 'var(--s-in)', blurb: '' };
export const LOC_ORDER = ['Ladies Gandhi nagar', 'Mens Gandhi nagar', 'G-104 Roll cut'];

/* Apps Script / upload se aaya text -> normalise() ke laayak payload.
   Chaar shapes chalte hain:
     [ {...} ]                       bare records array
     { data|records|rolls: [ ... ] } wrapper (Apps Script { status, total, data })
     { sheets, types, rows }         compact snapshot
     CSV text                        baaki sab
   Kuch samajh na aaye to null — caller error throw karta hai. */
export function parsePayload(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (t[0] !== '[' && t[0] !== '{') return parseCSV(t);
  const j = JSON.parse(t);
  if (Array.isArray(j)) return j;
  if (j && j.rows && j.sheets) return j;
  for (const k of ['data', 'records', 'rolls']) if (j && Array.isArray(j[k])) return j[k];
  return null;
}

/* payload me kitne roll hain (dono shapes ke liye) */
export const payloadCount = (p) => (Array.isArray(p) ? p.length : p && p.rows ? p.rows.length : 0);
