import { describe, expect, it } from 'vitest';
import { generateRedrock, gradeAnalysis, gradeBlank, gradeCase, JOURNAL_MAX } from '../src/redrock';
import { round } from '../src/lib/rng';
import type { Material, NumericQuestion, Study } from '../src/redrock/types';

const SEEDS = Array.from({ length: 500 }, (_, i) => `seed-${i}`);
const DIFFS = ['normal', 'hard'] as const;

function datumIdsInMaterials(materials: Material[]): Set<string> {
  const ids = new Set<string>();
  for (const m of materials) {
    if (m.kind === 'paragraph') m.segments.forEach((s) => typeof s !== 'string' && ids.add(s.datum));
    if (m.kind === 'table') m.rows.forEach((r) => r.cells.forEach((c) => c.datum && ids.add(c.datum)));
    if (m.kind === 'chart') m.chart.series.forEach((s) => s.datumIds?.forEach((d) => ids.add(d)));
  }
  return ids;
}

/** Recalcula la respuesta SOLO con los datos guardables del escenario (los del journal). */
function recompute(study: Study, q: NumericQuestion): number {
  const v = (id: string) => study.data[id].value;
  const has = (id: string) => q.requiredData.includes(id);
  if (q.id === 'Q1') {
    const a1 = v('A1') + (has('JA') && study.data.A1.label.includes('sin juveniles') ? v('JA') : 0);
    const a4 = v('A4') + (has('JA') && study.data.A4.label.includes('sin juveniles') ? v('JA') : 0);
    return ((a4 - a1) / a1) * 100;
  }
  if (q.id === 'Q3') {
    const b1 = v('B1') * 1000 + (study.data.B1.label.includes('sin juveniles') ? v('JB') : 0);
    const b4 = v('B4') * 1000 + (study.data.B4.label.includes('sin juveniles') ? v('JB') : 0);
    return ((b4 - b1) / b1) * 100;
  }
  // Q2
  const a4 = v('A4') + (study.data.A4.label.includes('sin juveniles') ? v('JA') : 0);
  if (q.unit.includes('/ha')) return a4 / (v('AREA') * 100);
  if (q.unit.includes('/km²')) return a4 / (v('AREA') / 100);
  const b4 = v('B4') * 1000 + (study.data.B4.label.includes('sin juveniles') ? v('JB') : 0);
  return b4 / a4;
}

describe('Redrock generator', () => {
  for (const diff of DIFFS) {
    it(`500 semillas (${diff}): preguntas con respuesta única y calculable`, () => {
      for (const seed of SEEDS) {
        const s = generateRedrock(seed, diff);
        const st = s.study;
        const inMaterials = datumIdsInMaterials(st.materials);

        // estructura
        expect(st.materials.length).toBeGreaterThanOrEqual(4);
        expect(st.materials.length).toBeLessThanOrEqual(6);
        const charts = st.materials.filter((m) => m.kind === 'chart').length;
        expect(charts).toBeGreaterThanOrEqual(1);
        expect(charts).toBeLessThanOrEqual(2);
        expect(st.questions).toHaveLength(3);
        expect(s.cases).toHaveLength(6);
        expect(new Set(s.cases.map((c) => c.type)).size).toBe(6);

        // los datos necesarios caben en el journal y están en el material
        const required = new Set(st.questions.flatMap((q) => q.requiredData));
        expect(required.size).toBeLessThanOrEqual(JOURNAL_MAX);
        for (const id of required) {
          expect(inMaterials.has(id), `${seed}: ${id} no está en el material`).toBe(true);
          expect(st.data[id].relevant).toBe(true);
        }
        // datos marcados como relevantes = exactamente los requeridos
        const relevant = Object.values(st.data).filter((d) => d.relevant).map((d) => d.id);
        expect(new Set(relevant)).toEqual(required);
        // trampas presentes
        expect(Object.values(st.data).some((d) => !d.relevant && d.note)).toBe(true);

        for (const q of st.questions) {
          expect(Number.isFinite(q.answer)).toBe(true);
          // la respuesta coincide con la que se calcula desde los datos del journal
          expect(round(recompute(st, q), q.decimals)).toBeCloseTo(q.answer, 6);
          // ningún error típico cae dentro de la tolerancia -> respuesta única
          for (const w of q.wrongApproaches) {
            expect(Math.abs(round(w.value, q.decimals) - q.answer)).toBeGreaterThan(q.tolerance);
          }
          expect(gradeAnalysis(q, String(q.answer))).toBe(true);
          expect(gradeAnalysis(q, String(q.answer + q.tolerance * 3))).toBe(false);
        }

        // report: exactamente una opción correcta, opciones distintas
        for (const b of st.blanks) {
          if (b.kind === 'select') {
            expect(new Set(b.options).size).toBe(b.options!.length);
            expect(b.correctIndex).toBeGreaterThanOrEqual(0);
            expect(gradeBlank(b, String(b.correctIndex))).toBe(true);
          } else {
            expect(gradeBlank(b, String(b.answer))).toBe(true);
          }
        }
        const ct = st.chartTask;
        expect(new Set(ct.valueOptions.map((o) => o.text)).size).toBe(ct.valueOptions.length);
        ct.elements.forEach((e) => expect(e.correctIndex).toBeGreaterThanOrEqual(0));
        expect(new Set(ct.elements.map((e) => e.correctIndex)).size).toBe(ct.elements.length);

        // cases
        for (const c of s.cases) {
          expect(Number.isFinite(c.answer)).toBe(true);
          if (c.format === 'mcq') {
            expect(c.options).toHaveLength(4);
            expect(new Set(c.options).size).toBe(4);
            const matches = c.optionValues!.filter((v) => Math.abs(v - c.answer) <= c.tolerance + 1e-9);
            expect(matches, `${seed} ${c.type}`).toHaveLength(1);
            expect(gradeCase(c, String(c.correctIndex))).toBe(true);
          } else {
            expect(gradeCase(c, String(c.answer))).toBe(true);
          }
        }
      }
    });
  }

  it('es determinista con la misma semilla', () => {
    expect(JSON.stringify(generateRedrock('ABC123', 'hard'))).toBe(JSON.stringify(generateRedrock('ABC123', 'hard')));
    expect(JSON.stringify(generateRedrock('ABC123', 'hard'))).not.toBe(JSON.stringify(generateRedrock('ABC124', 'hard')));
  });
});
