// Graphiques SVG maison (aucune bibliothèque) : largeur fluide, info-bulle au doigt comme à la souris.
// Règles appliquées : un seul axe, marques fines aux extrémités arrondies, grille discrète, légende dès 2 séries,
// texte toujours dans les couleurs de texte (jamais la couleur de la série).
import { useState, type ReactNode } from 'react';
import { useWidth } from './kit';
import { monthAbbr, monthShort, money, num, NBSP, symbol } from '../domain/format';

function niceStep(raw: number): number {
  if (raw <= 0 || !isFinite(raw)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** Graduation compacte : 1,2 k$, 800 $. */
export function axisMoney(v: number, cur: string): string {
  const a = Math.abs(v);
  if (a >= 1000) return num(v / 1000, 0, a % 1000 ? 1 : 0) + NBSP + 'k' + symbol(cur);
  return num(v, 0) + NBSP + symbol(cur);
}

function ticksFor(lo: number, hi: number): number[] {
  const step = niceStep((hi - lo) / 4 || 1);
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.001; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

// ------------------------------------------------------------------ Barres mensuelles (une ou deux séries) + repère d'objectif
export interface BarSeries { name: string; color: string; values: number[] }

export function MonthBars({ months, series, goals, cur, label, height = 180, selected, onSelect }: {
  months: string[]; series: BarSeries[]; goals?: (number | null)[]; cur: string; label: string; height?: number; selected?: string; onSelect?: (ym: string) => void;
}) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const AX = 44, T = 10, B = 24;
  const W = Math.max(60, cw - AX), H = height;
  const all = [...series.flatMap((s) => s.values), ...(goals || []).filter((g): g is number => g !== null), 0];
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi === lo) hi = lo + 1;
  const ticks = ticksFor(lo, hi);
  lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
  const Y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const n = months.length;
  const slot = W / n;
  const k = series.length;
  const barW = Math.max(4, Math.min(28, (slot * 0.62) / k - (k > 1 ? 1 : 0)));
  const groupW = barW * k + (k - 1) * 2;
  const x0 = (i: number) => i * slot + (slot - groupW) / 2;
  const h = hover ?? (selected ? months.indexOf(selected) : -1);
  const showEvery = n > 8 ? 2 : 1;
  const bar = (x: number, v: number, color: string, key: string) => {
    const y0 = Y(0), y1 = Y(v);
    const top = Math.min(y0, y1), hh = Math.max(1, Math.abs(y1 - y0));
    const r = Math.min(4, barW / 2, hh);
    // extrémité arrondie côté valeur, base droite côté zéro
    const d = v >= 0
      ? `M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${y0} Z`
      : `M${x},${y0} V${top + hh - r} Q${x},${top + hh} ${x + r},${top + hh} H${x + barW - r} Q${x + barW},${top + hh} ${x + barW},${top + hh - r} V${y0} Z`;
    return <path key={key} d={d} style={{ fill: color }} />;
  };
  const tipI = hover !== null && hover >= 0 && hover < n ? hover : -1; // info-bulle seulement au survol / toucher
  const band = h >= 0 && h < n ? h : -1; // mois sélectionné : simple bande de fond
  return (
    <div className="stack-8">
      {series.length > 1 && (
        <div className="legend" aria-hidden="true">
          {series.map((s) => <span key={s.name}><span className="dot s10" style={{ background: s.color }} />{s.name}</span>)}
          {goals && <span><span style={{ width: 14, height: 2, background: 'var(--chart-goal)', display: 'inline-block' }} />Objectif</span>}
        </div>
      )}
      <div ref={ref} className="chart" data-component="MonthBars" style={{ height: H }}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.floor((e.clientX - r.left) / slot); setHover(i >= 0 && i < n ? i : null); }}
        onPointerLeave={() => setHover(null)}
        onClick={() => { if (tipI >= 0 && onSelect) onSelect(months[tipI]); }}>
        <svg viewBox={`0 0 ${cw} ${H}`} width={cw} height={H} role="img" aria-label={label}>
          {ticks.map((t) => <line key={t} x1={0} x2={W} y1={Y(t)} y2={Y(t)} style={{ stroke: t === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)' }} strokeWidth={1} />)}
          {band >= 0 && <rect x={band * slot} y={T - 4} width={slot} height={H - T - B + 8} rx={6} style={{ fill: 'var(--bg-hover)' }} />}
          {months.map((m, i) => series.map((s, j) => bar(x0(i) + j * (barW + 2), s.values[i] || 0, s.values[i] < 0 && k === 1 ? 'var(--chart-bar-neg)' : s.color, m + j)))}
          {goals && goals.map((g, i) => g === null ? null : <line key={'g' + i} x1={x0(i) - 4} x2={x0(i) + groupW + 4} y1={Y(g)} y2={Y(g)} strokeWidth={2} strokeLinecap="round" style={{ stroke: 'var(--chart-goal)' }} />)}
        </svg>
        {ticks.map((t) => <span key={t} className="tick" style={{ left: W + 6, top: Y(t) - 8 }}>{axisMoney(t, cur)}</span>)}
        {months.map((m, i) => (i % showEvery === 0 || i === n - 1) && <span key={m} className="tick" style={{ left: i * slot, width: slot, textAlign: 'center', top: H - B + 6, fontWeight: m === selected ? 700 : undefined }}>{monthAbbr(m)}</span>)}
        {tipI >= 0 && (
          <div className="tip" style={{ left: Math.min(Math.max(tipI * slot + slot / 2 - 80, 0), cw - 170), top: 0, width: 170 }}>
            <span className="t-caption-strong" style={{ color: 'var(--text-reverse)' }}>{monthShort(months[tipI])}</span>
            {series.map((s) => <span key={s.name} className="t-caption" style={{ color: 'var(--text-reverse)' }}>{s.name} : {money(s.values[tipI] || 0, cur, 0)}</span>)}
            {goals && goals[tipI] !== null && <span className="t-caption" style={{ color: 'var(--text-reverse-muted)' }}>Objectif : {money(goals[tipI]!, cur, 0)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Donut
export interface Slice { value: number; color: string }

export function Donut({ slices, size = 160, ring = 22, label, children }: { slices: Slice[]; size?: number; ring?: number; label: string; children?: ReactNode }) {
  const c = size / 2, r = c - ring / 2 - 4;
  const C = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const visible = slices.filter((x) => x.value > 0);
  const gap = visible.length > 1 ? 2 : 0;
  let off = 0;
  return (
    <div className="donut-wrap" style={{ width: size, height: size, alignSelf: 'center' }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label} data-component="DonutChart">
        {visible.length ? visible.map((x, i) => {
          const len = Math.max((x.value / total) * C - gap, 0.5);
          const el = <circle key={i} cx={c} cy={c} r={r} fill="none" strokeWidth={ring} strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`} strokeDashoffset={(-off).toFixed(2)} transform={`rotate(-90 ${c} ${c})`} style={{ stroke: x.color }} />;
          off += len + gap;
          return el;
        }) : <circle cx={c} cy={c} r={r} fill="none" strokeWidth={ring} style={{ stroke: 'var(--bg-grey-minimal)' }} />}
      </svg>
      <div className="donut-center">{children}</div>
    </div>
  );
}
