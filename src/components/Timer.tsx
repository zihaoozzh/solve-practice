import { useEffect, useRef, useState } from 'react';
import { fmtTime } from '../lib/format';

export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Cuenta atrás global: llama a onExpire una sola vez al llegar a 0. */
export function useCountdown(durationSec: number, onExpire: () => void) {
  const start = useRef(Date.now());
  const deadline = start.current + durationSec * 1000;
  const now = useNow();
  const remaining = Math.max(0, (deadline - now) / 1000);
  const fired = useRef(false);
  const cb = useRef(onExpire);
  cb.current = onExpire;
  useEffect(() => {
    if (remaining <= 0 && !fired.current) {
      fired.current = true;
      cb.current();
    }
  }, [remaining]);
  return { remaining, elapsed: (now - start.current) / 1000, startedAt: start.current, now };
}

export function TimerBadge({ remaining, total }: { remaining: number; total: number }) {
  const frac = remaining / total;
  const cls = remaining < 60 ? 'danger' : frac < 0.2 ? 'warn' : '';
  return (
    <div className={`timer ${cls}`} aria-live="off">
      <span className="timer-icon">⏱</span>
      <span className="timer-value">{fmtTime(remaining)}</span>
      <div className="timer-bar">
        <div style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }} />
      </div>
    </div>
  );
}
