'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  nfmt, fmt, iso, mkey, mlabel, parseDate, parsePayload, days, median, pctOf, sum, locMeta, LOC_ORDER
} from '@/lib/format';
import { normalise } from '@/lib/rolls';
import { ChartCard, ComboChart, BarList, MeterRing, HeatMap, Histogram, SparkLine, TrendChart } from './charts';
import { KpiCard, MonthTable, StatusPill, Drawer, Icon } from './ui';

const PRESETS = [
  { k: 'all', label: 'All time' }, { k: '30', label: 'Last 30d' }, { k: '90', label: 'Last 90d' },
  { k: 'mtd', label: 'Latest month' }, { k: 'custom', label: 'Custom' }
];

/* ============================================================================
   POORE DASHBOARD KA EK HI HISAAB HAI — wahi jo har factory ka stock register:

       Opening stock  +  Inward  −  Cutting  =  Closing stock (bacha maal)

   - Inward  : jo maal us period me AAYA (inward date se)
   - Cutting : jo maal us period me KATA (cutting date se; agar register me
               cutting date arrival se pehle likhi hai — jo ho nahi sakta —
               to cutting arrival ke din maani jati hai, isliye ye identity
               har mahine EXACT baithti hai)
   - Stock   : kisi bhi tarikh tak aaya hua maal minus tab tak kata hua maal
   Har KPI, chart, table isi ek hisaab se banta hai — isliye numbers har
   jagah aapas me milte hain.
   ========================================================================= */

export default function Dashboard({ initialPayload, source = 'snapshot', fetchedAt = null, liveConfigured = false, loadError = '' }) {
  /* ── state ── */
  const [payload, setPayload] = useState(initialPayload);
  const [meta2, setMeta2] = useState({ source, fetchedAt });
  const [theme, setTheme] = useState(null);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState({ preset: 'all', from: '', to: '', locs: [], types: [], status: 'all', q: '', topN: 12 });
  const [ui, setUi] = useState({ typeMenu: false, typeQuery: '', health: false, source: false, filters: false });
  const [showInsights, setShowInsights] = useState(false);
  const [typeSort, setTypeSort] = useState({ k: 'cutM', dir: -1 });
  const [drill, setDrill] = useState(null);
  const [drillFilter, setDrillFilter] = useState({ value: '', label: '', status: 'all', month: '', metric: 'cut' });
  const [toast, setToast] = useState('');
  const toastT = useRef(null);
  const drillRollsRef = useRef(null);
  const typeBtn = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 320, maxH: 340 });

  /* Roll-type menu button ke theek neeche khulta hai. Position har scroll/resize par
     dobara naapi jati hai kyunki menu ab body me (portal se) render hota hai — dekhein
     neeche wala comment. */
  useLayoutEffect(() => {
    if (!ui.typeMenu) return;
    const place = () => {
      const r = typeBtn.current?.getBoundingClientRect();
      if (!r) return;
      const w = Math.min(340, window.innerWidth - 20);
      const left = Math.max(10, Math.min(r.left, window.innerWidth - w - 10));
      const below = window.innerHeight - r.bottom - 18;
      const above = r.top - 18;
      const dropDown = below > 260 || below >= above;
      setMenuPos({
        top: dropDown ? r.bottom + 6 : Math.max(10, r.top - Math.min(above, 420) - 6),
        left, width: w,
        maxH: Math.max(220, Math.min(420, dropDown ? below : above))
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [ui.typeMenu]);

  useEffect(() => { setDrillFilter({ value: '', label: '', status: 'all', month: '', metric: 'cut' }); }, [drill]);

  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const say = (msg) => {
    setToast(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(''), 4200);
  };

  useEffect(() => {
    setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);
  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
  };
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setUi((u) => ({ ...u, typeMenu: false, health: false, source: false })); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  /* ── data ── */
  /* Inward date hamesha text ki tarah, dd/mm/yyyy — koi auto-correct nahi.
     normalise() galtiyan pehchanta phir bhi hai (flag), sirf sudhaarta nahi. */
  const all = useMemo(() => normalise(payload), [payload]);

  const meta = useMemo(() => {
    let lo = null, hi = null, lastCut = null;
    all.forEach((r) => {
      [r.inD, r.cutE].forEach((d) => { if (!d) return; if (!lo || d < lo) lo = d; if (!hi || d > hi) hi = d; });
      /* Cutting date bharosemand hai — cutting aaj hoti hai, aage ki nahi. Inward dates me
         hi galti hoti hai (aage ke mahine me chali jati hai), isliye "kaam kahan tak pahuncha"
         ye sabse aakhri CUTTING date se tay karte hain, sabse aakhri date se nahi. */
      if (r.cutD && (!lastCut || r.cutD > lastCut)) lastCut = r.cutD;
    });
    return { rangeFrom: lo, rangeTo: hi, asOf: hi || new Date(), lastCut: lastCut || hi };
  }, [all]);

  const allMonths = useMemo(() => {
    const keys = {};
    all.forEach((r) => { if (r.inM) keys[r.inM] = 1; if (r.cutEM) keys[r.cutEM] = 1; });
    return Object.keys(keys).sort().reverse().map((k) => ({ key: k, label: mlabel(k) }));
  }, [all]);

  const selMonthKey = useMemo(() => {
    if (f.preset !== 'custom' || !f.from || !f.to) return '';
    const fromD = parseDate(f.from), toD = parseDate(f.to);
    if (!fromD || !toD) return '';
    const lastDay = new Date(fromD.getFullYear(), fromD.getMonth() + 1, 0);
    return fromD.getDate() === 1 && iso(toD) === iso(lastDay) ? mkey(fromD) : '';
  }, [f.preset, f.from, f.to]);

  const range = useMemo(() => {
    const asOf = meta.asOf;
    if (f.preset === 'all') return { from: null, to: null };
    if (f.preset === 'custom') return { from: f.from ? parseDate(f.from) : null, to: f.to ? parseDate(f.to) : null };
    if (f.preset === 'mtd') return { from: new Date(asOf.getFullYear(), asOf.getMonth(), 1), to: asOf };
    const n = +f.preset;
    return { from: new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() - n), to: asOf };
  }, [f.preset, f.from, f.to, meta.asOf]);

  const dated = !!(range.from || range.to);
  const rEnd = range.to || meta.asOf;          // stock hamesha is tarikh TAK ginta hai
  const rStart = range.from;                    // flow is tarikh SE ginta hai

  /* Unit / fabric / status / search — date se alag matchers, taaki type-dropdown
     baaki filters se scope ho sake par apne selection se nahi. */
  const matchers = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return {
      loc:    (r) => !f.locs.length || f.locs.includes(r.sheet),
      type:   (r) => !f.types.length || f.types.includes(r.type),
      status: (r) => f.status === 'all' || (f.status === 'cut' ? r.status === 'cut' : r.bal > 0),
      text:   (r) => !q || r.lot.toLowerCase().includes(q) || String(r.article).toLowerCase().includes(q) || r.type.toLowerCase().includes(q)
    };
  }, [f.locs, f.types, f.status, f.q]);

  /* base = unit/fabric/status/search lage hue rolls — DATE abhi nahi lagi.
     Date flow (inward/cutting) aur stock (kis tarikh tak) ki tarah alag-alag lagti hai. */
  const base = useMemo(
    () => all.filter((r) => matchers.loc(r) && matchers.type(r) && matchers.status(r) && matchers.text(r)),
    [all, matchers]
  );

  const inFlowR = (d) => d && (!rStart || d >= rStart) && d <= rEnd;

  /* Kisi bhi tarikh tak ka stock: tab tak aaya − tab tak kata. */
  const stockAt = useMemo(() => (t) => {
    let m = 0, n = 0;
    base.forEach((r) => {
      if (!r.inD || r.inD > t) return;
      const balT = r.total - (r.cutE && r.cutE <= t ? r.cut : 0);
      if (balT > 0) { m += balT; n++; }
    });
    return { m, n };
  }, [base]);

  /* ── PERIOD KA FLOW — dashboard ka dil ── */
  const flow = useMemo(() => {
    const opening = rStart ? stockAt(new Date(rStart.getFullYear(), rStart.getMonth(), rStart.getDate() - 1)) : { m: 0, n: 0 };
    let inM = 0, inRolls = 0, cutM = 0, cutRolls = 0;
    const lots = {}, tats = [];
    base.forEach((r) => {
      if (inFlowR(r.inD)) { inM += r.total; inRolls++; }
      if (r.cut > 0 && inFlowR(r.cutE)) {
        cutM += r.cut; cutRolls++;
        if (r.lot) lots[r.lot] = 1;
        if (r.tat !== null) tats.push(r.tat);
      }
    });
    const lotN = Object.keys(lots).length;
    const available = opening.m + inM;
    return {
      opening, inM, inRolls, cutM, cutRolls, lots: lotN, tats,
      avgRoll: inRolls ? inM / inRolls : 0, avgLot: lotN ? cutM / lotN : 0,
      tat: median(tats), available, util: pctOf(cutM, available)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, stockAt, rStart, rEnd]);

  /* ── STOCK (period ke end tak ka bacha maal) ── */
  const pending = useMemo(() => {
    const out = [];
    base.forEach((r) => {
      if (!r.inD || r.inD > rEnd) return;
      const cutByThen = r.cutE && r.cutE <= rEnd ? r.cut : 0;
      const bal = r.total - cutByThen;
      if (bal > 0) out.push({ ...r, bal, cut: cutByThen, age: days(r.inD, rEnd) });
    });
    return out.sort((a, b) => b.age - a.age);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, rEnd]);

  const stock = useMemo(() => ({
    balM: sum(pending, (r) => r.bal), rolls: pending.length,
    oldest: pending.length ? pending[0].age : 0, over60: pending.filter((r) => r.age > 60)
  }), [pending]);

  const ageing = useMemo(() => {
    const defs = [['0–30 days', (a) => a <= 30], ['31–60 days', (a) => a > 30 && a <= 60],
      ['61–90 days', (a) => a > 60 && a <= 90], ['90+ days', (a) => a > 90]];
    const tot = sum(pending, (r) => r.bal) || 1;
    return defs.map(([label, t]) => {
      const rs = pending.filter((r) => t(r.age)), v = sum(rs, (r) => r.bal);
      return { label, value: v, n: rs.length, pct: pctOf(v, tot), rows: rs };
    });
  }, [pending]);

  /* Period me "relevant" rolls — registers/drills ke liye: period khatam hone tak aa chuke,
     aur period shuru hone se pehle pure cut nahi ho gaye the. All-time par = sab. */
  const rows = useMemo(() => base.filter((r) => {
    if (!dated) return true;
    if (!r.inD || r.inD > rEnd) return false;
    if (rStart && r.bal === 0 && r.cutE && r.cutE < rStart) return false;
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [base, dated, rStart, rEnd]);

  /* ── MAHINE KI TIMELINE (matcher-scoped, date-filter se AZAAD — poori history dikhti hai) ── */
  const months = useMemo(() => {
    const mi = {}, mc = {}, min = {}, mcn = {}, keys = {};
    base.forEach((r) => {
      if (r.inM) { mi[r.inM] = (mi[r.inM] || 0) + r.total; min[r.inM] = (min[r.inM] || 0) + 1; keys[r.inM] = 1; }
      if (r.cut > 0 && r.cutEM) { mc[r.cutEM] = (mc[r.cutEM] || 0) + r.cut; mcn[r.cutEM] = (mcn[r.cutEM] || 0) + 1; keys[r.cutEM] = 1; }
    });
    const ks = Object.keys(keys).sort();
    const inA = ks.map((x) => mi[x] || 0), cutA = ks.map((x) => mc[x] || 0);
    const inN = ks.map((x) => min[x] || 0), cutN = ks.map((x) => mcn[x] || 0);
    /* har mahine ke aakhri din ka closing stock — wahi hisaab jo pending/stock cards ka */
    const closing = [], closingRolls = [];
    ks.forEach((kk) => {
      const p = kk.split('-');
      const s = stockAt(new Date(+p[0], +p[1], 0));
      closing.push(s.m); closingRolls.push(s.n);
    });
    const table = (map) => {
      const kk = Object.keys(map).filter((x) => map[x] > 0).sort();
      const tot = sum(kk.map((x) => map[x]));
      return kk.map((x, i) => ({
        key: x, label: mlabel(x), value: map[x], pct: pctOf(map[x], tot),
        delta: i > 0 && map[kk[i - 1]] ? ((map[x] - map[kk[i - 1]]) / map[kk[i - 1]]) * 100 : null
      }));
    };
    return { keys: ks, labels: ks.map(mlabel), inM: inA, cutM: cutA, inRolls: inN, cutRolls: cutN, closing, closingRolls, inTable: table(mi), cutTable: table(mc) };
  }, [base, stockAt]);

  /* MoM delta — aadhe mahine ko poore mahine se compare karna galat hai (Sep abhi 8 din ka hai),
     isliye hamesha aakhri DO POORE mahine compare hote hain, aur label batata hai kaunse. */
  const deltaFor = useMemo(() => {
    /* Aakhri CUTTING mahina hi "abhi" hai. Usse aage ke mahine (jo galat inward dates se bante
       hain) aur khud chalta hua adhoora mahina — dono compare me nahi lete. */
    const liveKey = mkey(meta.lastCut);
    return (arr) => {
      let bIdx = -1;
      if (selMonthKey) bIdx = months.keys.indexOf(selMonthKey);
      else for (let i = months.keys.length - 1; i >= 0; i--) if (months.keys[i] < liveKey) { bIdx = i; break; }
      const aIdx = bIdx - 1;
      if (bIdx < 0 || aIdx < 0 || !arr[aIdx]) return { delta: null, label: '' };
      return {
        delta: ((arr[bIdx] - arr[aIdx]) / arr[aIdx]) * 100,
        label: `${months.labels[bIdx]} vs ${months.labels[aIdx]}`
      };
    };
  }, [months, selMonthKey, meta.lastCut]);

  const locations = useMemo(() => {
    const seen = [...new Set(all.map((r) => r.sheet))];
    const ordered = [...LOC_ORDER.filter((n) => seen.includes(n)), ...seen.filter((n) => !LOC_ORDER.includes(n))];
    return ordered.map((n) => ({ key: n, ...locMeta(n) }));
  }, [all]);

  /* Roll-type dropdown baaki filters se scope hota hai; chune hue types hamesha list me rehte hain. */
  const typeList = useMemo(() => {
    const agg = {};
    f.types.forEach((t) => { agg[t] = 0; });
    all.forEach((r) => {
      if (!r.type || !matchers.loc(r) || !matchers.status(r) || !matchers.text(r)) return;
      if (r.cut > 0 && inFlowR(r.cutE)) agg[r.type] = (agg[r.type] || 0) + r.cut;
      else if (agg[r.type] === undefined && (inFlowR(r.inD) || !dated)) agg[r.type] = agg[r.type] || 0;
    });
    return Object.keys(agg).map((n) => ({ name: n, cut: agg[n] })).sort((a, b) => b.cut - a.cut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, matchers, rStart, rEnd, dated, f.types]);

  /* Menu ki list: chune hue fabrics hamesha sabse upar (warna 70 me se apna selection
     dhoondhna padta tha), phir cutting ke hisaab se. Search chalu ho to seedha match. */
  const typeMenuList = useMemo(() => {
    const q = ui.typeQuery.trim().toLowerCase();
    const withFlag = typeList.map((t) => ({ ...t, on: f.types.includes(t.name) }));
    const hits = q ? withFlag.filter((t) => t.name.toLowerCase().includes(q)) : withFlag;
    if (q) return hits.slice(0, 120);
    return [...hits.filter((t) => t.on), ...hits.filter((t) => !t.on)].slice(0, 120);
  }, [typeList, f.types, ui.typeQuery]);

  /* portal sirf client par — SSR me document nahi hota */
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  /* ── UNIT STATS — sab period ke flow + period-end stock se ── */
  const locStats = useMemo(() => locations.map((L) => {
    let inM = 0, inRolls = 0, cutM = 0, cutRolls = 0, pendM = 0, pendN = 0, openM = 0;
    const lots = {}, tats = [], tset = {}, byM = {}, byMn = {}, byT = {};
    const dayBefore = rStart ? new Date(rStart.getFullYear(), rStart.getMonth(), rStart.getDate() - 1) : null;
    base.forEach((r) => {
      if (r.sheet !== L.key) return;
      if (r.type) tset[r.type] = 1;
      if (inFlowR(r.inD)) { inM += r.total; inRolls++; }
      if (r.cut > 0) {
        if (r.cutEM) {                                             // timeline (poori history)
          byM[r.cutEM] = (byM[r.cutEM] || 0) + r.cut;
          byMn[r.cutEM] = (byMn[r.cutEM] || 0) + 1;
        }
        if (inFlowR(r.cutE)) {
          cutM += r.cut; cutRolls++;
          if (r.lot) lots[r.lot] = 1;
          if (r.tat !== null) tats.push(r.tat);
          if (r.type) byT[r.type] = (byT[r.type] || 0) + r.cut;
        }
      }
      // period-end pending
      if (r.inD && r.inD <= rEnd) {
        const balT = r.total - (r.cutE && r.cutE <= rEnd ? r.cut : 0);
        if (balT > 0) { pendM += balT; pendN++; }
      }
      // opening
      if (dayBefore && r.inD && r.inD <= dayBefore) {
        const balO = r.total - (r.cutE && r.cutE <= dayBefore ? r.cut : 0);
        if (balO > 0) openM += balO;
      }
    });
    const available = openM + inM;
    const util = pctOf(cutM, available);
    /* Jis unit me is period kuchh hua hi nahi, use "Stock piling" kehna galat hai — usko
       alag "No activity" tone milta hai. */
    const idle = available === 0;
    const tone = idle ? 'idle' : util >= 95 ? 'good' : util >= 85 ? 'warning' : 'serious';
    const top = Object.keys(byT).map((t) => ({ label: t, value: byT[t] })).sort((a, b) => b.value - a.value).slice(0, 4);
    const mxT = top.length ? top[0].value : 1;
    top.forEach((t) => { t.rel = pctOf(t.value, mxT); });
    return {
      ...L, name: L.key, inM, inRolls, cutM, cutRolls, pendM, pendN, openM, available, util,
      lots: Object.keys(lots).length, avgRoll: inRolls ? inM / inRolls : 0, tat: median(tats), tatN: tats.length,
      typeCount: Object.keys(tset).length, topTypes: top,
      monthly: months.keys.map((x) => byM[x] || 0),
      monthlyRolls: months.keys.map((x) => byMn[x] || 0), tone,
      toneColor: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', idle: '#7c8899' }[tone],
      toneLabel: tone === 'idle' ? 'No activity' : tone === 'good' ? 'On target' : tone === 'warning' ? 'Watch' : 'Stock piling'
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [locations, base, months.keys, rStart, rEnd]);

  const maxLocCut = Math.max(...locStats.map((l) => l.cutM), 1);
  const heat = { rows: locStats.map((l) => l.short), cols: months.labels,
    matrix: locStats.map((l) => l.monthly), rollsMatrix: locStats.map((l) => l.monthlyRolls) };

  /* ── FABRIC STATS ── */
  const typeAgg = useMemo(() => {
    const agg = {};
    base.forEach((r) => {
      if (!r.type) return;
      const a = agg[r.type] || (agg[r.type] = { label: r.type, inM: 0, cutM: 0, pendM: 0, rolls: 0, byM: {} });
      if (inFlowR(r.inD)) { a.inM += r.total; a.rolls++; }
      if (r.cut > 0) {
        if (r.cutEM) a.byM[r.cutEM] = (a.byM[r.cutEM] || 0) + r.cut;
        if (inFlowR(r.cutE) && !inFlowR(r.inD)) a.rolls++;   // cut-in-period roll jo pehle aaya tha
      }
      if (r.cut > 0 && inFlowR(r.cutE)) a.cutM += r.cut;
      if (r.inD && r.inD <= rEnd) {
        const balT = r.total - (r.cutE && r.cutE <= rEnd ? r.cut : 0);
        if (balT > 0) a.pendM += balT;
      }
    });
    return Object.values(agg)
      .filter((a) => a.inM || a.cutM || a.pendM)
      .map((a) => ({ ...a, monthly: months.keys.map((x) => a.byM[x] || 0) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, months.keys, rStart, rEnd]);

  const pareto = useMemo(() => {
    const list = [...typeAgg].sort((a, b) => b.cutM - a.cutM).filter((x) => x.cutM > 0);
    const total = sum(list, (x) => x.cutM) || 1;
    const top = list.slice(0, f.topN);
    let run = 0;
    const out = top.map((t) => { run += t.cutM; return { label: t.label, value: t.cutM, n: t.rolls, pct: pctOf(t.cutM, total), cum: pctOf(run, total) }; });
    const rest = list.slice(f.topN);
    if (rest.length) {
      const rv = sum(rest, (x) => x.cutM);
      out.push({ label: `Other (${rest.length} types)`, value: rv, n: sum(rest, (x) => x.rolls), pct: pctOf(rv, total), cum: 100 });
    }
    return { top: out, topShare: top.length ? pctOf(run, total) : 0, otherCount: rest.length, total };
  }, [typeAgg, f.topN]);

  const typeRows = useMemo(() => [...typeAgg].sort((a, b) => {
    const x = a[typeSort.k], y = b[typeSort.k];
    return typeof x === 'string' ? typeSort.dir * x.localeCompare(y) : typeSort.dir * (x - y);
  }), [typeAgg, typeSort]);

  const tatByLoc = useMemo(() => locStats
    .filter((l) => l.tatN > 0)
    .map((l) => ({ label: l.short, value: l.tat || 0, n: l.tatN }))
    .sort((a, b) => a.value - b.value), [locStats]);

  const tatBins = useMemo(() => {
    const defs = [['0–2', (d) => d <= 2], ['3–5', (d) => d > 2 && d <= 5], ['6–10', (d) => d > 5 && d <= 10],
      ['11–20', (d) => d > 10 && d <= 20], ['21+', (d) => d > 20]];
    const n = flow.tats.length || 1;
    return defs.map(([label, t]) => { const c = flow.tats.filter(t).length; return { label, value: c, pct: pctOf(c, n) }; });
  }, [flow.tats]);

  /* Mahina chuna ho: us mahine ki cutting ke do hisse — isi mahine aaya maal vs purana backlog. */
  const monthCutSplit = useMemo(() => {
    if (!selMonthKey) return null;
    let sameM = 0, prevM = 0, sameRolls = 0, prevRolls = 0;
    base.forEach((r) => {
      if (!(r.cut > 0) || r.cutEM !== selMonthKey) return;
      if (r.inM === selMonthKey) { sameM += r.cut; sameRolls++; } else { prevM += r.cut; prevRolls++; }
    });
    return { sameM, prevM, sameRolls, prevRolls, total: sameM + prevM };
  }, [base, selMonthKey]);

  /* ── DATA HEALTH ── */
  const health = useMemo(() => {
    const asOf = meta.asOf, items = [];
    const mism = all.filter((r) => r.mIn && r.inD && r.mIn !== r.inD.getMonth() + 1).length;
    /* Sheet ke month columns formula nahi hain — date theek karne par ye peeche reh jate hain. */
    const stale = all.filter((r) => r.mCut && r.cutD && r.mCut !== r.cutD.getMonth() + 1);
    const staleM = sum(stale, (r) => r.cut);
    const swapN = all.filter((r) => r.flag === 'swap').length;
    const yearN = all.filter((r) => r.flag === 'year').length;
    const swapM = sum(all.filter((r) => r.flag === 'swap'), (r) => r.total);
    const neg = all.filter((r) => r.flag === 'reversed').length;
    const old = all.filter((r) => r.bal > 0 && r.inD && days(r.inD, asOf) > 60).length;
    const noLot = all.filter((r) => !r.lot).length;
    const part = all.filter((r) => r.status === 'partial').length;
    const caseDup = (() => {
      const m = {};
      all.forEach((r) => { if (!r.type) return; const key = r.type.toLowerCase().replace(/\s+/g, ' '); (m[key] = m[key] || {})[r.type] = 1; });
      return Object.values(m).filter((v) => Object.keys(v).length > 1).length;
    })();
    if (mism) items.push({ level: 'Warning', color: '#fab219', count: mism, title: '“Month (In)” column date se match nahi karta',
      detail: `${mism} rows me sheet ka month column inward date ke month se alag hai. Dashboard month hamesha date se nikalta hai — isliye numbers sheet ke month column se alag (aur sahi) hain.`,
      fix: 'Sheet me Month (In) ko =TEXT(inward_date,"mmmm") formula bana dein.' });
    if (stale.length) items.push({ level: 'Warning', color: '#fab219', count: stale.length, title: '“Month (Cut stock)” column purana pad gaya hai',
      detail: `${stale.length} rows (${nfmt(staleM)} m) me sheet ka month column cutting date ke mahine se alag hai. Ye column formula nahi hai, isliye jab aapne dates theek ki to ye peeche reh gaya — jaise cut date ab 20/01/2026 hai par column abhi bhi “December” bolta hai. Dashboard hamesha DATE se mahina nikalta hai, isliye agar aap month column se total nikalein to Dec/Jan me farak dikhega — sahi date wali ginti hai.`,
      fix: 'Sheet me is column ko formula bana dein: =TEXT(cutting_date,"mmmm") — phir wo apne aap sahi rahega.' });
    if (swapN) items.push({ level: 'Serious', color: '#d03b3b', count: swapN, title: 'Inward date me din aur mahina ulta type hua hai',
      detail: `${swapN} rows (${nfmt(swapM)} m) me inward date roll ke cut hone ke BAAD ki hai — jo ho nahi sakta. Din aur mahina palatne par date cutting se thoda pehle aa jati hai, isliye lagta hai type karte waqt ulta pad gaya (jaise 9 August ko "09/08" ki jagah "08/09").`,
      fix: 'Sheet me inward date theek kar dein — dashboard wahi dd/mm/yyyy padhta hai jo likha hai.' });
    if (yearN) items.push({ level: 'Serious', color: '#ec835a', count: yearN, title: 'Inward date me saal ki typo',
      detail: `${yearN} rows me inward saal aage ka likha hai (2025 ki jagah 2026).`,
      fix: 'Sheet me saal theek kar dein — dashboard likhi hui date hi maanta hai.' });
    if (neg) items.push({ level: 'Note', color: '#fab219', count: neg, title: 'Cutting date inward se 1–2 din pehle',
      detail: `${neg} rows me cutting date arrival se thoda pehle hai — entry ka gap lagta hai (date palatne se bhi theek nahi hota). Stock/flow ke hisaab me aisi cutting arrival ke DIN maani jati hai, isliye monthly totals phir bhi sahi baithte hain. Register me asli dates hi dikhti hain.`,
      fix: 'Inward entry usi din karein jis din maal aaye.' });
    if (old) items.push({ level: 'Serious', color: '#ec835a', count: old, title: '60+ din se bina cut pade rolls',
      detail: `${old} rolls 60 din se zyada purane hain aur abhi tak cut nahi hue.`, fix: 'FIFO — purana stock pehle cut karein.' });
    if (caseDup) items.push({ level: 'Note', color: '#fab219', count: caseDup, title: 'Ek hi fabric ke do naam',
      detail: `${caseDup} fabric names sirf space/capital letter ki wajah se alag hain. Dashboard inhe merge karke dikhata hai.`, fix: 'Sheet me dropdown/data-validation laga dein.' });
    if (noLot) items.push({ level: 'Info', color: '#7c8899', count: noLot, title: 'Lot number khali',
      detail: `${noLot} rows me lot number nahi hai — inme se zyadatar abhi cut hi nahi hue.`, fix: 'Cutting ke waqt lot number bharna zaroori karein.' });
    if (part) items.push({ level: 'Info', color: '#7c8899', count: part, title: 'Aadha cut roll',
      detail: `${part} rolls partially cut hain (kuchh meter bacha hai). Bacha hissa pending stock me ginta hai.`, fix: '—' });
    return { items, total: items.length };
  }, [all, meta.asOf]);

  /* ── INSIGHTS ── */
  const insights = useMemo(() => {
    const out = [];
    if (locStats.length > 1) {
      const worst = [...locStats].filter((l) => l.pendM > 0).sort((a, b) => b.pendM - a.pendM)[0];
      if (worst) out.push({ tone: '#ec835a', tab: 'locations', title: `${worst.short} me sabse zyada stock ruka hai`,
        text: `${nfmt(worst.pendM)} m (${worst.pendN} rolls) abhi bina cut pada hai — teeno units me sabse zyada.` });
    }
    const old = ageing[3];
    if (old && old.n) out.push({ tone: '#d03b3b', tab: 'pipeline', title: `${old.n} rolls 90+ din se pending`,
      text: `${nfmt(old.value)} m fabric 3 mahine se zyada purana hai. FIFO ke hisaab se pehle yahi cut hona chahiye.` });
    if (months.labels.length) {
      let pi = 0;
      months.cutM.forEach((v, i) => { if (v > months.cutM[pi]) pi = i; });
      out.push({ tone: 'var(--s-cut)', tab: 'overview', title: `${months.labels[pi]} sabse busy cutting month`,
        text: `${nfmt(months.cutM[pi])} m cut hua; us mahine inward ${nfmt(months.inM[pi])} m tha — ${months.cutM[pi] >= months.inM[pi] ? 'farq purane stock se pura hua.' : 'baaki stock me chala gaya.'}` });
    }
    if (typeAgg.length > f.topN && pareto.topShare > 0) out.push({ tone: 'var(--s-in)', tab: 'fabric', title: `Top ${f.topN} fabrics = ${pareto.topShare.toFixed(0)}% cutting`,
      text: `${typeAgg.length} types chal rahe hain, par load kuch hi par hai — planning inhi par focus karein.` });
    if (tatByLoc.length > 1 && tatByLoc[tatByLoc.length - 1].value > tatByLoc[0].value) {
      const s = tatByLoc[tatByLoc.length - 1], fst = tatByLoc[0];
      out.push({ tone: '#fab219', tab: 'pipeline', title: `${s.label} sabse dheema hai`, text: `Median ${s.value} din vs ${fst.label} ke ${fst.value} din — ${s.value - fst.value} din ka farq.` });
    }
    return out.slice(0, 4);
  }, [locStats, ageing, months, typeAgg, pareto, tatByLoc, f.topN]);

  /* ── LABELS ── */
  const periodLabel = selMonthKey ? mlabel(selMonthKey)
    : f.preset === 'all' ? 'poora register'
    : f.preset === 'custom' ? `${fmt(range.from)} – ${fmt(range.to)}`
    : (PRESETS.find((p) => p.k === f.preset) || {}).label;
  const inDelta = deltaFor(months.inM), cutDelta = deltaFor(months.cutM);

  /* ── KPI CARDS ── */
  const rollWord = (n) => nfmt(n) + (n === 1 ? ' roll' : ' rolls');
  const splitRow = (label, v, rolls, color) => (
    <div className="flex items-baseline justify-between gap-2" style={{ lineHeight: 1.75 }}>
      <span>{label}{rolls ? <span style={{ opacity: 0.7 }}> · {rollWord(rolls)}</span> : null}</span>
      <b className="tnum shrink-0" style={{ color: color || 'var(--ink-2)' }}>{nfmt(v)} m</b>
    </div>
  );
  const cutNote = monthCutSplit ? (
    <div>
      {splitRow('Isi month aaya + kata', monthCutSplit.sameM, monthCutSplit.sameRolls, 'var(--s-cut)')}
      {splitRow('Purana backlog kata', monthCutSplit.prevM, monthCutSplit.prevRolls, 'var(--s-bal)')}
    </div>
  ) : '';

  /* Label chhota aur ek jaisa; period alag se nahi likhte — wo filter bar aur delta
     label me pehle hi dikh jata hai, isliye footer ek hi line me aa jata hai. */
  const kpiCards = [
    { label: 'Fabric inward', value: flow.inM, unit: 'm', icon: 'inward', accent: 'var(--s-in)',
      delta: inDelta.delta, deltaLabel: inDelta.label, spark: months.inM, sparkColor: 'var(--s-in)',
      foot: [{ k: 'Rolls aaye', v: nfmt(flow.inRolls) }, { k: 'Avg roll', v: flow.avgRoll.toFixed(0) + ' m' }] },
    { label: 'Fabric cutting', value: flow.cutM, unit: 'm', icon: 'scissors', accent: 'var(--s-cut)',
      delta: cutDelta.delta, deltaLabel: cutDelta.label, spark: months.cutM, sparkColor: 'var(--s-cut)',
      foot: [{ k: 'Rolls kate', v: nfmt(flow.cutRolls) }, { k: 'Lots', v: nfmt(flow.lots) }, { k: 'Per lot', v: nfmt(flow.avgLot) + ' m' }],
      note: cutNote },
    { label: 'Pending stock', sub: `${fmt(rEnd)} tak`, value: stock.balM, unit: 'm', icon: 'stack', accent: 'var(--s-bal)',
      spark: months.closing, sparkColor: 'var(--s-bal)', deltaLabel: `${rollWord(stock.rolls)} intezaar me`,
      foot: [{ k: 'Pending rolls', v: nfmt(stock.rolls) }, { k: 'Oldest', v: stock.oldest + ' d' }] },
    /* progress bar yahan se hata di — 91.4% ke saath 'Target se -3.6%' wahi baat keh
       deta hai, aur bar ke bina chaaron cards ka dhaancha bilkul ek jaisa ho jata hai. */
    { label: 'Utilisation', value: flow.util, unit: '%', format: 'pct', icon: 'gauge', accent: 'var(--s-cut)',
      deltaLabel: 'target 95%+',
      /* Utilisation ke paas footer line nahi thi, isliye card me neeche khali jagah bach
         jati thi. Target se kitna peeche/aage hain — ye uss jagah ko bharta bhi hai aur
         kaam ka bhi hai. */
      foot: [{ k: 'Target se', v: (flow.util - 95 >= 0 ? '+' : '') + (flow.util - 95).toFixed(1) + '%' }] }
  ];

  /* Monthly table — poori timeline, naya mahina upar; har row par Opening + In − Cut = Closing. */
  const flowRows = useMemo(() => months.keys.map((kk, i) => ({
    key: kk, label: months.labels[i],
    opening: i > 0 ? months.closing[i - 1] : 0,
    inM: months.inM[i], cutM: months.cutM[i],
    closing: months.closing[i], rolls: months.closingRolls[i]
  })).reverse(), [months]);
  const flowMax = Math.max(...months.inM, ...months.cutM, 1);

  const fiveShare = pctOf(sum([...typeAgg].sort((a, b) => b.cutM - a.cutM).slice(0, 5), (x) => x.cutM), pareto.total);
  const topT = pareto.top[0] || { label: '—', value: 0, pct: 0 };
  const mostBal = [...typeAgg].sort((a, b) => b.pendM - a.pendM)[0] || { label: '—', pendM: 0 };
  const fabricCards = [
    { label: 'Fabric types in use', sub: 'is view me', value: typeAgg.length, icon: 'ruler', accent: 'var(--s-in)',
      foot: [{ k: 'Rolls', v: nfmt(rows.length) }] },
    { label: 'Sabse zyada kata', sub: topT.label, value: topT.value, unit: 'm', icon: 'scissors', accent: 'var(--s-cut)', pct: topT.pct,
      deltaLabel: topT.pct.toFixed(1) + '% of total cutting' },
    { label: 'Top 5 fabrics ka hissa', sub: 'cutting concentration', value: fiveShare, unit: '%', format: 'pct', icon: 'stack', accent: 'var(--s-in)', pct: fiveShare },
    { label: 'Sabse zyada pending', sub: mostBal.label, value: mostBal.pendM, unit: 'm', icon: 'alert', accent: 'var(--s-bal)',
      deltaLabel: `is fabric ka stock pada hai — ${fmt(rEnd)} tak` }
  ];

  const over60 = stock.over60;
  const pipeCards = [
    { label: 'Pending stock', sub: `${fmt(rEnd)} tak`, value: stock.balM, unit: 'm', icon: 'stack', accent: 'var(--s-bal)',
      deltaLabel: `${rollWord(stock.rolls)} intezaar me` },
    { label: '60+ din purana stock', sub: `${over60.length} rolls`, value: sum(over60, (r) => r.bal), unit: 'm', icon: 'alert', accent: '#ec835a',
      deltaLabel: 'FIFO tut raha hai' },
    { label: 'Sabse purana roll', sub: `inward se ${fmt(rEnd)} tak`, value: stock.oldest, unit: 'days', format: 'days', icon: 'clock', accent: 'var(--s-bal)' },
    { label: 'Median turnaround', sub: 'roll aane se cut hone tak', value: flow.tat === null ? 0 : flow.tat, unit: 'days', format: 'days', icon: 'gauge', accent: 'var(--s-in)',
      deltaLabel: `${nfmt(flow.tats.filter((t) => t > 20).length)} rolls ko 20+ din lage` }
  ];

  const tabs = [
    { k: 'overview', label: 'Overview' },
    { k: 'locations', label: 'Cutting units', badge: locStats.length },
    { k: 'fabric', label: 'Fabric', badge: typeAgg.length },
    { k: 'pipeline', label: 'Pending & speed', badge: stock.rolls }
  ];
  const activeFilters = [
    f.locs.length ? 'Unit: ' + f.locs.map((n) => locMeta(n).short).join(', ') : '',
    f.types.length ? 'Roll type: ' + (f.types.length > 3 ? f.types.length + ' selected' : f.types.join(', ')) : '',
    f.status !== 'all' ? 'Status: ' + (f.status === 'cut' ? 'Cut' : 'Pending') : '',
    f.preset !== 'all' ? `Period: ${selMonthKey ? mlabel(selMonthKey) : (PRESETS.find((p) => p.k === f.preset) || {}).label}` : '',
    f.q ? `Search: “${f.q}”` : ''
  ].filter(Boolean);
  const dirty = f.preset !== 'all' || f.locs.length || f.types.length || f.status !== 'all' || f.q;
  const viewEmpty = !rows.length && !pending.length && !flow.inM && !flow.cutM;


  /* ── actions ── */
  const toggleIn = (key, v) => set({ [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] });
  const reset = () => set({ preset: 'all', locs: [], types: [], status: 'all', q: '', from: '', to: '' });
  const setPreset = (kk) => {
    if (kk === 'custom' && !f.from) set({ preset: kk, from: iso(meta.rangeFrom), to: iso(meta.rangeTo) });
    else if (kk === 'all') set({ preset: 'all', from: '', to: '' });
    else set({ preset: kk });
  };
  const goTab = (t) => { setTab(t); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const sortArrow = (kk, s) => (
    <span className="sort-ind" style={s.k === kk ? { opacity: 1, color: 'var(--s-in)' } : undefined}>
      {s.k === kk ? (s.dir > 0 ? '↑' : '↓') : '↕'}
    </span>
  );

  /* ── TAAZA DATA (cold cache se bachne ke liye) ──
     Server se aaya HTML 60 second tak purana ho sakta hai, aur deploy ke turant baad
     wo build ke waqt ka data hota hai. Isliye client khud teen mauko par live data
     kheenchta hai — chup-chaap, bina toast ke:
       • page khulte hi (ek baar)
       • jab tab wapas saamne aaye (60s ka throttle, taaki tab badalne par spam na ho)
       • har 5 minute, sirf jab tab dikh rahi ho
     Refresh button wahi kaam zor se karta hai — spinner aur toast ke saath. */
  const lastPull = useRef(0);
  const pulling = useRef(false);
  const pull = async (silent, busy) => {
    if (!liveConfigured) { if (!silent) setUi((u) => ({ ...u, source: true })); return; }
    /* Ek waqt me ek hi request. Mount, focus aur visibilitychange teeno lagbhag ek saath
       chal jate hain (dev me StrictMode do baar mount bhi karta hai) — bina is lock ke
       har page load par Apps Script ko 3 call chali jati thi. */
    if (pulling.current) return;
    if (silent && Date.now() - lastPull.current < 60000) return;
    pulling.current = true;
    lastPull.current = Date.now();
    /* busy = chup-chaap hai par spinner dikhana hai. Pehle load par ye ON rehta hai:
       static HTML me build ke waqt ka data hota hai, to jab tak live data nahi aata
       tab tak numbers dhundhle dikhte hain — koi galat aankda padh na le. */
    if (!silent || busy) setLoading(true);
    try {
      const r = await fetch('/api/rolls', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
      setPayload(j.records);
      setMeta2({ source: 'live', fetchedAt: j.at });
      if (!silent) say(`Live data aa gaya — ${nfmt(j.count)} rows.`);
    } catch (e) {
      /* Chup-chaap wali koshish fail ho to purana data chalta rahe — bas chip
         "Snapshot" par chala jata hai taaki pata rahe ki taaza nahi hai. */
      if (silent) setMeta2((m) => ({ ...m, source: m.source === 'live' ? 'live' : m.source }));
      else say('Live data nahi aaya: ' + e.message);
    }
    pulling.current = false;
    if (!silent || busy) setLoading(false);
  };
  const refresh = () => pull(false);

  useEffect(() => {
    pull(true, true);                       // pehli baar — spinner ke saath
    const wake = () => { if (document.visibilityState === 'visible') pull(true); };
    const timer = setInterval(wake, 300000);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFile = (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const data = parsePayload(String(rd.result));
        if (!data) throw new Error('na JSON records mile, na CSV');
        setPayload(data);
        setMeta2({ source: 'file: ' + file.name, fetchedAt: new Date().toISOString() });
        say(file.name + ' load ho gayi.');
      } catch (e) { say('File padhi nahi gayi: ' + e.message); }
    };
    rd.readAsText(file);
  };

  const exportCsv = (list, name) => {
    const head = ['Inward Date', 'Cut Date', 'Unit', 'Roll Type', 'Article', 'Lot No', 'Total (Mtr)', 'Cut (Mtr)', 'Balance (Mtr)', 'TAT days', 'Status'];
    const lines = [head.join(',')];
    list.forEach((r) => {
      lines.push([iso(r.inD), iso(r.cutD), r.sheet, r.type, r.article, r.lot, r.total, r.cut, r.bal, r.tat ?? '', r.status]
        .map((v) => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = String(name).replace(/[^\w-]+/g, '-').toLowerCase() + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
    say(`CSV download shuru — ${nfmt(list.length)} rows.`);
  };

  const pickMonth = (x) => {
    const key = typeof x === 'number' ? months.keys[x] : x;
    if (!key) return;
    const p = key.split('-');
    set({ preset: 'custom', from: iso(new Date(+p[0], +p[1] - 1, 1)), to: iso(new Date(+p[0], +p[1], 0)) });
    say(`${mlabel(key)} chuna — upar ke cards ab us mahine ka aana, katna aur month-end stock dikha rahe hain.`);
  };

  /* ── DRAWER KE TILES ──
     Pehle ye drawer khulte waqt ek baar ban jate the, isliye andar mahina chunne par
     wahi ke wahi pade rehte the. Ab har render par bante hain: mahina chuna ho to us
     mahine ki khidki, warna poora period. Hisaab wahi hai jo locStats/typeAgg ka —
     Opening + Inward − Cutting = bacha stock. */
  const drillStats = useMemo(() => {
    if (!drill || !drill.scope) return null;
    const mk = drillFilter.month;
    const win = mk
      ? { from: new Date(+mk.slice(0, 4), +mk.slice(5, 7) - 1, 1), to: new Date(+mk.slice(0, 4), +mk.slice(5, 7), 0) }
      : { from: rStart, to: rEnd };
    const label = mk ? mlabel(mk) : (dated ? periodLabel : 'total');
    const inWin = (d) => d && (!win.from || d >= win.from) && d <= win.to;
    const dayBefore = win.from ? new Date(win.from.getFullYear(), win.from.getMonth(), win.from.getDate() - 1) : null;

    let inM = 0, inRolls = 0, cutM = 0, cutRolls = 0, pendM = 0, pendN = 0, openM = 0, cutAll = 0;
    const lots = {}, tats = [];
    base.forEach((r) => {
      const cutHere = r.cut > 0 && inWin(r.cutE);
      if (cutHere) cutAll += r.cut;                 // share nikalne ke liye — sab units/fabrics ka
      if (!drill.scope(r)) return;
      if (inWin(r.inD)) { inM += r.total; inRolls++; }
      if (cutHere) {
        cutM += r.cut; cutRolls++;
        if (r.lot) lots[r.lot] = 1;
        if (r.tat !== null) tats.push(r.tat);
      }
      if (r.inD && r.inD <= win.to) {
        const b = r.total - (r.cutE && r.cutE <= win.to ? r.cut : 0);
        if (b > 0) { pendM += b; pendN++; }
      }
      if (dayBefore && r.inD && r.inD <= dayBefore) {
        const b = r.total - (r.cutE && r.cutE <= dayBefore ? r.cut : 0);
        if (b > 0) openM += b;
      }
    });
    const avail = openM + inM, tat = median(tats);
    const head = [
      { k: 'Inward', v: nfmt(inM) + ' m', sub: `${label} · ${nfmt(inRolls)} rolls` },
      { k: 'Cutting', v: nfmt(cutM) + ' m', sub: `${label} · ${nfmt(cutRolls)} rolls` },
      { k: 'Pending', v: nfmt(pendM) + ' m', color: pendM ? 'var(--s-bal)' : '', sub: `${fmt(win.to)} tak · ${nfmt(pendN)} rolls` }
    ];
    if (drill.kind === 'Fabric') {
      return [...head, { k: 'Share of cutting', v: pctOf(cutM, cutAll || 1).toFixed(1) + '%', sub: label }];
    }
    return [...head,
      { k: 'Utilisation', v: avail ? pctOf(cutM, avail).toFixed(1) + '%' : '—', sub: avail ? 'kata ÷ (opening + inward)' : 'is period kuch nahi aaya' },
      { k: 'Rolls / lots', v: `${nfmt(cutRolls)} / ${nfmt(Object.keys(lots).length)}`, sub: `${label} me kate` },
      { k: 'Median TAT', v: tat === null ? '—' : tat + ' d', sub: `inward → cutting · ${nfmt(tats.length)} rolls` }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drill, drillFilter.month, base, rStart, +rEnd, dated, periodLabel]);

  const openLoc = (key) => {
    const l = locStats.find((x) => x.key === key);
    if (!l) return;
    setDrill({
      kind: 'Cutting unit', title: l.title, sub: l.blurb,
      /* tiles drawer ke andar `drillStats` se bante hain — isliye wo month dropdown
         ke saath badalte hain. Yahan sirf batana hai ki drawer kis cheez ka hai. */
      scope: (r) => r.sheet === key,
      breakdownLabel: 'Top fabrics (cutting)', breakdownField: 'type', rows: rows.filter((r) => r.sheet === key)
    });
  };

  const openType = (item) => {
    const name = item?.label ?? item;
    if (!name || String(name).startsWith('Other (')) { say('“Other” group me kai fabrics hain — Top 20 karke dekh sakte hain.'); return; }
    const t = typeAgg.find((x) => x.label === name);
    if (!t) return;
    const rs = rows.filter((r) => r.type === name);
    setDrill({
      kind: 'Fabric', title: name, sub: `${nfmt(t.rolls)} rolls is period me`,
      scope: (r) => r.type === name,
      breakdownLabel: 'Kis unit me kata', breakdownField: 'sheet', rows: rs
    });
  };

  const openRow = (r) => setDrill({
    kind: 'Roll', title: `${r.type} · ${r.article || 'no article'}`, sub: `${locMeta(r.sheet).short} · lot ${r.lot || '—'}`,
    stats: [{ k: 'Inward', v: fmt(r.inD) }, { k: 'Cut date', v: r.cutD ? fmt(r.cutD) : '—' },
      { k: 'Roll length', v: nfmt(r.total) + ' m' }, { k: 'Kata', v: nfmt(r.cut) + ' m' },
      { k: 'Bacha', v: nfmt(r.bal) + ' m', color: r.bal ? 'var(--s-bal)' : '' },
      { k: 'TAT', v: r.tat === null ? 'pending' : r.tat + ' days' }],
    rows: [r]
  });

  const openAge = (item) => setDrill({
    kind: 'Pending bucket', title: item.label, sub: `${nfmt(item.value)} m · ${item.n} rolls`,
    stats: [{ k: 'Meters', v: nfmt(item.value) }, { k: 'Rolls', v: item.n },
      { k: 'Share of pending', v: item.pct.toFixed(1) + '%' }, { k: 'Oldest', v: (item.rows[0]?.age || 0) + ' d' }],
    rows: item.rows
  });

  /* ── view ── */
  return (
    <div>
      {/* TOP BAR */}
      <header className="glass no-print sticky top-0 z-50" style={{ borderLeft: 0, borderRight: 0, borderTop: 0, borderBottom: '1px solid var(--border)' }}>
        <div className="wrap topbar flex items-center gap-3 py-2.5" style={{ paddingBottom: 10 }}>
          <div className="brand-block flex items-center gap-2.5 mr-1">
            <div className="brand-mark grid place-items-center rounded-xl" style={{ width: 34, height: 34, background: 'linear-gradient(140deg,var(--s-in),color-mix(in srgb,var(--s-cut) 70%, var(--s-in)))', boxShadow: '0 6px 16px -8px var(--s-in)' }}>
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h10" /><circle cx="18.5" cy="17" r="2.2" />
              </svg>
            </div>
            <div className="leading-tight">
              <div className="font-semibold brand-name" style={{ fontSize: '14.5px' }}>Roll Cutting Control Room</div>
              <div className="eyebrow brand-sub" style={{ letterSpacing: '.1em' }}>
                Gandhi Nagar · G-104 &nbsp;|&nbsp; {fmt(meta.rangeFrom)} – {fmt(meta.rangeTo)}
              </div>
            </div>
          </div>
          <div className="flex-1" />
          <button className={'chip ' + (meta2.source === 'live' ? 'is-on' : '')} onClick={() => setUi({ ...ui, source: true })}
            title={meta2.fetchedAt ? 'Data source · updated ' + new Date(meta2.fetchedAt).toLocaleTimeString('en-IN') : 'Data source'}>
            <i className="block rounded-full" style={{ width: 7, height: 7, background: meta2.source === 'live' ? '#0ca30c' : 'var(--muted)', boxShadow: meta2.source === 'live' ? '0 0 0 3px color-mix(in srgb,#0ca30c 25%,transparent)' : 'none' }} />
            {meta2.source === 'live' ? 'Live' : 'Snapshot'}
          </button>
          <button className="chip" onClick={refresh} disabled={loading} title="Refresh">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" style={loading ? { animation: 'spin 1s linear infinite' } : undefined}>
              <path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" />
            </svg>
            <span className="hidden sm:inline">{loading ? 'Loading…' : 'Refresh'}</span>
          </button>
          <button className="chip" onClick={() => setUi({ ...ui, health: true })} title={health.total + ' data quality notes'}>
            <Icon name="alert" size={14} /><span className="tnum">{health.total}</span>
          </button>
          <button className="chip" onClick={toggleTheme} title={'Theme: ' + (theme || 'system')}>
            {theme === 'dark'
              ? <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></svg>
              : <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
          </button>
        </div>
      </header>

      {/* FILTERS */}
      <div className="wrap no-print" style={{ paddingTop: 16 }}>
        <div className="card card--pad rise">
          {/* Mobile par filter panel band rehta hai — warna pehla KPI 550px neeche chala
              jata tha. Button par lage hue filters ki ginti dikhti hai. Desktop par ye
              button chhupa rehta hai aur panel hamesha khula. */}
          <button className="filter-toggle chip w-full justify-between" onClick={() => setUi((u) => ({ ...u, filters: !u.filters }))}>
            <span className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 5h18M6 12h12M10 19h4" />
              </svg>
              Filters
              {activeFilters.length ? <span className="pill tnum" style={{ padding: '1px 7px' }}>{activeFilters.length}</span> : null}
            </span>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2"
              style={{ transform: ui.filters ? 'rotate(180deg)' : 'none', transition: '.18s' }}><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <div className={'filter-body flex flex-wrap items-center gap-x-5 gap-y-3' + (ui.filters ? ' is-open' : '')}>
            <div className="flex items-center gap-2">
              <span className="eyebrow">Period</span>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button key={p.k} className={'chip ' + (f.preset === p.k ? 'is-on' : '')} onClick={() => setPreset(p.k)}>{p.label}</button>
                ))}
              </div>
              {f.preset === 'custom' ? (
                <div className="flex items-center gap-1.5">
                  <input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} className="chip tnum" style={{ padding: '4px 8px' }} />
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>→</span>
                  <input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} className="chip tnum" style={{ padding: '4px 8px' }} />
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <span className="eyebrow">Month</span>
              <select value={selMonthKey} onChange={(e) => e.target.value ? pickMonth(e.target.value) : set({ preset: 'all', from: '', to: '' })}
                className="chip tnum" style={{ padding: '4px 8px' }}>
                <option value="">All months</option>
                {allMonths.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="eyebrow">Unit</span>
              <div className="flex flex-wrap gap-1.5">
                <button className={'chip ' + (f.locs.length === 0 ? 'is-on' : '')} onClick={() => set({ locs: [] })}>All {locations.length}</button>
                {locations.map((l) => (
                  <button key={l.key} className={'chip ' + (f.locs.includes(l.key) ? 'is-on' : '')} onClick={() => toggleIn('locs', l.key)} title={l.title}>
                    <i className="swatch" style={{ background: l.color }} />{l.code}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 relative">
              <span className="eyebrow">Roll type</span>
              <button ref={typeBtn} className={'chip ' + (f.types.length ? 'is-on' : '')} onClick={() => setUi({ ...ui, typeMenu: !ui.typeMenu })}>
                {f.types.length ? f.types.length + ' selected' : 'All ' + typeList.length}
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m6 9 6 6 6-6" /></svg>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="eyebrow">Status</span>
              <div className="seg">
                {['all', 'cut', 'pending'].map((s) => (
                  <button key={s} className={f.status === s ? 'is-on' : ''} onClick={() => set({ status: s })}>
                    {s === 'all' ? 'All' : s === 'cut' ? 'Cut' : 'Pending'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1" style={{ minWidth: 180 }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--muted)" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Lot no. / article no." className="chip flex-1" style={{ padding: '6px 10px' }} />
            </div>

            {dirty ? (
              <button className="chip" onClick={reset} style={{ color: 'var(--s-bal)' }}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>Reset
              </button>
            ) : null}
          </div>

          <div className="hair my-3 filter-rule" />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5" style={{ fontSize: 12, color: 'var(--muted)' }}>
            <span><b className="tnum" style={{ color: 'var(--ink)' }}>{nfmt(rows.length)}</b> of {nfmt(all.length)} rolls is view me</span>
            <span>
              Hisaab: opening <b className="tnum" style={{ color: 'var(--ink)' }}>{nfmt(flow.opening.m)}</b>
              {' + '}aaya <b className="tnum" style={{ color: 'var(--s-in)' }}>{nfmt(flow.inM)}</b>
              {' − '}kata <b className="tnum" style={{ color: 'var(--s-cut)' }}>{nfmt(flow.cutM)}</b>
              {' = '}bacha <b className="tnum" style={{ color: 'var(--s-bal)' }}>{nfmt(stock.balM)}</b> m
            </span>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="wrap no-print" style={{ paddingTop: 18 }}>
        <div className="flex items-center gap-6 overflow-x-auto noscrollbar" style={{ borderBottom: '1px solid var(--border)' }}>
          {tabs.map((t) => (
            <button key={t.k} className={'tab ' + (tab === t.k ? 'is-on' : '')} onClick={() => setTab(t.k)}>
              {t.label}{t.badge !== undefined ? <span className="ml-1.5 tnum" style={{ color: 'var(--muted)', fontSize: 11 }}>{t.badge}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <main className={'wrap ' + (loading ? 'stale' : '')} style={{ paddingTop: 18 }}>
        {/* KHALI VIEW */}
        {viewEmpty ? (
          <div className="card card--pad rise" style={{ textAlign: 'center', padding: '38px 20px' }}>
            <div className="font-semibold" style={{ fontSize: 15 }}>Is filter me koi roll nahi mila</div>
            <div className="mt-1" style={{ fontSize: '12.5px', color: 'var(--ink-2)', maxWidth: 460, margin: '4px auto 0' }}>
              {nfmt(all.length)} rolls me se ek bhi in shartein poori nahi karta.
              {activeFilters.length ? <> Abhi lage hain: <b style={{ color: 'var(--ink)' }}>{activeFilters.join(' · ')}</b>.</> : null}
            </div>
            <div className="flex items-center justify-center gap-2 mt-3.5 flex-wrap">
              {f.types.length ? <button className="chip" onClick={() => set({ types: [] })}>Roll type hatayein</button> : null}
              {f.locs.length ? <button className="chip" onClick={() => set({ locs: [] })}>Unit hatayein</button> : null}
              {f.preset !== 'all' ? <button className="chip" onClick={() => set({ preset: 'all', from: '', to: '' })}>Period hatayein</button> : null}
              {f.status !== 'all' ? <button className="chip" onClick={() => set({ status: 'all' })}>Status hatayein</button> : null}
              {f.q ? <button className="chip" onClick={() => set({ q: '' })}>Search hatayein</button> : null}
              <button className="chip" onClick={reset} style={{ color: 'var(--s-bal)' }}>Sab filter reset</button>
            </div>
          </div>
        ) : null}

        {/* OVERVIEW */}
        {!viewEmpty && tab === 'overview' ? (
          <section>
            <div className="grid gap-3.5 kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(206px,1fr))' }}>
              {kpiCards.map((c, i) => <KpiCard key={c.label} {...c} delay={i * 55} />)}
            </div>

            {insights.length ? (
              <div className="mt-3.5">
                <button className="chip" onClick={() => setShowInsights((v) => !v)}>
                  {showInsights ? 'Hide information' : 'More information'} ({insights.length})
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2"
                    style={{ marginLeft: 5, transform: showInsights ? 'rotate(180deg)' : 'none', transition: '.18s' }}><path d="m6 9 6 6 6-6" /></svg>
                </button>
              </div>
            ) : null}

            {showInsights ? (
              <div className="grid gap-3.5 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(268px,1fr))' }}>
                {insights.map((ins, i) => (
                  <button key={ins.title} className="card card--pad rise lift text-left" style={{ animationDelay: i * 60 + 'ms' }} onClick={() => goTab(ins.tab)}>
                    <div className="flex items-start gap-2.5">
                      <i className="block rounded-full mt-1 shrink-0" style={{ width: 8, height: 8, background: ins.tone }} />
                      <div>
                        <div className="font-semibold" style={{ fontSize: 13 }}>{ins.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>{ins.text}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="grid gap-3.5 mt-3.5 split" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)' }}>
              <ChartCard
                title="Month by month — poora hisaab"
                subtitle="Har mahine: kitna aaya, kitna kata, month-end par kitna bacha. Naya mahina sabse upar. Har row par Opening + Inward − Cutting = Bacha."
                note="Row click karne se upar ke sab cards us mahine par aa jate hain. Cutting hamesha katne ke mahine me ginti hai, chahe roll pehle aaya ho."
                defaultView="table"
                tableHeight={300}
                actions={f.preset === 'custom' ? (
                  <button className="chip" onClick={() => setPreset('all')} style={{ color: 'var(--s-bal)' }}>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>Back
                  </button>
                ) : null}
                chart={
                  <ComboChart cats={months.labels} rowHeight={34} onPick={(i) => pickMonth(i)}
                    series={[{ key: 'in', label: 'Inward', color: 'var(--s-in)', values: months.inM, rolls: months.inRolls },
                             { key: 'cut', label: 'Cutting', color: 'var(--s-cut)', values: months.cutM, rolls: months.cutRolls }]}
                    line={{ label: 'Month-end bacha stock', color: 'var(--s-bal)', values: months.closing, rolls: months.closingRolls }} />
                }
                table={
                  <table className="tbl">
                    <thead><tr>
                      <th>Month</th>
                      <th className="num">Opening (m)</th>
                      <th className="num">Inward (m)</th>
                      <th className="num">Cutting (m)</th>
                      <th className="num">Bacha stock (m)</th>
                      <th className="num">Pending rolls</th>
                    </tr></thead>
                    <tbody>
                      {flowRows.map((r) => (
                        <tr key={r.key} className="clickable" onClick={() => pickMonth(r.key)}
                          style={r.key === selMonthKey ? { background: 'color-mix(in srgb, var(--s-in) 8%, transparent)' } : undefined}>
                          <td style={{ whiteSpace: 'nowrap', fontWeight: r.key === selMonthKey ? 700 : 500 }}>{r.label}</td>
                          <td className="num tnum" style={{ color: 'var(--muted)' }}>{nfmt(r.opening)}</td>
                          <td className="num tnum">
                            <span className="flex items-center gap-2 justify-end">
                              <span className="cellbar" style={{ width: 46 }}><span style={{ width: pctOf(r.inM, flowMax) + '%', background: 'var(--s-in)' }} /></span>
                              <span style={{ minWidth: 46 }}>{nfmt(r.inM)}</span>
                            </span>
                          </td>
                          <td className="num tnum">
                            <span className="flex items-center gap-2 justify-end">
                              <span className="cellbar" style={{ width: 46 }}><span style={{ width: pctOf(r.cutM, flowMax) + '%', background: 'var(--s-cut)' }} /></span>
                              <span style={{ minWidth: 46 }}>{nfmt(r.cutM)}</span>
                            </span>
                          </td>
                          <td className="num tnum" style={{ fontWeight: 600, color: 'var(--s-bal)' }}>{nfmt(r.closing)}</td>
                          <td className="num tnum" style={{ color: 'var(--muted)' }}>{nfmt(r.rolls)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>}
              />
              <ChartCard title="Unit ka hissa" subtitle={dated ? `${periodLabel} me teeno units ka kaam.` : 'Teeno cutting points ka kaam aur utilisation.'}
                chart={
                  <div className="flex flex-col gap-3 pt-1">
                    {locStats.map((l) => (
                      <button key={l.key} className="text-left rounded-xl p-3 lift" style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }} onClick={() => openLoc(l.key)}>
                        <div className="flex items-center gap-2.5">
                          <MeterRing pct={l.util} size={46} tone={l.tone} />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold truncate" style={{ fontSize: '13.5px' }}>{l.title}</div>
                            <div className="tnum" style={{ fontSize: 12, color: 'var(--ink-2)' }}>{nfmt(l.cutM)} m kata · {nfmt(l.pendM)} m pending</div>
                            <div className="cellbar mt-1.5"><span style={{ width: pctOf(l.cutM, maxLocCut) + '%', background: 'var(--s-cut)' }} /></div>
                          </div>
                          <div className="text-right">
                            <div className="tnum font-semibold" style={{ fontSize: 15 }}>{l.util.toFixed(1)}%</div>
                            <div className="pill mt-1"><i style={{ background: l.toneColor }} />{l.toneLabel}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>}
                table={
                  <table className="tbl">
                    <thead><tr><th>Unit</th><th className="num">Inward</th><th className="num">Cutting</th><th className="num">Pending</th><th className="num">Util %</th></tr></thead>
                    <tbody>{locStats.map((l) => (
                      <tr key={l.key}><td>{l.short}</td><td className="num tnum">{nfmt(l.inM)}</td><td className="num tnum">{nfmt(l.cutM)}</td><td className="num tnum">{nfmt(l.pendM)}</td><td className="num tnum">{l.util.toFixed(1)}</td></tr>
                    ))}</tbody>
                  </table>}
              />
            </div>

            <div className="grid gap-3.5 mt-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))' }}>
              <MonthTable title="Fabric IN — kis mahine kitna aaya" rows={months.inTable} color="var(--s-in)" label="Inward (Mtr.)" onPick={pickMonth} />
              <MonthTable title="Fabric CUT — kis mahine kitna kata" rows={months.cutTable} color="var(--s-cut)" label="Cutting (Mtr.)" onPick={pickMonth} />
            </div>

            <div className="grid gap-3.5 mt-3.5 split" style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)' }}>
              <ChartCard title="Cutting load — unit × month" subtitle="Kaunsi unit ne kis mahine kitna kata (meters)."
                defaultView="table"
                chart={<HeatMap rows={heat.rows} cols={heat.cols} matrix={heat.matrix} rollsMatrix={heat.rollsMatrix} unit="m" />}
                table={
                  <table className="tbl">
                    <thead><tr><th>Unit</th>{heat.cols.map((c) => <th key={c} className="num">{c}</th>)}</tr></thead>
                    <tbody>{heat.rows.map((r, i) => (
                      <tr key={r}><td>{r}</td>{heat.matrix[i].map((v, j) => <td key={j} className="num tnum">{v ? nfmt(v) : '—'}</td>)}</tr>
                    ))}</tbody>
                  </table>}
              />
              <ChartCard title="Is period ke top fabrics" subtitle="Cutting meters ke hisaab se. Row click = poora record."
                chart={<BarList items={pareto.top.slice(0, 8)} color="var(--s-cut)" unit="m" onPick={openType} />}
                table={
                  <table className="tbl">
                    <thead><tr><th>Fabric</th><th className="num">Cut (m)</th><th className="num">Share</th></tr></thead>
                    <tbody>{pareto.top.slice(0, 8).map((t) => (
                      <tr key={t.label}><td>{t.label}</td><td className="num tnum">{nfmt(t.value)}</td><td className="num tnum">{t.pct.toFixed(1)}%</td></tr>
                    ))}</tbody>
                  </table>}
              />
            </div>
          </section>
        ) : null}

        {/* CUTTING UNITS */}
        {!viewEmpty && tab === 'locations' ? (
          <section>
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))' }}>
              {locStats.map((l, i) => (
                <div key={l.key} className="card card--pad rise lift" style={{ animationDelay: i * 70 + 'ms' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="eyebrow">{l.name}</div>
                      <h3 className="mt-0.5" style={{ fontSize: 19 }}>{l.title}</h3>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{l.blurb}</div>
                    </div>
                    <MeterRing pct={l.util} size={62} tone={l.tone} showLabel />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3.5">
                    {[['Inward', nfmt(l.inM), dated ? periodLabel : 'total aaya', null],
                      ['Cutting', nfmt(l.cutM), dated ? periodLabel : 'total kata', null],
                      ['Pending', nfmt(l.pendM), `${l.pendN} rolls · ${fmt(rEnd)} tak`, l.pendM > 0 ? 'var(--s-bal)' : null]].map(([kk, v, s, col]) => (
                      <div key={kk} className="rounded-xl p-2.5" style={{ background: 'var(--surface-2)' }}>
                        <div className="eyebrow">{kk}</div>
                        <div className="tnum font-semibold" style={{ fontSize: 17, color: col || undefined }}>{v}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s}</div>
                      </div>
                    ))}
                  </div>
                  {/* Pehle poori timeline ek hi (sabse badi unit wali) scale par thi — isliye
                      chhoti units ki line bilkul chapti dikhti thi aur kuch samajh nahi aata tha.
                      Ab sirf aakhri 5 mahine, bars me, har unit apne scale par, aur har bar par
                      value ka label — isse har card apne aap me padha ja sakta hai. */}
                  <div className="mt-3.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="eyebrow">Cutting — aakhri 5 mahine</span>
                      <span className="tnum" style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {nfmt(sum(l.monthly.slice(-5)))} m · {nfmt(sum(l.monthlyRolls.slice(-5)))} pcs
                      </span>
                    </div>
                    <TrendChart mode="bars" values={l.monthly.slice(-5)} rolls={l.monthlyRolls.slice(-5)}
                      cats={months.labels.slice(-5)} metricLabel="Cutting" color="var(--s-cut)" height={104} unit="m" />
                  </div>
                  <div className="hair my-3" />
                  <div className="grid grid-cols-2 gap-y-2 gap-x-3" style={{ fontSize: '12.5px' }}>
                    {[['Rolls kate', nfmt(l.cutRolls)], ['Lots', nfmt(l.lots)], ['Avg roll', l.avgRoll.toFixed(0) + ' m'],
                      ['Median TAT', l.tat === null ? '—' : l.tat + ' d'], ['Fabrics used', l.typeCount],
                      ['Share of cutting', pctOf(l.cutM, flow.cutM || 1).toFixed(1) + '%']].map(([a, b]) => (
                      <div key={a} className="flex justify-between"><span style={{ color: 'var(--muted)' }}>{a}</span><b className="tnum">{b}</b></div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <div className="eyebrow mb-1.5">Top fabrics</div>
                    {l.topTypes.map((t) => (
                      <div key={t.label} className="flex items-center gap-2 py-1">
                        <span className="truncate flex-1" style={{ fontSize: '12.5px' }}>{t.label}</span>
                        <div className="cellbar" style={{ width: 88 }}><span style={{ width: t.rel + '%', background: 'var(--s-cut)' }} /></div>
                        <span className="tnum" style={{ fontSize: 12, color: 'var(--ink-2)', width: 56, textAlign: 'right' }}>{nfmt(t.value)}</span>
                      </div>
                    ))}
                  </div>
                  <button className="chip mt-3 w-full justify-center" onClick={() => openLoc(l.key)}>Poora record kholein</button>
                </div>
              ))}
            </div>

            <div className="grid gap-3.5 mt-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))' }}>
              <ChartCard title="Unit comparison" subtitle="Ek nazar me teeno cutting points."
                chart={
                  <table className="tbl">
                    <thead><tr><th>Unit</th><th className="num">Inward</th><th className="num">Cutting</th><th className="num">Pending</th><th className="num">Util %</th><th className="num">Median TAT</th><th>Status</th></tr></thead>
                    <tbody>{locStats.map((l) => (
                      <tr key={l.key} className="clickable" onClick={() => openLoc(l.key)}>
                        <td style={{ whiteSpace: 'nowrap' }}><span className="flex items-center gap-2"><i className="swatch" style={{ background: l.color }} />{l.short}</span></td>
                        <td className="num tnum">{nfmt(l.inM)}</td><td className="num tnum">{nfmt(l.cutM)}</td><td className="num tnum">{nfmt(l.pendM)}</td>
                        <td className="num tnum">{l.util.toFixed(1)}</td><td className="num tnum">{l.tat === null ? '—' : l.tat + ' d'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}><span className="pill"><i style={{ background: l.toneColor }} />{l.toneLabel}</span></td>
                      </tr>
                    ))}</tbody>
                  </table>}
              />
              <ChartCard title="Inward → cutting speed" subtitle="Roll aane se cut hone tak kitne din lage (median). Kam = behtar."
                chart={<BarList items={tatByLoc} color="var(--s-in)" unit="d" />}
                table={
                  <table className="tbl">
                    <thead><tr><th>Unit</th><th className="num">Median days</th><th className="num">Rolls measured</th></tr></thead>
                    <tbody>{tatByLoc.map((t) => <tr key={t.label}><td>{t.label}</td><td className="num tnum">{t.value}</td><td className="num tnum">{t.n}</td></tr>)}</tbody>
                  </table>}
              />
            </div>
          </section>
        ) : null}

        {/* FABRIC */}
        {!viewEmpty && tab === 'fabric' ? (
          <section>
            <div className="grid gap-3.5 kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))' }}>
              {fabricCards.map((c, i) => <KpiCard key={c.label} {...c} delay={i * 55} />)}
            </div>
            <div className="grid gap-3.5 mt-3.5 split" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
              <ChartCard title="Kaunsa fabric sabse zyada chal raha hai"
                subtitle={`Top ${f.topN} fabrics = ${pareto.topShare.toFixed(0)}% of cutting. Baaki ${pareto.otherCount} types “Other” me.`}
                actions={<div className="seg">{[8, 12, 20].map((n) => <button key={n} className={f.topN === n ? 'is-on' : ''} onClick={() => set({ topN: n })}>Top {n}</button>)}</div>}
                chart={<BarList items={pareto.top} color="var(--s-cut)" unit="m" showCum onPick={openType} />}
                table={
                  <table className="tbl">
                    <thead><tr><th>#</th><th>Fabric</th><th className="num">Cut (m)</th><th className="num">Share</th><th className="num">Cumulative</th></tr></thead>
                    <tbody>{pareto.top.map((t, i) => (
                      <tr key={t.label}><td className="tnum">{i + 1}</td><td>{t.label}</td><td className="num tnum">{nfmt(t.value)}</td>
                        <td className="num tnum">{t.pct.toFixed(1)}%</td><td className="num tnum">{t.cum.toFixed(1)}%</td></tr>
                    ))}</tbody>
                  </table>}
              />
              <ChartCard title="Fabric register" subtitle={`${typeRows.length} fabric types. Heading par click = us column se sort (sabse zyada upar), row click = poora record.`}
                chart={
                  <div style={{ maxHeight: 430, overflow: 'auto' }}>
                    <table className="tbl">
                      <thead><tr>
                        <th className={'sortable' + (typeSort.k === 'label' ? ' is-sorted' : '')} title="Click = sort"
                          onClick={() => setTypeSort({ k: 'label', dir: typeSort.k === 'label' ? -typeSort.dir : -1 })}>Fabric {sortArrow('label', typeSort)}</th>
                        {[['inM', 'In'], ['cutM', 'Cut'], ['pendM', 'Pending']].map(([kk, lbl]) => (
                          <th key={kk} className={'sortable num' + (typeSort.k === kk ? ' is-sorted' : '')}
                            title={`Click = ${lbl} ke hisaab se sort (pehla click = sabse zyada upar)`}
                            onClick={() => setTypeSort({ k: kk, dir: typeSort.k === kk ? -typeSort.dir : -1 })}>{lbl} {sortArrow(kk, typeSort)}</th>
                        ))}
                        <th>Trend</th>
                      </tr></thead>
                      <tbody>{typeRows.map((t) => (
                        <tr key={t.label} className="clickable" onClick={() => openType({ label: t.label })}>
                          <td className="truncate" style={{ maxWidth: 150 }}>{t.label}</td>
                          <td className="num tnum">{t.inM ? nfmt(t.inM) : '—'}</td>
                          <td className="num tnum">{t.cutM ? nfmt(t.cutM) : '—'}</td>
                          <td className="num tnum" style={{ color: t.pendM > 0 ? 'var(--s-bal)' : 'var(--muted)' }}>{t.pendM ? nfmt(t.pendM) : '—'}</td>
                          <td><SparkLine values={t.monthly} color="var(--s-cut)" width={70} height={20} /></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>}
              />
            </div>
          </section>
        ) : null}

        {/* PENDING & SPEED */}
        {!viewEmpty && tab === 'pipeline' ? (
          <section>
            <div className="rounded-xl p-2.5 mb-3.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--ink-2)' }}>
              Pending ek <b>stock</b> hai — ye tab <b>{fmt(rEnd)} tak ka poora bacha maal</b> dikhata hai (pichhle mahino ka backlog shamil).
              Unit / roll type / search filters yahan bhi lage hain. Speed (TAT) numbers period ke andar kate rolls ke hain.
            </div>
            <div className="grid gap-3.5 kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))' }}>
              {pipeCards.map((c, i) => <KpiCard key={c.label} {...c} delay={i * 55} />)}
            </div>
            <div className="grid gap-3.5 mt-3.5 split" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
              <ChartCard title="Pending stock ki umar" subtitle={`Jo rolls abhi tak cut nahi hue, kitne purane hain — ${fmt(rEnd)} tak.`}
                note="Purana stock sabse pehle cut hona chahiye (FIFO)."
                chart={<BarList items={ageing} ordinal unit="m" onPick={openAge} />}
                table={
                  <table className="tbl">
                    <thead><tr><th>Age bucket</th><th className="num">Rolls</th><th className="num">Meters</th><th className="num">Share</th></tr></thead>
                    <tbody>{ageing.map((a) => <tr key={a.label}><td>{a.label}</td><td className="num tnum">{a.n}</td><td className="num tnum">{nfmt(a.value)}</td><td className="num tnum">{a.pct.toFixed(1)}%</td></tr>)}</tbody>
                  </table>}
              />
              <ChartCard title="Cutting turnaround" subtitle="Roll aane se cut hone tak kitne din lage — is period me kate rolls ka distribution."
                chart={<Histogram bins={tatBins} color="var(--s-in)" />}
                table={
                  <table className="tbl">
                    <thead><tr><th>Days</th><th className="num">Rolls</th><th className="num">Share</th></tr></thead>
                    <tbody>{tatBins.map((b) => <tr key={b.label}><td>{b.label}</td><td className="num tnum">{b.value}</td><td className="num tnum">{b.pct.toFixed(1)}%</td></tr>)}</tbody>
                  </table>}
              />
            </div>
            <div className="mt-3.5">
              <ChartCard title="Pending roll register" subtitle={`${pending.length} rolls cutting ka intezaar kar rahe hain. Sabse purane upar.`}
                actions={<button className="chip" onClick={() => exportCsv(pending, 'pending-rolls')}>Export CSV</button>}
                chart={
                  <div style={{ maxHeight: 420, overflow: 'auto' }}>
                    <table className="tbl">
                      <thead><tr><th>Age</th><th>Inward</th><th>Unit</th><th>Fabric</th><th>Article</th><th className="num">Meters</th><th>Status</th></tr></thead>
                      <tbody>
                        {pending.map((r) => (
                          <tr key={r.i} className="clickable" onClick={() => openRow(r)}>
                            <td className="tnum" style={{ color: r.age > 90 ? '#d03b3b' : r.age > 60 ? '#ec835a' : 'var(--ink)', fontWeight: r.age > 60 ? 600 : 400 }}>{r.age} d</td>
                            <td className="tnum">{fmt(r.inD)}</td>
                            <td>{locMeta(r.sheet).code}</td>
                            <td className="truncate" style={{ maxWidth: 130 }}>{r.type}</td>
                            <td className="font-mono" style={{ fontSize: '11.5px' }}>{r.article || '—'}</td>
                            <td className="num tnum">{nfmt(r.bal)}</td>
                            <td><span className="pill"><i style={{ background: r.age > 90 ? '#d03b3b' : r.age > 60 ? '#ec835a' : '#fab219' }} />{r.age > 90 ? 'Critical' : r.age > 60 ? 'Ageing' : 'Waiting'}</span></td>
                          </tr>
                        ))}
                        {!pending.length ? <tr><td colSpan={7} style={{ color: 'var(--muted)', textAlign: 'center', padding: 26 }}>Is view me koi pending roll nahi — sab cut ho chuka.</td></tr> : null}
                      </tbody>
                    </table>
                  </div>}
              />
            </div>
          </section>
        ) : null}

      </main>

      {/* DRILL-DOWN */}
      {drill ? (() => {
        /* Drawer ka poora scope ek jagah se banta hai — month aur status filter
           breakdown (Top fabrics / Kis unit me kata) par bhi lagte hain, sirf rows
           table par nahi. Pehle breakdown drawer khulte waqt ek baar ban jata tha
           aur month badalne par jaisa ka taisa pada rehta tha. */
        const drillRows = drill.rows || [];
        /* Mahina chunne par row tab ginti hai jab wo us mahine AAYI ho ya us mahine KATI ho. */
        const inDrillMonth = (r) => !drillFilter.month || r.inM === drillFilter.month || r.cutEM === drillFilter.month;
        const inDrillStatus = (r) => drillFilter.status === 'all' || (drillFilter.status === 'cut' ? r.cut > 0 : r.bal > 0);
        const drillMonths = [...new Set(drillRows.flatMap((r) => [r.inM, r.cutEM]).filter(Boolean))]
          .sort().reverse().map((k) => ({ key: k, label: mlabel(k) }));

        /* breakdown = cutting meters + rolls, chune hue mahine ke hisaab se */
        const agg = {};
        drillRows.forEach((r) => {
          if (!(r.cut > 0) || !inDrillMonth(r) || !inDrillStatus(r)) return;
          const cutHere = drillFilter.month ? r.cutEM === drillFilter.month : inFlowR(r.cutE);
          if (!cutHere) return;
          const k = r[drill.breakdownField];
          if (!k) return;
          const a = agg[k] || (agg[k] = { key: k, label: drill.breakdownField === 'sheet' ? locMeta(k).short : k, value: 0, n: 0 });
          a.value += r.cut; a.n++;
        });
        const breakdown = Object.values(agg).sort((a, b) => b.value - a.value).slice(0, 6);

        /* CHART — All months par mahine-wise, koi mahina chuna ho to us mahine ka din-wise.
           Upar right ke toggle se Cutting ya Inward chun sakte hain: cutting CUTTING DATE
           se ginti hai, inward INWARD DATE se — isliye ek hi roll dono me alag mahine me
           aa sakta hai. Ye bhi drawer ke baaki filters ke saath chalta hai. */
        const isIn = drillFilter.metric === 'in';
        const chartRows = drillRows.filter((r) => (isIn ? !!r.inD : r.cut > 0) && inDrillStatus(r)
          && (!drillFilter.value || r[drill.breakdownField] === drillFilter.value));
        const mColor = isIn ? 'var(--s-in)' : 'var(--s-cut)';
        const mWord = isIn ? 'Inward' : 'Cutting';
        let chart;
        if (drillFilter.month) {
          const p = drillFilter.month.split('-');
          const dim = new Date(+p[0], +p[1], 0).getDate();
          const vals = Array(dim).fill(0), cnt = Array(dim).fill(0);
          chartRows.forEach((r) => {
            const dt = isIn ? r.inD : r.cutE;
            const mk = isIn ? r.inM : r.cutEM;
            if (mk !== drillFilter.month || !dt) return;
            const i = dt.getDate() - 1;
            vals[i] += isIn ? r.total : r.cut; cnt[i]++;
          });
          chart = { mode: 'bars', values: vals, rolls: cnt, color: mColor, metricLabel: mWord,
            cats: vals.map((_, i) => String(i + 1)),
            tipCats: vals.map((_, i) => `${i + 1} ${mlabel(drillFilter.month)}`),
            title: `Din-wise ${mWord.toLowerCase()} — ${mlabel(drillFilter.month)}`,
            note: `${nfmt(sum(vals))} m · ${nfmt(sum(cnt))} pcs · ${cnt.filter((x) => x).length} din` };
        } else {
          const idx = {};
          months.keys.forEach((k, i) => { idx[k] = i; });
          const vals = months.keys.map(() => 0), cnt = months.keys.map(() => 0);
          chartRows.forEach((r) => {
            const i = idx[isIn ? r.inM : r.cutEM];
            if (i === undefined) return;
            vals[i] += isIn ? r.total : r.cut; cnt[i]++;
          });
          chart = { mode: 'area', values: vals, rolls: cnt, color: mColor, metricLabel: mWord,
            cats: months.labels, tipCats: months.labels,
            title: `Monthly ${mWord.toLowerCase()}`,
            note: `${nfmt(sum(vals))} m · ${nfmt(sum(cnt))} pcs · mahina chunne par din-wise dikhega` };
        }

        const filteredRows = drillRows.filter((r) =>
          (!drillFilter.value || r[drill.breakdownField] === drillFilter.value) &&
          inDrillStatus(r) && inDrillMonth(r)
        );
        return (
        <Drawer kind={drill.kind} title={drill.title} sub={drill.sub} onClose={() => setDrill(null)}>
          <div className="grid grid-cols-2 gap-2.5">
            {(drillStats || drill.stats || []).map((s) => {
              const targetStatus = s.k === 'Cutting' ? 'cut' : s.k === 'Pending' ? 'pending' : null;
              const clickable = targetStatus && drill.rows && drill.rows.length > 1;
              const isOn = clickable && drillFilter.status === targetStatus;
              if (!clickable) return (
                <div key={s.k} className="rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
                  <div className="eyebrow">{s.k}</div>
                  <div className="tnum font-semibold" style={{ fontSize: 18, color: s.color || undefined }}>{s.v}</div>
                  {s.sub ? <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.sub}</div> : null}
                </div>
              );
              return (
                <button key={s.k} className="rounded-xl p-3 text-left lift"
                  style={{ background: 'var(--surface-2)', border: '1.5px solid ' + (isOn ? (s.color || 'var(--s-in)') : 'transparent'), cursor: 'pointer' }}
                  onClick={() => {
                    setDrillFilter((df) => ({ ...df, status: df.status === targetStatus ? 'all' : targetStatus }));
                    drillRollsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}>
                  <div className="eyebrow">{s.k}</div>
                  <div className="tnum font-semibold" style={{ fontSize: 18, color: s.color || undefined }}>{s.v}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.sub || (isOn ? 'filter laga hai — hatane ke liye click' : 'rolls dekhne ke liye click')}</div>
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
              <span className="eyebrow">{chart.title}</span>
              <div className="seg shrink-0">
                {[['cut', 'Cutting'], ['in', 'Inward']].map(([k, lbl]) => (
                  <button key={k} className={drillFilter.metric === k ? 'is-on' : ''}
                    onClick={() => setDrillFilter((df) => ({ ...df, metric: k }))}>{lbl}</button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{chart.note}</div>
            {chart.values.some((v) => v > 0) ? (
              <TrendChart mode={chart.mode} values={chart.values} rolls={chart.rolls} cats={chart.cats}
                tipCats={chart.tipCats} metricLabel={chart.metricLabel}
                color={chart.color} height={112} unit="m" />
            ) : (
              <div style={{ padding: '22px 10px', textAlign: 'center', fontSize: '12.5px', color: 'var(--muted)' }}>
                Is scope me koi {chart.metricLabel.toLowerCase()} nahi hua.
              </div>
            )}
          </div>
          {breakdown.length ? (
            <div className="mt-4">
              <div className="eyebrow mb-1.5">
                {drill.breakdownLabel}
                {drillFilter.month ? ' · ' + mlabel(drillFilter.month) : ''}
                {drillFilter.value ? ' · click karke wapas hatayein' : ' · click karke rolls dekhein'}
              </div>
              <BarList items={breakdown} color="var(--s-in)" unit="m" selected={drillFilter.value}
                onPick={(it) => {
                  const val = it.key ?? it.label;
                  setDrillFilter((s) => (s.value === val ? { ...s, value: '', label: '' } : { ...s, value: val, label: it.label }));
                  drillRollsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }} />
            </div>
          ) : null}
          {drill.rows ? (
            <div className="mt-4" ref={drillRollsRef}>
              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                <span className="eyebrow">Rolls ({filteredRows.length})</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {drillFilter.value ? (
                    <button className="chip" onClick={() => setDrillFilter((s) => ({ ...s, value: '', label: '' }))} style={{ color: 'var(--s-in)' }}>
                      {drillFilter.label || drillFilter.value}
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ marginLeft: 4 }}><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  ) : null}
                  <div className="seg">
                    {['all', 'cut', 'pending'].map((s) => (
                      <button key={s} className={drillFilter.status === s ? 'is-on' : ''} onClick={() => setDrillFilter((df) => ({ ...df, status: s }))}>
                        {s === 'all' ? 'All' : s === 'cut' ? 'Cut' : 'Uncut'}
                      </button>
                    ))}
                  </div>
                  <select value={drillFilter.month} onChange={(e) => setDrillFilter((df) => ({ ...df, month: e.target.value }))}
                    className="chip tnum" style={{ padding: '4px 8px' }}>
                    <option value="">All months</option>
                    {drillMonths.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                  <button className="chip" onClick={() => exportCsv(filteredRows, drill.title)}>CSV</button>
                </div>
              </div>
              <div style={{ maxHeight: 340, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
                <table className="tbl">
                  <thead><tr><th>Inward</th><th>Cut</th><th>Fabric</th><th>Lot</th><th className="num">Roll</th><th className="num">Cut</th><th>Status</th></tr></thead>
                  <tbody>
                    {filteredRows.slice(0, 300).map((r) => (
                      <tr key={r.i}>
                        <td className="tnum">{fmt(r.inD)}</td><td className="tnum">{r.cutD ? fmt(r.cutD) : '—'}</td>
                        <td className="truncate" style={{ maxWidth: 120 }} title={r.type}>{r.type || '—'}</td>
                        <td className="font-mono" style={{ fontSize: '11.5px' }}>{r.lot || '—'}</td>
                        <td className="num tnum">{nfmt(r.total)}</td><td className="num tnum">{r.cut ? nfmt(r.cut) : '—'}</td>
                        <td><StatusPill status={r.status} /></td>
                      </tr>
                    ))}
                    {!filteredRows.length ? <tr><td colSpan={7} style={{ color: 'var(--muted)', textAlign: 'center', padding: 22 }}>Koi roll nahi mila — filter hata kar dekhein.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </Drawer>
        );
      })() : null}

      {/* DATA HEALTH */}
      {ui.health ? (
        <Drawer kind="Quality check" title="Data health" onClose={() => setUi({ ...ui, health: false })}>
          <p style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            Ye check har data load par apne aap chalte hain. Numbers aapke sheet se hi aate hain — dashboard kuch chhupata nahi, sirf batata hai kahan entry theek karni hai.
          </p>
          <div className="mt-4 flex flex-col gap-2.5">
            {health.items.map((h) => (
              <div key={h.title} className="rounded-xl p-3.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-start gap-2.5">
                  <span className="pill mt-0.5"><i style={{ background: h.color }} />{h.level}</span>
                  <div className="flex-1">
                    <div className="font-semibold" style={{ fontSize: '13.5px' }}>{h.title}</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>{h.detail}</div>
                    {h.fix ? <div className="mt-1" style={{ fontSize: 12, color: 'var(--muted)' }}>Fix: {h.fix}</div> : null}
                  </div>
                  <b className="tnum" style={{ fontSize: 16 }}>{h.count}</b>
                </div>
              </div>
            ))}
          </div>
        </Drawer>
      ) : null}

      {/* DATA SOURCE */}
      {ui.source ? (
        <Drawer kind="Connection" title="Data source" onClose={() => setUi({ ...ui, source: false })}>
          <div className="rounded-xl p-3.5 mb-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div className="eyebrow">Abhi chal raha hai</div>
            <div className="font-semibold" style={{ fontSize: 14 }}>
              {meta2.source === 'live' ? 'Google Apps Script (live)' : meta2.source.startsWith('file') ? meta2.source : 'Built-in snapshot (data/rolls.json)'}
            </div>
            <div className="tnum" style={{ fontSize: 12, color: 'var(--muted)' }}>
              {nfmt(all.length)} rolls{meta2.fetchedAt ? ' · updated ' + new Date(meta2.fetchedAt).toLocaleString('en-IN') : ''}
            </div>
          </div>

          <div className="eyebrow mb-1.5">Live sheet se jodna</div>
          <p style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
            Project me <b>APPS_SCRIPT_URL</b> environment variable set kar dein — server side fetch hota hai, isliye CORS ka jhanjhat nahi.
            Local par <span className="font-mono">.env.local</span> me, Vercel par Project → Settings → Environment Variables me.
          </p>
          <pre className="font-mono mt-2 p-3 rounded-lg" style={{ background: 'var(--surface-2)', fontSize: 11, overflow: 'auto' }}>
{`APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfy…/exec`}
          </pre>
          <div className="mt-1" style={{ fontSize: 12, color: 'var(--muted)' }}>
            Status: {liveConfigured ? 'set hai — Refresh dabate hi live data aata hai.' : 'set nahi hai — abhi snapshot chal raha hai.'}
          </div>
          {loadError ? (
            <div className="mt-2 rounded-lg p-2.5" style={{ fontSize: 12, background: 'color-mix(in srgb,#d03b3b 10%,var(--surface-2))', border: '1px solid color-mix(in srgb,#d03b3b 35%,transparent)' }}>
              <b>Live sheet nahi padhi ja saki</b> — isliye snapshot chal raha hai.<br />
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{loadError}</span><br />
              <span style={{ color: 'var(--muted)' }}>Apps Script ka <b>/exec</b> URL use karein; <span className="font-mono">googleusercontent /echo</span> wala link kuch der baad expire ho jata hai.</span>
            </div>
          ) : null}

          <div className="hair my-4" />
          <div className="eyebrow mb-1.5">Apps Script code</div>
          <pre className="font-mono p-3 rounded-lg" style={{ background: 'var(--surface-2)', fontSize: 11, overflow: 'auto', whiteSpace: 'pre' }}>
{`function doGet() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Roll Cutting');
  const v  = sh.getDataRange().getDisplayValues();
  const h  = v.shift();
  const out = v.filter(r => r.join('')).map(r => {
    const o = {}; h.forEach((k, i) => o[k] = r[i]); return o;
  });
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}`}
          </pre>
          <p className="mt-2" style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>Deploy → New deployment → Web app → Execute as <b>Me</b>, access <b>Anyone</b>.</p>

          <div className="hair my-4" />
          <div className="eyebrow mb-1.5">Ya file se load karein (sirf is browser me)</div>
          <input type="file" accept=".json,.csv" onChange={loadFile} style={{ fontSize: 12 }} />
        </Drawer>
      ) : null}

      {/* ROLL TYPE MENU — portal se seedha <body> me.
          Pehle ye filter card ke andar tha aur click kaam hi nahi karta tha: card par
          `.rise` animation (fill-mode both) lagi hai jo use ek stacking context bana
          deti hai, isliye menu ka z-40 uske andar hi dab jata tha aur bahar wala
          backdrop (z-30) uske upar aa jata tha — har click backdrop kha jata tha.
          Card ka `overflow:hidden` bhi lambi list ko kaat deta. Portal dono theek karta
          hai: menu ab kisi ke andar nahi, seedha body me hai. */}
      {ui.typeMenu && mounted ? createPortal(
        <>
          <div className="fixed inset-0" style={{ zIndex: 78 }} onClick={() => setUi((u) => ({ ...u, typeMenu: false }))} />
          <div className="card fade" style={{
            position: 'fixed', top: menuPos.top, left: menuPos.left, width: menuPos.width, zIndex: 79,
            padding: 0, display: 'flex', flexDirection: 'column', maxHeight: menuPos.maxH, boxShadow: 'var(--shadow-lift)'
          }}>
            <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
              <span className="eyebrow">Roll type</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {f.types.length ? `${f.types.length} chune` : `${typeList.length} fabrics`}
              </span>
            </div>
            <div className="px-3 pb-2">
              <div className="flex items-center gap-2 chip" style={{ padding: '6px 10px' }}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--muted)" strokeWidth="2" className="shrink-0">
                  <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                </svg>
                <input autoFocus value={ui.typeQuery} onChange={(e) => setUi({ ...ui, typeQuery: e.target.value })}
                  placeholder="Search fabric…" className="flex-1"
                  style={{ border: 0, outline: 'none', background: 'transparent', color: 'var(--ink)', fontSize: '12.5px', minWidth: 0 }} />
                {ui.typeQuery ? (
                  <button onClick={() => setUi({ ...ui, typeQuery: '' })} style={{ color: 'var(--muted)', lineHeight: 0 }}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                ) : null}
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '0 6px 4px' }}>
              {typeMenuList.length ? typeMenuList.map((t, i) => (
                <div key={t.name}>
                  {/* chune hue upar, uske baad ek lakeer */}
                  {i === f.types.length && f.types.length && !ui.typeQuery ? <div className="hair" style={{ margin: '5px 8px' }} /> : null}
                  <button className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left type-row"
                    style={{ fontSize: '12.5px' }} onClick={() => toggleIn('types', t.name)}>
                    <span className="grid place-items-center rounded shrink-0" style={{
                      width: 15, height: 15, border: '1.5px solid var(--border-strong)',
                      ...(t.on ? { background: 'var(--s-in)', borderColor: 'var(--s-in)' } : {})
                    }}>
                      {t.on ? <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#fff" strokeWidth="3.4"><path d="m5 13 4 4L19 7" /></svg> : null}
                    </span>
                    <span className="flex-1 truncate" style={{ fontWeight: t.on ? 600 : 400 }}>{t.name}</span>
                    <span className="tnum shrink-0" style={{ color: 'var(--muted)', fontSize: 11 }}>{nfmt(t.cut)} m</span>
                  </button>
                </div>
              )) : (
                <div style={{ padding: '20px 10px', textAlign: 'center', fontSize: '12.5px', color: 'var(--muted)' }}>
                  “{ui.typeQuery}” se koi fabric nahi mila
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
              <button className="chip" onClick={() => set({ types: [] })} disabled={!f.types.length}
                style={{ opacity: f.types.length ? 1 : 0.45 }}>Clear</button>
              <button className="chip is-on" onClick={() => setUi({ ...ui, typeMenu: false })}>Done</button>
            </div>
          </div>
        </>, document.body) : null}

      {toast ? (
        <div className="fixed no-print fade" style={{ left: '50%', bottom: 26, transform: 'translateX(-50%)', zIndex: 90 }}>
          <div className="glass rounded-xl px-4 py-2.5" style={{ boxShadow: 'var(--shadow-lift)', fontSize: '12.5px', maxWidth: 'min(560px,92vw)' }}>{toast}</div>
        </div>
      ) : null}
    </div>
  );
}
