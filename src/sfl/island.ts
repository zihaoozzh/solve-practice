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
};

export interface Researcher {
  id: string;
  name: string;
  title: string;
  skill1: Skill;
  skill2: Skill;
  /** Dominio oculto de cada habilidad: 4 la principal (visible), 2 la secundaria, 1 y 0 el resto. */
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
}

export interface SupportRequest {
  id: string;
  from: string;
  type: 'conflict' | 'overload' | 'contradiction' | 'dependency' | 'wellbeing' | 'delegate';
  urgent: boolean;
  title: string;
  text: string;
  options: SupportOption[];
}

export interface DayPlan {
  day: number;
  goal: string;
  goalKind: 'people' | 'stations' | 'balance';
  briefing: string;
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

export interface IslandScenario {
  seed: string;
  lang: Lang;
  difficulty: Difficulty;
  island: string;
  mission: string;
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
      days.push({
        day: d + 1,
        goal,
        goalKind,
        briefing,
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
        support: makeSupport(rng, lang, researchers, stations, d),
        reflectDimension: d === 1 ? 'workload' : 'mood',
      });
      break;
    }
  }
  void rName;
  return {
    seed,
    lang,
    difficulty,
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

// ---------------------------------------------------------------- peticiones de apoyo

function makeSupport(rng: Rng, lang: Lang, researchers: Researcher[], stations: Station[], d: number): SupportRequest[] {
  const t = T(lang);
  const all: SupportRequest['type'][] = ['conflict', 'overload', 'contradiction', 'dependency', 'wellbeing', 'delegate'];
  const types = rng.shuffle(all).slice(0, ISLAND_CONFIG.supportPerDay);
  const urgentIdx = rng.int(0, types.length - 1);
  return types.map((type, i) => {
    const from = researchers[i % researchers.length];
    const other = researchers[(i + 1) % researchers.length];
    const st = rng.pick(stations);
    const mk = (title: string, text: string, best: [string, string], ok: [string, string], poor: [string, string]): SupportRequest => ({
      id: `d${d}-q${i}`,
      from: from.id,
      type,
      urgent: i === urgentIdx,
      title,
      text,
      options: rng.shuffle([
        { text: best[0], quality: 'best' as const, why: best[1] },
        { text: ok[0], quality: 'ok' as const, why: ok[1] },
        { text: poor[0], quality: 'poor' as const, why: poor[1] },
      ]),
    });
    switch (type) {
      case 'conflict':
        return mk(
          t(`Desacuerdo con ${other.name}`, `Disagreement with ${other.name}`),
          t(
            `${from.name}: «${other.name} y yo no nos ponemos de acuerdo sobre el método de muestreo y llevamos toda la mañana discutiendo. ¿Qué hacemos?»`,
            `${from.name}: "${other.name} and I can't agree on the sampling method and we've been arguing all morning. What should we do?"`,
          ),
          [
            t(
              'Reunirlos 15 minutos, que cada uno exponga su método con datos y acordar un criterio común antes de seguir.',
              'Bring them together for 15 minutes, have each present their method with data, and agree a shared criterion before continuing.',
            ),
            'Aborda el conflicto directamente, escucha a las dos partes y lo resuelve con un criterio basado en datos.',
          ],
          [
            t(
              `Decidir tú el método para no perder más tiempo y explicárselo a ambos.`,
              'Decide the method yourself so no more time is lost, and explain it to both.',
            ),
            'Resuelve rápido, pero sin escuchar a las partes: puede dejar resentimiento.',
          ],
          [
            t('Pedirles que lo resuelvan entre ellos y que no te molesten con eso.', 'Ask them to sort it out between themselves and not bother you with it.'),
            'Evita el conflicto: lo más probable es que siga creciendo.',
          ],
        );
      case 'overload':
        return mk(
          t('Demasiado trabajo', 'Too much work'),
          t(
            `${from.name}: «Tengo tres informes pendientes y no llego. ¿Puedes ayudarme a priorizar?»`,
            `${from.name}: "I have three reports due and I won't make it. Can you help me prioritise?"`,
          ),
          [
            t(
              'Revisar juntos los tres informes, ordenar por impacto y plazo, y pasar uno a alguien con menos carga.',
              'Go through the three reports together, rank them by impact and deadline, and hand one to someone with less load.',
            ),
            'Ayuda a priorizar con criterios claros y reparte la carga de forma realista.',
          ],
          [
            t('Ampliar el plazo de todos los informes un día.', 'Extend the deadline of all reports by one day.'),
            'Alivia la presión, pero no prioriza ni redistribuye nada.',
          ],
          [
            t('Decirle que haga lo que pueda y quedarse más horas.', 'Tell them to do what they can and stay late.'),
            'Ignora la sobrecarga y empeora el bienestar.',
          ],
        );
      case 'contradiction':
        return mk(
          t('Datos que no cuadran', "Data that doesn't add up"),
          t(
            `${from.name}: «Según ${other.name}, ${la(st.name)} ya terminó su tarea, pero el registro de la estación dice que va por la mitad. ¿Con qué me quedo?»`,
            `${from.name}: "According to ${other.name}, the ${st.name} has already finished its task, but the station's log says it's only halfway. Which do I trust?"`,
          ),
          [
            t(`Comprobarlo directamente con ${la(st.name)} antes de planificar nada.`, `Check directly with the ${st.name} before planning anything.`),
            'Ante información contradictoria, verifica en la fuente primaria antes de decidir.',
          ],
          [
            t('Fiarse del registro escrito y seguir adelante.', 'Trust the written log and move on.'),
            'El registro es más fiable que un comentario, pero no se verifica.',
          ],
          [t(`Fiarse de lo que dice ${other.name}.`, `Trust what ${other.name} says.`), 'Decide con la fuente menos fiable y sin comprobar.'],
        );
      case 'dependency':
        return mk(
          t('Esperando resultados', 'Waiting for results'),
          t(
            `${from.name}: «No puedo avanzar hasta que ${la(st.name)} me pase sus resultados, y nadie sabe cuándo estarán.»`,
            `${from.name}: "I can't move forward until the ${st.name} sends me their results, and nobody knows when they'll be ready."`,
          ),
          [
            t(
              `Preguntar a ${la(st.name)} un plazo concreto y, mientras, darle a ${from.name} una tarea que no dependa de esos resultados.`,
              `Ask the ${st.name} for a concrete deadline and meanwhile give ${from.name} a task that doesn't depend on those results.`,
            ),
            'Aclara la dependencia y evita el tiempo muerto.',
          ],
          [t(`Pedir a ${la(st.name)} que se dé prisa.`, `Ask the ${st.name} to hurry up.`), 'Presiona, pero no resuelve el tiempo muerto ni fija un plazo.'],
          [t('Que espere: ya llegarán.', "Tell them to wait: they'll arrive."), 'Acepta el tiempo muerto sin hacer nada.'],
        );
      case 'wellbeing':
        return mk(
          t('No me encuentro bien', "I'm not feeling great"),
          t(
            `${from.name}: «Llevo unos días durmiendo mal y me cuesta concentrarme.»`,
            `${from.name}: "I've been sleeping badly for a few days and I find it hard to concentrate."`,
          ),
          [
            t(
              'Hablar en privado, ajustar su carga de hoy y acordar cuándo volver a hablarlo.',
              'Talk in private, adjust their workload today and agree when to check in again.',
            ),
            'Atiende el bienestar con un ajuste concreto y seguimiento.',
          ],
          [
            t('Darle el resto del día libre.', 'Give them the rest of the day off.'),
            'Bienintencionado, pero sin hablar de la causa ni planificar el seguimiento.',
          ],
          [t('Pedirle que lo deje para después de la misión.', 'Ask them to leave it until after the mission.'), 'Ignora el problema de bienestar.'],
        );
      default:
        return mk(
          t('¿Decido yo?', 'Should I decide?'),
          t(
            `${from.name}: «Hay que elegir proveedor para las piezas de ${la(st.name)}. ¿Lo decido yo o lo decides tú?»`,
            `${from.name}: "We need to choose a supplier for the ${st.name} parts. Should I decide, or will you?"`,
          ),
          [
            t(
              `Que lo decida ${from.name}, que conoce el tema, con un presupuesto máximo claro y que te informe.`,
              `Let ${from.name}, who knows the topic, decide within a clear maximum budget and report back.`,
            ),
            'Delega en quien tiene el conocimiento, con límites claros.',
          ],
          [
            t('Pedirle tres opciones y decidir tú.', 'Ask for three options and decide yourself.'),
            'Funciona, pero retrasa la decisión y no aprovecha su conocimiento.',
          ],
          [
            t('Elegir el proveedor más barato sin consultar.', 'Pick the cheapest supplier without asking.'),
            'Decide sin información ni consultar a quien sabe.',
          ],
        );
    }
  });
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
    // Los datos clave deben poder conseguirse dentro del presupuesto (una pregunta por objetivo y día)
    const keyQuestions = new Set(d.keyFacts.map((f) => f.question));
    const targets = new Set([...keyQuestions].map((q) => q.split(':')[0]));
    if (keyQuestions.size > d.budget) add('BUDGET', `Día ${d.day}: hacen falta ${keyQuestions.size} preguntas clave y solo hay ${d.budget}.`);
    if (targets.size !== keyQuestions.size) add('BUDGET', `Día ${d.day}: dos datos clave requieren preguntar dos veces a la misma persona o estación.`);
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
  });
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
          ? 'and my workload is manageable.'
          : 'y mi carga de trabajo es llevadera.';
  return `${moodText}, ${loadText}`;
}
