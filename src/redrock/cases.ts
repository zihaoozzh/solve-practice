import { Rng, round } from '../lib/rng';
import { fmt, fmtAuto } from '../lib/format';
import type { Theme } from './themes';
import type { CaseQuestion, Difficulty } from './types';

type CaseGen = (rng: Rng, t: Theme, hard: boolean, id: string) => CaseQuestion | null;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
    typeLabel: 'Cambio porcentual',
    intro: `Los equipos de muestreo contaron ${t.species} en dos ${t.plotPlural} de ${t.region}.`,
    table: {
      title: `Conteo de ${t.species} por ${t.plotWord}`,
      columns: [cap(t.plotWord), ...years.map(String)],
      rows: areas.map((ar, i) => [ar, ...rows[i].map((v) => fmt(v))]),
    },
    prompt: `¿En qué porcentaje cambió el número de ${t.species} en ${areas[ai]} entre ${years[i0]} y ${years[i1]}?`,
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
    trap: `Dividir entre el valor final (${fmt(round(((b - a) / b) * 100, 1), 1)} %) o expresar el ratio final/inicial (${fmt(round((b / a) * 100, 1), 1)} %) son errores típicos. Ojo también a no leer la fila de la otra ${t.plotWord}.`,
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
  const opts = mcq(rng, [ans, wrong, ((r2 - r1) / r2) * 100, askPP ? (r2 / r1) * 10 : r2 - r1 + (r2 > r1 ? 10 : -10)], 1, askPP ? ' p.p.' : '%', 0.8);
  if (!opts) return null;
  const extra = hard ? rng.int(20, 70) : 0;
  return {
    id,
    type: 'pp_vs_pct',
    typeLabel: 'Puntos porcentuales vs. %',
    intro: `Se midió la ${t.rateMetric} en ${t.region} en ${y0} y en ${y1}.`,
    table: {
      title: `${cap(t.rateMetric)}, ${t.region}`,
      columns: ['Año', `${cap(t.rateMetric)} (%)`, ...(hard ? ['Unidades en seguimiento'] : [])],
      rows: [
        [String(y0), `${r1}%`, ...(hard ? [String(extra + rng.int(5, 30))] : [])],
        [String(y1), `${r2}%`, ...(hard ? [String(extra)] : [])],
      ],
    },
    prompt: askPP
      ? `¿En cuántos puntos porcentuales cambió la ${t.rateMetric} entre ${y0} y ${y1}?`
      : `¿En qué porcentaje (cambio relativo) cambió la ${t.rateMetric} entre ${y0} y ${y1}?`,
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
  const ans = used.reduce((s, g) => s + g.count * g.rate, 0) / totalN;
  const simple = used.reduce((s, g) => s + g.rate, 0) / used.length;
  const allW = groups.reduce((s, g) => s + g.count * g.rate, 0) / groups.reduce((s, g) => s + g.count, 0);
  if (Math.abs(ans - simple) < 1.5) return null;
  if (hard && Math.abs(ans - allW) < 1.0) return null;
  return {
    id,
    type: 'weighted_mean',
    typeLabel: 'Media ponderada',
    intro: `Se midió la ${t.rateMetric} en varias ${t.plotPlural}, cada una con un número distinto de ${t.unitWord} en seguimiento.`,
    table: {
      title: `${cap(t.rateMetric)} por ${t.plotWord}`,
      columns: [cap(t.plotWord), `${cap(t.unitWord)} en seguimiento`, `${cap(t.rateMetric)} (%)`],
      rows: groups.map((g, i) => [g.name + (i === excluded ? '*' : ''), fmt(g.count), `${g.rate}%`]),
      footnotes: hard ? [`* ${groups[excluded].name} se inundó durante la temporada y se excluye de la evaluación.`] : undefined,
    },
    prompt: `¿Cuál fue la ${t.rateMetric} global del conjunto de ${t.plotPlural}${hard ? ' evaluadas' : ''}? Redondea a 1 decimal.`,
    format: 'numeric',
    answer: round(ans, 1),
    unit: '%',
    decimals: 1,
    tolerance: 0.1,
    steps: [
      `Media ponderada = Σ(n × tasa) / Σn${hard ? `, sin ${groups[excluded].name} (nota al pie)` : ''}.`,
      `Σ(n × tasa) = ${used.map((g) => `${g.count}×${g.rate}`).join(' + ')} = ${fmt(used.reduce((s, g) => s + g.count * g.rate, 0))}.`,
      `Σn = ${fmt(totalN)} → ${fmt(used.reduce((s, g) => s + g.count * g.rate, 0))} / ${fmt(totalN)} = ${fmtAuto(ans, 3)} ≈ ${fmt(round(ans, 1), 1)} %.`,
    ],
    trap: `La media simple de las tasas (${fmt(round(simple, 1), 1)} %) ignora que cada ${t.plotWord} tiene un número distinto de individuos.${hard ? ` Incluir ${groups[excluded].name} daría ${fmt(round(allW, 1), 1)} %.` : ''}`,
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
    typeLabel: 'Ratio y unidades',
    intro: `Se muestrearon ${t.species} en dos ${t.plotPlural} de distinto tamaño.`,
    table: {
      title: `Resultados por ${t.plotWord}`,
      columns: [cap(t.plotWord), 'Superficie', `Conteo de ${t.unitWord}`],
      rows: [
        [p1, `${fmt(km2, 1)} km²`, fmt(c1)],
        [p2, `${fmt(ha)} ha`, fmt(c2)],
      ],
    },
    prompt: hard
      ? `¿Cuántas veces mayor fue la densidad de ${t.unitWord} (por unidad de superficie) en ${higher} que en ${lower}? Redondea a 2 decimales.`
      : `¿En cuántos ${t.unitWord} por hectárea superó la densidad de ${higher} a la de ${lower}? Redondea a 1 decimal.`,
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

const projection: CaseGen = (rng, t, hard, id) => {
  const p0 = rng.int(12, 90) * 100;
  const r = hard ? rng.float(3.5, 12.5, 1) : rng.int(3, 12);
  const y0 = rng.int(2022, 2025);
  const n = hard ? rng.int(4, 6) : rng.int(2, 4);
  const ans = p0 * (1 + r / 100) ** n;
  const linear = p0 * (1 + (r / 100) * n);
  const opts = mcq(rng, [ans, linear, p0 * (1 + r / 100) ** (n - 1), p0 * (1 + r / 100) ** (n + 1)], 0, '', 5);
  if (!opts) return null;
  return {
    id,
    type: 'projection',
    typeLabel: 'Proyección con tasa de crecimiento',
    intro: `En ${y0}, la población de ${t.species} en ${t.region} se estimó en ${fmt(p0)}. Los investigadores esperan que crezca un ${fmtAuto(r, 1)} % anual (crecimiento compuesto).`,
    table: {
      title: 'Datos de la proyección',
      columns: ['Parámetro', 'Valor'],
      rows: [
        [`Población ${y0}`, fmt(p0)],
        ['Tasa de crecimiento anual', `${fmtAuto(r, 1)}%`],
        ['Año objetivo', String(y0 + n)],
      ],
    },
    prompt: `Si se mantiene esta tasa, ¿cuál será la población en ${y0 + n}? (Redondeado al número entero más cercano.)`,
    format: 'mcq',
    ...opts,
    answer: round(ans, 0),
    unit: t.unitWord,
    decimals: 0,
    tolerance: 0.5,
    steps: [
      `Crecimiento compuesto: P = P₀ × (1 + r)ⁿ, con n = ${y0 + n} − ${y0} = ${n} años.`,
      `${fmt(p0)} × (1 + ${fmtAuto(r / 100, 3)})^${n} = ${fmt(round(ans, 0))}.`,
    ],
    trap: `El crecimiento lineal (${fmt(round(linear, 0))}) ignora el efecto compuesto. Contar mal los años da ${fmt(round(p0 * (1 + r / 100) ** (n - 1), 0))} o ${fmt(round(p0 * (1 + r / 100) ** (n + 1), 0))}.`,
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
  return {
    id,
    type: 'chart_read',
    typeLabel: 'Lectura de gráficos',
    intro: `El gráfico muestra el ${t.censusName.toLowerCase()} de ${t.species} en ${t.region}.`,
    chart: {
      type: rng.chance(0.5) ? 'bar' : 'line',
      title: `${cap(t.species)}, ${years[0]}–${years[5]}`,
      labels: years.map(String),
      series: [{ name: cap(t.species), values }],
      yLabel: t.unitWord,
    },
    prompt: usePct
      ? `¿Entre qué dos años consecutivos fue mayor el aumento PORCENTUAL de ${t.species}?`
      : `¿Entre qué dos años consecutivos fue mayor el aumento del número de ${t.species}?`,
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
