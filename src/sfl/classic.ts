// SFL clásico: un proyecto de sostenibilidad de principio a fin en 13 tareas (contenido original).
// Mecánica según research/solve-2026.md §9.3 (web de preparación): briefing que no se puede releer, 1 ranking de 4
// iniciativas frente a criterios, decisiones de opción única encadenadas y una decisión final de escalar o no.
// Las decisiones anteriores cambian la situación (y la mejor respuesta) de algunas posteriores.

import { createRng, Rng } from '../lib/rng';
import type { Lang } from '../lib/history';
import type { Difficulty } from '../redrock/types';
import type { Pattern } from '../analysis/process';
import { game, GameRubric, P, part, RubricItem, splitEven } from '../analysis/rubric';
import type { PartTime } from '../analysis';
import type { RecEvent } from '../lib/recorder';
import type { SflDecisionView } from '../screens/SflReview';

type Txt = { es: string; en: string };
type Quality = 'best' | 'ok' | 'poor';

export type Criterion = 'impact' | 'cost' | 'speed';
export const CRITERIA: Criterion[] = ['impact', 'cost', 'speed'];
export const CRITERION_LABEL: Record<Lang, Record<Criterion, string>> = {
  es: { impact: 'Impacto', cost: 'Coste (5 = más barato)', speed: 'Rapidez' },
  en: { impact: 'Impact', cost: 'Cost (5 = cheapest)', speed: 'Speed' },
};

export type DecisionKind = 'metric' | 'threshold' | 'baseline' | 'expert' | 'depth' | 'exception' | 'scope' | 'interim' | 'segments' | 'update' | 'risk' | 'scale';
export const DECISION_KINDS: DecisionKind[] = ['metric', 'threshold', 'baseline', 'expert', 'depth', 'exception', 'scope', 'interim', 'segments', 'update', 'risk', 'scale'];
export const KIND_LABEL: Record<DecisionKind, string> = {
  metric: 'Cómo medir el éxito',
  threshold: 'Umbral para escalar',
  baseline: 'Datos contradictorios',
  expert: 'Experto que no habla',
  depth: 'Hasta dónde analizar',
  exception: 'Petición de excepción',
  scope: 'Entregable extra (alcance)',
  interim: 'Qué comunicar a mitad',
  segments: '¿Un factor para todos los segmentos?',
  update: 'Datos nuevos',
  risk: 'Riesgo o bloqueo',
  scale: 'Escalar o no',
};

export interface Initiative {
  id: string;
  name: string;
  scores: Record<Criterion, number>;
}

export interface ClassicOption {
  text: string;
  quality: Quality;
  why: string;
  /** Lo que pasa después (se cuenta al principio de la siguiente pantalla). */
  then: string;
}

/** Una variante de una decisión: cuál se muestra depende de decisiones anteriores. */
export interface ClassicVariant {
  key: string;
  context: string;
  question: string;
  options: ClassicOption[];
  /** Tabla de datos opcional (segmentos, resultados). */
  table?: { head: string[]; rows: string[][] };
  /** Información que justifica la mejor respuesta y cuándo estaba disponible. */
  info: string;
  when: string;
}

export interface ClassicDecision {
  n: number; // 2..13
  kind: DecisionKind;
  /** Variantes por clave; `pick` decide cuál toca según el estado. */
  variants: Record<string, ClassicVariant>;
  /** Decisión anterior de la que depende (para la corrección), si la hay. */
  dependsOn?: number | 'ranking';
}

export interface ClassicScenario {
  seed: string;
  lang: Lang;
  difficulty: Difficulty;
  title: string;
  briefing: string[];
  weights: Record<Criterion, number>;
  target: number; // % de mejora que pide el comité para escalar
  initiatives: Initiative[];
  dependency: { dependent: string; prereq: string; text: string } | null;
  correctRanking: string[];
  rankingWhy: string;
  decisions: ClassicDecision[];
  /** Resultados finales por segmento (para la decisión de escalar). */
  segments: string[];
  results: number[];
  segmentData: { factor: string; levels: string[]; values: number[]; outlier: number | null };
}

export const CLASSIC_CONFIG = { optionPoints: { best: 75, ok: 35, poor: 0 }, rankingPoints: 100, decisionGuideSec: 90 };

// ---------------------------------------------------------------- temas originales

interface Theme {
  project: Txt;
  committee: Txt;
  initiatives: Txt[];
  dependency: [number, number]; // [dependiente, requisito]
  segments: Txt[];
  primary: Txt;
  proxy: Txt;
  vanity: Txt;
  factor: Txt;
  expert: Txt;
  extra: Txt;
  stakeholder: Txt;
  component: Txt;
}

const THEMES: Theme[] = [
  {
    project: { es: 'Plan de residuos orgánicos de Ciudad Brava', en: 'Brava City organic waste plan' },
    committee: { es: 'el comité municipal de sostenibilidad', en: 'the municipal sustainability committee' },
    initiatives: [
      { es: 'Contenedor marrón puerta a puerta', en: 'Door-to-door brown bin' },
      { es: 'Compostadoras comunitarias en parques', en: 'Community composters in parks' },
      { es: 'App de recogida bajo demanda', en: 'On-demand collection app' },
      { es: 'Campaña de separación en colegios', en: 'School sorting campaign' },
    ],
    dependency: [2, 0],
    segments: [
      { es: 'Centro', en: 'Centre' },
      { es: 'Barrios residenciales', en: 'Residential districts' },
      { es: 'Zona rural', en: 'Rural area' },
    ],
    primary: { es: 'toneladas de residuo orgánico desviadas del vertedero', en: 'tonnes of organic waste diverted from landfill' },
    proxy: { es: 'hogares inscritos en el programa', en: 'households enrolled in the programme' },
    vanity: { es: 'visitas a la web del programa', en: 'visits to the programme website' },
    factor: { es: 'proporción de viviendas con espacio para compostar', en: 'share of homes with room to compost' },
    expert: { es: 'Sam Ortiz, del equipo de recogida', en: 'Sam Ortiz, from the collection team' },
    extra: { es: 'un panel público con los datos semanales', en: 'a public dashboard with weekly data' },
    stakeholder: { es: 'la asociación de comerciantes del centro', en: 'the town-centre traders association' },
    component: { es: 'los cubos con chip', en: 'the chipped bins' },
  },
  {
    project: { es: 'Plan de movilidad limpia de Valdeluz', en: 'Valdeluz clean mobility plan' },
    committee: { es: 'la junta de movilidad', en: 'the mobility board' },
    initiatives: [
      { es: 'Aparcamientos disuasorios', en: 'Park-and-ride car parks' },
      { es: 'Carriles bus prioritarios', en: 'Priority bus lanes' },
      { es: 'Lanzadera eléctrica', en: 'Electric shuttle' },
      { es: 'Red de bicis compartidas', en: 'Shared bike network' },
    ],
    dependency: [2, 0],
    segments: [
      { es: 'Norte', en: 'North' },
      { es: 'Centro', en: 'Centre' },
      { es: 'Sur', en: 'South' },
    ],
    primary: { es: 'viajes en coche privado evitados', en: 'private car trips avoided' },
    proxy: { es: 'abonos de transporte vendidos', en: 'transport passes sold' },
    vanity: { es: 'seguidores del plan en redes sociales', en: 'social media followers of the plan' },
    factor: { es: 'distancia media a una parada', en: 'average distance to a stop' },
    expert: { es: 'Sam Ortiz, conductor veterano', en: 'Sam Ortiz, a veteran driver' },
    extra: { es: 'un estudio de opinión de toda la ciudad', en: 'a city-wide opinion survey' },
    stakeholder: { es: 'la asociación de vecinos del Sur', en: 'the South residents association' },
    component: { es: 'las baterías de la lanzadera', en: 'the shuttle batteries' },
  },
  {
    project: { es: 'Plan de ahorro de agua de la Cooperativa Rioseco', en: 'Rioseco Cooperative water-saving plan' },
    committee: { es: 'el consejo de la cooperativa', en: 'the cooperative board' },
    initiatives: [
      { es: 'Riego por goteo', en: 'Drip irrigation' },
      { es: 'Balsas de agua de lluvia', en: 'Rainwater ponds' },
      { es: 'Sensores de humedad del suelo', en: 'Soil moisture sensors' },
      { es: 'Formación a agricultores', en: 'Farmer training' },
    ],
    dependency: [2, 0],
    segments: [
      { es: 'Valle', en: 'Valley' },
      { es: 'Ladera', en: 'Hillside' },
      { es: 'Meseta', en: 'Plateau' },
    ],
    primary: { es: 'litros de agua ahorrados por hectárea', en: 'litres of water saved per hectare' },
    proxy: { es: 'hectáreas con el sistema instalado', en: 'hectares with the system installed' },
    vanity: { es: 'asistentes a las jornadas informativas', en: 'attendees at the information days' },
    factor: { es: 'tipo de suelo (capacidad de retener agua)', en: 'soil type (water retention)' },
    expert: { es: 'Sam Ortiz, agricultor con 30 años en la zona', en: 'Sam Ortiz, a farmer with 30 years in the area' },
    extra: { es: 'un informe para la prensa regional', en: 'a report for the regional press' },
    stakeholder: { es: 'un grupo de agricultores de la Meseta', en: 'a group of Plateau farmers' },
    component: { es: 'los sensores', en: 'the sensors' },
  },
];

// ---------------------------------------------------------------- generador

export function generateClassic(seed: string, difficulty: Difficulty, lang: Lang = 'es'): ClassicScenario {
  const rng = createRng(`sfl-classic|${difficulty}|${seed}`);
  for (let attempt = 0; attempt < 300; attempt++) {
    const sc = tryClassic(rng, seed, difficulty, lang);
    if (sc && validateClassic(sc).length === 0) return sc;
  }
  throw new Error('No se pudo generar el SFL clásico');
}

export function weighted(sc: Pick<ClassicScenario, 'weights'>, i: Initiative): number {
  return CRITERIA.reduce((s, c) => s + sc.weights[c] * i.scores[c], 0);
}

/** Orden correcto: por puntuación ponderada y, si una iniciativa necesita otra, el requisito va antes. */
export function rankInitiatives(sc: Pick<ClassicScenario, 'weights' | 'initiatives' | 'dependency'>): string[] {
  const order = [...sc.initiatives].sort((a, b) => weighted(sc, b) - weighted(sc, a)).map((i) => i.id);
  if (sc.dependency) {
    const di = order.indexOf(sc.dependency.dependent);
    const pi = order.indexOf(sc.dependency.prereq);
    if (pi > di) {
      order.splice(pi, 1);
      order.splice(di, 0, sc.dependency.prereq);
    }
  }
  return order;
}

function tryClassic(rng: Rng, seed: string, difficulty: Difficulty, lang: Lang): ClassicScenario | null {
  const L = (x: Txt) => x[lang];
  const t = (es: string, en: string) => (lang === 'en' ? en : es);
  const theme = rng.pick(THEMES);
  const w = rng.shuffle([3, 2, 1]);
  const weights: Record<Criterion, number> = { impact: w[0], cost: w[1], speed: w[2] };
  const initiatives: Initiative[] = theme.initiatives.map((n, i) => ({
    id: `i${i}`,
    name: L(n),
    scores: { impact: rng.int(1, 5), cost: rng.int(1, 5), speed: rng.int(1, 5) },
  }));
  const scores = initiatives.map((i) => weighted({ weights }, i)).sort((a, b) => b - a);
  for (let k = 1; k < scores.length; k++) if (scores[k - 1] - scores[k] < 2) return null;
  const [dep, pre] = theme.dependency;
  const useDep = difficulty === 'hard' || rng.chance(0.6);
  const dependency = useDep
    ? {
        dependent: `i${dep}`,
        prereq: `i${pre}`,
        text: t(
          `«${initiatives[dep].name}» solo funciona si antes está en marcha «${initiatives[pre].name}».`,
          `"${initiatives[dep].name}" only works if "${initiatives[pre].name}" is already in place.`,
        ),
      }
    : null;
  // La dependencia solo es interesante si el orden por puntuación la incumple
  if (dependency && weighted({ weights }, initiatives[dep]) < weighted({ weights }, initiatives[pre])) return null;
  const base = { weights, initiatives, dependency };
  const correctRanking = rankInitiatives(base);
  const naive = [...initiatives].sort((a, b) => weighted(base, b) - weighted(base, a)).map((i) => i.id);
  const iname = (id: string) => initiatives.find((i) => i.id === id)!.name;
  const wtxt = CRITERIA.map((c) => `${CRITERION_LABEL[lang][c].split(' (')[0]} ×${weights[c]}`).join(', ');
  const rankingWhy =
    t('Puntuación ponderada', 'Weighted score') +
    ` (${wtxt}): ` +
    naive.map((id) => `${iname(id)} ${weighted(base, initiatives.find((i) => i.id === id)!)}`).join(' · ') +
    (dependency && naive.join() !== correctRanking.join() ? ` ${t('Además,', 'Also,')} ${dependency.text} ${t('Por eso va antes aunque puntúe menos.', 'That is why it goes first even though it scores lower.')}` : '');

  const target = rng.pick([10, 12, 15, 20]);
  const segments = theme.segments.map(L);
  // Segmentos: factor y resultado intermedio (decisión 10); uno puede romper el patrón
  const hetero = difficulty === 'hard' ? rng.chance(0.6) : rng.chance(0.5);
  const levels = rng.shuffle(['high', 'mid', 'low'] as const);
  const levelTxt = { high: t('Alto', 'High'), mid: t('Medio', 'Medium'), low: t('Bajo', 'Low') };
  const baseVal = { high: rng.int(16, 22), mid: rng.int(10, 13), low: rng.int(4, 7) };
  const values = levels.map((l) => baseVal[l]);
  let outlier: number | null = null;
  if (hetero) {
    outlier = levels.indexOf('high');
    values[outlier] = rng.int(3, 6); // factor alto pero resultado bajo: no sigue el patrón
  }
  // Resultados finales por segmento frente al objetivo (decisión 13)
  const scaleCase = rng.pick(['all', 'some', 'none'] as const);
  const results = segments.map((_, i) => {
    if (scaleCase === 'all') return target + rng.int(2, 6);
    if (scaleCase === 'none') return target - rng.int(3, 7);
    return i === 0 || (outlier != null && i === outlier) ? target - rng.int(3, 6) : target + rng.int(2, 6);
  });
  if (scaleCase === 'some' && results.every((r) => r >= target)) return null;
  if (scaleCase === 'some' && results.every((r) => r < target)) return null;

  const sc: ClassicScenario = {
    seed,
    lang,
    difficulty,
    title: L(theme.project),
    briefing: [],
    weights,
    target,
    initiatives,
    dependency,
    correctRanking,
    rankingWhy,
    decisions: [],
    segments,
    results,
    segmentData: { factor: L(theme.factor), levels: levels.map((l) => levelTxt[l]), values, outlier },
  };
  sc.briefing = [
    t(
      `Diriges el equipo del ${L(theme.project)}. Respondes ante ${L(theme.committee)}, que decidirá al final si el piloto se escala a todo el territorio.`,
      `You lead the team for the ${L(theme.project)}. You report to ${L(theme.committee)}, which will decide at the end whether the pilot is scaled to the whole area.`,
    ),
    t(`Criterios del comité para priorizar iniciativas: ${wtxt} (cuanto mayor el peso, más importa).`, `The committee's criteria for prioritising initiatives: ${wtxt} (higher weight matters more).`),
    t(
      `Objetivo del proyecto: mejorar el indicador «${L(theme.primary)}». El comité solo escalará si la mejora frente a la situación actual llega al ${target} %.`,
      `Project goal: improve the indicator "${L(theme.primary)}". The committee will only scale if the improvement over today's situation reaches ${target}%.`,
    ),
    dependency ? dependency.text : t('No hay dependencias entre las iniciativas.', 'There are no dependencies between initiatives.'),
    t('Plazo: 6 meses. El presupuesto no admite ampliaciones.', 'Deadline: 6 months. The budget cannot be increased.'),
  ];
  sc.decisions = makeDecisions(sc, theme, lang, naive);
  return sc;
}

// ---------------------------------------------------------------- decisiones

const opt = (text: string, quality: Quality, why: string, then: string): ClassicOption => ({ text, quality, why, then });

function makeDecisions(sc: ClassicScenario, th: Theme, lang: Lang, _naive: string[]): ClassicDecision[] {
  const L = (x: Txt) => x[lang];
  const t = (es: string, en: string) => (lang === 'en' ? en : es);
  const one = (n: number, kind: DecisionKind, v: Omit<ClassicVariant, 'key'>, dependsOn?: ClassicDecision['dependsOn']): ClassicDecision => ({
    n,
    kind,
    variants: { main: { key: 'main', ...v } },
    dependsOn,
  });
  const brief = t('En el briefing (no se puede volver a leer: había que anotarlo).', 'In the briefing (it cannot be reread: you had to note it).');
  const seg = sc.segments;
  const sd = sc.segmentData;
  const out: ClassicDecision[] = [];

  out.push(
    one(2, 'metric', {
      context: t('El piloto arranca con la iniciativa que pusiste en primer lugar. Hay que fijar con qué indicador se medirá el éxito.', 'The pilot starts with the initiative you ranked first. You need to set the indicator used to measure success.'),
      question: t('¿Qué indicador propones como medida principal?', 'Which indicator do you propose as the main measure?'),
      options: [
        opt(L(th.primary), 'best', t('Mide directamente el objetivo que el comité ha fijado para escalar.', 'It directly measures the goal the committee set for scaling.'), t('El comité aprueba el indicador.', 'The committee approves the indicator.')),
        opt(L(th.proxy), 'ok', t('Está relacionado, pero mide participación, no el resultado.', 'Related, but it measures participation, not the outcome.'), t('El comité lo acepta, aunque pregunta cómo se traduce en resultados.', 'The committee accepts it, though it asks how it translates into results.')),
        opt(L(th.vanity), 'poor', t('Es una métrica de visibilidad: puede subir sin que mejore nada.', 'It is a visibility metric: it can rise without anything improving.'), t('El comité acepta el indicador sin discutirlo.', 'The committee accepts the indicator without discussion.')),
      ],
      info: t(`El objetivo del proyecto: mejorar «${L(th.primary)}».`, `The project goal: improve "${L(th.primary)}".`),
      when: brief,
    }),
  );
  out.push(
    one(3, 'threshold', {
      context: t('Antes de lanzar el piloto, el equipo pregunta cómo se decidirá si funciona.', 'Before launching the pilot, the team asks how you will decide whether it works.'),
      question: t('¿Cómo fijas el criterio de éxito?', 'How do you set the success criterion?'),
      options: [
        opt(
          t(`Acordar ya por escrito con el comité el umbral del ${sc.target} % y cómo medirlo.`, `Agree in writing now with the committee on the ${sc.target}% bar and how to measure it.`),
          'best',
          t('Un umbral acordado antes de ver resultados evita discusiones y sesgos después.', 'A threshold agreed before seeing results avoids arguments and bias later.'),
          t('El comité firma el criterio.', 'The committee signs off the criterion.'),
        ),
        opt(
          t('Usar el umbral que se aplicó en otro proyecto parecido, que ya está documentado y probado.', 'Use the threshold from another similar project, which is already documented and tested.'),
          'ok',
          t('Es un umbral explícito, pero no es el que ha fijado este comité.', 'It is an explicit threshold, but not the one this committee set.'),
          t('Hay un umbral, aunque el comité no lo ha validado.', 'There is a threshold, although the committee has not validated it.'),
        ),
        opt(
          t('Decidir el umbral cuando lleguen los primeros resultados y se vea qué es realista.', 'Decide the threshold once the first results arrive and it is clear what is realistic.'),
          'poor',
          t('Fijar el listón después de ver los datos invita a ajustarlo a lo que salga.', 'Setting the bar after seeing the data invites fitting it to the results.'),
          t('El piloto arranca sin criterio de éxito acordado.', 'The pilot starts without an agreed success criterion.'),
        ),
      ],
      info: t(`El comité pide una mejora del ${sc.target} % para escalar.`, `The committee requires a ${sc.target}% improvement to scale.`),
      when: brief,
    }),
  );
  out.push(
    one(4, 'baseline', {
      context: t(
        'Para medir la mejora hace falta la situación de partida. El registro oficial y una encuesta reciente dan cifras distintas (la encuesta, un 30 % más alta).',
        'To measure improvement you need the starting point. The official register and a recent survey give different figures (the survey is 30% higher).',
      ),
      question: t('¿Qué haces con la línea base?', 'What do you do with the baseline?'),
      options: [
        opt(
          t('Comprobar con quien gestiona el registro cómo se calcula cada cifra antes de elegir una.', 'Check with whoever runs the register how each figure is calculated before choosing one.'),
          'best',
          t('Ante dos fuentes que no cuadran, se entiende la diferencia en la fuente primaria antes de decidir.', 'With two sources that disagree, understand the difference at the primary source before deciding.'),
          t('Resulta que la encuesta incluía casos de fuera del área del proyecto: la línea base fiable es la del registro.', 'It turns out the survey included cases from outside the project area: the reliable baseline is the register.'),
        ),
        opt(
          t('Usar la media de las dos cifras.', 'Use the average of both figures.'),
          'ok',
          t('Reduce el error, pero sin saber cuál está mal.', 'It reduces the error, but without knowing which one is wrong.'),
          t('La línea base queda a medio camino, sin saber si es correcta.', 'The baseline sits in between, without knowing whether it is right.'),
        ),
        opt(
          t('Usar la cifra más alta: así cualquier mejora será más fácil de justificar.', 'Use the higher figure: that way any improvement will be easier to justify.'),
          'poor',
          t('Elegir el dato que conviene sin comprobarlo sesga toda la medición.', 'Choosing the convenient figure without checking biases the whole measurement.'),
          t('La línea base queda inflada.', 'The baseline ends up inflated.'),
        ),
      ],
      info: t('Dos fuentes con cifras distintas para el mismo dato.', 'Two sources with different figures for the same data point.'),
      when: t('En esta pantalla.', 'On this screen.'),
    }),
  );
  out.push(
    one(5, 'expert', {
      context: t(
        `En las reuniones, ${L(th.expert)} apenas habla, pero conoce el terreno mejor que nadie. Hoy has notado que ponía mala cara al hablar del calendario.`,
        `In meetings, ${L(th.expert)} barely speaks, but knows the ground better than anyone. Today you noticed a frown when the schedule came up.`,
      ),
      question: t('¿Qué haces?', 'What do you do?'),
      options: [
        opt(
          t('Hablar a solas después de la reunión y preguntarle qué ve en el calendario.', 'Talk one-to-one after the meeting and ask what they see in the schedule.'),
          'best',
          t('Da espacio a quien no habla en grupo y saca información del terreno.', 'It gives room to someone who does not speak in groups and gets field information.'),
          t('Te cuenta que en dos zonas el calendario choca con la temporada alta; lo ajustas.', 'They tell you that in two areas the schedule clashes with peak season; you adjust it.'),
        ),
        opt(
          t('En la próxima reunión, pedirle delante de todo el equipo que dé su opinión sobre el calendario.', 'At the next meeting, ask them in front of the whole team for their view on the schedule.'),
          'ok',
          t('Busca su opinión, pero en el formato en que menos cómodo se siente.', 'It seeks their view, but in the format where they are least comfortable.'),
          t('Comenta algo breve sobre el calendario, sin entrar en detalles.', 'They say something brief about the schedule, without details.'),
        ),
        opt(t('Seguir adelante: si tuviera algo importante, lo diría.', 'Carry on: if it were important, they would say so.'), 'poor', t('Ignora una señal y una fuente de información valiosa.', 'It ignores a signal and a valuable source of information.'), t('Nadie vuelve a hablar del calendario.', 'Nobody mentions the schedule again.')),
      ],
      info: t('La señal de desacuerdo y su experiencia sobre el terreno.', 'The sign of disagreement and their field experience.'),
      when: t('En esta pantalla.', 'On this screen.'),
    }),
  );
  out.push(
    one(6, 'depth', {
      context: t('El equipo propone analizar a fondo todas las variables antes de empezar el piloto. Hay 14 variables posibles.', 'The team proposes analysing all variables in depth before starting the pilot. There are 14 possible variables.'),
      question: t('¿Hasta dónde analizas?', 'How deep do you go?'),
      options: [
        opt(
          t('Analizar en una semana las 2 o 3 variables que más pesan en el objetivo y empezar.', 'Spend one week on the 2 or 3 variables that most affect the goal, then start.'),
          'best',
          t('Profundidad proporcional a la decisión, con un límite de tiempo.', 'Depth proportional to the decision, with a time limit.'),
          t('El piloto empieza en plazo y queda margen en el calendario.', 'The pilot starts on time and there is slack in the schedule.'),
        ),
        opt(
          t('Analizar las 14 variables, aunque se retrase el inicio un mes.', 'Analyse all 14 variables, even if the start slips by a month.'),
          'ok',
          t('Es riguroso, pero gasta el margen del calendario en variables que no cambian la decisión.', 'It is rigorous, but uses up the schedule slack on variables that do not change the decision.'),
          t('El análisis es completo, pero ya no queda margen en el calendario.', 'The analysis is complete, but there is no slack left in the schedule.'),
        ),
        opt(t('Empezar ya sin análisis previo: los datos del piloto dirán qué importa.', 'Start now with no prior analysis: the pilot data will show what matters.'), 'poor', t('Sin hipótesis previas, el piloto no sabrá qué observar.', 'Without prior hypotheses, the pilot will not know what to look at.'), t('El piloto empieza sin hipótesis claras.', 'The pilot starts without clear hypotheses.')),
      ],
      info: t('El plazo de 6 meses y que solo unas pocas variables mueven el objetivo.', 'The 6-month deadline and that only a few variables drive the goal.'),
      when: brief,
    }),
  );
  out.push(
    one(7, 'exception', {
      context: t(
        `${L(th.stakeholder)[0].toUpperCase()}${L(th.stakeholder).slice(1)} pide que su zona entre en el piloto, aunque no cumple los criterios de selección.`,
        `${L(th.stakeholder)[0].toUpperCase()}${L(th.stakeholder).slice(1)} asks for their area to join the pilot, although it does not meet the selection criteria.`,
      ),
      question: t('¿Cómo respondes?', 'How do you respond?'),
      options: [
        opt(
          t('Explicar los criterios y ofrecerle entrar en la fase siguiente si el piloto funciona.', 'Explain the criteria and offer them a place in the next phase if the pilot works.'),
          'best',
          t('Mantiene la validez del piloto y cuida la relación.', 'It keeps the pilot valid and looks after the relationship.'),
          t('Aceptan esperar a la siguiente fase.', 'They agree to wait for the next phase.'),
        ),
        opt(
          t('Aplazar la respuesta hasta tener resultados del piloto y, entonces, valorar si su zona puede entrar.', 'Postpone the answer until the pilot has results and then assess whether their area can join.'),
          'ok',
          t('No rompe el piloto, pero deja la petición sin responder.', 'It does not break the pilot, but leaves the request unanswered.'),
          t('Siguen esperando una respuesta.', 'They are still waiting for an answer.'),
        ),
        opt(t('Incluir su zona en el piloto para evitar un conflicto con un actor con tanta influencia.', 'Include their area in the pilot to avoid a conflict with such an influential stakeholder.'), 'poor', t('Rompe los criterios y contamina la comparación del piloto.', 'It breaks the criteria and contaminates the pilot comparison.'), t('Su zona entra en el piloto.', 'Their area joins the pilot.')),
      ],
      info: t('Los criterios de selección del piloto.', 'The pilot selection criteria.'),
      when: t('En esta pantalla y en el briefing.', 'On this screen and in the briefing.'),
    }),
  );
  // 8 · Alcance: depende de si en la 6 se gastó el margen del calendario
  const scopeOpts = (slack: boolean) => [
    opt(
      t(`Aceptar una versión mínima de ${L(th.extra)} sin mover la fecha.`, `Accept a minimal version of ${L(th.extra)} without moving the date.`),
      slack ? 'best' : 'ok',
      slack
        ? t('Hay margen en el calendario: una versión acotada aporta sin poner en riesgo el plazo.', 'There is slack in the schedule: a scoped version adds value without risking the deadline.')
        : t('Incluso acotado, sin margen en el calendario pone en riesgo el plazo.', 'Even scoped, with no slack in the schedule it puts the deadline at risk.'),
      t('Se prepara una versión sencilla.', 'A simple version is prepared.'),
    ),
    opt(
      t('Proponerlo para la fase 2 y explicar qué costaría hacerlo ahora.', 'Propose it for phase 2 and explain what doing it now would cost.'),
      slack ? 'ok' : 'best',
      slack
        ? t('Protege el plazo, pero renuncia a algo que cabía.', 'It protects the deadline, but gives up something that would have fitted.')
        : t('Sin margen, lo responsable es aplazarlo explicando el impacto en el plazo.', 'With no slack, the responsible choice is to postpone it, explaining the impact on the deadline.'),
      t('El comité acepta dejarlo para la fase 2.', 'The committee agrees to leave it for phase 2.'),
    ),
    opt(
      t('Aceptarlo completo: lo pide un miembro del comité y negarse ahora complicaría la aprobación final.', 'Accept it in full: a committee member asked, and refusing now would complicate final approval.'),
      'poor',
      t('Amplía el alcance sin negociar el plazo ni el presupuesto.', 'It expands the scope without negotiating deadline or budget.'),
      t('El equipo se sobrecarga.', 'The team becomes overloaded.'),
    ),
  ];
  out.push({
    n: 8,
    kind: 'scope',
    dependsOn: 6,
    variants: {
      slack: {
        key: 'slack',
        context: t(`Un miembro del comité pide añadir ${L(th.extra)}. El calendario todavía tiene margen.`, `A committee member asks to add ${L(th.extra)}. The schedule still has some slack.`),
        question: t('¿Qué haces?', 'What do you do?'),
        options: scopeOpts(true),
        info: t('Que quedaba margen en el calendario (decidiste no alargar el análisis).', 'That there was slack in the schedule (you chose not to extend the analysis).'),
        when: t('Consecuencia de tu decisión 6.', 'Consequence of your decision 6.'),
      },
      tight: {
        key: 'tight',
        context: t(`Un miembro del comité pide añadir ${L(th.extra)}. El calendario ya no tiene margen.`, `A committee member asks to add ${L(th.extra)}. The schedule has no slack left.`),
        question: t('¿Qué haces?', 'What do you do?'),
        options: scopeOpts(false),
        info: t('Que ya no quedaba margen en el calendario (consecuencia de alargar el análisis en la decisión 6).', 'That there was no slack left (consequence of extending the analysis in decision 6).'),
        when: t('Consecuencia de tu decisión 6.', 'Consequence of your decision 6.'),
      },
    },
  });
  out.push(
    one(9, 'interim', {
      context: t('A mitad del piloto, los resultados son mixtos: buenos en una zona y flojos en otra. El comité pide una actualización.', 'Halfway through the pilot, results are mixed: good in one area and weak in another. The committee asks for an update.'),
      question: t('¿Qué comunicas?', 'What do you communicate?'),
      options: [
        opt(
          t('Los resultados tal cual, con sus límites y qué comprobaréis antes del final.', 'The results as they are, their limits and what you will check before the end.'),
          'best',
          t('Transparencia con contexto y próximos pasos.', 'Transparency with context and next steps.'),
          t('El comité agradece la claridad.', 'The committee appreciates the clarity.'),
        ),
        opt(t('Nada hasta tener los resultados finales.', 'Nothing until the final results.'), 'ok', t('Evita conclusiones prematuras, pero deja al comité sin información.', 'It avoids premature conclusions, but leaves the committee uninformed.'), t('El comité insiste en saber algo.', 'The committee insists on hearing something.')),
        opt(t('Solo la zona que va bien, para mantener el apoyo del comité.', 'Only the area that is going well, to keep the committee on side.'), 'poor', t('Ocultar lo que va mal mina la confianza cuando se sepa.', 'Hiding what goes badly undermines trust once it comes out.'), t('El comité se queda con una imagen incompleta.', 'The committee is left with an incomplete picture.')),
      ],
      info: t('Que los resultados eran mixtos.', 'That the results were mixed.'),
      when: t('En esta pantalla.', 'On this screen.'),
    }),
  );
  // 10 · Segmentos: la mejor respuesta sale de la tabla
  const table = { head: [t('Segmento', 'Segment'), sd.factor, t('Mejora a mitad del piloto', 'Improvement at mid-pilot')], rows: seg.map((s, i) => [s, sd.levels[i], `${sd.values[i]} %`]) };
  const outName = sd.outlier != null ? seg[sd.outlier] : seg[sd.values.indexOf(Math.min(...sd.values))];
  const homo = sd.outlier == null;
  out.push({
    n: 10,
    kind: 'segments',
    variants: {
      main: {
        key: 'main',
        context: t(`El equipo cree que el factor clave es la ${sd.factor}. Estos son los datos por segmento:`, `The team thinks the key factor is the ${sd.factor}. These are the data by segment:`),
        question: t('¿Explica ese mismo factor los resultados de los tres segmentos?', 'Does that same factor explain the results of all three segments?'),
        table,
        options: [
          opt(
            t('Sí: el resultado sigue al factor en los tres segmentos; se pueden tratar juntos.', 'Yes: the result follows the factor in all three segments; they can be treated together.'),
            homo ? 'best' : 'poor',
            homo
              ? t('A más factor, más mejora en los tres segmentos: el patrón es consistente.', 'More factor, more improvement in all three: the pattern is consistent.')
              : t(`${outName} tiene el factor alto pero una mejora baja: no sigue el patrón.`, `${outName} has a high factor but low improvement: it does not follow the pattern.`),
            t('Se plantea una sola estrategia para todos.', 'A single strategy is planned for all.'),
          ),
          opt(
            t(`No del todo: ${outName} no encaja; analizarlo aparte antes de generalizar.`, `Not entirely: ${outName} does not fit; analyse it separately before generalising.`),
            homo ? 'ok' : 'best',
            homo
              ? t(`${outName} va peor, pero porque su factor es el más bajo: encaja en el patrón.`, `${outName} does worse, but because its factor is the lowest: it fits the pattern.`)
              : t(`${outName} rompe el patrón (factor alto, mejora baja): algo más lo explica.`, `${outName} breaks the pattern (high factor, low improvement): something else explains it.`),
            t(`Se abre un análisis específico de ${outName}.`, `A specific analysis of ${outName} is opened.`),
          ),
          opt(
            t(`Descartar ${outName} como dato atípico, porque distorsiona la media, y seguir con los otros dos segmentos.`, `Discard ${outName} as an outlier, since it distorts the average, and continue with the other two segments.`),
            'poor',
            t('Descartar un tercio de los datos sin entenderlo oculta información.', 'Discarding a third of the data without understanding it hides information.'),
            t(`${outName} desaparece del análisis.`, `${outName} disappears from the analysis.`),
          ),
        ],
        info: t('La tabla: compara el orden del factor con el orden de la mejora.', 'The table: compare the order of the factor with the order of the improvement.'),
        when: t('En esta pantalla (tabla de segmentos).', 'On this screen (segment table).'),
      },
    },
  });
  // 11 · Datos nuevos: depende del indicador elegido en la 2
  out.push({
    n: 11,
    kind: 'update',
    dependsOn: 2,
    variants: {
      primary: {
        key: 'primary',
        context: t(
          `Llega la actualización mensual de «${L(th.primary)}». Una semana muestra un salto del 40 % que no se repite.`,
          `The monthly update on "${L(th.primary)}" arrives. One week shows a 40% jump that does not repeat.`,
        ),
        question: t('¿Qué haces con ese dato?', 'What do you do with that figure?'),
        options: [
          opt(t('Comprobar qué pasó esa semana antes de incluirla en las conclusiones.', 'Check what happened that week before including it in the conclusions.'), 'best', t('Un dato extremo se entiende antes de usarlo o descartarlo.', 'An extreme value is understood before using or discarding it.'), t('Era una recogida extraordinaria puntual; se anota aparte.', 'It was a one-off extra collection; it is recorded separately.')),
          opt(t('Excluir esa semana del cálculo.', 'Exclude that week from the calculation.'), 'ok', t('Probablemente correcto, pero sin comprobarlo.', 'Probably right, but unchecked.'), t('La semana queda fuera sin explicación.', 'The week is left out without explanation.')),
          opt(t('Incluirla: es un dato real del piloto y mejora el resultado.', 'Include it: it is real pilot data and it improves the result.'), 'poor', t('Usa un dato atípico porque conviene.', 'It uses an outlier because it is convenient.'), t('El resultado queda inflado.', 'The result is inflated.')),
        ],
        info: t('Que el indicador era el correcto y el salto era aislado.', 'That the indicator was the right one and the jump was isolated.'),
        when: t('En esta pantalla.', 'On this screen.'),
      },
      other: {
        key: 'other',
        context: t(
          'Llega la actualización mensual, pero solo trae el indicador que elegiste en la decisión 2. El comité decidirá el escalado según el objetivo del proyecto.',
          'The monthly update arrives, but it only includes the indicator you chose in decision 2. The committee will decide on scaling based on the project goal.',
        ),
        question: t('¿Qué haces?', 'What do you do?'),
        options: [
          opt(
            t(`Pedir también los datos de «${L(th.primary)}» y explicar el cambio al comité.`, `Also request data on "${L(th.primary)}" and explain the change to the committee.`),
            'best',
            t('Corrige a tiempo el indicador: sin él no se puede comprobar el objetivo.', 'It corrects the indicator in time: without it the goal cannot be checked.'),
            t('A partir de ahora se recogen los datos del objetivo.', 'From now on the goal data are collected.'),
          ),
          opt(t('Estimar el objetivo a partir del indicador que ya hay, con un modelo sencillo que relacione los dos.', 'Estimate the goal from the indicator you already have, with a simple model linking the two.'), 'ok', t('Da una aproximación, pero con mucha incertidumbre.', 'It gives an approximation, but with high uncertainty.'), t('Se trabaja con una estimación.', 'You work with an estimate.')),
          opt(t('Seguir con el indicador actual: es el que se acordó.', 'Carry on with the current indicator: it is the one agreed.'), 'poor', t('Al final no podrás demostrar si se cumple el objetivo.', 'In the end you will not be able to show whether the goal is met.'), t('El piloto sigue sin medir el objetivo.', 'The pilot continues without measuring the goal.')),
        ],
        info: t(`Que el indicador elegido en la decisión 2 no medía «${L(th.primary)}».`, `That the indicator chosen in decision 2 did not measure "${L(th.primary)}".`),
        when: t('Consecuencia de tu decisión 2 (lo ideal era elegir bien el indicador allí).', 'Consequence of your decision 2 (ideally, choose the indicator well there).'),
      },
    },
  });
  // 12 · Riesgo: depende de si tu iniciativa n.º 1 necesitaba otra antes
  const dep = sc.dependency;
  const iname = (id: string) => sc.initiatives.find((i) => i.id === id)!.name;
  const variants12: Record<string, ClassicVariant> = {
    supplier: {
      key: 'supplier',
      context: t(`El proveedor avisa de un retraso de 3 semanas en ${L(th.component)}.`, `The supplier warns of a 3-week delay on ${L(th.component)}.`),
      question: t('¿Qué haces?', 'What do you do?'),
      options: [
        opt(t('Activar el plan alternativo para esas 3 semanas y avisar al comité del impacto.', 'Activate the fallback plan for those 3 weeks and tell the committee about the impact.'), 'best', t('Gestiona el riesgo y comunica a tiempo.', 'It manages the risk and communicates in time.'), t('El impacto queda acotado.', 'The impact is contained.')),
        opt(t('Cambiar de proveedor de inmediato para no perder las 3 semanas, aunque haya que negociar otro contrato.', 'Switch supplier immediately so as not to lose the 3 weeks, even if a new contract must be negotiated.'), 'ok', t('Puede funcionar, pero sin evaluar coste ni plazo del cambio.', 'It may work, but without assessing the cost or timing of the switch.'), t('El nuevo proveedor tarda en adaptarse.', 'The new supplier takes time to adapt.')),
        opt(t('Esperar sin decir nada al comité: 3 semanas se recuperan en lo que queda de calendario.', 'Wait without telling the committee: 3 weeks can be made up over the rest of the schedule.'), 'poor', t('Oculta un riesgo y no lo mitiga.', 'It hides a risk and does not mitigate it.'), t('El retraso llega al comité por otra vía.', 'The delay reaches the committee another way.')),
      ],
      info: t('El aviso del proveedor.', 'The supplier warning.'),
      when: t('En esta pantalla.', 'On this screen.'),
    },
  };
  if (dep)
    variants12.blocked = {
      key: 'blocked',
      context: t(
        `El piloto de «${iname(dep.dependent)}» está frenado: no funciona porque «${iname(dep.prereq)}» todavía no está en marcha.`,
        `The "${iname(dep.dependent)}" pilot is stalled: it does not work because "${iname(dep.prereq)}" is not yet in place.`,
      ),
      question: t('¿Qué haces?', 'What do you do?'),
      options: [
        opt(
          t(`Lanzar antes «${iname(dep.prereq)}» y reprogramar «${iname(dep.dependent)}».`, `Launch "${iname(dep.prereq)}" first; reschedule "${iname(dep.dependent)}".`),
          'best',
          t('Respeta la dependencia que ya estaba en el briefing.', 'It respects the dependency already in the briefing.'),
          t('El orden se corrige, con un mes de retraso.', 'The order is corrected, with a one-month delay.'),
        ),
        opt(t('Lanzar las dos iniciativas a la vez, pidiendo presupuesto extra para no perder más tiempo del calendario.', 'Launch both initiatives at once, asking for extra budget so as not to lose more time on the schedule.'), 'ok', t('Resuelve el bloqueo, pero el presupuesto no admitía ampliaciones.', 'It removes the block, but the budget could not be increased.'), t('Se pide una ampliación que el comité no ve con buenos ojos.', 'An increase is requested that the committee frowns upon.')),
        opt(t(`Seguir con «${iname(dep.dependent)}» y esperar que funcione.`, `Carry on with "${iname(dep.dependent)}" and hope it works.`), 'poor', t('Ignora una dependencia conocida.', 'It ignores a known dependency.'), t('El piloto sigue bloqueado.', 'The pilot remains blocked.')),
      ],
      info: dep.text,
      when: t('En el briefing; el error de origen fue el orden del ranking (decisión 1).', 'In the briefing; the root error was the ranking order (decision 1).'),
    };
  out.push({ n: 12, kind: 'risk', dependsOn: 'ranking', variants: variants12 });
  // 13 · Escalar: la mejor respuesta sale de los resultados frente al umbral
  const meets = sc.results.map((r) => r >= sc.target);
  const allMeet = meets.every(Boolean);
  const noneMeet = meets.every((m) => !m);
  out.push({
    n: 13,
    kind: 'scale',
    variants: {
      main: {
        key: 'main',
        context: t(`Final del piloto. Mejora frente a la línea base en cada segmento (el comité pide ${sc.target} %):`, `End of the pilot. Improvement over baseline in each segment (the committee requires ${sc.target}%):`),
        question: t('¿Qué recomiendas al comité?', 'What do you recommend to the committee?'),
        table: { head: [t('Segmento', 'Segment'), t('Mejora', 'Improvement'), t('Objetivo', 'Target')], rows: seg.map((s, i) => [s, `${sc.results[i]} %`, `${sc.target} %`]) },
        options: [
          opt(
            t('Escalar a todo el territorio.', 'Scale to the whole area.'),
            allMeet ? 'best' : 'poor',
            allMeet ? t('Todos los segmentos superan el umbral acordado.', 'All segments beat the agreed threshold.') : t('Hay segmentos por debajo del umbral.', 'Some segments are below the threshold.'),
            '',
          ),
          opt(
            t('Escalar por fases, empezando por los segmentos que superan el umbral, y revisar el resto.', 'Scale in phases, starting with the segments above the threshold, and review the rest.'),
            allMeet ? 'ok' : noneMeet ? 'ok' : 'best',
            allMeet
              ? t('Prudente, pero retrasa un beneficio que ya está demostrado en todos.', 'Prudent, but it delays a benefit already shown everywhere.')
              : noneMeet
                ? t('Ningún segmento llega al umbral: escalar, aunque sea por fases, no está justificado todavía.', 'No segment reaches the threshold: scaling, even in phases, is not yet justified.')
                : t('Escala donde el umbral se cumple y aprende del resto.', 'It scales where the threshold is met and learns from the rest.'),
            '',
          ),
          opt(
            t('No escalar todavía: ajustar el piloto y volver a medir.', 'Do not scale yet: adjust the pilot and measure again.'),
            noneMeet ? 'best' : allMeet ? 'poor' : 'ok',
            noneMeet
              ? t('Ningún segmento llega al umbral acordado.', 'No segment reaches the agreed threshold.')
              : allMeet
                ? t('Los datos ya justifican escalar.', 'The data already justify scaling.')
                : t('Desaprovecha los segmentos que sí cumplen.', 'It wastes the segments that do meet it.'),
            '',
          ),
        ],
        info: t(`Los resultados por segmento frente al umbral del ${sc.target} % fijado en el briefing.`, `The results by segment against the ${sc.target}% threshold set in the briefing.`),
        when: t('En el briefing (umbral) y en esta pantalla (resultados).', 'In the briefing (threshold) and on this screen (results).'),
      },
    },
  });
  // Opciones en orden aleatorio
  const rng = createRng(`sfl-classic-order|${sc.seed}|${sc.difficulty}`);
  for (const d of out) for (const v of Object.values(d.variants)) v.options = rng.shuffle(v.options);
  return out;
}

// ---------------------------------------------------------------- respuestas y encadenamiento

export interface ClassicAnswers {
  ranking: string[]; // ids, de primero a último ([] = sin responder)
  choices: Record<number, number>; // n.º de decisión -> índice de opción
  /** Variante mostrada en cada decisión. */
  shown: Record<number, string>;
  timeSec: Record<string, number>; // 'briefing', 'ranking', 'd2'... -> segundos
}

export const emptyClassic = (): ClassicAnswers => ({ ranking: [], choices: {}, shown: {}, timeSec: {} });

const quality = (sc: ClassicScenario, a: ClassicAnswers, n: number): Quality | null => {
  const d = sc.decisions.find((x) => x.n === n)!;
  const v = d.variants[a.shown[n] ?? variantFor(sc, a, n)];
  const i = a.choices[n];
  return i == null ? null : v.options[i].quality;
};

/** Qué variante toca en la decisión n según las decisiones anteriores. */
export function variantFor(sc: ClassicScenario, a: ClassicAnswers, n: number): string {
  const d = sc.decisions.find((x) => x.n === n)!;
  if (d.kind === 'scope') return quality(sc, a, 6) === 'ok' ? 'tight' : 'slack';
  if (d.kind === 'update') return quality(sc, a, 2) === 'best' ? 'primary' : 'other';
  if (d.kind === 'risk') {
    const dep = sc.dependency;
    const first = a.ranking[0];
    if (dep && first === dep.dependent) return 'blocked';
    return 'supplier';
  }
  return 'main';
}

/** Lo que pasó tras la decisión anterior (texto que abre la siguiente pantalla). */
export function previousOutcome(sc: ClassicScenario, a: ClassicAnswers, n: number): string | null {
  if (n === 2) {
    const first = sc.initiatives.find((i) => i.id === a.ranking[0]);
    return first ? (sc.lang === 'en' ? `The pilot will start with "${first.name}".` : `El piloto empezará con «${first.name}».`) : null;
  }
  const prev = sc.decisions.find((x) => x.n === n - 1);
  if (!prev) return null;
  const i = a.choices[n - 1];
  if (i == null) return null;
  const v = prev.variants[a.shown[n - 1] ?? variantFor(sc, a, n - 1)];
  return v.options[i]?.then || null;
}

// ---------------------------------------------------------------- validación

export interface ClassicIssue {
  code: string;
  message: string;
}

export function validateClassic(sc: ClassicScenario): ClassicIssue[] {
  const out: ClassicIssue[] = [];
  const add = (code: string, message: string) => out.push({ code, message });
  const ws = sc.initiatives.map((i) => weighted(sc, i)).sort((a, b) => b - a);
  for (let k = 1; k < ws.length; k++) if (ws[k - 1] - ws[k] < 2) add('RANKING', 'Dos iniciativas puntúan casi igual: el ranking no tiene un orden claro.');
  if (rankInitiatives(sc).join() !== sc.correctRanking.join()) add('RANKING', 'El ranking guardado no coincide con el calculado.');
  if (sc.dependency) {
    const r = sc.correctRanking;
    if (r.indexOf(sc.dependency.prereq) > r.indexOf(sc.dependency.dependent)) add('DEPENDENCY', 'El ranking correcto incumple la dependencia.');
  }
  if (sc.decisions.length !== 12) add('COUNT', 'Debe haber 12 decisiones tras el ranking (13 tareas).');
  for (const d of sc.decisions)
    for (const v of Object.values(d.variants)) {
      if (v.options.filter((o) => o.quality === 'best').length !== 1) add('BEST', `Decisión ${d.n} (${v.key}): debe haber exactamente una mejor respuesta.`);
      if (!v.options.some((o) => o.quality === 'ok')) add('OK', `Decisión ${d.n} (${v.key}): falta una alternativa aceptable.`);
      if (new Set(v.options.map((o) => o.text)).size !== v.options.length) add('DUP', `Decisión ${d.n} (${v.key}): opciones repetidas.`);
    }
  // Las decisiones basadas en datos se recalculan desde los datos
  const sd = sc.segmentData;
  const seg = sc.decisions.find((d) => d.kind === 'segments')!.variants.main;
  const levelRank = (l: string) => ['Alto', 'High'].includes(l) ? 3 : ['Medio', 'Medium'].includes(l) ? 2 : 1;
  const order = (xs: number[]) => xs.map((_, i) => i).sort((a, b) => xs[b] - xs[a]).join();
  const consistent = order(sd.levels.map(levelRank)) === order(sd.values);
  const bestSeg = seg.options.find((o) => o.quality === 'best')!;
  const saysSame = bestSeg.text.startsWith('Sí') || bestSeg.text.startsWith('Yes');
  if (consistent !== saysSame) add('SEGMENTS', 'La mejor respuesta sobre los segmentos no coincide con los datos.');
  const scale = sc.decisions.find((d) => d.kind === 'scale')!.variants.main;
  const nMeet = sc.results.filter((r) => r >= sc.target).length;
  const bestScale = scale.options.find((o) => o.quality === 'best')!.text;
  const expect = nMeet === sc.results.length ? /todo el territorio|whole area/ : nMeet === 0 ? /No escalar|Do not scale/ : /por fases|in phases/;
  if (!expect.test(bestScale)) add('SCALE', 'La mejor respuesta de escalado no coincide con los resultados.');
  if (sc.results.some((r) => Math.abs(r - sc.target) < 2)) add('SCALE', 'Un resultado está demasiado cerca del umbral para decidir con claridad.');
  return out;
}

// ---------------------------------------------------------------- corrección

export const CLASSIC_RULES = {
  ranking: 'Ranking (10): se comparan las 6 parejas de iniciativas; cada pareja en el orden correcto vale 1/6 de los puntos. El orden correcto es el de la puntuación ponderada con los pesos del comité, con los requisitos antes de lo que depende de ellos.',
  decisions: 'Decisiones (90): 7,5 por decisión. La mejor respuesta vale 7,5, la aceptable 3,5 y la mala o sin responder 0. En las decisiones encadenadas se corrige la situación que te tocó por tus decisiones anteriores.',
};

export interface ClassicGrade {
  rubric: GameRubric;
  decisions: SflDecisionView[];
}

export function gradeClassic(sc: ClassicScenario, a: ClassicAnswers): ClassicGrade {
  const name = (id: string) => sc.initiatives.find((i) => i.id === id)?.name ?? id;
  const views: SflDecisionView[] = [];
  // Ranking por parejas
  const pairs: [string, string][] = [];
  for (let i = 0; i < sc.correctRanking.length; i++) for (let j = i + 1; j < sc.correctRanking.length; j++) pairs.push([sc.correctRanking[i], sc.correctRanking[j]]);
  const pT = splitEven(CLASSIC_CONFIG.rankingPoints, pairs.length);
  const rankItems: RubricItem[] = pairs.map(([x, y], k) => {
    const ok = a.ranking.length > 0 && a.ranking.indexOf(x) < a.ranking.indexOf(y);
    const isDep = !!sc.dependency && x === sc.dependency.prereq && y === sc.dependency.dependent;
    return {
      id: `cl-rank-${x}-${y}`,
      label: `Ranking: «${name(x)}» antes que «${name(y)}»`,
      max: P(pT[k]),
      earned: ok ? P(pT[k]) : 0,
      why: ok ? 'Orden correcto.' : isDep ? `Al revés. ${sc.dependency!.text}` : `Al revés: ${name(x)} puntúa ${weighted(sc, sc.initiatives.find((i) => i.id === x)!)} y ${name(y)} ${weighted(sc, sc.initiatives.find((i) => i.id === y)!)} con los pesos del comité.`,
      errorType: ok ? undefined : a.ranking.length ? (isDep ? 'sfl-c-dependency' : 'sfl-c-ranking') : 'sfl-blank',
    };
  });
  const rankOk = a.ranking.join() === sc.correctRanking.join();
  views.push({
    id: 'cl-ranking',
    day: 1,
    step: 'ranking',
    label: 'Decisión 1 · Ranking de iniciativas',
    yours: a.ranking.length ? a.ranking.map(name).join(' → ') : 'Sin responder',
    best: sc.correctRanking.map(name).join(' → '),
    ok: rankOk ? true : rankItems.some((i) => i.earned > 0) ? 'partial' : false,
    why: sc.rankingWhy,
    info: `Los pesos de los criterios${sc.dependency ? ' y la dependencia entre iniciativas' : ''}.`,
    when: 'En el briefing (no se puede volver a leer: había que anotarlo).',
  });
  // Decisiones
  const dT = CLASSIC_CONFIG.optionPoints;
  const decItems: RubricItem[] = sc.decisions.map((d) => {
    const key = a.shown[d.n] ?? variantFor(sc, a, d.n);
    const v = d.variants[key];
    const i = a.choices[d.n];
    const chosen = i == null ? null : v.options[i];
    const q: Quality = chosen?.quality ?? 'poor';
    const best = v.options.find((o) => o.quality === 'best')!;
    const chain = chainNote(sc, a, d);
    views.push({
      id: `cl-d${d.n}`,
      day: 1,
      step: d.kind === 'scale' ? 'scale' : 'decision',
      label: `Decisión ${d.n} · ${KIND_LABEL[d.kind]}`,
      yours: chosen ? chosen.text : 'Sin responder',
      best: best.text,
      ok: q === 'best' ? true : q === 'ok' ? 'partial' : false,
      why: `${chosen && q !== 'best' ? `${chosen.why} Mejor: ${best.why}` : best.why}${chain ? ` ${chain}` : ''}`,
      info: v.info,
      when: v.when,
    });
    return {
      id: `cl-d${d.n}`,
      label: `Decisión ${d.n}: ${KIND_LABEL[d.kind]}`,
      max: P(dT.best),
      earned: P(dT[q]),
      why: chosen ? (q === 'best' ? 'Mejor respuesta.' : `${chosen.why} Mejor: «${best.text}»`) : `Sin responder. Mejor: «${best.text}»`,
      errorType: q === 'best' ? undefined : chosen ? `sfl-c-${d.kind}` : 'sfl-blank',
    };
  });
  return {
    rubric: game('sfl-classic', 'SFL Classic', [part('cl-ranking', 'Ranking', CLASSIC_RULES.ranking, rankItems), part('cl-decisions', 'Decisiones', CLASSIC_RULES.decisions, decItems)]),
    decisions: views,
  };
}

/** Explicación de cómo una decisión anterior cambió esta. */
function chainNote(sc: ClassicScenario, a: ClassicAnswers, d: ClassicDecision): string | null {
  const key = a.shown[d.n] ?? variantFor(sc, a, d.n);
  if (d.kind === 'scope') return key === 'tight' ? 'Te tocó sin margen porque en la decisión 6 alargaste el análisis.' : 'Tenías margen porque en la decisión 6 limitaste el análisis.';
  if (d.kind === 'update') return key === 'other' ? 'Esta situación viene de la decisión 2: el indicador elegido no medía el objetivo.' : null;
  if (d.kind === 'risk' && key === 'blocked') return 'El bloqueo viene del ranking: pusiste primero una iniciativa que necesitaba otra antes.';
  if (d.kind === 'scale') {
    const notes: string[] = [];
    if (quality(sc, a, 3) !== 'best') notes.push('Como en la decisión 3 no acordaste el umbral con el comité, esta recomendación es más fácil de discutir.');
    if (quality(sc, a, 4) !== 'best') notes.push('Como en la decisión 4 no comprobaste la línea base, la mejora medida es menos fiable.');
    return notes.join(' ') || null;
  }
  return null;
}

export function classicPatterns(sc: ClassicScenario, a: ClassicAnswers, g: ClassicGrade): Pattern[] {
  const out: Pattern[] = [];
  const items = g.rubric.parts.flatMap((p) => p.items);
  const lost = (id: string) => {
    const i = items.find((x) => x.id === id);
    return !!i && i.earned < i.max;
  };
  const chain: string[] = [];
  if (lost('cl-d2') && (a.shown[11] ?? variantFor(sc, a, 11)) === 'other') chain.push('El indicador de la decisión 2 te obligó a corregir sobre la marcha en la 11.');
  if ((a.shown[8] ?? variantFor(sc, a, 8)) === 'tight') chain.push('Alargar el análisis en la decisión 6 te dejó sin margen en la 8.');
  if ((a.shown[12] ?? variantFor(sc, a, 12)) === 'blocked') chain.push('El orden del ranking bloqueó el piloto en la decisión 12.');
  if (chain.length)
    out.push({
      id: 'sfl-chain',
      title: 'Errores tempranos que arrastraste',
      detail: 'Algunas decisiones malas al principio cambiaron la situación de decisiones posteriores.',
      evidence: chain,
      severity: chain.length >= 2 ? 'alta' : 'media',
    });
  const brief = a.timeSec.briefing ?? 0;
  const rankLost = items.filter((i) => i.id.startsWith('cl-rank-') && i.earned < i.max).length;
  if (brief < 60 && rankLost > 0)
    out.push({
      id: 'sfl-briefing-fast',
      title: 'Briefing leído demasiado rápido',
      detail: `Pasaste ${Math.round(brief)} s en el briefing y fallaste ${rankLost} pareja${rankLost === 1 ? '' : 's'} del ranking. El briefing no se puede volver a leer: anota pesos, umbral y dependencias.`,
      evidence: [`Tiempo en el briefing: ${Math.round(brief)} s`],
      severity: 'alta',
    });
  if (items.some((i) => i.errorType === 'sfl-c-dependency'))
    out.push({
      id: 'sfl-dependency',
      title: 'Ranking sin tener en cuenta la dependencia',
      detail: 'Ordenaste solo por puntuación y pusiste una iniciativa antes que su requisito.',
      evidence: [sc.dependency?.text ?? ''],
      severity: 'media',
    });
  return out;
}

export function classicTimes(a: ClassicAnswers): PartTime[] {
  const sum = (keys: string[]) => keys.reduce((s, k) => s + (a.timeSec[k] ?? 0), 0);
  const decKeys = Array.from({ length: 12 }, (_, i) => `d${i + 2}`);
  return [
    { game: 'SFL Classic', label: 'Briefing', sec: a.timeSec.briefing ?? 0, refSec: 120 },
    { game: 'SFL Classic', label: 'Ranking', sec: a.timeSec.ranking ?? 0, refSec: 120 },
    { game: 'SFL Classic', label: 'Decisiones 2–13', sec: sum(decKeys), refSec: 12 * CLASSIC_CONFIG.decisionGuideSec },
  ];
}

export function classicContext(sc: ClassicScenario, g: ClassicGrade) {
  const labels = new Map<string, string>();
  const correctness = new Map<string, boolean>();
  const items = g.rubric.parts.flatMap((p) => p.items);
  labels.set('sfl-rank|0', 'Ranking de iniciativas');
  correctness.set('sfl-rank|0', items.filter((i) => i.id.startsWith('cl-rank-')).every((i) => i.earned >= i.max));
  for (const d of sc.decisions) {
    labels.set(`sfl-decision|${d.n}`, `Decisión ${d.n}: ${KIND_LABEL[d.kind]}`);
    const it = items.find((i) => i.id === `cl-d${d.n}`);
    if (it) correctness.set(`sfl-decision|${d.n}`, it.earned >= it.max);
  }
  const describe = (_e: RecEvent): string | null => null;
  return { labels, correctness, describe };
}

export const CLASSIC_TIPS: Record<string, (n: number) => string> = {
  'sfl-c-ranking': () => 'En el ranking, calcula la puntuación ponderada de cada iniciativa (peso × nota de cada criterio) antes de ordenar: es lo que el briefing te pide.',
  'sfl-c-dependency': () => 'Antes de cerrar el ranking, comprueba las dependencias del briefing: un requisito va siempre antes de lo que depende de él.',
  'sfl-c-metric': () => 'El indicador principal debe medir el objetivo que decide el escalado, no la participación ni la visibilidad.',
  'sfl-c-threshold': () => 'Acuerda el criterio de éxito antes de ver resultados y con quien decide.',
  'sfl-c-baseline': () => 'Ante dos fuentes que no cuadran, entiende la diferencia en la fuente primaria antes de elegir una.',
  'sfl-c-segments': () => 'Para saber si un factor lo explica todo, compara el orden del factor con el orden del resultado en cada segmento.',
  'sfl-c-scale': () => 'En la decisión final, compara cada segmento con el umbral: todos cumplen → escalar; algunos → por fases; ninguno → iterar.',
  'sfl-c-scope': () => 'Ante un entregable extra, mira primero si queda margen en el calendario: si no, propónlo para otra fase explicando el coste.',
};
