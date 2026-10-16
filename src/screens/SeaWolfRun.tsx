import { useEffect, useRef, useState } from 'react';
import { recorder } from '../lib/recorder';
import { ConfirmButton, TraitIcon, TraitTag } from '../components/ui';
import { TimerBadge, useCountdown } from '../components/Timer';
import { fmtTime } from '../lib/format';
import { TIMING } from '../config';
import { UI_TEXT, UI } from '../i18n';
import {
  checkSelection,
  CLASSIFY_N,
  Decision,
  emptyZoneAnswer,
  Microbe,
  microbeIndex,
  PICK,
  profileOptions,
  POOL_MAX,
  POOL_START_MAX,
  ROUNDS,
  SeaWolfScenario,
  traitLabel,
  Zone,
  ZoneAnswer,
} from '../seawolf';

interface Props {
  scenario: SeaWolfScenario;
  durationSec: number;
  initialAids: boolean;
  label?: string;
  /** Modo examen: sin ayudas, sin pistas de método y sin ver la eficacia hasta el final. */
  exam?: boolean;
  onFinish: (answers: ZoneAnswer[], aidsUsed: boolean, timedOut: boolean) => void;
}

type Step = 'profile' | 'review' | 'classify' | 'rounds' | 'treatment' | 'efficacy';

export function SeaWolfRun({ scenario, durationSec, initialAids, label, exam = false, onFinish }: Props) {
  const ui = UI_TEXT[scenario.lang];
  const lang = scenario.lang;
  const en = lang === 'en';
  const confirmLabels = { confirm: ui.confirm, cancel: ui.cancel };
  const index = useRef(microbeIndex(scenario)).current;
  const [zoneIdx, setZoneIdx] = useState(0);
  const [step, setStep] = useState<Step>('profile');
  const [deferredIn, setDeferredIn] = useState<string[]>([]);
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, 'keep' | 'reject'>>({});
  const [classifyIdx, setClassifyIdx] = useState(0);
  const [cur, setCur] = useState<ZoneAnswer>(emptyZoneAnswer);
  const [roundIdx, setRoundIdx] = useState(0);
  const [aids, setAids] = useState(!exam && initialAids);
  const [aidsUsed, setAidsUsed] = useState(!exam && initialAids);
  const [done, setDone] = useState<ZoneAnswer[]>([]);
  const zoneStart = useRef(Date.now());
  const finished = useRef(false);
  const state = useRef({ cur, done, aidsUsed });
  state.current = { cur, done, aidsUsed };

  const finishAll = (answers: ZoneAnswer[], timedOut: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onFinish(answers, state.current.aidsUsed, timedOut);
  };

  const { remaining, now } = useCountdown(durationSec, () => {
    const s = state.current;
    const answers = s.done.slice();
    if (answers.length < scenario.zones.length) answers.push({ ...s.cur, timeSec: (Date.now() - zoneStart.current) / 1000, completed: false });
    while (answers.length < scenario.zones.length) answers.push(emptyZoneAnswer());
    finishAll(answers, true);
  });

  const zone = scenario.zones[zoneIdx];
  const nextZone = scenario.zones[zoneIdx + 1];

  useEffect(() => {
    recorder.phase(`seawolf-${zoneIdx + 1}-${step}`);
    if (step === 'profile') recorder.begin('sw-profile', String(zoneIdx));
    if (step === 'treatment') recorder.begin('sw-treatment', String(zoneIdx));
  }, [zoneIdx, step]);
  useEffect(() => {
    if (step === 'classify' && zone.classification[classifyIdx]) recorder.begin('sw-classify', zone.classification[classifyIdx].id);
  }, [zoneIdx, step, classifyIdx]);
  useEffect(() => {
    if (step === 'rounds') recorder.begin('sw-round', `${zoneIdx}-${roundIdx}`);
  }, [zoneIdx, step, roundIdx]);

  // --- perfil: 2 de 7 características
  const toggleProfile = (key: string) => {
    if (cur.profile.includes(key)) {
      recorder.change('sw-profile', String(zoneIdx), key, '');
      setCur({ ...cur, profile: cur.profile.filter((k) => k !== key) });
    } else if (cur.profile.length < 2) setCur({ ...cur, profile: [...cur.profile, key] });
  };
  const confirmProfile = () => {
    recorder.decide('sw-profile', String(zoneIdx), cur.profile.join(','));
    setStep(deferredIn.length ? 'review' : 'classify');
  };
  const zoneElapsed = (now - zoneStart.current) / 1000;
  const isLast = zoneIdx === scenario.zones.length - 1;
  const poolStartFull = cur.pool.length >= POOL_START_MAX;

  // --- revisión de los aplazados desde el sitio anterior
  const decideReview = (id: string, d: 'keep' | 'reject') => {
    if (reviewDecisions[id]) return;
    if (d === 'keep' && poolStartFull) return;
    recorder.decide('sw-review', id, d);
    setReviewDecisions({ ...reviewDecisions, [id]: d });
    if (d === 'keep') setCur({ ...cur, reviewKept: [...cur.reviewKept, id], pool: [...cur.pool, id] });
  };
  const reviewDone = deferredIn.every((id) => reviewDecisions[id]);

  // --- clasificación, uno a uno
  const classifyCurrent = zone.classification[classifyIdx];
  const decide = (d: Decision) => {
    const m = classifyCurrent;
    if (!m) return;
    if (d === 'site' && poolStartFull) return;
    if (d === 'next' && isLast) return;
    recorder.decide('sw-classify', m.id, d);
    setCur({ ...cur, decisions: { ...cur.decisions, [m.id]: d }, pool: d === 'site' ? [...cur.pool, m.id] : cur.pool });
    if (classifyIdx + 1 >= CLASSIFY_N) setStep('rounds');
    else setClassifyIdx(classifyIdx + 1);
  };

  // --- rondas de "elige 1 de 3"
  const pickRound = (id: string) => {
    recorder.decide('sw-round', `${zoneIdx}-${roundIdx}`, id);
    const picks = [...cur.roundPicks];
    picks[roundIdx] = id;
    setCur({ ...cur, roundPicks: picks, pool: [...cur.pool, id] });
    if (roundIdx + 1 >= ROUNDS) setStep('treatment');
    else setRoundIdx(roundIdx + 1);
  };

  // --- tratamiento: se puede cambiar la selección hasta enviarla
  const toggleSelect = (id: string) => {
    if (cur.selected.includes(id)) {
      recorder.change('sw-treatment', id, 'on', 'off');
      setCur({ ...cur, selected: cur.selected.filter((x) => x !== id) });
    } else if (cur.selected.length < PICK) {
      recorder.answer('sw-treatment', id, 'on');
      setCur({ ...cur, selected: [...cur.selected, id] });
    }
  };

  const advance = (ans: ZoneAnswer) => {
    const all = [...done, ans];
    if (isLast) {
      finishAll(all, false);
      return;
    }
    const deferred = zone.classification.filter((m) => ans.decisions[m.id] === 'next').map((m) => m.id);
    setDone(all);
    setZoneIdx(zoneIdx + 1);
    setDeferredIn(deferred);
    setReviewDecisions({});
    setStep('profile');
    setClassifyIdx(0);
    setRoundIdx(0);
    setCur(emptyZoneAnswer());
    zoneStart.current = Date.now();
    window.scrollTo(0, 0);
  };

  const submitZone = () => {
    recorder.decide('sw-treatment', String(zoneIdx), cur.selected.join(','));
    const ans: ZoneAnswer = { ...cur, timeSec: (Date.now() - zoneStart.current) / 1000, completed: true };
    setCur(ans);
    if (exam) advance(ans);
    else setStep('efficacy');
  };

  const poolLimit = step === 'review' || step === 'classify' ? POOL_START_MAX : POOL_MAX;
  const stepLabel: Record<Step, string> = en
    ? { profile: 'Profile', review: 'Review', classify: 'Sorting', rounds: 'Pick 1 of 3', treatment: 'Treatment', efficacy: 'Result' }
    : { profile: 'Perfil', review: 'Revisión', classify: 'Clasificación', rounds: 'Elige 1 de 3', treatment: 'Tratamiento', efficacy: 'Resultado' };

  return (
    <div className="run seawolf">
      <header className="run-header" data-region="header">
        <div className="run-title">
          <span className="brand-dot sea" /> {label ?? 'Sea Wolf'}
          <span className="seed-chip">
            {scenario.seed} · {scenario.difficulty === 'hard' ? 'Difícil' : 'Normal'} · {lang.toUpperCase()}
            {exam ? ' · examen' : ''}
          </span>
        </div>
        <ol className="stepper">
          {scenario.zones.map((_, i) => (
            <li key={i} className={i === zoneIdx ? 'active' : i < zoneIdx ? 'done' : ''}>
              {ui.zone} {i + 1}
              {i === zoneIdx ? ` · ${stepLabel[step]}` : ''}
            </li>
          ))}
        </ol>
        <div className="guide">
          {!exam && (
            <span className={zoneElapsed > TIMING.seawolfZoneGuideMin[zoneIdx] * 60 ? 'over' : ''}>
              {ui.zone} {fmtTime(zoneElapsed)} / ≈{TIMING.seawolfZoneGuideMin[zoneIdx]}:00
            </span>
          )}
          {!exam && (
            <label className="switch">
              <input
                type="checkbox"
                checked={aids}
                onChange={(e) => {
                  setAids(e.target.checked);
                  if (e.target.checked) setAidsUsed(true);
                }}
              />
              {ui.aids}
            </label>
          )}
        </div>
        <TimerBadge remaining={remaining} total={durationSec} />
      </header>

      <div className="layout">
        <main className="main" data-region="seawolf">
          <ZoneBrief zone={zone} ui={ui} aids={aids} />

          {step === 'profile' && (
            <>
              <div className="wave-head">
                <h2>{en ? 'Site profile' : 'Perfil del sitio'}</h2>
                {!exam && (
                  <p className="hint">
                    {en
                      ? 'Choose the 2 characteristics that best describe what this site needs.'
                      : 'Elige las 2 características que mejor describen lo que necesita este sitio.'}
                  </p>
                )}
              </div>
              <div className="profile-grid" data-region="profile">
                {profileOptions(zone).map((o) => {
                  const on = cur.profile.includes(o.key);
                  return (
                    <button
                      key={o.key}
                      type="button"
                      className={`profile-option ${on ? 'selected' : ''}`}
                      disabled={!on && cur.profile.length >= 2}
                      onClick={() => toggleProfile(o.key)}
                      data-track={`profile:${o.key}`}
                      aria-pressed={on}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <div className="actions">
                <button type="button" className="btn primary" disabled={cur.profile.length !== 2} onClick={confirmProfile}>
                  {en ? `Confirm profile (${cur.profile.length}/2) →` : `Confirmar perfil (${cur.profile.length}/2) →`}
                </button>
              </div>
            </>
          )}

          {step === 'review' && (
            <>
              <div className="wave-head">
                <h2>{en ? 'Microbes deferred from the previous site' : 'Microbios aplazados desde el sitio anterior'}</h2>
                {!exam && (
                  <p className="hint">
                    {en
                      ? `Keep them for this site or reject them. The pool holds ${POOL_START_MAX} microbes before the rounds. Decisions are final.`
                      : `Mantenlos para este sitio o recházalos. El pool admite ${POOL_START_MAX} microbios antes de las rondas. Las decisiones son definitivas.`}
                  </p>
                )}
              </div>
              <div className="microbe-grid">
                {deferredIn.map((id) => {
                  const m = index.get(id)!;
                  const d = reviewDecisions[id];
                  return (
                    <MicrobeCard
                      key={id}
                      m={m}
                      zone={zone}
                      ui={ui}
                      highlight={d === 'keep'}
                      action={
                        d ? (
                          <span className="tag">{d === 'keep' ? (en ? 'Kept' : 'Mantenido') : en ? 'Rejected' : 'Rechazado'}</span>
                        ) : (
                          <span className="btn-pair">
                            <button type="button" className="btn small outline" disabled={poolStartFull} onClick={() => decideReview(id, 'keep')} aria-label={`${en ? 'Keep' : 'Mantener'} ${m.name}`}>
                              {en ? 'Keep' : 'Mantener'}
                            </button>
                            <button type="button" className="btn small ghost" onClick={() => decideReview(id, 'reject')} aria-label={`${en ? 'Reject' : 'Rechazar'} ${m.name}`}>
                              {en ? 'Reject' : 'Rechazar'}
                            </button>
                          </span>
                        )
                      }
                    />
                  );
                })}
              </div>
              <div className="actions">
                <button type="button" className="btn primary" disabled={!reviewDone} onClick={() => setStep('classify')}>
                  {en ? 'Start sorting →' : 'Empezar la clasificación →'}
                </button>
              </div>
            </>
          )}

          {step === 'classify' && classifyCurrent && (
            <>
              <div className="wave-head">
                <h2>
                  {en ? 'Sorting' : 'Clasificación'}{' '}
                  <span className="muted">
                    · {en ? 'microbe' : 'microbio'} {classifyIdx + 1} {en ? 'of' : 'de'} {CLASSIFY_N}
                  </span>
                </h2>
                {!exam && (
                  <p className="hint">
                    {en
                      ? `Send each microbe to this site (pool max. ${POOL_START_MAX}), to the next site, or reject it. Decisions are final.`
                      : `Envía cada microbio a este sitio (pool máx. ${POOL_START_MAX}), al siguiente sitio o recházalo. Las decisiones son definitivas.`}
                  </p>
                )}
                {nextZone && (
                  <p className="next-hint">
                    {en ? 'Hint about the next site: it favours' : 'Pista del siguiente sitio: favorece'} <TraitTag trait={nextZone.required} lang={lang} />
                  </p>
                )}
              </div>
              <div className="classify-card">
                <MicrobeCard m={classifyCurrent} zone={zone} ui={ui} action={null} big />
                <div className="classify-actions">
                  <button type="button" className="btn primary" disabled={poolStartFull} onClick={() => decide('site')}>
                    {en ? 'This site' : 'Este sitio'}
                  </button>
                  <button
                    type="button"
                    className="btn outline"
                    disabled={isLast}
                    onClick={() => decide('next')}
                    title={isLast ? (en ? 'There is no next site' : 'No hay siguiente sitio') : undefined}
                  >
                    {en ? 'Next site' : 'Siguiente sitio'}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => decide('reject')}>
                    {en ? 'Reject' : 'Rechazar'}
                  </button>
                </div>
                {poolStartFull && <p className="muted small">{en ? 'The pool is full for this stage.' : 'El pool está lleno en esta fase.'}</p>}
              </div>
            </>
          )}

          {step === 'rounds' && (
            <>
              <div className="wave-head">
                <h2>
                  {en ? 'Pick 1 of 3' : 'Elige 1 de 3'}{' '}
                  <span className="muted">
                    · {en ? 'round' : 'ronda'} {roundIdx + 1} {en ? 'of' : 'de'} {ROUNDS}
                  </span>
                </h2>
                {!exam && (
                  <p className="hint">
                    {en
                      ? 'Add one of these three microbes to your pool. The other two are lost. The choice is final.'
                      : 'Añade uno de estos tres microbios a tu pool. Los otros dos se pierden. La elección es definitiva.'}
                  </p>
                )}
              </div>
              <div className="microbe-grid">
                {zone.rounds[roundIdx].map((m) => (
                  <MicrobeCard
                    key={m.id}
                    m={m}
                    zone={zone}
                    ui={ui}
                    action={
                      <button type="button" className="btn small outline" onClick={() => pickRound(m.id)} aria-label={`${ui.pick} ${m.name}`}>
                        {ui.pick}
                      </button>
                    }
                  />
                ))}
              </div>
            </>
          )}

          {step === 'treatment' && (
            <>
              <div className="wave-head">
                <h2>{en ? 'Treatment' : 'Tratamiento'}</h2>
                <p className="hint">{ui.selectionHint(PICK)}</p>
              </div>
              {cur.pool.length === 0 && <div className="card">{ui.noCandidates}</div>}
              <div className="microbe-grid">
                {cur.pool.map((id) => {
                  const m = index.get(id)!;
                  const on = cur.selected.includes(id);
                  return (
                    <MicrobeCard
                      key={id}
                      m={m}
                      zone={zone}
                      ui={ui}
                      highlight={on}
                      action={
                        <button
                          type="button"
                          className={`btn small ${on ? 'saved' : 'outline'}`}
                          disabled={!on && cur.selected.length >= PICK}
                          onClick={() => toggleSelect(id)}
                          aria-label={`${on ? ui.remove : ui.pick} ${m.name}`}
                        >
                          {on ? ui.picked : ui.pick}
                        </button>
                      }
                    />
                  );
                })}
              </div>
              {aids && <AidsPanel zone={zone} picks={cur.selected.map((id) => index.get(id)!)} />}
              <div className="actions">
                <ConfirmButton
                  labels={confirmLabels}
                  disabled={cur.selected.length !== PICK && cur.pool.length >= PICK}
                  warning={isLast ? ui.warnTreatmentLast : ui.warnTreatment}
                  onConfirm={submitZone}
                >
                  {ui.confirmTreatment(cur.selected.length, PICK)}
                </ConfirmButton>
              </div>
            </>
          )}

          {step === 'efficacy' && (
            <EfficacyCard
              zone={zone}
              picks={cur.selected.map((id) => index.get(id)!)}
              en={en}
              onNext={() => advance(cur)}
              nextLabel={isLast ? (en ? 'Finish Sea Wolf' : 'Terminar Sea Wolf') : en ? 'Next site →' : 'Siguiente sitio →'}
            />
          )}
        </main>

        <aside className="side" data-region="pool">
          <div className="panel">
            <div className="panel-title">
              Pool{' '}
              <span className="count">
                {cur.pool.length}/{poolLimit}
              </span>
            </div>
            {cur.pool.length === 0 && <div className="muted small">{ui.listEmpty}</div>}
            {cur.pool.map((id) => {
              const m = index.get(id)!;
              return (
                <div key={id} className="list-entry">
                  <div>
                    <div className="list-name">{m.name}</div>
                    <div className="list-attrs">
                      {m.attrs.map((a, i) => (
                        <span key={i} title={zone.attributes[i]}>
                          {abbr(zone.attributes[i])} {a}
                        </span>
                      ))}
                      {m.traits.map((t) => (
                        <TraitIcon key={t} trait={t} size={14} />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {!exam && (
              <div className="muted small note">
                {en
                  ? `Up to ${POOL_START_MAX} after sorting, +1 per round (max. ${POOL_MAX}). Microbes cannot be removed from the pool.`
                  : `Hasta ${POOL_START_MAX} tras la clasificación, +1 por ronda (máx. ${POOL_MAX}). No se pueden quitar microbios del pool.`}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function abbr(attr: string) {
  return attr
    .split(' ')
    .filter((w) => !['de', 'a', 'la', 'al', 'el'].includes(w))
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function ZoneBrief({ zone, ui, aids }: { zone: Zone; ui: UI; aids: boolean }) {
  return (
    <div className="zone-brief card" data-region="rules" data-track="rules">
      <div className="zone-head">
        <div>
          <div className="q-num">
            {ui.zone} {zone.index + 1}
          </div>
          <h2 className="zone-name">{zone.name}</h2>
          <div className="muted">{zone.description}</div>
        </div>
        <div className="rules-traits">
          <div>
            <div className="rule-label">{ui.required}</div>
            <TraitTag trait={zone.required} tone="req" lang={zone.lang} />
          </div>
          <div>
            <div className="rule-label">{ui.prohibited}</div>
            <TraitTag trait={zone.prohibited} tone="proh" lang={zone.lang} />
          </div>
        </div>
      </div>
      <div className="ranges">
        {zone.attributes.map((a, i) => (
          <div key={a} className="range">
            <div className="range-label">{a}</div>
            <RangeBar lo={zone.ranges[i][0]} hi={zone.ranges[i][1]} />
            <div className="range-text">
              {ui.targetAverage} {zone.ranges[i][0]}–{zone.ranges[i][1]}
              {aids && (
                <span className="aid">
                  {' '}
                  · {ui.sumAid} {zone.ranges[i][0] * 3}–{zone.ranges[i][1] * 3}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RangeBar({ lo, hi }: { lo: number; hi: number }) {
  return (
    <div className="range-bar">
      <div className="range-fill" style={{ left: `${((lo - 1) / 9) * 100}%`, width: `${((hi - lo) / 9) * 100}%` }} />
      <span className="range-min">1</span>
      <span className="range-max">10</span>
    </div>
  );
}

function MicrobeCard({ m, zone, ui, action, highlight, big }: { m: Microbe; zone: Zone; ui: UI; action: React.ReactNode; highlight?: boolean; big?: boolean }) {
  return (
    <div className={`microbe ${highlight ? 'highlight' : ''} ${big ? 'big' : ''}`} data-track={`microbe:${m.id}`}>
      <div className="microbe-head">
        <span className="microbe-name">{m.name}</span>
        {action}
      </div>
      {zone.attributes.map((a, i) => (
        <div key={a} className="attr-row">
          <span className="attr-label">{a}</span>
          <div className="attr-bar">
            <div style={{ width: `${m.attrs[i] * 10}%` }} />
          </div>
          <span className="attr-value">{m.attrs[i]}</span>
        </div>
      ))}
      <div className="microbe-traits">
        {m.traits.length === 0 && <span className="muted small">{ui.noTraits}</span>}
        {m.traits.map((t) => (
          <TraitTag key={t} trait={t} lang={zone.lang} />
        ))}
      </div>
    </div>
  );
}

function AidsPanel({ zone, picks }: { zone: Zone; picks: Microbe[] }) {
  return (
    <div className="card aids">
      <div className="panel-title">Ayudas de práctica: sumas parciales de tu selección</div>
      <table>
        <thead>
          <tr>
            <th>Atributo</th>
            <th>Suma actual</th>
            <th>Suma objetivo (3 microbios)</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {zone.attributes.map((a, i) => {
            const sum = picks.reduce((s, m) => s + m.attrs[i], 0);
            const lo = zone.ranges[i][0] * 3;
            const hi = zone.ranges[i][1] * 3;
            const ok = picks.length === 3 && sum >= lo && sum <= hi;
            return (
              <tr key={a}>
                <td>{a}</td>
                <td className="num">{sum}</td>
                <td className="num">
                  {lo}–{hi}
                </td>
                <td>{picks.length < 3 ? `faltan ${3 - picks.length}` : ok ? '✓' : '✗'}</td>
              </tr>
            );
          })}
          <tr>
            <td>Rasgo deseado</td>
            <td colSpan={2}>{picks.some((m) => m.traits.includes(zone.required)) ? 'presente' : 'ausente'}</td>
            <td>{picks.some((m) => m.traits.includes(zone.required)) ? '✓' : '✗'}</td>
          </tr>
          <tr>
            <td>Rasgo no deseado</td>
            <td colSpan={2}>{picks.some((m) => m.traits.includes(zone.prohibited)) ? 'presente' : 'ausente'}</td>
            <td>{picks.some((m) => m.traits.includes(zone.prohibited)) ? '✗' : '✓'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Eficacia del tratamiento tras enviarlo (solo en práctica; en examen se ve al final). */
function EfficacyCard({ zone, picks, en, onNext, nextLabel }: { zone: Zone; picks: Microbe[]; en: boolean; onNext: () => void; nextLabel: string }) {
  const chk = checkSelection(zone, picks);
  const eff = chk.valid ? 100 : Math.round((chk.rulesOk / chk.rulesTotal) * 100);
  return (
    <div className={`card feedback ${chk.valid ? 'ok' : 'ko'}`}>
      <div className="q-num">{en ? 'Treatment efficacy' : 'Eficacia del tratamiento'}</div>
      <h1 className="efficacy">{eff}%</h1>
      {chk.valid ? (
        <p className="ok-text">Cumple todas las reglas.</p>
      ) : (
        <ul className="violations">
          {chk.violations.map((v, i) => (
            <li key={i}>
              <strong>{v.rule}:</strong> {v.detail}
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">
        Rasgo deseado «{traitLabel(zone.required, zone.lang)}», no deseado «{traitLabel(zone.prohibited, zone.lang)}». La corrección completa (tríos válidos, cuello de botella y
        candidatos que faltaron) aparece al final.
      </p>
      <div className="actions">
        <button type="button" className="btn primary" onClick={onNext}>
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
