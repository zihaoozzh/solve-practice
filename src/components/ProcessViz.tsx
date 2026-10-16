import { useEffect, useMemo, useRef, useState } from 'react';
import type { RecEvent, Region } from '../lib/recorder';
import { fmtTime } from '../lib/format';

type PhaseEv = Extract<RecEvent, { k: 'phase' }>;

export interface PhaseSlice {
  index: number;
  phase: PhaseEv;
  start: number;
  end: number;
  events: RecEvent[];
}

/** Divide el registro en fases (cada marca de fase abre un tramo). */
export function slicePhases(events: RecEvent[]): PhaseSlice[] {
  const marks = events.map((e, i) => ({ e, i })).filter((x): x is { e: PhaseEv; i: number } => x.e.k === 'phase');
  const last = events.length ? events[events.length - 1].t : 0;
  return marks.map((m, j) => {
    const start = m.e.t;
    const end = marks[j + 1]?.e.t ?? last;
    return { index: j, phase: m.e, start, end, events: events.filter((e) => e.t >= start && e.t <= end && e.k !== 'phase') };
  });
}

const W = 900;

function Layout({ regions, scale }: { regions: Region[]; scale: number }) {
  // Se dibujan primero las zonas grandes y encima las pequeñas
  const sorted = regions.slice().sort((a, b) => b.w * b.h - a.w * a.h);
  return (
    <g>
      {sorted.map((r, i) => (
        <g key={i}>
          <rect x={r.x * scale} y={r.y * scale} width={r.w * scale} height={r.h * scale} className="viz-region" />
          {r.w * scale > 60 && r.h * scale > 14 && (
            <text x={r.x * scale + 4} y={r.y * scale + 11} className="viz-region-label">
              {r.name}
            </text>
          )}
        </g>
      ))}
    </g>
  );
}

/** Mapa de calor de la posición del ratón sobre el esquema de la pantalla de una fase. */
export function Heatmap({ slice }: { slice: PhaseSlice }) {
  const { phase } = slice;
  const scale = W / Math.max(phase.dw, 1);
  const H = Math.max(200, phase.dh * scale);
  const CELL = 24;
  const cells = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of slice.events) {
      if (e.k !== 'move') continue;
      const cx = Math.floor((e.x * scale) / CELL);
      const cy = Math.floor((e.y * scale) / CELL);
      const k = `${cx},${cy}`;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [slice, scale]);
  const max = Math.max(1, ...cells.values());
  const clicks = slice.events.filter((e): e is Extract<RecEvent, { k: 'click' }> => e.k === 'click');
  return (
    <svg className="viz" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Mapa de calor del ratón">
      <rect width={W} height={H} className="viz-bg" />
      <Layout regions={phase.layout} scale={scale} />
      {[...cells.entries()].map(([k, n]) => {
        const [cx, cy] = k.split(',').map(Number);
        const v = n / max;
        return <rect key={k} x={cx * CELL} y={cy * CELL} width={CELL} height={CELL} fill={`hsl(${(1 - v) * 55}, 90%, 50%)`} opacity={0.15 + v * 0.6} />;
      })}
      {clicks.map((c, i) => (
        <circle key={i} cx={c.x * scale} cy={c.y * scale} r={4} className="viz-click" />
      ))}
    </svg>
  );
}

/** Repetición de una fase: cursor, clics y descripción de lo que se hace. */
export function Replay({ slice, describe }: { slice: PhaseSlice; describe: (e: RecEvent) => string | null }) {
  const { phase } = slice;
  const scale = W / Math.max(phase.dw, 1);
  const H = Math.max(200, phase.dh * scale);
  const duration = Math.max(1, slice.end - slice.start);
  const [t, setT] = useState(0); // ms desde el inicio de la fase
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);

  useEffect(() => {
    setT(0);
    setPlaying(false);
  }, [slice]);

  useEffect(() => {
    if (!playing) return;
    const step = (now: number) => {
      const prev = last.current ?? now;
      last.current = now;
      setT((cur) => {
        const nt = cur + (now - prev) * speed;
        if (nt >= duration) {
          setPlaying(false);
          return duration;
        }
        return nt;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      last.current = null;
    };
  }, [playing, speed, duration]);

  const abs = slice.start + t;
  const moves = slice.events.filter((e): e is Extract<RecEvent, { k: 'move' }> => e.k === 'move');
  let cursor: { x: number; y: number } | null = null;
  for (const m of moves) {
    if (m.t > abs) break;
    cursor = m;
  }
  const scrolls = slice.events.filter((e): e is Extract<RecEvent, { k: 'scroll' }> => e.k === 'scroll' && e.t <= abs);
  const scrollY = scrolls.length ? scrolls[scrolls.length - 1].y : 0;
  const recentClicks = slice.events.filter((e): e is Extract<RecEvent, { k: 'click' }> => e.k === 'click' && e.t <= abs && abs - e.t < 600);
  const captions = slice.events
    .filter((e) => e.t <= abs && abs - e.t < 2500)
    .map(describe)
    .filter((x): x is string => !!x);
  const caption = captions[captions.length - 1];

  return (
    <div className="replay">
      <div className="replay-controls">
        <button type="button" className="btn small primary" onClick={() => (t >= duration ? (setT(0), setPlaying(true)) : setPlaying(!playing))}>
          {playing ? '❚❚ Pausa' : t >= duration ? '↺ Repetir' : '▶ Reproducir'}
        </button>
        {[1, 4, 8].map((s) => (
          <button key={s} type="button" className={`btn small ${speed === s ? 'saved' : 'outline'}`} onClick={() => setSpeed(s)}>
            x{s}
          </button>
        ))}
        <input type="range" min={0} max={duration} value={t} onChange={(e) => setT(Number(e.target.value))} aria-label="Posición de la repetición" />
        <span className="muted small">
          {fmtTime(t / 1000)} / {fmtTime(duration / 1000)}
        </span>
      </div>
      <div className="replay-caption">{caption ?? ' '}</div>
      <svg className="viz" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Repetición">
        <rect width={W} height={H} className="viz-bg" />
        <Layout regions={phase.layout} scale={scale} />
        <rect x={0} y={scrollY * scale} width={W} height={phase.vh * scale} className="viz-viewport" />
        {recentClicks.map((c, i) => (
          <circle key={i} cx={c.x * scale} cy={c.y * scale} r={6 + ((abs - c.t) / 600) * 14} className="viz-ripple" />
        ))}
        {cursor && (
          <path
            d={`M ${cursor.x * scale} ${cursor.y * scale} l 0 16 l 4 -4 l 4 8 l 3 -1 l -4 -8 l 6 0 z`}
            className="viz-cursor"
          />
        )}
      </svg>
    </div>
  );
}
