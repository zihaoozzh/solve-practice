import { describe, expect, it } from 'vitest';
import {
  bruteForce,
  checkSelection,
  CLASSIFY_N,
  emptyZoneAnswer,
  generateSeaWolf,
  gradeZone,
  POOL_START_MAX,
  ROUND_SIZE,
  ROUNDS,
  validateZone,
  zoneInsights,
  zoneMicrobes,
  type Zone,
  type ZoneAnswer,
} from '../src/seawolf';

const SEEDS = Array.from({ length: 500 }, (_, i) => `seed-${i}`);
const isExtreme = (v: number) => v <= 2 || v >= 9;

/** Juega un sitio con las mismas reglas que la pantalla, apuntando a una solución concreta. */
function playTowards(zone: Zone, target: string[]): ZoneAnswer {
  const ans = emptyZoneAnswer();
  for (const m of zone.classification) {
    const keep = target.includes(m.id) && ans.pool.length < POOL_START_MAX;
    ans.decisions[m.id] = keep ? 'site' : 'reject';
    if (keep) ans.pool.push(m.id);
  }
  zone.rounds.forEach((r, ri) => {
    const pick = r.find((m) => target.includes(m.id)) ?? r[0];
    ans.roundPicks[ri] = pick.id;
    ans.pool.push(pick.id);
  });
  ans.selected = target.filter((id) => ans.pool.includes(id));
  ans.completed = true;
  return ans;
}

describe('Sea Wolf', () => {
  for (const diff of ['normal', 'hard'] as const) {
    it(`500 semillas (${diff}): cada sitio tiene al menos un trío válido alcanzable y coherente`, () => {
      for (const seed of SEEDS) {
        const sc = generateSeaWolf(seed, diff);
        expect(sc.zones).toHaveLength(3);
        const attrs = sc.zones[0].attributes.join('|');
        const pool = sc.zones[0].traitPool.join('|');
        for (const z of sc.zones) {
          expect(z.attributes.join('|')).toBe(attrs); // mismos atributos en toda la partida
          expect(z.traitPool.join('|')).toBe(pool); // mismos 4 rasgos posibles
          expect(z.classification).toHaveLength(CLASSIFY_N);
          expect(z.rounds).toHaveLength(ROUNDS);
          z.rounds.forEach((r) => expect(r).toHaveLength(ROUND_SIZE));
          const all = zoneMicrobes(z);
          all.forEach((m) => {
            expect(m.traits).toHaveLength(1);
            expect(z.traitPool).toContain(m.traits[0]);
            m.attrs.forEach((a) => expect(a >= 1 && a <= 10).toBe(true));
          });
          expect(validateZone(z), `${seed} sitio ${z.index}`).toEqual([]);
          const bf = bruteForce(z, all);
          expect(bf.solutions.length).toBeGreaterThanOrEqual(1);
          expect(bf.solutions.length).toBe(z.solutions.length);
          if (diff === 'hard') {
            expect(z.solutions.length).toBeLessThanOrEqual(3);
            expect(z.nearMisses).toBeGreaterThanOrEqual(8);
          }
          if (z.extremeCarriers) all.filter((m) => m.traits.includes(z.required)).forEach((m) => expect(m.attrs.some(isExtreme)).toBe(true));
          // jugando con las reglas de la pantalla, la solución se alcanza y puntúa 100
          const ans = playTowards(z, z.solutions[0]);
          expect(ans.pool.length).toBeLessThanOrEqual(POOL_START_MAX + ROUNDS);
          expect(gradeZone(z, ans).score, `${seed} sitio ${z.index}`).toBe(100);
        }
      }
    });
  }

  it('en Difícil hay sitios donde el rasgo deseado solo aparece con valores extremos', () => {
    const extreme = SEEDS.slice(0, 50).flatMap((s) => generateSeaWolf(s, 'hard').zones.filter((z) => z.extremeCarriers));
    expect(extreme.length).toBeGreaterThan(40);
  });

  it('la corrección indica el cuello de botella y qué candidato faltó', () => {
    const z = generateSeaWolf('insights', 'hard').zones[0];
    const ins = zoneInsights(z, emptyZoneAnswer());
    expect(ins.validTrios).toBe(z.solutions.length);
    expect(ins.bottleneck.rule.length).toBeGreaterThan(0);
    expect(ins.poolHadSolution).toBe(false);
    expect(ins.missed.length).toBe(3);
    ins.missed.forEach((m) => expect(m.where).toMatch(/Clasificación|Ronda/));
    // con la solución en el pool ya no falta nada
    const full = playTowards(z, z.solutions[0]);
    expect(zoneInsights(z, full).poolHadSolution).toBe(true);
  });

  it('detecta reglas incumplidas', () => {
    const z = generateSeaWolf('rules', 'normal').zones[0];
    const all = zoneMicrobes(z);
    const bad = all.find((m) => m.traits.includes(z.prohibited))!;
    const sol = z.solutions[0].map((id) => all.find((m) => m.id === id)!);
    const chk = checkSelection(z, [bad, sol[1], sol[2]]);
    expect(chk.valid).toBe(false);
    expect(chk.violations.some((v) => v.rule === 'Rasgo no deseado')).toBe(true);
    expect(checkSelection(z, sol.slice(0, 2)).valid).toBe(false);
  });

  it('el validador detecta un sitio sin solución', () => {
    const z: Zone = JSON.parse(JSON.stringify(generateSeaWolf('broken', 'normal').zones[0]));
    const neutral = z.traitPool.find((t) => t !== z.required && t !== z.prohibited)!;
    zoneMicrobes(z).forEach((m) => m.traits[0] === z.required && (m.traits = [neutral]));
    const codes = validateZone(z).map((i) => i.code);
    expect(codes).toContain('REQUIRED');
    expect(codes).toContain('NO_SOLUTION');
  });

  it('es determinista y tiene los mismos números en español e inglés', () => {
    expect(JSON.stringify(generateSeaWolf('XYZ', 'hard'))).toBe(JSON.stringify(generateSeaWolf('XYZ', 'hard')));
    const es = generateSeaWolf('XYZ', 'hard', 'es');
    const en = generateSeaWolf('XYZ', 'hard', 'en');
    expect(en.zones.map((z) => z.solutions)).toEqual(es.zones.map((z) => z.solutions));
    expect(en.zones[0].attributes).not.toEqual(es.zones[0].attributes);
  });
});
