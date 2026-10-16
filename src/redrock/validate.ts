import { round } from '../lib/rng';
import type { Claim, Material, NumericQuestion, Study } from './types';

export interface Issue {
  code: string;
  message: string;
}

/** Texto visible de un material (tal como lo ve el candidato). */
export function materialText(m: Material, study: Study): string {
  const d = (id: string) => study.data[id]?.display ?? '';
  if (m.kind === 'paragraph') return [m.title, ...m.segments.map((s) => (typeof s === 'string' ? s : d(s.datum)))].join(' ');
  if (m.kind === 'table')
    return [
      m.title,
      ...m.columns,
      ...m.rows.flatMap((r) => [r.label, ...r.cells.map((c) => (c.datum ? d(c.datum) : (c.text ?? '')))]),
      ...m.footnotes,
    ].join(' ');
  return [m.chart.title, ...m.chart.labels, ...m.footnotes].join(' ');
}

function rowText(m: Material, row: number, study: Study): string {
  if (m.kind !== 'table') return '';
  const r = m.rows[row];
  if (!r) return '';
  return [r.label, ...r.cells.map((c) => (c.datum ? study.data[c.datum]?.display : c.text) ?? '')].join(' ');
}

function datumRefs(m: Material): { id: string; mark?: string; column?: string }[] {
  if (m.kind === 'paragraph') return m.segments.filter((s): s is { datum: string } => typeof s !== 'string').map((s) => ({ id: s.datum }));
  if (m.kind === 'table') {
    const refs: { id: string; mark?: string; column?: string }[] = [];
    m.rows.forEach((r) => r.cells.forEach((c, ci) => c.datum && refs.push({ id: c.datum, mark: c.mark, column: m.columns[ci + 1] })));
    return refs;
  }
  return m.chart.series.flatMap((s) => (s.datumIds ?? []).map((id) => ({ id })));
}

/** Recalcula la respuesta de una pregunta solo a partir de los datos y los hechos del escenario. */
export function recomputeAnswer(study: Study, q: NumericQuestion): number {
  const f = study.facts;
  const census = (site: string, year: number) =>
    Object.values(study.data).find((d) => d.meta?.series === 'census' && d.meta.site === site && d.meta.year === year);
  const juveniles = (site: string, year: number) =>
    Object.values(study.data).find((d) => d.meta?.series === 'juveniles' && d.meta.site === site && d.meta.year === year);
  const total = (site: string, year: number, thousands: boolean) => {
    const c = census(site, year);
    if (!c) return NaN;
    const base = thousands ? c.value * 1000 : c.value;
    return base + (c.meta?.excludesJuveniles ? (juveniles(site, year)?.value ?? NaN) : 0);
  };
  const [y1, y4] = f.period;
  const area = study.data.AREA;
  switch (q.kind) {
    case 'pct-total-A':
      return ((total(f.siteA, y4, false) - total(f.siteA, y1, false)) / total(f.siteA, y1, false)) * 100;
    case 'pct-total-B':
      return ((total(f.siteB, y4, true) - total(f.siteB, y1, true)) / total(f.siteB, y1, true)) * 100;
    case 'density-ha':
      return total(f.siteA, y4, false) / (area.unit === 'km²' ? area.value * 100 : area.value);
    case 'density-km2':
      return total(f.siteA, y4, false) / (area.unit === 'ha' ? area.value / 100 : area.value);
    case 'ratio-B-A':
      return total(f.siteB, y4, true) / total(f.siteA, y4, false);
  }
}

/**
 * Comprueba que texto, tablas, notas y preguntas no se contradicen.
 * Devuelve la lista de problemas (vacía si el escenario es coherente).
 */
export function validateStudy(study: Study): Issue[] {
  const issues: Issue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  const f = study.facts;
  const claims: { claim: Claim; material: Material }[] = study.materials.flatMap((m) => (m.claims ?? []).map((claim) => ({ claim, material: m })));

  // 1. Datos: cada cifra existe y aparece exactamente una vez en el material.
  const seen = new Map<string, number>();
  for (const m of study.materials)
    for (const ref of datumRefs(m)) {
      if (!study.data[ref.id]) add('DATA_MISSING', `El material «${m.id}» muestra una cifra inexistente (${ref.id}).`);
      seen.set(ref.id, (seen.get(ref.id) ?? 0) + 1);
    }
  for (const id of Object.keys(study.data)) {
    const n = seen.get(id) ?? 0;
    if (n === 0) add('DATA_ORPHAN', `La cifra ${id} no aparece en ningún material.`);
    if (n > 1) add('DATA_DUPLICATE', `La cifra ${id} aparece ${n} veces.`);
  }

  // 2. Papel de cada sitio (intervención / referencia / externo).
  const roles = new Map<string, string>();
  for (const { claim, material } of claims) {
    if (claim.kind !== 'site-role') continue;
    const prev = roles.get(claim.site);
    if (prev && prev !== claim.role) add('ROLE_CONFLICT', `«${claim.site}» figura a la vez como ${prev} y como ${claim.role}.`);
    roles.set(claim.site, claim.role);
    if (!materialText(material, study).includes(claim.site))
      add('CLAIM_NOT_IN_TEXT', `El material «${material.id}» afirma el papel de «${claim.site}» pero el texto no lo menciona.`);
  }
  if (roles.get(f.siteA) !== 'intervention') add('ROLE_MISSING', `El texto no establece que «${f.siteA}» es el sitio de intervención.`);
  if (roles.get(f.siteB) !== 'reference') add('ROLE_MISSING', `El texto no establece que «${f.siteB}» es el sitio de referencia.`);

  // 3. Actividades (liberaciones, trasplantes...): nunca en un sitio de referencia.
  for (const { claim, material } of claims) {
    if (claim.kind !== 'activity') continue;
    const role = roles.get(claim.site);
    if (role === 'reference')
      add(
        'ACTIVITY_AT_REFERENCE',
        `El texto dice que «${claim.site}» no recibió ninguna intervención, pero «${material.id}» muestra una actividad del programa allí.`,
      );
    else if (!role) add('ACTIVITY_UNKNOWN_SITE', `«${material.id}» muestra actividad en «${claim.site}», un sitio que el texto no presenta.`);
    const rt = rowText(material, claim.row, study);
    if (!rt.includes(claim.site)) add('CLAIM_NOT_IN_TEXT', `La fila ${claim.row + 1} de «${material.id}» no menciona «${claim.site}».`);
    for (const [site, r] of roles) if (r === 'reference' && site !== claim.site && rt.includes(site))
      add('ACTIVITY_AT_REFERENCE', `La fila ${claim.row + 1} de «${material.id}» sitúa una actividad en «${site}», que es el sitio de referencia.`);
  }

  // 4. Nota al pie de juveniles: un solo año, el de los datos marcados, y el de la nota de campo.
  const excl = claims.filter((c) => c.claim.kind === 'excludes-juveniles');
  if (excl.length !== 1) add('FOOTNOTE', `Debe haber exactamente una nota sobre juveniles excluidos (hay ${excl.length}).`);
  for (const { claim, material } of excl) {
    if (claim.kind !== 'excludes-juveniles') continue;
    if (claim.year !== f.footnoteYear) add('FOOTNOTE_YEAR', `La nota dice ${claim.year} pero los hechos dicen ${f.footnoteYear}.`);
    if (!materialText(material, study).includes(String(claim.year))) add('CLAIM_NOT_IN_TEXT', `La nota al pie no menciona el año ${claim.year}.`);
    for (const ref of datumRefs(material)) {
      const d = study.data[ref.id];
      if (!d?.meta) continue;
      const marked = !!ref.mark;
      if (marked !== !!d.meta.excludesJuveniles) add('MARK', `La marca de la celda ${ref.id} (${ref.column}) no coincide con la nota al pie.`);
      if (d.meta.year != null && ref.column !== String(d.meta.year)) add('COLUMN_YEAR', `La cifra ${ref.id} es de ${d.meta.year} pero está en la columna ${ref.column}.`);
      if (d.meta.excludesJuveniles && d.meta.year !== claim.year) add('MARK_YEAR', `La cifra ${ref.id} excluye juveniles en ${d.meta.year}, pero la nota habla de ${claim.year}.`);
    }
  }
  const juv = claims.filter((c) => c.claim.kind === 'juvenile-count');
  for (const site of [f.siteA, f.siteB]) {
    const forSite = juv.filter((c) => c.claim.kind === 'juvenile-count' && c.claim.site === site);
    if (forSite.length !== 1) add('JUVENILES', `Debe haber un conteo de juveniles para «${site}» (hay ${forSite.length}).`);
  }
  for (const { claim, material } of juv) {
    if (claim.kind !== 'juvenile-count') continue;
    if (claim.year !== f.footnoteYear) add('JUVENILES_YEAR', `Los juveniles de «${claim.site}» son de ${claim.year}, pero la nota excluye los de ${f.footnoteYear}.`);
    const d = study.data[claim.datum];
    if (!d || d.meta?.year !== claim.year || d.meta?.site !== claim.site) add('JUVENILES_DATUM', `El dato ${claim.datum} no corresponde a los juveniles de «${claim.site}» en ${claim.year}.`);
    if (!materialText(material, study).includes(claim.site)) add('CLAIM_NOT_IN_TEXT', `La nota de campo no menciona «${claim.site}».`);
  }
  for (const { claim } of claims) {
    if (claim.kind !== 'already-included') continue;
    if (claim.year === f.footnoteYear)
      add('INCLUDED_YEAR', `La nota dice que en ${claim.year} los juveniles ya están incluidos, pero la tabla dice que ese año se excluyen.`);
    if (!f.censusYears.includes(claim.year)) add('INCLUDED_YEAR', `El año ${claim.year} no pertenece al censo.`);
  }

  // 5. Periodos: el objetivo y el censo cubren el mismo periodo.
  const census = claims.find((c) => c.claim.kind === 'period' && c.claim.series === 'census')?.claim;
  if (!census || census.kind !== 'period' || census.from !== f.period[0] || census.to !== f.period[1])
    add('PERIOD', 'El periodo del censo no coincide con el del objetivo.');
  if (!study.objective.includes(String(f.period[0])) || !study.objective.includes(String(f.period[1])))
    add('PERIOD', 'El objetivo no menciona el periodo del estudio.');
  if (!study.objective.includes(f.siteA) || !study.objective.includes(f.siteB)) add('OBJECTIVE', 'El objetivo no nombra los dos sitios.');

  // 6. Preguntas: los datos necesarios existen y la respuesta se reproduce desde los datos.
  for (const q of study.questions) {
    for (const id of q.requiredData) if (!study.data[id]) add('QUESTION_DATA', `${q.id} usa un dato inexistente (${id}).`);
    const r = recomputeAnswer(study, q);
    if (!Number.isFinite(r) || Math.abs(round(r, q.decimals) - q.answer) > 1e-9)
      add('ANSWER', `${q.id}: la respuesta (${q.answer}) no se reproduce desde los datos (${r}).`);
  }

  // 7. Informe: el memorando nombra al sitio de referencia correcto.
  const memoText = study.memo.flat().filter((p): p is string => typeof p === 'string').join(' ');
  if (!memoText.includes(f.siteB) || !memoText.includes(f.siteA)) add('MEMO', 'El memorando no nombra los dos sitios del estudio.');

  return issues;
}
