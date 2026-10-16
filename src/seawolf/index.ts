import { createRng, Rng } from '../lib/rng';
import type { Difficulty } from '../redrock/types';
import type { Lang } from '../lib/history';

// Mecánica (ver research/solve-2026.md, sección 4; todo es [web de preparación] salvo que se indique):
// - 3 sitios; en cada uno: clasificación de 10 microbios uno a uno ("este sitio" / "siguiente sitio" / "rechazar"),
//   pool de hasta 6 tras la clasificación, 4 rondas de "elige 1 de 3" (pool hasta 10) y tratamiento de 3.
// - Cada microbio tiene 3 atributos enteros 1–10 y un único rasgo de 4 posibles.
// - Reglas por sitio: la MEDIA de los 3 microbios en cada atributo dentro del rango; al menos uno con el rasgo
//   deseado y ninguno con el no deseado. Eficacia = 100 % − 20 % por cada una de las 5 comprobaciones fallidas.
// - Las decisiones son definitivas; no existe una acción de "quitar" un microbio del pool.

export interface TraitDef {
  key: string;
  label: string;
  labels: Record<Lang, string>;
  color: string;
  shape: 'star' | 'ring' | 'wave' | 'hex' | 'sun' | 'spike' | 'pair' | 'square';
}

const td = (key: string, es: string, en: string, color: string, shape: TraitDef['shape']): TraitDef => ({ key, label: es, labels: { es, en }, color, shape });

export const TRAITS: TraitDef[] = [
  td('lumin', 'Bioluminiscente', 'Bioluminescent', '#c99a06', 'star'),
  td('spore', 'Formador de esporas', 'Spore-forming', '#6d52e0', 'ring'),
  td('motile', 'Móvil', 'Motile', '#1f7f93', 'wave'),
  td('biofilm', 'Formador de biopelícula', 'Biofilm-forming', '#4c8c2f', 'hex'),
  td('photo', 'Fotosintético', 'Photosynthetic', '#d46a00', 'sun'),
  td('aggr', 'Agresivo', 'Aggressive', '#c0392b', 'spike'),
  td('symb', 'Simbiótico', 'Symbiotic', '#b0306f', 'pair'),
  td('metal', 'Captador de metales', 'Metal-binding', '#4f6470', 'square'),
];

export const ATTRIBUTES_I18N: Record<Lang, string[]> = {
  es: ['Absorción de toxinas', 'Tasa de crecimiento', 'Tolerancia térmica', 'Tolerancia a la salinidad', 'Eficiencia de oxígeno', 'Resistencia al pH'],
  en: ['Toxin absorption', 'Growth rate', 'Temperature tolerance', 'Salinity tolerance', 'Oxygen efficiency', 'pH resilience'],
};
export const ATTRIBUTES = ATTRIBUTES_I18N.es;

const ZONE_NAMES: Record<Lang, [string, string]>[] = [
  {
    es: ['Desagüe del puerto', 'Los vertidos de un puerto pesquero han elevado los residuos de nutrientes y combustible.'],
    en: ['Harbor outflow', 'Runoff from a fishing harbor has raised nutrient and fuel residues.'],
  },
  {
    es: ['Plataforma de laminarias', 'Una plataforma somera de algas laminarias sufre un vertido de aditivos plásticos.'],
    en: ['Kelp shelf', 'A shallow kelp shelf is affected by a plastic-additive spill.'],
  },
  {
    es: ['Desembocadura del estuario', 'La escorrentía agrícola se acumula donde el río se une al mar.'],
    en: ['Estuary mouth', 'Agricultural runoff accumulates where the river meets the sea.'],
  },
  {
    es: ['Laguna coralina', 'Una laguna resguardada muestra trazas de metales pesados procedentes de antiguos fondeos.'],
    en: ['Coral lagoon', 'A sheltered lagoon shows heavy-metal traces from old moorings.'],
  },
  {
    es: ['Campo de fuentes hidrotermales', 'El agua cálida y ácida que rodea las fuentes hidrotermales arrastra metales disueltos.'],
    en: ['Vent field', 'Warm, acidic water around hydrothermal vents carries dissolved metals.'],
  },
  {
    es: ['Ruta de navegación', 'Pequeños vertidos de petróleo repetidos han contaminado un corredor de aguas abiertas.'],
    en: ['Shipping lane', 'Repeated small oil releases have contaminated an open-water corridor.'],
  },
];

const NAME_A = ['Vibr', 'Thal', 'Mar', 'Pelag', 'Abyss', 'Litor', 'Nerit', 'Bent', 'Salin', 'Cora', 'Kelp', 'Tid', 'Hal', 'Brin', 'Zost'];
const NAME_B = ['ella', 'ium', 'ococcus', 'obacter', 'ira', 'ospora', 'omonas', 'ivora', 'ithrix', 'aria'];

export const CLASSIFY_N = 10;
export const POOL_START_MAX = 6;
export const ROUNDS = 4;
export const ROUND_SIZE = 3;
export const POOL_MAX = POOL_START_MAX + ROUNDS;
export const PICK = 3;

export interface Microbe {
  id: string;
  name: string;
  attrs: number[];
  /** Un único rasgo por microbio. */
  traits: string[];
}

export interface Zone {
  index: number;
  lang: Lang;
  name: string;
  description: string;
  attributes: string[];
  /** Los 4 rasgos posibles en toda la partida. */
  traitPool: string[];
  /** Rango objetivo de la MEDIA de los 3 microbios elegidos, por atributo. */
  ranges: [number, number][];
  required: string;
  prohibited: string;
  classification: Microbe[];
  rounds: Microbe[][];
  /** Tríos válidos y alcanzables con los candidatos del sitio (como mucho uno por ronda). */
  solutions: string[][];
  nearMisses: number;
  /** El rasgo deseado solo aparece en microbios con algún valor extremo (1–2 o 9–10). */
  extremeCarriers: boolean;
  suggestedMin: number;
}

export interface SeaWolfScenario {
  seed: string;
  lang: Lang;
  difficulty: Difficulty;
  zones: Zone[];
}

export const zoneMicrobes = (zone: Zone): Microbe[] => [...zone.classification, ...zone.rounds.flat()];

export function microbeIndex(scenario: SeaWolfScenario): Map<string, Microbe> {
  return new Map(scenario.zones.flatMap((z) => zoneMicrobes(z)).map((m) => [m.id, m]));
}

function roundMap(zone: Pick<Zone, 'rounds'>): Map<string, number> {
  const m = new Map<string, number>();
  zone.rounds.forEach((r, ri) => r.forEach((x) => m.set(x.id, ri)));
  return m;
}

const isExtreme = (v: number) => v <= 2 || v >= 9;

// ---------------------------------------------------------------- reglas

export interface Violation {
  rule: string;
  detail: string;
}

export interface SelectionCheck {
  valid: boolean;
  rulesOk: number;
  rulesTotal: number;
  violations: Violation[];
  sums: number[];
  means: number[];
}

export const traitLabel = (key: string, lang: Lang = 'es') => TRAITS.find((t) => t.key === key)?.labels[lang] ?? key;

export function checkSelection(zone: Zone, microbes: Microbe[]): SelectionCheck {
  const rulesTotal = zone.attributes.length + 2;
  const violations: Violation[] = [];
  const sums = zone.attributes.map((_, i) => microbes.reduce((s, m) => s + m.attrs[i], 0));
  const means = sums.map((s) => (microbes.length ? s / microbes.length : 0));
  if (microbes.length !== PICK) {
    return {
      valid: false,
      rulesOk: 0,
      rulesTotal,
      violations: [{ rule: 'Selección incompleta', detail: `Se eligieron ${microbes.length} microbios; hacen falta exactamente 3.` }],
      sums,
      means,
    };
  }
  zone.attributes.forEach((a, i) => {
    const [lo, hi] = zone.ranges[i];
    if (sums[i] < lo * PICK || sums[i] > hi * PICK) {
      violations.push({
        rule: `${a}`,
        detail: `Media ${fmtMean(means[i])} (suma ${sums[i]}) fuera del rango ${lo}–${hi} (suma ${lo * PICK}–${hi * PICK}).`,
      });
    }
  });
  if (!microbes.some((m) => m.traits.includes(zone.required))) {
    violations.push({ rule: 'Rasgo deseado', detail: `Ninguno de los 3 tiene el rasgo deseado «${traitLabel(zone.required, zone.lang)}».` });
  }
  const bad = microbes.filter((m) => m.traits.includes(zone.prohibited));
  if (bad.length) {
    violations.push({
      rule: 'Rasgo no deseado',
      detail: `${bad.map((m) => m.name).join(', ')} tiene${bad.length > 1 ? 'n' : ''} el rasgo no deseado «${traitLabel(zone.prohibited, zone.lang)}».`,
    });
  }
  return { valid: violations.length === 0, rulesOk: rulesTotal - violations.length, rulesTotal, violations, sums, means };
}

function fmtMean(x: number) {
  return (Math.round(x * 100) / 100).toString();
}

/** Reglas incumplidas por un trío (índices: atributos, luego deseado y no deseado). */
function failing(zone: Pick<Zone, 'ranges' | 'required' | 'prohibited'>, t: Microbe[]): number[] {
  const f: number[] = [];
  for (let i = 0; i < zone.ranges.length; i++) {
    const s = t[0].attrs[i] + t[1].attrs[i] + t[2].attrs[i];
    if (s < zone.ranges[i][0] * PICK || s > zone.ranges[i][1] * PICK) f.push(i);
  }
  if (!t.some((m) => m.traits.includes(zone.required))) f.push(zone.ranges.length);
  if (t.some((m) => m.traits.includes(zone.prohibited))) f.push(zone.ranges.length + 1);
  return f;
}

/** Fuerza bruta sobre los tríos ALCANZABLES: como mucho un microbio de cada ronda de "elige 1 de 3". */
export function bruteForce(zone: Pick<Zone, 'ranges' | 'required' | 'prohibited' | 'rounds'>, all: Microbe[]) {
  const rm = roundMap(zone);
  const solutions: string[][] = [];
  let nearMisses = 0;
  const reachable = (a: Microbe, b: Microbe) => !(rm.has(a.id) && rm.get(a.id) === rm.get(b.id));
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      if (!reachable(all[i], all[j])) continue;
      for (let k = j + 1; k < all.length; k++) {
        if (!reachable(all[i], all[k]) || !reachable(all[j], all[k])) continue;
        const f = failing(zone, [all[i], all[j], all[k]]).length;
        if (f === 0) solutions.push([all[i].id, all[j].id, all[k].id]);
        else if (f === 1) nearMisses++;
      }
    }
  return { solutions, nearMisses };
}

// ---------------------------------------------------------------- generador

function splitSum(rng: Rng, s: number, parts: 2 | 3): number[] | null {
  for (let t = 0; t < 40; t++) {
    if (parts === 2) {
      const a = rng.int(Math.max(1, s - 10), Math.min(10, s - 1));
      const b = s - a;
      if (b >= 1 && b <= 10) return rng.shuffle([a, b]);
      continue;
    }
    const a = rng.int(Math.max(1, s - 20), Math.min(10, s - 2));
    const b = rng.int(Math.max(1, s - a - 10), Math.min(10, s - a - 1));
    const c = s - a - b;
    if (c >= 1 && c <= 10 && b >= 1 && b <= 10) return rng.shuffle([a, b, c]);
  }
  return null;
}

interface Shared {
  attributes: string[];
  traitPool: string[];
}

export function generateZone(rng: Rng, zi: number, difficulty: Difficulty, usedNames: Set<string>, zoneInfo: [string, string], lang: Lang, shared: Shared): Zone {
  const hard = difficulty === 'hard';
  const width = hard ? 2 : [3, 3, 2][zi];
  const maxSolutions = hard ? 3 : 14;
  const minNear = hard ? 8 : 0;
  const total = CLASSIFY_N + ROUNDS * ROUND_SIZE;

  const newName = () => {
    for (;;) {
      const nm = `${rng.pick(NAME_A)}${rng.pick(NAME_B)}-${rng.pick(['K', 'M', 'R', 'T', 'V', 'X'])}${rng.int(1, 9)}`;
      if (!usedNames.has(nm)) {
        usedNames.add(nm);
        return nm;
      }
    }
  };

  for (let attempt = 0; attempt < 500; attempt++) {
    const ranges: [number, number][] = shared.attributes.map(() => {
      const lo = rng.int(2, 9 - width);
      return [lo, lo + width];
    });
    const [required, prohibited] = rng.sample(shared.traitPool, 2);
    const neutral = shared.traitPool.filter((x) => x !== required && x !== prohibited);
    // Sitio difícil: el rasgo deseado solo aparece en microbios con algún valor extremo.
    const extremeCarriers = hard ? zi === 2 || rng.chance(0.35) : zi === 2 && rng.chance(0.35);
    let counter = 0;
    const mk = (attrs: number[], trait: string): Microbe => ({ id: `z${zi}m${counter++}`, name: '', attrs, traits: [trait] });
    const randomTrait = () => {
      const r = rng.next();
      return r < 0.22 ? required : r < 0.52 ? prohibited : rng.pick(neutral);
    };
    const forceExtreme = (m: Microbe) => {
      if (!m.attrs.some(isExtreme)) m.attrs[rng.int(0, 2)] = rng.pick([1, 2, 9, 10]);
    };

    // 1) Solución plantada (el primero lleva el rasgo deseado).
    const cols: number[][] = [];
    let ok = true;
    const extremeAttr = rng.int(0, 2);
    for (let a = 0; a < 3 && ok; a++) {
      const lo = ranges[a][0] * 3;
      const hi = ranges[a][1] * 3;
      const sumsInRange = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
      if (extremeCarriers && a === extremeAttr) {
        // el portador tiene un valor extremo y los otros dos compensan
        const options = [1, 2, 9, 10].filter((v) => sumsInRange.some((s) => s - v >= 2 && s - v <= 20));
        if (!options.length) ok = false;
        else {
          const v = rng.pick(options);
          const rest = splitSum(rng, rng.pick(sumsInRange.filter((s) => s - v >= 2 && s - v <= 20)) - v, 2);
          if (!rest) ok = false;
          else cols.push([v, ...rest]);
        }
      } else {
        const parts = splitSum(rng, rng.int(lo, hi), 3);
        if (!parts) ok = false;
        else cols.push(parts);
      }
    }
    if (!ok) continue;
    const planted = [0, 1, 2].map((i) => mk(cols.map((c) => c[i]), i === 0 ? required : rng.chance(0.25) ? required : rng.pick(neutral)));
    if (extremeCarriers) for (const m of planted.slice(1)) if (m.traits[0] === required) m.traits = [rng.pick(neutral)];

    // 2) Gemelos casi válidos: como un microbio plantado pero con un fallo.
    const twins: Microbe[] = [];
    const nTwins = hard ? rng.int(4, 6) : rng.int(1, 3);
    for (let t = 0; t < nTwins; t++) {
      const srcIdx = rng.int(0, 2);
      const src = planted[srcIdx];
      const kind = rng.pick(['prohibited', 'attr', 'attr', 'required'] as const);
      if (kind === 'prohibited') twins.push(mk(src.attrs.map((x) => Math.max(1, Math.min(10, x + rng.int(-1, 1)))), prohibited));
      else if (kind === 'required' && srcIdx === 0) twins.push(mk(src.attrs.slice(), rng.pick(neutral)));
      else {
        const ai = rng.int(0, 2);
        const others = planted.reduce((s, m, i) => (i === srcIdx ? s : s + m.attrs[ai]), 0);
        const up = ranges[ai][1] * 3 + 1 - others;
        const down = ranges[ai][0] * 3 - 1 - others;
        const choices = [up, up + 1, down, down - 1].filter((v) => v >= 1 && v <= 10);
        if (!choices.length) continue;
        const attrs = src.attrs.slice();
        attrs[ai] = rng.pick(choices);
        twins.push(mk(attrs, src.traits[0]));
      }
    }

    // 3) Relleno aleatorio hasta 22 candidatos (10 de clasificación + 4 rondas de 3).
    const extra: Microbe[] = [...twins];
    while (planted.length + extra.length < total) extra.push(mk([0, 1, 2].map(() => rng.int(1, 10)), randomTrait()));
    const all = [...planted, ...extra].slice(0, total);
    if (extremeCarriers) all.forEach((m) => m.traits[0] === required && forceExtreme(m));

    // 4) Posiciones: los miembros de la solución van a la clasificación o a rondas distintas.
    const roundSlots = rng.shuffle([0, 1, 2, 3]);
    const nInRounds = rng.int(0, 2);
    const rounds: Microbe[][] = [[], [], [], []];
    planted.slice(0, nInRounds).forEach((m, i) => rounds[roundSlots[i]].push(m));
    const classification: Microbe[] = planted.slice(nInRounds);
    for (const m of rng.shuffle(all.slice(planted.length))) {
      if (classification.length < CLASSIFY_N) classification.push(m);
      else rounds[rounds.findIndex((x) => x.length < ROUND_SIZE)].push(m);
    }
    const shuffledRounds = rounds.map((r) => rng.shuffle(r));
    const shuffledClass = rng.shuffle(classification);
    const draft = { ranges, required, prohibited, rounds: shuffledRounds };

    // 5) Reparación: si hay demasiadas soluciones, se re-sortean candidatos no plantados.
    const protectedIds = new Set(planted.map((m) => m.id));
    const cands = [...shuffledClass, ...shuffledRounds.flat()];
    let res = bruteForce(draft, cands);
    for (let it = 0; it < 300 && res.solutions.length > maxSolutions; it++) {
      const sol = rng.pick(res.solutions.filter((s) => s.some((id) => !protectedIds.has(id))));
      if (!sol) break;
      const victimId = rng.pick(sol.filter((id) => !protectedIds.has(id)));
      const victim = cands.find((m) => m.id === victimId)!;
      victim.attrs = [0, 1, 2].map(() => rng.int(1, 10));
      victim.traits = [randomTrait()];
      if (extremeCarriers && victim.traits[0] === required) forceExtreme(victim);
      res = bruteForce(draft, cands);
    }
    if (res.solutions.length < 1 || res.solutions.length > maxSolutions) continue;
    if (res.nearMisses < minNear) continue;

    cands.forEach((m) => (m.name = newName()));
    const [name, description] = zoneInfo;
    const zone: Zone = {
      index: zi,
      lang,
      name,
      description,
      attributes: shared.attributes,
      traitPool: shared.traitPool,
      ranges,
      required,
      prohibited,
      classification: shuffledClass,
      rounds: shuffledRounds,
      solutions: res.solutions.map((s) => s.slice().sort()),
      nearMisses: res.nearMisses,
      extremeCarriers,
      suggestedMin: 10,
    };
    // Si el sitio no es coherente o no tiene solución alcanzable con los candidatos que aparecen, se descarta.
    if (validateZone(zone).length === 0) return zone;
  }
  throw new Error('No se pudo generar la zona');
}

export function generateSeaWolf(seed: string, difficulty: Difficulty, lang: Lang = 'es'): SeaWolfScenario {
  const rng = createRng(`seawolf2|${difficulty}|${seed}`);
  const used = new Set<string>();
  const infos = rng.sample(ZONE_NAMES, 3);
  const attrIdx = rng.sample([0, 1, 2, 3, 4, 5], 3);
  const shared: Shared = {
    attributes: attrIdx.map((i) => ATTRIBUTES_I18N[lang][i]),
    traitPool: rng.sample(TRAITS.map((t) => t.key), 4),
  };
  const zones = [0, 1, 2].map((zi) => generateZone(rng, zi, difficulty, used, infos[zi][lang], lang, shared));
  return { seed, lang, difficulty, zones };
}

// ---------------------------------------------------------------- perfil del sitio

export interface ProfileOption {
  key: string;
  label: string;
}

/** Atributo cuyo rango se aleja más del centro de la escala (5.5) y en qué dirección. */
export function mostDemandingAttribute(zone: Pick<Zone, 'ranges'>): { index: number; dir: 'high' | 'low'; dist: number; tie: boolean } {
  const d = zone.ranges.map(([lo, hi]) => (lo + hi) / 2 - 5.5);
  const order = d.map((v, i) => ({ i, a: Math.abs(v) })).sort((x, y) => y.a - x.a);
  const top = order[0];
  return { index: top.i, dir: d[top.i] > 0 ? 'high' : 'low', dist: top.a, tie: order.length > 1 && Math.abs(order[0].a - order[1].a) < 1 };
}

/**
 * Perfil: se eligen 2 de 7 características. Las 7 son «Necesita <rasgo>» para cada uno de los 4 rasgos posibles
 * y «<atributo> alto/bajo» para cada atributo (según hacia dónde se inclina su rango).
 * Correctas: el rasgo deseado del sitio y el atributo más exigente (el rango más alejado del centro).
 */
export function profileOptions(zone: Zone): ProfileOption[] {
  const en = zone.lang === 'en';
  const traits = zone.traitPool.map((t) => ({ key: `trait:${t}`, label: en ? `Needs «${traitLabel(t, 'en')}»` : `Necesita «${traitLabel(t, 'es')}»` }));
  const attrs = zone.attributes.map((a, i) => {
    const high = (zone.ranges[i][0] + zone.ranges[i][1]) / 2 > 5.5;
    return { key: `attr:${i}:${high ? 'high' : 'low'}`, label: en ? `${a}: ${high ? 'high' : 'low'}` : `${a}: ${high ? 'alta' : 'baja'}` };
  });
  return [...traits, ...attrs];
}

export function correctProfile(zone: Zone): string[] {
  const m = mostDemandingAttribute(zone);
  return [`trait:${zone.required}`, `attr:${m.index}:${m.dir}`];
}

// ---------------------------------------------------------------- regla de clasificación

/** Margen admitido alrededor del rango: un valor a ≤2 puntos se puede compensar con los otros dos microbios. */
export const CLASSIFY_MARGIN = 2;

export interface FitCheck {
  fits: boolean;
  /** Motivos por los que NO encaja (vacío si encaja). */
  reasons: string[];
}

/**
 * Un microbio encaja en un sitio si NO tiene el rasgo no deseado y, además, o bien tiene el rasgo deseado
 * (son escasos: se guardan aunque tengan valores extremos), o bien cada atributo está dentro del rango del sitio
 * ampliado en ±2 puntos (CLASSIFY_MARGIN).
 */
export function fitsSite(zone: Zone, m: Microbe): FitCheck {
  const reasons: string[] = [];
  if (m.traits.includes(zone.prohibited)) {
    reasons.push(`tiene el rasgo no deseado «${traitLabel(zone.prohibited, zone.lang)}»`);
    return { fits: false, reasons };
  }
  if (m.traits.includes(zone.required)) return { fits: true, reasons };
  zone.attributes.forEach((a, i) => {
    const [lo, hi] = zone.ranges[i];
    const v = m.attrs[i];
    if (v < lo - CLASSIFY_MARGIN || v > hi + CLASSIFY_MARGIN)
      reasons.push(`${a} = ${v}, a más de ${CLASSIFY_MARGIN} puntos del rango ${lo}–${hi} (admitido ${Math.max(1, lo - CLASSIFY_MARGIN)}–${Math.min(10, hi + CLASSIFY_MARGIN)})`);
  });
  return { fits: reasons.length === 0, reasons };
}

/**
 * Regla de clasificación (la que usa la corrección):
 * 1. «Este sitio» si encaja en este sitio (fitsSite) y el pool aún tiene hueco.
 * 2. «Siguiente sitio» si no encaja aquí (o el pool está lleno) pero encaja en el sitio siguiente.
 * 3. «Rechazar» en cualquier otro caso (en el último sitio no hay «siguiente sitio»).
 */
export function expectedDecision(zone: Zone, next: Zone | null, m: Microbe, poolFull: boolean): { expected: Decision; here: FitCheck; there: FitCheck | null } {
  const here = fitsSite(zone, m);
  const there = next ? fitsSite(next, m) : null;
  if (here.fits && !poolFull) return { expected: 'site', here, there };
  if (there?.fits) return { expected: 'next', here, there };
  return { expected: 'reject', here, there };
}

/** ¿Hay un trío válido dentro de este conjunto? */
export function poolHasValidTrio(zone: Zone, ms: Microbe[]): boolean {
  for (let i = 0; i < ms.length; i++)
    for (let j = i + 1; j < ms.length; j++) for (let k = j + 1; k < ms.length; k++) if (failing(zone, [ms[i], ms[j], ms[k]]).length === 0) return true;
  return false;
}

/**
 * Juega el sitio siguiendo la regla de clasificación al pie de la letra (sin aplazados) y eligiendo en cada ronda
 * un microbio que mantenga posible un trío válido. Devuelve el pool final.
 */
export function playByRule(zone: Zone): Microbe[] {
  const pool: Microbe[] = [];
  for (const m of zone.classification) if (pool.length < POOL_START_MAX && fitsSite(zone, m).fits) pool.push(m);
  zone.rounds.forEach((round, r) => {
    const rest = zone.rounds.slice(r + 1);
    const keeps = (cand: Microbe) => {
      const all = [...pool, cand];
      const opts = [...all, ...rest.flat()];
      const roundOf = new Map(rest.flatMap((rr, ri) => rr.map((x) => [x.id, ri] as const)));
      for (let i = 0; i < opts.length; i++)
        for (let j = i + 1; j < opts.length; j++)
          for (let k = j + 1; k < opts.length; k++) {
            const t = [opts[i], opts[j], opts[k]];
            const rs = t.filter((x) => roundOf.has(x.id)).map((x) => roundOf.get(x.id));
            if (new Set(rs).size !== rs.length) continue;
            if (failing(zone, t).length === 0) return true;
          }
      return false;
    };
    pool.push(round.find(keeps) ?? round[0]);
  });
  return pool;
}

// ---------------------------------------------------------------- validación

export interface ZoneIssue {
  code: string;
  message: string;
}

/** Comprueba que un sitio es coherente y que tiene al menos un trío válido alcanzable con los candidatos que aparecen. */
export function validateZone(zone: Zone): ZoneIssue[] {
  const issues: ZoneIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  const all = zoneMicrobes(zone);
  if (zone.classification.length !== CLASSIFY_N) add('CLASSIFICATION', `La clasificación debe tener ${CLASSIFY_N} microbios.`);
  if (zone.rounds.length !== ROUNDS || zone.rounds.some((r) => r.length !== ROUND_SIZE)) add('ROUNDS', `Debe haber ${ROUNDS} rondas de ${ROUND_SIZE}.`);
  if (new Set(all.map((m) => m.id)).size !== all.length) add('IDS', 'Hay identificadores de microbio repetidos.');
  if (new Set(all.map((m) => m.name)).size !== all.length) add('NAMES', 'Hay nombres de microbio repetidos.');
  if (zone.traitPool.length !== 4) add('TRAITS', 'Debe haber 4 rasgos posibles.');
  if (zone.required === zone.prohibited) add('TRAITS', 'El rasgo deseado y el no deseado son el mismo.');
  if (!zone.traitPool.includes(zone.required) || !zone.traitPool.includes(zone.prohibited)) add('TRAITS', 'Los rasgos del sitio no están entre los 4 posibles.');
  if (zone.attributes.length !== zone.ranges.length) add('RANGES', 'Cada atributo necesita su rango.');
  zone.ranges.forEach(([lo, hi], i) => {
    if (!(lo >= 1 && hi <= 10 && lo < hi && hi - lo <= 3)) add('RANGES', `Rango inválido para ${zone.attributes[i]}: ${lo}–${hi}.`);
  });
  for (const m of all) {
    if (m.attrs.length !== zone.attributes.length || m.attrs.some((a) => !Number.isInteger(a) || a < 1 || a > 10))
      add('ATTRS', `${m.name} tiene valores fuera de 1–10.`);
    if (m.traits.length !== 1 || !zone.traitPool.includes(m.traits[0])) add('TRAITS', `${m.name} debe tener exactamente un rasgo de los 4 posibles.`);
  }
  const demanding = mostDemandingAttribute(zone);
  if (demanding.tie || demanding.dist < 1) add('PROFILE', 'El perfil correcto del sitio es ambiguo (dos atributos igual de exigentes).');
  const carriers = all.filter((m) => m.traits.includes(zone.required));
  if (!carriers.length) add('REQUIRED', 'Ningún microbio tiene el rasgo deseado.');
  if (zone.extremeCarriers && carriers.some((m) => !m.attrs.some(isExtreme)))
    add('EXTREME', 'El sitio dice que el rasgo deseado solo aparece con valores extremos, pero hay portadores sin ellos.');
  const bf = bruteForce(zone, all);
  if (bf.solutions.length === 0) add('NO_SOLUTION', 'No hay ningún trío válido alcanzable con los candidatos que aparecen.');
  // La regla de clasificación debe permitir llegar a una solución: los microbios de clasificación de algún trío válido
  // deben ser «este sitio» según la regla.
  const classIds = new Set(zone.classification.map((m) => m.id));
  const byIdAll = new Map(all.map((m) => [m.id, m]));
  if (bf.solutions.length && !bf.solutions.some((sol) => sol.every((id) => !classIds.has(id) || fitsSite(zone, byIdAll.get(id)!).fits)))
    add('RULE_SOLUTION', 'Ninguna solución es alcanzable siguiendo la regla de clasificación.');
  // Siguiendo la regla de clasificación al pie de la letra (con el límite del pool), debe quedar un trío válido.
  if (!poolHasValidTrio(zone, playByRule(zone))) add('RULE_PATH', 'Siguiendo la regla de clasificación, el pool no llega a contener ningún trío válido.');
  const key = (s: string[]) => s.slice().sort().join('|');
  if (bf.solutions.map(key).sort().join(';') !== zone.solutions.map(key).sort().join(';'))
    add('SOLUTIONS', 'La lista de soluciones guardada no coincide con la fuerza bruta.');
  const byId = new Map(all.map((m) => [m.id, m]));
  const rm = roundMap(zone);
  for (const sol of zone.solutions) {
    const ms = sol.map((id) => byId.get(id)!).filter(Boolean);
    if (!checkSelection(zone, ms).valid) add('SOLUTION_INVALID', `La solución ${sol.join(', ')} incumple alguna regla.`);
    const rs = sol.filter((id) => rm.has(id)).map((id) => rm.get(id));
    if (new Set(rs).size !== rs.length) add('UNREACHABLE', `La solución ${sol.join(', ')} usa dos microbios de la misma ronda.`);
  }
  return issues;
}

// ---------------------------------------------------------------- respuestas y corrección

export type Decision = 'site' | 'next' | 'reject';

export interface ZoneAnswer {
  /** Las 2 características elegidas en el perfil. */
  profile: string[];
  /** Decisión de clasificación por microbio (id). */
  decisions: Record<string, Decision>;
  /** Microbios aplazados desde el sitio anterior que se mantuvieron en este. */
  reviewKept: string[];
  /** Microbio elegido en cada ronda de "elige 1 de 3". */
  roundPicks: (string | null)[];
  /** Pool final del sitio. */
  pool: string[];
  selected: string[];
  timeSec: number;
  completed: boolean;
}

export const emptyZoneAnswer = (): ZoneAnswer => ({ profile: [], decisions: {}, reviewKept: [], roundPicks: [], pool: [], selected: [], timeSec: 0, completed: false });

export interface ZoneGrade {
  check: SelectionCheck;
  score: number; // 0-100: 100 − 20 por cada comprobación fallida
  savedInSolution: number;
  savedTotal: number;
  solutionMicrobesSeen: number;
  exampleSolution: string[];
}

export function gradeZone(zone: Zone, ans: ZoneAnswer, index?: Map<string, Microbe>): ZoneGrade {
  const byId = index ?? new Map(zoneMicrobes(zone).map((m) => [m.id, m]));
  const sel = ans.selected.map((id) => byId.get(id)!).filter(Boolean);
  const check = checkSelection(zone, sel);
  const inSolution = new Set(zone.solutions.flat());
  return {
    check,
    score: check.valid ? 100 : Math.round((check.rulesOk / check.rulesTotal) * 100),
    savedInSolution: ans.pool.filter((id) => inSolution.has(id)).length,
    savedTotal: ans.pool.length,
    solutionMicrobesSeen: inSolution.size,
    exampleSolution: zone.solutions[0],
  };
}

export interface MissedCandidate {
  microbe: Microbe;
  /** Dónde apareció y qué hiciste con él (texto en español). */
  where: string;
  inSolutions: number;
}

export interface ZoneInsights {
  validTrios: number;
  nearMisses: number;
  ruleStats: { rule: string; passRate: number; soleFailures: number }[];
  bottleneck: { rule: string; explanation: string };
  /** Candidatos que completaban la solución más cercana a tu pool y no guardaste. */
  missed: MissedCandidate[];
  poolHadSolution: boolean;
}

/** Análisis del sitio para la corrección: tríos válidos, cuello de botella y candidatos que faltaron. */
export function zoneInsights(zone: Zone, ans: ZoneAnswer): ZoneInsights {
  const all = zoneMicrobes(zone);
  const rm = roundMap(zone);
  const rules = [...zone.attributes, `Rasgo deseado «${traitLabel(zone.required, zone.lang)}»`, `Rasgo no deseado «${traitLabel(zone.prohibited, zone.lang)}»`];
  const pass = rules.map(() => 0);
  const sole = rules.map(() => 0);
  let combos = 0;
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++)
      for (let k = j + 1; k < all.length; k++) {
        const t = [all[i], all[j], all[k]];
        const rs = t.filter((m) => rm.has(m.id)).map((m) => rm.get(m.id));
        if (new Set(rs).size !== rs.length) continue;
        combos++;
        const fails = failing(zone, t);
        rules.forEach((_, r) => !fails.includes(r) && pass[r]++);
        if (fails.length === 1) sole[fails[0]]++;
      }
  const ruleStats = rules.map((rule, r) => ({ rule, passRate: combos ? pass[r] / combos : 0, soleFailures: sole[r] }));

  const carriers = all.filter((m) => m.traits.includes(zone.required));
  let bottleneck: ZoneInsights['bottleneck'];
  if (zone.extremeCarriers || carriers.length <= 3) {
    bottleneck = {
      rule: `Rasgo deseado «${traitLabel(zone.required, zone.lang)}»`,
      explanation:
        `Solo ${carriers.length} candidato${carriers.length === 1 ? '' : 's'} tenía${carriers.length === 1 ? '' : 'n'} el rasgo deseado (${carriers.map((m) => m.name).join(', ')}).` +
        (zone.extremeCarriers ? ' Todos tienen algún valor extremo (1–2 o 9–10), así que los otros dos microbios del trío debían compensarlo.' : '') +
        ' Había que guardar uno en cuanto apareció.',
    };
  } else {
    const worst = ruleStats.slice().sort((a, b) => b.soleFailures - a.soleFailures || a.passRate - b.passRate)[0];
    bottleneck = {
      rule: worst.rule,
      explanation: `Es la regla que más tríos casi válidos incumplía (${worst.soleFailures} fallan solo por ella); solo el ${Math.round(worst.passRate * 100)} % de los tríos alcanzables la cumple.`,
    };
  }

  const pool = new Set(ans.pool);
  const count = new Map<string, number>();
  zone.solutions.flat().forEach((id) => count.set(id, (count.get(id) ?? 0) + 1));
  const poolHadSolution = zone.solutions.some((s) => s.every((id) => pool.has(id)));
  let missed: MissedCandidate[] = [];
  if (!poolHadSolution && zone.solutions.length) {
    const best = zone.solutions
      .map((s) => ({ s, overlap: s.filter((id) => pool.has(id)).length, pop: s.reduce((a, id) => a + (count.get(id) ?? 0), 0) }))
      .sort((a, b) => b.overlap - a.overlap || b.pop - a.pop)[0];
    const byId = new Map(all.map((m) => [m.id, m]));
    missed = best.s
      .filter((id) => !pool.has(id))
      .map((id) => {
        const m = byId.get(id)!;
        let where: string;
        if (rm.has(id)) {
          const r = rm.get(id)!;
          const picked = ans.roundPicks[r];
          where = `Ronda ${r + 1} de «elige 1 de 3»: ${picked ? `elegiste ${byId.get(picked)?.name ?? 'otro microbio'}` : 'no llegaste a elegir'}.`;
        } else {
          const pos = zone.classification.findIndex((x) => x.id === id) + 1;
          const d = ans.decisions[id];
          where = `Clasificación, microbio n.º ${pos}: ${
            d === 'next' ? 'lo enviaste al siguiente sitio' : d === 'reject' ? 'lo rechazaste' : d === 'site' ? 'lo asignaste a este sitio' : 'no llegaste a clasificarlo'
          }.`;
        }
        return { microbe: m, where, inSolutions: count.get(id) ?? 0 };
      });
  }
  return { validTrios: zone.solutions.length, nearMisses: zone.nearMisses, ruleStats, bottleneck, missed, poolHadSolution };
}

/** Explicación del método recomendado aplicada al sitio (en español). */
export function methodSteps(zone: Zone): string[] {
  const all = zoneMicrobes(zone);
  const withProh = all.filter((m) => m.traits.includes(zone.prohibited)).length;
  const withReq = all.filter((m) => m.traits.includes(zone.required)).length;
  return [
    `1. Elimina primero por rasgos: al clasificar, rechaza cualquier microbio con «${traitLabel(zone.prohibited, zone.lang)}» (${withProh} de ${all.length} candidatos en este sitio). Es la comprobación más rápida.`,
    `2. Asegura pronto el rasgo deseado «${traitLabel(zone.required, zone.lang)}»: solo ${withReq} candidatos lo tenían. Guarda al menos uno, aunque tenga algún valor extremo.`,
    `3. Convierte cada rango de media en rango de suma multiplicando por 3: ${zone.attributes
      .map((a, i) => `${a} media ${zone.ranges[i][0]}–${zone.ranges[i][1]} → suma ${zone.ranges[i][0] * 3}–${zone.ranges[i][1] * 3}`)
      .join('; ')}.`,
    '4. Con sumas enteras, comprobar un trío es sumar tres números por atributo, sin dividir. Busca primero un par compatible y luego el tercero que completa las sumas.',
    `5. El pool admite ${POOL_START_MAX} microbios tras la clasificación: no lo llenes con microbios parecidos. Guarda variedad (valores altos y bajos) para poder compensar y usa las 4 rondas de «elige 1 de 3» para completar el trío.`,
    '6. Usa «Siguiente sitio» para los microbios que encajan mejor con la pista del sitio siguiente: así no los pierdes.',
  ];
}
