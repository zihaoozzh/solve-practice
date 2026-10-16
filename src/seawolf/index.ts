import { createRng, Rng } from '../lib/rng';
import type { Difficulty } from '../redrock/types';

export interface TraitDef {
  key: string;
  label: string;
  color: string;
  shape: 'star' | 'ring' | 'wave' | 'hex' | 'sun' | 'spike' | 'pair' | 'square';
}

export const TRAITS: TraitDef[] = [
  { key: 'lumin', label: 'Bioluminiscente', color: '#c99a06', shape: 'star' },
  { key: 'spore', label: 'Formador de esporas', color: '#6d52e0', shape: 'ring' },
  { key: 'motile', label: 'Móvil', color: '#1f7f93', shape: 'wave' },
  { key: 'biofilm', label: 'Formador de biopelícula', color: '#4c8c2f', shape: 'hex' },
  { key: 'photo', label: 'Fotosintético', color: '#d46a00', shape: 'sun' },
  { key: 'aggr', label: 'Agresivo', color: '#c0392b', shape: 'spike' },
  { key: 'symb', label: 'Simbiótico', color: '#b0306f', shape: 'pair' },
  { key: 'metal', label: 'Captador de metales', color: '#4f6470', shape: 'square' },
];

export const ATTRIBUTES = [
  'Absorción de toxinas',
  'Tasa de crecimiento',
  'Tolerancia térmica',
  'Tolerancia a la salinidad',
  'Eficiencia de oxígeno',
  'Resistencia al pH',
];

const ZONE_NAMES = [
  ['Desagüe del puerto', 'Los vertidos de un puerto pesquero han elevado los residuos de nutrientes y combustible.'],
  ['Plataforma de laminarias', 'Una plataforma somera de algas laminarias sufre un vertido de aditivos plásticos.'],
  ['Desembocadura del estuario', 'La escorrentía agrícola se acumula donde el río se une al mar.'],
  ['Laguna coralina', 'Una laguna resguardada muestra trazas de metales pesados procedentes de antiguos fondeos.'],
  ['Campo de fuentes hidrotermales', 'El agua cálida y ácida que rodea las fuentes hidrotermales arrastra metales disueltos.'],
  ['Ruta de navegación', 'Pequeños vertidos de petróleo repetidos han contaminado un corredor de aguas abiertas.'],
];

const NAME_A = ['Vibr', 'Thal', 'Mar', 'Pelag', 'Abyss', 'Litor', 'Nerit', 'Bent', 'Salin', 'Cora', 'Kelp', 'Tid', 'Hal', 'Brin', 'Zost'];
const NAME_B = ['ella', 'ium', 'ococcus', 'obacter', 'ira', 'ospora', 'omonas', 'ivora', 'ithrix', 'aria'];

export interface Microbe {
  id: string;
  name: string;
  attrs: number[];
  traits: string[];
}

export interface Zone {
  index: number;
  name: string;
  description: string;
  attributes: string[];
  /** Rango objetivo de la MEDIA de los 3 microbios elegidos, por atributo. */
  ranges: [number, number][];
  required: string;
  prohibited: string;
  waves: Microbe[][];
  /** Todas las combinaciones válidas (ids ordenados). */
  solutions: string[][];
  nearMisses: number;
  suggestedMin: number;
}

export interface SeaWolfScenario {
  seed: string;
  difficulty: Difficulty;
  zones: Zone[];
}

export const LIST_MAX = 10;
export const PICK = 3;

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

export const traitLabel = (key: string) => TRAITS.find((t) => t.key === key)?.label ?? key;

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
    violations.push({ rule: 'Rasgo requerido', detail: `Ninguno de los 3 tiene el rasgo requerido «${traitLabel(zone.required)}».` });
  }
  const bad = microbes.filter((m) => m.traits.includes(zone.prohibited));
  if (bad.length) {
    violations.push({
      rule: 'Rasgo prohibido',
      detail: `${bad.map((m) => m.name).join(', ')} tiene${bad.length > 1 ? 'n' : ''} el rasgo prohibido «${traitLabel(zone.prohibited)}».`,
    });
  }
  return { valid: violations.length === 0, rulesOk: rulesTotal - violations.length, rulesTotal, violations, sums, means };
}

function fmtMean(x: number) {
  return (Math.round(x * 100) / 100).toString();
}

/** Número de reglas incumplidas por una terna (fuerza bruta rápida). */
function failures(zone: Pick<Zone, 'ranges' | 'required' | 'prohibited'>, a: Microbe, b: Microbe, c: Microbe): number {
  let f = 0;
  for (let i = 0; i < zone.ranges.length; i++) {
    const s = a.attrs[i] + b.attrs[i] + c.attrs[i];
    if (s < zone.ranges[i][0] * PICK || s > zone.ranges[i][1] * PICK) f++;
  }
  if (!(a.traits.includes(zone.required) || b.traits.includes(zone.required) || c.traits.includes(zone.required))) f++;
  if (a.traits.includes(zone.prohibited) || b.traits.includes(zone.prohibited) || c.traits.includes(zone.prohibited)) f++;
  return f;
}

export function bruteForce(zone: Pick<Zone, 'ranges' | 'required' | 'prohibited'>, all: Microbe[]) {
  const solutions: string[][] = [];
  let nearMisses = 0;
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++)
      for (let k = j + 1; k < all.length; k++) {
        const f = failures(zone, all[i], all[j], all[k]);
        if (f === 0) solutions.push([all[i].id, all[j].id, all[k].id]);
        else if (f === 1) nearMisses++;
      }
  return { solutions, nearMisses };
}

// ---------------------------------------------------------------- generador

function splitSum(rng: Rng, s: number): number[] | null {
  for (let t = 0; t < 30; t++) {
    const a = rng.int(Math.max(1, s - 20), Math.min(10, s - 2));
    const b = rng.int(Math.max(1, s - a - 10), Math.min(10, s - a - 1));
    const c = s - a - b;
    if (c >= 1 && c <= 10 && b >= 1 && b <= 10) return rng.shuffle([a, b, c]);
  }
  return null;
}

function randomTraits(rng: Rng, required: string, prohibited: string, pReq: number, pProh: number, forbid: string[] = []): string[] {
  const traits: string[] = [];
  if (!forbid.includes(prohibited) && rng.chance(pProh)) traits.push(prohibited);
  if (!forbid.includes(required) && rng.chance(pReq)) traits.push(required);
  const others = TRAITS.map((t) => t.key).filter((k) => k !== required && k !== prohibited);
  const nOther = traits.length >= 2 ? 0 : rng.chance(0.55) ? 1 : 0;
  for (let i = 0; i < nOther; i++) traits.push(rng.pick(others));
  return rng.shuffle(Array.from(new Set(traits)));
}

export function generateZone(rng: Rng, zi: number, difficulty: Difficulty, usedNames: Set<string>, zoneInfo: string[]): Zone {
  const hard = difficulty === 'hard';
  const waveSize = hard ? [7, 8, 8][zi] : [6, 7, 7][zi];
  const width = hard ? [2, 1, 1][zi] : [3, 2, 2][zi];
  const maxSolutions = hard ? 3 : [24, 14, 10][zi];
  const minNear = hard ? 10 : 0;
  const n = waveSize * 3;

  const newName = () => {
    for (;;) {
      const nm = `${rng.pick(NAME_A)}${rng.pick(NAME_B)}-${rng.pick(['K', 'M', 'R', 'T', 'V', 'X'])}${rng.int(1, 9)}`;
      if (!usedNames.has(nm)) {
        usedNames.add(nm);
        return nm;
      }
    }
  };

  for (let attempt = 0; attempt < 400; attempt++) {
    const attributes = rng.sample(ATTRIBUTES, 3);
    const [required, prohibited] = rng.sample(TRAITS.map((t) => t.key), 2);
    const ranges: [number, number][] = attributes.map(() => {
      const lo = rng.int(2, 9 - width);
      return [lo, lo + width];
    });
    const rule = { ranges, required, prohibited };
    let counter = 0;
    const mk = (attrs: number[], traits: string[]): Microbe => ({ id: `z${zi}m${counter++}`, name: '', attrs, traits });

    // 1) Solución plantada
    const cols: number[][] = [];
    let okPlant = true;
    for (let a = 0; a < 3; a++) {
      const s = rng.int(ranges[a][0] * 3, ranges[a][1] * 3);
      const parts = splitSum(rng, s);
      if (!parts) okPlant = false;
      else cols.push(parts);
    }
    if (!okPlant) continue;
    const planted: Microbe[] = [0, 1, 2].map((i) => {
      const attrs = cols.map((c) => c[i]);
      const traits = i === 0 ? [required, ...randomTraits(rng, required, prohibited, 0, 0, [required, prohibited])] : randomTraits(rng, required, prohibited, 0.15, 0, [prohibited]);
      return mk(attrs, Array.from(new Set(traits)));
    });

    // 2) Gemelos casi válidos: igual que un microbio plantado pero con un fallo
    const twins: Microbe[] = [];
    const nTwins = hard ? rng.int(4, 6) : rng.int(1, 3);
    for (let tIdx = 0; tIdx < nTwins; tIdx++) {
      const srcIdx = rng.int(0, 2);
      const src = planted[srcIdx];
      const kind = rng.pick(['prohibited', 'attr', 'attr', 'required'] as const);
      if (kind === 'prohibited') {
        twins.push(mk(src.attrs.map((x) => clamp(x + rng.int(-1, 1))), Array.from(new Set([...src.traits, prohibited]))));
      } else if (kind === 'required' && srcIdx === 0) {
        twins.push(mk(src.attrs.slice(), src.traits.filter((x) => x !== required)));
      } else {
        const ai = rng.int(0, 2);
        const others = planted.reduce((s, m, i) => (i === srcIdx ? s : s + m.attrs[ai]), 0);
        const loS = ranges[ai][0] * 3;
        const hiS = ranges[ai][1] * 3;
        const up = hiS + 1 - others; // valor mínimo que se sale por arriba
        const down = loS - 1 - others; // valor máximo que se sale por abajo
        const choices = [up, up + 1, down, down - 1].filter((v) => v >= 1 && v <= 10);
        if (!choices.length) continue;
        const attrs = src.attrs.slice();
        attrs[ai] = rng.pick(choices);
        twins.push(mk(attrs, src.traits.slice()));
      }
    }

    // 3) Relleno aleatorio
    const fillers: Microbe[] = [];
    while (planted.length + twins.length + fillers.length < n) {
      const attrs = [0, 1, 2].map(() => rng.int(1, 10));
      fillers.push(mk(attrs, randomTraits(rng, required, prohibited, 0.25, hard ? 0.38 : 0.3)));
    }

    const all = [...planted, ...twins, ...fillers];
    const protectedIds = new Set(planted.map((m) => m.id));

    // 4) Reparación: si hay demasiadas soluciones, se re-sortean microbios no plantados
    let res = bruteForce(rule, all);
    for (let it = 0; it < 300 && res.solutions.length > maxSolutions; it++) {
      const sol = rng.pick(res.solutions.filter((s) => s.some((id) => !protectedIds.has(id))));
      if (!sol) break;
      const victimId = rng.pick(sol.filter((id) => !protectedIds.has(id)));
      const victim = all.find((m) => m.id === victimId)!;
      victim.attrs = [0, 1, 2].map(() => rng.int(1, 10));
      victim.traits = randomTraits(rng, required, prohibited, 0.25, hard ? 0.38 : 0.3);
      res = bruteForce(rule, all);
    }
    if (res.solutions.length < 1 || res.solutions.length > maxSolutions) continue;
    if (res.nearMisses < minNear) continue;

    // 5) Oleadas: se barajan y se reparten; los nombres se asignan al final
    const shuffled = rng.shuffle(all);
    shuffled.forEach((m) => (m.name = newName()));
    const waves = [0, 1, 2].map((w) => shuffled.slice(w * waveSize, (w + 1) * waveSize));
    const [name, description] = zoneInfo;
    const zone: Zone = {
      index: zi,
      name,
      description,
      attributes,
      ranges,
      required,
      prohibited,
      waves,
      solutions: res.solutions.map((s) => s.slice().sort()),
      nearMisses: res.nearMisses,
      suggestedMin: [8, 10, 12][zi],
    };
    // Si la zona no es coherente o no tiene solución con los microbios que aparecen, se descarta.
    if (validateZone(zone).length === 0) return zone;
  }
  throw new Error('No se pudo generar la zona');
}

export interface ZoneIssue {
  code: string;
  message: string;
}

/** Comprueba que una zona es coherente y que tiene al menos una solución con los microbios que aparecen. */
export function validateZone(zone: Zone): ZoneIssue[] {
  const issues: ZoneIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  const all = zoneMicrobes(zone);
  if (zone.waves.length < 1 || zone.waves.some((w) => w.length === 0)) add('WAVES', 'Hay oleadas vacías.');
  if (new Set(all.map((m) => m.id)).size !== all.length) add('IDS', 'Hay identificadores de microbio repetidos.');
  if (new Set(all.map((m) => m.name)).size !== all.length) add('NAMES', 'Hay nombres de microbio repetidos.');
  if (zone.required === zone.prohibited) add('TRAITS', 'El rasgo requerido y el prohibido son el mismo.');
  if (zone.attributes.length !== zone.ranges.length) add('RANGES', 'Cada atributo necesita su rango.');
  zone.ranges.forEach(([lo, hi], i) => {
    if (!(lo >= 1 && hi <= 10 && lo <= hi)) add('RANGES', `Rango inválido para ${zone.attributes[i]}: ${lo}–${hi}.`);
  });
  for (const m of all) {
    if (m.attrs.length !== zone.attributes.length || m.attrs.some((a) => !Number.isInteger(a) || a < 1 || a > 10))
      add('ATTRS', `${m.name} tiene valores fuera de 1–10.`);
    if (m.traits.some((t) => !TRAITS.some((d) => d.key === t))) add('TRAITS', `${m.name} tiene un rasgo desconocido.`);
  }
  if (!all.some((m) => m.traits.includes(zone.required) && !m.traits.includes(zone.prohibited)))
    add('REQUIRED', 'Ningún microbio admisible tiene el rasgo requerido.');
  const bf = bruteForce(zone, all);
  if (bf.solutions.length === 0) add('NO_SOLUTION', 'No hay ninguna combinación válida con los microbios que aparecen.');
  const key = (s: string[]) => s.slice().sort().join('|');
  if (bf.solutions.map(key).sort().join(';') !== zone.solutions.map(key).sort().join(';'))
    add('SOLUTIONS', 'La lista de soluciones guardada no coincide con la fuerza bruta.');
  const byId = new Map(all.map((m) => [m.id, m]));
  for (const sol of zone.solutions) {
    const chk = checkSelection(zone, sol.map((id) => byId.get(id)!).filter(Boolean));
    if (!chk.valid) add('SOLUTION_INVALID', `La solución ${sol.join(', ')} incumple alguna regla.`);
  }
  return issues;
}

function clamp(x: number) {
  return Math.max(1, Math.min(10, x));
}

export function generateSeaWolf(seed: string, difficulty: Difficulty): SeaWolfScenario {
  const rng = createRng(`seawolf|${difficulty}|${seed}`);
  const used = new Set<string>();
  const infos = rng.sample(ZONE_NAMES, 3);
  const zones = [0, 1, 2].map((zi) => generateZone(rng, zi, difficulty, used, infos[zi]));
  return { seed, difficulty, zones };
}

export function zoneMicrobes(zone: Zone): Microbe[] {
  return zone.waves.flat();
}

// ---------------------------------------------------------------- corrección

export interface ZoneAnswer {
  saved: string[]; // ids guardados en la lista (en algún momento)
  selected: string[];
  timeSec: number;
  completed: boolean;
}

export interface ZoneGrade {
  check: SelectionCheck;
  score: number; // 0-100
  savedInSolution: number;
  savedTotal: number;
  solutionMicrobesSeen: number;
  exampleSolution: string[];
}

export function gradeZone(zone: Zone, ans: ZoneAnswer): ZoneGrade {
  const all = zoneMicrobes(zone);
  const byId = new Map(all.map((m) => [m.id, m]));
  const sel = ans.selected.map((id) => byId.get(id)!).filter(Boolean);
  const check = checkSelection(zone, sel);
  const inSolution = new Set(zone.solutions.flat());
  return {
    check,
    score: check.valid ? 100 : Math.round((check.rulesOk / check.rulesTotal) * 100),
    savedInSolution: ans.saved.filter((id) => inSolution.has(id)).length,
    savedTotal: ans.saved.length,
    solutionMicrobesSeen: inSolution.size,
    exampleSolution: zone.solutions[0],
  };
}

/** Explicación del método recomendado aplicada a la zona (en español). */
export function methodSteps(zone: Zone): string[] {
  const all = zoneMicrobes(zone);
  const withProh = all.filter((m) => m.traits.includes(zone.prohibited)).length;
  const withReq = all.filter((m) => m.traits.includes(zone.required) && !m.traits.includes(zone.prohibited)).length;
  return [
    `1. Elimina primero por rasgos: descarta todo microbio con «${traitLabel(zone.prohibited)}» (${withProh} de ${all.length} en esta zona). Es la regla más barata de comprobar.`,
    `2. Asegura el rasgo requerido «${traitLabel(zone.required)}»: al menos uno de los 3 debe tenerlo (${withReq} candidatos lo tenían sin el rasgo prohibido). Guarda siempre alguno.`,
    `3. Convierte cada rango de media en rango de suma multiplicando por 3: ${zone.attributes
      .map((a, i) => `${a} media ${zone.ranges[i][0]}–${zone.ranges[i][1]} → suma ${zone.ranges[i][0] * 3}–${zone.ranges[i][1] * 3}`)
      .join('; ')}.`,
    '4. Con sumas enteras es fácil comprobar mentalmente cada terna: suma los tres valores de cada atributo y compara con el rango de suma, sin dividir.',
    '5. Al guardar candidatos, prioriza valores cercanos al centro de los rangos y conserva variedad (alguno alto y alguno bajo) para poder compensar.',
  ];
}
