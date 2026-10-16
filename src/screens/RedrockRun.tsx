import { useEffect, useRef, useState } from 'react';
import { recorder } from '../lib/recorder';
import { Chart } from '../components/Chart';
import { Calculator, CalcHistoryItem } from '../components/Calculator';
import { ConfirmButton, SimpleTable } from '../components/ui';
import { TimerBadge, useCountdown } from '../components/Timer';
import { fmt, fmtTime } from '../lib/format';
import { TIMING } from '../config';
import { UI_TEXT, UI } from '../i18n';
import { emptyRedrockAnswers, gradeCase, JOURNAL_MAX, RedrockAnswers, RedrockTimes } from '../redrock';
import type { CaseQuestion, ChartType, Datum, Material, RedrockScenario } from '../redrock/types';

type Phase = 'investigation' | 'analysis' | 'report' | 'cases';
const PHASE_ORDER: Phase[] = ['investigation', 'analysis', 'report', 'cases'];
/** Tipos de gráfico que mencionan las fuentes para el informe: líneas, barras y tarta. */
const CHART_TYPES: ChartType[] = ['bar', 'line', 'pie'];

interface Props {
  scenario: RedrockScenario;
  durationSec: number;
  label?: string;
  /** Modo examen: sin pistas, sin guía de tiempos y sin soluciones hasta el final. */
  exam?: boolean;
  onFinish: (answers: RedrockAnswers, times: RedrockTimes, timedOut: boolean) => void;
}

export function RedrockRun({ scenario, durationSec, label, exam = false, onFinish }: Props) {
  const { study, cases } = scenario;
  const ui = UI_TEXT[scenario.lang];
  const confirmLabels = { confirm: ui.confirm, cancel: ui.cancel };
  const [phase, setPhase] = useState<Phase>('investigation');
  const [caseIdx, setCaseIdx] = useState(0);
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [answers, setAnswers] = useState<RedrockAnswers>(() => emptyRedrockAnswers(scenario));
  const [expr, setExpr] = useState('');
  const [calcHistory, setCalcHistory] = useState<CalcHistoryItem[]>([]);
  const [flash, setFlash] = useState('');
  const finished = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  // Tiempo acumulado por fase (se puede ir y volver entre Investigación y Análisis).
  const phaseTime = useRef<Record<Phase, number>>({ investigation: 0, analysis: 0, report: 0, cases: 0 });
  const lastSwitch = useRef(Date.now());
  const phaseRef = useRef<Phase>('investigation');
  const caseStart = useRef(0);

  const flush = () => {
    const now = Date.now();
    phaseTime.current[phaseRef.current] += (now - lastSwitch.current) / 1000;
    lastSwitch.current = now;
  };

  const finish = (timedOut: boolean) => {
    if (finished.current) return;
    finished.current = true;
    flush();
    const t = phaseTime.current;
    const times: RedrockTimes = {
      investigation: t.investigation,
      analysis: t.analysis,
      report: t.report,
      cases: t.cases,
      study: t.investigation + t.analysis + t.report,
    };
    onFinish(answersRef.current, times, timedOut);
  };

  const { remaining, now } = useCountdown(durationSec, () => finish(true));
  const goto = (p: Phase) => {
    flush();
    phaseRef.current = p;
    if (p === 'cases') caseStart.current = Date.now();
    setPhase(p);
    window.scrollTo(0, 0);
  };

  const phaseElapsed = phaseTime.current[phase] + (now - lastSwitch.current) / 1000;
  const caseElapsed = phase === 'cases' ? (now - caseStart.current) / 1000 : 0;

  const toggleDatum = (id: string) => {
    const a = answersRef.current;
    if (a.journal.includes(id)) {
      recorder.journal('remove', id);
      setAnswers({ ...a, journal: a.journal.filter((x) => x !== id) });
      return;
    }
    if (a.journal.length >= JOURNAL_MAX) {
      setFlash(ui.journalFull(JOURNAL_MAX));
      setTimeout(() => setFlash(''), 2500);
      return;
    }
    recorder.journal('add', id);
    setAnswers({ ...a, journal: [...a.journal, id] });
  };

  // --- registro: inicio al primer foco, decisión al confirmar, cambios de opinión
  const begun = useRef(new Set<string>());
  const committed = useRef(new Map<string, string>());
  const beginOnce = (kind: string, item: string) => {
    const key = `${kind}|${item}`;
    if (begun.current.has(key)) return;
    begun.current.add(key);
    recorder.begin(kind, item);
  };
  const commit = (kind: string, item: string, value: string) => {
    const key = `${kind}|${item}`;
    const prev = committed.current.get(key);
    if (prev === value || (prev === undefined && value === '')) return;
    if (prev !== undefined && prev !== '') recorder.change(kind, item, prev, value);
    committed.current.set(key, value);
    recorder.decide(kind, item, value);
  };
  useEffect(() => {
    recorder.phase(`redrock-${phase}`);
  }, [phase]);
  useEffect(() => {
    if (phase === 'cases' && cases[caseIdx]) recorder.begin('case', cases[caseIdx].id);
  }, [phase, caseIdx]);
  const saved = new Set(answers.journal);
  const insert = (v: string) => setExpr(expr + v);

  const journal = (
    <Journal
      ui={ui}
      entries={answers.journal.map((id) => study.data[id])}
      calcs={answers.calcs}
      editable={phase === 'investigation'}
      onRemove={(id) => toggleDatum(id)}
      onInsert={phase !== 'investigation' ? (v) => insert(v) : undefined}
    />
  );
  const calc = (
    <Calculator
      expr={expr}
      setExpr={setExpr}
      history={calcHistory}
      setHistory={setCalcHistory}
      labels={{ title: ui.calculator, history: ui.history, clear: ui.clear, save: ui.saveToJournal }}
      onSave={
        phase === 'cases'
          ? undefined
          : (item) =>
              setAnswers((a) => (a.calcs.some((c) => c.expr === item.expr && c.result === item.result) ? a : { ...a, calcs: [...a.calcs, item] }))
      }
    />
  );

  const guide = TIMING.redrockPhaseGuideSec[phase];
  const curIdx = PHASE_ORDER.indexOf(phase);
  const currentCase = cases[caseIdx];
  const showFeedback = !exam && feedbackFor === currentCase?.id;

  const nextCase = () => {
    setFeedbackFor(null);
    if (caseIdx < cases.length - 1) {
      setCaseIdx(caseIdx + 1);
      caseStart.current = Date.now();
    } else finish(false);
  };

  return (
    <div className="run">
      <header className="run-header" data-region="header">
        <div className="run-title">
          <span className="brand-dot" /> {label ?? 'Redrock Study'}
          <span className="seed-chip">
            {scenario.seed} · {scenario.difficulty === 'hard' ? 'Difícil' : 'Normal'} · {scenario.lang.toUpperCase()}
            {exam ? ' · examen' : ''}
          </span>
        </div>
        <ol className="stepper">
          {PHASE_ORDER.map((p, i) => (
            <li key={p} className={i === curIdx ? 'active' : i < curIdx ? 'done' : ''}>
              {ui.phases[p]}
            </li>
          ))}
        </ol>
        <div className="guide">
          {!exam && (
            <>
              <span className={phaseElapsed > guide ? 'over' : ''}>
                {ui.phases[phase]} {fmtTime(phaseElapsed)} / ≈{fmtTime(guide)}
              </span>
              {phase === 'cases' && (
                <span className={caseElapsed > TIMING.perCaseGuideSec ? 'over' : ''}>
                  {ui.caseOf(caseIdx + 1, cases.length)} {fmtTime(caseElapsed)} / ≈{fmtTime(TIMING.perCaseGuideSec)}
                </span>
              )}
            </>
          )}
        </div>
        <TimerBadge remaining={remaining} total={durationSec} />
      </header>

      {flash && <div className="toast">{flash}</div>}

      {phase === 'investigation' && (
        <div className="layout">
          <main className="main" data-region="material">
            <div className="objective" data-region="objective">
              <div className="objective-label">{ui.objective}</div>
              <div className="objective-text">{study.objective}</div>
            </div>
            {!exam && <p className="hint">{ui.investigationHint(JOURNAL_MAX)}</p>}
            {study.materials.map((m) => (
              <MaterialView key={m.id} ui={ui} m={m} data={study.data} saved={saved} onClick={toggleDatum} />
            ))}
            <div className="actions">
              <button type="button" className="btn primary" onClick={() => goto('analysis')}>
                {ui.goAnalysis}
              </button>
            </div>
          </main>
          <aside className="side" data-region="journal">{journal}</aside>
        </div>
      )}

      {phase === 'analysis' && (
        <div className="layout">
          <main className="main">
            <div className="objective small">
              <div className="objective-label">{ui.objective}</div>
              <div className="objective-text">{study.objective}</div>
            </div>
            {!exam && <p className="hint">{ui.analysisHint}</p>}
            {study.questions.map((q, i) => (
              <div key={q.id} className="card question" data-track={`question:${q.id}`}>
                <div className="q-num">
                  {ui.question} {i + 1}
                </div>
                <div className="q-prompt">{q.prompt}</div>
                <div className="q-meta">
                  {ui.round(q.decimals)}
                  {!exam && ` · ${ui.tolerance} ±${q.tolerance}`}
                </div>
                <div className="answer-row">
                  <input
                    className="num-input"
                    inputMode="decimal"
                    value={answers.analysis[q.id] ?? ''}
                    onFocus={() => beginOnce('analysis', q.id)}
                    onBlur={(e) => commit('analysis', q.id, e.target.value)}
                    onChange={(e) => setAnswers((a) => ({ ...a, analysis: { ...a.analysis, [q.id]: e.target.value } }))}
                    aria-label={`${ui.question} ${i + 1}`}
                  />
                  <span className="unit">{q.unit}</span>
                </div>
              </div>
            ))}
            <div className="actions">
              <button type="button" className="btn ghost btn-back" onClick={() => goto('investigation')}>
                ← {ui.phases.investigation}
              </button>
              <ConfirmButton labels={confirmLabels} warning={ui.warnReport} onConfirm={() => goto('report')}>
                {ui.goReport}
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
          <main className="main" data-region="report">
            <div className="card memo" data-region="memo">
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
                        <input
                          key={i}
                          className="blank-input"
                          inputMode="decimal"
                          value={val}
                          placeholder="___"
                          data-track={`blank:${b.id}`}
                          onFocus={() => beginOnce('report', b.id)}
                          onBlur={(e) => commit('report', b.id, e.target.value)}
                          onChange={(e) => set(e.target.value)}
                          aria-label={b.id}
                        />
                      );
                    return (
                      <select
                        key={i}
                        className="blank-select"
                        value={val}
                        data-track={`blank:${b.id}`}
                        onFocus={() => beginOnce('report', b.id)}
                        onChange={(e) => {
                          set(e.target.value);
                          commit('report', b.id, e.target.value);
                        }}
                        aria-label={b.id}
                      >
                        <option value="">{ui.choose}</option>
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
              <div className="q-num">{ui.chartTask}</div>
              <div className="q-prompt">{study.chartTask.message}</div>
              <div className="chart-type-row">
                {CHART_TYPES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`chart-type ${answers.chartType === c ? 'selected' : ''}`}
                    onClick={() => {
                      beginOnce('chart', 'type');
                      commit('chart', 'type', c);
                      setAnswers((a) => ({ ...a, chartType: c }));
                    }}
                    data-track={`chart-type:${c}`}
                  >
                    <MiniChartIcon type={c} />
                    {ui.chartTypes[c]}
                  </button>
                ))}
              </div>
              <div className="assign">
                {study.chartTask.elements.map((el, ei) => (
                  <label key={ei} className="assign-row">
                    <span>{el.label}</span>
                    <select
                      value={answers.chartValues[ei] ?? ''}
                      onChange={(e) => {
                        commit('chart', `value-${ei}`, e.target.value);
                        setAnswers((a) => {
                          const cv = a.chartValues.slice();
                          cv[ei] = e.target.value === '' ? null : Number(e.target.value);
                          return { ...a, chartValues: cv };
                        });
                      }}
                      aria-label={el.label}
                    >
                      <option value="">{ui.value}</option>
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
                      series: [{ name: 'value', values: answers.chartValues.map((v) => (v == null ? NaN : study.chartTask.valueOptions[v].value)) }],
                      decimals: study.chartTask.unit === '%' ? 2 : 0,
                    }}
                  />
                </div>
              )}
            </div>
            <div className="actions">
              <ConfirmButton labels={confirmLabels} warning={ui.warnCases} onConfirm={() => goto('cases')}>
                {ui.goCases}
              </ConfirmButton>
            </div>
          </main>
          <aside className="side">
            <div className="panel">
              <div className="panel-title">{ui.yourAnalysis}</div>
              {study.questions.map((q, i) => (
                <div key={q.id} className="mini-row">
                  {ui.question} {i + 1}: <strong>{answers.analysis[q.id] || '—'}</strong> {q.unit}
                </div>
              ))}
            </div>
            {journal}
            {calc}
          </aside>
        </div>
      )}

      {phase === 'cases' && currentCase && (
        <div className="layout">
          <main className="main">
            <CaseView onAnswerChange={(from, to) => from !== '' && from !== to && recorder.change('case', currentCase.id, from, to)} ui={ui} c={currentCase} index={caseIdx} total={cases.length} answers={answers} setAnswers={setAnswers} locked={showFeedback} />
            {showFeedback && <CaseFeedback c={currentCase} raw={answers.cases[currentCase.id]} />}
            <div className="actions">
              {showFeedback ? (
                <button type="button" className="btn primary" onClick={nextCase}>
                  {caseIdx < cases.length - 1 ? ui.nextCase : ui.finishRedrock}
                </button>
              ) : (
                <ConfirmButton
                  labels={confirmLabels}
                  warning={caseIdx < cases.length - 1 ? ui.warnNextCase : ui.warnFinishRedrock}
                  onConfirm={() => {
                    recorder.decide('case', currentCase.id, answers.cases[currentCase.id] ?? '');
                    if (exam) nextCase();
                    else setFeedbackFor(currentCase.id);
                  }}
                >
                  {caseIdx < cases.length - 1 ? ui.nextCase : ui.finishRedrock}
                </ConfirmButton>
              )}
            </div>
          </main>
          <aside className="side" data-region="side">{calc}</aside>
        </div>
      )}
    </div>
  );
}

function CaseView({
  onAnswerChange,
  ui,
  c,
  index,
  total,
  answers,
  setAnswers,
  locked,
}: {
  onAnswerChange: (from: string, to: string) => void;
  ui: UI;
  c: CaseQuestion;
  index: number;
  total: number;
  answers: RedrockAnswers;
  setAnswers: (f: (a: RedrockAnswers) => RedrockAnswers) => void;
  locked: boolean;
}) {
  const val = answers.cases[c.id] ?? '';
  const set = (v: string) => {
    if (locked) return;
    if (c.format === 'mcq') onAnswerChange(val, v);
    setAnswers((a) => ({ ...a, cases: { ...a.cases, [c.id]: v } }));
  };
  return (
    <div className="card case" data-region="case">
      <div className="q-num">{ui.caseOf(index + 1, total)}</div>
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
            <label key={oi} className={`option ${val === String(oi) ? 'selected' : ''}`} data-track={`option:${c.id}:${oi}`}>
              <input type="radio" name={c.id} checked={val === String(oi)} disabled={locked} onChange={() => set(String(oi))} />
              <span className="opt-letter">{String.fromCharCode(65 + oi)}</span> {o}
            </label>
          ))}
        </div>
      ) : (
        <div className="answer-row">
          <input className="num-input" inputMode="decimal" value={val} readOnly={locked} onChange={(e) => set(e.target.value)} aria-label={ui.question} />
          <span className="unit">{c.unit}</span>
          <span className="q-meta">{ui.round(c.decimals)}</span>
        </div>
      )}
    </div>
  );
}

/** Solución inmediata del mini-caso (solo en modo práctica). */
function CaseFeedback({ c, raw }: { c: CaseQuestion; raw: string | undefined }) {
  const ok = gradeCase(c, raw);
  const correct = c.format === 'mcq' ? c.options![c.correctIndex!] : `${fmt(c.answer, c.decimals)} ${c.unit}`;
  return (
    <div className={`card feedback ${ok ? 'ok' : 'ko'}`}>
      <div className="review-head">
        <span className="q-num">Corrección · {c.typeLabel}</span>
        <span className={`verdict ${ok ? 'ok' : 'ko'}`}>{ok ? '✓ Correcto' : '✗ Incorrecto'}</span>
      </div>
      <div className="answers-compare">
        <span>
          Respuesta correcta: <strong>{correct}</strong>
        </span>
      </div>
      <div className="steps">
        <ol>
          {c.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <div className="trap">
          <strong>Trampa:</strong> {c.trap}
        </div>
      </div>
    </div>
  );
}

function Journal({
  ui,
  entries,
  calcs,
  editable,
  onRemove,
  onInsert,
}: {
  ui: UI;
  entries: Datum[];
  calcs: { expr: string; result: string }[];
  editable: boolean;
  onRemove: (id: string) => void;
  onInsert?: (value: string) => void;
}) {
  return (
    <div className="panel journal">
      <div className="panel-title">
        {ui.journal} <span className="count">{entries.length}/{JOURNAL_MAX}</span>
      </div>
      {entries.length === 0 && <div className="muted small">{ui.journalEmpty}</div>}
      {entries.map((d) => (
        <div key={d.id} className="journal-entry">
          <button
            type="button"
            className="journal-main"
            onClick={onInsert ? () => onInsert(String(d.value)) : undefined}
            disabled={!onInsert}
            title={onInsert ? ui.insertInCalc : undefined}
          >
            <span className="j-value">
              {d.display} <span className="j-unit">{d.unit}</span>
            </span>
            <span className="j-label">{d.label}</span>
          </button>
          {editable && (
            <button type="button" className="icon-btn" onClick={() => onRemove(d.id)} aria-label={`${ui.remove} ${d.label}`}>
              ×
            </button>
          )}
        </div>
      ))}
      {Array.from({ length: Math.max(0, JOURNAL_MAX - entries.length) }).map((_, i) => (
        <div key={`e${i}`} className="journal-empty" />
      ))}
      {calcs.length > 0 && (
        <>
          <div className="journal-section">{ui.savedCalcs}</div>
          {calcs.map((c, i) => (
            <button
              key={i}
              type="button"
              className="journal-main calc-entry"
              onClick={onInsert ? () => onInsert(c.result) : undefined}
              disabled={!onInsert}
              title={onInsert ? ui.insertInCalc : undefined}
            >
              <span className="j-value">{c.result}</span>
              <span className="j-label">{c.expr}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function DatumButton({ ui, d, mark, saved, onClick }: { ui: UI; d: Datum; mark?: string; saved: boolean; onClick: (id: string) => void }) {
  return (
    <button
      type="button"
      className={`datum ${saved ? 'saved' : ''}`}
      data-track={`datum:${d.id}`}
      onClick={() => onClick(d.id)}
      title={saved ? ui.savedClickToRemove : ui.saveToJournal}
      aria-label={`${d.display}${mark ?? ''} ${d.unit}`}
      aria-pressed={saved}
    >
      {d.display}
      {mark && <sup>{mark}</sup>}
    </button>
  );
}

function MaterialView({ ui, m, data, saved, onClick }: { ui: UI; m: Material; data: Record<string, Datum>; saved: Set<string>; onClick: (id: string) => void }) {
  if (m.kind === 'paragraph')
    return (
      <section className="material" data-track={`text:${m.id}`} data-region={`material:${m.id}`}>
        <div className="material-title">{m.title}</div>
        <p>
          {m.segments.map((s, i) =>
            typeof s === 'string' ? <span key={i}>{s}</span> : <DatumButton key={i} ui={ui} d={data[s.datum]} saved={saved.has(s.datum)} onClick={onClick} />,
          )}
        </p>
      </section>
    );
  if (m.kind === 'table')
    return (
      <section className="material material-table" data-track={`table:${m.id}`} data-region={`material:${m.id}`}>
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
                    {c.datum ? <DatumButton ui={ui} d={data[c.datum]} mark={c.mark} saved={saved.has(c.datum)} onClick={onClick} /> : c.text}
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
    <section className="material material-chart" data-track={`chart:${m.id}`} data-region={`material:${m.id}`}>
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
    </svg>
  );
}
