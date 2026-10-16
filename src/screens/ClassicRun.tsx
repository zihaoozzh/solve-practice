import { useEffect, useRef, useState } from 'react';
import { recorder } from '../lib/recorder';
import { ConfirmButton } from '../components/ui';
import { TimerBadge, useCountdown } from '../components/Timer';
import { fmtTime } from '../lib/format';
import { CLASSIC_CONFIG, ClassicAnswers, ClassicScenario, CRITERIA, CRITERION_LABEL, emptyClassic, previousOutcome, variantFor } from '../sfl/classic';

interface Props {
  scenario: ClassicScenario;
  durationSec: number;
  label?: string;
  exam?: boolean;
  onFinish: (answers: ClassicAnswers, timedOut: boolean) => void;
}

type Step = 'briefing' | 'ranking' | number;

export function ClassicRun({ scenario, durationSec, label, exam = false, onFinish }: Props) {
  const sc = scenario;
  const en = sc.lang === 'en';
  const t = (es: string, eng: string) => (en ? eng : es);
  const [step, setStep] = useState<Step>('briefing');
  const [ans, setAns] = useState<ClassicAnswers>(emptyClassic);
  const [order, setOrder] = useState<string[]>(() => sc.initiatives.map((i) => i.id));
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const stepStart = useRef(Date.now());
  const finished = useRef(false);
  const state = useRef(ans);
  state.current = ans;

  const finish = (a: ClassicAnswers, timedOut: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onFinish(a, timedOut);
  };
  const { remaining, now } = useCountdown(durationSec, () => finish(state.current, true));
  const stepElapsed = (now - stepStart.current) / 1000;

  const phaseName = step === 'briefing' || step === 'ranking' ? `sfl-classic-${step}` : `sfl-classic-${step}`;
  useEffect(() => {
    stepStart.current = Date.now();
    recorder.phase(phaseName);
    if (step === 'ranking') recorder.begin('sfl-rank', '0');
    if (typeof step === 'number') recorder.begin('sfl-decision', String(step));
  }, [step]);

  const spent = () => (Date.now() - stepStart.current) / 1000;
  const timeKey = typeof step === 'number' ? `d${step}` : step;
  const withTime = (a: ClassicAnswers): ClassicAnswers => ({ ...a, timeSec: { ...a.timeSec, [timeKey]: (a.timeSec[timeKey] ?? 0) + spent() } });

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    recorder.change('sfl-rank', '0', order.map(name).join(' > '), next.map(name).join(' > '));
    setOrder(next);
  };
  const name = (id: string) => sc.initiatives.find((i) => i.id === id)!.name;

  const decision = typeof step === 'number' ? sc.decisions.find((d) => d.n === step)! : null;
  const variantKey = decision ? (ans.shown[decision.n] ?? variantFor(sc, ans, decision.n)) : null;
  const variant = decision && variantKey ? decision.variants[variantKey] : null;

  const choose = (i: number) => {
    if (feedback != null || !decision || !variant) return;
    if (selected != null && selected !== i) recorder.change('sfl-decision', String(decision.n), variant.options[selected].text.slice(0, 60), variant.options[i].text.slice(0, 60));
    else recorder.answer('sfl-decision', String(decision.n), variant.options[i].text.slice(0, 60));
    setSelected(i);
  };

  const confirmDecision = () => {
    if (!decision || selected == null || !variant) return;
    recorder.decide('sfl-decision', String(decision.n), variant.options[selected].text.slice(0, 60));
    const a = withTime({ ...ans, choices: { ...ans.choices, [decision.n]: selected }, shown: { ...ans.shown, [decision.n]: variantKey! } });
    setAns(a);
    if (!exam) {
      setFeedback(selected);
      return;
    }
    advance(a);
  };
  const advance = (a: ClassicAnswers) => {
    setSelected(null);
    setFeedback(null);
    const n = step as number;
    if (n >= 13) finish(a, false);
    else setStep(n + 1);
    window.scrollTo(0, 0);
  };

  const outcome = typeof step === 'number' ? previousOutcome(sc, ans, step) : null;
  const total = 13;
  const idx = step === 'briefing' ? 0 : step === 'ranking' ? 1 : step;

  return (
    <div className="run classic">
      <header className="run-header" data-region="header">
        <div className="run-title">
          <span className="brand-dot sfl" /> {label ?? 'SFL Classic'}
          <span className="seed-chip">
            {sc.seed} · {sc.difficulty === 'hard' ? 'Difícil' : 'Normal'} · {sc.lang.toUpperCase()}
            {exam ? ' · examen' : ''}
          </span>
        </div>
        <div className="guide">
          <span>{step === 'briefing' ? 'Briefing' : `${t('Tarea', 'Task')} ${idx} / ${total}`}</span>
          {!exam && typeof step === 'number' && (
            <span className={stepElapsed > CLASSIC_CONFIG.decisionGuideSec ? 'over' : ''}>
              {fmtTime(stepElapsed)} / ≈1:30
            </span>
          )}
        </div>
        <TimerBadge remaining={remaining} total={durationSec} />
      </header>

      <div className="layout">
        <main className="main" data-region="classic">
          {step === 'briefing' && (
            <div className="card" data-region="briefing" data-track="briefing">
              <div className="q-num">Briefing</div>
              <h2>{sc.title}</h2>
              {sc.briefing.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              <p className="hint">
                {t(
                  'Igual que en la prueba, no podrás volver a este briefing. Anota en las notas lo que necesites.',
                  'As in the real test, you cannot come back to this briefing. Write down what you need in the notes.',
                )}
              </p>
              <div className="actions">
                <ConfirmButton
                  warning={t('¿Empezar? No podrás volver a leer el briefing.', 'Start? You will not be able to reread the briefing.')}
                  labels={{ confirm: t('Empezar', 'Start'), cancel: t('Cancelar', 'Cancel') }}
                  onConfirm={() => {
                    setAns(withTime(ans));
                    setStep('ranking');
                  }}
                >
                  {t('Empezar →', 'Start →')}
                </ConfirmButton>
              </div>
            </div>
          )}

          {step === 'ranking' && (
            <div className="card" data-region="ranking">
              <div className="q-num">{t('Tarea 1 · Ranking', 'Task 1 · Ranking')}</div>
              <h2>{t('Ordena las iniciativas de la más a la menos prioritaria para el piloto.', 'Rank the initiatives from highest to lowest priority for the pilot.')}</h2>
              <table className="assign-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('Iniciativa', 'Initiative')}</th>
                    {CRITERIA.map((c) => (
                      <th key={c}>{CRITERION_LABEL[sc.lang][c]}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {order.map((id, i) => {
                    const ini = sc.initiatives.find((x) => x.id === id)!;
                    return (
                      <tr key={id} data-track={`initiative:${id}`}>
                        <td>{i + 1}</td>
                        <td>
                          <strong>{ini.name}</strong>
                        </td>
                        {CRITERIA.map((c) => (
                          <td key={c}>{ini.scores[c]}</td>
                        ))}
                        <td>
                          <span className="btn-pair">
                            <button type="button" className="btn small ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('Subir', 'Move up')}>
                              ↑
                            </button>
                            <button type="button" className="btn small ghost" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={t('Bajar', 'Move down')}>
                              ↓
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="muted small">{t('Notas de 1 a 5 en cada criterio (5 es lo mejor).', 'Scores from 1 to 5 on each criterion (5 is best).')}</p>
              <div className="actions">
                <ConfirmButton
                  warning={t('¿Confirmar el ranking? No podrás cambiarlo.', 'Confirm the ranking? You cannot change it later.')}
                  labels={{ confirm: t('Confirmar', 'Confirm'), cancel: t('Cancelar', 'Cancel') }}
                  onConfirm={() => {
                    recorder.decide('sfl-rank', '0', order.map(name).join(' > '));
                    setAns(withTime({ ...ans, ranking: order }));
                    setStep(2);
                  }}
                >
                  {t('Confirmar ranking →', 'Confirm ranking →')}
                </ConfirmButton>
              </div>
            </div>
          )}

          {decision && variant && (
            <div className="card" data-region="decision">
              <div className="q-num">
                {t('Tarea', 'Task')} {decision.n}
              </div>
              {outcome && (
                <p className="outcome" data-track="outcome">
                  <strong>{t('Lo que pasó:', 'What happened:')}</strong> {outcome}
                </p>
              )}
              <p data-track="context">{variant.context}</p>
              {variant.table && (
                <table className="assign-table" data-track="table">
                  <thead>
                    <tr>
                      {variant.table.head.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {variant.table.rows.map((r, i) => (
                      <tr key={i}>
                        {r.map((c, k) => (
                          <td key={k}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <h2>{variant.question}</h2>
              <div className="option-list">
                {variant.options.map((o, i) => {
                  const fb = feedback != null;
                  const cls = fb ? (o.quality === 'best' ? 'fb-best' : i === feedback ? `fb-${o.quality}` : '') : '';
                  return (
                    <button key={i} type="button" className={`option ${selected === i ? 'selected' : ''} ${cls}`} data-track={`choice:${decision.n}-${i}`} onClick={() => choose(i)}>
                      {o.text}
                      {fb && (o.quality === 'best' || i === feedback) && <div className="small muted">{o.why}</div>}
                    </button>
                  );
                })}
              </div>
              <div className="actions">
                {feedback == null ? (
                  <ConfirmButton
                    disabled={selected == null}
                    warning={t('¿Confirmar? No podrás volver atrás.', 'Confirm? You cannot go back.')}
                    labels={{ confirm: t('Confirmar', 'Confirm'), cancel: t('Cancelar', 'Cancel') }}
                    onConfirm={confirmDecision}
                  >
                    {decision.n < 13 ? t('Confirmar y seguir →', 'Confirm and continue →') : t('Confirmar y terminar', 'Confirm and finish')}
                  </ConfirmButton>
                ) : (
                  <button type="button" className="btn primary" onClick={() => advance(ans)}>
                    {decision.n < 13 ? t('Siguiente →', 'Next →') : t('Ver la corrección', 'See the correction')}
                  </button>
                )}
              </div>
            </div>
          )}
        </main>

        <aside className="side" data-region="notes">
          <h3>{t('Tus notas', 'Your notes')}</h3>
          <textarea
            className="notes-area"
            value={notes}
            data-track="notes"
            placeholder={t('Pesos, umbral, dependencias…', 'Weights, threshold, dependencies…')}
            onChange={(e) => setNotes(e.target.value)}
            onFocus={() => recorder.focus('notes')}
          />
          <p className="muted small">{t('Como el papel en la prueba real: no se corrige.', 'Like scratch paper in the real test: it is not graded.')}</p>
        </aside>
      </div>
    </div>
  );
}
