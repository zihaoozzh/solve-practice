import { useRef, useState } from 'react';
import { Chart } from '../components/Chart';
import { Calculator, CalcHistoryItem } from '../components/Calculator';
import { ConfirmButton, SimpleTable } from '../components/ui';
import { TimerBadge, useCountdown } from '../components/Timer';
import { fmtTime } from '../lib/format';
import { emptyRedrockAnswers, JOURNAL_MAX, RedrockAnswers, RedrockTimes } from '../redrock';
import type { ChartType, Datum, Material, RedrockScenario } from '../redrock/types';

type Phase = 'investigation' | 'analysis' | 'report' | 'cases';

const PHASES: { key: Phase; label: string }[] = [
  { key: 'investigation', label: 'Investigación' },
  { key: 'analysis', label: 'Análisis' },
  { key: 'report', label: 'Informe' },
  { key: 'cases', label: 'Casos' },
];

const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: 'bar', label: 'Barras' },
  { key: 'line', label: 'Líneas' },
  { key: 'pie', label: 'Tarta' },
  { key: 'scatter', label: 'Dispersión' },
];

interface Props {
  scenario: RedrockScenario;
  durationSec: number;
  label?: string;
  onFinish: (answers: RedrockAnswers, times: RedrockTimes, timedOut: boolean) => void;
}

export function RedrockRun({ scenario, durationSec, label, onFinish }: Props) {
  const { study, cases } = scenario;
  const [phase, setPhase] = useState<Phase>('investigation');
  const [caseIdx, setCaseIdx] = useState(0);
  const [answers, setAnswers] = useState<RedrockAnswers>(() => emptyRedrockAnswers(scenario));
  const [expr, setExpr] = useState('');
  const [calcHistory, setCalcHistory] = useState<CalcHistoryItem[]>([]);
  const [flash, setFlash] = useState('');
  const marks = useRef<Partial<Record<Phase | 'end', number>>>({});
  const finished = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const finish = (timedOut: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const t0 = startedAt;
    const end = Date.now();
    const m = marks.current;
    const span = (a: number | undefined, b: number | undefined) => (a ? ((b ?? end) - a) / 1000 : 0);
    const times: RedrockTimes = {
      investigation: span(t0, m.analysis),
      analysis: span(m.analysis, m.report),
      report: span(m.report, m.cases),
      cases: span(m.cases, undefined),
      study: span(t0, m.cases),
    };
    onFinish(answersRef.current, times, timedOut);
  };

  const { remaining, startedAt, now } = useCountdown(durationSec, () => finish(true));
  const goto = (p: Phase) => {
    marks.current[p] = Date.now();
    setPhase(p);
    window.scrollTo(0, 0);
  };

  const studyElapsed = ((marks.current.cases ?? now) - startedAt) / 1000;
  const casesElapsed = marks.current.cases ? (now - marks.current.cases) / 1000 : 0;

  const toggleDatum = (id: string) => {
    const a = answersRef.current;
    if (a.journal.includes(id)) {
      setAnswers({ ...a, journal: a.journal.filter((x) => x !== id) });
      return;
    }
    if (a.journal.length >= JOURNAL_MAX) {
      setFlash(`El diario está lleno (máx. ${JOURNAL_MAX}). Quita una entrada para guardar otra.`);
      setTimeout(() => setFlash(''), 2500);
      return;
    }
    setAnswers({ ...a, journal: [...a.journal, id] });
  };
  const saved = new Set(answers.journal);
  const insert = (v: string) => setExpr(expr + v);

  const journal = (
    <Journal
      entries={answers.journal.map((id) => study.data[id])}
      editable={phase === 'investigation'}
      onRemove={(id) => toggleDatum(id)}
      onInsert={phase !== 'investigation' ? (d) => insert(String(d.value)) : undefined}
    />
  );
  const calc = <Calculator expr={expr} setExpr={setExpr} history={calcHistory} setHistory={setCalcHistory} />;

  return (
    <div className="run">
      <header className="run-header">
        <div className="run-title">
          <span className="brand-dot" /> {label ?? 'Redrock Study'}
          <span className="seed-chip">semilla {scenario.seed} · {scenario.difficulty === 'hard' ? 'Difícil' : 'Normal'}</span>
        </div>
        <ol className="stepper">
          {PHASES.map((p, i) => {
            const cur = PHASES.findIndex((x) => x.key === phase);
            return (
              <li key={p.key} className={i === cur ? 'active' : i < cur ? 'done' : ''}>
                {p.label}
              </li>
            );
          })}
        </ol>
        <div className="guide">
          <span className={studyElapsed > 23 * 60 && phase !== 'cases' ? 'over' : ''}>Estudio {fmtTime(studyElapsed)} / ≈23:00</span>
          <span className={casesElapsed > 12 * 60 ? 'over' : ''}>Casos {fmtTime(casesElapsed)} / ≈12:00</span>
        </div>
        <TimerBadge remaining={remaining} total={durationSec} />
      </header>

      {flash && <div className="toast">{flash}</div>}

      {phase === 'investigation' && (
        <div className="layout">
          <main className="main">
            <div className="objective">
              <div className="objective-label">Objetivo de la investigación</div>
              <div className="objective-text">{study.objective}</div>
            </div>
            <p className="hint">
              Haz clic en las cifras que necesites para guardarlas en el diario de investigación (máx. {JOURNAL_MAX}). En la siguiente fase el material
              desaparece: solo tendrás el diario.
            </p>
            {study.materials.map((m) => (
              <MaterialView key={m.id} m={m} data={study.data} saved={saved} onClick={toggleDatum} />
            ))}
            <div className="actions">
              <ConfirmButton warning="Pasarás a Análisis y el material dejará de verse. No podrás volver." onConfirm={() => goto('analysis')}>
                Ir a Análisis →
              </ConfirmButton>
            </div>
          </main>
          <aside className="side">{journal}</aside>
        </div>
      )}

      {phase === 'analysis' && (
        <div className="layout">
          <main className="main">
            <div className="objective small">
              <div className="objective-label">Objetivo de la investigación</div>
              <div className="objective-text">{study.objective}</div>
            </div>
            <p className="hint">Responde con los datos del diario. Haz clic en una entrada del diario para insertarla en la calculadora.</p>
            {study.questions.map((q, i) => (
              <div key={q.id} className="card question">
                <div className="q-num">Pregunta {i + 1}</div>
                <div className="q-prompt">{q.prompt}</div>
                <div className="q-meta">
                  {roundText(q.decimals)} · tolerancia aceptada ±{q.tolerance}
                </div>
                <div className="answer-row">
                  <input
                    className="num-input"
                    inputMode="decimal"
                    value={answers.analysis[q.id] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, analysis: { ...a.analysis, [q.id]: e.target.value } }))}
                    aria-label={`Respuesta pregunta ${i + 1}`}
                  />
                  <span className="unit">{q.unit}</span>
                </div>
              </div>
            ))}
            <div className="actions">
              <ConfirmButton warning="Pasarás a Informe. Las respuestas de Análisis quedarán fijadas." onConfirm={() => goto('report')}>
                Ir a Informe →
              </ConfirmButton>
            </div>
          </main>
          <aside className="side">
            {journal}
            {calc}
          </aside>
        </div>
      )}

      {phase === 'report' && (
        <div className="layout">
          <main className="main">
            <div className="card memo">
              <div className="memo-title">{study.memoTitle}</div>
              {study.memo.map((para, pi) => (
                <p key={pi}>
                  {para.map((part, i) => {
                    if (typeof part === 'string') return <span key={i}>{part}</span>;
                    const b = study.blanks.find((x) => x.id === part.blank)!;
                    const val = answers.blanks[b.id] ?? '';
                    const set = (v: string) => setAnswers((a) => ({ ...a, blanks: { ...a.blanks, [b.id]: v } }));
                    if (b.kind === 'number')
                      return (
                        <input key={i} className="blank-input" inputMode="decimal" value={val} placeholder="___" onChange={(e) => set(e.target.value)} aria-label={`Hueco ${b.id}`} />
                      );
                    return (
                      <select key={i} className="blank-select" value={val} onChange={(e) => set(e.target.value)} aria-label={`Hueco ${b.id}`}>
                        <option value="">— elige —</option>
                        {b.options!.map((o, oi) => (
                          <option key={oi} value={oi}>
                            {o}
                          </option>
                        ))}
                      </select>
                    );
                  })}
                </p>
              ))}
            </div>

            <div className="card">
              <div className="q-num">Tarea de gráfico</div>
              <div className="q-prompt">{study.chartTask.message}</div>
              <div className="chart-type-row">
                {CHART_TYPES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`chart-type ${answers.chartType === c.key ? 'selected' : ''}`}
                    onClick={() => setAnswers((a) => ({ ...a, chartType: c.key }))}
                  >
                    <MiniChartIcon type={c.key} />
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="assign">
                {study.chartTask.elements.map((el, ei) => (
                  <label key={ei} className="assign-row">
                    <span>{el.label}</span>
                    <select
                      value={answers.chartValues[ei] ?? ''}
                      onChange={(e) =>
                        setAnswers((a) => {
                          const cv = a.chartValues.slice();
                          cv[ei] = e.target.value === '' ? null : Number(e.target.value);
                          return { ...a, chartValues: cv };
                        })
                      }
                      aria-label={`Valor para ${el.label}`}
                    >
                      <option value="">— valor —</option>
                      {study.chartTask.valueOptions.map((o, oi) => (
                        <option key={oi} value={oi}>
                          {o.text}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {answers.chartType && (
                <div className="chart-preview">
                  <Chart
                    width={520}
                    height={220}
                    spec={{
                      type: answers.chartType,
                      title: 'preview',
                      labels: study.chartTask.elements.map((e) => e.label),
                      series: [
                        {
                          name: 'value',
                          values: answers.chartValues.map((v) => (v == null ? NaN : study.chartTask.valueOptions[v].value)),
                        },
                      ],
                      decimals: study.chartTask.unit === '%' ? 1 : 0,
                    }}
                  />
                </div>
              )}
            </div>
            <div className="actions">
              <ConfirmButton warning="Cerrarás el estudio y empezarán los 6 casos. No podrás volver." onConfirm={() => goto('cases')}>
                Terminar el estudio e ir a Casos →
              </ConfirmButton>
            </div>
          </main>
          <aside className="side">
            <div className="panel">
              <div className="panel-title">Tus resultados de Análisis</div>
              {study.questions.map((q, i) => (
                <div key={q.id} className="mini-row">
                  Q{i + 1}: <strong>{answers.analysis[q.id] || '—'}</strong> {q.unit}
                </div>
              ))}
            </div>
            {journal}
            {calc}
          </aside>
        </div>
      )}

      {phase === 'cases' && (
        <div className="layout">
          <main className="main">
            {(() => {
              const c = cases[caseIdx];
              const val = answers.cases[c.id] ?? '';
              const set = (v: string) => setAnswers((a) => ({ ...a, cases: { ...a.cases, [c.id]: v } }));
              return (
                <div className="card case">
                  <div className="q-num">
                    Caso {caseIdx + 1} de {cases.length}
                  </div>
                  <p>{c.intro}</p>
                  {c.table && <SimpleTable {...c.table} />}
                  {c.chart && (
                    <div className="material-chart">
                      <div className="material-title">{c.chart.title}</div>
                      <Chart spec={c.chart} />
                    </div>
                  )}
                  <div className="q-prompt">{c.prompt}</div>
                  {c.format === 'mcq' ? (
                    <div className="options">
                      {c.options!.map((o, oi) => (
                        <label key={oi} className={`option ${val === String(oi) ? 'selected' : ''}`}>
                          <input type="radio" name={c.id} checked={val === String(oi)} onChange={() => set(String(oi))} />
                          <span className="opt-letter">{String.fromCharCode(65 + oi)}</span> {o}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="answer-row">
                      <input className="num-input" inputMode="decimal" value={val} onChange={(e) => set(e.target.value)} aria-label="Respuesta" />
                      <span className="unit">{c.unit}</span>
                      <span className="q-meta">{roundText(c.decimals)}</span>
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="actions">
              {caseIdx < cases.length - 1 ? (
                <ConfirmButton warning="No podrás volver a este caso." onConfirm={() => setCaseIdx(caseIdx + 1)}>
                  Siguiente caso →
                </ConfirmButton>
              ) : (
                <ConfirmButton warning="Terminarás Redrock y verás la corrección." onConfirm={() => finish(false)}>
                  Terminar Redrock
                </ConfirmButton>
              )}
            </div>
          </main>
          <aside className="side">{calc}</aside>
        </div>
      )}
    </div>
  );
}

function roundText(decimals: number): string {
  if (decimals === 0) return 'Redondea al número entero';
  return `Redondea a ${decimals} decimal${decimals === 1 ? '' : 'es'}`;
}

function Journal({
  entries,
  editable,
  onRemove,
  onInsert,
}: {
  entries: Datum[];
  editable: boolean;
  onRemove: (id: string) => void;
  onInsert?: (d: Datum) => void;
}) {
  return (
    <div className="panel journal">
      <div className="panel-title">
        Diario de investigación <span className="count">{entries.length}/{JOURNAL_MAX}</span>
      </div>
      {entries.length === 0 && <div className="muted small">Vacío. Haz clic en cifras del material para guardarlas.</div>}
      {entries.map((d) => (
        <div key={d.id} className="journal-entry">
          <button type="button" className="journal-main" onClick={onInsert ? () => onInsert(d) : undefined} disabled={!onInsert} title={onInsert ? 'Insertar en la calculadora' : undefined}>
            <span className="j-value">
              {d.display} <span className="j-unit">{d.unit}</span>
            </span>
            <span className="j-label">{d.label}</span>
          </button>
          {editable && (
            <button type="button" className="icon-btn" onClick={() => onRemove(d.id)} aria-label={`Quitar ${d.label}`}>
              ×
            </button>
          )}
        </div>
      ))}
      {Array.from({ length: Math.max(0, JOURNAL_MAX - entries.length) }).map((_, i) => (
        <div key={`e${i}`} className="journal-empty" />
      ))}
    </div>
  );
}

function DatumButton({ d, mark, saved, onClick }: { d: Datum; mark?: string; saved: boolean; onClick: (id: string) => void }) {
  return (
    <button
      type="button"
      className={`datum ${saved ? 'saved' : ''}`}
      onClick={() => onClick(d.id)}
      title={saved ? 'Guardado: clic para quitar' : 'Guardar en el diario'}
      aria-label={`${d.display}${mark ?? ''} ${d.unit}`}
      aria-pressed={saved}
    >
      {d.display}
      {mark && <sup>{mark}</sup>}
    </button>
  );
}

function MaterialView({ m, data, saved, onClick }: { m: Material; data: Record<string, Datum>; saved: Set<string>; onClick: (id: string) => void }) {
  if (m.kind === 'paragraph')
    return (
      <section className="material">
        <div className="material-title">{m.title}</div>
        <p>{m.segments.map((s, i) => (typeof s === 'string' ? <span key={i}>{s}</span> : <DatumButton key={i} d={data[s.datum]} saved={saved.has(s.datum)} onClick={onClick} />))}</p>
      </section>
    );
  if (m.kind === 'table')
    return (
      <section className="material material-table">
        <div className="material-title">{m.title}</div>
        <table>
          <thead>
            <tr>
              {m.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r, ri) => (
              <tr key={ri}>
                <td className="row-label">{r.label}</td>
                {r.cells.map((c, ci) => (
                  <td key={ci} className="num">
                    {c.datum ? <DatumButton d={data[c.datum]} mark={c.mark} saved={saved.has(c.datum)} onClick={onClick} /> : c.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {m.footnotes.map((f) => (
          <div key={f} className="footnote">
            {f}
          </div>
        ))}
      </section>
    );
  return (
    <section className="material material-chart">
      <div className="material-title">{m.chart.title}</div>
      <Chart spec={m.chart} onDatumClick={onClick} savedIds={saved} />
      {m.footnotes.map((f) => (
        <div key={f} className="footnote">
          {f}
        </div>
      ))}
    </section>
  );
}

function MiniChartIcon({ type }: { type: ChartType }) {
  const c = 'currentColor';
  return (
    <svg width={34} height={26} viewBox="0 0 34 26" aria-hidden="true">
      {type === 'bar' && (
        <g fill={c}>
          <rect x={3} y={12} width={6} height={12} />
          <rect x={14} y={5} width={6} height={19} />
          <rect x={25} y={15} width={6} height={9} />
        </g>
      )}
      {type === 'line' && <polyline points="2,20 11,12 20,15 32,4" fill="none" stroke={c} strokeWidth={2.5} />}
      {type === 'pie' && (
        <g>
          <circle cx={17} cy={13} r={11} fill="none" stroke={c} strokeWidth={2} />
          <path d="M17 13 L17 2 A11 11 0 0 1 27 17 Z" fill={c} />
        </g>
      )}
      {type === 'scatter' && (
        <g fill={c}>
          {[
            [5, 19],
            [10, 14],
            [15, 17],
            [20, 9],
            [26, 11],
            [30, 5],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.3} />
          ))}
        </g>
      )}
    </svg>
  );
}

