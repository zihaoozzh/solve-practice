import { useMemo, useState } from 'react';
import type { FullAnalysis } from '../analysis';
import type { SessionLog } from '../lib/recorder';
import { fmtTime } from '../lib/format';
import type { HistoryEntry } from '../lib/history';
import { Heatmap, Replay, slicePhases } from '../components/ProcessViz';

interface Props {
  analysis: FullAnalysis;
  log: SessionLog | null;
  sessionSaved: boolean | null;
  previous: HistoryEntry[];
}

const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString('es-ES', { maximumFractionDigits: 1 });
const pctOf = (e: number, m: number) => (m ? Math.round((e / m) * 1000) / 10 : 0);

export function AnalysisView({ analysis: a, log, sessionSaved, previous }: Props) {
  const prevAvg = previous.length ? previous.reduce((s, e) => s + e.score, 0) / previous.length : null;
  const slices = useMemo(() => (log ? slicePhases(log.events).filter((s) => s.end - s.start > 500) : []), [log]);
  const [sliceIdx, setSliceIdx] = useState(0);
  const slice = slices[Math.min(sliceIdx, slices.length - 1)];
  const lostTotal = a.overall.pointsOff.reduce((s, p) => s + p.lost, 0);

  return (
    <section className="review analysis">
      <h2>Análisis del intento</h2>

      {/* ---------------- Resumen */}
      <div className="stats">
        <div className="stat">
          <div className="stat-label">Nota global</div>
          <div className="stat-value">{n1(a.overall.scorePct)} %</div>
          <div className="stat-sub">
            {a.games.length > 1 ? `Media de las ${a.games.length} pruebas (cada una pesa lo mismo)` : `${n1(a.overall.earned)} de ${n1(a.overall.max)} puntos`}
          </div>
        </div>
        {a.games.map((g) => (
          <div key={g.game} className="stat">
            <div className="stat-label">{g.label}</div>
            <div className="stat-value">{n1(pctOf(g.earned, g.max))} %</div>
            <div className="stat-sub">
              {n1(g.earned)}/{n1(g.max)} puntos
            </div>
          </div>
        ))}
        <div className="stat">
          <div className="stat-label">Tendencia</div>
          <div className="stat-value">{prevAvg == null ? '—' : `${a.overall.scorePct - prevAvg >= 0 ? '+' : ''}${n1(a.overall.scorePct - prevAvg)}`}</div>
          <div className="stat-sub">{prevAvg == null ? 'Primer intento de este modo' : `frente a tu media de ${previous.length} intento(s) anteriores (${n1(prevAvg)} %)`}</div>
        </div>
      </div>
      <div className="part-bars">
        {a.games.flatMap((g) =>
          g.parts.map((p) => (
            <div key={`${g.game}-${p.key}`} className="part-bar">
              <span className="part-name">
                {g.label} · {p.label}
              </span>
              <span className="bar">
                <span style={{ width: `${pctOf(p.earned, p.max)}%` }} />
              </span>
              <span className="part-score">
                {n1(p.earned)}/{n1(p.max)}
              </span>
            </div>
          )),
        )}
      </div>

      {/* ---------------- Consejos */}
      <h3>3 consejos para el siguiente intento</h3>
      <ol className="tips">
        {a.tips.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
        {a.tips.length === 0 && <li>No has perdido puntos: repite en Difícil o en modo examen.</li>}
      </ol>

      {/* ---------------- Dónde se fueron los puntos */}
      <h3>Dónde se fueron los puntos</h3>
      <div className="card">
        <p className="muted small">
          Ordenado por lo que resta a tu nota. «% de la nota» es lo que ese fallo resta a tu nota global (con varias pruebas, cada una pesa lo mismo). Total perdido: {n1(lostTotal)} puntos ={' '}
          {n1(100 - a.overall.scorePct)} % de la nota.
        </p>
        <table className="mini-table points-off">
          <thead>
            <tr>
              <th>Puntos</th>
              <th>% de la nota</th>
              <th>Dónde</th>
              <th>Por qué</th>
            </tr>
          </thead>
          <tbody>
            {a.overall.pointsOff.map((p) => (
              <tr key={p.item.id}>
                <td className="num lost">−{n1(p.lost)}</td>
                <td className="num lost">−{n1(p.pct)} %</td>
                <td>
                  <strong>{p.gameLabel}</strong> · {p.item.label}
                </td>
                <td className="small">{p.item.why}</td>
              </tr>
            ))}
            {a.overall.pointsOff.length === 0 && (
              <tr>
                <td colSpan={4}>No has perdido ningún punto.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------------- Rúbrica */}
      <h3>Rúbrica: de dónde sale cada punto</h3>
      {a.games.map((g) => (
        <details key={g.game} className="card rubric">
          <summary>
            <strong>{g.label}</strong>: {n1(g.earned)}/{n1(g.max)} puntos
          </summary>
          {g.parts.map((p) => (
            <div key={p.key} className="rubric-part">
              <div className="review-head">
                <span className="q-num">{p.label}</span>
                <span>
                  {n1(p.earned)}/{n1(p.max)}
                </span>
              </div>
              <p className="muted small">{p.rule}</p>
              <table className="mini-table">
                <tbody>
                  {p.items.map((i) => (
                    <tr key={i.id} className={i.earned < i.max ? 'row-ko' : ''}>
                      <td>{i.label}</td>
                      <td className="num">
                        {n1(i.earned)}/{n1(i.max)}
                      </td>
                      <td className="small">{i.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </details>
      ))}

      {/* ---------------- Tiempo */}
      <h3>Tiempo</h3>
      <div className="sw-columns">
        <div className="card">
          <div className="steps-title">Por parte frente a la referencia</div>
          <table className="mini-table">
            <tbody>
              {a.parts.map((p) => (
                <tr key={`${p.game}-${p.label}`} className={p.sec > p.refSec ? 'row-ko' : ''}>
                  <td>
                    {p.game} · {p.label}
                  </td>
                  <td className="num">{fmtTime(p.sec)}</td>
                  <td className="num muted">ref. {fmtTime(p.refSec)}</td>
                  <td className="num">{p.sec > p.refSec ? `+${fmtTime(p.sec - p.refSec)}` : '✓'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="steps-title">Dónde te atascaste</div>
          {a.time.slowest.length === 0 && <p className="muted small">Sin decisiones registradas.</p>}
          <ul className="plain-list">
            {a.time.slowest.map((d, i) => (
              <li key={i}>
                <strong>{d.sec.toFixed(1)} s</strong> · {d.label} {d.correct === true ? '✓' : d.correct === false ? '✗' : ''}
              </li>
            ))}
          </ul>
          <div className="steps-title">Inactividad (&gt; 10 s)</div>
          {a.time.idle.length === 0 ? (
            <p className="muted small">Ningún periodo de inactividad.</p>
          ) : (
            <ul className="plain-list">
              {a.time.idle.slice(0, 5).map((d, i) => (
                <li key={i}>
                  {fmtTime(d.fromSec)} · {Math.round(d.sec)} s en {a.context.phaseLabel(d.phase)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---------------- Patrones */}
      <h3>Patrones de proceso</h3>
      {a.patterns.length === 0 && <p className="muted">No se han detectado patrones destacables.</p>}
      <div className="patterns">
        {a.patterns.map((p) => (
          <div key={p.id} className={`card pattern sev-${p.severity}`}>
            <div className="review-head">
              <strong>{p.title}</strong>
              <span className={`tag ${p.severity === 'alta' ? 'warn' : ''}`}>{p.severity}</span>
            </div>
            <p>{p.detail}</p>
            {p.evidence.length > 0 && (
              <ul className="plain-list small">
                {p.evidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* ---------------- Mapa de calor y repetición */}
      <h3>Mapa de calor y repetición</h3>
      {!log || !slices.length ? (
        <p className="muted">No hay registro de ratón para este intento.</p>
      ) : (
        <div className="card">
          <p className="muted small">
            {sessionSaved ? `Registro guardado en data/sesiones/${log.meta.id}.json.` : 'Registro solo en memoria (sin servidor local).'} El esquema muestra las zonas de la pantalla
            de cada fase; el rectángulo azul de la repetición es la parte visible de la pantalla.
          </p>
          <div className="config-row">
            <span className="config-label">Fase</span>
            <select value={sliceIdx} onChange={(e) => setSliceIdx(Number(e.target.value))} aria-label="Fase del mapa de calor">
              {slices.map((s, i) => (
                <option key={i} value={i}>
                  {a.context.phaseLabel(s.phase.name)} · {fmtTime((s.end - s.start) / 1000)}
                </option>
              ))}
            </select>
          </div>
          {slice && (
            <div className="sw-columns">
              <div>
                <div className="steps-title">Mapa de calor</div>
                <Heatmap slice={slice} />
              </div>
              <div>
                <div className="steps-title">Repetición</div>
                <Replay slice={slice} describe={a.context.describe} />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
