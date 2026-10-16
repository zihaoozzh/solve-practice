// Análisis del proceso a partir del registro: patrones, tiempos, pérdida de soluciones en Sea Wolf y consejos.
// Funciones puras (testeables): no tocan el DOM.

import { ISLAND_TIPS } from '../sfl/islandGrade';
import { CLASSIC_TIPS } from '../sfl/classic';
import type { RecEvent, SessionLog } from '../lib/recorder';
import { fmtTime } from '../lib/format';
import { checkSelection, Microbe, microbeIndex, POOL_START_MAX, SeaWolfScenario, Zone, ZoneAnswer } from '../seawolf';
import type { RedrockScenario } from '../redrock/types';
import type { RedrockAnswers } from '../redrock';
import type { GameRubric, RubricItem } from './rubric';
import { ERROR_LABELS } from './rubric';
import { phaseLabel } from './context';

export interface Pattern {
  id: string;
  title: string;
  detail: string;
  evidence: string[];
  severity: 'alta' | 'media' | 'baja';
}

// ---------------------------------------------------------------- Sea Wolf: ¿cuándo se perdió la solución?

export interface PoolLoss {
  /** Paso en que el pool dejó de poder contener un trío válido. */
  step: string;
  /** Microbio cuya decisión hizo imposible la solución y qué habría salvado la situación. */
  culprit: Microbe;
  saver: Microbe | null;
  explanation: string;
}

/** ¿Existe un trío válido eligiendo del pool, hasta `cap` microbios más de la clasificación restante y como mucho uno por ronda restante? */
function achievable(zone: Zone, pool: Microbe[], restClass: Microbe[], cap: number, restRounds: Microbe[][]): string[] | null {
  const tagged: { m: Microbe; src: 'pool' | 'class' | number }[] = [
    ...pool.map((m) => ({ m, src: 'pool' as const })),
    ...restClass.map((m) => ({ m, src: 'class' as const })),
    ...restRounds.flatMap((r, ri) => r.map((m) => ({ m, src: ri }))),
  ];
  const n = tagged.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const t = [tagged[i], tagged[j], tagged[k]];
        if (t.filter((x) => x.src === 'class').length > cap) continue;
        const rs = t.filter((x) => typeof x.src === 'number').map((x) => x.src);
        if (new Set(rs).size !== rs.length) continue;
        if (checkSelection(zone, t.map((x) => x.m)).valid) return t.map((x) => x.m.id);
      }
  return null;
}

export function poolLoss(zone: Zone, ans: ZoneAnswer, index: Map<string, Microbe>): PoolLoss | null {
  const get = (id: string) => index.get(id)!;
  const pool: Microbe[] = ans.reviewKept.map(get).filter(Boolean);
  const cls = zone.classification;
  let prevTrio = achievable(zone, pool, cls, POOL_START_MAX - pool.length, zone.rounds);
  if (!prevTrio) return null; // ni siquiera al empezar había solución alcanzable
  for (let i = 0; i < cls.length; i++) {
    const m = cls[i];
    const d = ans.decisions[m.id];
    if (d === 'site') pool.push(m);
    const now = achievable(zone, pool, cls.slice(i + 1), POOL_START_MAX - pool.length, zone.rounds);
    if (!now) {
      const saverId = d === 'site' ? prevTrio.find((id) => cls.slice(i + 1).some((x) => x.id === id)) : prevTrio.includes(m.id) ? m.id : null;
      return {
        step: `clasificación n.º ${i + 1}`,
        culprit: m,
        saver: saverId ? get(saverId) : null,
        explanation:
          d === 'site'
            ? `Al guardar ${m.name} llenaste el pool con un microbio que no servía y ya no quedaba hueco para completar ningún trío válido${saverId ? ` (faltaba sitio para ${get(saverId).name})` : ''}.`
            : `Al ${d === 'next' ? 'enviar al siguiente sitio' : d === 'reject' ? 'rechazar' : 'no clasificar'} ${m.name} perdiste el último trío válido posible (${prevTrio.map((id) => get(id).name).join(', ')}).`,
      };
    }
    prevTrio = now;
  }
  for (let r = 0; r < zone.rounds.length; r++) {
    const picked = ans.roundPicks[r] ? get(ans.roundPicks[r]!) : null;
    if (picked) pool.push(picked);
    const now = achievable(zone, pool, [], 0, zone.rounds.slice(r + 1));
    if (!now) {
      const saverId = prevTrio.find((id) => zone.rounds[r].some((x) => x.id === id)) ?? null;
      return {
        step: `ronda ${r + 1} de «elige 1 de 3»`,
        culprit: picked ?? zone.rounds[r][0],
        saver: saverId ? get(saverId) : null,
        explanation: `En la ronda ${r + 1} elegiste ${picked?.name ?? 'nada'}${saverId ? ` en vez de ${get(saverId).name}, que completaba el trío ${prevTrio.map((id) => get(id).name).join(', ')}` : ''}.`,
      };
    }
    prevTrio = now;
  }
  return null;
}

// ---------------------------------------------------------------- tiempos

export interface PhaseTime {
  name: string;
  sec: number;
  refSec?: number;
}

export interface SlowDecision {
  label: string;
  sec: number;
  correct: boolean | null;
}

export interface TimeAnalysis {
  phases: PhaseTime[];
  slowest: SlowDecision[];
  idle: { fromSec: number; sec: number; phase: string }[];
}

/** Fase activa en el instante t (según los eventos de fase). */
export function phaseAt(events: RecEvent[], t: number): string {
  let cur = '—';
  for (const e of events) {
    if (e.k !== 'phase') continue;
    if (e.t <= t) cur = e.name;
    else break;
  }
  return cur;
}

export function timeAnalysis(log: SessionLog | null, refs: Record<string, number>, correctness: Map<string, boolean>, labels: Map<string, string>): TimeAnalysis {
  if (!log) return { phases: [], slowest: [], idle: [] };
  const ev = log.events;
  const phases: PhaseTime[] = [];
  const marks = ev.filter((e): e is Extract<RecEvent, { k: 'phase' }> => e.k === 'phase');
  const end = ev.length ? ev[ev.length - 1].t : 0;
  marks.forEach((m, i) => {
    const sec = ((marks[i + 1]?.t ?? end) - m.t) / 1000;
    const existing = phases.find((p) => p.name === m.name);
    if (existing) existing.sec += sec;
    else phases.push({ name: m.name, sec, refSec: refs[m.name] });
  });
  const decisions = ev.filter((e): e is Extract<RecEvent, { k: 'decision' }> => e.k === 'decision');
  const slowest = decisions
    .map((d) => {
      const key = `${d.kind}|${d.item}`;
      return { label: labels.get(key) ?? `${d.kind} ${d.item}`, sec: d.ms / 1000, correct: correctness.has(key) ? correctness.get(key)! : null };
    })
    .sort((a, b) => b.sec - a.sec)
    .slice(0, 5);
  const idle = ev
    .filter((e): e is Extract<RecEvent, { k: 'idle' }> => e.k === 'idle')
    .map((e) => ({ fromSec: e.from / 1000, sec: e.ms / 1000, phase: phaseAt(ev, e.from) }))
    .sort((a, b) => b.sec - a.sec);
  return { phases, slowest, idle };
}

// ---------------------------------------------------------------- patrones

export interface PatternInput {
  log: SessionLog | null;
  redrock?: { scenario: RedrockScenario; answers: RedrockAnswers };
  seawolf?: { scenario: SeaWolfScenario; answers: ZoneAnswer[] };
  /** Corrección de cada decisión registrada: clave `${kind}|${item}`. */
  correctness: Map<string, boolean>;
  labels: Map<string, string>;
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const KIND_LABELS: Record<string, string> = {
  journal: 'guardar y quitar cifras del diario',
  analysis: 'respuestas de Análisis',
  report: 'huecos del Informe',
  chart: 'tarea de gráfico',
  case: 'respuestas de los mini-casos',
  'sw-profile': 'perfil de Sea Wolf',
  'sw-treatment': 'selección del tratamiento de Sea Wolf',
  'sfl-assign': 'asignaciones del SFL',
  'sfl-event': 'situaciones de equipo del SFL',
  'sfl-decision': 'decisiones del SFL',
};

export function detectPatterns(input: PatternInput): Pattern[] {
  const out: Pattern[] = [];
  const ev = input.log?.events ?? [];

  // 1 y 2. Redrock: miras datos que no usas / usas datos que apenas miraste
  if (input.redrock) {
    const data = input.redrock.scenario.study.data;
    const dwell = new Map<string, number>();
    for (const e of ev) if (e.k === 'hover' && e.target.startsWith('datum:')) dwell.set(e.target.slice(6), (dwell.get(e.target.slice(6)) ?? 0) + e.ms);
    const saved = new Set(input.redrock.answers.journal);
    const lookedNotUsed = [...dwell.entries()].filter(([id, ms]) => ms >= 800 && !saved.has(id) && data[id]);
    const relevantMissed = lookedNotUsed.filter(([id]) => data[id].relevant);
    const distractorTime = [...dwell.entries()].filter(([id]) => data[id] && !data[id].relevant).reduce((s, [, ms]) => s + ms, 0);
    if (relevantMissed.length || lookedNotUsed.length >= 4) {
      out.push({
        id: 'look-unused',
        title: 'Miras datos que luego no usas',
        detail: `Te detuviste en ${lookedNotUsed.length} cifras que no guardaste${relevantMissed.length ? `, ${relevantMissed.length} de ellas necesarias` : ''}. En total, ${Math.round(distractorTime / 1000)} s mirando distractores.`,
        evidence: lookedNotUsed.slice(0, 6).map(([id, ms]) => `${data[id].label} (${(ms / 1000).toFixed(1)} s${data[id].relevant ? ', necesaria' : ''})`),
        severity: relevantMissed.length ? 'alta' : 'media',
      });
    }
    const blind = [...saved].filter((id) => (dwell.get(id) ?? 0) < 300 && data[id]);
    if (input.log && blind.length >= 3) {
      out.push({
        id: 'use-unlooked',
        title: 'Guardas datos que apenas miraste',
        detail: `Guardaste ${blind.length} cifras sin detenerte en ellas ni 0,3 s. ${blind.filter((id) => !data[id].relevant).length} eran distractores.`,
        evidence: blind.slice(0, 6).map((id) => `${data[id].label}${data[id].relevant ? '' : ' (distractor)'}`),
        severity: blind.some((id) => !data[id].relevant) ? 'media' : 'baja',
      });
    }
  }

  // 3. Cambios de opinión por tipo de decisión
  const changes = new Map<string, number>();
  for (const e of ev) if (e.k === 'change') changes.set(e.kind, (changes.get(e.kind) ?? 0) + 1);
  for (const [kind, n] of changes) {
    if (n < 3) continue;
    out.push({
      id: `mind-${kind}`,
      title: `Cambias mucho de opinión en ${KIND_LABELS[kind] ?? kind}`,
      detail: `${n} cambios de opinión registrados. Decide con una regla antes de mirar las opciones y cambia solo si aparece información nueva.`,
      evidence: ev
        .filter((e): e is Extract<RecEvent, { k: 'change' }> => e.k === 'change' && e.kind === kind)
        .slice(0, 5)
        .map((e) => `${input.labels.get(`${e.kind}|${e.item}`) ?? e.item}: ${e.from || '—'} → ${e.to || '—'}`),
      severity: n >= 6 ? 'alta' : 'media',
    });
  }

  // 4. Decides demasiado rápido en las que fallas
  const timed = ev.filter((e): e is Extract<RecEvent, { k: 'decision' }> => e.k === 'decision' && input.correctness.has(`${e.kind}|${e.item}`));
  const wrong = timed.filter((d) => !input.correctness.get(`${d.kind}|${d.item}`));
  const right = timed.filter((d) => input.correctness.get(`${d.kind}|${d.item}`));
  const mW = median(wrong.map((d) => d.ms));
  const mR = median(right.map((d) => d.ms));
  if (wrong.length >= 2 && right.length >= 2 && mW < 0.6 * mR) {
    out.push({
      id: 'fast-wrong',
      title: 'Decides demasiado rápido en las decisiones que fallas',
      detail: `Tus decisiones incorrectas duraron de mediana ${(mW / 1000).toFixed(1)} s, frente a ${(mR / 1000).toFixed(1)} s en las correctas.`,
      evidence: wrong
        .sort((a, b) => a.ms - b.ms)
        .slice(0, 5)
        .map((d) => `${input.labels.get(`${d.kind}|${d.item}`) ?? d.item}: ${(d.ms / 1000).toFixed(1)} s`),
      severity: 'alta',
    });
  }

  // 5. Sea Wolf: dónde se perdió la posibilidad de un trío válido
  if (input.seawolf) {
    const index = microbeIndex(input.seawolf.scenario);
    input.seawolf.scenario.zones.forEach((z, zi) => {
      const loss = poolLoss(z, input.seawolf!.answers[zi], index);
      if (!loss) return;
      out.push({
        id: `sw-pool-lost-${zi}`,
        title: `Sitio ${zi + 1}: tu pool se quedó sin solución en la ${loss.step}`,
        detail: `${loss.explanation}${loss.saver ? ` Habría salvado la situación: ${loss.saver.name} (${loss.saver.attrs.join(' / ')}).` : ''}`,
        evidence: [],
        severity: 'alta',
      });
    });
  }

  // 6. Inactividad
  const idle = ev.filter((e): e is Extract<RecEvent, { k: 'idle' }> => e.k === 'idle');
  if (idle.length) {
    const total = idle.reduce((s, e) => s + e.ms, 0);
    out.push({
      id: 'idle',
      title: 'Periodos sin actividad',
      detail: `${idle.length} periodo${idle.length === 1 ? '' : 's'} de más de 10 s sin mover el ratón ni teclear (${fmtTime(total / 1000)} en total).`,
      evidence: idle
        .slice()
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 5)
        .map((e) => `${fmtTime(e.from / 1000)}: ${(e.ms / 1000).toFixed(0)} s en ${phaseLabel(phaseAt(ev, e.from))}`),
      severity: total > 120_000 ? 'alta' : 'baja',
    });
  }

  // 7. Calculadora: resultados que no acaban en ninguna respuesta
  if (input.redrock) {
    const calcs = ev.filter((e): e is Extract<RecEvent, { k: 'calc' }> => e.k === 'calc');
    if (calcs.length) {
      const a = input.redrock.answers;
      const finals = [...Object.values(a.analysis), ...Object.values(a.blanks), ...Object.values(a.cases)].map((v) => Number(String(v).replace(',', '.'))).filter(Number.isFinite);
      const used = calcs.filter((c) => {
        const r = Number(c.result);
        return finals.some((f) => Math.abs(f - r) < 0.006 || Math.abs(f - Math.round(r * 100) / 100) < 0.006 || Math.abs(Math.abs(f) - Math.abs(r)) < 0.006);
      });
      out.push({
        id: 'calc-use',
        title: 'Uso de la calculadora',
        detail: `${calcs.length} operación${calcs.length === 1 ? '' : 'es'}; ${used.length} acabaron en una respuesta.${calcs.length - used.length >= 4 ? ' Muchos cálculos no llegan a ninguna respuesta: planifica la fórmula antes de teclear.' : ''}`,
        evidence: calcs.slice(-5).map((c) => `${c.expr} = ${c.result}${used.includes(c) ? ' ✓' : ''}`),
        severity: calcs.length - used.length >= 4 ? 'media' : 'baja',
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- consejos

/** Tres consejos concretos, a partir de los puntos perdidos y de los patrones (no genéricos). */
export function makeTips(games: GameRubric[], patterns: Pattern[]): string[] {
  const lostBy = new Map<string, { lost: number; items: RubricItem[] }>();
  for (const g of games)
    for (const p of g.parts)
      for (const i of p.items) {
        const lost = i.max - i.earned;
        if (lost <= 0 || !i.errorType) continue;
        const key = i.errorType.startsWith('rr-trap') ? 'rr-trap' : i.errorType;
        const cur = lostBy.get(key) ?? { lost: 0, items: [] };
        cur.lost += lost;
        cur.items.push(i);
        lostBy.set(key, cur);
      }
  const tips: { score: number; text: string }[] = [];
  for (const [key, { lost, items }] of lostBy) {
    const ex = items[0];
    const n = items.length;
    let text: string;
    switch (key) {
      case 'rr-trap':
        text = `En Análisis caíste en una trampa del material (${items.map((i) => i.errorType!.split(':')[1]).join('; ')}). Antes de calcular, relee las notas al pie y las unidades de cada cifra del diario.`;
        break;
      case 'rr-journal-missing':
        text = `Te faltaron ${n} cifras necesarias en el diario (p. ej. ${ex.label.replace('Diario: ', '')}). Antes de pasar a Análisis, repasa el objetivo y comprueba que tienes el dato de cada sitio y año que pide.`;
        break;
      case 'rr-distractor':
        text = `Guardaste ${n} distractores. Para cada cifra pregúntate si la necesita alguna de las comparaciones del objetivo (sitio, año, serie); si no, no la guardes.`;
        break;
      case 'sw-classify:reject':
        text = `Guardaste o aplazaste ${n} microbios que había que rechazar (p. ej. ${ex.label.split(': ').pop()}). Rechaza primero por el rasgo no deseado y después por valores a más de 2 puntos del rango.`;
        break;
      case 'sw-classify:site':
        text = `Rechazaste o aplazaste ${n} microbios que encajaban en el sitio (p. ej. ${ex.label.split(': ').pop()}). Si tiene el rasgo deseado o todos sus valores están cerca del rango, guárdalo.`;
        break;
      case 'sw-classify:next':
        text = `No aplazaste ${n} microbios que encajaban en el siguiente sitio. Usa la pista del siguiente sitio para no perderlos.`;
        break;
      case 'sw-pool':
        text = `En ${n} sitio${n === 1 ? '' : 's'} tu pool acabó sin ningún trío válido. Antes de cada ronda, comprueba con sumas qué pareja te falta completar y elige el microbio que la completa.`;
        break;
      case 'sw-treat-range':
        text = `Fallaste ${n} comprobaciones de rango en el tratamiento. Convierte cada rango de media en rango de suma (×3) y suma los tres valores antes de confirmar.`;
        break;
      case 'sw-treat-required':
      case 'sw-treat-prohibited':
        text = 'Tu tratamiento incumplió una regla de rasgos. Comprueba los rasgos de los 3 elegidos antes de confirmar: es lo más rápido de verificar.';
        break;
      case 'sw-profile':
        text = 'En el perfil, elige el rasgo deseado del sitio y el atributo cuyo rango está más lejos del centro de la escala.';
        break;
      case 'rr-blank':
        text = `Dejaste ${n} respuesta${n === 1 ? '' : 's'} de Redrock sin contestar (p. ej. ${ex.label}). Vigila la guía de tiempo de cada fase y, si te atascas, deja una estimación antes de avanzar: en blanco siempre vale 0.`;
        break;
      case 'rr-analysis-wrong':
        text = `En ${ex.label.toLowerCase()} ${ex.why?.replace('Respondiste', 'respondiste') ?? ''} Escribe la fórmula con los datos del diario antes de teclear y comprueba el signo y las unidades del resultado.`;
        break;
      case 'rr-report-wrong':
        text = `Fallaste ${n} hueco${n === 1 ? '' : 's'} del Informe (p. ej. ${ex.label}: ${ex.why ?? ''}). Rellena el memorando a partir de tus resultados de Análisis, en el mismo orden.`;
        break;
      case 'case:pct_change':
        text = 'En el mini-caso de cambio porcentual divide siempre entre el valor INICIAL: (final − inicial) / inicial × 100.';
        break;
      case 'case:pp_vs_pct':
        text = 'Lee si el mini-caso pide puntos porcentuales (resta directa de tasas) o cambio relativo (resta dividida entre la tasa inicial): es la trampa de ese caso.';
        break;
      case 'case:weighted_mean':
        text = 'En la media ponderada multiplica cada tasa por su número de individuos y divide entre el total; mira si alguna nota al pie excluye un grupo.';
        break;
      case 'case:ratio_units':
        text = 'Antes de comparar densidades, pasa todas las superficies a la misma unidad (1 km² = 100 ha).';
        break;
      case 'case:projection':
        text = 'En las proyecciones fíjate en si el enunciado da un % anual (compuesto: ×(1+r) cada año) o un aumento fijo (simple: + la misma cantidad cada año), y cuenta bien los años.';
        break;
      case 'case:chart_read':
        text = 'En la lectura de gráficos calcula la diferencia de cada tramo entre años consecutivos (absoluta o porcentual, según pida) antes de elegir.';
        break;
      default:
        text = ISLAND_TIPS[key] ? ISLAND_TIPS[key](n) : CLASSIC_TIPS[key] ? CLASSIC_TIPS[key](n) : `${ERROR_LABELS[key] ?? key}: ${ex.why ?? ''}`;
    }
    tips.push({ score: lost, text });
  }
  const fast = patterns.find((p) => p.id === 'fast-wrong');
  if (fast) tips.push({ score: 15, text: `${fast.detail} Date 3–4 segundos más en esas decisiones aplicando la regla paso a paso.` });
  const unused = patterns.find((p) => p.id === 'look-unused' && p.severity === 'alta');
  if (unused) tips.push({ score: 12, text: `${unused.detail} Si una cifra te hace dudar, guárdala: luego puedes quitarla antes de pasar a Análisis.` });
  return tips
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((t) => t.text);
}
