import { useEffect, useMemo, useRef, useState } from 'react';
import { recorder } from '../lib/recorder';
import { ConfirmButton } from '../components/ui';
import { TimerBadge, useCountdown } from '../components/Timer';
import { fmtTime } from '../lib/format';
import {
  answerText,
  emptyIslandDay,
  ISLAND_CONFIG,
  IslandDayAnswer,
  IslandOnboardingAnswer,
  IslandScenario,
  OnboardingTopic,
  Level,
  LEVEL_LABEL,
  Reason,
  REASON_LABEL,
  REASONS,
  skillLabel,
  SKILLS,
} from '../sfl/island';
import { gradeIsland } from '../sfl/islandGrade';
import { SflDecisionList } from './SflReview';

interface Props {
  scenario: IslandScenario;
  durationSec: number;
  label?: string;
  exam?: boolean;
  onFinish: (answers: IslandDayAnswer[], timedOut: boolean, onboarding: IslandOnboardingAnswer) => void;
}

type Step = 'onboarding' | 'explore' | 'assign' | 'support' | 'reflect' | 'feedback';
const DAY_GUIDE_SEC = 10 * 60;

export function IslandRun({ scenario, durationSec, label, exam = false, onFinish }: Props) {
  const sc = scenario;
  const en = sc.lang === 'en';
  const t = (es: string, eng: string) => (en ? eng : es);
  const [dayIdx, setDayIdx] = useState(0);
  const [step, setStep] = useState<Step>('onboarding');
  // Onboarding: orden de las 4 preguntas; tras confirmar se ven las 4 respuestas (no pasan a las notas)
  const [obOrder, setObOrder] = useState<OnboardingTopic['id'][]>(() => sc.onboarding.topics.map((x) => x.id));
  const [obConfirmed, setObConfirmed] = useState(false);
  const obStart = useRef(Date.now());
  const obAnswer = useRef<IslandOnboardingAnswer>({ order: [], timeSec: 0 });
  const [cur, setCur] = useState<IslandDayAnswer>(() => emptyIslandDay(sc, 0));
  const [done, setDone] = useState<IslandDayAnswer[]>([]);
  const [openReq, setOpenReq] = useState<string | null>(null);
  const [showMission, setShowMission] = useState(false);
  const dayStart = useRef(Date.now());
  const stepStart = useRef(Date.now());
  const finished = useRef(false);
  const touched = useRef(new Set<string>());
  const state = useRef({ cur, done, step, dayIdx });
  state.current = { cur, done, step, dayIdx };

  const finishAll = (answers: IslandDayAnswer[], timedOut: boolean) => {
    if (finished.current) return;
    finished.current = true;
    // Si el tiempo se acaba durante el onboarding, cuenta lo que llevabas (sin orden si no lo confirmaste)
    if (state.current.step === 'onboarding' && !obAnswer.current.timeSec) obAnswer.current = { order: [], timeSec: (Date.now() - obStart.current) / 1000 };
    onFinish(answers, timedOut, obAnswer.current);
  };

  const { remaining, now } = useCountdown(durationSec, () => {
    const s = state.current;
    const answers = s.done.slice();
    // La asignación inicial (por cargos) solo cuenta si llegaste a confirmarla o a tocarla
    const touchedToday = sc.researchers.some((r) => touched.current.has(`${s.dayIdx}-${r.id}`));
    const counts = s.step !== 'explore' && (s.step !== 'assign' || touchedToday);
    if (s.step === 'onboarding') answers.push({ ...s.cur, assign: {}, timeSec: 0 });
    else if (answers.length < sc.days.length) answers.push({ ...s.cur, assign: counts ? s.cur.assign : {}, timeSec: (Date.now() - dayStart.current) / 1000 });
    while (answers.length < sc.days.length) answers.push({ ...emptyIslandDay(sc, answers.length), assign: {} });
    finishAll(answers, true);
  });

  const day = sc.days[dayIdx];
  const dayElapsed = (now - dayStart.current) / 1000;
  const rName = (id: string) => sc.researchers.find((r) => r.id === id)?.name ?? id;
  const sName = (id: string) => sc.stations.find((s) => s.id === id)?.name ?? id;

  useEffect(() => {
    stepStart.current = Date.now();
    recorder.phase(step === 'onboarding' ? 'sfl-island-onboarding' : `sfl-island-${dayIdx + 1}-${step}`);
    if (step === 'onboarding') recorder.begin('sfl-onboarding', 'order');
    if (step === 'assign') sc.researchers.forEach((r) => recorder.begin('sfl-assign', `${dayIdx}-${r.id}`));
    if (step === 'reflect') sc.researchers.forEach((r) => recorder.begin('sfl-reflect', `${dayIdx}-${r.id}`));
    if (step === 'explore') day.questions.forEach((q) => recorder.begin('sfl-ask', `${dayIdx}-${q.id}`));
  }, [dayIdx, step]);

  // ---- Onboarding
  const moveTopic = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (obConfirmed || j < 0 || j >= obOrder.length) return;
    const next = obOrder.slice();
    [next[i], next[j]] = [next[j], next[i]];
    recorder.change('sfl-onboarding', 'order', obOrder.join('>'), next.join('>'));
    setObOrder(next);
  };
  const confirmOnboarding = () => {
    recorder.decide('sfl-onboarding', 'order', obOrder.join('>'));
    setObConfirmed(true);
  };
  const startDay1 = () => {
    obAnswer.current = { order: obOrder, timeSec: (Date.now() - obStart.current) / 1000 };
    dayStart.current = Date.now();
    setStep('explore');
    window.scrollTo(0, 0);
  };
  const topic = (id: string) => sc.onboarding.topics.find((x) => x.id === id)!;

  // ---- Explorar
  const askedTargets = new Set(cur.asked.map((q) => q.split(':')[0]));
  const left = day.budget - cur.asked.length;
  const ask = (qid: string) => {
    if (left <= 0 || cur.asked.includes(qid) || askedTargets.has(qid.split(':')[0])) return;
    recorder.decide('sfl-ask', `${dayIdx}-${qid}`, 'ask');
    setCur({ ...cur, asked: [...cur.asked, qid], askedAt: [...cur.askedAt, (Date.now() - stepStart.current) / 1000] });
  };

  // ---- Asignar
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    Object.values(cur.assign).forEach((s) => m.set(s, (m.get(s) ?? 0) + 1));
    return m;
  }, [cur.assign]);
  const bijective = sc.researchers.every((r) => cur.assign[r.id]) && sc.stations.every((s) => counts.get(s.id) === 1);
  const movedByYou = sc.researchers.filter((r) => cur.assign[r.id] && cur.assign[r.id] !== day.baseline[r.id]);
  const reasonsDone = movedByYou.every((r) => cur.reasons[r.id]);
  const setAssign = (rid: string, sid: string) => {
    const prev = cur.assign[rid];
    if (prev === sid) return;
    // Mover a alguien de la colocación inicial es la primera decisión, no un cambio de opinión
    const key = `${dayIdx}-${rid}`;
    if (touched.current.has(key)) recorder.change('sfl-assign', key, sName(prev), sName(sid));
    else recorder.answer('sfl-assign', key, sName(sid));
    touched.current.add(key);
    setCur({ ...cur, assign: { ...cur.assign, [rid]: sid } });
  };
  const setReason = (rid: string, r: Reason) => {
    if (cur.reasons[rid]) recorder.change('sfl-reason', `${dayIdx}-${rid}`, REASON_LABEL.es[cur.reasons[rid] as Reason], REASON_LABEL.es[r]);
    else recorder.begin('sfl-reason', `${dayIdx}-${rid}`);
    setCur({ ...cur, reasons: { ...cur.reasons, [rid]: r } });
  };
  const confirmAssign = () => {
    sc.researchers.forEach((r) => recorder.decide('sfl-assign', `${dayIdx}-${r.id}`, sName(cur.assign[r.id])));
    movedByYou.forEach((r) => recorder.decide('sfl-reason', `${dayIdx}-${r.id}`, cur.reasons[r.id] ? REASON_LABEL.es[cur.reasons[r.id] as Reason] : ''));
    setStep('support');
  };

  // ---- Apoyar
  const openRequest = (id: string) => {
    if (openReq && openReq !== id) recorder.openClose('close', `request:${openReq}`);
    if (openReq !== id) {
      recorder.openClose('open', `request:${id}`);
      if (cur.support[id] == null) recorder.begin('sfl-support', id);
    }
    setOpenReq(openReq === id ? null : id);
  };
  const chooseSupport = (id: string, i: number) => {
    const prev = cur.support[id];
    if (prev === i) return;
    const req = day.support.find((r) => r.id === id)!;
    const short = (k: number) => req.options[k].text.slice(0, 60);
    if (prev != null) recorder.change('sfl-support', id, short(prev), short(i));
    recorder.decide('sfl-support', id, short(i));
    setCur({ ...cur, support: { ...cur.support, [id]: i }, supportOrder: cur.supportOrder.includes(id) ? cur.supportOrder : [...cur.supportOrder, id] });
  };

  // ---- Reflexionar
  const setReflect = (rid: string, v: Level | 'unknown') => {
    const prev = cur.reflect[rid];
    if (prev && prev !== v) recorder.change('sfl-reflect', `${dayIdx}-${rid}`, LEVEL_LABEL.es[prev], LEVEL_LABEL.es[v]);
    setCur({ ...cur, reflect: { ...cur.reflect, [rid]: v } });
  };
  const confirmReflect = () => {
    sc.researchers.forEach((r) => recorder.decide('sfl-reflect', `${dayIdx}-${r.id}`, cur.reflect[r.id] ? LEVEL_LABEL.es[cur.reflect[r.id] as Level | 'unknown'] : ''));
    const ans = { ...cur, timeSec: (Date.now() - dayStart.current) / 1000 };
    const all = [...done, ans];
    setDone(all);
    if (!exam) {
      setStep('feedback');
      return;
    }
    nextDay(all);
  };
  const nextDay = (all: IslandDayAnswer[]) => {
    if (dayIdx + 1 >= sc.days.length) {
      finishAll(all, false);
      return;
    }
    setDayIdx(dayIdx + 1);
    setCur(emptyIslandDay(sc, dayIdx + 1));
    setOpenReq(null);
    setShowMission(false);
    dayStart.current = Date.now();
    setStep('explore');
    window.scrollTo(0, 0);
  };

  const notes = ISLAND_CONFIG.notesPersistOvernight
    ? [...done.flatMap((a, d) => a.asked.map((q) => ({ d, q }))), ...cur.asked.map((q) => ({ d: dayIdx, q }))]
    : cur.asked.map((q) => ({ d: dayIdx, q }));
  const allAnswers = [...done, cur];

  const stepLabel: Record<Step, string> = en
    ? { onboarding: 'Onboarding', explore: 'Explore', assign: 'Assign', support: 'Support', reflect: 'Reflect', feedback: 'Day summary' }
    : { onboarding: 'Onboarding', explore: 'Explorar', assign: 'Asignar', support: 'Apoyar', reflect: 'Reflexionar', feedback: 'Resumen del día' };
  const dimLabel = day.reflectDimension === 'workload' ? t('Carga de trabajo', 'Workload') : t('Ánimo', 'Morale');

  return (
    <div className="run island">
      <header className="run-header" data-region="header">
        <div className="run-title">
          <span className="brand-dot sfl" /> {label ?? 'SFL Island'}
          <span className="seed-chip">
            {sc.seed} · {sc.difficulty === 'hard' ? 'Difícil' : 'Normal'} · {sc.lang.toUpperCase()}
            {exam ? ' · examen' : ''}
          </span>
        </div>
        <ol className="stepper">
          <li className={step === 'onboarding' ? 'active' : 'done'}>Onboarding</li>
          {sc.days.map((_, i) => (
            <li key={i} className={step !== 'onboarding' && i === dayIdx ? 'active' : step !== 'onboarding' && i < dayIdx ? 'done' : ''}>
              {t('Día', 'Day')} {i + 1}
              {step !== 'onboarding' && i === dayIdx ? ` · ${stepLabel[step]}` : ''}
            </li>
          ))}
        </ol>
        <div className="guide">
          {!exam && step === 'onboarding' && <span>Onboarding ≈3:00</span>}
          {!exam && step !== 'onboarding' && (
            <span className={dayElapsed > DAY_GUIDE_SEC ? 'over' : ''}>
              {t('Día', 'Day')} {fmtTime(dayElapsed)} / ≈10:00
            </span>
          )}
        </div>
        <TimerBadge remaining={remaining} total={durationSec} />
      </header>

      <div className="layout">
        <main className="main" data-region="island">
          {showMission && (
            <div className="card mission" data-region="mission" data-track="mission">
              <div className="q-num">{sc.island}</div>
              <p>{sc.mission}</p>
              <button type="button" className="btn ghost small" onClick={() => setShowMission(false)}>
                {t('Entendido', 'Got it')}
              </button>
            </div>
          )}
          {step === 'onboarding' && (
            <section className="card" data-region="onboarding" data-track="onboarding">
              <div className="q-num">{sc.island} · Onboarding</div>
              <p>{sc.mission}</p>
              {!obConfirmed ? (
                <>
                  <h2>{t('¿En qué orden quieres recibir esta información?', 'In what order do you want this information?')}</h2>
                  <p className="hint">
                    {t(
                      'Ordena las 4 preguntas. Recibirás las cuatro respuestas en ese orden, y no se guardan en las notas. El reloj ya está corriendo.',
                      'Rank the 4 questions. You will get all four answers in that order, and they are not saved to your notes. The clock is already running.',
                    )}
                  </p>
                  <ol className="rank-list">
                    {obOrder.map((id, i) => (
                      <li key={id} className="rank-item" data-track={`onboarding:${id}`}>
                        <span className="rank-pos">{i + 1}</span>
                        <span className="rank-name">{topic(id).question}</span>
                        <button type="button" className="btn ghost small" disabled={i === 0} onClick={() => moveTopic(i, -1)} aria-label={t('Subir', 'Move up')}>
                          ↑
                        </button>
                        <button type="button" className="btn ghost small" disabled={i === obOrder.length - 1} onClick={() => moveTopic(i, 1)} aria-label={t('Bajar', 'Move down')}>
                          ↓
                        </button>
                      </li>
                    ))}
                  </ol>
                  <div className="actions">
                    <ConfirmButton
                      warning={t('¿Confirmar el orden? No podrás cambiarlo.', 'Confirm the order? You cannot change it later.')}
                      labels={{ confirm: t('Confirmar', 'Confirm'), cancel: t('Cancelar', 'Cancel') }}
                      onConfirm={confirmOnboarding}
                    >
                      {t('Confirmar el orden →', 'Confirm order →')}
                    </ConfirmButton>
                  </div>
                </>
              ) : (
                <>
                  {obOrder.map((id, i) => (
                    <div key={id} className="note" data-track={`onboarding-answer:${id}`}>
                      <div className="small muted">
                        {i + 1}. {topic(id).question}
                      </div>
                      <div>{topic(id).answer}</div>
                    </div>
                  ))}
                  <p className="muted small">{t('Estas respuestas no se guardan en las notas.', 'These answers are not saved to your notes.')}</p>
                  <div className="actions">
                    <button type="button" className="btn primary" onClick={startDay1}>
                      {t('Empezar el día 1 →', 'Start day 1 →')}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          {step !== 'onboarding' && (
          <div className="card day-brief" data-region="brief" data-track="brief">
            <div className="q-num">
              {t('Día', 'Day')} {day.day} · {stepLabel[step]}
            </div>
            <h2>{day.goal}</h2>
            <p className="muted">{day.briefing}</p>
            {day.morningNotes?.length > 0 && (
              <div className="morning-notes" data-track="morning-notes">
                <strong>{t('Notas de la mañana', 'Morning notes')}</strong>
                <ul>
                  {day.morningNotes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          )}

          {step === 'explore' && (
            <section data-region="explore">
              <div className="wave-head">
                <h2>
                  {t('Explorar', 'Explore')}{' '}
                  <span className={`tag ${left === 0 ? 'warn' : ''}`}>
                    {t(`Quedan ${left} de ${day.budget} preguntas`, `${left} of ${day.budget} questions left`)}
                  </span>
                </h2>
                {!exam && (
                  <p className="hint">
                    {t(
                      'Cada persona o estación responde como mucho a una pregunta al día. Pregunta por lo que puede cambiar tus decisiones de hoy: dónde trabaja cada uno y, en Apoyar, a quién se le puede pasar trabajo.',
                      'Each person or station answers at most one question per day. Ask about what could change today’s decisions: where each person works and, in Support, who can take on more work.',
                    )}
                  </p>
                )}
              </div>
              <div className="ask-grid">
                {[...sc.researchers.map((r) => ({ id: r.id, name: r.name, sub: r.title })), ...sc.stations.map((s) => ({ id: s.id, name: s.name, sub: t('Estación', 'Station') }))].map(
                  (target) => {
                    const qs = day.questions.filter((q) => q.target === target.id);
                    const used = askedTargets.has(target.id);
                    return (
                      <div key={target.id} className={`ask-card ${used ? 'used' : ''}`} data-track={`target:${target.id}`}>
                        <div className="ask-name">
                          {target.name} <span className="muted small">{target.sub}</span>
                        </div>
                        {qs.map((q) => {
                          const asked = cur.asked.includes(q.id);
                          return (
                            <button
                              key={q.id}
                              type="button"
                              className={`btn small ${asked ? 'saved' : 'outline'}`}
                              disabled={!asked && (left <= 0 || used)}
                              data-track={`question:${q.id}`}
                              onClick={() => ask(q.id)}
                            >
                              {q.label.split(': ').slice(1).join(': ')}
                            </button>
                          );
                        })}
                      </div>
                    );
                  },
                )}
              </div>
              <div className="actions">
                <ConfirmButton
                  warning={left > 0 ? t(`Te quedan ${left} preguntas sin usar. ¿Pasar a asignar?`, `You have ${left} unused questions. Go to assign?`) : t('¿Pasar a asignar?', 'Go to assign?')}
                  labels={{ confirm: t('Sí, asignar', 'Yes, assign'), cancel: t('Cancelar', 'Cancel') }}
                  onConfirm={() => setStep('assign')}
                >
                  {t('Pasar a asignar →', 'Go to assign →')}
                </ConfirmButton>
              </div>
            </section>
          )}

          {step === 'assign' && (
            <section data-region="assign">
              <div className="wave-head">
                <h2>{t('Asignar', 'Assign')}</h2>
                {!exam && (
                  <p className="hint">
                    {t(
                      'Pon a cada investigador en una estación distinta. Si mueves a alguien de su estación habitual, indica el motivo principal.',
                      'Put each researcher in a different station. If you move someone from their usual station, give the main reason.',
                    )}
                  </p>
                )}
              </div>
              <table className="assign-table">
                <thead>
                  <tr>
                    <th>{t('Investigador', 'Researcher')}</th>
                    {sc.stations.map((s) => (
                      <th key={s.id} className={counts.get(s.id) && counts.get(s.id)! > 1 ? 'dup' : ''}>
                        {s.name}
                      </th>
                    ))}
                    <th>{t('Motivo', 'Reason')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sc.researchers.map((r) => (
                    <tr key={r.id} data-track={`researcher:${r.id}`}>
                      <td>
                        <strong>{r.name}</strong>
                        <div className="muted small">{r.title}</div>
                      </td>
                      {sc.stations.map((s) => {
                        const on = cur.assign[r.id] === s.id;
                        return (
                          <td key={s.id}>
                            <button
                              type="button"
                              className={`cell-pick ${on ? 'on' : ''} ${on && (counts.get(s.id) ?? 0) > 1 ? 'dup' : ''}`}
                              data-track={`assign:${r.id}:${s.id}`}
                              onClick={() => setAssign(r.id, s.id)}
                            >
                              {on ? '●' : '○'}
                            </button>
                          </td>
                        );
                      })}
                      <td>
                        {cur.assign[r.id] && cur.assign[r.id] !== day.baseline[r.id] ? (
                          <select value={cur.reasons[r.id] ?? ''} data-track={`reason:${r.id}`} onChange={(e) => setReason(r.id, e.target.value as Reason)}>
                            <option value="" disabled>
                              {t('Elige el motivo…', 'Choose a reason…')}
                            </option>
                            {REASONS.map((x) => (
                              <option key={x} value={x}>
                                {REASON_LABEL[sc.lang][x]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="muted small">{t('Estación habitual', 'Usual station')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!bijective && <p className="hint warn-text">{t('Cada estación debe tener exactamente una persona.', 'Each station needs exactly one person.')}</p>}
              <div className="actions">
                <ConfirmButton
                  disabled={!bijective || !reasonsDone}
                  warning={t('¿Confirmar la asignación? No podrás cambiarla.', 'Confirm the assignment? You cannot change it later.')}
                  labels={{ confirm: t('Confirmar', 'Confirm'), cancel: t('Cancelar', 'Cancel') }}
                  onConfirm={confirmAssign}
                >
                  {t('Confirmar asignación →', 'Confirm assignment →')}
                </ConfirmButton>
              </div>
            </section>
          )}

          {step === 'support' && (
            <section data-region="support">
              <div className="wave-head">
                <h2>
                  {t('Apoyar', 'Support')}{' '}
                  <span className="tag">
                    {Object.keys(cur.support).length}/{day.support.length}
                  </span>
                </h2>
                {!exam && (
                  <p className="hint">{t('Abre cada petición y elige cómo responder. El orden en que las atiendes cuenta.', 'Open each request and choose how to respond. The order matters.')}</p>
                )}
              </div>
              {day.support.map((req) => {
                const open = openReq === req.id;
                const answered = cur.support[req.id] != null;
                return (
                  <div key={req.id} className={`card request ${open ? 'open' : ''} ${answered ? 'answered' : ''}`} data-track={`request:${req.id}`}>
                    <button type="button" className="request-head" onClick={() => openRequest(req.id)}>
                      <span>
                        <strong>{rName(req.from)}</strong> · {req.title}
                        {req.urgent && <span className="tag warn">{t('Urgente', 'Urgent')}</span>}
                      </span>
                      <span className="muted small">{answered ? t('Respondida', 'Answered') : open ? '▲' : '▼'}</span>
                    </button>
                    {open && (
                      <div className="request-body">
                        <p>{req.text}</p>
                        <div className="option-list">
                          {req.options.map((o, i) => (
                            <button
                              key={i}
                              type="button"
                              className={`option ${cur.support[req.id] === i ? 'selected' : ''}`}
                              data-track={`option:${req.id}-${i}`}
                              onClick={() => chooseSupport(req.id, i)}
                            >
                              {o.text}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="actions">
                <ConfirmButton
                  disabled={Object.keys(cur.support).length < day.support.length}
                  warning={t('¿Pasar a reflexionar?', 'Go to reflect?')}
                  labels={{ confirm: t('Sí', 'Yes'), cancel: t('Cancelar', 'Cancel') }}
                  onConfirm={() => {
                    if (openReq) recorder.openClose('close', `request:${openReq}`);
                    setOpenReq(null);
                    setStep('reflect');
                  }}
                >
                  {t('Pasar a reflexionar →', 'Go to reflect →')}
                </ConfirmButton>
              </div>
            </section>
          )}

          {step === 'reflect' && (
            <section data-region="reflect">
              <div className="wave-head">
                <h2>
                  {t('Reflexionar', 'Reflect')}: {dimLabel.toLowerCase()}
                </h2>
                {!exam && (
                  <p className="hint">
                    {t(
                      `¿Cómo está hoy el ${dimLabel.toLowerCase()} de cada investigador? Si no tienes información, responde «No lo sé».`,
                      `How is each researcher’s ${dimLabel.toLowerCase()} today? If you have no information, answer “Don’t know”.`,
                    )}
                  </p>
                )}
              </div>
              <table className="assign-table">
                <tbody>
                  {sc.researchers.map((r) => (
                    <tr key={r.id} data-track={`reflect:${r.id}`}>
                      <td>
                        <strong>{r.name}</strong>
                      </td>
                      {(['high', 'mid', 'low', 'unknown'] as const).map((v) => (
                        <td key={v}>
                          <button type="button" className={`btn small ${cur.reflect[r.id] === v ? 'saved' : 'outline'}`} onClick={() => setReflect(r.id, v)}>
                            {LEVEL_LABEL[sc.lang][v]}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="actions">
                <ConfirmButton
                  disabled={sc.researchers.some((r) => !cur.reflect[r.id])}
                  warning={dayIdx + 1 < sc.days.length ? t('¿Terminar el día?', 'End the day?') : t('¿Terminar la misión?', 'End the mission?')}
                  labels={{ confirm: t('Sí', 'Yes'), cancel: t('Cancelar', 'Cancel') }}
                  onConfirm={confirmReflect}
                >
                  {dayIdx + 1 < sc.days.length ? t('Terminar el día →', 'End the day →') : t('Terminar la misión', 'End the mission')}
                </ConfirmButton>
              </div>
            </section>
          )}

          {step === 'feedback' && (
            <section data-region="feedback">
              <DayFeedback scenario={sc} answers={done} day={dayIdx} onboarding={obAnswer.current} />
              <div className="actions">
                <button type="button" className="btn primary" onClick={() => nextDay(done)}>
                  {dayIdx + 1 < sc.days.length ? t(`Empezar el día ${dayIdx + 2} →`, `Start day ${dayIdx + 2} →`) : t('Ver la corrección', 'See the correction')}
                </button>
              </div>
            </section>
          )}
        </main>

        <aside className="side" data-region="team">
          <h3>{t('Equipo', 'Team')}</h3>
          {sc.researchers.map((r) => (
            <div key={r.id} className="team-card" data-track={`profile:${r.id}`}>
              <div>
                <strong>{r.name}</strong> <span className="muted small">{r.title}</span>
              </div>
              <div className="small profile-line">
                <span className="good-text">
                  {t('Fortaleza', 'Strength')}: {skillLabel(sc.lang, r.skill1)}
                </span>
                {' · '}
                {t('También', 'Also')}: {skillLabel(sc.lang, r.skill2)}
                {' · '}
                <span className="warn-text">
                  {t('Punto débil', 'Weakness')}: {skillLabel(sc.lang, r.weak)}
                </span>
              </div>
              <div className="skill-bars">
                {SKILLS.map((s) => (
                  <span key={s} title={`${skillLabel(sc.lang, s)}: ${r.prof[s]}/4`}>
                    <span className="skill-name">{skillLabel(sc.lang, s)}</span>
                    <span className="dots">{'●'.repeat(r.prof[s]) + '○'.repeat(4 - r.prof[s])}</span>
                  </span>
                ))}
              </div>
              {step !== 'explore' && cur.assign[r.id] && <div className="small">→ {sName(cur.assign[r.id])}</div>}
            </div>
          ))}
          <h3>{t('Estaciones', 'Stations')}</h3>
          {sc.stations.map((s) => (
            <div key={s.id} className="small station-line" data-track={`station:${s.id}`}>
              <strong>{s.name}</strong>: {t('suele necesitar', 'usually needs')} {skillLabel(sc.lang, s.usual)}
            </div>
          ))}
          <h3>
            {t('Notas de hoy', 'Today’s notes')}
            {!ISLAND_CONFIG.notesPersistOvernight && <span className="muted small"> · {t('se borran por la noche', 'cleared overnight')}</span>}
          </h3>
          <div data-region="notes">
            {notes.length === 0 && <p className="muted small">{t('Aún no has preguntado nada.', 'You have not asked anything yet.')}</p>}
            {notes.map(({ d, q }) => (
              <div key={`${d}-${q}`} className="note" data-track={`note:${q}`}>
                <div className="small muted">{sc.days[d].questions.find((x) => x.id === q)?.label}</div>
                <div>{answerText(sc, allAnswers, d, q)}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function DayFeedback({ scenario, answers, day, onboarding }: { scenario: IslandScenario; answers: IslandDayAnswer[]; day: number; onboarding: IslandOnboardingAnswer }) {
  const g = gradeIsland(scenario, [...answers, ...scenario.days.slice(answers.length).map((_, i) => emptyIslandDay(scenario, answers.length + i))], onboarding);
  const parts = g.rubric.parts.filter((p) => p.key.startsWith(`isl${day}-`));
  const earned = Math.round(parts.reduce((s, p) => s + p.earned, 0) * 10) / 10;
  return (
    <div className="card">
      <div className="q-num">Resumen del día {day + 1} (solo en modo práctica)</div>
      <h2>{earned} / 100</h2>
      <p className="muted small">{parts.map((p) => `${p.label.split(' · ')[1]} ${p.earned}/${p.max}`).join(' · ')}</p>
      <SflDecisionList decisions={g.decisions.filter((x) => x.day === day + 1)} />
    </div>
  );
}
