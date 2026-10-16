import { ReactNode, useState } from 'react';
import { TRAITS } from '../seawolf';

/** Botón con confirmación en línea (sin diálogos nativos). */
export function ConfirmButton({
  children,
  warning,
  onConfirm,
  disabled,
  className = 'btn primary',
  labels = { confirm: 'Sí, continuar', cancel: 'Cancelar' },
}: {
  children: ReactNode;
  warning: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  labels?: { confirm: string; cancel: string };
}) {
  const [asking, setAsking] = useState(false);
  if (asking)
    return (
      <div className="confirm-box">
        <span>{warning}</span>
        <button type="button" className="btn primary" autoFocus onClick={() => { setAsking(false); onConfirm(); }}>
          {labels.confirm}
        </button>
        <button type="button" className="btn ghost" onClick={() => setAsking(false)}>
          {labels.cancel}
        </button>
      </div>
    );
  return (
    <button type="button" className={className} disabled={disabled} onClick={() => setAsking(true)}>
      {children}
    </button>
  );
}

export function TraitIcon({ trait, size = 18 }: { trait: string; size?: number }) {
  const def = TRAITS.find((t) => t.key === trait);
  if (!def) return null;
  const c = def.color;
  const s = size;
  const h = s / 2;
  let shape: ReactNode;
  switch (def.shape) {
    case 'star': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 === 0 ? h - 1 : h * 0.42;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        return `${h + r * Math.cos(a)},${h + r * Math.sin(a)}`;
      }).join(' ');
      shape = <polygon points={pts} fill={c} />;
      break;
    }
    case 'ring':
      shape = <circle cx={h} cy={h} r={h - 2.5} fill="none" stroke={c} strokeWidth={2.5} strokeDasharray="2.5 2" />;
      break;
    case 'wave':
      shape = <path d={`M1 ${h} q ${s / 8} -${s / 3} ${s / 4} 0 t ${s / 4} 0 t ${s / 4} 0 t ${s / 4} 0`} fill="none" stroke={c} strokeWidth={2.4} strokeLinecap="round" />;
      break;
    case 'hex': {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i;
        return `${h + (h - 1.5) * Math.cos(a)},${h + (h - 1.5) * Math.sin(a)}`;
      }).join(' ');
      shape = <polygon points={pts} fill={c} />;
      break;
    }
    case 'sun':
      shape = (
        <g stroke={c} strokeWidth={2} strokeLinecap="round">
          <circle cx={h} cy={h} r={h * 0.38} fill={c} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (Math.PI / 4) * i;
            return <line key={i} x1={h + h * 0.6 * Math.cos(a)} y1={h + h * 0.6 * Math.sin(a)} x2={h + (h - 1) * Math.cos(a)} y2={h + (h - 1) * Math.sin(a)} />;
          })}
        </g>
      );
      break;
    case 'spike':
      shape = <polygon points={`${h},1 ${s - 1},${s - 2} 1,${s - 2}`} fill={c} />;
      break;
    case 'pair':
      shape = (
        <g fill={c}>
          <circle cx={h * 0.65} cy={h} r={h * 0.5} />
          <circle cx={h * 1.35} cy={h} r={h * 0.5} opacity={0.65} />
        </g>
      );
      break;
    case 'square':
      shape = <rect x={2} y={2} width={s - 4} height={s - 4} rx={3} fill={c} />;
      break;
  }
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true" className="trait-icon">
      {shape}
    </svg>
  );
}

export function TraitTag({ trait, tone, lang = 'es' }: { trait: string; tone?: 'req' | 'proh'; lang?: 'es' | 'en' }) {
  const def = TRAITS.find((t) => t.key === trait);
  return (
    <span className={`trait-tag ${tone ?? ''}`}>
      <TraitIcon trait={trait} size={15} />
      {def?.labels[lang]}
    </span>
  );
}

export function SimpleTable({ title, columns, rows, footnotes }: { title?: string; columns: string[]; rows: string[][]; footnotes?: string[] }) {
  return (
    <div className="material-table">
      {title && <div className="material-title">{title}</div>}
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? 'row-label' : 'num'}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {footnotes?.map((f) => (
        <div key={f} className="footnote">
          {f}
        </div>
      ))}
    </div>
  );
}
