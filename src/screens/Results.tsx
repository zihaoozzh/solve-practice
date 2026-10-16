import { ReactNode } from 'react';
import { Chart } from '../components/Chart';
import { SimpleTable, TraitIcon } from '../components/ui';
import { fmt, fmtTime } from '../lib/format';
import { MODE_LABEL, Mode } from '../lib/history';
import { gradeAnalysis, gradeBlank, gradeCase, gradeRedrock, RedrockAnswers, RedrockTimes } from '../redrock';
import type { RedrockScenario } from '../redrock/types';
import { gradeZone, Microbe, microbeIndex, methodSteps, SeaWolfScenario, traitLabel, ZoneAnswer, zoneInsights } from '../seawolf';

export interface RedrockRunResult {
  scenario: RedrockScenario;
  answers: RedrockAnswers;
  times: RedrockTimes;
  timedOut: boolean;
}
export interface SeaWolfRunResult {
  scenario: SeaWolfScenario;
  answers: ZoneAnswer[];
  aidsUsed: boolean;
  timedOut: boolean;
}

interface Props {
  mode: Mode;
  redrock?: RedrockRunResult;
  seawolf?: SeaWolfRunResult;
  savedTo?: 'file' | 'browser' | null;
  onHome: () => void;
  onStats?: () => void;
  onRepeat: () => void;
}

export function seaWolfScore(r: SeaWolfRunResult): number {
  const index = microbeIndex(r.scenario);
  const g = r.scenario.zones.map((z, i) => gradeZone(z, r.answers[i], index));
  return Math.round(g.reduce((s, x) => s + x.score, 0) / g.length);
}

export function Results({ mode, redrock, seawolf, savedTo, onHome, onStats, onRepeat }: Props) {
  const rr = redrock ? gradeRedrock(redrock.scenario, redrock.answers) : null;
  const sw = seawolf ? seaWolfScore(seawolf) : null;
  const overall = rr && sw != null ? Math.round((rr.overall + sw) / 2) : (rr?.overall ?? sw ?? 0);
  const seed = redrock?.scenario.seed ?? seawolf?.scenario.seed;
  const difficulty = redrock?.scenario.difficulty ?? seawolf?.scenario.difficulty;

  return (
    <div className="results">
      <header className="results-header">
        <div>
          <div className="q-num">Resultados · {MODE_LABEL[mode]}</div>
          <h1>{overall}%</h1>
          <div className="muted">
            Semilla <strong>{seed}</strong> · {difficulty === 'hard' ? 'Difícil' : 'Normal'}
          </div>
          <div className="muted small">
            {savedTo === 'file' ? 'Intento guardado en data/intentos.json.' : savedTo === 'browser' ? 'Intento guardado en este navegador.' : 'Guardando intento…'}
          </div>
        </div>
        <div className="results-actions">
          <button type="button" className="btn outline" onClick={onRepeat}>
            Repetir este escenario
          </button>
          {onStats && (
            <button type="button" className="btn outline" onClick={onStats}>
              Ver evolución
            </button>
          )}
          <button type="button" className="btn primary" onClick={onHome}>
            Volver al inicio
          </button>
        </div>
      </header>
      {redrock && rr && <RedrockReview r={redrock} />}
      {seawolf && <SeaWolfReview r={seawolf} />}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const CHART_NAMES: Record<string, string> = { bar: 'barras', line: 'líneas', pie: 'tarta', scatter: 'dispersión' };

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function Verdict({ ok }: { ok: boolean }) {
  return <span className={`verdict ${ok ? 'ok' : 'ko'}`}>{ok ? '✓ Correcto' : '✗ Incorrecto'}</span>;
}

function RedrockReview({ r }: { r: RedrockRunResult }) {
  const { scenario: s, answers: a, times } = r;
  const g = gradeRedrock(s, a);
  const st = s.study;
  const relevantIds = Object.values(st.data).filter((d) => d.relevant).map((d) => d.id);
  const missing = relevantIds.filter((id) => !a.journal.includes(id));
  const ct = st.chartTask;
  return (
    <section className="review">
      <h2>Redrock Study {r.timedOut && <span className="tag warn">tiempo agotado</span>}</h2>
      <div className="stats">
        <Stat label="Puntuación Redrock" value={`${g.overall}%`} />
        <Stat label="Análisis" value={`${pct(g.analysis.correct, g.analysis.total)}%`} sub={`${g.analysis.correct}/${g.analysis.total}`} />
        <Stat label="Informe" value={`${pct(g.report.correct, g.report.total)}%`} sub={`${g.report.correct}/${g.report.total}`} />
        <Stat label="Casos" value={`${pct(g.cases.correct, g.cases.total)}%`} sub={`${g.cases.correct}/${g.cases.total}`} />
        <Stat
          label="Precisión del diario"
          value={`${Math.round(g.journal.precision * 100)}%`}
          sub={`${g.journal.relevantSaved} relevantes de ${g.journal.saved} guardadas · ${g.journal.relevantSaved}/${g.journal.relevantTotal} necesarias`}
        />
      </div>
      <div className="stats times">
        <Stat label="Investigación" value={fmtTime(times.investigation)} />
        <Stat label="Análisis" value={fmtTime(times.analysis)} />
        <Stat label="Informe" value={fmtTime(times.report)} />
        <Stat label="Estudio total" value={fmtTime(times.study)} sub="guía ≈23:00" />
        <Stat label="Casos" value={fmtTime(times.cases)} sub="guía ≈12:00" />
      </div>

      <h3>Diario de investigación</h3>
      <div className="card">
        {a.journal.length === 0 && <p className="muted">No guardaste ninguna cifra.</p>}
        {a.journal.map((id) => {
          const d = st.data[id];
          return (
            <div key={id} className={`review-line ${d.relevant ? 'ok' : 'ko'}`}>
              <strong>
                {d.display} {d.unit}
              </strong>{' '}
              — {d.label} · {d.relevant ? 'relevante' : `irrelevante: ${d.note ?? 'no se necesita para ninguna pregunta.'}`}
            </div>
          );
        })}
        {missing.length > 0 && (
          <p className="muted">
            Te faltó guardar: {missing.map((id) => `${st.data[id].label} (${st.data[id].display} ${st.data[id].unit})`).join('; ')}.
          </p>
        )}
      </div>

      <h3>Distractores del material</h3>
      <div className="card">
        <p className="muted small">Cifras que no necesitaba ninguna pregunta y por qué. Las marcadas con ● las guardaste en el diario.</p>
        {Object.values(st.data)
          .filter((d) => !d.relevant)
          .map((d) => (
            <div key={d.id} className="review-line neutral">
              {a.journal.includes(d.id) && <span className="sol-mark">● </span>}
              <strong>
                {d.display} {d.unit}
              </strong>{' '}
              — {d.label}: {d.note ?? 'no se necesita para ninguna pregunta.'}
            </div>
          ))}
      </div>

      <h3>Análisis</h3>
      {st.questions.map((q, i) => (
        <div key={q.id} className="card review-item">
          <div className="review-head">
            <span className="q-num">Pregunta {i + 1}</span>
            <Verdict ok={gradeAnalysis(q, a.analysis[q.id])} />
          </div>
          <div className="q-prompt">{q.prompt}</div>
          <div className="answers-compare">
            <span>
              Tu respuesta: <strong>{a.analysis[q.id] || '—'}</strong> {q.unit}
            </span>
            <span>
              Correcta: <strong>{fmt(q.answer, q.decimals)}</strong> {q.unit} (±{q.tolerance})
            </span>
          </div>
          <Steps steps={q.steps} trap={q.trap} />
          <div className="muted small">Datos necesarios: {q.requiredData.map((id) => st.data[id].label).join(' · ')}</div>
        </div>
      ))}

      <h3>Informe</h3>
      <div className="card review-item">
        {st.blanks.map((b, i) => {
          const raw = a.blanks[b.id];
          const yours = b.kind === 'select' ? (raw ? b.options![Number(raw)] : '—') : raw || '—';
          const correct = b.kind === 'select' ? b.options![b.correctIndex!] : fmt(b.answer!, b.decimals ?? 1);
          return (
            <div key={b.id} className="blank-review">
              <div className="review-head">
                <span className="q-num">Hueco {i + 1}</span>
                <Verdict ok={gradeBlank(b, raw)} />
              </div>
              <div className="answers-compare">
                <span>
                  Tu respuesta: <strong>{yours}</strong>
                </span>
                <span>
                  Correcta: <strong>{correct}</strong>
                </span>
              </div>
              <div className="explain">{b.explanation}</div>
            </div>
          );
        })}
        <div className="blank-review">
          <div className="review-head">
            <span className="q-num">Gráfico: {ct.message}</span>
            <Verdict ok={g.report.chartTypeOk && g.report.chartValuesOk} />
          </div>
          <div className="answers-compare">
            <span>
              Tipo elegido: <strong>{a.chartType ? CHART_NAMES[a.chartType] : '—'}</strong> {g.report.chartTypeOk ? '✓' : '✗'}
            </span>
            <span>
              Tipo correcto: <strong>{CHART_NAMES[ct.correctType]}</strong>
            </span>
          </div>
          <div className="answers-compare">
            {ct.elements.map((e, i) => (
              <span key={i}>
                {e.label}: tu valor <strong>{a.chartValues[i] != null ? ct.valueOptions[a.chartValues[i]!].text : '—'}</strong> · correcto{' '}
                <strong>{ct.valueOptions[e.correctIndex].text}</strong>
              </span>
            ))}
          </div>
          <div className="explain">{ct.explanation}</div>
        </div>
      </div>

      <h3>Casos</h3>
      {s.cases.map((c, i) => {
        const raw = a.cases[c.id];
        const yours = c.format === 'mcq' ? (raw ? c.options![Number(raw)] : '—') : raw ? `${raw} ${c.unit}` : '—';
        const correct = c.format === 'mcq' ? c.options![c.correctIndex!] : `${fmt(c.answer, c.decimals)} ${c.unit}`;
        return (
          <div key={c.id} className="card review-item">
            <div className="review-head">
              <span className="q-num">
                Caso {i + 1} · {c.typeLabel}
              </span>
              <Verdict ok={gradeCase(c, raw)} />
            </div>
            <div className="case-review-body">
              <div>
                {c.table && <SimpleTable {...c.table} />}
                {c.chart && <Chart spec={c.chart} width={420} height={200} />}
              </div>
              <div>
                <div className="q-prompt">{c.prompt}</div>
                <div className="answers-compare">
                  <span>
                    Tu respuesta: <strong>{yours}</strong>
                  </span>
                  <span>
                    Correcta: <strong>{correct}</strong>
                  </span>
                </div>
                <Steps steps={c.steps} trap={c.trap} />
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Steps({ steps, trap }: { steps: string[]; trap: string }) {
  return (
    <div className="steps">
      <div className="steps-title">Solución paso a paso</div>
      <ol>
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <div className="trap">
        <strong>Trampa:</strong> {trap}
      </div>
    </div>
  );
}

function SeaWolfReview({ r }: { r: SeaWolfRunResult }) {
  const { scenario: s, answers } = r;
  const index = microbeIndex(s);
  const grades = s.zones.map((z, i) => gradeZone(z, answers[i], index));
  const valid = grades.filter((g) => g.check.valid).length;
  return (
    <section className="review">
      <h2>
        Sea Wolf {r.timedOut && <span className="tag warn">tiempo agotado</span>}
        {r.aidsUsed && <span className="tag">con ayudas de práctica</span>}
      </h2>
      <div className="stats">
        <Stat label="Puntuación Sea Wolf" value={`${seaWolfScore(r)}%`} sub="media de eficacia por sitio (−20 % por regla fallida)" />
        <Stat label="Sitios al 100 %" value={`${valid}/${s.zones.length}`} />
        {s.zones.map((z, i) => (
          <Stat key={i} label={`Sitio ${i + 1}`} value={`${grades[i].score}%`} sub={`${fmtTime(answers[i]?.timeSec ?? 0)} (guía ≈${z.suggestedMin}:00)`} />
        ))}
      </div>
      {s.zones.map((z, i) => {
        const g = grades[i];
        const ans = answers[i];
        const ins = zoneInsights(z, ans);
        const inSol = new Set(z.solutions.flat());
        return (
          <div key={i} className="card review-item">
            <div className="review-head">
              <span className="q-num">
                Sitio {i + 1} · {z.name}
                {z.extremeCarriers && <span className="tag warn">rasgo deseado solo con valores extremos</span>}
              </span>
              <Verdict ok={g.check.valid} />
            </div>
            <div className="zone-rules-line">
              {z.attributes.map((a, ai) => (
                <span key={a}>
                  {a}: media {z.ranges[ai][0]}–{z.ranges[ai][1]} (suma {z.ranges[ai][0] * 3}–{z.ranges[ai][1] * 3})
                </span>
              ))}
              <span>
                Deseado: <TraitIcon trait={z.required} size={14} /> {traitLabel(z.required, z.lang)}
              </span>
              <span>
                No deseado: <TraitIcon trait={z.prohibited} size={14} /> {traitLabel(z.prohibited, z.lang)}
              </span>
            </div>
            <div className="stats compact">
              <Stat label="Tríos válidos" value={ins.validTrios} sub="alcanzables con los candidatos del sitio" />
              <Stat label="Casi válidos" value={ins.nearMisses} sub="fallan por una sola regla" />
              <Stat label="Tu pool" value={`${ans.pool.length}`} sub={`${g.savedInSolution} formaban parte de alguna solución`} />
            </div>
            <div className="bottleneck">
              <strong>Cuello de botella: {ins.bottleneck.rule}.</strong> {ins.bottleneck.explanation}
            </div>
            <div className="sw-columns">
              <div>
                <div className="steps-title">Tu tratamiento</div>
                <MicrobeTable zone={z} ids={ans.selected} byId={index} inSol={inSol} />
                {g.check.valid ? (
                  <p className="ok-text">Cumple todas las reglas.</p>
                ) : (
                  <ul className="violations">
                    {g.check.violations.map((v, vi) => (
                      <li key={vi}>
                        <strong>{v.rule}:</strong> {v.detail}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="steps-title">Una solución válida</div>
                <MicrobeTable zone={z} ids={g.exampleSolution} byId={index} inSol={inSol} />
              </div>
            </div>
            <div className="process">
              {ins.poolHadSolution ? (
                <p className="ok-text">Tu pool contenía al menos un trío válido.</p>
              ) : (
                <>
                  <strong>Lo que debiste guardar:</strong>
                  <ul className="missed">
                    {ins.missed.map((m) => (
                      <li key={m.microbe.id}>
                        <strong>{m.microbe.name}</strong> ({m.microbe.attrs.join(' / ')}, {traitLabel(m.microbe.traits[0], z.lang)}) — {m.where} Aparece en {m.inSolutions}{' '}
                        trío{m.inSolutions === 1 ? '' : 's'} válido{m.inSolutions === 1 ? '' : 's'}.
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div className="steps">
              <div className="steps-title">Método recomendado</div>
              <ol className="plain">
                {methodSteps(z).map((m, mi) => (
                  <li key={mi}>{m}</li>
                ))}
              </ol>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function MicrobeTable({ zone, ids, byId, inSol }: { zone: SeaWolfScenario['zones'][number]; ids: string[]; byId: Map<string, Microbe>; inSol: Set<string> }) {
  if (!ids.length) return <p className="muted">Sin selección.</p>;
  const ms = ids.map((id) => byId.get(id)!).filter(Boolean);
  return (
    <table className="mini-table">
      <thead>
        <tr>
          <th>Microbio</th>
          {zone.attributes.map((a) => (
            <th key={a}>{a}</th>
          ))}
          <th>Rasgos</th>
        </tr>
      </thead>
      <tbody>
        {ms.map((m) => (
          <tr key={m.id}>
            <td>
              {m.name}
              {inSol.has(m.id) && (
                <span className="sol-mark" title="Forma parte de alguna solución válida">
                  {' '}●
                </span>
              )}
            </td>
            {m.attrs.map((v, i) => (
              <td key={i} className="num">
                {v}
              </td>
            ))}
            <td>
              {m.traits.map((t) => (
                <span key={t} className="trait-inline" title={traitLabel(t, zone.lang)}>
                  <TraitIcon trait={t} size={14} />
                  {traitLabel(t, zone.lang)}
                </span>
              ))}
            </td>
          </tr>
        ))}
        <tr className="sum-row">
          <td>Suma (media)</td>
          {zone.attributes.map((_, i) => {
            const sum = ms.reduce((s, m) => s + m.attrs[i], 0);
            return (
              <td key={i} className="num">
                {sum} ({ms.length ? (Math.round((sum / ms.length) * 100) / 100).toString() : '—'})
              </td>
            );
          })}
          <td />
        </tr>
      </tbody>
    </table>
  );
}
