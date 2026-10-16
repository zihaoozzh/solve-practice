import { describe, expect, it } from 'vitest';
import { bruteForce, checkSelection, generateSeaWolf, gradeZone, zoneMicrobes } from '../src/seawolf';

const SEEDS = Array.from({ length: 500 }, (_, i) => `seed-${i}`);

describe('Sea Wolf generator', () => {
  for (const diff of ['normal', 'hard'] as const) {
    it(`500 semillas (${diff}): cada zona tiene al menos una solución válida`, () => {
      for (const seed of SEEDS) {
        const sc = generateSeaWolf(seed, diff);
        expect(sc.zones).toHaveLength(3);
        for (const z of sc.zones) {
          const all = zoneMicrobes(z);
          expect(z.waves).toHaveLength(3);
          z.waves.forEach((w) => {
            expect(w.length).toBeGreaterThanOrEqual(6);
            expect(w.length).toBeLessThanOrEqual(8);
          });
          expect(new Set(all.map((m) => m.id)).size).toBe(all.length);
          expect(z.required).not.toBe(z.prohibited);
          all.forEach((m) => m.attrs.forEach((a) => expect(a >= 1 && a <= 10).toBe(true)));

          // fuerza bruta independiente
          const bf = bruteForce(z, all);
          expect(bf.solutions.length, `${seed} zona ${z.index}`).toBeGreaterThanOrEqual(1);
          expect(bf.solutions.length).toBe(z.solutions.length);
          const byId = new Map(all.map((m) => [m.id, m]));
          for (const sol of z.solutions) {
            const chk = checkSelection(z, sol.map((id) => byId.get(id)!));
            expect(chk.valid).toBe(true);
            expect(chk.violations).toHaveLength(0);
          }
          if (diff === 'hard') {
            expect(z.solutions.length).toBeLessThanOrEqual(3);
            expect(z.nearMisses).toBeGreaterThanOrEqual(10);
          }
          // la solución de ejemplo puntúa 100
          const g = gradeZone(z, { saved: z.solutions[0], selected: z.solutions[0], timeSec: 1, completed: true });
          expect(g.score).toBe(100);
        }
      }
    });
  }

  it('detecta reglas incumplidas', () => {
    const z = generateSeaWolf('rules', 'normal').zones[0];
    const all = zoneMicrobes(z);
    const prohibited = all.find((m) => m.traits.includes(z.prohibited))!;
    const sol = z.solutions[0].map((id) => all.find((m) => m.id === id)!);
    const chk = checkSelection(z, [prohibited, sol[1], sol[2]]);
    expect(chk.valid).toBe(false);
    expect(chk.violations.some((v) => v.rule === 'Rasgo prohibido')).toBe(true);
    expect(checkSelection(z, sol.slice(0, 2)).valid).toBe(false);
  });

  it('es determinista con la misma semilla', () => {
    expect(JSON.stringify(generateSeaWolf('XYZ', 'hard'))).toBe(JSON.stringify(generateSeaWolf('XYZ', 'hard')));
  });
});
