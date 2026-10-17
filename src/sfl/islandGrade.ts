// Corrección del SFL Island: rúbrica de 100 puntos por día, explicación de cada decisión y patrones del proceso.
// Cada día: Explorar 20 · Asignar 30 · Motivos 10 · Apoyar 30 · Reflexionar 10.

import type { Pattern } from '../analysis/process';
import { game, GameRubric, P, part, RubricItem, splitEven, T } from '../analysis/rubric';
import type { PartTime } from '../analysis';
import type { RecEvent } from '../lib/recorder';
import {
  answerText,
  dayKeyQuestions,
  la,
  hadEvidence,
  IslandDayAnswer,
  IslandOnboardingAnswer,
  IslandScenario,
  LEVEL_LABEL,
  REASON_LABEL,
  reflectTruth,
  skillLabel,
} from './island';

export const ISLAND_RULES = {
  onboarding:
    'Onboarding (10): se comparan por parejas las 6 relaciones de orden entre las 4 preguntas (unos 1,7 puntos por pareja). No se sabe si la prueba real lo puntúa: aquí cuenta poco y sirve para practicar el criterio «primero lo que cambia decisiones».',
  explore:
    'Explorar (20 por día): los puntos se reparten entre las preguntas clave del día: las que revelan un dato que cambia la mejor asignación y la que dice quién tiene margen para la petición de Apoyar que depende de ello. Una pregunta irrelevante no resta, pero gasta una pregunta que luego falta.',
  assign: 'Asignar (30 por día): 7,5 por cada investigador en la estación de la asignación óptima (la de mayor valor según el objetivo del día).',
  reasons:
    'Motivos (10 por día): se reparten entre los investigadores que la asignación óptima mueve de su estación habitual. Cuentan si los moviste bien y elegiste un motivo aceptable.',
  support:
    'Apoyar (30 por día): 6,5 por petición (mejor respuesta 6,5; aceptable 3; mala o sin responder 0) y 4 por atender primero la petición urgente.',
  reflect:
    'Reflexionar (10 por día): 2,5 por investigador si aciertas el nivel. «No lo sé» vale 1,5 si ese día no tenías pruebas sobre esa persona y 0 si las tenías. Un nivel equivocado vale 0.',
};

const DAY_REF_SEC = 10 * 60;
/** Referencia de Road to Offer para el onboarding (~3 min), no oficial. */
const ONBOARDING_REF_SEC = 3 * 60;
const QUALITY_T = { best: 65, ok: 30, poor: 0 };

export interface IslandDecision {
  id: string;
  day: number;
  step: 'onboarding' | 'explore' | 'assign' | 'reason' | 'support' | 'reflect';
  label: string;
  yours: string;
  best: string;
  ok: boolean | 'partial';
  why: string;
  /** Información que justificaba la mejor respuesta. */
  info: string;
  /** Cuándo había que obtenerla. */
  when: string;
}

export interface IslandGrade {
  rubric: GameRubric;
  decisions: IslandDecision[];
}

export function gradeIsland(sc: IslandScenario, answers: IslandDayAnswer[], onboarding?: IslandOnboardingAnswer): IslandGrade {
  const decisions: IslandDecision[] = [];
  const parts = [];
  // ---- Onboarding: orden de las 4 preguntas, por parejas
  const ob = sc.onboarding;
  const topicQ = (id: string) => `«${ob.topics.find((x) => x.id === id)?.question ?? id}»`;
  const order = onboarding?.order ?? [];
  const obPairs: [string, string][] = [];
  for (let i = 0; i < ob.best.length; i++) for (let j = i + 1; j < ob.best.length; j++) obPairs.push([ob.best[i], ob.best[j]]);
  const obT = splitEven(100, obPairs.length);
  const obItems: RubricItem[] = obPairs.map(([x, y], k) => {
    const ok = order.length > 0 && order.indexOf(x as never) < order.indexOf(y as never);
    return {
      id: `isl-onb-${x}-${y}`,
      label: `Onboarding · ${topicQ(x)} antes que ${topicQ(y)}`,
      max: P(obT[k]),
      earned: ok ? P(obT[k]) : 0,
      why: ok ? 'Orden correcto.' : order.length ? `Al revés: ${topicQ(x)} aporta más para decidir que ${topicQ(y)}.` : 'Sin responder.',
      errorType: ok ? undefined : order.length ? 'sfl-onboarding' : 'sfl-blank',
    };
  });
  const obOk = order.join() === ob.best.join();
  decisions.push({
    id: 'isl-onboarding',
    day: 1,
    step: 'onboarding',
    label: 'Onboarding: orden de las preguntas',
    yours: order.length ? order.map(topicQ).join(' → ') : 'Sin responder',
    best: ob.best.map(topicQ).join(' → '),
    ok: obOk ? true : obItems.some((i) => i.earned > 0) ? 'partial' : false,
    why: ob.why,
    info: 'La introducción del proyecto: qué preguntas cambian tus decisiones del día 1 y cuáles son solo contexto.',
    when: 'Onboarding, antes del día 1 (ya corre el reloj).',
  });
  parts.push(part('isl-onboarding', 'Inicio · Onboarding', ISLAND_RULES.onboarding, obItems));
  const rn = (id: string) => sc.researchers.find((r) => r.id === id)?.name ?? id;
  const sn = (id: string | undefined) => (id ? (sc.stations.find((s) => s.id === id)?.name ?? id) : '—');
  const lsn = (id: string | undefined) => (id ? la(sn(id)) : 'ninguna');
  const L = sc.lang;

  for (let d = 0; d < sc.days.length; d++) {
    const day = sc.days[d];
    const a = answers[d];
    const tag = `Día ${d + 1}`;
    const qLabel = (qid: string) => day.questions.find((q) => q.id === qid)?.label ?? qid;

    // ---- Explorar
    const keyQs = dayKeyQuestions(day);
    const exT = splitEven(200, keyQs.length);
    const exploreItems: RubricItem[] = keyQs.map((qid, i) => {
      const asked = !!a?.asked.includes(qid);
      const linked = day.support.filter((r) => r.evidence?.question === qid);
      const facts = [...day.keyFacts.filter((f) => f.question === qid).map((f) => f.explanation), ...linked.map((r) => r.evidence!.explanation)];
      const effect = [
        ...(day.keyFacts.some((f) => f.question === qid) ? ['cambia la mejor asignación del día'] : []),
        ...linked.map((r) => `decide la petición «${r.title}» de ${rn(r.from)} en Apoyar`),
      ].join(' y ');
      decisions.push({
        id: `isl${d}-key-${qid}`,
        day: d + 1,
        step: 'explore',
        label: `Pregunta clave: «${qLabel(qid)}»`,
        yours: asked ? 'La hiciste' : 'No la hiciste',
        best: 'Hacerla',
        ok: asked,
        why: `Revelaba que ${facts.join(' y ')}, y eso ${effect}.`,
        info: facts.join('; '),
        when: `${tag}, fase Explorar, antes de asignar.`,
      });
      return {
        id: `isl${d}-key-${qid}`,
        label: `${tag} · Explorar: «${qLabel(qid)}»`,
        max: P(exT[i]),
        earned: asked ? P(exT[i]) : 0,
        why: asked ? `La hiciste: ${facts.join('; ')}.` : `No la hiciste y era clave: ${facts.join('; ')}.`,
        errorType: asked ? undefined : 'sfl-explore-missed',
      };
    });
    const irrelevant = (a?.asked ?? []).filter((q) => !keyQs.includes(q));
    if (irrelevant.length)
      decisions.push({
        id: `isl${d}-irrelevant`,
        day: d + 1,
        step: 'explore',
        label: `Preguntas que no cambiaban la asignación (${irrelevant.length})`,
        yours: irrelevant.map((q) => `«${qLabel(q)}»`).join(', '),
        best: keyQs.map((q) => `«${qLabel(q)}»`).join(', '),
        ok: keyQs.every((q) => a?.asked.includes(q)) ? 'partial' : false,
        why: keyQs.every((q) => a?.asked.includes(q))
          ? 'No te costaron puntos porque te sobraban preguntas, pero no aportaban información para decidir.'
          : 'Gastaron preguntas que luego te faltaron para conseguir la información clave.',
        info: 'El objetivo del día y lo que ya sabías (cargos visibles) indican qué persona o estación puede tener un cambio relevante.',
        when: `${tag}, fase Explorar.`,
      });

    // ---- Asignar
    const asT = splitEven(300, sc.researchers.length);
    const assignItems: RubricItem[] = sc.researchers.map((r, i) => {
      const yours = a?.assign[r.id];
      const best = day.optimum[r.id];
      const ok = yours === best;
      const own = relevantFacts(day, r.id, best, yours);
      const need = day.need[best];
      const fit = `${r.name} tiene nivel ${r.prof[need]} de 4 en ${skillLabel(L, need)}, que es lo que pide hoy ${lsn(best)}`;
      const chain = !own.length && best !== day.baseline[r.id];
      const facts = chain ? day.keyFacts : own;
      const justification =
        best === day.baseline[r.id] && !own.length
          ? `su especialidad (${skillLabel(L, r.skill1)}) es lo que necesita hoy ${lsn(best)} y nada lo impedía`
          : chain
            ? `como ${facts.map((f) => f.explanation).join(' y ')}, había que cubrir ${lsn(best)}; ${fit}`
            : `${own.map((f) => f.explanation).join('; ')}${best !== day.baseline[r.id] ? `; ${fit}` : ''}`;
      const sources = [...new Set(facts.map((f) => `«${qLabel(f.question)}»`))].join(', ');
      decisions.push({
        id: `isl${d}-assign-${r.id}`,
        day: d + 1,
        step: 'assign',
        label: `Asignar a ${r.name}`,
        yours: sn(yours),
        best: sn(best),
        ok,
        why: ok ? `Correcto: ${justification}.` : `Lo mejor era ${lsn(best)}: ${justification}.`,
        info: justification[0].toUpperCase() + justification.slice(1),
        when: facts.length ? `${tag}, Explorar: ${sources}` : 'Visible desde el principio (perfil del investigador).',
      });
      return {
        id: `isl${d}-assign-${r.id}`,
        label: `${tag} · Asignar: ${r.name}`,
        max: P(asT[i]),
        earned: ok ? P(asT[i]) : 0,
        why: ok ? `${sn(best)}: correcto.` : `Pusiste ${lsn(yours)}; lo mejor era ${lsn(best)} (${justification}).`,
        errorType: ok ? undefined : evidenceFor(day, a, r.id, best, yours) ? 'sfl-assign' : 'sfl-assign-intuition',
      };
    });

    // ---- Motivos
    const moved = Object.keys(day.reasons);
    const reT = splitEven(100, moved.length);
    const reasonItems: RubricItem[] = moved.map((rid, i) => {
      const placed = a?.assign[rid] === day.optimum[rid];
      const reason = a?.reasons[rid];
      const ok = placed && !!reason && day.reasons[rid].includes(reason);
      const accepted = day.reasons[rid].map((x) => REASON_LABEL.es[x]).join(' o ');
      decisions.push({
        id: `isl${d}-reason-${rid}`,
        day: d + 1,
        step: 'reason',
        label: `Motivo para mover a ${rn(rid)}`,
        yours: !placed ? 'No lo moviste a la estación correcta' : reason ? REASON_LABEL.es[reason] : 'Sin motivo',
        best: accepted,
        ok,
        why: `${rn(rid)} se mueve a ${lsn(day.optimum[rid])} por: ${accepted}.`,
        info: day.keyFacts.map((f) => f.explanation).join('; '),
        when: `${tag}, fase Asignar.`,
      });
      return {
        id: `isl${d}-reason-${rid}`,
        label: `${tag} · Motivo: ${rn(rid)}`,
        max: P(reT[i]),
        earned: ok ? P(reT[i]) : 0,
        why: ok ? 'Motivo correcto.' : !placed ? 'No lo moviste a la estación correcta.' : `Motivo aceptable: ${accepted}.`,
        errorType: ok ? undefined : placed ? 'sfl-reason' : 'sfl-assign',
      };
    });

    // ---- Apoyar
    const urgent = day.support.find((r) => r.urgent)!;
    const supportItems: RubricItem[] = day.support.map((req) => {
      const idx = a?.support[req.id];
      const chosen = idx == null ? null : req.options[idx];
      const q = chosen?.quality ?? 'poor';
      const best = req.options.find((o) => o.quality === 'best')!;
      const ev = req.evidence;
      const knew = !!ev && !!a?.asked.includes(ev.question);
      // Pasar trabajo a alguien concreto sin haber preguntado quién tenía margen es decidir por intuición
      const guessed = !!ev && !!chosen?.who && !knew;
      decisions.push({
        id: `isl${d}-support-${req.id}`,
        day: d + 1,
        step: 'support',
        label: `Petición de ${rn(req.from)}: ${req.title}${req.urgent ? ' (urgente)' : ''}`,
        yours: chosen ? chosen.text : 'Sin responder',
        best: best.text,
        ok: q === 'best' ? true : q === 'ok' ? 'partial' : false,
        why: `${chosen && q !== 'best' ? `${chosen.why} La mejor: ${best.why}` : best.why}${
          ev ? (knew ? '' : guessed ? ' Elegiste a una persona sin haber preguntado quién tenía margen: fue una apuesta.' : ' Sin haber preguntado quién tenía margen, no podías saberlo: la opción prudente era la aceptable.') : ''
        }`,
        info: ev ? `${ev.explanation[0].toUpperCase()}${ev.explanation.slice(1)}: lo decía al preguntarle cómo estaba.` : 'El propio mensaje: qué pide, quién está implicado y si hay un dato que verificar.',
        when: ev ? `${tag}, Explorar: «${qLabel(ev.question)}», antes de llegar a Apoyar.` : `${tag}, fase Apoyar.`,
      });
      return {
        id: `isl${d}-support-${req.id}`,
        label: `${tag} · Apoyar: ${req.title}`,
        max: P(QUALITY_T.best),
        earned: P(QUALITY_T[q]),
        why: chosen ? (q === 'best' ? 'Mejor respuesta.' : `${chosen.why} Mejor: «${best.text}»`) : `Sin responder. Mejor: «${best.text}»`,
        errorType: q === 'best' ? undefined : guessed ? 'sfl-support-guess' : chosen ? `sfl-support-${q}` : 'sfl-blank',
      };
    });
    const firstOk = a?.supportOrder[0] === urgent.id;
    supportItems.push({
      id: `isl${d}-urgent`,
      label: `${tag} · Apoyar: atender primero lo urgente`,
      max: 4,
      earned: firstOk ? 4 : 0,
      why: firstOk ? 'Atendiste primero la petición urgente.' : `La urgente era «${urgent.title}» y no la atendiste la primera.`,
      errorType: firstOk ? undefined : 'sfl-urgent',
    });
    decisions.push({
      id: `isl${d}-urgent`,
      day: d + 1,
      step: 'support',
      label: 'Orden de las peticiones',
      yours: a?.supportOrder.length ? `Primero: «${day.support.find((r) => r.id === a.supportOrder[0])?.title}»` : 'Ninguna',
      best: `Primero: «${urgent.title}» (urgente)`,
      ok: firstOk,
      why: 'Lo urgente bloquea a otros o crece si se deja: se atiende antes que lo importante pero aplazable.',
      info: 'La etiqueta «urgente» de la petición.',
      when: `${tag}, al abrir la fase Apoyar.`,
    });

    // ---- Reflexionar
    const rfT = splitEven(100, sc.researchers.length);
    const dim = day.reflectDimension === 'workload' ? 'carga de trabajo' : 'ánimo';
    const reflectItems: RubricItem[] = sc.researchers.map((r, i) => {
      const truth = reflectTruth(sc, answers, d, r.id);
      const yours = a?.reflect[r.id] || '';
      const evidence = a ? hadEvidence(sc, a, d, r.id) : false;
      const ok = yours === truth;
      const earnedT = ok ? rfT[i] : yours === 'unknown' && !evidence ? 15 : 0;
      const src = `«${qLabel(`${r.id}:state`)}»`;
      decisions.push({
        id: `isl${d}-reflect-${r.id}`,
        day: d + 1,
        step: 'reflect',
        label: `${dim[0].toUpperCase()}${dim.slice(1)} de ${r.name}`,
        yours: yours ? LEVEL_LABEL.es[yours] : 'Sin responder',
        best: LEVEL_LABEL.es[truth],
        ok: ok ? true : earnedT > 0 ? 'partial' : false,
        why: ok
          ? 'Correcto.'
          : yours === 'unknown'
            ? evidence
              ? 'Tenías pruebas para responder: preguntaste por su estado o atendiste su petición.'
              : '«No lo sé» es honesto sin pruebas, pero vale menos que saberlo.'
            : `Era ${LEVEL_LABEL.es[truth].toLowerCase()}. ${evidence ? 'Tenías la información.' : 'No tenías pruebas: respondiste por intuición.'}`,
        info: answerText(sc, answers, d, `${r.id}:state`),
        when: `${tag}, Explorar (${src}) o en su petición de apoyo.`,
      });
      return {
        id: `isl${d}-reflect-${r.id}`,
        label: `${tag} · Reflexionar: ${r.name}`,
        max: P(rfT[i]),
        earned: P(earnedT),
        why: ok ? 'Correcto.' : `Era ${LEVEL_LABEL.es[truth].toLowerCase()}.`,
        errorType: ok || (yours === 'unknown' && !evidence) ? undefined : yours ? (evidence ? 'sfl-reflect' : 'sfl-reflect-guess') : 'sfl-blank',
      };
    });

    parts.push(
      part(`isl${d}-explore`, `${tag} · Explorar`, ISLAND_RULES.explore, exploreItems),
      part(`isl${d}-assign`, `${tag} · Asignar`, ISLAND_RULES.assign, assignItems),
      part(`isl${d}-reasons`, `${tag} · Motivos`, ISLAND_RULES.reasons, reasonItems),
      part(`isl${d}-support`, `${tag} · Apoyar`, ISLAND_RULES.support, supportItems),
      part(`isl${d}-reflect`, `${tag} · Reflexionar`, ISLAND_RULES.reflect, reflectItems),
    );
  }
  return { rubric: game('sfl-island', 'SFL Island', parts), decisions };
}

/** Datos clave que afectan a la asignación de esta persona (los suyos o los de las estaciones implicadas). */
function relevantFacts(day: IslandScenario['days'][number], rid: string, best: string, yours?: string) {
  return day.keyFacts.filter((f) => f.fact.endsWith(`:${rid}`) || f.fact === `need:${best}` || (!!yours && f.fact === `need:${yours}`));
}

/** ¿Había preguntado el jugador lo que justificaba (o desmentía) la asignación de esta persona? */
function evidenceFor(day: IslandScenario['days'][number], a: IslandDayAnswer | undefined, rid: string, best: string, yours?: string): boolean {
  if (!a) return false;
  const own = relevantFacts(day, rid, best, yours);
  const relevant = own.length ? own : day.keyFacts;
  return relevant.every((f) => a.asked.includes(f.question));
}

// ---------------------------------------------------------------- patrones del proceso

export function islandPatterns(sc: IslandScenario, answers: IslandDayAnswer[], g: IslandGrade, onboarding?: IslandOnboardingAnswer): Pattern[] {
  const out: Pattern[] = [];
  if (onboarding && onboarding.timeSec > ONBOARDING_REF_SEC + 60)
    out.push({
      id: 'sfl-onboarding-slow',
      title: 'Onboarding demasiado largo',
      detail: 'El reloj de 30 minutos ya corre en el onboarding. Lo que gastas aquí te falta el día 3.',
      evidence: [`Tardaste ${Math.round(onboarding.timeSec)} s; la referencia es de unos ${ONBOARDING_REF_SEC} s.`],
      severity: 'media',
    });
  const qLabel = (d: number, qid: string) => sc.days[d].questions.find((q) => q.id === qid)?.label ?? qid;
  // Preguntas gastadas en información irrelevante cuando faltó la clave
  const wasted: string[] = [];
  const early: string[] = [];
  sc.days.forEach((day, d) => {
    const a = answers[d];
    if (!a) return;
    const keyQs = new Set(dayKeyQuestions(day));
    const missed = [...keyQs].filter((q) => !a.asked.includes(q));
    const irr = a.asked.filter((q) => !keyQs.has(q));
    if (missed.length && irr.length)
      wasted.push(`Día ${d + 1}: gastaste ${irr.map((q) => `«${qLabel(d, q)}»`).join(', ')} y te faltó ${missed.map((q) => `«${qLabel(d, q)}»`).join(', ')}.`);
    a.asked.forEach((q, i) => {
      if (!keyQs.has(q) && (a.askedAt[i] ?? 99) < 8) early.push(`Día ${d + 1}: «${qLabel(d, q)}» a los ${Math.round(a.askedAt[i])} s de empezar.`);
    });
  });
  if (wasted.length)
    out.push({
      id: 'sfl-wasted',
      title: 'Preguntas gastadas en información irrelevante',
      detail: 'Usaste preguntas que no cambiaban ninguna decisión y luego te faltó la información clave.',
      evidence: wasted,
      severity: 'alta',
    });
  if (early.length)
    out.push({
      id: 'sfl-early',
      title: 'Preguntas hechas demasiado pronto',
      detail: 'Preguntaste antes de leer el objetivo del día y los perfiles: esas preguntas no apuntaban a nada concreto.',
      evidence: early,
      severity: 'media',
    });
  // Asignar por intuición en lugar de por evidencia
  const intuition = g.rubric.parts.flatMap((p) => p.items).filter((i) => i.errorType === 'sfl-assign-intuition');
  const lucky: string[] = [];
  sc.days.forEach((day, d) => {
    const a = answers[d];
    if (!a) return;
    for (const r of sc.researchers) {
      if (a.assign[r.id] === day.baseline[r.id] || a.assign[r.id] !== day.optimum[r.id]) continue;
      if (!evidenceFor(day, a, r.id, day.optimum[r.id], a.assign[r.id]) && day.keyFacts.some((f) => f.fact.endsWith(`:${r.id}`)))
        lucky.push(`Día ${d + 1}: moviste bien a ${r.name} sin haber preguntado lo que lo justificaba.`);
    }
    for (const req of day.support) {
      const opt = a.support[req.id] != null ? req.options[a.support[req.id]] : undefined;
      if (req.evidence && opt?.quality === 'best' && !a.asked.includes(req.evidence.question))
        lucky.push(`Día ${d + 1}: en «${req.title}» acertaste a quién pasar el trabajo sin haber preguntado quién tenía margen.`);
    }
  });
  const supportGuesses = g.rubric.parts.flatMap((p) => p.items).filter((i) => i.errorType === 'sfl-support-guess');
  if (intuition.length || lucky.length || supportGuesses.length)
    out.push({
      id: 'sfl-intuition',
      title: 'Decisiones por intuición, no por evidencia',
      detail: 'Pusiste a alguien en una estación o le pasaste trabajo sin la información que lo justificaba.',
      evidence: [...intuition.map((i) => `${i.label}: ${i.why}`), ...supportGuesses.map((i) => `${i.label}: elegiste a quién pasar el trabajo sin saber quién tenía margen.`), ...lucky],
      severity: intuition.length || supportGuesses.length ? 'alta' : 'media',
    });
  const guesses = g.rubric.parts.flatMap((p) => p.items).filter((i) => i.errorType === 'sfl-reflect-guess');
  if (guesses.length >= 2)
    out.push({
      id: 'sfl-reflect-guess',
      title: 'Reflexión sin pruebas',
      detail: 'Diste un nivel concreto sobre personas de las que no sabías nada ese día. «No lo sé» puntúa más que un error.',
      evidence: guesses.map((i) => i.label),
      severity: 'media',
    });
  const urgent = g.rubric.parts.flatMap((p) => p.items).filter((i) => i.errorType === 'sfl-urgent');
  if (urgent.length >= 2)
    out.push({
      id: 'sfl-urgent',
      title: 'Lo urgente, al final',
      detail: 'Varios días no empezaste por la petición marcada como urgente.',
      evidence: urgent.map((i) => i.why ?? i.label),
      severity: 'media',
    });
  return out;
}

// ---------------------------------------------------------------- integración con el análisis

export function islandTimes(answers: IslandDayAnswer[], onboarding?: IslandOnboardingAnswer): PartTime[] {
  return [
    ...(onboarding ? [{ game: 'SFL Island', label: 'Onboarding', sec: onboarding.timeSec, refSec: ONBOARDING_REF_SEC }] : []),
    ...answers.map((a, d) => ({ game: 'SFL Island', label: `Día ${d + 1}`, sec: a.timeSec, refSec: DAY_REF_SEC })),
  ];
}

export function islandContext(sc: IslandScenario, g: IslandGrade) {
  const labels = new Map<string, string>();
  const correctness = new Map<string, boolean>();
  const itemOk = new Map<string, boolean>();
  for (const p of g.rubric.parts) for (const i of p.items) itemOk.set(i.id, T(i.earned) >= T(i.max));
  const rn = (id: string) => sc.researchers.find((r) => r.id === id)?.name ?? id;
  sc.days.forEach((day, d) => {
    const tag = `Día ${d + 1}`;
    for (const r of sc.researchers) {
      labels.set(`sfl-assign|${d}-${r.id}`, `${tag} · asignar a ${r.name}`);
      correctness.set(`sfl-assign|${d}-${r.id}`, !!itemOk.get(`isl${d}-assign-${r.id}`));
      labels.set(`sfl-reason|${d}-${r.id}`, `${tag} · motivo de ${r.name}`);
      if (itemOk.has(`isl${d}-reason-${r.id}`)) correctness.set(`sfl-reason|${d}-${r.id}`, !!itemOk.get(`isl${d}-reason-${r.id}`));
      labels.set(`sfl-reflect|${d}-${r.id}`, `${tag} · reflexión sobre ${r.name}`);
      correctness.set(`sfl-reflect|${d}-${r.id}`, !!itemOk.get(`isl${d}-reflect-${r.id}`));
    }
    for (const req of day.support) {
      labels.set(`sfl-support|${req.id}`, `${tag} · petición de ${rn(req.from)}: ${req.title}`);
      correctness.set(`sfl-support|${req.id}`, !!itemOk.get(`isl${d}-support-${req.id}`));
    }
    for (const q of day.questions) labels.set(`sfl-ask|${d}-${q.id}`, `${tag} · ${q.label}`);
  });
  const describe = (e: RecEvent): string | null => {
    if (e.k === 'decision' && e.kind === 'sfl-ask') return `Pregunta: ${labels.get(`sfl-ask|${e.item}`) ?? e.item}`;
    return null;
  };
  return { labels, correctness, describe };
}


export const ISLAND_TIPS: Record<string, (n: number) => string> = {
  'sfl-explore-missed': (n) =>
    `Te faltaron ${n} preguntas clave. Antes de preguntar, lee el objetivo del día y el aviso del coordinador: pregunta primero a quien o a la estación que puede tener un cambio que afecte a ese objetivo.`,
  'sfl-assign-intuition': (n) =>
    `Fallaste ${n} asignaciones sin tener la información que las justificaba. No muevas a nadie de su especialidad sin un dato que lo pida; y si un dato podría cambiarlo, pregúntalo antes.`,
  'sfl-assign': (n) =>
    `Fallaste ${n} asignaciones teniendo la información. Comprueba que cada persona puede trabajar donde la pones y que cada estación recibe la habilidad que pide hoy.`,
  'sfl-reason': () => 'Elige el motivo que de verdad causó el cambio: si fue algo de la persona, «situación o preferencia personal»; si fue la estación, «necesidad de la estación».',
  'sfl-support-poor': (n) => `Diste ${n} malas respuestas de apoyo. Descarta siempre las opciones que evitan el problema o ignoran a la persona.`,
  'sfl-support-ok': (n) => `En ${n} peticiones elegiste una opción aceptable pero no la mejor. La mejor suele resolver la causa y dejar un seguimiento, no solo aliviar el síntoma.`,
  'sfl-support-guess': (n) =>
    `En ${n} peticiones pasaste trabajo a alguien sin saber si tenía margen. Si una petición puede acabar en «pásaselo a alguien», pregunta en Explorar cómo está la gente; si no lo sabes, elige la opción que no carga a nadie.`,
  'sfl-onboarding': () =>
    'En el onboarding, pide primero lo que cambia tus decisiones (qué hay que conseguir y cómo funciona la jornada) y deja el contexto para el final.',
  'sfl-urgent': () => 'Abre primero la petición marcada como urgente: el orden puntúa.',
  'sfl-reflect': () => 'En Reflexionar usa lo que te dijeron ese mismo día: si alguien dijo que iba justo, su ánimo o su carga no son «alto».',
  'sfl-reflect-guess': () => 'Si no tienes pruebas sobre alguien, responde «No lo sé»: vale más que un nivel equivocado.',
  'sfl-blank': () => 'Te quedaron decisiones del SFL sin responder: reparte los 30 minutos (unos 10 por día) y no te quedes en un solo día.',
};
