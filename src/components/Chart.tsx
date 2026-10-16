import type { ChartSpec } from '../redrock/types';
import { fmt } from '../lib/format';

const COLORS = ['#2f6f73', '#c7793a', '#6b7fb3', '#9a5b8f'];

interface Props {
  spec: ChartSpec;
  width?: number;
  height?: number;
  onDatumClick?: (id: string) => void;
  savedIds?: Set<string>;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

export function Chart({ spec, width = 560, height = 260, onDatumClick, savedIds }: Props) {
  const dec = spec.decimals ?? 0;
  if (spec.type === 'pie') return <Pie spec={spec} width={width} height={height} />;

  const m = { l: 56, r: 16, t: 28, b: 36 };
  const w = width - m.l - m.r;
  const h = height - m.t - m.b;
  const all = spec.series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  const max = niceMax(Math.max(...all, 0) * 1.12);
  const y = (v: number) => m.t + h - (v / max) * h;
  const n = spec.labels.length;
  const band = w / Math.max(n, 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  const label = (x: number, yy: number, v: number, id?: string, key?: string) => {
    if (!Number.isFinite(v) || spec.showValues === false) return null;
    const clickable = !!id && !!onDatumClick;
    const saved = id ? savedIds?.has(id) : false;
    return (
      <text
        key={key}
        x={x}
        y={yy}
        textAnchor="middle"
        className={`chart-value${clickable ? ' datum-svg' : ''}${saved ? ' saved' : ''}`}
        onClick={clickable ? () => onDatumClick!(id!) : undefined}
      >
        {fmt(v, dec)}
      </text>
    );
  };

  return (
    <svg className="chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={spec.title}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={m.l - 6} y={y(t) + 4} textAnchor="end" className="axis-label">
            {fmt(t, max < 10 ? 1 : 0)}
          </text>
        </g>
      ))}
      {spec.yLabel && (
        <text x={12} y={m.t + h / 2} transform={`rotate(-90 12 ${m.t + h / 2})`} textAnchor="middle" className="axis-label">
          {spec.yLabel}
        </text>
      )}
      {spec.labels.map((lb, i) => (
        <text key={lb + i} x={m.l + band * (i + 0.5)} y={height - m.b + 18} textAnchor="middle" className="axis-label">
          {lb}
        </text>
      ))}
      {spec.type === 'bar' &&
        spec.series.map((s, si) => {
          const bw = (band * 0.62) / spec.series.length;
          return s.values.map((v, i) => {
            const x = m.l + band * i + band * 0.19 + bw * si;
            const val = Number.isFinite(v) ? v : 0;
            return (
              <g key={`${si}-${i}`}>
                <rect x={x} y={y(val)} width={bw} height={m.t + h - y(val)} fill={COLORS[si % COLORS.length]} rx={2} />
                {label(x + bw / 2, y(val) - 6, v, s.datumIds?.[i])}
              </g>
            );
          });
        })}
      {(spec.type === 'line' || spec.type === 'scatter') &&
        spec.series.map((s, si) => {
          const pts = s.values.map((v, i) => [m.l + band * (i + 0.5), Number.isFinite(v) ? y(v) : NaN] as const);
          const valid = pts.filter((p) => Number.isFinite(p[1]));
          return (
            <g key={si}>
              {spec.type === 'line' && valid.length > 1 && (
                <polyline points={valid.map((p) => p.join(',')).join(' ')} fill="none" stroke={COLORS[si % COLORS.length]} strokeWidth={2.5} />
              )}
              {pts.map(([px, py], i) =>
                Number.isFinite(py) ? (
                  <g key={i}>
                    <circle cx={px} cy={py} r={4.5} fill={COLORS[si % COLORS.length]} />
                    {label(px, py - 10, s.values[i], s.datumIds?.[i])}
                  </g>
                ) : null,
              )}
            </g>
          );
        })}
      <line x1={m.l} x2={width - m.r} y1={m.t + h} y2={m.t + h} className="axis" />
    </svg>
  );
}

function Pie({ spec, width, height }: { spec: ChartSpec; width: number; height: number }) {
  const values = spec.series[0]?.values ?? [];
  const total = values.reduce((s, v) => s + (Number.isFinite(v) && v > 0 ? v : 0), 0);
  const cx = width / 2 - 70;
  const cy = height / 2;
  const r = Math.min(height / 2 - 16, 100);
  let a0 = -Math.PI / 2;
  return (
    <svg className="chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={spec.title}>
      {total === 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#c9ced6" strokeDasharray="4 4" />}
      {total > 0 &&
        values.map((v, i) => {
          if (!Number.isFinite(v) || v <= 0) return null;
          const frac = v / total;
          const a1 = a0 + frac * Math.PI * 2;
          const large = frac > 0.5 ? 1 : 0;
          const d =
            frac >= 0.9999
              ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`
              : `M ${cx} ${cy} L ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`;
          a0 = a1;
          return <path key={i} d={d} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth={2} />;
        })}
      {spec.labels.map((lb, i) => (
        <g key={i} transform={`translate(${cx + r + 30}, ${cy - 20 + i * 24})`}>
          <rect width={12} height={12} y={-10} fill={COLORS[i % COLORS.length]} rx={2} />
          <text x={18} className="axis-label">
            {lb}: {Number.isFinite(values[i]) ? `${fmt(values[i])} (${total ? Math.round((values[i] / total) * 100) : 0}%)` : '—'}
          </text>
        </g>
      ))}
    </svg>
  );
}
