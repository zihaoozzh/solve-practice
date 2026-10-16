import { useMemo, useState } from 'react';
import { Chart } from '../components/Chart';
import { fmtTime } from '../lib/format';
import { HistoryEntry, Mode, MODE_LABEL, Source } from '../lib/history';

interface Props {
  entries: HistoryEntry[];
  source: Source;
  file?: string;
  onBack: () => void;
  onClear: () => void;
  onExport: () => void;
}

const PHASE_ORDER = ['investigacion', 'analisis', 'informe', 'estudio', 'casos', 'zona-1', 'zona-2', 'zona-3'];

const CASE_LABELS: Record<string, string> = {
  pct_change: 'Cambio porcentual',
  pp_vs_pct: 'Puntos porcentuales vs. %',
  weighted_mean: 'Media ponderada',
  ratio_units: 'Proporciones y unidades',
  projection: 'Crecimiento compuesto vs. simple',
  chart_read: 'Lectura de gráficos',
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pctOf = (c: number, t: number) => (t ? Math.round((c / t) * 100) : NaN);
const show = (x: number, suffix = '%') => (Number.isFinite(x) ? `${Math.round(x)}${suffix}` : '—');

export function Stats({ entries, source, file, onBack, onClear, onExport }: Props) {
  const [mode, setMode] = useState<Mode | 'all'>('all');
  const [examOnly, setExamOnly] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const list = useMemo(
    () => entries.filter((e) => (mode === 'all' || e.mode === mode) && (!examOnly || e.exam)).slice().sort((a, b) => a.date.localeCompare(b.date)),
    [entries, mode, examOnly],
  );
  const last5 = list.slice(-5);
  const prev5 = list.slice(-10, -5);
  const trend = avg(last5.map((e) => e.score)) - avg(prev5.map((e) => e.score));

  const phases = useMemo(() => {
    const map = new Map<string, { name: string; scores: number[]; times: number[]; correct: number; total: number; last?: number }>();
    for (const e of list)
      for (const p of e.phases) {
        const cur = map.get(p.key) ?? { name: p.name, scores: [], times: [], correct: 0, total: 0 };
        if (p.score != null) cur.scores.push(p.score);
        cur.times.push(p.timeSec);
        cur.correct += p.correct ?? 0;
        cur.total += p.total ?? 0;
        cur.last = p.score;
        map.set(p.key, cur);
      }
    return [...map.entries()].sort((a, b) => PHASE_ORDER.indexOf(a[0]) - PHASE_ORDER.indexOf(b[0]));
  }, [list]);

  const caseTypes = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>();
    for (const e of list)
      for (const [k, v] of Object.entries(e.detail?.caseTypes ?? {})) {
        const cur = map.get(k) ?? { correct: 0, total: 0 };
        cur.correct += v.correct;
        cur.total += v.total;
        map.set(k, cur);
      }
    return [...map.entries()].sort((a, b) => pctOf(a[1].correct, a[1].total) - pctOf(b[1].correct, b[1].total));
  }, [list]);

  const chartList = list.slice(-20);
  const phaseKeysForChart = ['analisis', 'informe', 'casos', 'zona-1', 'zona-2', 'zona-3'].filter((k) => chartList.some((e) => e.phases.some((p) => p.key === k)));

  return (
    <div className="results stats-page">
      <header className="results-header">
        <div>
          <div className="q-num">Evolución</div>
          <h1>{list.length} intento{list.length === 1 ? '' : 's'}</h1>
          <div className="muted small">
            {source === 'file' ? (
              <>
                Guardado en el fichero <code>{file ?? 'data/intentos.json'}</code> del proyecto.
              </>
            ) : (
              <>Guardado solo en este navegador (no hay servidor local). Usa «Exportar JSON» para conservarlo en un fichero.</>
            )}
          </div>
        </div>
        <div className="results-actions">
          <button type="button" className="btn outline" onClick={onExport} disabled={!entries.length}>
            Exportar JSON
          </button>
          <button type="button" className="btn primary" onClick={onBack}>
            Volver al inicio
          </button>
        </div>
      </header>

      <div className="config-row">
        <span className="config-label">Filtrar</span>
        <div className="segmented">
          {(['all', 'redrock', 'seawolf', 'full'] as const).map((m) => (
            <button key={m} type="button" className={mode === m ? 'selected' : ''} onClick={() => setMode(m)}>
              {m === 'all' ? 'Todos' : MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <label className="switch">
          <input type="checkbox" checked={examOnly} onChange={(e) => setExamOnly(e.target.checked)} />
          Solo modo examen
        </label>
      </div>

      {list.length === 0 ? (
        <p className="muted">Aún no hay intentos con este filtro.</p>
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <div className="stat-label">Media global</div>
              <div className="stat-value">{show(avg(list.map((e) => e.score)))}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Mejor</div>
              <div className="stat-value">{show(Math.max(...list.map((e) => e.score)))}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Media últimos 5</div>
              <div className="stat-value">{show(avg(last5.map((e) => e.score)))}</div>
              <div className="stat-sub">
                {Number.isFinite(trend) ? `${trend >= 0 ? '+' : ''}${Math.round(trend)} pts frente a los 5 anteriores` : 'Necesitas más intentos para ver la tendencia'}
              </div>
            </div>
          </div>

          <h3>Puntuación por intento (últimos {chartList.length})</h3>
          <div className="card">
            <Chart
              width={980}
              height={260}
              spec={{
                type: 'line',
                title: 'Evolución',
                labels: chartList.map((_, i) => String(list.length - chartList.length + i + 1)),
                series: [
                  { name: 'Global', values: chartList.map((e) => e.score) },
                  ...phaseKeysForChart.map((k) => ({
                    name: k,
                    values: chartList.map((e) => e.phases.find((p) => p.key === k)?.score ?? NaN),
                  })),
                ],
                yLabel: '%',
                yMax: 100,
                showValues: false,
              }}
            />
            <div className="legend">
              {['Global', ...phaseKeysForChart.map((k) => phases.find((p) => p[0] === k)?.[1].name ?? k)].map((n, i) => (
                <span key={n} className="legend-item">
                  <span className={`legend-swatch s${i % 7}`} /> {n}
                </span>
              ))}
            </div>
          </div>

          <h3>Por fase</h3>
          <table className="history-table">
            <thead>
              <tr>
                <th>Fase</th>
                <th>Intentos</th>
                <th>Aciertos (total)</th>
                <th>Puntuación media</th>
                <th>Última</th>
                <th>Tiempo medio</th>
              </tr>
            </thead>
            <tbody>
              {phases.map(([key, p]) => (
                <tr key={key}>
                  <td>{p.name}</td>
                  <td>{p.times.length}</td>
                  <td>{p.total ? `${p.correct}/${p.total} (${pctOf(p.correct, p.total)}%)` : '—'}</td>
                  <td>{show(avg(p.scores))}</td>
                  <td>{show(p.last ?? NaN)}</td>
                  <td>{fmtTime(avg(p.times))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {caseTypes.length > 0 && (
            <>
              <h3>Mini-casos por tipo (de peor a mejor)</h3>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Aciertos</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {caseTypes.map(([k, v]) => (
                    <tr key={k}>
                      <td>{CASE_LABELS[k] ?? k}</td>
                      <td>
                        {v.correct}/{v.total}
                      </td>
                      <td>{pctOf(v.correct, v.total)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3>Todos los intentos</h3>
          <table className="history-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Modo</th>
                <th>Dificultad</th>
                <th>Semilla</th>
                <th>Puntuación</th>
                <th>Tiempo y aciertos por fase</th>
              </tr>
            </thead>
            <tbody>
              {list
                .slice()
                .reverse()
                .map((h) => (
                  <tr key={h.id}>
                    <td>{new Date(h.date).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>
                      {MODE_LABEL[h.mode]}
                      {h.exam ? <span className="tag">examen</span> : null}
                      {h.aids ? <span className="tag">ayudas</span> : null}
                      {h.lang === 'en' ? <span className="tag">EN</span> : null}
                    </td>
                    <td>{h.difficulty === 'hard' ? 'Difícil' : 'Normal'}</td>
                    <td>
                      <code>{h.seed}</code>
                    </td>
                    <td>
                      <strong>{h.score}%</strong>
                    </td>
                    <td className="phases">
                      {h.phases.map((p) => (
                        <span key={p.key} className="phase-chip">
                          {p.name} {fmtTime(p.timeSec)}
                          {p.total ? ` · ${p.correct}/${p.total}` : p.score != null ? ` · ${p.score}%` : ''}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}

      <div className="actions">
        {confirmClear ? (
          <div className="confirm-box">
            <span>Se borrarán todos los intentos{source === 'file' ? ' del fichero' : ''}. No se puede deshacer.</span>
            <button type="button" className="btn primary" onClick={() => { setConfirmClear(false); onClear(); }}>
              Sí, borrar
            </button>
            <button type="button" className="btn ghost" onClick={() => setConfirmClear(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button type="button" className="link-btn" onClick={() => setConfirmClear(true)} disabled={!entries.length}>
            Borrar historial
          </button>
        )}
      </div>
    </div>
  );
}
