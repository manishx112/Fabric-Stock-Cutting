'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { nfmt, compact, niceMax, barPath, hBarPath } from '@/lib/format';

/* ── container width (SVG charts responsive rakhne ke liye) ── */
export function useSize() {
  const ref = useRef(null);
  const [w, setW] = useState(620);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /* display:none element ki width 0 aati hai. Us naap ko lena zaroori nahi —
       warna Table-default card ka chart 220px par lock ho jata hai aur bars gayab.
       0 ignore karte hain; jab card Chart view par aata hai to RO asli width deta hai. */
    const apply = (px) => { if (px > 0) setW(Math.max(220, Math.floor(px))); };
    apply(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((e) => apply(e[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* ── hover readout ── */
function useTip() {
  const [tip, setTip] = useState(null);
  const show = (ev, title, rows) => setTip({ x: ev.clientX, y: ev.clientY, title, rows });
  const hide = () => setTip(null);
  return [tip, show, hide];
}

/* Tip ko PORTAL se seedha <body> me bhejte hain.
   Wajah: har chart `.card` ke andar hai aur `.rise` animation (fill-mode: both) ka
   transform us card ko "containing block" bana deta hai — uske andar `position: fixed`
   viewport ke hisaab se nahi, CARD ke hisaab se lagta hai. Isliye tooltip mouse se
   sainkdon pixel door, aksar screen ke bahar chala jata tha aur kisi ko dikhta hi nahi
   tha. Body me jane par fixed ka matlab wapas "viewport" ho jata hai. */
export function Tip({ tip }) {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const b = ref.current.getBoundingClientRect();
    /* sirf tab set karo jab sach me badla ho — warna har mousemove par loop ban jata hai */
    if (Math.abs(b.width - box.w) > 1 || Math.abs(b.height - box.h) > 1) setBox({ w: b.width, h: b.height });
  }, [tip, box.w, box.h]);

  if (!tip || !mounted) return null;
  const m = 8;                                  // kinaare se itni jagah chhodo
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const w = box.w || 150, h = box.h || 72;
  const left = Math.max(m, Math.min(tip.x - w / 2, vw - w - m));
  const above = tip.y - h - 14;
  const top = above < m ? Math.min(tip.y + 18, vh - h - m) : above;

  return createPortal(
    <div ref={ref} className="tip" style={{ left, top }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{tip.title}</div>
      {tip.rows.map((r) => (
        <div key={r.k} className="flex items-center gap-2" style={{ padding: '1.5px 0' }}>
          {r.c ? <span className="key" style={{ background: r.c }} /> : null}
          <span style={{ color: 'var(--muted)', flex: 1 }}>{r.k}</span>
          <b className="tnum">{r.v}</b>
        </div>
      ))}
    </div>, document.body);
}

/* ── sparkline ── */
export function SparkLine({ values = [], color = 'var(--s-in)', width = 74, height = 22 }) {
  if (values.length < 2) return null;
  const mx = Math.max(...values), mn = Math.min(...values), r = mx - mn || 1;
  const pt = (y, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 3 - ((y - mn) / r) * (height - 6)];
  const d = values.map((y, i) => { const [x, yy] = pt(y, i); return (i ? 'L' : 'M') + x.toFixed(1) + ',' + yy.toFixed(1); }).join(' ');
  const [lx, ly] = pt(values[values.length - 1], values.length - 1);
  return (
    <svg width={width} height={height} style={{ overflow: 'visible', display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity=".55" />
      <circle cx={lx} cy={ly} r="2.6" fill={color} stroke="var(--surface)" strokeWidth="1.6" />
    </svg>
  );
}

/* ── utilisation meter ── */
export function MeterRing({ pct = 0, size = 52, tone = 'good', showLabel = false }) {
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  pct = Math.min(100, Math.max(0, Number(pct) || 0));   // ring aur label dono ek hi number dikhayein
  const off = c * (1 - pct / 100);
  const col = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b', idle: '#7c8899' }[tone] || 'var(--s-in)';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--grid)" strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.22,1,.36,1)' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center tnum font-semibold" style={{ fontSize: size > 54 ? 14 : 11 }}>
        {Math.round(pct)}<span style={{ fontSize: '.72em' }}>%</span>
      </div>
      {showLabel ? <div className="eyebrow text-center mt-1">utilised</div> : null}
    </div>
  );
}

/* ── card jisme chart ⇄ table dono ── */
/* tableHeight = table wale view ki max height. Iske baad table apne andar scroll karti
   hai aur heading (.tbl th) sticky rehti hai. Month table ke liye ise chhota rakha hai
   taaki card apne bagal wale card jitna hi lamba rahe. */
export function ChartCard({ title, subtitle, note, actions, chart, table, style, defaultView = 'chart', tableHeight = 420 }) {
  const [view, setView] = useState(defaultView);
  return (
    <div className="card rise" style={style}>
      <div className="chart-head flex items-start justify-between gap-3 p-4 pb-2.5">
        <div className="min-w-0">
          <h3 style={{ fontSize: '14.5px' }}>{title}</h3>
          {subtitle ? <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2 shrink-0 no-print">
          {actions}
          {table ? (
            <div className="seg">
              <button className={view === 'chart' ? 'is-on' : ''} onClick={() => setView('chart')}>Chart</button>
              <button className={view === 'table' ? 'is-on' : ''} onClick={() => setView('table')}>Table</button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="px-4 pb-4">
        {/* Chart tabhi mount hota hai jab dikh raha ho — chhupe hue element ki width 0 hoti hai
            aur SVG galat naap par ban jata hai (Table-default card me bars gayab ho jate the). */}
        <div style={{ display: view === 'chart' ? 'block' : 'none' }}>{view === 'chart' ? chart : null}</div>
        {table ? <div style={{ display: view === 'table' ? 'block' : 'none', maxHeight: tableHeight, overflow: 'auto' }}>{table}</div> : null}
        {note ? <p style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: 10 }}>{note}</p> : null}
      </div>
    </div>
  );
}

/* ── monthly rows (horizontal bars) + WIP line (ek hi axis, dono meters me) — latest month top par ── */
/* Mahine badhte rehte hain, isliye plot ki height cap karke scroll kar dete hain (wahi 392px jo
   neeche wali month tables use karti hain). Value-axis alag strip me hai jo sticky bottom par chipki
   rehti hai — scroll karte waqt bhi paimana saamne rehta hai. */
const AXIS_H = 30;
export function ComboChart({ cats = [], series = [], line, rowHeight = 40, maxHeight = 392, onPick }) {
  const [box, w] = useSize();
  const [tip, showTip, hideTip] = useTip();
  const [hover, setHover] = useState(-1);
  useEffect(() => { setHover(-1); }, [cats.join('|')]);

  const L = useMemo(() => {
    const n = Math.max(1, cats.length);
    const pad = { t: 14, r: 58, b: 8, l: 78 };
    const iw = Math.max(60, w - pad.l - pad.r), ih = n * rowHeight;
    let vals = [];
    series.forEach((s) => { vals = vals.concat(s.values); });
    if (line) vals = vals.concat(line.values);
    const mx = niceMax(Math.max(...vals, 1));
    const k = series.length;
    const groupH = Math.min(rowHeight * 0.7, 64), barH = Math.max(6, Math.min(20, (groupH - 2 * (k - 1)) / k));
    const x = (v) => pad.l + iw * (v / mx);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const vy = n - 1 - i; // latest (highest index) drawn on top
      const rowTop = pad.t + rowHeight * vy;
      const groupTop = rowTop + (rowHeight - groupH) / 2;
      const bars = series.map((s, j) => {
        const v = s.values[i] || 0;
        const by = groupTop + j * (barH + 4);
        const len = v > 0 ? Math.max(2, iw * (v / mx)) : 0;
        return { key: s.key, color: s.color, v, label: s.label, y: by, len, d: hBarPath(pad.l, by, len, barH, 4) };
      });
      rows.push({ i, rowTop, cy: rowTop + rowHeight / 2, bars });
    }
    const ticks = [];
    for (let t = 0; t <= 4; t++) ticks.push({ x: x((mx / 4) * t), label: compact((mx / 4) * t) });
    let lp = '', dots = [];
    if (line && rows.length) {
      lp = line.values.map((v, i) => (i ? 'L' : 'M') + x(v).toFixed(1) + ',' + rows[i].cy.toFixed(1)).join(' ');
      dots = line.values.map((v, i) => ({ x: x(v), y: rows[i].cy, v }));
    }
    return { pad, W: w, H: pad.t + pad.b + ih, iw, ih, rowHeight, barH, rows, ticks, lp, dots, n };
  }, [w, rowHeight, cats, series, line]);

  const move = (ev, i) => {
    setHover(i);
    /* meters ke saath rolls/pcs bhi — sirf meter se "kitne roll" ka andaza nahi lagta */
    const rows = series.map((s) => ({
      k: s.label, c: s.color,
      v: nfmt(s.values[i]) + ' m' + (s.rolls ? '  ·  ' + nfmt(s.rolls[i]) + ' pcs' : '')
    }));
    if (line) rows.push({
      k: line.label, c: line.color,
      v: nfmt(line.values[i]) + ' m' + (line.rolls ? '  ·  ' + nfmt(line.rolls[i]) + ' pcs' : '')
    });
    showTip(ev, cats[i], rows);
  };

  const scrolls = L.H + AXIS_H > maxHeight;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-1.5">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5" style={{ fontSize: '11.5px', color: 'var(--ink-2)' }}>
            <i className="swatch" style={{ background: s.color }} />{s.label}
          </span>
        ))}
        {line ? (
          <span className="flex items-center gap-1.5" style={{ fontSize: '11.5px', color: 'var(--ink-2)' }}>
            <i className="key" style={{ background: line.color }} />{line.label}
            <span style={{ color: 'var(--muted)' }}>(right)</span>
          </span>
        ) : null}
        {scrolls ? (
          <span className="ml-auto" style={{ fontSize: '11px', color: 'var(--muted)' }}>
            {cats.length} months · scroll karein
          </span>
        ) : null}
      </div>
      {/* ref yahan hai (bahar nahi) taaki scrollbar ki chaudai bhi naap me aa jaye */}
      <div ref={box} style={{ maxHeight, overflowY: scrolls ? 'auto' : 'visible', overflowX: 'hidden' }}>
      <svg width={L.W} height={L.H} style={{ display: 'block' }}>
        {L.rows.map((r, vi) => vi % 2 ? <rect key={'z' + r.i} x={L.pad.l} y={r.rowTop} width={L.iw} height={L.rowHeight} fill="var(--ink)" opacity=".022" /> : null)}
        {L.ticks.map((t) => <line key={'g' + t.label} className="gridline" x1={t.x} x2={t.x} y1={L.pad.t} y2={L.pad.t + L.ih} />)}
        {hover >= 0 && L.rows[hover] ? <rect x={L.pad.l} y={L.rows[hover].rowTop} width={L.iw} height={L.rowHeight} fill="var(--ink)" opacity=".045" /> : null}
        {line ? <path d={L.lp} fill="none" stroke={line.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity=".55" /> : null}
        {L.rows.map((r) => (
          <g key={'r' + r.i}>
            {r.bars.map((b) => (
              <path key={b.key} d={b.d} fill={b.color} className="rowbar"
                style={{ animationDelay: r.i * 28 + 'ms', opacity: hover < 0 || hover === r.i ? 1 : 0.45 }} />
            ))}
            {r.bars.map((b) => b.v > 0 ? (
              <text key={'l' + b.key} x={L.pad.l + b.len + 5} y={b.y + L.barH / 2 + 3.3} textAnchor="start" className="tnum"
                style={{ fontSize: '9.5px', fontWeight: 600, fill: 'var(--ink-2)', opacity: hover < 0 || hover === r.i ? 1 : 0.45 }}>
                {compact(b.v)}
              </text>
            ) : null)}
          </g>
        ))}
        {L.dots.map((d, i) => (
          <circle key={'d' + i} cx={d.x} cy={d.y} r="3.4" fill={line.color} stroke="var(--surface)" strokeWidth="2"
            opacity={hover < 0 || hover === i ? 1 : 0.4} />
        ))}
        {line ? L.dots.map((d, i) => (
          <text key={'dl' + i} x={L.pad.l + L.iw + 6} y={d.y + 3.4} textAnchor="start" className="tnum"
            style={{ fontSize: '9.5px', fontWeight: 700, fill: line.color, opacity: hover < 0 || hover === i ? 1 : 0.4 }}>
            {compact(d.v)}
          </text>
        )) : null}
        <line className="baseline" x1={L.pad.l} x2={L.pad.l} y1={L.pad.t} y2={L.pad.t + L.ih} />
        {L.rows.map((r) => <text key={'y' + r.i} className="axis-lbl" x={L.pad.l - 9} y={r.cy + 3.5} textAnchor="end">{cats[r.i]}</text>)}
        {L.rows.map((r) => (
          <rect key={'h' + r.i} className="hit" x={L.pad.l} y={r.rowTop} width={L.iw} height={L.rowHeight}
            onMouseMove={(e) => move(e, r.i)} onMouseLeave={() => { setHover(-1); hideTip(); }}
            onClick={() => onPick && onPick(r.i)} />
        ))}
      </svg>
      {/* value axis — scroll hone par neeche chipki rehti hai */}
      <svg width={L.W} height={AXIS_H} style={{ display: 'block', position: 'sticky', bottom: 0, background: 'var(--surface)' }}>
        <line className="gridline" x1={L.pad.l} x2={L.pad.l + L.iw} y1="0.5" y2="0.5" />
        {L.ticks.map((t) => <text key={'t' + t.label} className="axis-lbl" x={t.x} y="16" textAnchor="middle">{t.label}</text>)}
      </svg>
      </div>
      <Tip tip={tip} />
    </div>
  );
}

/* ── horizontal bar list (Pareto, top-N, ageing) ── */
export function BarList({ items = [], color = 'var(--s-in)', unit = '', showCum = false, ordinal = false, decimals = 0, onPick, selected }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const val = (v) => (decimals ? Number(v).toFixed(decimals) : nfmt(v));
  const col = (i) => {
    if (items[i] && String(items[i].label).startsWith('Other (')) return 'var(--axis)';
    return ordinal ? ['var(--ord-1)', 'var(--ord-2)', 'var(--ord-3)', 'var(--ord-4)'][Math.min(i, 3)] : color;
  };
  if (!items.length || max <= 0) {
    return <div style={{ color: 'var(--muted)', fontSize: '12.5px', padding: '14px 0', textAlign: 'center' }}>
      Is filter me dikhane layak value nahi hai — filter badal kar dekhein.
    </div>;
  }
  return (
    <div className="flex flex-col" style={{ gap: 9 }}>
      {showCum ? (
        <div className="flex items-center gap-2.5" style={{ fontSize: '9.5px', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          <span className="bl-name" />
          <span className="flex-1" />
          <span className="bl-val" style={{ textAlign: 'right' }}>Cut</span>
          <span className="bl-share" style={{ textAlign: 'right' }}>Share</span>
          <span className="bl-cum" style={{ textAlign: 'center' }}>Cumul.</span>
        </div>
      ) : null}
      {items.map((it, i) => {
        const isOn = selected && (it.key ?? it.label) === selected;
        return (
        <div key={it.label} className="flex items-center gap-2.5" style={{ cursor: onPick ? 'pointer' : 'default', borderRadius: 8, margin: '-3px -6px', padding: '3px 6px', background: isOn ? 'var(--surface-2)' : 'transparent' }}
          onClick={() => onPick && onPick(it)} title={`${it.label} — ${val(it.value)} ${unit}`}>
          <span className="truncate bl-name" style={{ fontSize: '12.5px', fontWeight: isOn ? 700 : 400 }}>{it.label}</span>
          <div className="flex-1 relative" style={{ height: 14 }}>
            <div style={{ position: 'absolute', inset: '4px 0', borderRadius: 3, background: 'var(--grid)' }} />
            <div className="rowbar" style={{
              position: 'absolute', top: 2, bottom: 2, left: 0,
              width: (it.value > 0 ? Math.max(1.5, (it.value / max) * 100) : 0) + '%',
              background: col(i), borderRadius: '3px 4px 4px 3px', animationDelay: i * 45 + 'ms'
            }} />
          </div>
          <span className="tnum bl-val" style={{ textAlign: 'right', fontSize: '12.5px', fontWeight: 600 }}>
            {val(it.value)}<span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 3 }}>{unit}</span>
          </span>
          {showCum ? (
            <>
              <span className="tnum bl-share" style={{ textAlign: 'right', fontSize: '11.5px', color: 'var(--ink-2)' }}>
                {(it.pct ?? 0).toFixed(1)}%
              </span>
              <span className="pill tnum bl-cum" style={{ justifyContent: 'center' }} title="cumulative — yahan tak ka jod">
                Σ {it.cum.toFixed(0)}%
              </span>
            </>
          ) : it.n !== undefined ? <span className="tnum" style={{ width: 72, textAlign: 'right', fontSize: '11.5px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{nfmt(it.n)} rolls</span>
            : null}
        </div>
        );
      })}
    </div>
  );
}

/* ── mini area (per-unit monthly, shared scale) ── */
export function MiniArea({ values = [], cats = [], max = 0, color = 'var(--s-cut)', height = 80, unit = '' }) {
  const [box, w] = useSize();
  const [tip, showTip, hideTip] = useTip();
  const [hover, setHover] = useState(-1);
  useEffect(() => { setHover(-1); }, [values.length]);

  const pad = 6;
  const mx = max || Math.max(...values, 1);
  const n = Math.max(1, values.length), step = n > 1 ? (w - pad * 2) / (n - 1) : 0;
  const pts = values.map((v, i) => ({ x: pad + i * step, y: pad + (height - pad * 2) * (1 - (v / mx || 0)), v }));
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const area = pts.length ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${height - pad} L${pad},${height - pad} Z` : '';

  const move = (ev) => {
    if (!pts.length) return;
    const r = box.current.getBoundingClientRect();
    const i = Math.max(0, Math.min(pts.length - 1, Math.round((ev.clientX - r.left - pad) / (step || 1))));
    setHover(i);
    showTip(ev, cats[i] || '#' + (i + 1), [{ k: 'Cut', v: nfmt(values[i]) + ' ' + unit, c: color }]);
  };

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <svg width={w} height={height} style={{ display: 'block', touchAction: 'pan-y' }}
        onMouseMove={move} onMouseLeave={() => { setHover(-1); hideTip(); }}
        onTouchStart={touch} onTouchMove={touch} onTouchEnd={() => { setHover(-1); hideTip(); }}>
        <path d={area} fill={color} opacity=".10" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover >= 0 && pts[hover] ? <line x1={pts[hover].x} x2={pts[hover].x} y1={pad} y2={height - pad} stroke="var(--axis)" strokeWidth="1" /> : null}
        {hover >= 0 && pts[hover] ? <circle cx={pts[hover].x} cy={pts[hover].y} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" /> : null}
        {pts.length ? <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3.4" fill={color} stroke="var(--surface)" strokeWidth="2" /> : null}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

/* ── trend chart — drawer ke liye ──
   Do shakl me chalta hai:
     mode 'area'  All months  -> har mahine ka cutting, upar value ka label
     mode 'bars'  ek mahina   -> us mahine ke har din ka cutting + us din ke rolls (pcs)
   Data label tabhi har point par aata hai jab jagah ho (>=32px per point). Jagah kam ho
   to sirf sabse bada point label hota hai — warna 31 din par labels ek doosre par chadh
   jate hain. X-axis bhi utne hi ticks dikhata hai jitne saaf padhe jaayen. */
export function TrendChart({ values = [], cats = [], tipCats = [], rolls = [], color = 'var(--s-cut)', height = 104, unit = '', mode = 'area', metricLabel = 'Cut' }) {
  const [box, w] = useSize();
  const [tip, showTip, hideTip] = useTip();
  const [hover, setHover] = useState(-1);
  useEffect(() => { setHover(-1); }, [values.length, mode]);

  const padX = 8, axisH = 15;
  const n = Math.max(1, values.length);
  const innerW = Math.max(10, w - padX * 2);
  const slot = innerW / n;
  const step = n > 1 ? innerW / (n - 1) : 0;
  const cx = (i) => (mode === 'bars' ? padX + slot * (i + 0.5) : padX + i * step);

  /* Jagah kam ho (jaise 31 din) to labels do line me jate hain — us doosri line ke
     liye upar 11px extra chahiye. Isliye padTop dense hone par bada rakhte hain. */
  const dense = slot < 32;
  const padTop = dense ? 28 : 17;
  const plotH = Math.max(12, height - padTop - axisH);
  const baseY = padTop + plotH;
  const mx = Math.max(...values, 1);
  const y = (v) => padTop + plotH * (1 - (v / mx || 0));
  /* Dense chart (jaise 31 din) me ek line me labels nahi samate. Isliye unhe DO
     line me baant dete hain — ek upar, ek thoda aur upar — taaki paas-paas wale
     labels bhi bina takraye aa jayein. Isse takreeban dugne values dikhti hain.
     Map: index -> level (0 = neeche wali line, 1 = upar wali). */
  const labelLv = useMemo(() => {
    const lv = new Map();
    const live = values.map((v, i) => i).filter((i) => values[i] > 0);
    if (!dense) { live.forEach((i) => lv.set(i, 0)); return lv; }
    const gap = Math.max(1, Math.ceil(13 / Math.max(slot, 1)));   // do line hain, isliye aadha faasla kaafi
    const picked = [];
    live.sort((a, b) => values[b] - values[a]).forEach((i) => {
      if (picked.length >= 14) return;
      for (const j of picked) if (Math.abs(i - j) < gap) return;
      picked.push(i);
    });
    picked.sort((a, b) => a - b).forEach((i, k) => lv.set(i, k % 2));
    return lv;
  }, [values, dense, slot]);
  const labelAt = (i) => labelLv.has(i);

  /* x-axis par utne hi ticks jitne bina takraye aa sakein — label ki ASLI chaudai se.
     "Dec '25" ~50px leta hai par din ka number ("17") sirf ~20px, isliye din-wise
     chart me kaafi zyada dates dikh sakti hain. */
  const catW = useMemo(() => {
    const longest = cats.reduce((m, s) => Math.max(m, String(s).length), 1);
    return Math.max(20, longest * 6.2 + 10);
  }, [cats]);
  const tickEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / catW))));
  /* Pehla aur aakhri label bahar na latke — unhe andar ki taraf anchor karte hain. */
  const anchor = (i) => (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle');

  const pts = values.map((v, i) => ({ x: cx(i), y: y(v), v }));
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const area = pts.length ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${baseY} L${padX},${baseY} Z` : '';

  const at = (ev) => {
    const r = box.current.getBoundingClientRect();
    const rel = ev.clientX - r.left - padX;
    return Math.max(0, Math.min(n - 1, mode === 'bars' ? Math.floor(rel / (slot || 1)) : Math.round(rel / (step || 1))));
  };
  const move = (ev) => {
    if (!pts.length) return;
    const i = at(ev);
    setHover(i);
    /* chart par label chhota (1.4K) hai — tooltip hamesha POORA number deta hai */
    const rowsOut = [{ k: metricLabel, v: nfmt(values[i]) + ' ' + unit, c: color }];
    if (rolls[i] !== undefined) rowsOut.push({ k: 'Rolls', v: nfmt(rolls[i]) + ' pcs' });
    showTip(ev, tipCats[i] || cats[i] || '#' + (i + 1), rowsOut);
  };
  /* touch par bhi wahi readout — mobile par hover hota hi nahi */
  const touch = (ev) => {
    const t = ev.touches && ev.touches[0];
    if (t) move({ clientX: t.clientX, clientY: t.clientY });
  };

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <svg width={w} height={height} style={{ display: 'block' }} onMouseMove={move} onMouseLeave={() => { setHover(-1); hideTip(); }}>
        <line x1={padX} x2={padX + innerW} y1={baseY} y2={baseY} stroke="var(--grid)" strokeWidth="1" />
        {mode === 'area' ? (
          <>
            <path d={area} fill={color} opacity=".10" />
            <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </>
        ) : (
          <>
            {/* hover band — patli bar par bhi maus ka nishana saaf lage */}
            {hover >= 0 ? <rect x={padX + slot * hover} y={padTop - 4} width={slot} height={plotH + 8} fill="var(--ink)" opacity=".05" rx="3" /> : null}
            {values.map((v, i) => {
              const bw = Math.max(2, slot * 0.62), h = baseY - y(v);
              return <rect key={i} x={cx(i) - bw / 2} y={y(v)} width={bw} height={Math.max(v > 0 ? 1.5 : 0, h)} rx={Math.min(2.5, bw / 2)}
                fill={color} opacity={hover < 0 ? 0.86 : hover === i ? 1 : 0.4} />;
            })}
          </>
        )}

        {/* data labels */}
        {values.map((v, i) => (labelAt(i) ? (
          <text key={'l' + i} x={cx(i)} y={Math.max(10, y(v) - 5 - labelLv.get(i) * 11)} textAnchor={anchor(i)}
            style={{ fontSize: 10, fontWeight: 600, fill: 'var(--ink-2)' }} className="tnum">{compact(v)}</text>
        ) : null))}

        {/* x-axis */}
        {cats.map((cat, i) => (i % tickEvery === 0 ? (
          <text key={'c' + i} x={cx(i)} y={height - 3} textAnchor={anchor(i)}
            style={{ fontSize: 9.5, fill: hover === i ? 'var(--ink)' : 'var(--muted)' }}>{cat}</text>
        ) : null))}

        {hover >= 0 && pts[hover] && mode === 'area' ? (
          <>
            <line x1={pts[hover].x} x2={pts[hover].x} y1={padTop} y2={baseY} stroke="var(--axis)" strokeWidth="1" />
            <circle cx={pts[hover].x} cy={pts[hover].y} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />
          </>
        ) : null}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

/* ── unit × month heat map ── */
export function HeatMap({ rows = [], cols = [], matrix = [], rollsMatrix = [], unit = '' }) {
  const [tip, showTip, hideTip] = useTip();
  const ramp = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)', 'var(--seq-6)', 'var(--seq-7)'];
  const max = Math.max(...matrix.flat(), 1);
  const step = (v) => Math.min(6, Math.floor((v / max) * 6.999));
  const shade = (v) => (!v ? 'var(--surface-2)' : ramp[step(v)]);
  /* gehre shade (index 3+) par safed text padhne me aasan hai */
  const deep = (v) => step(v) >= 3;
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${cols.length}, minmax(44px,1fr))`, gap: 2, minWidth: 120 + cols.length * 46 }}>
          <div />
          {cols.map((c) => <div key={c} className="axis-lbl text-center" style={{ fontSize: '10.5px', color: 'var(--muted)', paddingBottom: 2 }}>{c}</div>)}
          {rows.map((r, i) => (
            <Row key={r} label={r} vals={matrix[i]} shade={shade} deep={deep}
              onOver={(e, j) => showTip(e, `${r} · ${cols[j]}`, [
                { k: 'Cut', v: nfmt(matrix[i][j]) + ' ' + unit, c: shade(matrix[i][j]) },
                ...(rollsMatrix[i] ? [{ k: 'Rolls', v: nfmt(rollsMatrix[i][j]) + ' pcs' }] : [])
              ])} onOut={hideTip} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3" style={{ fontSize: 11, color: 'var(--muted)' }}>
        <span>0</span>
        {ramp.map((s) => <i key={s} style={{ background: s, width: 22, height: 8, borderRadius: 2 }} />)}
        <span className="tnum">{nfmt(max)} m</span>
      </div>
      <Tip tip={tip} />
    </div>
  );
}
function Row({ label, vals, shade, deep, onOver, onOut }) {
  return (
    <>
      <div className="truncate" style={{ fontSize: 12, color: 'var(--ink-2)', alignSelf: 'center', paddingRight: 8 }}>{label}</div>
      {vals.map((v, j) => (
        <div key={j} className="cell grid place-items-center tnum" onMouseMove={(e) => onOver(e, j)} onMouseLeave={onOut}
          style={{
            background: shade(v), height: 34, borderRadius: 5,
            fontSize: '10.5px', fontWeight: 600,
            color: !v ? 'var(--muted)' : deep(v) ? '#fff' : 'var(--ink)'
          }}>
          {v ? compact(v) : '—'}
        </div>
      ))}
    </>
  );
}

/* ── turnaround distribution ── */
export function Histogram({ bins = [], color = 'var(--s-in)', height = 220 }) {
  const [box, w] = useSize();
  const [tip, showTip, hideTip] = useTip();
  const [hover, setHover] = useState(-1);
  const pad = { t: 24, r: 10, b: 36, l: 44 };
  const iw = Math.max(60, w - pad.l - pad.r), ih = height - pad.t - pad.b;
  const mx = niceMax(Math.max(...bins.map((b) => b.value), 1));
  const n = Math.max(1, bins.length), band = iw / n, bw = Math.min(24, band * 0.55);
  const y = (v) => pad.t + ih * (1 - v / mx);
  const ticks = []; for (let t = 0; t <= 4; t++) ticks.push({ y: y((mx / 4) * t), label: compact((mx / 4) * t) });
  /* Is chart par pehle koi readout nahi tha — bar dekh kar sirf ginti pata chalti thi,
     share nahi. Ab hover/tap par bucket, rolls aur share teeno dikhte hain. */
  const at = (ev) => {
    const r = box.current.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor((ev.clientX - r.left - pad.l) / (band || 1))));
  };
  const move = (ev) => {
    if (!bins.length) return;
    const i = at(ev);
    setHover(i);
    showTip(ev, bins[i].label + ' din', [
      { k: 'Rolls', v: nfmt(bins[i].value) + ' pcs', c: color },
      { k: 'Share', v: (bins[i].pct ?? 0).toFixed(1) + '%' }
    ]);
  };
  const touch = (ev) => { const t = ev.touches && ev.touches[0]; if (t) move({ clientX: t.clientX, clientY: t.clientY }); };

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <svg width={w} height={height} style={{ display: 'block', overflow: 'visible', touchAction: 'pan-y' }}
        onMouseMove={move} onMouseLeave={() => { setHover(-1); hideTip(); }}
        onTouchStart={touch} onTouchMove={touch} onTouchEnd={() => { setHover(-1); hideTip(); }}>
        {hover >= 0 ? <rect x={pad.l + band * hover} y={pad.t - 6} width={band} height={ih + 12} fill="var(--ink)" opacity=".05" rx="4" /> : null}
        {ticks.map((t) => <line key={'g' + t.label} className="gridline" x1={pad.l} x2={pad.l + iw} y1={t.y} y2={t.y} />)}
        {ticks.map((t) => <text key={'t' + t.label} className="axis-lbl" x={pad.l - 8} y={t.y + 3.5} textAnchor="end">{t.label}</text>)}
        {bins.map((b, i) => {
          const x = pad.l + band * i + (band - bw) / 2;
          return <path key={'b' + i} d={barPath(x, y(b.value), bw, ih - (y(b.value) - pad.t), 4)} fill={color} className="col"
            style={{ animationDelay: i * 45 + 'ms', opacity: hover < 0 ? 1 : hover === i ? 1 : 0.42 }} />;
        })}
        {bins.map((b, i) => (
          <text key={'v' + i} x={pad.l + band * i + band / 2} y={y(b.value) - 8} textAnchor="middle" className="tnum"
            style={{ fontSize: 11, fontWeight: 600, fill: 'var(--ink-2)' }}>{b.value}</text>
        ))}
        <line className="baseline" x1={pad.l} x2={pad.l + iw} y1={pad.t + ih} y2={pad.t + ih} />
        {bins.map((b, i) => <text key={'x' + i} x={pad.l + band * i + band / 2} y={height - 18} textAnchor="middle" className="axis-lbl">{b.label}</text>)}
        <text x={pad.l + iw / 2} y={height - 3} textAnchor="middle" className="axis-lbl">days from inward to cutting</text>
      </svg>
      <Tip tip={tip} />
    </div>
  );
}
