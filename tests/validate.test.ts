import { describe, expect, it } from 'vitest';
import { generateRedrock } from '../src/redrock';
import { validateStudy } from '../src/redrock/validate';
import type { Material, Study } from '../src/redrock/types';

const SEEDS = Array.from({ length: 300 }, (_, i) => `v-${i}`);
const clone = (s: Study): Study => JSON.parse(JSON.stringify(s));
const codes = (s: Study) => validateStudy(s).map((i) => i.code);

/** Primer escenario Difícil (con tabla de liberaciones) a partir de una semilla. */
function hardStudyWithReleases(): Study {
  for (const seed of SEEDS) {
    const st = generateRedrock(seed, 'hard').study;
    if (st.materials.some((m) => m.id === 'cohorts')) return st;
  }
  throw new Error('sin tabla de liberaciones');
}

describe('Validador de coherencia de Redrock', () => {
  for (const diff of ['normal', 'hard'] as const) {
    it(`todos los escenarios generados (${diff}) son coherentes`, () => {
      for (const seed of SEEDS) {
        const issues = validateStudy(generateRedrock(seed, diff).study);
        expect(issues, `${seed}: ${issues.map((i) => i.message).join(' | ')}`).toEqual([]);
      }
    });
  }

  it('las liberaciones nunca se sitúan en el sitio de referencia', () => {
    for (const seed of SEEDS) {
      const st = generateRedrock(seed, 'hard').study;
      const cohorts = st.materials.find((m) => m.id === 'cohorts');
      if (!cohorts || cohorts.kind !== 'table') continue;
      for (const row of cohorts.rows) expect(row.cells.map((c) => c.text ?? '').join(' ')).not.toContain(st.facts.siteB);
    }
  });

  it('detecta una liberación en el sitio de referencia (el caso de «Bajo Brisa»)', () => {
    const st = clone(hardStudyWithReleases());
    const cohorts = st.materials.find((m) => m.id === 'cohorts') as Extract<Material, { kind: 'table' }>;
    cohorts.rows[2].cells[0] = { text: st.facts.siteB };
    cohorts.claims = cohorts.claims!.map((c) => (c.kind === 'activity' && c.row === 2 ? { ...c, site: st.facts.siteB } : c));
    expect(codes(st)).toContain('ACTIVITY_AT_REFERENCE');
  });

  it('detecta la contradicción aunque la afirmación estructurada no se haya actualizado', () => {
    const st = clone(hardStudyWithReleases());
    const cohorts = st.materials.find((m) => m.id === 'cohorts') as Extract<Material, { kind: 'table' }>;
    cohorts.rows[2].cells[0] = { text: st.facts.siteB }; // solo cambia el texto
    const c = codes(st);
    expect(c).toContain('ACTIVITY_AT_REFERENCE');
    expect(c).toContain('CLAIM_NOT_IN_TEXT');
  });

  it('detecta una nota al pie que no coincide con las celdas marcadas', () => {
    const st = clone(generateRedrock('v-1', 'normal').study);
    const census = st.materials.find((m) => m.id === 'census') as Extract<Material, { kind: 'table' }>;
    const markedCol = census.rows[0].cells.findIndex((c) => c.mark);
    const other = markedCol === 0 ? 3 : 0;
    census.rows[0].cells[markedCol].mark = undefined;
    census.rows[0].cells[other].mark = '*';
    expect(codes(st)).toContain('MARK');
  });

  it('detecta "ya incluidos" en el mismo año que la nota excluye', () => {
    const st = clone(generateRedrock('v-2', 'normal').study);
    const note = st.materials.find((m) => m.id === 'fieldnote')!;
    note.claims = note.claims!.map((c) => (c.kind === 'already-included' ? { ...c, year: st.facts.footnoteYear } : c));
    expect(codes(st)).toContain('INCLUDED_YEAR');
  });

  it('detecta un sitio con dos papeles distintos', () => {
    const st = clone(generateRedrock('v-3', 'normal').study);
    const intro = st.materials.find((m) => m.id === 'intro')!;
    intro.claims!.push({ kind: 'site-role', site: st.facts.siteB, role: 'intervention' });
    expect(codes(st)).toContain('ROLE_CONFLICT');
  });

  it('detecta una respuesta que no se reproduce desde los datos', () => {
    const st = clone(generateRedrock('v-4', 'normal').study);
    const a1 = Object.values(st.data).find((d) => d.meta?.series === 'census' && d.meta.site === st.facts.siteA && d.meta.year === st.facts.period[0])!;
    a1.value += 500;
    expect(codes(st)).toContain('ANSWER');
  });

  it('detecta un objetivo con un periodo distinto al del censo', () => {
    const st = clone(generateRedrock('v-5', 'normal').study);
    st.objective = st.objective.replace(String(st.facts.period[1]), String(st.facts.period[1] + 1));
    expect(codes(st)).toContain('PERIOD');
  });

  it('los escenarios en inglés también son coherentes y tienen los mismos números que en español', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      for (const diff of ['normal', 'hard'] as const) {
        const es = generateRedrock(seed, diff, 'es');
        const en = generateRedrock(seed, diff, 'en');
        expect(validateStudy(en.study)).toEqual([]);
        expect(Object.values(en.study.data).map((d) => d.value)).toEqual(Object.values(es.study.data).map((d) => d.value));
        expect(en.study.questions.map((q) => q.answer)).toEqual(es.study.questions.map((q) => q.answer));
        expect(en.cases.map((c) => c.answer)).toEqual(es.cases.map((c) => c.answer));
        expect(en.study.objective).not.toBe(es.study.objective);
      }
    }
  });

  it('el informe tiene entre 8 y 10 huecos y el gráfico pide barras, líneas o tarta', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const st = generateRedrock(seed, 'normal').study;
      expect(st.blanks.length).toBeGreaterThanOrEqual(8);
      expect(st.blanks.length).toBeLessThanOrEqual(10);
      expect(['bar', 'line', 'pie']).toContain(st.chartTask.correctType);
      st.questions.forEach((q) => expect(q.decimals).toBe(2));
    }
  });
});
