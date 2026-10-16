import { Rng, round } from '../lib/rng';
import { fmt, fmtAuto } from '../lib/format';
import type { Theme } from './themes';
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
    add({ id: `A${i + 1}`, value: aTable[i], display: fmt(aTable[i]), unit: u, label: `Censo ${t.siteA} ${y}${i === footYearIdx ? ' (sin juveniles)' : ''}` });
    add({ id: `B${i + 1}`, value: bTableK[i], display: fmt(bTableK[i], 1), unit: `miles de ${u}`, label: `Censo ${t.siteB} ${y}${i === footYearIdx ? ' (sin juveniles)' : ''}` });
  });
  add({ id: 'JA', value: jA, display: fmt(jA), unit: u, label: `Juveniles ${t.siteA} ${yf}` });
  add({ id: 'JB', value: jB, display: fmt(jB), unit: u, label: `Juveniles ${t.siteB} ${yf}` });

  // Juveniles de otro año (trampa de periodo)
  const otherIdx = footYearIdx === 3 ? 1 : 2;
  const jTrap = roundTo(aTotals[otherIdx] * rng.float(0.08, 0.25, 2), 1);
  add({
    id: 'JX',
    value: jTrap,
    display: fmt(jTrap),
    unit: u,
    label: `Juveniles ${t.siteA} ${years[otherIdx]}`,
    note: `Juveniles de ${years[otherIdx]}: el censo de ese año ya los incluye, así que no hay que sumarlos.`,
  });

  if (areaInKm2) {
    add({ id: 'AREA', value: areaKm2, display: fmt(areaKm2, 1), unit: 'km²', label: `Área censada en ${t.siteA}` });
    add({ id: 'RES', value: reserveHa, display: fmt(reserveHa), unit: 'ha', label: `Superficie total de la reserva (${t.region})`, note: 'Área total de la reserva, no del área censada en el sitio A: trampa plausible pero irrelevante.' });
  } else {
    add({ id: 'AREA', value: areaHa, display: fmt(areaHa), unit: 'ha', label: `Área censada en ${t.siteA}` });
    add({ id: 'RES', value: reserveKm2, display: fmt(reserveKm2, 1), unit: 'km²', label: `Superficie total de la reserva (${t.region})`, note: 'Área total de la reserva, no del área censada en el sitio A: trampa plausible pero irrelevante.' });
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
  add({ id: 'OBS', value: observers, display: fmt(observers), unit: 'observadores', label: `Observadores del censo ${yf}`, note: 'Número de observadores: no afecta al cálculo.' });

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
      label: `${t.monitoringName} ${t.siteA} ${monYears[i]}`,
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
    ? [0, 1, 2].map((i) => ({ released: roundTo(rng.int(120, 900), 10), surv: rng.int(18, 74), site: i === 2 ? t.siteB : t.siteA }))
    : [];
  cohorts.forEach((c, i) => {
    add({ id: `CR${i}`, value: c.released, display: fmt(c.released), unit: u, label: `${t.cohortName} ${String.fromCharCode(65 + i)}: liberados`, note: 'Datos de cohortes liberadas: plausibles pero no forman parte del censo que pide el objetivo.' });
    add({ id: `CS${i}`, value: c.surv, display: `${c.surv}`, unit: '%', label: `${t.cohortName} ${String.fromCharCode(65 + i)}: supervivencia`, note: 'Datos de cohortes liberadas: plausibles pero no forman parte del censo que pide el objetivo.' });
  });

  // ---------- Preguntas ----------
  const pct = (a: number, b: number) => ((b - a) / a) * 100;
  const qDec = 1;
  const tol1 = 0.1;

  const aFootData = footYearIdx === 0 ? ['A1', 'JA', 'A4'] : ['A1', 'A4', 'JA'];
  const q1Ans = pct(aTot[0], aTot[3]);
  const q1: NumericQuestion = {
    id: 'Q1',
    prompt: `Según el ${t.censusName.toLowerCase()}, ¿cuál fue el cambio porcentual de la población TOTAL de ${t.species} (adultos y juveniles) en ${t.siteA} entre ${y1} y ${y4}?`,
    unit: '%',
    decimals: qDec,
    tolerance: tol1,
    answer: round(q1Ans, qDec),
    requiredData: aFootData,
    steps: [
      `Total ${y1} = ${footYearIdx === 0 ? `${fmt(aTable[0])} + ${fmt(jA)} juveniles = ${fmt(aTot[0])}` : fmt(aTot[0])}.`,
      `Total ${y4} = ${footYearIdx === 3 ? `${fmt(aTable[3])} + ${fmt(jA)} juveniles = ${fmt(aTot[3])}` : fmt(aTot[3])}.`,
      `Cambio % = (final − inicial) / inicial × 100 = (${fmt(aTot[3])} − ${fmt(aTot[0])}) / ${fmt(aTot[0])} × 100 = ${fmtAuto(q1Ans, 3)} ≈ ${fmt(round(q1Ans, 1), 1)} %.`,
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
    prompt: `Según el ${t.censusName.toLowerCase()}, ¿cuál fue el cambio porcentual de la población TOTAL de ${t.species} (adultos y juveniles) en ${t.siteB} entre ${y1} y ${y4}?`,
    unit: '%',
    decimals: qDec,
    tolerance: tol1,
    answer: round(q3Ans, qDec),
    requiredData: ['B1', 'B4', 'JB'],
    steps: [
      `La tabla de ${t.siteB} está en MILES: ${fmt(bTableK[0], 1)} mil = ${fmt(bTableK[0] * 1000)} y ${fmt(bTableK[3], 1)} mil = ${fmt(bTableK[3] * 1000)}.`,
      `El censo de ${yf} excluye juveniles: se suman ${fmt(jB)} (en unidades) al dato de ${yf} ya convertido.`,
      `Total ${y1} = ${fmt(bTot1)}; total ${y4} = ${fmt(bTot4)}.`,
      `Cambio % = (${fmt(bTot4)} − ${fmt(bTot1)}) / ${fmt(bTot1)} × 100 = ${fmtAuto(q3Ans, 3)} ≈ ${fmt(round(q3Ans, 1), 1)} %.`,
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
    const dec = perHa ? 1 : 0;
    const ans = perHa ? aTot4 / (areaKm2 * 100) : aTot4 / (areaHa / 100);
    const tol = perHa ? 0.1 : 1;
    const target = perHa ? 'por hectárea' : 'por kilómetro cuadrado (km²)';
    q2 = {
      id: 'Q2',
      prompt: `¿Cuál fue la densidad de ${t.species} (población total, incluidos juveniles) en el área censada de ${t.siteA} en ${y4}, en ${u} ${target}?`,
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
      prompt: `En ${y4}, ¿cuántas veces mayor fue la población TOTAL de ${t.species} en ${t.siteB} que en ${t.siteA}? (Exprésalo como ratio: ${t.siteB} ÷ ${t.siteA}.)`,
      unit: '×',
      decimals: 2,
      tolerance: 0.01,
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
      d.id === 'AREA'
        ? 'El área censada solo hacía falta si se pedía la densidad; en este escenario ninguna pregunta la usa.'
        : 'Ninguna pregunta de este escenario necesita esta cifra.';
  }

  // ---------- Materiales ----------
  const S = (id: string) => ({ datum: id });
  const intro: Material = {
    kind: 'paragraph',
    id: 'intro',
    title: 'Antecedentes del proyecto',
    segments: [
      `${t.programCap} comenzó en ${y1} en ${t.siteA}, uno de los dos puntos de seguimiento de la reserva de ${t.region}. La reserva ocupa una superficie total de `,
      S('RES'),
      ` ${data.RES.unit}, mientras que el área censada cada año en ${t.siteA} es de `,
      S('AREA'),
      ` ${data.AREA.unit}. ${t.siteB} no recibió ninguna intervención y sirve como sitio de referencia. En la primera fase, ${f1.text} `,
      S('F1'),
      ` ${f1.unit}, y ${f2.text} `,
      S('F2'),
      ` ${f2.unit}.`,
    ],
  };

  const census: Material = {
    kind: 'table',
    id: 'census',
    title: `${t.censusName} — ${t.species}`,
    columns: ['Sitio', ...years.map(String)],
    rows: [
      { label: `${t.siteA} (${u})`, cells: years.map((_, i) => ({ datum: `A${i + 1}`, mark: i === footYearIdx ? '*' : undefined })) },
      { label: `${t.siteB} (miles de ${u})`, cells: years.map((_, i) => ({ datum: `B${i + 1}`, mark: i === footYearIdx ? '*' : undefined })) },
    ],
    footnotes: [`* Los conteos de ${yf} no incluyen juveniles (${t.juveniles}); se registraron aparte en las notas de campo.`],
  };

  const fieldNote: Material = {
    kind: 'paragraph',
    id: 'fieldnote',
    title: `Notas de campo, temporada ${yf}`,
    segments: [
      `Por un cambio en el protocolo de muestreo, en ${yf} los juveniles (${t.juveniles}) se contaron en hojas aparte: `,
      S('JA'),
      ` en ${t.siteA} y `,
      S('JB'),
      ` en ${t.siteB} (conteos en individuos). El equipo del censo lo formaron `,
      S('OBS'),
      ` observadores. Como referencia, en ${years[otherIdx]} el equipo contó `,
      S('JX'),
      ` juveniles en ${t.siteA}; ese año ya están incluidos en el total del censo. ${env0.label} durante el censo: ${fmt(envA, env0.decimals)} ${env0.unit} en ${t.siteA} y ${fmt(envB, env0.decimals)} ${env0.unit} en ${t.siteB}.`,
    ],
  };

  const monChart: Material = {
    kind: 'chart',
    id: 'monchart',
    chart: {
      type: 'line',
      title: `${t.siteA}: ${t.monitoringName.toLowerCase()}, ${monYears[0]}–${monYears[3]}`,
      labels: monYears.map(String),
      series: [{ name: t.siteA, values: monVals, datumIds: monVals.map((_, i) => `M${i}`) }],
      yLabel: u,
    },
    footnotes: [`Conteos de una sola visita y solo de adultos; no son directamente comparables con el ${t.censusName.toLowerCase()}.`],
  };

  const envChart: Material = {
    kind: 'chart',
    id: 'envchart',
    chart: {
      type: 'bar',
      title: `${env1.label} en ${t.siteA}, ${y1}–${y4}`,
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
      title: `Liberaciones por ${t.cohortName.toLowerCase()}, ${y1}–${y1 + 1}`,
      columns: [t.cohortName, 'Liberado en', `Número liberado (${u})`, 'Supervivencia al año (%)'],
      rows: cohorts.map((c, i) => ({
        label: String.fromCharCode(65 + i),
        cells: [{ text: c.site }, { datum: `CR${i}` }, { datum: `CS${i}` }],
      })),
      footnotes: ['Los individuos liberados llevan marca; en el censo se cuentan como cualquier otro individuo.'],
    });
  }
  materials.push(...rng.shuffle(rest));

  // ---------- Report ----------
  const ppDiff = q1Ans - q3Ans;
  const relDiff = (ppDiff / Math.abs(q3Ans)) * 100;
  const ppOptionsRaw = [
    { v: round(ppDiff, 1), ok: true },
    { v: round(relDiff, 1), ok: false },
    { v: round(q1Ans + q3Ans, 1), ok: false },
    { v: round(pct(aTable[0], aTable[3]) - pct(bTableK[0], bTableK[3]), 1), ok: false },
  ];
  const ppOptions = dedupeOptions(rng, ppOptionsRaw, 1, (k) => round(ppDiff + k, 1));
  const ppBlank: ReportBlank = {
    id: 'b2',
    kind: 'select',
    options: ppOptions.map((o) => fmt(o.v, 1)),
    correctIndex: ppOptions.findIndex((o) => o.ok),
    explanation: `Diferencia en puntos porcentuales = ${fmt(round(q1Ans, 1), 1)} − (${fmt(round(q3Ans, 1), 1)}) = ${fmt(round(ppDiff, 1), 1)} p.p. No es un cambio relativo (${fmt(round(relDiff, 1), 1)} % sería la variación porcentual entre las dos tasas).`,
  };

  const b1: ReportBlank = {
    id: 'b1',
    kind: 'number',
    answer: round(q1Ans, 1),
    tolerance: 0.15,
    decimals: 1,
    explanation: `Es el resultado de la pregunta 1 de Análisis: ${fmt(round(q1Ans, 1), 1)} %.`,
  };

  const supports = q1Ans > q3Ans;
  const conclOptions = ['respaldan', 'no respaldan', 'no permiten evaluar'];
  const b4: ReportBlank = {
    id: 'b4',
    kind: 'select',
    options: conclOptions,
    correctIndex: supports ? 0 : 1,
    explanation: supports
      ? `El crecimiento en ${t.siteA} (${fmt(round(q1Ans, 1), 1)} %) supera al del sitio de referencia (${fmt(round(q3Ans, 1), 1)} %), así que la evidencia apoya el efecto del programa.`
      : `El crecimiento en ${t.siteA} (${fmt(round(q1Ans, 1), 1)} %) no supera al del sitio de referencia (${fmt(round(q3Ans, 1), 1)} %): la evidencia no apoya el efecto del programa.`,
  };

  let b3: ReportBlank;
  let b3Sentence: MemoPart[];
  if (useDensity) {
    const dens = q2.answer;
    const above = rng.chance(0.5);
    const factor = above ? rng.float(0.6, 0.85, 2) : rng.float(1.15, 1.45, 2);
    const dec = q2.decimals;
    const bench = round(dens * factor, dec === 0 ? 0 : 1);
    b3 = {
      id: 'b3',
      kind: 'select',
      options: ['superior a', 'inferior a', 'igual a'],
      correctIndex: dens > bench ? 0 : 1,
      explanation: `Densidad calculada en Análisis: ${fmt(dens, dec)} ${q2.unit}, ${dens > bench ? 'por encima' : 'por debajo'} del umbral de ${fmt(bench, dec === 0 ? 0 : 1)}.`,
    };
    b3Sentence = [
      `La densidad de población en ${t.siteA} en ${y4} fue `,
      { blank: 'b3' },
      ` la referencia del programa, de ${fmt(bench, dec === 0 ? 0 : 1)} ${q2.unit}.`,
    ];
  } else {
    const ratioOpts = dedupeOptions(
      rng,
      [
        { v: q2.answer, ok: true },
        ...q2.wrongApproaches.map((w) => ({ v: round(w.value, 2), ok: false })),
      ],
      2,
      (k) => round(q2.answer + k * 0.37, 2),
    );
    b3 = {
      id: 'b3',
      kind: 'select',
      options: ratioOpts.map((o) => fmt(o.v, 2)),
      correctIndex: ratioOpts.findIndex((o) => o.ok),
      explanation: `Ratio calculado en Análisis: ${fmt(q2.answer, 2)} (${t.siteB} ÷ ${t.siteA}, con ${t.siteB} convertido de miles a unidades).`,
    };
    b3Sentence = [`En ${y4}, la población total de ${t.siteB} fue `, { blank: 'b3' }, ` veces la de ${t.siteA}.`];
  }

  const memo: MemoPart[][] = [
    [
      `Entre ${y1} y ${y4}, la población total de ${t.species} en ${t.siteA} cambió un `,
      { blank: 'b1' },
      ` %, frente a un ${fmt(round(q3Ans, 1), 1)} % en el sitio de referencia, ${t.siteB}. Es una diferencia de `,
      { blank: 'b2' },
      ' puntos porcentuales.',
    ],
    b3Sentence,
    [`En conjunto, los datos del censo `, { blank: 'b4' }, ` la conclusión de que ${t.program} aumentó el crecimiento de la población en ${t.siteA}.`],
  ];

  const chartTask = makeChartTask(rng, t, { y1, y4, yf, q1Ans, q3Ans, aTable, aTot, jA, footYearIdx, bTableK, bTot });

  return {
    theme: t.nameEs,
    objective: `Determinar si ${t.program} aumentó la tasa de crecimiento de la población de ${t.species} en ${t.siteA}, en comparación con el sitio de referencia ${t.siteB}, entre ${y1} y ${y4}.`,
    context: `Reserva de ${t.region}: evaluación ${del(t.program)}`,
    materials,
    data,
    questions,
    memoTitle: `Memorando: evaluación ${del(t.program)}`,
    memo,
    blanks: [b1, ppBlank, b3, b4],
    chartTask,
  };
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
      { text: `${fmt(round(v.q1Ans, 1), 1)}%`, value: round(v.q1Ans, 1) },
      { text: `${fmt(round(v.q3Ans, 1), 1)}%`, value: round(v.q3Ans, 1) },
      { text: `${fmt(round(pct(v.aTable[0], v.aTable[3]), 1), 1)}%`, value: round(pct(v.aTable[0], v.aTable[3]), 1) },
      { text: `${fmt(round(pct(v.bTableK[0], v.bTableK[3]), 1), 1)}%`, value: round(pct(v.bTableK[0], v.bTableK[3]), 1) },
    ]);
    return {
      message: `Compara el cambio porcentual de la población total entre ${t.siteA} y ${t.siteB} en ${v.y1}–${v.y4}.`,
      correctType: 'bar',
      elements: [
        { label: t.siteA, correctIndex: opts.findIndex((o) => o.value === round(v.q1Ans, 1)) },
        { label: t.siteB, correctIndex: opts.findIndex((o) => o.value === round(v.q3Ans, 1)) },
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
      message: `Muestra qué parte de la población total de ${t.siteA} en ${v.yf} eran adultos y qué parte juveniles (${t.juveniles}).`,
      correctType: 'pie',
      elements: [
        { label: 'Adultos', correctIndex: opts.findIndex((o) => o.value === adults) },
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
    message: `Muestra cómo evolucionó la población total de ${t.siteA} de ${v.y1} a ${v.y4}.`,
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
  let k = 1;
  while (out.length < 4) {
    const v = isPct ? round(base + 7 * k, 1) : Math.round(base * (1 + 0.13 * k));
    const text = isPct ? `${fmt(v, 1)}%` : fmt(v);
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

function roundTo(x: number, step: number): number {
  return Math.round(x / step) * step;
}
