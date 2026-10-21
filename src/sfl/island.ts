// SFL Island: 3 días gestionando 4 investigadores en 4 estaciones de una isla (contenido original).
// Mecánica según research/solve-2026.md §9 (web de preparación / candidatos): cada día Explorar → Asignar →
// Apoyar → Reflexionar; preguntas limitadas por día (3, 3, 2); cada investigador responde como mucho a 1 pregunta
// al día; las notas se borran por la noche; sin feedback durante la prueba (en examen).

import { createRng, Rng } from '../lib/rng';
import type { Lang } from '../lib/history';
import type { Difficulty } from '../redrock/types';

export type Skill = 'field' | 'lab' | 'tech' | 'data';
export const SKILLS: Skill[] = ['field', 'lab', 'tech', 'data'];
export type Level = 'high' | 'mid' | 'low';
export type QKind = 'state' | 'contrib' | 'need' | 'news';
export type Reason = 'personal' | 'skills' | 'goal' | 'station' | 'cover';
export const REASONS: Reason[] = ['personal', 'skills', 'goal', 'station', 'cover'];

/** Parámetros dudosos en las fuentes, configurables. */
export const ISLAND_CONFIG = {
  questionsPerDay: [3, 3, 2],
  notesPersistOvernight: false,
  supportPerDay: 4,
  /** Preguntas que pueden sobrar cada día sin perder información clave (0 = presupuesto justo). */
  slack: { normal: 1, hard: 0 } as Record<Difficulty, number>,
};

export interface Researcher {
  id: string;
  name: string;
  title: string;
  skill1: Skill;
  skill2: Skill;
  /** Punto débil: la habilidad sin experiencia (nivel 0). */
  weak: Skill;
  /** Dominio de cada habilidad (visible en el perfil): 4 la principal, 2 la secundaria, 1 y 0 el resto. */
  prof: Record<Skill, number>;
}

export interface Station {
  id: string;
  name: string;
  usual: Skill;
}

export interface Question {
  id: string; // `${target}:${kind}`
  target: string; // id de investigador o estación
  kind: QKind;
  label: string;
}

export interface Answer {
  text: string;
  /** Hechos que revela (claves internas). */
  facts: string[];
}

export interface SupportOption {
  text: string;
  quality: 'best' | 'ok' | 'poor';
  why: string;
  /** Investigador al que la opción pasa trabajo (solo en peticiones que dependen de lo explorado). */
  who?: string;
}

export type SupportType = 'conflict' | 'overload' | 'contradiction' | 'dependency' | 'wellbeing' | 'delegate' | 'capacity';

export interface SupportRequest {
  id: string;
  from: string;
  type: SupportType;
  urgent: boolean;
  title: string;
  text: string;
  options: SupportOption[];
  /** Si la mejor respuesta depende de algo que había que preguntar en Explorar ese día. */
  evidence?: { question: string; who: string; explanation: string };
}

export interface DayPlan {
  day: number;
  goal: string;
  goalKind: 'people' | 'stations' | 'balance';
  briefing: string;
  /** Notas de la mañana: señalan a quién conviene preguntar (sin dar la respuesta) y alguna que no importa. */
  morningNotes: string[];
  budget: number;
  need: Record<string, Skill>;
  heavy: string | null;
  pref: Record<string, string | null>;
  blocked: Record<string, string | null>;
  overloaded: Record<string, boolean>;
  baseMood: Record<string, Level>;
  workload: Record<string, Level>;
  questions: Question[];
  answers: Record<string, Answer>;
  /** Hechos ocultos que cambian la asignación óptima. */
  keyFacts: { fact: string; question: string; explanation: string }[];
  baseline: Record<string, string>; // asignación inicial (por especialidad visible)
  optimum: Record<string, string>;
  optimumValue: number;
  secondValue: number;
  /** Motivos aceptables para quien se mueve en la asignación óptima. */
  reasons: Record<string, Reason[]>;
  support: SupportRequest[];
  reflectDimension: 'mood' | 'workload';
}

export interface OnboardingTopic {
  id: 'goal' | 'rules' | 'team' | 'context';
  question: string;
  answer: string;
}

/** Onboarding: ordenas 4 preguntas según el orden en que quieres las respuestas y recibes las 4 (research §9.2.3). */
export interface Onboarding {
  topics: OnboardingTopic[]; // en el orden en que se presentan (barajado)
  best: OnboardingTopic['id'][];
  why: string;
}

export interface IslandScenario {
  seed: string;
  lang: Lang;
  difficulty: Difficulty;
  island: string;
  mission: string;
  onboarding: Onboarding;
  researchers: Researcher[];
  stations: Station[];
  days: DayPlan[];
}

// ---------------------------------------------------------------- vocabulario

const NAMES = [
  'Noa Vidal',
  'Íker Sanz',
  'Maya Okafor',
  'Teo Lindqvist',
  'Ruth Amari',
  'Pau Ferrer',
  'Lena Kovač',
  'Omar Haddad',
  'Iris Moreau',
  'Dani Rocha',
  'Sara Baptiste',
  'Hugo Nakamura',
];

const T = (lang: Lang) => (es: string, en: string) => (lang === 'en' ? en : es);

const SKILL_LABEL: Record<Lang, Record<Skill, string>> = {
  es: {
    field: 'trabajo de campo',
    lab: 'análisis de laboratorio',
    tech: 'mantenimiento técnico',
    data: 'análisis de datos',
  },
  en: {
    field: 'field work',
    lab: 'lab analysis',
    tech: 'technical maintenance',
    data: 'data analysis',
  },
};
const TITLES: Record<Lang, Record<Skill, string>> = {
  es: {
    field: 'Ecología de campo',
    lab: 'Química de laboratorio',
    tech: 'Ingeniería de sistemas',
    data: 'Análisis de datos',
  },
  en: {
    field: 'Field ecologist',
    lab: 'Lab chemist',
    tech: 'Systems engineer',
    data: 'Data analyst',
  },
};
const STATIONS: Record<Lang, Record<Skill, string>> = {
  es: {
    field: 'Estación de campo',
    lab: 'Estación de laboratorio',
    tech: 'Estación de energía',
    data: 'Estación de datos',
  },
  en: {
    field: 'Field station',
    lab: 'Lab station',
    tech: 'Energy station',
    data: 'Data station',
  },
};
export const REASON_LABEL: Record<Lang, Record<Reason, string>> = {
  es: {
    personal: 'Situación o preferencia personal',
    skills: 'Habilidades',
    goal: 'Objetivo del día',
    station: 'Necesidad de la estación',
    cover: 'Cubrir una estación',
  },
  en: {
    personal: 'Personal situation or preference',
    skills: 'Skills',
    goal: "Day's goal",
    station: 'Station need',
    cover: 'Cover a station',
  },
};
export const LEVEL_LABEL: Record<Lang, Record<Level | 'unknown', string>> = {
  es: { high: 'Alto', mid: 'Medio', low: 'Bajo', unknown: 'No lo sé' },
  en: { high: 'High', mid: 'Medium', low: 'Low', unknown: "Don't know" },
};

/** Nombre de estación dentro de una frase en español: «la estación de campo». */
export const la = (name: string) => `la ${name[0].toLowerCase()}${name.slice(1)}`;

export const skillLabel = (lang: Lang, s: Skill) => SKILL_LABEL[lang][s];

// ---------------------------------------------------------------- valor de una asignación

const WEIGHTS = {
  people: { pref: 6, need: 2 },
  stations: { pref: 2, need: 3 },
  balance: { pref: 4, need: 2 },
};

export function value(d: Pick<DayPlan, 'need' | 'pref' | 'blocked' | 'overloaded' | 'heavy' | 'goalKind'>, r: Researcher, stationId: string): number {
  const w = WEIGHTS[d.goalKind];
  const need = d.need[stationId];
  let v = w.need * r.prof[need];
  if (d.pref[r.id] === stationId) v += w.pref;
  if (d.blocked[r.id] === stationId) v -= 20;
  if (d.overloaded[r.id] && d.heavy === stationId) v -= 10;
  return v;
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr.slice()];
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}

export function assignmentValue(d: DayPlanCore, researchers: Researcher[], assign: Record<string, string>): number {
  return researchers.reduce((s, r) => s + (assign[r.id] ? value(d, r, assign[r.id]) : 0), 0);
}

export type DayPlanCore = Pick<DayPlan, 'need' | 'pref' | 'blocked' | 'overloaded' | 'heavy' | 'goalKind'>;

export function bestAssignments(d: DayPlanCore, researchers: Researcher[], stations: Station[]) {
  const all = permutations(stations.map((s) => s.id)).map((perm) => {
    const a: Record<string, string> = {};
    researchers.forEach((r, i) => (a[r.id] = perm[i]));
    return { a, v: assignmentValue(d, researchers, a) };
  });
  all.sort((x, y) => y.v - x.v);
  return all;
}

// ---------------------------------------------------------------- generador

export function generateIsland(seed: string, difficulty: Difficulty, lang: Lang = 'es'): IslandScenario {
  const rng = createRng(`sfl-island|${difficulty}|${seed}`);
  for (let attempt = 0; attempt < 300; attempt++) {
    const sc = tryGenerate(rng, seed, difficulty, lang);
    if (sc && validateIsland(sc).length === 0) return sc;
  }
  throw new Error('No se pudo generar el SFL Island');
}

function tryGenerate(rng: Rng, seed: string, difficulty: Difficulty, lang: Lang): IslandScenario | null {
  const t = T(lang);
  const names = rng.sample(NAMES, 4);
  const specialties = rng.shuffle(SKILLS);
  const researchers: Researcher[] = names.map((name, i) => {
    const skill1 = specialties[i];
    const [skill2, s3, s4] = rng.shuffle(SKILLS.filter((s) => s !== skill1));
    const prof = { [skill1]: 4, [skill2]: 2, [s3]: 1, [s4]: 0 } as Record<Skill, number>;
    return {
      id: `r${i}`,
      name,
      title: TITLES[lang][skill1],
      skill1,
      skill2,
      weak: s4,
      prof,
    };
  });
  const stations: Station[] = SKILLS.map((s, i) => ({
    id: `s${i}`,
    name: STATIONS[lang][s],
    usual: s,
  }));
  const stationOf = (skill: Skill) => stations.find((s) => s.usual === skill)!;
  const baseline: Record<string, string> = {};
  researchers.forEach((r) => (baseline[r.id] = stationOf(r.skill1).id));
  const rName = (id: string) => researchers.find((r) => r.id === id)!.name;
  const sName = (id: string) => stations.find((s) => s.id === id)!.name;

  const days: DayPlan[] = [];
  const goals: DayPlan['goalKind'][] = ['people', 'stations', 'balance'];
  for (let d = 0; d < 3; d++) {
    dayTry: for (let tries = 0; ; tries++) {
      if (tries > 300) return null;
      const goalKind = goals[d];
      const need: Record<string, Skill> = {};
      stations.forEach((s) => (need[s.id] = s.usual));
      const pref: Record<string, string | null> = {};
      const blocked: Record<string, string | null> = {};
      const overloaded: Record<string, boolean> = {};
      const baseMood: Record<string, Level> = {};
      const workload: Record<string, Level> = {};
      researchers.forEach((r) => {
        pref[r.id] = null;
        blocked[r.id] = null;
        overloaded[r.id] = false;
        baseMood[r.id] = rng.pick(['high', 'mid', 'mid', 'high'] as Level[]);
        workload[r.id] = rng.pick(['mid', 'mid', 'low'] as Level[]);
      });
      let heavy: string | null = null;
      const facts: { fact: string; question: string; explanation: string }[] = [];
      // Giros ocultos según el objetivo del día
      const nTwists = difficulty === 'hard' ? 2 : rng.int(1, 2);
      const twistPool: ('pref' | 'blocked' | 'need' | 'overload')[] =
        goalKind === 'people' ? ['pref', 'blocked', 'pref'] : goalKind === 'stations' ? ['need', 'need', 'blocked'] : ['overload', 'need', 'pref'];
      const usedPeople = new Set<string>();
      const usedStations = new Set<string>();
      for (let k = 0; k < nTwists; k++) {
        const type = twistPool[k % twistPool.length];
        if (type === 'pref' || type === 'blocked' || type === 'overload') {
          const r = rng.pick(researchers.filter((x) => !usedPeople.has(x.id)));
          if (!r) continue dayTry;
          usedPeople.add(r.id);
          if (type === 'pref') {
            const s = rng.pick(stations.filter((x) => x.id !== baseline[r.id]));
            pref[r.id] = s.id;
            facts.push({
              fact: `pref:${r.id}`,
              question: `${r.id}:contrib`,
              explanation: `${r.name} prefería trabajar hoy en ${la(s.name)}`,
            });
          } else if (type === 'blocked') {
            blocked[r.id] = baseline[r.id];
            facts.push({
              fact: `blocked:${r.id}`,
              question: `${r.id}:contrib`,
              explanation: `${r.name} no podía trabajar hoy en ${la(sName(baseline[r.id]))}`,
            });
          } else {
            overloaded[r.id] = true;
            workload[r.id] = 'high';
            heavy = baseline[r.id];
            facts.push({
              fact: `overload:${r.id}`,
              question: `${r.id}:state`,
              explanation: `${r.name} estaba sobrecargado/a y ${la(sName(heavy))} tenía hoy la carga más pesada`,
            });
          }
        } else {
          const s = rng.pick(stations.filter((x) => !usedStations.has(x.id)));
          usedStations.add(s.id);
          const newNeed = rng.pick(SKILLS.filter((x) => x !== s.usual));
          need[s.id] = newNeed;
          facts.push({
            fact: `need:${s.id}`,
            question: `${s.id}:need`,
            explanation: `${la(s.name)} necesitaba hoy ${SKILL_LABEL[lang][newNeed]} en lugar de lo habitual`,
          });
        }
      }
      const core: DayPlanCore = {
        need,
        pref,
        blocked,
        overloaded,
        heavy,
        goalKind,
      };
      const ranked = bestAssignments(core, researchers, stations);
      const optimum = ranked[0].a;
      const optimumValue = ranked[0].v;
      const secondValue = ranked.find((x) => researchers.some((r) => x.a[r.id] !== optimum[r.id]))!.v;
      if (optimumValue - secondValue < 2) {
        continue dayTry;
      }
      if (researchers.every((r) => optimum[r.id] === baseline[r.id])) {
        continue dayTry;
      }
      // Solo son clave los hechos que cambian la asignación óptima si se ignoran
      const keyFacts = facts.filter((f) => {
        const without: DayPlanCore = {
          ...core,
          need: { ...need },
          pref: { ...pref },
          blocked: { ...blocked },
          overloaded: { ...overloaded },
        };
        const [kind, id] = f.fact.split(':');
        if (kind === 'pref') without.pref[id] = null;
        if (kind === 'blocked') without.blocked[id] = null;
        if (kind === 'overload') without.overloaded[id] = false;
        if (kind === 'need') without.need[id] = stations.find((s) => s.id === id)!.usual;
        const alt = bestAssignments(without, researchers, stations)[0].a;
        return researchers.some((r) => alt[r.id] !== optimum[r.id]);
      });
      if (!keyFacts.length) {
        continue dayTry;
      }
      // Motivos aceptables para quien se mueve
      const reasons: Record<string, Reason[]> = {};
      researchers.forEach((r) => {
        if (optimum[r.id] === baseline[r.id]) return;
        const own = keyFacts.some((f) => f.fact.endsWith(`:${r.id}`));
        const stationChanged = need[optimum[r.id]] !== stations.find((s) => s.id === optimum[r.id])!.usual;
        reasons[r.id] = own ? ['personal'] : stationChanged ? ['station', 'skills'] : ['cover', 'skills'];
      });
      // Una petición de Apoyar al día depende de saber quién tiene margen: solo una persona tiene la carga baja
      // y solo se sabe preguntándole por su estado. No puede ser a quien ya hay que preguntar por la asignación.
      const keyTargets = new Set(facts.filter((f) => keyFacts.includes(f)).map((f) => f.question.split(':')[0]));
      const spare = researchers.filter((r) => !overloaded[r.id] && !keyTargets.has(r.id));
      if (!spare.length) continue dayTry;
      const low = rng.pick(spare);
      researchers.forEach((r) => {
        if (!overloaded[r.id]) workload[r.id] = r.id === low.id ? 'low' : 'mid';
      });
      const support = makeSupport(rng, lang, researchers, stations, d, low.id);
      const nKeys = keyTargets.size + 1;
      if (nKeys > ISLAND_CONFIG.questionsPerDay[d] || nKeys < ISLAND_CONFIG.questionsPerDay[d] - ISLAND_CONFIG.slack[difficulty]) continue dayTry;
      // Preguntas y respuestas
      const questions: Question[] = [];
      const answers: Record<string, Answer> = {};
      researchers.forEach((r) => {
        questions.push({
          id: `${r.id}:state`,
          target: r.id,
          kind: 'state',
          label: t(`${r.name}: ¿cómo estás hoy?`, `${r.name}: how are you today?`),
        });
        questions.push({
          id: `${r.id}:contrib`,
          target: r.id,
          kind: 'contrib',
          label: t(`${r.name}: ¿dónde crees que aportas más hoy?`, `${r.name}: where do you think you add most today?`),
        });
        answers[`${r.id}:state`] = {
          text: overloaded[r.id]
            ? t(
                `Voy muy justo/a: arrastro trabajo de ayer y encima hoy toca la jornada más pesada en ${la(sName(baseline[r.id]))}. No podría con ella.`,
                `I'm stretched thin: I'm carrying work over from yesterday, and today is the heaviest day at the ${sName(baseline[r.id])}. I couldn't handle it.`,
              )
            : baseMood[r.id] === 'high'
              ? t('Bien, con energía para lo que haga falta.', 'Good, with energy for whatever is needed.')
              : t('Normal; un poco cansado/a, pero bien.', 'Fine; a bit tired, but OK.'),
          facts: overloaded[r.id] ? [`overload:${r.id}`, `mood:${r.id}`, `workload:${r.id}`] : [`mood:${r.id}`, `workload:${r.id}`],
        };
        answers[`${r.id}:contrib`] = {
          text: pref[r.id]
            ? t(
                `Hoy me gustaría estar en ${la(sName(pref[r.id]!))}: es donde más puedo aportar y aprender.`,
                `Today I'd like to be at the ${sName(pref[r.id]!)}: that's where I can add and learn the most.`,
              )
            : blocked[r.id]
              ? t(
                  `Hoy no puedo trabajar en ${la(sName(blocked[r.id]!))}: tengo una lesión leve. En cualquier otra estación, sin problema.`,
                  `I can't work at the ${sName(blocked[r.id]!)} today: I have a minor injury. Any other station is fine.`,
                )
              : t(
                  `Donde siempre: lo mío es el ${SKILL_LABEL[lang][r.skill1]}, aunque también me defiendo en ${SKILL_LABEL[lang][r.skill2]}.`,
                  `Same as usual: my thing is ${SKILL_LABEL[lang][r.skill1]}, though I can also handle ${SKILL_LABEL[lang][r.skill2]}.`,
                ),
          facts: pref[r.id] ? [`pref:${r.id}`, `skill2:${r.id}`] : blocked[r.id] ? [`blocked:${r.id}`] : [`skill2:${r.id}`],
        };
      });
      stations.forEach((s) => {
        questions.push({
          id: `${s.id}:need`,
          target: s.id,
          kind: 'need',
          label: t(`${s.name}: ¿qué necesitáis hoy?`, `${s.name}: what do you need today?`),
        });
        questions.push({
          id: `${s.id}:news`,
          target: s.id,
          kind: 'news',
          label: t(`${s.name}: ¿alguna novedad?`, `${s.name}: any news?`),
        });
        answers[`${s.id}:need`] = {
          text:
            need[s.id] !== s.usual
              ? t(
                  `Hoy, más que lo habitual, nos hace falta alguien con ${SKILL_LABEL[lang][need[s.id]]}.`,
                  `Today, more than usual, we need someone with ${SKILL_LABEL[lang][need[s.id]]}.`,
                )
              : t(`Lo de siempre: alguien con ${SKILL_LABEL[lang][s.usual]}.`, `The usual: someone with ${SKILL_LABEL[lang][s.usual]}.`),
          facts: need[s.id] !== s.usual ? [`need:${s.id}`] : [],
        };
        answers[`${s.id}:news`] = {
          text:
            heavy === s.id
              ? t('Hoy tenemos el día más pesado de la semana: mucha carga física.', 'Today is our heaviest day of the week: lots of physical work.')
              : rng.pick([
                  t('Ha llegado material nuevo, pero no cambia nada para hoy.', 'New equipment arrived, but nothing changes for today.'),
                  t('Sin novedades: todo funciona con normalidad.', 'No news: everything is running normally.'),
                  t('Mañana viene una visita del consejo de la isla.', 'Tomorrow the island council is visiting.'),
                ]),
          facts: heavy === s.id ? [`heavy:${s.id}`] : [],
        };
      });
      const goal =
        goalKind === 'people'
          ? t('Objetivo del día: atender las necesidades de los investigadores.', "Day's goal: look after the researchers' needs.")
          : goalKind === 'stations'
            ? t('Objetivo del día: cubrir lo que necesita cada estación.', "Day's goal: cover what each station needs.")
            : t('Objetivo del día: equilibrar las necesidades de las personas y de las estaciones.', "Day's goal: balance the needs of people and stations.");
      const briefing = heavy
        ? t(
            `Aviso del coordinador: hoy una de las estaciones tendrá una jornada especialmente pesada.`,
            `Coordinator note: one of the stations will have a particularly heavy day today.`,
          )
        : t('Aviso del coordinador: jornada normal; revisad las notas de la mañana.', 'Coordinator note: a normal day; check the morning notes.');
      // Notas de la mañana: una pista por cada dato clave (quién o qué estación) y una que no importa
      const morningNotes: string[] = [];
      for (const f of keyFacts) {
        const [kind, id] = f.fact.split(':');
        const who = kind === 'need' ? sName(id) : rName(id);
        if (kind === 'pref') morningNotes.push(t(`${who} comentó ayer que le apetecería probar algo distinto.`, `${who} mentioned yesterday they would like to try something different.`));
        else if (kind === 'blocked') morningNotes.push(t(`${who} pasó ayer por la enfermería.`, `${who} went to the first-aid room yesterday.`));
        else if (kind === 'overload') morningNotes.push(t(`${who} se quedó trabajando hasta muy tarde.`, `${who} stayed working until very late.`));
        else morningNotes.push(t(`${la(who)[0].toUpperCase()}${la(who).slice(1)} ha recibido un encargo fuera de lo habitual.`, `The ${who} has received an unusual request.`));
      }
      morningNotes.push(t(`${low.name} entregó ayer su informe antes de tiempo.`, `${low.name} handed in their report early yesterday.`));
      const noteTargets = new Set([...keyTargets, low.id]);
      const idle = researchers.filter((r) => !noteTargets.has(r.id));
      if (idle.length) {
        const herring = rng.pick(idle).name;
        morningNotes.push(
          rng.pick([
            t(`${herring} ha preguntado a qué hora es la cena.`, `${herring} asked what time dinner is.`),
            t(`${herring} ha traído pasteles para todo el equipo.`, `${herring} brought cakes for the whole team.`),
            t(`${herring} quiere organizar una excursión el fin de semana.`, `${herring} wants to organise a weekend trip.`),
          ]),
        );
      } else {
        const st = rng.pick(stations).name;
        morningNotes.push(t(`${la(st)[0].toUpperCase()}${la(st).slice(1)} ha cambiado la cafetera.`, `The ${st} has a new coffee machine.`));
      }
      const shuffledNotes = rng.shuffle(morningNotes);
      days.push({
        day: d + 1,
        goal,
        goalKind,
        briefing,
        morningNotes: shuffledNotes,
        budget: ISLAND_CONFIG.questionsPerDay[d],
        need,
        heavy,
        pref,
        blocked,
        overloaded,
        baseMood,
        workload,
        questions,
        answers,
        keyFacts,
        baseline,
        optimum,
        optimumValue,
        secondValue,
        reasons,
        support,
        reflectDimension: d === 1 ? 'workload' : 'mood',
      });
      break;
    }
  }
  return {
    seed,
    lang,
    difficulty,
    onboarding: makeOnboarding(seed, lang, researchers),
    island: t('Isla Calma', 'Calm Isle'),
    mission: t(
      'Eres la persona que coordina la estación de investigación de la Isla Calma durante 3 días. Cada día puedes hacer unas pocas preguntas, decides dónde trabaja cada investigador, respondes a sus peticiones de apoyo y valoras cómo está el equipo.',
      'You coordinate the research station on Calm Isle for 3 days. Each day you can ask a few questions, decide where each researcher works, respond to their support requests and assess how the team is doing.',
    ),
    researchers,
    stations,
    days,
  };
}

// ---------------------------------------------------------------- onboarding

/** Orden defendible: qué hay que conseguir → cómo funciona la jornada → quién es el equipo → contexto. */
export const ONBOARDING_BEST: OnboardingTopic['id'][] = ['goal', 'rules', 'team', 'context'];

function makeOnboarding(seed: string, lang: Lang, researchers: Researcher[]): Onboarding {
  // Generador aparte: no cambia el resto del escenario de cada semilla
  const rng = createRng(`sfl-island-onboarding|${seed}`);
  const t = T(lang);
  const [q1, q2, q3] = ISLAND_CONFIG.questionsPerDay;
  const context = rng.pick([
    {
      question: t('¿Cómo empezó la estación de investigación?', 'How did the research station start?'),
      answer: t(
        'Se fundó hace doce años como observatorio de aves marinas y desde entonces ha ido sumando laboratorios y equipos.',
        'It was founded twelve years ago as a seabird observatory and has added labs and teams ever since.',
      ),
    },
    {
      question: t('¿Cómo es la vida en la isla?', 'What is life like on the island?'),
      answer: t(
        'Hay un pequeño puerto, un barco de suministros a la semana y un centro de visitantes que solo abre en verano.',
        'There is a small harbour, one supply boat a week and a visitor centre that only opens in summer.',
      ),
    },
  ]);
  const topics: OnboardingTopic[] = [
    {
      id: 'goal',
      question: t('¿Qué tiene que conseguir el proyecto?', 'What does the project need to achieve?'),
      answer: t(
        'Mantener en marcha las 4 estaciones durante 3 días y cuidar del equipo. Cada día tendrá su propio objetivo: unas veces mandan las personas, otras las estaciones y otras el equilibrio entre ambas.',
        'Keep the 4 stations running for 3 days while looking after the team. Each day has its own goal: sometimes people come first, sometimes the stations, and sometimes the balance between them.',
      ),
    },
    {
      id: 'rules',
      question: t('¿Cómo funciona cada jornada?', 'How does each day work?'),
      answer: t(
        `Cada mañana puedes hacer pocas preguntas: ${q1} el primer día, ${q2} el segundo y ${q3} el tercero. Cada persona o estación responde una sola vez al día y las notas se borran por la noche. Después decides dónde trabaja cada uno, atiendes sus peticiones y valoras cómo está el equipo.`,
        `Each morning you can ask a few questions: ${q1} on day one, ${q2} on day two and ${q3} on day three. Each person or station answers only once a day and notes are cleared overnight. Then you decide where everyone works, handle their requests and assess how the team is doing.`,
      ),
    },
    {
      id: 'team',
      question: t('¿Quién forma el equipo?', 'Who is on the team?'),
      answer: t(
        `Cuatro investigadores: ${researchers.map((r) => `${r.name} (${r.title.toLowerCase()})`).join(', ')}. Cada uno tiene una especialidad, otra habilidad en la que se defiende y un punto débil.`,
        `Four researchers: ${researchers.map((r) => `${r.name} (${r.title.toLowerCase()})`).join(', ')}. Each has a specialty, a second skill they can handle and a weak spot.`,
      ),
    },
    { id: 'context', ...context },
  ];
  return {
    topics: rng.shuffle(topics),
    best: ONBOARDING_BEST,
    why: 'Primero, qué hay que conseguir, porque da sentido a todo lo demás. Después, cómo funciona la jornada: sus reglas (pocas preguntas al día y notas que se borran por la noche) condicionan tu primera decisión del día 1. Luego, el equipo, que además ves en el panel. Y al final el contexto, que no cambia ninguna decisión.',
  };
}

// ---------------------------------------------------------------- peticiones de apoyo

type Opt = { es: string; en: string; q: SupportOption['quality']; why: string; who?: string };
type Variant = { title: [string, string]; text: [string, string]; options: Opt[] };

const o = (es: string, en: string, q: SupportOption['quality'], why: string, who?: string): Opt => ({ es, en, q, why, who });

/** Variantes de cada situación. Las opciones tienen longitudes parecidas: la mejor no se delata por ser la más larga. */
function variants(type: SupportType, from: Researcher, other: Researcher, st: Station, low: Researcher, busy: Researcher, lang: Lang): Variant[] {
  const S = la(STATIONS.es[st.usual]);
  const E = `the ${STATIONS.en[st.usual]}`;
  void lang;
  switch (type) {
    case 'conflict':
      return [
        {
          title: [`Desacuerdo con ${other.name}`, `Disagreement with ${other.name}`],
          text: [
            `${from.name}: «${other.name} y yo no nos ponemos de acuerdo sobre el método de muestreo y llevamos toda la mañana discutiendo. ¿Qué hacemos?»`,
            `${from.name}: "${other.name} and I can't agree on the sampling method and we've been arguing all morning. What should we do?"`,
          ],
          options: [
            o('Reunirlos un cuarto de hora, que cada uno defienda su método con datos y acordar un criterio.', 'Meet them for 15 minutes, have each defend their method with data, and agree a criterion.', 'best', 'Escucha a las dos partes y resuelve con un criterio basado en datos.'),
            o('Elegir tú el método que te parezca más sólido y explicarles a los dos por qué lo has decidido así.', 'Pick the method that seems soundest to you and explain to both of them why you decided that way.', 'ok', 'Desbloquea rápido y razona la decisión, pero sin escuchar a las partes: puede dejar resentimiento.'),
            o('Que lo resuelvan entre ellos.', 'Let them sort it out between themselves.', 'poor', 'Evita el conflicto: lo más probable es que siga creciendo.'),
          ],
        },
        {
          title: [`Un resultado compartido`, `A shared result`],
          text: [
            `${from.name}: «${other.name} ha presentado al coordinador un resultado que hicimos juntos como si fuera solo suyo. Me ha sentado mal.»`,
            `${from.name}: "${other.name} presented a result we did together to the coordinator as if it were theirs alone. I'm upset."`,
          ],
          options: [
            o('Hablar con los dos a la vez, aclarar qué hizo cada uno y acordar cómo firmar lo compartido.', 'Talk to both together, clarify who did what and agree how to credit shared work.', 'best', 'Aborda el conflicto con las dos partes y deja una regla para la próxima vez.'),
            o(`Hablar en privado con ${other.name} para que reconozca la parte de ${from.name}.`, `Talk privately to ${other.name} so they acknowledge ${from.name}'s part.`, 'ok', 'Corrige el agravio, pero sin escuchar a las dos partes juntas ni acordar cómo evitarlo.'),
            o('Restarle importancia: lo que cuenta es el resultado del equipo, no quién lo firma.', "Play it down: what matters is the team's result, not whose name is on it.", 'poor', 'Invalida la queja y deja el conflicto abierto.'),
          ],
        },
      ];
    case 'contradiction':
      return [
        {
          title: ['Datos que no cuadran', "Data that doesn't add up"],
          text: [
            `${from.name}: «Según ${other.name}, ${S} ya terminó su tarea, pero el registro de la estación dice que va por la mitad. ¿Con qué me quedo?»`,
            `${from.name}: "According to ${other.name}, ${E} has already finished its task, but the station's log says it's only halfway. Which do I trust?"`,
          ],
          options: [
            o(`Comprobarlo con ${S} antes de planificar nada.`, `Check with ${E} before planning anything.`, 'best', 'Ante información contradictoria, verifica en la fuente primaria antes de decidir.'),
            o('Fiarse del registro escrito, que suele estar al día, y planificar con lo que dice.', 'Trust the written log, which is usually up to date, and plan with what it says.', 'ok', 'El registro es más fiable que un comentario, pero no se verifica.'),
            o(`Fiarse de ${other.name}, que estuvo allí ayer, y seguir con el plan previsto.`, `Trust ${other.name}, who was there yesterday, and carry on with the plan.`, 'poor', 'Decide con la fuente menos fiable y sin comprobar.'),
          ],
        },
        {
          title: ['Dos sensores, dos cifras', 'Two sensors, two readings'],
          text: [
            `${from.name}: «Los dos sensores de ${S} dan temperaturas que difieren 4 grados. ¿Cuál uso para el informe?»`,
            `${from.name}: "The two sensors at ${E} give temperatures 4 degrees apart. Which one do I use for the report?"`,
          ],
          options: [
            o('Revisar la calibración de los dos y, mientras, dar el rango en lugar de una cifra.', 'Check both calibrations and, meanwhile, report the range instead of one number.', 'best', 'Busca la causa de la discrepancia y no oculta la incertidumbre mientras tanto.'),
            o('Usar la media de los dos y anotar la discrepancia al pie del informe.', 'Use the average of the two and note the discrepancy in a footnote.', 'ok', 'Es transparente, pero promedia sin saber cuál de los dos falla.'),
            o('Usar el sensor cuyo valor encaja mejor con lo que esperábamos encontrar.', 'Use the sensor whose value best fits what we expected to find.', 'poor', 'Elige el dato por la hipótesis, no por su fiabilidad.'),
          ],
        },
      ];
    case 'dependency':
      return [
        {
          title: ['Esperando resultados', 'Waiting for results'],
          text: [
            `${from.name}: «No puedo avanzar hasta que ${S} me pase sus resultados, y nadie sabe cuándo estarán.»`,
            `${from.name}: "I can't move forward until ${E} sends me their results, and nobody knows when they'll be ready."`,
          ],
          options: [
            o(`Pedir a ${S} una fecha concreta y, mientras, darle otra tarea.`, `Ask ${E} for a firm date and meanwhile give them another task.`, 'best', 'Aclara la dependencia y evita el tiempo muerto.'),
            o(`Pedir a ${S} que pase esos resultados por delante de lo que esté haciendo.`, `Ask ${E} to put those results ahead of whatever they're doing now.`, 'ok', 'Presiona a otro equipo sin conocer sus prioridades y no evita el tiempo muerto.'),
            o('Que espere: ya llegarán.', "Tell them to wait: they'll come.", 'poor', 'Acepta el tiempo muerto sin hacer nada.'),
          ],
        },
        {
          title: ['Falta una pieza', 'A missing part'],
          text: [
            `${from.name}: «Para calibrar el equipo de ${S} necesito una pieza que llega en el barco del jueves.»`,
            `${from.name}: "To calibrate the equipment at ${E} I need a part that arrives on Thursday's boat."`,
          ],
          options: [
            o('Calibrar hoy a mano, aunque sea más lento, y afinar el jueves con la pieza.', "Calibrate by hand today, even if slower, and fine-tune on Thursday with the part.", 'best', 'Mantiene el trabajo en marcha con una solución provisional y un plan para completarla.'),
            o('Pasar esa calibración al jueves y adelantar otras tareas de la estación.', 'Move that calibration to Thursday and bring other station tasks forward.', 'ok', 'Evita el tiempo muerto, pero retrasa los datos de la estación tres días.'),
            o('Saltarse la calibración y usar los datos tal como salen.', 'Skip the calibration and use the data as it comes.', 'poor', 'Sacrifica la calidad de los datos para no esperar.'),
          ],
        },
      ];
    case 'wellbeing':
      return [
        {
          title: ['No me encuentro bien', "I'm not feeling great"],
          text: [
            `${from.name}: «Llevo unos días durmiendo mal y me cuesta concentrarme.»`,
            `${from.name}: "I've been sleeping badly for a few days and I find it hard to concentrate."`,
          ],
          options: [
            o('Hablarlo en privado, aligerar su tarea de hoy y volver a hablarlo mañana.', "Talk in private, lighten today's task and check in again tomorrow.", 'best', 'Atiende el bienestar con un ajuste concreto y seguimiento.'),
            o('Darle el resto del día libre para que descanse y vuelva mañana con energía.', 'Give them the rest of the day off to rest and come back tomorrow with energy.', 'ok', 'Bienintencionado, pero sin hablar de la causa ni planificar el seguimiento.'),
            o('Pedirle que aguante hasta el final de la misión.', 'Ask them to hang on until the end of the mission.', 'poor', 'Ignora el problema de bienestar.'),
          ],
        },
        {
          title: ['Me siento al margen', 'I feel left out'],
          text: [
            `${from.name}: «En las reuniones nadie me pregunta y siento que mi trabajo no cuenta.»`,
            `${from.name}: "Nobody asks me anything in meetings and I feel my work doesn't count."`,
          ],
          options: [
            o('Pedirle que presente sus avances en la reunión de mañana.', 'Ask them to present their progress at tomorrow’s meeting.', 'best', 'Le da visibilidad real con una acción concreta.'),
            o('Decirle que su trabajo es muy valioso para el equipo y que no se preocupe por eso.', 'Tell them their work is very valuable to the team and not to worry about it.', 'ok', 'Reconforta, pero no cambia nada de lo que causa el malestar.'),
            o('Explicarle que en las reuniones habla quien tiene algo urgente.', 'Explain that in meetings whoever has something urgent does the talking.', 'poor', 'Justifica la situación e ignora la preocupación.'),
          ],
        },
      ];
    case 'delegate':
      return [
        {
          title: ['¿Decido yo?', 'Should I decide?'],
          text: [
            `${from.name}: «Hay que elegir proveedor para las piezas de ${S}. ¿Lo decido yo o lo decides tú?»`,
            `${from.name}: "We need to choose a supplier for the parts at ${E}. Should I decide, or will you?"`,
          ],
          options: [
            o(`Que lo decida ${from.name}, con un presupuesto máximo, y te informe.`, `Let ${from.name} decide within a maximum budget and report back.`, 'best', 'Delega en quien tiene el conocimiento, con límites claros.'),
            o('Pedirle tres opciones comparadas por precio y plazo y decidir tú.', 'Ask for three options compared on price and lead time, and decide yourself.', 'ok', 'Funciona, pero retrasa la decisión y no aprovecha su conocimiento.'),
            o('Elegir tú el proveedor más barato, sin consultar a nadie.', 'Pick the cheapest supplier yourself, without asking anyone.', 'poor', 'Decide sin información ni consultar a quien sabe.'),
          ],
        },
        {
          title: ['Presentación al consejo', 'Presentation to the council'],
          text: [
            `${from.name}: «El consejo de la isla quiere ver los avances el viernes. ¿Preparo yo la presentación?»`,
            `${from.name}: "The island council wants to see progress on Friday. Shall I prepare the presentation?"`,
          ],
          options: [
            o('Sí, que la prepare y repasarla juntos el jueves.', 'Yes, let them prepare it and review it together on Thursday.', 'best', 'Delega con un punto de control antes de la entrega.'),
            o(`Prepararla tú, que conoces mejor al consejo, y pedirle a ${from.name} los datos.`, `Prepare it yourself, as you know the council better, and ask ${from.name} for the data.`, 'ok', 'Asegura el resultado, pero desaprovecha la oferta y te carga a ti.'),
            o('Pedir al consejo que la aplace hasta que acabe la misión.', 'Ask the council to postpone it until the mission ends.', 'poor', 'Esquiva un compromiso con un stakeholder sin motivo.'),
          ],
        },
      ];
    case 'overload':
      return [
        {
          title: ['Demasiado trabajo', 'Too much work'],
          text: [
            `${from.name}: «Tengo tres informes pendientes y no llego. ¿Me ayudas a priorizar?»`,
            `${from.name}: "I have three reports due and I won't make it. Can you help me prioritise?"`,
          ],
          options: [
            o(`Ordenar juntos los informes por plazo y pasar el menos urgente a ${low.name}.`, `Rank the reports by deadline together and hand the least urgent to ${low.name}.`, 'best', `Prioriza y pasa trabajo a ${low.name}, que era quien tenía margen.`, low.id),
            o(`Ordenar juntos los informes por plazo y pasar el menos urgente a ${busy.name}.`, `Rank the reports by deadline together and hand the least urgent to ${busy.name}.`, 'poor', `Prioriza bien, pero ${busy.name} no tenía margen: le pasas trabajo que no puede asumir.`, busy.id),
            o('Ampliar un día el plazo del informe menos urgente.', 'Extend the deadline of the least urgent report by a day.', 'ok', 'Sin saber quién tenía margen, es lo prudente: alivia sin cargar a nadie, pero no aprovecha la capacidad libre del equipo.'),
            o('Que haga lo que pueda y se quede más horas.', 'Tell them to do what they can and stay late.', 'poor', 'Ignora la sobrecarga y empeora el bienestar.'),
          ],
        },
        {
          title: ['No llego a todo', "I can't do it all"],
          text: [
            `${from.name}: «Me han pedido repetir las mediciones de ayer y además tengo todo lo de hoy. No llego.»`,
            `${from.name}: "I've been asked to redo yesterday's measurements on top of everything for today. I can't make it."`,
          ],
          options: [
            o(`Mantener lo de hoy y que ${low.name} repita las mediciones.`, `Keep today's work and have ${low.name} redo the measurements.`, 'best', `Pasa la tarea extra a ${low.name}, que era quien tenía margen.`, low.id),
            o(`Mantener lo de hoy y que ${busy.name} repita las mediciones.`, `Keep today's work and have ${busy.name} redo the measurements.`, 'poor', `${busy.name} no tenía margen: le pasas trabajo que no puede asumir.`, busy.id),
            o('Retrasar un día la repetición y avisar a quien la pidió.', 'Delay the re-run by a day and tell whoever asked for it.', 'ok', 'Sin saber quién tenía margen, es lo prudente, pero retrasa un trabajo que otro miembro del equipo podía hacer hoy.'),
            o('Pedirle que haga las dos cosas hoy, aunque salga tarde.', 'Ask them to do both today, even if they finish late.', 'poor', 'Ignora la sobrecarga y empeora el bienestar.'),
          ],
        },
      ];
    case 'capacity':
      return [
        {
          title: ['Visita del consejo', 'Council visit'],
          text: [
            `${from.name}: «Esta tarde llega una visita del consejo y alguien tiene que acompañarla tres horas. ¿Quién va?»`,
            `${from.name}: "A council delegation arrives this afternoon and someone has to accompany them for three hours. Who goes?"`,
          ],
          options: [
            o(`Que vaya ${low.name} y siga mañana con lo suyo.`, `Send ${low.name}, who picks up their own work tomorrow.`, 'best', `${low.name} era quien tenía margen: la visita no retrasa nada importante.`, low.id),
            o(`Que vaya ${busy.name} y siga mañana con lo suyo.`, `Send ${busy.name}, who picks up their own work tomorrow.`, 'poor', `${busy.name} no tenía margen: la visita retrasa su trabajo.`, busy.id),
            o('Ir tú y que el equipo siga con su plan.', 'Go yourself and let the team stick to its plan.', 'ok', 'No carga a nadie, pero te quita tres horas de coordinación; con la información, podías enviar a quien tenía margen.'),
            o(`Que vaya ${from.name}, que es quien ha avisado.`, `Send ${from.name}, since they raised it.`, 'poor', 'Elige por quién avisa, no por quién tiene margen.'),
          ],
        },
        {
          title: ['Inventario urgente', 'Urgent inventory'],
          text: [
            `${from.name}: «Hay que revisar a fondo el inventario de ${S} antes del viernes. ¿A quién se lo encargo?»`,
            `${from.name}: "Someone has to do a full inventory check at ${E} before Friday. Who should I give it to?"`,
          ],
          options: [
            o(`Encargárselo a ${low.name} esta misma tarde.`, `Give it to ${low.name} this afternoon.`, 'best', `${low.name} era quien tenía margen para asumirlo.`, low.id),
            o(`Encargárselo a ${busy.name} esta misma tarde.`, `Give it to ${busy.name} this afternoon.`, 'poor', `${busy.name} no tenía margen: le cargas más trabajo.`, busy.id),
            o('Dejarlo para el jueves, cuando haya menos trabajo.', 'Leave it for Thursday, when there is less work.', 'ok', 'Sin saber quién tenía margen, es razonable, pero lo deja para el final y sin margen de error.'),
            o('Repartirlo entre los cuatro, un trozo a cada uno.', 'Split it among all four, a piece each.', 'poor', 'Trocea sin criterio y carga también a quien no tiene margen.'),
          ],
        },
      ];
  }
}

/** Situaciones que no dependen de lo explorado; cada día salen 3 de ellas más una que sí depende. */
const FREE_TYPES: SupportType[] = ['conflict', 'contradiction', 'dependency', 'wellbeing', 'delegate'];
const LINKED_TYPES: SupportType[] = ['overload', 'capacity'];

function makeSupport(rng: Rng, lang: Lang, researchers: Researcher[], stations: Station[], d: number, lowId: string): SupportRequest[] {
  const t = T(lang);
  const low = researchers.find((r) => r.id === lowId)!;
  const linked = rng.pick(LINKED_TYPES);
  const types = [linked, ...rng.shuffle(FREE_TYPES).slice(0, ISLAND_CONFIG.supportPerDay - 1)];
  // Cada investigador plantea una petición; la que depende de quién tiene margen no la plantea esa persona
  const linkedFrom = rng.pick(researchers.filter((r) => r.id !== lowId));
  const order = [linkedFrom, ...rng.shuffle(researchers.filter((r) => r.id !== linkedFrom.id))];
  const urgentIdx = rng.int(0, types.length - 1);
  const reqs = types.map((type, i): SupportRequest => {
    const from = order[i];
    const other = rng.pick(researchers.filter((r) => r.id !== from.id));
    const st = rng.pick(stations);
    const busy = rng.pick(researchers.filter((r) => r.id !== lowId && r.id !== from.id));
    const v = rng.pick(variants(type, from, other, st, low, busy, lang));
    return {
      id: `d${d}-q${i}`,
      from: from.id,
      type,
      urgent: i === urgentIdx,
      title: t(...v.title),
      text: t(...v.text),
      options: rng.shuffle(v.options).map((x) => ({ text: t(x.es, x.en), quality: x.q, why: x.why, ...(x.who ? { who: x.who } : {}) })),
      ...(LINKED_TYPES.includes(type)
        ? { evidence: { question: `${lowId}:state`, who: lowId, explanation: `${low.name} tenía margen para más trabajo (y el resto, no)` } }
        : {}),
    };
  });
  // Se muestran en un orden que no delata cuál es la enlazada
  return rng.shuffle(reqs).map((r, i) => ({ ...r, id: `d${d}-q${i}` }));
}

/** Preguntas clave del día: las que cambian la asignación óptima y la que decide la petición de Apoyar enlazada. */
export function dayKeyQuestions(day: Pick<DayPlan, 'keyFacts' | 'support'>): string[] {
  return [...new Set([...day.keyFacts.map((f) => f.question), ...day.support.flatMap((r) => (r.evidence ? [r.evidence.question] : []))])];
}

// ---------------------------------------------------------------- lo que sabe el jugador

/** Situación del día tal como la conoce quien ha hecho estas preguntas (lo no preguntado se supone habitual). */
export function beliefCore(sc: IslandScenario, d: number, asked: string[]): DayPlanCore {
  const day = sc.days[d];
  const revealed = new Set(asked.flatMap((q) => day.answers[q]?.facts ?? []));
  const need: Record<string, Skill> = {};
  const pref: Record<string, string | null> = {};
  const blocked: Record<string, string | null> = {};
  const overloaded: Record<string, boolean> = {};
  sc.stations.forEach((s) => (need[s.id] = revealed.has(`need:${s.id}`) ? day.need[s.id] : s.usual));
  sc.researchers.forEach((r) => {
    pref[r.id] = revealed.has(`pref:${r.id}`) ? day.pref[r.id] : null;
    blocked[r.id] = revealed.has(`blocked:${r.id}`) ? day.blocked[r.id] : null;
    overloaded[r.id] = revealed.has(`overload:${r.id}`);
  });
  return { need, pref, blocked, overloaded, heavy: day.heavy, goalKind: day.goalKind };
}

// ---------------------------------------------------------------- validación

export interface IslandIssue {
  code: string;
  message: string;
}

export function validateIsland(sc: IslandScenario): IslandIssue[] {
  const out: IslandIssue[] = [];
  const add = (code: string, message: string) => out.push({ code, message });
  if (new Set(sc.researchers.map((r) => r.name)).size !== sc.researchers.length) add('NAMES', 'Hay nombres de investigador repetidos.');
  if (new Set(sc.stations.map((s) => s.name)).size !== sc.stations.length) add('STATIONS', 'Hay estaciones repetidas.');
  if (sc.days.length !== 3) add('DAYS', 'Debe haber 3 días.');
  const ob = sc.onboarding;
  if (ob.topics.length !== 4 || new Set(ob.topics.map((x) => x.id)).size !== 4 || [...ob.best].sort().join() !== ob.topics.map((x) => x.id).sort().join())
    add('ONBOARDING', 'El onboarding debe tener 4 preguntas distintas y un orden óptimo que las incluya todas.');
  sc.days.forEach((d) => {
    const ranked = bestAssignments(d, sc.researchers, sc.stations);
    const best = ranked[0];
    const tie = ranked.filter((x) => x.v === best.v).length > 1;
    if (tie) add('OPTIMUM', `Día ${d.day}: hay más de una asignación óptima.`);
    if (best.v - d.secondValue < 2) add('MARGIN', `Día ${d.day}: la mejor asignación no se distingue con claridad de la segunda.`);
    if (sc.researchers.some((r) => best.a[r.id] !== d.optimum[r.id]))
      add('OPTIMUM', `Día ${d.day}: la asignación óptima guardada no coincide con la calculada.`);
    if (sc.researchers.every((r) => d.optimum[r.id] === d.baseline[r.id]))
      add('BASELINE', `Día ${d.day}: la asignación óptima es la que sugieren los cargos visibles (no hace falta explorar).`);
    if (!d.keyFacts.length) add('KEYS', `Día ${d.day}: ningún dato oculto cambia la asignación.`);
    // Las notas de la mañana deben señalar a cada persona o estación a la que hay que preguntar
    for (const q of dayKeyQuestions(d)) {
      const target = q.split(':')[0];
      const name = sc.researchers.find((r) => r.id === target)?.name ?? sc.stations.find((st) => st.id === target)?.name ?? target;
      const lower = (x: string) => x.toLowerCase();
      if (!(d.morningNotes ?? []).some((n) => lower(n).includes(lower(name)))) add('NOTES', `Día ${d.day}: ninguna nota de la mañana señala a ${name}.`);
    }
    // Los datos clave (asignación y petición enlazada) deben caber en el presupuesto, una pregunta por objetivo y día,
    // y dejar como mucho `slack` preguntas libres: malgastar preguntas tiene que costar información.
    const keyQuestions = new Set(d.keyFacts.map((f) => f.question));
    const allKeys = dayKeyQuestions(d);
    const targets = new Set(allKeys.map((q) => q.split(':')[0]));
    if (allKeys.length > d.budget) add('BUDGET', `Día ${d.day}: hacen falta ${allKeys.length} preguntas clave y solo hay ${d.budget}.`);
    if (targets.size !== allKeys.length) add('BUDGET', `Día ${d.day}: dos datos clave requieren preguntar dos veces a la misma persona o estación.`);
    if (allKeys.length < d.budget - ISLAND_CONFIG.slack[sc.difficulty])
      add('SLACK', `Día ${d.day}: sobran demasiadas preguntas (${d.budget - allKeys.length}); malgastarlas no costaría nada.`);
    for (const f of d.keyFacts)
      if (!d.answers[f.question]?.facts.includes(f.fact)) add('ANSWER', `Día ${d.day}: la pregunta ${f.question} no revela ${f.fact}.`);
    // Con solo las preguntas clave se llega a la asignación óptima (la información cabe en el presupuesto y basta)
    const informed = bestAssignments(beliefCore(sc, d.day - 1, [...keyQuestions]), sc.researchers, sc.stations)[0].a;
    if (sc.researchers.some((r) => informed[r.id] !== d.optimum[r.id])) add('SUFFICIENT', `Día ${d.day}: con las preguntas clave no se deduce la asignación óptima.`);
    // Sin preguntar nada, la mejor asignación aparente no es la óptima (explorar es necesario)
    const blind = bestAssignments(beliefCore(sc, d.day - 1, []), sc.researchers, sc.stations)[0].a;
    if (sc.researchers.every((r) => blind[r.id] === d.optimum[r.id])) add('BLIND', `Día ${d.day}: se acierta la asignación sin explorar.`);
    // Peticiones de apoyo: una mejor respuesta clara y al menos una aceptable
    if (d.support.length !== ISLAND_CONFIG.supportPerDay) add('SUPPORT', `Día ${d.day}: debe haber ${ISLAND_CONFIG.supportPerDay} peticiones.`);
    for (const req of d.support) {
      if (req.options.filter((o) => o.quality === 'best').length !== 1) add('SUPPORT', `${req.id}: debe haber exactamente una mejor respuesta.`);
      if (!req.options.some((o) => o.quality === 'ok')) add('SUPPORT', `${req.id}: falta una alternativa aceptable.`);
      if (new Set(req.options.map((o) => o.text)).size !== req.options.length) add('SUPPORT', `${req.id}: hay opciones repetidas.`);
    }
    if (d.support.filter((r) => r.urgent).length !== 1) add('SUPPORT', `Día ${d.day}: debe haber exactamente una petición urgente.`);
    // Petición enlazada: su mejor respuesta solo se justifica con lo explorado (quién tiene margen)
    const linked = d.support.filter((r) => r.evidence);
    if (linked.length !== 1) add('EVIDENCE', `Día ${d.day}: debe haber exactamente una petición que dependa de lo explorado.`);
    for (const req of linked) {
      const ev = req.evidence!;
      const best = req.options.find((o) => o.quality === 'best');
      if (best?.who !== ev.who) add('EVIDENCE', `${req.id}: la mejor respuesta no pasa el trabajo a quien tiene margen.`);
      if (!d.answers[ev.question]?.facts.includes(`workload:${ev.who}`)) add('EVIDENCE', `${req.id}: la pregunta clave no revela la carga de trabajo.`);
      if (effectiveWorkload(sc, d.day - 1, ev.who) !== 'low') add('EVIDENCE', `${req.id}: quien recibe el trabajo no tiene margen.`);
      for (const opt of req.options)
        if (opt.who && opt.who !== ev.who && effectiveWorkload(sc, d.day - 1, opt.who) === 'low') add('EVIDENCE', `${req.id}: hay dos personas con margen.`);
      if (!req.options.some((x) => x.quality === 'ok' && !x.who)) add('EVIDENCE', `${req.id}: falta una respuesta aceptable para quien no tiene la información.`);
      if (req.from === ev.who) add('EVIDENCE', `${req.id}: quien pide ayuda no puede ser quien tiene margen.`);
    }
  });
  // En los 3 días aparecen al menos un conflicto, una sobrecarga y una información contradictoria
  const types = new Set(sc.days.flatMap((d) => d.support.map((r) => r.type)));
  for (const ty of ['conflict', 'overload', 'contradiction'] as const)
    if (!types.has(ty)) add('SITUATIONS', `Ningún día plantea una situación de tipo «${ty}».`);
  return out;
}

// ---------------------------------------------------------------- respuestas y estado efectivo

export interface IslandDayAnswer {
  asked: string[]; // ids de pregunta, en orden
  /** Segundos desde el inicio de la fase Explorar en que se hizo cada pregunta. */
  askedAt: number[];
  assign: Record<string, string>;
  reasons: Record<string, Reason | ''>;
  support: Record<string, number>; // id de petición -> índice de opción
  supportOrder: string[];
  reflect: Record<string, Level | 'unknown' | ''>;
  timeSec: number;
}

/** Respuesta del onboarding: orden elegido (ids) y segundos dedicados. `order` vacío = no se confirmó. */
export interface IslandOnboardingAnswer {
  order: OnboardingTopic['id'][];
  timeSec: number;
}

export const emptyIslandDay = (sc: IslandScenario, d: number): IslandDayAnswer => ({
  asked: [],
  askedAt: [],
  assign: { ...sc.days[d].baseline },
  reasons: {},
  support: {},
  supportOrder: [],
  reflect: {},
  timeSec: 0,
});

/** Petición de apoyo propia del día que delata su estado (sobrecarga o bienestar). */
export function stateRequest(sc: IslandScenario, d: number, rid: string) {
  return sc.days[d].support.find((r) => r.from === rid && (r.type === 'overload' || r.type === 'wellbeing'));
}

/** Ánimo al empezar el día: el de base, ajustado por cómo se atendió su petición del día anterior y por lo que le preocupa hoy. */
export function effectiveMood(sc: IslandScenario, answers: IslandDayAnswer[], d: number, rid: string): Level {
  const day = sc.days[d];
  if (day.overloaded[rid] || stateRequest(sc, d, rid)) return 'low';
  const base = day.baseMood[rid];
  if (d === 0) return base;
  const prevReq = sc.days[d - 1].support.find((r) => r.from === rid);
  const chosen = prevReq ? answers[d - 1]?.support[prevReq.id] : undefined;
  if (!prevReq || chosen == null) return base;
  const q = prevReq.options[chosen]?.quality;
  if (q === 'best') return 'high';
  if (q === 'poor') return 'low';
  return base;
}

/** Carga de trabajo al empezar el día. */
export function effectiveWorkload(sc: IslandScenario, d: number, rid: string): Level {
  const day = sc.days[d];
  if (day.overloaded[rid] || stateRequest(sc, d, rid)?.type === 'overload') return 'high';
  return day.workload[rid];
}

/** Valor verdadero de la dimensión de Reflexión al final del día (la mejor respuesta a su petición le alivia). */
export function reflectTruth(sc: IslandScenario, answers: IslandDayAnswer[], d: number, rid: string): Level {
  const day = sc.days[d];
  const req = stateRequest(sc, d, rid);
  const chosen = req ? answers[d]?.support[req.id] : undefined;
  const helped = !!req && chosen != null && req.options[chosen]?.quality === 'best';
  if (day.reflectDimension === 'workload') {
    if (day.overloaded[rid]) return 'high';
    if (req?.type === 'overload') return helped ? 'mid' : 'high';
    return day.workload[rid];
  }
  if (day.overloaded[rid]) return 'low';
  if (req) return helped ? 'mid' : 'low';
  return effectiveMood(sc, answers, d, rid);
}

/** Nivel de la dimensión de Reflexión al EMPEZAR el día (lo que contaría si le preguntas por la mañana). */
export function reflectStart(sc: IslandScenario, answers: IslandDayAnswer[], d: number, rid: string): Level {
  return sc.days[d].reflectDimension === 'workload' ? effectiveWorkload(sc, d, rid) : effectiveMood(sc, answers, d, rid);
}

/** ¿Tenía el jugador pruebas sobre esta persona ese día? (preguntó por su estado o atendió su petición). */
export function hadEvidence(sc: IslandScenario, ans: IslandDayAnswer, d: number, rid: string): boolean {
  if (ans.asked.includes(`${rid}:state`)) return true;
  const req = stateRequest(sc, d, rid);
  return !!req && ans.support[req.id] != null;
}

export function answerText(sc: IslandScenario, answers: IslandDayAnswer[], d: number, qid: string): string {
  const [target, kind] = qid.split(':');
  const base = sc.days[d].answers[qid].text;
  if (kind !== 'state' || sc.days[d].overloaded[target]) return base;
  const en = sc.lang === 'en';
  const mood = effectiveMood(sc, answers, d, target);
  const load = effectiveWorkload(sc, d, target);
  const moodText =
    mood === 'low'
      ? en
        ? 'Honestly, not great: something is weighing on me'
        : 'La verdad, no muy bien: hay algo que me pesa'
      : mood === 'high'
        ? en
          ? 'Good, with energy for whatever is needed'
          : 'Bien, con energía para lo que haga falta'
        : en
          ? 'Fine; a bit tired, but OK'
          : 'Normal; un poco cansado/a, pero bien';
  const loadText =
    load === 'high'
      ? en
        ? 'and I have far more work on my plate than I can handle.'
        : 'y tengo bastante más trabajo del que puedo sacar.'
      : load === 'low'
        ? en
          ? 'and I have room for more work.'
          : 'y tengo margen para más trabajo.'
        : en
          ? "and I'm at capacity: I can handle my own work, but I have no room for more."
          : 'y voy justo/a: llevo bien lo mío, pero no tengo margen para más.';
  return `${moodText}, ${loadText}`;
}
