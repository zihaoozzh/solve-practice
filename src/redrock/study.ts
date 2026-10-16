import { Rng, round } from '../lib/rng';
import { fmt, fmtAuto } from '../lib/format';
import type { Theme } from './themes';
import { validateStudy } from './validate';
import type {
  ChartTask,
  ChartType,
  Datum,
  Difficulty,
  Material,
  MemoPart,
  NumericQuestion,
  ReportBlank,
  Study,
} from './types';

/**
 * Genera el Study de Redrock. Estructura:
 *  - Census table (Site A en individuos, Site B en MILES) con nota al pie: un año excluye juveniles.
 *  - Field note con los juveniles de ese año (+ trampas: juveniles de otro año, datos irrelevantes).
 *  - Párrafo de contexto con el área del sitio A (km² o ha) y el área total de la reserva (trampa).
 *  - Gráfico de líneas con otro método y otro periodo (trampa de periodos).
 *  - Gráfico de barras ambiental (irrelevante) y, en Difícil, tabla de cohortes (irrelevante).
 * Preguntas: % cambio en A (total), densidad en A o ratio B/A, % cambio en B (total).
 */
export function generateStudy(rng: Rng, theme: Theme, difficulty: Difficulty): Study {
  for (let attempt = 0; attempt < 200; attempt++) {
    const s = tryGenerate(rng, theme, difficulty);
    if (s) return s;
  }
  throw new Error('No se pudo generar un Study válido');
}

function tryGenerate(rng: Rng, t: Theme, difficulty: Difficulty): Study | null {
  const hard = difficulty === 'hard';
  const y1 = rng.int(2017, 2021);
  const years = [y1, y1 + 1, y1 + 2, y1 + 3];
  const y4 = years[3];
  const footYearIdx = rng.chance(0.6) ? 3 : 0; // año cuyo censo excluye juveniles
  const yf = years[footYearIdx];

  // --- Censo Site A (individuos) ---
  const a1 = roundTo(rng.int(t.popA[0], t.popA[1]), 10);
  const growthA = rng.float(-0.12, 0.45, 3);
  const aTrue4 = roundTo(a1 * (1 + growthA), 10);
  const a2 = roundTo(a1 + (aTrue4 - a1) * rng.float(0.2, 0.45, 2) + rng.int(-40, 40), 10);
  const a3 = roundTo(a1 + (aTrue4 - a1) * rng.float(0.55, 0.85, 2) + rng.int(-40, 40), 10);
  const aTotals = [a1, a2, a3, aTrue4];
  const shareJA = rng.float(0.08, 0.26, 2);
  const jA = roundTo(aTotals[footYearIdx] * shareJA, 1);
  const aTable = aTotals.slice();
  aTable[footYearIdx] = aTotals[footYearIdx] - jA; // la tabla excluye juveniles ese año

  // --- Censo Site B (miles, 1 decimal) ---
  const b1k = rng.float(t.popB[0], t.popB[1], 1);
  const growthB = rng.float(-0.1, 0.4, 3);
  const b4k = round(b1k * (1 + growthB), 1);
  const b2k = round(b1k + (b4k - b1k) * rng.float(0.2, 0.5, 2), 1);
  const b3k = round(b1k + (b4k - b1k) * rng.float(0.5, 0.85, 2), 1);
  const bTotalsK = [b1k, b2k, b3k, b4k];
  let shareJB = rng.float(0.06, 0.24, 2);
  if (Math.abs(shareJB - shareJA) < 0.06) shareJB = shareJA > 0.15 ? shareJA - 0.08 : shareJA + 0.08;
  const jB = roundTo(bTotalsK[footYearIdx] * 1000 * shareJB, 10);
  const bTableK = bTotalsK.slice();
  bTableK[footYearIdx] = round(bTotalsK[footYearIdx] - jB / 1000, 1);
  // la total real de B ese año se recalcula a partir de lo publicado para que sea exacto
  const bTot = bTableK.map((v, i) => v * 1000 + (i === footYearIdx ? jB : 0));
  const aTot = aTable.map((v, i) => v + (i === footYearIdx ? jA : 0));

  if (aTable.some((v) => v <= 0) || bTableK.some((v) => v <= 0)) return null;

  // --- Áreas ---
  const areaInKm2 = rng.chance(hard ? 0.5 : 0.75); // el área se da en km² y se pide por ha (o al revés)
  const areaKm2 = rng.float(1.5, 9.5, 1);
  const areaHa = round(areaKm2 * 100, 0);
  let reserveHa = roundTo(rng.int(1200, 5200), 10);
  if (Math.abs(reserveHa - areaHa) < 150) reserveHa += 600;
  const reserveKm2 = round(reserveHa / 100, 1);

  // --- Datos ---
  const data: Record<string, Datum> = {};
  const add = (d: Omit<Datum, 'relevant'> & { relevant?: boolean }) => {
    data[d.id] = { relevant: false, ...d };
    return d.id;
  };
  const u = t.unitWord;
  years.forEach((y, i) => {
    add({ id: `A${i + 1}`, value: aTable[i], display: fmt(aTable[i]), unit: u, label: tr(t, `Censo ${t.siteA} ${y}`, `${t.siteA} census ${y}`) + (i === footYearIdx ? tr(t, ' (sin juveniles)', ' (excl. juveniles)') : ''), meta: { series: 'census', site: t.siteA, year: y, excludesJuveniles: i === footYearIdx } });
    add({ id: `B${i + 1}`, value: bTableK[i], display: fmt(bTableK[i], 1), unit: tr(t, `miles de ${u}`, `thousand ${u}`), label: tr(t, `Censo ${t.siteB} ${y}`, `${t.siteB} census ${y}`) + (i === footYearIdx ? tr(t, ' (sin juveniles)', ' (excl. juveniles)') : ''), meta: { series: 'census', site: t.siteB, year: y, excludesJuveniles: i === footYearIdx } });
  });
  add({ id: 'JA', value: jA, display: fmt(jA), unit: u, label: tr(t, `Juveniles ${t.siteA} ${yf}`, `${t.siteA} juveniles ${yf}`), meta: { series: 'juveniles', site: t.siteA, year: yf } });
  add({ id: 'JB', value: jB, display: fmt(jB), unit: u, label: tr(t, `Juveniles ${t.siteB} ${yf}`, `${t.siteB} juveniles ${yf}`), meta: { series: 'juveniles', site: t.siteB, year: yf } });

  // Juveniles de otro año (trampa de periodo)
  const otherIdx = footYearIdx === 3 ? 1 : 2;
  const jTrap = roundTo(aTotals[otherIdx] * rng.float(0.08, 0.25, 2), 1);
  add({
    id: 'JX',
    value: jTrap,
    display: fmt(jTrap),
    unit: u,
    label: tr(t, `Juveniles ${t.siteA} ${years[otherIdx]}`, `${t.siteA} juveniles ${years[otherIdx]}`),
    meta: { series: 'juveniles-included', site: t.siteA, year: years[otherIdx] },
    note: `Juveniles de ${years[otherIdx]}: el censo de ese año ya los incluye, así que no hay que sumarlos.`,
  });

  if (areaInKm2) {
    add({ id: 'AREA', value: areaKm2, display: fmt(areaKm2, 1), unit: 'km²', label: tr(t, `Área censada en ${t.siteA}`, `${t.siteA} surveyed area`) });
    add({ id: 'RES', value: reserveHa, display: fmt(reserveHa), unit: 'ha', label: tr(t, `Superficie total de la reserva (${t.region})`, `${t.region} reserve total area`), note: `Superficie total de la reserva, no el área censada en ${t.siteA}: trampa plausible pero irrelevante.` });
  } else {
    add({ id: 'AREA', value: areaHa, display: fmt(areaHa), unit: 'ha', label: `Área censada en ${t.siteA}` });
    add({ id: 'RES', value: reserveKm2, display: fmt(reserveKm2, 1), unit: 'km²', label: `Superficie total de la reserva (${t.region})`, note: `Superficie total de la reserva, no el área censada en ${t.siteA}: trampa plausible pero irrelevante.` });
  }
  const f1 = t.extraFacts[0];
  const f2 = t.extraFacts[1];
  const f1v = rng.float(f1.min, f1.max, f1.decimals);
  const f2v = rng.float(f2.min, f2.max, f2.decimals);
  add({ id: 'F1', value: f1v, display: fmt(f1v, f1.decimals), unit: f1.unit, label: f1.label, note: 'Dato de contexto sin relación con el crecimiento de la población.' });
  add({ id: 'F2', value: f2v, display: fmt(f2v, f2.decimals), unit: f2.unit, label: f2.label, note: 'Dato de contexto sin relación con el crecimiento de la población.' });
  const env0 = t.envVars[0];
  const envA = rng.float(env0.min, env0.max, env0.decimals);
  const envB = rng.float(env0.min, env0.max, env0.decimals);
  const observers = rng.int(6, 24);
  add({ id: 'OBS', value: observers, display: fmt(observers), unit: tr(t, 'observadores', 'observers'), label: tr(t, `Observadores del censo ${yf}`, `Census observers ${yf}`), note: 'Número de observadores: no afecta al cálculo.' });

  // Serie de monitoreo: otro método y otro periodo (y0..y3)
  const monYears = [y1 - 1, y1, y1 + 1, y1 + 2];
  const monVals = monYears.map((_, i) => {
    const base = i === 0 ? a1 * rng.float(0.85, 0.98, 2) : aTotals[i - 1];
    return roundTo(base * rng.float(0.62, 0.8, 2), 10);
  });
  monVals.forEach((v, i) =>
    add({
      id: `M${i}`,
      value: v,
      display: fmt(v),
      unit: u,
      label: tr(t, `${t.monitoringName} ${t.siteA} ${monYears[i]}`, `${t.siteA} ${t.monitoringName.toLowerCase()} ${monYears[i]}`),
      note: `Serie de ${t.monitoringName.toLowerCase()}: otro método (no es el censo anual) y otro periodo (${monYears[0]}–${monYears[3]}).`,
    }),
  );

  // Gráfico ambiental (irrelevante)
  const env1 = t.envVars[1];
  const envSeries = years.map(() => rng.float(env1.min, env1.max, env1.decimals));
  envSeries.forEach((v, i) =>
    add({ id: `E${i}`, value: v, display: fmt(v, env1.decimals), unit: env1.unit, label: `${env1.label} ${years[i]}`, note: 'Variable ambiental: contexto, no se necesita para ninguna pregunta.' }),
  );

  // Cohortes (solo Difícil, irrelevante)
  const cohorts = hard
    ? [0, 1, 2].map((i) => ({ released: roundTo(rng.int(120, 900), 10), surv: rng.int(18, 74), site: i === 2 ? t.siteC : t.siteA }))
    : [];
  cohorts.forEach((c, i) => {
    add({ id: `CR${i}`, value: c.released, display: fmt(c.released), unit: u, label: tr(t, `${t.cohortName} ${String.fromCharCode(65 + i)}: liberados`, `${t.cohortName} ${String.fromCharCode(65 + i)} released`), note: 'Datos de cohortes liberadas: plausibles pero no forman parte del censo que pide el objetivo.' });
    add({ id: `CS${i}`, value: c.surv, display: `${c.surv}`, unit: '%', label: tr(t, `${t.cohortName} ${String.fromCharCode(65 + i)}: supervivencia`, `${t.cohortName} ${String.fromCharCode(65 + i)} survival`), note: 'Datos de cohortes liberadas: plausibles pero no forman parte del censo que pide el objetivo.' });
  });

  // ---------- Preguntas ----------
  const pct = (a: number, b: number) => ((b - a) / a) * 100;
  // Las respuestas del estudio se piden con 2 decimales (según las fuentes sobre la prueba real).
  const qDec = 2;
  const tol1 = 0.02;

  const aFootData = footYearIdx === 0 ? ['A1', 'JA', 'A4'] : ['A1', 'A4', 'JA'];
  const q1Ans = pct(aTot[0], aTot[3]);
  const q1: NumericQuestion = {
    id: 'Q1',
    kind: 'pct-total-A',
    prompt: tr(t, `Según el ${t.censusName.toLowerCase()}, ¿cuál fue el cambio porcentual de la población TOTAL de ${t.species} (adultos y juveniles) en ${t.siteA} entre ${y1} y ${y4}?`, `According to the ${t.censusName.toLowerCase()}, what was the percentage change in the TOTAL population of ${t.species} (adults and juveniles) at ${t.siteA} between ${y1} and ${y4}?`),
    unit: '%',
    decimals: qDec,
    tolerance: tol1,
    answer: round(q1Ans, qDec),
    requiredData: aFootData,
    steps: [
      `Total ${y1} = ${footYearIdx === 0 ? `${fmt(aTable[0])} + ${fmt(jA)} juveniles = ${fmt(aTot[0])}` : fmt(aTot[0])}.`,
      `Total ${y4} = ${footYearIdx === 3 ? `${fmt(aTable[3])} + ${fmt(jA)} juveniles = ${fmt(aTot[3])}` : fmt(aTot[3])}.`,
      `Cambio % = (final − inicial) / inicial × 100 = (${fmt(aTot[3])} − ${fmt(aTot[0])}) / ${fmt(aTot[0])} × 100 = ${fmtAuto(q1Ans, 3)} ≈ ${fmt(round(q1Ans, 2), 2)} %.`,
    ],
    trap: `La nota al pie indica que el censo de ${yf} excluye juveniles: hay que sumar los ${fmt(jA)} juveniles de las notas de campo. La serie de ${t.monitoringName.toLowerCase()} es otro método y otro periodo.`,
    wrongApproaches: [
      { label: 'Sin sumar juveniles', value: pct(aTable[0], aTable[3]) },
      { label: 'Usando la serie de monitoreo', value: pct(monVals[1], monVals[3]) },
      { label: 'Base invertida', value: ((aTot[3] - aTot[0]) / aTot[3]) * 100 },
    ],
  };

  const bTot1 = bTot[0];
  const bTot4 = bTot[3];
  const q3Ans = pct(bTot1, bTot4);
  const q3: NumericQuestion = {
    id: 'Q3',
    kind: 'pct-total-B',
    prompt: tr(t, `Según el ${t.censusName.toLowerCase()}, ¿cuál fue el cambio porcentual de la población TOTAL de ${t.species} (adultos y juveniles) en ${t.siteB} entre ${y1} y ${y4}?`, `According to the ${t.censusName.toLowerCase()}, what was the percentage change in the TOTAL population of ${t.species} (adults and juveniles) at ${t.siteB} between ${y1} and ${y4}?`),
    unit: '%',
    decimals: qDec,
    tolerance: tol1,
    answer: round(q3Ans, qDec),
    requiredData: ['B1', 'B4', 'JB'],
    steps: [
      `La tabla de ${t.siteB} está en MILES: ${fmt(bTableK[0], 1)} mil = ${fmt(bTableK[0] * 1000)} y ${fmt(bTableK[3], 1)} mil = ${fmt(bTableK[3] * 1000)}.`,
      `El censo de ${yf} excluye juveniles: se suman ${fmt(jB)} (en unidades) al dato de ${yf} ya convertido.`,
      `Total ${y1} = ${fmt(bTot1)}; total ${y4} = ${fmt(bTot4)}.`,
      `Cambio % = (${fmt(bTot4)} − ${fmt(bTot1)}) / ${fmt(bTot1)} × 100 = ${fmtAuto(q3Ans, 3)} ≈ ${fmt(round(q3Ans, 2), 2)} %.`,
    ],
    trap: `Unidades mezcladas: el censo de ${t.siteB} está en miles y los juveniles en unidades. Si sumas ${fmt(jB)} a ${fmt(bTableK[footYearIdx], 1)} sin convertir, el resultado se dispara.`,
    wrongApproaches: [
      { label: 'Sin sumar juveniles', value: pct(bTableK[0], bTableK[3]) },
      { label: 'Sumando juveniles sin convertir miles', value: pct(bTableK[0] + (footYearIdx === 0 ? jB : 0), bTableK[3] + (footYearIdx === 3 ? jB : 0)) },
      { label: 'Base invertida', value: ((bTot4 - bTot1) / bTot4) * 100 },
    ],
  };

  const useDensity = rng.chance(0.6);
  let q2: NumericQuestion;
  const aTot4 = aTot[3];
  if (useDensity) {
    const perHa = areaInKm2; // si el área viene en km², se pide por ha; si viene en ha, por km²
    const dec = 2;
    const ans = perHa ? aTot4 / (areaKm2 * 100) : aTot4 / (areaHa / 100);
    const tol = 0.02;
    const target = perHa ? tr(t, 'por hectárea', 'per hectare') : tr(t, 'por kilómetro cuadrado (km²)', 'per square kilometre (km²)');
    q2 = {
      id: 'Q2',
      kind: perHa ? 'density-ha' : 'density-km2',
      prompt: tr(t, `¿Cuál fue la densidad de ${t.species} (población total, incluidos juveniles) en el área censada de ${t.siteA} en ${y4}, en ${u} ${target}?`, `What was the density of ${t.species} (total population, including juveniles) in the surveyed area of ${t.siteA} in ${y4}, in ${u} ${target}?`),
      unit: perHa ? `${u}/ha` : `${u}/km²`,
      decimals: dec,
      tolerance: tol,
      answer: round(ans, dec),
      requiredData: footYearIdx === 3 ? ['A4', 'JA', 'AREA'] : ['A4', 'AREA'],
      steps: [
        `Población total ${y4} = ${footYearIdx === 3 ? `${fmt(aTable[3])} + ${fmt(jA)} = ` : ''}${fmt(aTot4)}.`,
        perHa
          ? `Área censada = ${fmt(areaKm2, 1)} km² × 100 = ${fmt(areaKm2 * 100)} ha (1 km² = 100 ha).`
          : `Área censada = ${fmt(areaHa)} ha ÷ 100 = ${fmtAuto(areaHa / 100, 2)} km² (1 km² = 100 ha).`,
        `Densidad = ${fmt(aTot4)} ÷ ${perHa ? fmt(areaKm2 * 100) + ' ha' : fmtAuto(areaHa / 100, 2) + ' km²'} = ${fmtAuto(ans, 3)} ≈ ${fmt(round(ans, dec), dec)}.`,
      ],
      trap: `Conversión km² ↔ ha (1 km² = 100 ha). Además, el área total de la reserva (${data.RES.display} ${data.RES.unit}) no es el área censada.`,
      wrongApproaches: [
        { label: 'Sin convertir unidades de área', value: perHa ? aTot4 / areaKm2 : aTot4 / areaHa },
        { label: 'Usando el área de la reserva', value: perHa ? aTot4 / (areaInKm2 ? reserveHa : reserveKm2 * 100) : aTot4 / reserveKm2 },
        ...(footYearIdx === 3 ? [{ label: 'Sin sumar juveniles', value: perHa ? aTable[3] / (areaKm2 * 100) : aTable[3] / (areaHa / 100) }] : []),
      ],
    };
  } else {
    const ans = bTot4 / aTot4;
    q2 = {
      id: 'Q2',
      kind: 'ratio-B-A',
      prompt: tr(t, `En ${y4}, ¿cuántas veces mayor fue la población TOTAL de ${t.species} en ${t.siteB} que en ${t.siteA}? (Exprésalo como ratio: ${t.siteB} ÷ ${t.siteA}.)`, `In ${y4}, how many times larger was the TOTAL population of ${t.species} at ${t.siteB} than at ${t.siteA}? (Express as a ratio, ${t.siteB} ÷ ${t.siteA}.)`),
      unit: '×',
      decimals: 2,
      tolerance: 0.02,
      answer: round(ans, 2),
      requiredData: footYearIdx === 3 ? ['A4', 'JA', 'B4', 'JB'] : ['A4', 'B4'],
      steps: [
        `Total ${t.siteB} ${y4} = ${footYearIdx === 3 ? `${fmt(bTableK[3], 1)} mil + ${fmt(jB)} = ` : `${fmt(bTableK[3], 1)} mil = `}${fmt(bTot4)}.`,
        `Total ${t.siteA} ${y4} = ${footYearIdx === 3 ? `${fmt(aTable[3])} + ${fmt(jA)} = ` : ''}${fmt(aTot4)}.`,
        `Ratio = ${fmt(bTot4)} ÷ ${fmt(aTot4)} = ${fmtAuto(ans, 4)} ≈ ${fmt(round(ans, 2), 2)}.`,
      ],
      trap: `El censo de ${t.siteB} está en miles: hay que multiplicar por 1,000 antes de dividir.${footYearIdx === 3 ? ' Y en ' + y4 + ' faltan los juveniles en ambos sitios.' : ''}`,
      wrongApproaches: [
        { label: 'Sin convertir miles', value: bTableK[3] / aTot4 },
        { label: 'Ratio invertido', value: aTot4 / bTot4 },
        ...(footYearIdx === 3 ? [{ label: 'Sin juveniles', value: (bTableK[3] * 1000) / aTable[3] }] : []),
      ],
    };
  }

  const questions = [q1, q2, q3];
  // Unicidad: ningún error típico puede caer dentro de la tolerancia (con margen).
  for (const q of questions) {
    if (!Number.isFinite(q.answer)) return null;
    for (const w of q.wrongApproaches) {
      if (Math.abs(round(w.value, q.decimals) - q.answer) <= q.tolerance * 3) return null;
    }
  }
  if (Math.abs(q1.answer - q3.answer) < 2) return null; // conclusión clara
  if (Math.abs(q1.answer) < 1 || Math.abs(q3.answer) < 1) return null;
  for (const q of questions) q.requiredData.forEach((id) => (data[id].relevant = true));
  for (const d of Object.values(data)) {
    if (d.relevant || d.note) continue;
    d.note =
      d.meta?.series === 'census'
        ? `Año intermedio del censo: el objetivo compara ${y1} con ${y4}, así que los años intermedios no entran en ningún cálculo.`
        : d.id === 'AREA'
        ? 'El área censada solo hacía falta si se pedía la densidad; en este escenario ninguna pregunta la usa.'
        : 'Ninguna pregunta de este escenario necesita esta cifra.';
  }

  // ---------- Materiales ----------
  const S = (id: string) => ({ datum: id });
  const intro: Material = {
    kind: 'paragraph',
    id: 'intro',
    title: tr(t, 'Antecedentes del proyecto', 'Project background'),
    claims: [
      { kind: 'site-role', site: t.siteA, role: 'intervention' },
      { kind: 'site-role', site: t.siteB, role: 'reference' },
    ],
    segments: [
      tr(t, `${t.programCap} comenzó en ${y1} en ${t.siteA}, uno de los dos puntos de seguimiento de la reserva de ${t.region}. La reserva ocupa una superficie total de `, `${t.programCap} started in ${y1} at ${t.siteA}, one of two monitoring sites in the ${t.region} reserve. The reserve covers a total of `),
      S('RES'),
      tr(t, ` ${data.RES.unit}, mientras que el área censada cada año en ${t.siteA} es de `, ` ${data.RES.unit}, while the area surveyed each year at ${t.siteA} is `),
      S('AREA'),
      tr(t, ` ${data.AREA.unit}. ${t.siteB} no recibió ninguna intervención y sirve como sitio de referencia. En la primera fase, ${f1.text} `, ` ${data.AREA.unit}. ${t.siteB} received no intervention and serves as the reference site. In the first phase, ${f1.text} `),
      S('F1'),
      tr(t, ` ${f1.unit}, y ${f2.text} `, ` ${f1.unit}, and ${f2.text} `),
      S('F2'),
      ` ${f2.unit}.`,
    ],
  };

  const census: Material = {
    kind: 'table',
    id: 'census',
    title: `${t.censusName} — ${t.species}`,
    claims: [
      { kind: 'excludes-juveniles', year: yf },
      { kind: 'period', series: 'census', from: y1, to: y4 },
    ],
    columns: [tr(t, 'Sitio', 'Site'), ...years.map(String)],
    rows: [
      { label: `${t.siteA} (${u})`, cells: years.map((_, i) => ({ datum: `A${i + 1}`, mark: i === footYearIdx ? '*' : undefined })) },
      { label: tr(t, `${t.siteB} (miles de ${u})`, `${t.siteB} (thousand ${u})`), cells: years.map((_, i) => ({ datum: `B${i + 1}`, mark: i === footYearIdx ? '*' : undefined })) },
    ],
    footnotes: [tr(t, `* Los conteos de ${yf} no incluyen juveniles (${t.juveniles}); se registraron aparte en las notas de campo.`, `* ${yf} counts exclude juveniles (${t.juveniles}); these were recorded separately in the field notes.`)],
  };

  const fieldNote: Material = {
    kind: 'paragraph',
    id: 'fieldnote',
    title: tr(t, `Notas de campo, temporada ${yf}`, `Field notes, ${yf} season`),
    claims: [
      { kind: 'juvenile-count', year: yf, site: t.siteA, datum: 'JA' },
      { kind: 'juvenile-count', year: yf, site: t.siteB, datum: 'JB' },
      { kind: 'already-included', year: years[otherIdx], site: t.siteA, datum: 'JX' },
    ],
    segments: [
      tr(t, `Por un cambio en el protocolo de muestreo, en ${yf} los juveniles (${t.juveniles}) se contaron en hojas aparte: `, `Because of a change in survey protocol, juveniles (${t.juveniles}) were tallied on separate sheets in ${yf}: `),
      S('JA'),
      tr(t, ` en ${t.siteA} y `, ` at ${t.siteA} and `),
      S('JB'),
      tr(t, ` en ${t.siteB} (conteos en individuos). El equipo del censo lo formaron `, ` at ${t.siteB} (individual counts). The census team comprised `),
      S('OBS'),
      tr(t, ` observadores. Como referencia, en ${years[otherIdx]} el equipo contó `, ` observers. For comparison, in ${years[otherIdx]} the team counted `),
      S('JX'),
      tr(t, ` juveniles en ${t.siteA}; ese año ya están incluidos en el total del censo. ${env0.label} durante el censo: ${fmt(envA, env0.decimals)} ${env0.unit} en ${t.siteA} y ${fmt(envB, env0.decimals)} ${env0.unit} en ${t.siteB}.`, ` juveniles at ${t.siteA}; that year they are already included in the census total. ${env0.label} during the census: ${fmt(envA, env0.decimals)} ${env0.unit} at ${t.siteA} and ${fmt(envB, env0.decimals)} ${env0.unit} at ${t.siteB}.`),
    ],
  };

  const monChart: Material = {
    kind: 'chart',
    id: 'monchart',
    claims: [{ kind: 'period', series: 'monitoring', from: monYears[0], to: monYears[3] }],
    chart: {
      type: 'line',
      title: `${t.siteA}: ${t.monitoringName.toLowerCase()}, ${monYears[0]}–${monYears[3]}`,
      labels: monYears.map(String),
      series: [{ name: t.siteA, values: monVals, datumIds: monVals.map((_, i) => `M${i}`) }],
      yLabel: u,
    },
    footnotes: [tr(t, `Conteos de una sola visita y solo de adultos; no son directamente comparables con el ${t.censusName.toLowerCase()}.`, `Single-visit counts of adults only; not directly comparable with the ${t.censusName.toLowerCase()}.`)],
  };

  const envChart: Material = {
    kind: 'chart',
    id: 'envchart',
    claims: [{ kind: 'period', series: 'environment', from: y1, to: y4 }],
    chart: {
      type: 'bar',
      title: tr(t, `${env1.label} en ${t.siteA}, ${y1}–${y4}`, `${env1.label} at ${t.siteA}, ${y1}–${y4}`),
      labels: years.map(String),
      series: [{ name: env1.label, values: envSeries, datumIds: envSeries.map((_, i) => `E${i}`) }],
      yLabel: env1.unit,
      decimals: env1.decimals,
    },
    footnotes: [],
  };

  const materials: Material[] = [intro];
  const rest: Material[] = [census, fieldNote, monChart, envChart];
  if (hard) {
    rest.push({
      kind: 'table',
      id: 'cohorts',
      title: tr(t, `Liberaciones por ${t.cohortName.toLowerCase()}, ${y1}–${y1 + 1}`, `Releases by ${t.cohortName.toLowerCase()}, ${y1}–${y1 + 1}`),
      claims: [
        { kind: 'site-role', site: t.siteC, role: 'external' },
        { kind: 'period', series: 'releases', from: y1, to: y1 + 1 },
        ...cohorts.map((c, i) => ({ kind: 'activity' as const, site: c.site, row: i })),
      ],
      columns: [t.cohortName, tr(t, 'Liberado en', 'Released at'), tr(t, `Número liberado (${u})`, `Number released (${u})`), tr(t, 'Supervivencia al año (%)', 'Survival after 1 year (%)')],
      rows: cohorts.map((c, i) => ({
        label: String.fromCharCode(65 + i),
        cells: [{ text: c.site }, { datum: `CR${i}` }, { datum: `CS${i}` }],
      })),
      footnotes: [
        tr(t, 'Los individuos liberados llevan marca; en el censo se cuentan como cualquier otro individuo.', 'Released individuals are tagged; tagged animals are counted in the census like any other individual.'),
        tr(t, `${t.siteC} está fuera del área de estudio: sus liberaciones no afectan a ninguno de los dos censos.`, `${t.siteC} lies outside the study area: releases there do not affect either census.`),
      ],
    });
  }
  materials.push(...rng.shuffle(rest));

  // ---------- Report ----------
  // Párrafo ya redactado con huecos (desplegables y números), como describen las fuentes sobre la prueba real.
  const r2 = (x: number) => fmt(round(x, 2), 2);
  const ppDiff = q1Ans - q3Ans;
  const relDiff = (ppDiff / Math.abs(q3Ans)) * 100;
  const ppOptionsRaw = [
    { v: round(Math.abs(ppDiff), 2), ok: true },
    { v: round(Math.abs(relDiff), 2), ok: false },
    { v: round(Math.abs(q1Ans + q3Ans), 2), ok: false },
    { v: round(Math.abs(pct(aTable[0], aTable[3]) - pct(bTableK[0], bTableK[3])), 2), ok: false },
  ];
  const ppOptions = dedupeOptions(rng, ppOptionsRaw, 2, (k) => round(Math.abs(ppDiff) + k, 2));
  const ppBlank: ReportBlank = {
    id: 'b5',
    kind: 'select',
    options: ppOptions.map((o) => fmt(o.v, 2)),
    correctIndex: ppOptions.findIndex((o) => o.ok),
    explanation: `Diferencia en puntos porcentuales = ${r2(q1Ans)} − (${r2(q3Ans)}) = ${r2(ppDiff)} p.p. (en valor absoluto, ${r2(Math.abs(ppDiff))}). No es un cambio relativo: ${r2(Math.abs(relDiff))} % sería la variación porcentual entre las dos tasas.`,
  };

  const dirOptions = t.lang === 'en' ? ['increased', 'decreased'] : ['aumentó', 'disminuyó'];
  const dirBlank = (id: string, value: number, site: string): ReportBlank => ({
    id,
    kind: 'select',
    options: dirOptions,
    correctIndex: value >= 0 ? 0 : 1,
    explanation: `En ${site} el cambio total fue de ${r2(value)} %, así que la población ${value >= 0 ? 'aumentó' : 'disminuyó'}.`,
  });
  const numBlank = (id: string, value: number, what: string): ReportBlank => ({
    id,
    kind: 'number',
    answer: round(Math.abs(value), 2),
    tolerance: 0.02,
    decimals: 2,
    explanation: `Es el valor absoluto del resultado de ${what}: ${r2(Math.abs(value))} %.`,
  });
  const b1 = dirBlank('b1', q1Ans, t.siteA);
  const b2 = numBlank('b2', q1Ans, 'la pregunta 1 de Análisis');
  const b3dir = dirBlank('b3', q3Ans, t.siteB);
  const b4num = numBlank('b4', q3Ans, 'la pregunta 3 de Análisis');
  const winnerIsA = q1Ans > q3Ans;
  const winner: ReportBlank = {
    id: 'b6',
    kind: 'select',
    options: [t.siteA, t.siteB],
    correctIndex: winnerIsA ? 0 : 1,
    explanation: `${winnerIsA ? t.siteA : t.siteB} tuvo el mayor cambio total (${r2(Math.max(q1Ans, q3Ans))} % frente a ${r2(Math.min(q1Ans, q3Ans))} %).`,
  };

  let b7: ReportBlank;
  let b7Sentence: MemoPart[];
  if (useDensity) {
    const dens = q2.answer;
    const above = rng.chance(0.5);
    const factor = above ? rng.float(0.6, 0.85, 2) : rng.float(1.15, 1.45, 2);
    const bench = round(dens * factor, 1);
    b7 = {
      id: 'b7',
      kind: 'select',
      options: t.lang === 'en' ? ['above', 'below', 'equal to'] : ['superior a', 'inferior a', 'igual a'],
      correctIndex: dens > bench ? 0 : 1,
      explanation: `Densidad calculada en Análisis: ${fmt(dens, 2)} ${q2.unit}, ${dens > bench ? 'por encima' : 'por debajo'} de la referencia de ${fmt(bench, 1)}.`,
    };
    b7Sentence = [
      tr(t, `La densidad de población en ${t.siteA} en ${y4} fue `, `Population density at ${t.siteA} in ${y4} was `),
      { blank: 'b7' },
      tr(t, ` la referencia del programa, de ${fmt(bench, 1)} ${q2.unit}.`, ` the program benchmark of ${fmt(bench, 1)} ${q2.unit}.`),
    ];
  } else {
    const ratioOpts = dedupeOptions(
      rng,
      [{ v: q2.answer, ok: true }, ...q2.wrongApproaches.map((w) => ({ v: round(w.value, 2), ok: false }))],
      2,
      (k) => round(q2.answer + k * 0.37, 2),
    );
    b7 = {
      id: 'b7',
      kind: 'select',
      options: ratioOpts.map((o) => fmt(o.v, 2)),
      correctIndex: ratioOpts.findIndex((o) => o.ok),
      explanation: `Ratio calculado en Análisis: ${fmt(q2.answer, 2)} (${t.siteB} ÷ ${t.siteA}, con ${t.siteB} convertido de miles a unidades).`,
    };
    b7Sentence = [
      tr(t, `En ${y4}, la población total de ${t.siteB} fue `, `In ${y4}, the total population at ${t.siteB} was `),
      { blank: 'b7' },
      tr(t, ` veces la de ${t.siteA}.`, ` times that of ${t.siteA}.`),
    ];
  }

  const supports = winnerIsA;
  const conclOptions = t.lang === 'en' ? ['supports', 'does not support', 'cannot be evaluated against'] : ['respaldan', 'no respaldan', 'no permiten evaluar'];
  const b8: ReportBlank = {
    id: 'b8',
    kind: 'select',
    options: conclOptions,
    correctIndex: supports ? 0 : 1,
    explanation: supports
      ? `El crecimiento total en ${t.siteA} (${r2(q1Ans)} %) supera al del sitio de referencia (${r2(q3Ans)} %), así que la evidencia apoya el efecto del programa.`
      : `El crecimiento total en ${t.siteA} (${r2(q1Ans)} %) no supera al del sitio de referencia (${r2(q3Ans)} %): la evidencia no apoya el efecto del programa.`,
  };
  // Justificación: solo una razón es la comparación correcta; las demás usan datos no comparables o irrelevantes.
  const whyRaw = [
    { key: 'beats', text: tr(t, `el crecimiento total de ${t.siteA} superó al del sitio de referencia`, `total growth at ${t.siteA} exceeded growth at the reference site`) },
    { key: 'trails', text: tr(t, `el crecimiento total de ${t.siteA} no superó al del sitio de referencia`, `total growth at ${t.siteA} did not exceed growth at the reference site`) },
    { key: 'size', text: tr(t, `${t.siteB} tenía más individuos que ${t.siteA} en ${y4}`, `${t.siteB} had more individuals than ${t.siteA} in ${y4}`) },
    { key: 'monitor', text: tr(t, `la serie «${t.monitoringName}» de ${t.siteA} subió`, `the «${t.monitoringName}» series at ${t.siteA} went up`) },
  ];
  const whyOrder = rng.shuffle([0, 1, 2, 3]);
  const b9: ReportBlank = {
    id: 'b9',
    kind: 'select',
    options: whyOrder.map((i) => whyRaw[i].text),
    correctIndex: whyOrder.indexOf(supports ? 0 : 1),
    explanation:
      'La conclusión se apoya en comparar el crecimiento total de ambos sitios en el mismo periodo. El tamaño absoluto de cada población no dice nada del efecto del programa, y la serie de monitoreo es otro método y otro periodo (no comparable con el censo).',
  };

  const memo: MemoPart[][] = [
    [
      tr(t, `Entre ${y1} y ${y4}, la población total de ${t.species} en ${t.siteA} `, `Between ${y1} and ${y4}, the total population of ${t.species} at ${t.siteA} `),
      { blank: 'b1' },
      tr(t, ' un ', ' by '),
      { blank: 'b2' },
      tr(t, ` %. En el sitio de referencia, ${t.siteB}, la población total `, `%. At the reference site, ${t.siteB}, the total population `),
      { blank: 'b3' },
      tr(t, ' un ', ' by '),
      { blank: 'b4' },
      ' %.',
    ],
    [
      tr(t, 'La diferencia entre ambos sitios fue de ', 'The difference between the two sites was '),
      { blank: 'b5' },
      tr(t, ' puntos porcentuales a favor de ', ' percentage points in favour of '),
      { blank: 'b6' },
      '.',
    ],
    b7Sentence,
    [
      tr(t, 'En conjunto, los datos del censo ', 'Overall, the census evidence '),
      { blank: 'b8' },
      tr(t, ` la conclusión de que ${t.program} aumentó el crecimiento de la población en ${t.siteA}, porque `, ` the conclusion that ${t.program} increased population growth at ${t.siteA}, because `),
      { blank: 'b9' },
      '.',
    ],
  ];
  const blanks = [b1, b2, b3dir, b4num, ppBlank, winner, b7, b8, b9];

  const chartTask = makeChartTask(rng, t, { y1, y4, yf, q1Ans, q3Ans, aTable, aTot, jA, footYearIdx, bTableK, bTot });

  const study: Study = {
    theme: t.nameEs,
    objective: tr(
      t,
      `Determinar si ${t.program} aumentó el crecimiento de la población total (adultos y juveniles) de ${t.species} en ${t.siteA} entre ${y1} y ${y4}, en comparación con el sitio de referencia ${t.siteB}, según el ${t.censusName.toLowerCase()}.`,
      `Determine whether ${t.program} increased the growth of the total population (adults and juveniles) of ${t.species} at ${t.siteA} between ${y1} and ${y4}, compared with the reference site ${t.siteB}, according to the ${t.censusName.toLowerCase()}.`,
    ),
    context: tr(t, `Reserva de ${t.region}: evaluación ${del(t.program)}`, `${t.region} reserve: evaluation of ${t.program}`),
    materials,
    data,
    questions,
    memoTitle: tr(t, `Memorando: evaluación ${del(t.program)}`, `Memo: evaluation of ${t.program}`),
    memo,
    blanks,
    chartTask,
    facts: { siteA: t.siteA, siteB: t.siteB, period: [y1, y4], censusYears: years, footnoteYear: yf },
  };
  // Si el texto, las tablas o las notas se contradicen, se descarta y se genera otro.
  return validateStudy(study).length === 0 ? study : null;
}

function makeChartTask(
  rng: Rng,
  t: Theme,
  v: { y1: number; y4: number; yf: number; q1Ans: number; q3Ans: number; aTable: number[]; aTot: number[]; jA: number; footYearIdx: number; bTableK: number[]; bTot: number[] },
): ChartTask {
  const kind = rng.pick(['bar', 'pie', 'line'] as ChartType[]);
  const pct = (a: number, b: number) => ((b - a) / a) * 100;
  if (kind === 'bar') {
    const opts = shuffleOpts(rng, [
      { text: `${fmt(round(v.q1Ans, 2), 2)}%`, value: round(v.q1Ans, 2) },
      { text: `${fmt(round(v.q3Ans, 2), 2)}%`, value: round(v.q3Ans, 2) },
      { text: `${fmt(round(pct(v.aTable[0], v.aTable[3]), 2), 2)}%`, value: round(pct(v.aTable[0], v.aTable[3]), 2) },
      { text: `${fmt(round(pct(v.bTableK[0], v.bTableK[3]), 2), 2)}%`, value: round(pct(v.bTableK[0], v.bTableK[3]), 2) },
    ]);
    return {
      message: tr(t, `Compara el cambio porcentual de la población total entre ${t.siteA} y ${t.siteB} en ${v.y1}–${v.y4}.`, `Compare the percentage change in total population between ${t.siteA} and ${t.siteB} over ${v.y1}–${v.y4}.`),
      correctType: 'bar',
      elements: [
        { label: t.siteA, correctIndex: opts.findIndex((o) => o.value === round(v.q1Ans, 2)) },
        { label: t.siteB, correctIndex: opts.findIndex((o) => o.value === round(v.q3Ans, 2)) },
      ],
      valueOptions: opts,
      unit: '%',
      explanation: `Comparar una magnitud entre categorías (dos sitios) → gráfico de barras. Valores: los cambios totales de Análisis (con juveniles), no los del censo sin corregir.`,
    };
  }
  if (kind === 'pie') {
    const adults = v.aTable[v.footYearIdx];
    const total = v.aTot[v.footYearIdx];
    const opts = shuffleOpts(rng, [
      { text: fmt(adults), value: adults },
      { text: fmt(v.jA), value: v.jA },
      { text: fmt(total), value: total },
      { text: fmt(v.aTot[v.footYearIdx === 0 ? 3 : 0]), value: v.aTot[v.footYearIdx === 0 ? 3 : 0] },
    ]);
    return {
      message: tr(t, `Muestra qué parte de la población total de ${t.siteA} en ${v.yf} eran adultos y qué parte juveniles (${t.juveniles}).`, `Show what share of the total ${v.yf} population at ${t.siteA} was adults versus juveniles (${t.juveniles}).`),
      correctType: 'pie',
      elements: [
        { label: tr(t, 'Adultos', 'Adults'), correctIndex: opts.findIndex((o) => o.value === adults) },
        { label: 'Juveniles', correctIndex: opts.findIndex((o) => o.value === v.jA) },
      ],
      valueOptions: opts,
      unit: t.unitWord,
      explanation: `Partes de un todo → gráfico de tarta. Adultos = dato del censo de ${v.yf} (que excluye juveniles); juveniles = dato de las notas de campo. El total no es una porción.`,
    };
  }
  const opts = shuffleOpts(rng, [
    { text: fmt(v.aTot[0]), value: v.aTot[0] },
    { text: fmt(v.aTot[3]), value: v.aTot[3] },
    { text: fmt(v.aTable[v.footYearIdx]), value: v.aTable[v.footYearIdx] },
    { text: fmt(v.bTot[3]), value: v.bTot[3] },
  ]);
  return {
    message: tr(t, `Muestra cómo evolucionó la población total de ${t.siteA} de ${v.y1} a ${v.y4}.`, `Show how the total population at ${t.siteA} evolved from ${v.y1} to ${v.y4}.`),
    correctType: 'line',
    elements: [
      { label: String(v.y1), correctIndex: opts.findIndex((o) => o.value === v.aTot[0]) },
      { label: String(v.y4), correctIndex: opts.findIndex((o) => o.value === v.aTot[3]) },
    ],
    valueOptions: opts,
    unit: t.unitWord,
    explanation: `Evolución en el tiempo → gráfico de líneas. Valores: población total (censo + juveniles en ${v.yf}) de ${t.siteA} en ${v.y1} y ${v.y4}.`,
  };
}

function shuffleOpts(rng: Rng, opts: { text: string; value: number }[]): { text: string; value: number }[] {
  // Las primeras opciones son las correctas: se descartan duplicados (por texto) posteriores
  // y se rellena con valores cercanos para que no haya dos opciones iguales.
  const out: { text: string; value: number }[] = [];
  for (const o of opts) if (!out.some((x) => x.text === o.text || x.value === o.value)) out.push(o);
  const base = opts[0].value;
  const isPct = opts[0].text.endsWith('%');
  const pctDec = 2;
  let k = 1;
  while (out.length < 4) {
    const v = isPct ? round(base + 7 * k, pctDec) : Math.round(base * (1 + 0.13 * k));
    const text = isPct ? `${fmt(v, pctDec)}%` : fmt(v);
    if (!out.some((x) => x.text === text)) out.push({ text, value: v });
    k++;
  }
  return rng.shuffle(out);
}

/** Elimina opciones duplicadas (tras redondeo) y rellena hasta 4 con valores cercanos. */
function dedupeOptions(
  rng: Rng,
  raw: { v: number; ok: boolean }[],
  decimals: number,
  filler: (k: number) => number,
): { v: number; ok: boolean }[] {
  const out: { v: number; ok: boolean }[] = [];
  const key = (x: number) => x.toFixed(decimals);
  const correct = raw.find((r) => r.ok)!;
  out.push(correct);
  for (const r of raw) {
    if (r.ok) continue;
    if (!Number.isFinite(r.v) || Math.abs(r.v) < 10 ** -decimals) continue;
    if (out.some((o) => key(o.v) === key(r.v))) continue;
    out.push(r);
  }
  let k = 3;
  while (out.length < 4) {
    const cand = filler(k);
    if (!out.some((o) => key(o.v) === key(cand))) out.push({ v: cand, ok: false });
    k = k > 0 ? -k : -k + 2;
  }
  return rng.shuffle(out.slice(0, 4));
}

/** 'el programa X' -> 'del programa X' */
function del(s: string): string {
  return s.replace(/^el /, 'del ');
}

/** Texto en el idioma del tema. No consume el PRNG. */
function tr(t: Theme, es: string, en: string): string {
  return t.lang === 'en' ? en : es;
}

function roundTo(x: number, step: number): number {
  return Math.round(x / step) * step;
}
