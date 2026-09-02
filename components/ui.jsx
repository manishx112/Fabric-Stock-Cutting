'use client';
import { useEffect, useRef, useState } from 'react';
import { nfmt, compact, sum } from '@/lib/format';
import { SparkLine } from './charts';

export const ICONS = {
  inward: <><path d="M4 7h16M4 12h11M4 17h7" /><path d="m16 15 3 3 3-3" /><path d="M19 10v8" /></>,
  scissors: <><circle cx="6" cy="6" r="2.6" /><circle cx="6" cy="18" r="2.6" /><path d="M8 8l12 10M20 6L8 16" /></>,
  stack: <><path d="m12 3 9 5-9 5-9-5 9-5z" /><path d="m3 13 9 5 9-5" /></>,
  gauge: <><path d="M4 18a8 8 0 1 1 16 0" /><path d="m12 14 4-4" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  lots: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" /></>,
  ruler: <><rect x="2.5" y="7.5" width="19" height="9" rx="2" /><path d="M7 7.5v3M11 7.5v4.5M15 7.5v3M19 7.5v4.5" /></>,
  alert: <><path d="M12 8.5v4.5M12 16.5h.01" /><circle cx="12" cy="12" r="9" /></>
};

export function Icon({ name, size = 17 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name] || ICONS.stack}
    </svg>
  );
}

/* number ginta hua KPI card */
export function KpiCard({ label, sub = '', value, unit = '', format = 'int', icon = 'stack', delta = null, deltaLabel = '',
  deltaGood = true, spark = [], sparkColor = 'var(--s-in)', accent = 'var(--s-in)', foot = [], note = '', pct = null, delay = 0 }) {
  const [shown, setShown] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const to = Number(value) || 0;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(to); return; }
    const from = shown, t0 = performance.now(), dur = 620;
    cancelAnimationFrame(raf.current);
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      setShown(from + (to - from) * e);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const display = format === 'pct' ? shown.toFixed(1) : format === 'days' ? shown.toFixed(0) : format === 'compact' ? compact(shown) : nfmt(shown);
  const up = (delta || 0) >= 0;
  const deltaColor = delta === null ? 'var(--muted)' : up === deltaGood ? '#0ca30c' : '#d03b3b';

  return (
    <div className="card card--pad rise lift kpi" style={{ animationDelay: delay + 'ms' }}>
      <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 2, background: accent, opacity: 0.85 }} />

      {/* SIRA — icon, label, scope, sparkline. Label ke liye do line hamesha reserve rehti
          hain, isliye har card me bada number theek ek hi height par aata hai. */}
      <div className="flex items-start gap-2.5">
        <div className="grid place-items-center rounded-xl shrink-0" style={{ width: 24, height: 24, background: `color-mix(in srgb, ${accent} 14%, var(--surface-2))`, color: accent }}>
          <Icon name={icon} size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="eyebrow kpi-label">{label}</div>
        </div>
        <div className="kpi-spark shrink-0" style={{ minHeight: 22 }}>
          {spark.length > 1 ? <SparkLine values={spark} color={sparkColor} /> : null}
        </div>
      </div>

      {/* BADA NUMBER — poori chaudai me, taaki 2,23,100 jaisa aankda na toote */}
      <div className="flex items-baseline gap-1.5" style={{ marginTop: 5 }}>
        <span className="font-semibold tnum" style={{ fontSize: 21, letterSpacing: '-.02em', lineHeight: 1.05 }}>{display}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{unit}</span>
      </div>

      {/* NEECHE KA HISSA — hamesha card ke pendhe se chipka, isliye saare cards ka
          footer ek line me baithta hai chahe upar ka content chhota bada ho. */}
      <div className="kpi-foot" style={{ marginTop: 'auto' }}>
        {delta !== null || deltaLabel ? (
          <div className="flex items-center gap-2 flex-wrap kpi-meta" style={{ marginTop: 6 }}>
            {delta !== null ? (
              <span className="pill shrink-0" style={{ color: deltaColor }}>
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d={up ? 'm5 15 7-7 7 7' : 'm5 9 7 7 7-7'} />
                </svg>
                {Math.abs(delta).toFixed(1)}%
              </span>
            ) : null}
            {deltaLabel ? <span style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.3 }}>{deltaLabel}</span> : null}
          </div>
        ) : null}
        {pct !== null ? <div className="cellbar" style={{ marginTop: 6 }}><span style={{ width: Math.min(100, pct) + '%', background: accent }} /></div> : null}
        {sub || foot.length ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" style={{ marginTop: 5, fontSize: '11px', color: 'var(--muted)' }}>
            {sub ? <span className="truncate" style={{ maxWidth: '100%' }}>{sub}</span> : null}
            {foot.map((x) => <span key={x.k}>{x.k} <b className="tnum" style={{ color: 'var(--ink-2)' }}>{x.v}</b></span>)}
          </div>
        ) : null}
        {note ? (
          <div style={{ marginTop: 8, paddingTop: 7, fontSize: '10.5px', color: 'var(--muted)', borderTop: '1px dashed var(--border)' }}>{note}</div>
        ) : null}
      </div>
    </div>
  );
}

/* purane dashboard wali dono monthly tables */
export function MonthTable({ title, rows = [], color, label, onPick }) {
  const [by, setBy] = useState('time');
  const list = by === 'value' ? [...rows].sort((a, b) => b.value - a.value) : [...rows].reverse();
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = sum(rows, (r) => r.value);
  return (
    <div className="card rise">
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div>
          <h3 style={{ fontSize: '14.5px' }}>{title}</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            Total <b className="tnum" style={{ color: 'var(--ink-2)' }}>{nfmt(total)}</b> m · {rows.length} months
          </p>
        </div>
        <div className="seg no-print">
          <button className={by === 'time' ? 'is-on' : ''} onClick={() => setBy('time')}>By month</button>
          <button className={by === 'value' ? 'is-on' : ''} onClick={() => setBy('value')}>By size</button>
        </div>
      </div>
      <div style={{ maxHeight: 392, overflow: 'auto' }}>
        <table className="tbl">
          <thead><tr><th style={{ width: 34 }}>#</th><th>Month</th><th className="num">{label}</th><th style={{ width: '26%' }}>Share</th><th className="num">vs prev</th></tr></thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={r.key} className="clickable" onClick={() => onPick && onPick(r.key)}>
                <td className="tnum" style={{ color: 'var(--muted)' }}>{i + 1}</td>
                <td style={{ whiteSpace: 'nowrap' }}><span className="flex items-center gap-2"><i className="swatch" style={{ background: color }} />{r.label}</span></td>
                <td className="num tnum" style={{ fontWeight: 600 }}>{nfmt(r.value)}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="cellbar flex-1"><span style={{ width: (r.value / max) * 100 + '%', background: color }} /></div>
                    <span className="tnum" style={{ fontSize: 11, color: 'var(--muted)', width: 34 }}>{r.pct.toFixed(0)}%</span>
                  </div>
                </td>
                <td className="num tnum" style={{ color: r.delta === null ? 'var(--muted)' : r.delta >= 0 ? '#0ca30c' : '#d03b3b' }}>
                  {r.delta === null ? '—' : (r.delta >= 0 ? '+' : '') + r.delta.toFixed(0) + '%'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StatusPill({ status }) {
  const map = { cut: ['#0ca30c', 'Cut'], partial: ['#fab219', 'Partial'], pending: ['#ec835a', 'Pending'] };
  const [c, t] = map[status] || map.pending;
  return <span className="pill"><i style={{ background: c }} />{t}</span>;
}

export function Drawer({ title, kind, sub, onClose, children }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <>
      <div className="scrim no-print" onClick={onClose} />
      <aside className="drawer no-print">
        <div className="sticky top-0 glass px-5 py-3.5 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--border)', zIndex: 3 }}>
          <div>
            <div className="eyebrow">{kind}</div>
            <h3 style={{ fontSize: 18 }}>{title}</h3>
            {sub ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</div> : null}
          </div>
          <button className="chip" onClick={onClose}>Close</button>
        </div>
        <div className="p-5">{children}</div>
      </aside>
    </>
  );
}
