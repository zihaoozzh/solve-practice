import { Rng, round } from '../lib/rng';
import { fmt, fmtAuto } from '../lib/format';
import type { Theme } from './themes';
import type { CaseQuestion, Difficulty } from './types';

type CaseGen = (rng: Rng, t: Theme, hard: boolean, id: string) => CaseQuestion | null;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Texto en el idioma del tema. Nunca consume el PRNG: la misma semilla da el mismo caso en ambos idiomas. */
const tr = (t: Theme, es: string, en: string) => (t.lang === 'en' ? en : es);

/** Construye opciones de opción múltiple: la primera es la correcta. Devuelve null si hay opciones demasiado parecidas. */
function mcq(
  rng: Rng,
  values: number[],
  decimals: number,
  suffix: string,
  minGap: number,
): { options: string[]; optionValues: number[]; correctIndex: number } | null {
  const rounded = values.map((v) => round(v, decimals));
  for (let i = 0; i < rounded.length; i++) {
    if (!Number.isFinite(rounded[i])) return null;
    for (let j = i + 1; j < rounded.length; j++) if (Math.abs(rounded[i] - rounded[j]) < minGap) return null;
  }
  const order = rng.shuffle(rounded.map((_, i) => i));
  return {
    options: order.map((i) => `${fmt(rounded[i], decimals)}${suffix}`),
    optionValues: order.map((i) => rounded[i]),
    correctIndex: order.indexOf(0),
  };
}

const pctChange: CaseGen = (rng, t, hard, id) => {
  const y0 = rng.int(2015, 2020);
  const years = hard ? [y0, y0 + 1, y0 + 2, y0 + 3] : [y0, y0 + 1, y0 + 2];
  const areas = rng.sample(t.subAreas, 2);
  const rows = areas.map(() => {
    let v = rng.int(300, 2400);
    return years.map(() => (v = Math.max(50, Math.round(v * rng.float(0.82, 1.3, 2)))));
  });
  const ai = rng.int(0, 1);
  const i0 = 0;
  const i1 = years.length - 1;
  const a = rows[ai][i0];
  const b = rows[ai][i1];
  const ans = ((b - a) / a) * 100;
  const opts = mcq(rng, [ans, ((b - a) / b) * 100, (b / a) * 100, ((rows[1 - ai][i1] - rows[1 - ai][i0]) / rows[1 - ai][i0]) * 100], 1, '%', 1);
  if (!opts || Math.abs(ans) < 3) return null;
  return {
    id,
    type: 'pct_change',
    typeLabel: 'Porcentajes: cambio porcentual',
    intro: tr(t, `Los equipos de muestreo contaron ${t.species} en dos ${t.plotPlural} de ${t.region}.`, `Survey teams counted ${t.species} in two ${t.plotPlural} of ${t.region}.`),
    table: {
      title: tr(t, `Conteo de ${t.species} por ${t.plotWord}`, `${cap(t.species)} counted per ${t.plotWord}`),
      columns: [cap(t.plotWord), ...years.map(String)],
      rows: areas.map((ar, i) => [ar, ...rows[i].map((v) => fmt(v))]),
    },
    prompt: tr(
      t,
      `¿En qué porcentaje cambió el número de ${t.species} en ${areas[ai]} entre ${years[i0]} y ${years[i1]}?`,
      `By what percentage did the number of ${t.species} in ${areas[ai]} change between ${years[i0]} and ${years[i1]}?`,
    ),
    format: 'mcq',
    ...opts,
    answer: round(ans, 1),
    unit: '%',
    decimals: 1,
    tolerance: 0.05,
    steps: [
      `Cambio % = (valor final − valor inicial) / valor inicial × 100.`,
      `(${fmt(b)} − ${fmt(a)}) / ${fmt(a)} × 100 = ${fmtAuto(ans, 3)} ≈ ${fmt(round(ans, 1), 1)} %.`,
    ],
    trap: `Dividir entre el valor final (${fmt(round(((b - a) / b) * 100, 1), 1)} %) o expresar el ratio final/inicial (${fmt(round((b / a) * 100, 1), 1)} %) son errores típicos. Ojo también a no leer la otra fila de la tabla.`,
  };
};

const ppVsPct: CaseGen = (rng, t, hard, id) => {
  const r1 = rng.int(18, 62);
  let r2 = r1 + rng.pick([-1, 1]) * rng.int(6, 22);
  if (r2 < 5 || r2 > 95) r2 = r1 + 9;
  const y0 = rng.int(2016, 2021);
  const y1 = y0 + (hard ? 3 : 1);
  const askPP = rng.chance(0.5);
  const pp = r2 - r1;
  const rel = ((r2 - r1) / r1) * 100;
  const ans = askPP ? pp : rel;
  const wrong = askPP ? rel : pp;
  const ppSuffix = tr(t, ' p.p.', ' pp');
  const opts = mcq(rng, [ans, wrong, ((r2 - r1) / r2) * 100, askPP ? (r2 / r1) * 10 : r2 - r1 + (r2 > r1 ? 10 : -10)], 1, askPP ? ppSuffix : '%', 0.8);
  if (!opts) return null;
  const extra = hard ? rng.int(20, 70) : 0;
  const extraPrev = hard ? extra + rng.int(5, 30) : 0;
  return {
    id,
    type: 'pp_vs_pct',
    typeLabel: 'Porcentajes: puntos porcentuales vs. %',
    intro: tr(t, `Se midió la ${t.rateMetric} en ${t.region} en ${y0} y en ${y1}.`, `The ${t.rateMetric} in ${t.region} was measured in ${y0} and ${y1}.`),
    table: {
      title: `${cap(t.rateMetric)}, ${t.region}`,
      columns: [tr(t, 'Año', 'Year'), `${cap(t.rateMetric)} (%)`, ...(hard ? [tr(t, 'Unidades en seguimiento', 'Monitored units')] : [])],
      rows: [
        [String(y0), `${r1}%`, ...(hard ? [String(extraPrev)] : [])],
        [String(y1), `${r2}%`, ...(hard ? [String(extra)] : [])],
      ],
    },
    prompt: askPP
      ? tr(t, `¿En cuántos puntos porcentuales cambió la ${t.rateMetric} entre ${y0} y ${y1}?`, `By how many percentage points did the ${t.rateMetric} change between ${y0} and ${y1}?`)
      : tr(
          t,
          `¿En qué porcentaje (cambio relativo) cambió la ${t.rateMetric} entre ${y0} y ${y1}?`,
          `By what percentage (relative change) did the ${t.rateMetric} change between ${y0} and ${y1}?`,
        ),
    format: 'mcq',
    ...opts,
    answer: round(ans, 1),
    unit: askPP ? 'p.p.' : '%',
    decimals: 1,
    tolerance: 0.05,
    steps: askPP
      ? [`Puntos porcentuales = diferencia directa de las dos tasas: ${r2} − ${r1} = ${fmt(pp, 1)} p.p.`]
      : [`Cambio relativo = (${r2} − ${r1}) / ${r1} × 100 = ${fmtAuto(rel, 3)} ≈ ${fmt(round(rel, 1), 1)} %.`],
    trap: askPP
      ? `No confundir con el cambio relativo (${fmt(round(rel, 1), 1)} %). La pregunta pide puntos porcentuales.`
      : `No confundir con la diferencia en puntos porcentuales (${fmt(pp, 1)} p.p.). La pregunta pide el cambio relativo.${hard ? ' La columna de unidades en seguimiento no se necesita.' : ''}`,
  };
};

const weightedMean: CaseGen = (rng, t, hard, id) => {
  const n = hard ? 4 : 3;
  const groups = t.subAreas.slice(0, n).map((name) => ({ name, count: rng.int(4, 60) * 10, rate: rng.int(15, 85) }));
  const excluded = hard ? rng.int(0, n - 1) : -1;
  const used = groups.filter((_, i) => i !== excluded);
  const totalN = used.reduce((s, g) => s + g.count, 0);
  const weighted = used.reduce((s, g) => s + g.count * g.rate, 0);
  const ans = weighted / totalN;
  const simple = used.reduce((s, g) => s + g.rate, 0) / used.length;
  const allW = groups.reduce((s, g) => s + g.count * g.rate, 0) / groups.reduce((s, g) => s + g.count, 0);
  if (Math.abs(ans - simple) < 1.5) return null;
  if (hard && Math.abs(ans - allW) < 1.0) return null;
  return {
    id,
    type: 'weighted_mean',
    typeLabel: 'Proporciones: media ponderada',
    intro: tr(
      t,
      `Se midió la ${t.rateMetric} en varias ${t.plotPlural}, cada una con un número distinto de ${t.unitWord} en seguimiento.`,
      `The ${t.rateMetric} was measured in several ${t.plotPlural}, each with a different number of monitored ${t.unitWord}.`,
    ),
    table: {
      title: tr(t, `${cap(t.rateMetric)} por ${t.plotWord}`, `${cap(t.rateMetric)} by ${t.plotWord}`),
      columns: [cap(t.plotWord), tr(t, `${cap(t.unitWord)} en seguimiento`, `Monitored ${t.unitWord}`), `${cap(t.rateMetric)} (%)`],
      rows: groups.map((g, i) => [g.name + (i === excluded ? '*' : ''), fmt(g.count), `${g.rate}%`]),
      footnotes: hard
        ? [
            tr(
              t,
              `* ${groups[excluded].name} se inundó durante la temporada y se excluye de la evaluación.`,
              `* ${groups[excluded].name} was flooded during the season and is excluded from the evaluation.`,
            ),
          ]
        : undefined,
    },
    prompt: tr(
      t,
      `¿Cuál fue la ${t.rateMetric} global del conjunto de ${t.plotPlural}${hard ? ' evaluadas' : ''}? Redondea a 1 decimal.`,
      `What was the overall ${t.rateMetric} across all ${hard ? 'evaluated ' : ''}${t.plotPlural} combined? Round to 1 decimal place.`,
    ),
    format: 'numeric',
    answer: round(ans, 1),
    unit: '%',
    decimals: 1,
    tolerance: 0.1,
    steps: [
      `Media ponderada = Σ(n × tasa) / Σn${hard ? `, sin ${groups[excluded].name} (nota al pie)` : ''}.`,
      `Σ(n × tasa) = ${used.map((g) => `${g.count}×${g.rate}`).join(' + ')} = ${fmt(weighted)}.`,
      `Σn = ${fmt(totalN)} → ${fmt(weighted)} / ${fmt(totalN)} = ${fmtAuto(ans, 3)} ≈ ${fmt(round(ans, 1), 1)} %.`,
    ],
    trap: `La media simple de las tasas (${fmt(round(simple, 1), 1)} %) ignora que cada grupo tiene un número distinto de individuos.${hard ? ` Incluir ${groups[excluded].name} daría ${fmt(round(allW, 1), 1)} %.` : ''}`,
  };
};

const ratioUnits: CaseGen = (rng, t, hard, id) => {
  const [p1, p2] = rng.sample(t.subAreas, 2);
  const km2 = rng.float(1.2, 6.5, 1);
  const ha = rng.int(40, 480);
  const c1 = rng.int(8, 60) * 10 * Math.round(km2);
  const c2 = rng.int(3, 40) * 10;
  const d1 = c1 / (km2 * 100);
  const d2 = c2 / ha;
  if (Math.abs(d1 - d2) < 0.3) return null;
  const higher = d1 > d2 ? p1 : p2;
  const lower = d1 > d2 ? p2 : p1;
  const ans = hard ? Math.max(d1, d2) / Math.min(d1, d2) : Math.abs(d1 - d2);
  const dec = hard ? 2 : 1;
  const tol = hard ? 0.01 : 0.1;
  const naive = hard ? Math.max(c1 / km2, d2) / Math.min(c1 / km2, d2) : Math.abs(c1 / km2 - d2);
  if (Math.abs(round(naive, dec) - round(ans, dec)) < tol * 3) return null;
  return {
    id,
    type: 'ratio_units',
    typeLabel: 'Proporciones: ratio y unidades',
    intro: tr(t, `Se muestrearon ${t.species} en dos ${t.plotPlural} de distinto tamaño.`, `Two ${t.plotPlural} of different size were surveyed for ${t.species}.`),
    table: {
      title: tr(t, `Resultados por ${t.plotWord}`, `Survey results by ${t.plotWord}`),
      columns: [cap(t.plotWord), tr(t, 'Superficie', 'Area'), tr(t, `Conteo de ${t.unitWord}`, `${cap(t.unitWord)} counted`)],
      rows: [
        [p1, `${fmt(km2, 1)} km²`, fmt(c1)],
        [p2, `${fmt(ha)} ha`, fmt(c2)],
      ],
    },
    prompt: hard
      ? tr(
          t,
          `¿Cuántas veces mayor fue la densidad de ${t.unitWord} (por unidad de superficie) en ${higher} que en ${lower}? Redondea a 2 decimales.`,
          `How many times higher was the density of ${t.unitWord} (per unit area) in ${higher} than in ${lower}? Round to 2 decimal places.`,
        )
      : tr(
          t,
          `¿En cuántos ${t.unitWord} por hectárea superó la densidad de ${higher} a la de ${lower}? Redondea a 1 decimal.`,
          `By how many ${t.unitWord} per hectare did the density in ${higher} exceed the density in ${lower}? Round to 1 decimal place.`,
        ),
    format: 'numeric',
    answer: round(ans, dec),
    unit: hard ? '×' : `${t.unitWord}/ha`,
    decimals: dec,
    tolerance: tol,
    steps: [
      `Convertir a la misma unidad: ${fmt(km2, 1)} km² = ${fmt(km2 * 100)} ha.`,
      `Densidad ${p1} = ${fmt(c1)} / ${fmt(km2 * 100)} = ${fmtAuto(d1, 3)} /ha; densidad ${p2} = ${fmt(c2)} / ${ha} = ${fmtAuto(d2, 3)} /ha.`,
      hard
        ? `Ratio = ${fmtAuto(Math.max(d1, d2), 3)} / ${fmtAuto(Math.min(d1, d2), 3)} = ${fmtAuto(ans, 4)} ≈ ${fmt(round(ans, 2), 2)}.`
        : `Diferencia = ${fmtAuto(Math.max(d1, d2), 3)} − ${fmtAuto(Math.min(d1, d2), 3)} = ${fmtAuto(ans, 3)} ≈ ${fmt(round(ans, 1), 1)} /ha.`,
    ],
    trap: `Las áreas vienen en unidades distintas (km² y ha). Sin convertir (1 km² = 100 ha) se obtiene ${fmtAuto(round(naive, dec), dec)}.`,
  };
};

/** Crecimiento compuesto frente a simple: el enunciado decide qué modelo aplica. */
const projection: CaseGen = (rng, t, hard, id) => {
  const p0 = rng.int(12, 90) * 100;
  const r = hard ? rng.float(3.5, 12.5, 1) : rng.int(3, 12);
  const y0 = rng.int(2022, 2025);
  const n = hard ? rng.int(4, 6) : rng.int(2, 4);
  const simple = rng.chance(0.4); // "X individuos más cada año" (lineal) frente a "X % anual compuesto"
  const step = Math.round((p0 * r) / 100 / 10) * 10; // crecimiento fijo por año en el caso simple
  const compound = p0 * (1 + r / 100) ** n;
  const linear = simple ? p0 + step * n : p0 * (1 + (r / 100) * n);
  const ans = simple ? linear : compound;
  const values = simple
    ? [ans, p0 * (1 + step / p0) ** n, p0 + step * (n - 1), p0 + step * (n + 1)]
    : [ans, linear, p0 * (1 + r / 100) ** (n - 1), p0 * (1 + r / 100) ** (n + 1)];
  const opts = mcq(rng, values, 0, '', 5);
  if (!opts || step <= 0) return null;
  const intro = simple
    ? tr(
        t,
        `En ${y0}, la población de ${t.species} en ${t.region} se estimó en ${fmt(p0)}. Los investigadores esperan que aumente en ${fmt(step)} ${t.unitWord} cada año (aumento fijo, no compuesto).`,
        `In ${y0}, the population of ${t.species} in ${t.region} was estimated at ${fmt(p0)}. Researchers expect it to increase by ${fmt(step)} ${t.unitWord} every year (a fixed increase, not compounded).`,
      )
    : tr(
        t,
        `En ${y0}, la población de ${t.species} en ${t.region} se estimó en ${fmt(p0)}. Los investigadores esperan que crezca un ${fmtAuto(r, 1)} % anual (crecimiento compuesto).`,
        `In ${y0}, the population of ${t.species} in ${t.region} was estimated at ${fmt(p0)}. Researchers expect it to grow by ${fmtAuto(r, 1)}% per year (compounded annually).`,
      );
  return {
    id,
    type: 'projection',
    typeLabel: 'Crecimiento compuesto vs. simple',
    intro,
    table: {
      title: tr(t, 'Datos de la proyección', 'Projection inputs'),
      columns: [tr(t, 'Parámetro', 'Parameter'), tr(t, 'Valor', 'Value')],
      rows: [
        [tr(t, `Población ${y0}`, `Population ${y0}`), fmt(p0)],
        simple
          ? [tr(t, 'Aumento anual', 'Annual increase'), `+${fmt(step)} ${t.unitWord}`]
          : [tr(t, 'Tasa de crecimiento anual', 'Annual growth rate'), `${fmtAuto(r, 1)}%`],
        [tr(t, 'Año objetivo', 'Target year'), String(y0 + n)],
      ],
    },
    prompt: tr(
      t,
      `Si se cumple esta previsión, ¿cuál será la población en ${y0 + n}? (Redondeado al número entero más cercano.)`,
      `If this projection holds, what will the population be in ${y0 + n}? (Rounded to the nearest whole number.)`,
    ),
    format: 'mcq',
    ...opts,
    answer: round(ans, 0),
    unit: t.unitWord,
    decimals: 0,
    tolerance: 0.5,
    steps: simple
      ? [
          `Crecimiento simple (lineal): P = P₀ + aumento × n, con n = ${y0 + n} − ${y0} = ${n} años.`,
          `${fmt(p0)} + ${fmt(step)} × ${n} = ${fmt(round(ans, 0))}.`,
        ]
      : [
          `Crecimiento compuesto: P = P₀ × (1 + r)ⁿ, con n = ${y0 + n} − ${y0} = ${n} años.`,
          `${fmt(p0)} × (1 + ${fmtAuto(r / 100, 3)})^${n} = ${fmt(round(ans, 0))}.`,
        ],
    trap: simple
      ? `El enunciado da un aumento fijo por año: aplicar interés compuesto (${fmt(round(values[1], 0))}) es incorrecto. Contar mal los años da ${fmt(round(values[2], 0))} o ${fmt(round(values[3], 0))}.`
      : `El crecimiento lineal (${fmt(round(linear, 0))}) ignora el efecto compuesto. Contar mal los años da ${fmt(round(values[2], 0))} o ${fmt(round(values[3], 0))}.`,
  };
};

const chartRead: CaseGen = (rng, t, hard, id) => {
  const y0 = rng.int(2014, 2019);
  const years = [0, 1, 2, 3, 4, 5].map((i) => y0 + i);
  let v = rng.int(400, 1800);
  const values = years.map(() => (v = Math.max(80, Math.round((v * rng.float(0.8, 1.32, 2)) / 10) * 10)));
  const diffs = values.slice(1).map((x, i) => x - values[i]);
  const pctDiffs = values.slice(1).map((x, i) => (x - values[i]) / values[i]);
  const usePct = hard;
  const metric = usePct ? pctDiffs : diffs;
  const best = metric.indexOf(Math.max(...metric));
  const sorted = metric.slice().sort((a, b) => b - a);
  if (sorted[0] <= 0) return null;
  if (sorted[0] - sorted[1] < (usePct ? 0.03 : 40)) return null;
  // en Difícil, la mayor subida absoluta no debe coincidir con la mayor relativa (trampa)
  const bestAbs = diffs.indexOf(Math.max(...diffs));
  if (hard && bestAbs === best) return null;
  const candidates = [best, ...rng.shuffle([0, 1, 2, 3, 4].filter((i) => i !== best && (!hard || i !== bestAbs)))];
  const chosen = hard ? [best, bestAbs, ...candidates.slice(1, 3)] : candidates.slice(0, 4);
  const order = rng.shuffle(chosen);
  const label = (i: number) => `${years[i]}–${years[i + 1]}`;
  const chartType = rng.chance(0.5) ? 'bar' : 'line';
  return {
    id,
    type: 'chart_read',
    typeLabel: 'Lectura de gráficos',
    intro: tr(t, `El gráfico muestra el ${t.censusName.toLowerCase()} de ${t.species} en ${t.region}.`, `The chart shows the ${t.censusName.toLowerCase()} of ${t.species} in ${t.region}.`),
    chart: {
      type: chartType,
      title: `${cap(t.species)}, ${years[0]}–${years[5]}`,
      labels: years.map(String),
      series: [{ name: cap(t.species), values }],
      yLabel: t.unitWord,
    },
    prompt: usePct
      ? tr(t, `¿Entre qué dos años consecutivos fue mayor el aumento PORCENTUAL de ${t.species}?`, `Between which two consecutive years was the PERCENTAGE increase in ${t.species} the largest?`)
      : tr(
          t,
          `¿Entre qué dos años consecutivos fue mayor el aumento del número de ${t.species}?`,
          `Between which two consecutive years was the increase in the number of ${t.species} the largest?`,
        ),
    format: 'mcq',
    options: order.map(label),
    optionValues: order.map((i) => i),
    correctIndex: order.indexOf(best),
    answer: best,
    unit: '',
    decimals: 0,
    tolerance: 0,
    steps: [
      usePct ? 'Calcula la variación relativa de cada tramo: (año siguiente − año anterior) / año anterior.' : 'Resta cada par de años consecutivos.',
      ...metric.map((m, i) => `${label(i)}: ${usePct ? `${fmt(round(m * 100, 1), 1)} %` : `${m > 0 ? '+' : ''}${fmt(m)}`}`),
      `Máximo: ${label(best)}.`,
    ],
    trap: usePct
      ? `La mayor subida absoluta (${label(bestAbs)}) no es la mayor subida porcentual: parte de una base más alta.`
      : 'Fíjate en la diferencia entre años consecutivos, no en el año con el valor más alto.',
  };
};

const GENERATORS: CaseGen[] = [pctChange, ppVsPct, weightedMean, ratioUnits, projection, chartRead];

export function generateCases(rng: Rng, theme: Theme, difficulty: Difficulty): CaseQuestion[] {
  const hard = difficulty === 'hard';
  const out: CaseQuestion[] = [];
  GENERATORS.forEach((gen, i) => {
    for (let attempt = 0; attempt < 500; attempt++) {
      const c = gen(rng, theme, hard, `C${i + 1}`);
      if (c) {
        out.push(c);
        return;
      }
    }
    throw new Error(`No se pudo generar el caso ${i}`);
  });
  return rng.shuffle(out).map((c, i) => ({ ...c, id: `C${i + 1}` }));
}
