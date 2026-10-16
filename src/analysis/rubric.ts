// Rúbrica explícita de cada juego. Todos los puntos se calculan en décimas enteras para que la suma de
// los puntos perdidos sea EXACTAMENTE el máximo menos la nota.

import { fmt } from '../lib/format';
import { isNumericCorrect, gradeBlank, gradeCase, RedrockAnswers } from '../redrock';
import type { RedrockScenario } from '../redrock/types';
import { parseUserNumber } from '../lib/format';
import { round } from '../lib/rng';
import {
  checkSelection,
  correctProfile,
  expectedDecision,
  Microbe,
  microbeIndex,
  POOL_START_MAX,
  profileOptions,
  SeaWolfScenario,
  traitLabel,
  ZoneAnswer,
} from '../seawolf';

export type GameKey = 'redrock' | 'seawolf' | 'sfl-island' | 'sfl-classic';

export interface RubricItem {
  id: string;
  label: string;
  /** Puntos posibles (en puntos, con un decimal como mucho). */
  max: number;
  earned: number;
  /** Explicación de la puntuación de este punto (en español). */
  why?: string;
  /** Tipo de error, para estadísticas y consejos. */
  errorType?: string;
}

export interface RubricPart {
  key: string;
  label: string;
  max: number;
  earned: number;
  rule: string;
  items: RubricItem[];
}

export interface GameRubric {
  game: GameKey;
  label: string;
  max: number;
  earned: number;
  parts: RubricPart[];
}

// ---------------------------------------------------------------- utilidades en décimas

export const T = (points: number) => Math.round(points * 10);
export const P = (tenths: number) => tenths / 10;

/** Reparte `total` (entero) entre `n` partes enteras que suman exactamente `total`. */
export function splitEven(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Reparto por mayores restos: enteros proporcionales a `weights` que suman exactamente `total`. */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (w / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k].i]++;
  return out;
}

export function part(key: string, label: string, rule: string, items: RubricItem[]): RubricPart {
  const max = P(items.reduce((s, i) => s + T(i.max), 0));
  const earned = P(items.reduce((s, i) => s + T(i.earned), 0));
  return { key, label, rule, items, max, earned };
}

export function game(g: GameKey, label: string, parts: RubricPart[]): GameRubric {
  return {
    game: g,
    label,
    parts,
    max: P(parts.reduce((s, p) => s + T(p.max), 0)),
    earned: P(parts.reduce((s, p) => s + T(p.earned), 0)),
  };
}

// ---------------------------------------------------------------- Redrock (100 puntos)

export const REDROCK_RULES = {
  journal: 'Diario (10): los 10 puntos se reparten entre las cifras necesarias; cada distractor guardado resta 1 punto (sin bajar de 0).',
  analysis: 'Análisis (27): 9 puntos por pregunta correcta dentro de la tolerancia.',
  report: 'Informe (33): 3 puntos por cada hueco del memorando, 3 por el tipo de gráfico y 3 por los valores del gráfico.',
  cases: 'Mini-casos (30): 5 puntos por mini-caso correcto.',
};

/** Qué trampa explica una respuesta numérica errónea (si coincide con un error típico). */
export function detectTrap(q: { wrongApproaches: { label: string; value: number }[]; decimals: number; tolerance: number }, raw: string | undefined): string | null {
  const v = parseUserNumber(raw ?? '');
  if (v == null) return null;
  const hit = q.wrongApproaches.find((w) => Math.abs(round(w.value, q.decimals) - v) <= Math.max(q.tolerance, 10 ** -q.decimals));
  return hit?.label ?? null;
}

export function redrockRubric(s: RedrockScenario, a: RedrockAnswers): GameRubric {
  const st = s.study;
  // Diario
  const relevant = Object.values(st.data).filter((d) => d.relevant);
  const shares = splitEven(100, relevant.length);
  const journalItems: RubricItem[] = relevant.map((d, i) => {
    const saved = a.journal.includes(d.id);
    return {
      id: `journal-${d.id}`,
      label: `Diario: ${d.label}`,
      max: P(shares[i]),
      earned: saved ? P(shares[i]) : 0,
      why: saved ? 'Cifra necesaria guardada.' : `Cifra necesaria (${d.display} ${d.unit}) que no guardaste.`,
      errorType: saved ? undefined : 'rr-journal-missing',
    };
  });
  let available = journalItems.reduce((s2, i) => s2 + T(i.earned), 0);
  for (const id of a.journal) {
    const d = st.data[id];
    if (!d || d.relevant) continue;
    const pen = Math.min(10, available);
    available -= pen;
    journalItems.push({
      id: `distractor-${id}`,
      label: `Diario: distractor «${d.label}»`,
      max: 0,
      earned: -P(pen),
      why: `Guardaste un distractor (−1 punto): ${d.note ?? 'no se necesitaba.'}`,
      errorType: 'rr-distractor',
    });
  }
  // Análisis
  const analysisItems: RubricItem[] = st.questions.map((q, i) => {
    const raw = a.analysis[q.id];
    const ok = isNumericCorrect(q, raw);
    const trap = ok ? null : detectTrap(q, raw);
    return {
      id: `analysis-${q.id}`,
      label: `Análisis: pregunta ${i + 1}`,
      max: 9,
      earned: ok ? 9 : 0,
      why: ok
        ? 'Correcta.'
        : raw
          ? `Respondiste ${raw}; la correcta era ${fmt(q.answer, q.decimals)} ${q.unit}.${trap ? ` Tu resultado coincide con el error típico «${trap}».` : ''}`
          : 'Sin responder.',
      errorType: ok ? undefined : trap ? `rr-trap:${trap}` : raw ? 'rr-analysis-wrong' : 'rr-blank',
    };
  });
  // Informe
  const reportItems: RubricItem[] = st.blanks.map((b, i) => {
    const raw = a.blanks[b.id];
    const ok = gradeBlank(b, raw);
    return {
      id: `report-${b.id}`,
      label: `Informe: hueco ${i + 1}`,
      max: 3,
      earned: ok ? 3 : 0,
      why: ok ? 'Correcto.' : b.explanation,
      errorType: ok ? undefined : raw ? 'rr-report-wrong' : 'rr-blank',
    };
  });
  const ct = st.chartTask;
  const typeOk = a.chartType === ct.correctType;
  const valuesOk = ct.elements.every((e, i) => a.chartValues[i] === e.correctIndex);
  reportItems.push(
    { id: 'report-chart-type', label: 'Informe: tipo de gráfico', max: 3, earned: typeOk ? 3 : 0, why: typeOk ? 'Correcto.' : ct.explanation, errorType: typeOk ? undefined : 'rr-chart-type' },
    { id: 'report-chart-values', label: 'Informe: valores del gráfico', max: 3, earned: valuesOk ? 3 : 0, why: valuesOk ? 'Correctos.' : ct.explanation, errorType: valuesOk ? undefined : 'rr-chart-values' },
  );
  // Mini-casos
  const caseItems: RubricItem[] = s.cases.map((c, i) => {
    const ok = gradeCase(c, a.cases[c.id]);
    return {
      id: `case-${c.id}`,
      label: `Mini-caso ${i + 1}: ${c.typeLabel}`,
      max: 5,
      earned: ok ? 5 : 0,
      why: ok ? 'Correcto.' : `${c.trap}`,
      errorType: ok ? undefined : `case:${c.type}`,
    };
  });
  return game('redrock', 'Redrock Study', [
    part('journal', 'Diario', REDROCK_RULES.journal, journalItems),
    part('analysis', 'Análisis', REDROCK_RULES.analysis, analysisItems),
    part('report', 'Informe', REDROCK_RULES.report, reportItems),
    part('cases', 'Mini-casos', REDROCK_RULES.cases, caseItems),
  ]);
}

// ---------------------------------------------------------------- Sea Wolf (100 puntos por sitio)

export const SEAWOLF_RULES = {
  profile: 'Perfil (10): 5 puntos por cada característica correcta. Correctas: el rasgo deseado del sitio y el atributo más exigente (el rango más alejado del centro de la escala).',
  classification:
    'Clasificación (20): 2 puntos por microbio. Regla: «Este sitio» si no tiene el rasgo no deseado y además tiene el rasgo deseado o todos sus atributos están a ≤2 puntos del rango (y queda hueco en el pool); si no, «Siguiente sitio» si encaja así en el sitio siguiente; si no, «Rechazar».',
  pool: 'Pool (20): todo o nada. 20 puntos si tu pool final contiene al menos un trío válido.',
  treatment: 'Tratamiento (50): 10 puntos por cada comprobación superada (3 atributos, rasgo deseado y rasgo no deseado). 0 si no eliges exactamente 3.',
};

const decisionLabel: Record<string, string> = { site: 'Este sitio', next: 'Siguiente sitio', reject: 'Rechazar' };

export function hasValidTrio(zone: SeaWolfScenario['zones'][number], ms: Microbe[]): boolean {
  for (let i = 0; i < ms.length; i++)
    for (let j = i + 1; j < ms.length; j++) for (let k = j + 1; k < ms.length; k++) if (checkSelection(zone, [ms[i], ms[j], ms[k]]).valid) return true;
  return false;
}

export function seaWolfRubric(s: SeaWolfScenario, answers: ZoneAnswer[]): GameRubric {
  const index = microbeIndex(s);
  const parts: RubricPart[] = [];
  s.zones.forEach((z, zi) => {
    const ans = answers[zi];
    const next = s.zones[zi + 1] ?? null;
    const site = `Sitio ${zi + 1}`;
    // Perfil
    const correct = correctProfile(z);
    const opts = profileOptions(z);
    const label = (k: string) => opts.find((o) => o.key === k)?.label ?? k;
    const profileItems: RubricItem[] = correct.map((k, i) => {
      const ok = ans.profile.includes(k);
      return {
        id: `sw${zi}-profile-${i}`,
        label: `${site} · perfil: «${label(k)}»`,
        max: 5,
        earned: ok ? 5 : 0,
        why: ok ? 'Característica correcta elegida.' : `Debías elegir «${label(k)}». Elegiste: ${ans.profile.map(label).join(', ') || 'nada'}.`,
        errorType: ok ? undefined : 'sw-profile',
      };
    });
    // Clasificación
    let poolCount = ans.reviewKept.length;
    const classItems: RubricItem[] = z.classification.map((m, mi) => {
      const poolFull = poolCount >= POOL_START_MAX;
      const exp = expectedDecision(z, next, m, poolFull);
      const chosen = ans.decisions[m.id];
      if (chosen === 'site') poolCount++;
      const ok = chosen === exp.expected;
      const detail = z.attributes.map((a, i) => `${a} ${m.attrs[i]} (rango ${z.ranges[i][0]}–${z.ranges[i][1]})`).join(', ');
      const motive =
        exp.expected === 'site'
          ? m.traits.includes(z.required)
            ? `tiene el rasgo deseado «${traitLabel(z.required, z.lang)}»`
            : 'todos sus atributos están a ≤2 puntos del rango y no tiene el rasgo no deseado'
          : exp.expected === 'next'
            ? `${exp.here.fits ? 'el pool estaba lleno' : `aquí no encaja (${exp.here.reasons.join('; ')})`}, pero encaja en el sitio siguiente`
            : `${exp.here.fits ? 'el pool estaba lleno' : `no encaja aquí (${exp.here.reasons.join('; ')})`}${next ? ` ni en el sitio siguiente (${exp.there?.reasons.join('; ')})` : ' y no hay sitio siguiente'}`;
      return {
        id: `sw${zi}-class-${m.id}`,
        label: `${site} · clasificación n.º ${mi + 1}: ${m.name}`,
        max: 2,
        earned: ok ? 2 : 0,
        why: ok
          ? `Correcto: «${decisionLabel[exp.expected]}».`
          : `Elegiste «${chosen ? decisionLabel[chosen] : 'nada'}»; tocaba «${decisionLabel[exp.expected]}» porque ${motive}. Valores: ${detail}; rasgo «${traitLabel(m.traits[0], z.lang)}».`,
        errorType: ok ? undefined : `sw-classify:${exp.expected}`,
      };
    });
    // Pool
    const pool = ans.pool.map((id) => index.get(id)!).filter(Boolean);
    const poolOk = hasValidTrio(z, pool);
    const poolItems: RubricItem[] = [
      {
        id: `sw${zi}-pool`,
        label: `${site} · pool con trío válido`,
        max: 20,
        earned: poolOk ? 20 : 0,
        why: poolOk ? 'Tu pool contenía al menos un trío válido.' : 'Tu pool final no contenía ningún trío válido.',
        errorType: poolOk ? undefined : 'sw-pool',
      },
    ];
    // Tratamiento
    const sel = ans.selected.map((id) => index.get(id)!).filter(Boolean);
    const chk = checkSelection(z, sel);
    const rules = [...z.attributes, 'Rasgo deseado', 'Rasgo no deseado'];
    const treatItems: RubricItem[] = rules.map((r, ri) => {
      const failed = sel.length !== 3 || chk.violations.some((v) => (ri < z.attributes.length ? v.rule === r : v.rule === r));
      return {
        id: `sw${zi}-treat-${ri}`,
        label: `${site} · tratamiento: ${r}`,
        max: 10,
        earned: failed ? 0 : 10,
        why: failed ? (sel.length !== 3 ? `Elegiste ${sel.length} microbios en vez de 3.` : chk.violations.find((v) => v.rule === r)?.detail ?? 'Incumplida.') : 'Cumplida.',
        errorType: failed ? (ri < z.attributes.length ? 'sw-treat-range' : ri === z.attributes.length ? 'sw-treat-required' : 'sw-treat-prohibited') : undefined,
      };
    });
    parts.push(
      part(`sw${zi}-profile`, `${site} · Perfil`, SEAWOLF_RULES.profile, profileItems),
      part(`sw${zi}-classification`, `${site} · Clasificación`, SEAWOLF_RULES.classification, classItems),
      part(`sw${zi}-pool`, `${site} · Pool`, SEAWOLF_RULES.pool, poolItems),
      part(`sw${zi}-treatment`, `${site} · Tratamiento`, SEAWOLF_RULES.treatment, treatItems),
    );
  });
  return game('seawolf', 'Sea Wolf', parts);
}

// ---------------------------------------------------------------- total y puntos perdidos

export interface PointsOff {
  game: GameKey;
  gameLabel: string;
  part: string;
  item: RubricItem;
  lost: number;
  /** Puntos porcentuales de la nota global que se pierden aquí. */
  pct: number;
}

export interface Overall {
  max: number;
  earned: number;
  /** Nota global en %, con un decimal. */
  scorePct: number;
  pointsOff: PointsOff[];
}

/**
 * Nota global y lista de puntos perdidos ordenada de mayor a menor.
 * Los porcentajes se reparten por mayores restos para que sumen EXACTAMENTE 100 − nota.
 */
export function overall(games: GameRubric[]): Overall {
  const maxT = games.reduce((s, g) => s + T(g.max), 0);
  const earnedT = games.reduce((s, g) => s + T(g.earned), 0);
  const scoreTenths = maxT ? Math.round((earnedT / maxT) * 1000) : 0;
  const lostList = games.flatMap((g) =>
    g.parts.flatMap((p) => p.items.map((item) => ({ game: g.game, gameLabel: g.label, part: p.label, item, lostT: T(item.max) - T(item.earned) }))),
  );
  const losing = lostList.filter((l) => l.lostT > 0);
  const pctT = apportion(1000 - scoreTenths, losing.map((l) => l.lostT));
  const pointsOff = losing
    .map((l, i) => ({ game: l.game, gameLabel: l.gameLabel, part: l.part, item: l.item, lost: P(l.lostT), pct: pctT[i] / 10 }))
    .sort((a, b) => b.lost - a.lost || b.pct - a.pct);
  return { max: P(maxT), earned: P(earnedT), scorePct: scoreTenths / 10, pointsOff };
}

/** Recuento de tipos de error (para la evolución entre intentos). */
export function errorCounts(games: GameRubric[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of games)
    for (const p of g.parts)
      for (const i of p.items) {
        if (!i.errorType || T(i.max) - T(i.earned) <= 0) continue;
        const key = i.errorType.split(':')[0] === 'rr-trap' ? 'rr-trap' : i.errorType;
        out[key] = (out[key] ?? 0) + 1;
      }
  return out;
}

export const ERROR_LABELS: Record<string, string> = {
  'rr-journal-missing': 'Redrock: cifra necesaria sin guardar',
  'rr-distractor': 'Redrock: distractor guardado',
  'rr-trap': 'Redrock: caer en una trampa del material',
  'rr-analysis-wrong': 'Redrock: respuesta de Análisis incorrecta',
  'rr-report-wrong': 'Redrock: hueco del Informe incorrecto',
  'rr-chart-type': 'Redrock: tipo de gráfico',
  'rr-chart-values': 'Redrock: valores del gráfico',
  'rr-blank': 'Redrock: sin responder',
  'case:pct_change': 'Mini-caso: cambio porcentual',
  'case:pp_vs_pct': 'Mini-caso: puntos porcentuales vs. %',
  'case:weighted_mean': 'Mini-caso: media ponderada',
  'case:ratio_units': 'Mini-caso: proporciones y unidades',
  'case:projection': 'Mini-caso: crecimiento compuesto vs. simple',
  'case:chart_read': 'Mini-caso: lectura de gráficos',
  'sw-profile': 'Sea Wolf: perfil',
  'sw-classify:site': 'Sea Wolf: no guardar un microbio que encajaba',
  'sw-classify:next': 'Sea Wolf: no aplazar al siguiente sitio',
  'sw-classify:reject': 'Sea Wolf: guardar o aplazar un microbio que había que rechazar',
  'sw-pool': 'Sea Wolf: pool sin trío válido',
  'sw-treat-range': 'Sea Wolf: media fuera de rango',
  'sw-treat-required': 'Sea Wolf: falta el rasgo deseado',
  'sw-treat-prohibited': 'Sea Wolf: rasgo no deseado en el tratamiento',
  'sfl-explore-missed': 'SFL: pregunta clave sin hacer',
  'sfl-assign': 'SFL: asignación incorrecta',
  'sfl-assign-intuition': 'SFL: asignación sin la información necesaria',
  'sfl-reason': 'SFL: motivo de la asignación',
  'sfl-support-ok': 'SFL: respuesta de apoyo aceptable pero no la mejor',
  'sfl-support-poor': 'SFL: mala respuesta de apoyo',
  'sfl-urgent': 'SFL: no atender primero lo urgente',
  'sfl-reflect': 'SFL: reflexión equivocada con información',
  'sfl-reflect-guess': 'SFL: reflexión por intuición',
  'sfl-blank': 'SFL: sin responder',
  'sfl-c-ranking': 'SFL Classic: ranking sin la puntuación ponderada',
  'sfl-c-dependency': 'SFL Classic: ranking que incumple una dependencia',
  'sfl-c-metric': 'SFL Classic: indicador de éxito',
  'sfl-c-threshold': 'SFL Classic: umbral para escalar',
  'sfl-c-baseline': 'SFL Classic: datos contradictorios',
  'sfl-c-expert': 'SFL Classic: experto que no habla',
  'sfl-c-depth': 'SFL Classic: profundidad del análisis',
  'sfl-c-exception': 'SFL Classic: petición de excepción',
  'sfl-c-scope': 'SFL Classic: control del alcance',
  'sfl-c-interim': 'SFL Classic: comunicación a mitad',
  'sfl-c-segments': 'SFL Classic: factor por segmentos',
  'sfl-c-update': 'SFL Classic: datos nuevos',
  'sfl-c-risk': 'SFL Classic: riesgo o bloqueo',
  'sfl-c-scale': 'SFL Classic: decisión de escalar',
};
