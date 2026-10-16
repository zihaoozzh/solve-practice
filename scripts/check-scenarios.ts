// Genera N escenarios de cada módulo (por dificultad e idioma) y comprueba que ninguno falla el validador.
// Uso: npm run check -- [N]
import { generateRedrock } from '../src/redrock';
import { validateStudy } from '../src/redrock/validate';
import { generateSeaWolf, validateZone } from '../src/seawolf';
import { generateIsland, validateIsland } from '../src/sfl/island';
import { generateClassic, validateClassic } from '../src/sfl/classic';

const N = Number(process.argv[2] ?? 50);
/** Máximo de pantallas en las que la mejor opción puede ser la más larga (por encima, la longitud la delata). */
const MAX_LONGEST = 0.45;
const longest: Record<string, number[]> = { island: [0, 0] };
const tally = (key: string, options: { text: string; quality: string }[]) => {
  const best = options.find((o) => o.quality === 'best')!;
  longest[key][1]++;
  if (options.every((o) => o === best || o.text.length < best.text.length)) longest[key][0]++;
};
let failures = 0;
let rr = 0;
let sw = 0;
let isl = 0;
let cl = 0;
for (const lang of ['es', 'en'] as const)
  for (const diff of ['normal', 'hard'] as const)
    for (let i = 0; i < N; i++) {
      const seed = `check-${diff}-${i}`;
      const issues = validateStudy(generateRedrock(seed, diff, lang).study);
      rr++;
      if (issues.length) {
        failures++;
        console.log(`Redrock ${lang} ${seed}:`, issues.map((x) => x.message).join(' | '));
      }
      generateSeaWolf(seed, diff, lang).zones.forEach((z) => {
        const zi = validateZone(z);
        if (zi.length) {
          failures++;
          console.log(`Sea Wolf ${lang} ${seed} zona ${z.index + 1}:`, zi.map((x) => x.message).join(' | '));
        }
      });
      sw++;
      try {
        const sc = generateIsland(seed, diff, lang);
        const ii = validateIsland(sc);
        // El mismo escenario en el otro idioma debe tener las mismas decisiones correctas
        const other = generateIsland(seed, diff, lang === 'es' ? 'en' : 'es');
        const sig = (x: typeof sc) =>
          JSON.stringify(x.days.map((d) => [d.optimum, d.keyFacts.map((f) => f.fact), d.support.map((r) => [r.type, r.from, r.evidence?.who, r.options.map((o) => o.quality)])]));
        const same = sig(sc) === sig(other);
        sc.days.forEach((d) => d.support.forEach((r) => tally('island', r.options)));
        if (!same) ii.push({ code: 'LANG', message: 'El escenario cambia según el idioma.' });
        if (ii.length) {
          failures++;
          console.log(`SFL Island ${lang} ${seed}:`, ii.map((x) => x.message).join(' | '));
        }
      } catch (e) {
        failures++;
        console.log(`SFL Island ${lang} ${seed}: ${String(e)}`);
      }
      isl++;
      try {
        const c = generateClassic(seed, diff, lang);
        const ci = validateClassic(c);
        const other = generateClassic(seed, diff, lang === 'es' ? 'en' : 'es');
        if (other.correctRanking.join() !== c.correctRanking.join() || other.results.join() !== c.results.join()) ci.push({ code: 'LANG', message: 'El escenario cambia según el idioma.' });
        if (ci.length) {
          failures++;
          console.log(`SFL Classic ${lang} ${seed}:`, ci.map((x) => x.message).join(' | '));
        }
      } catch (e) {
        failures++;
        console.log(`SFL Classic ${lang} ${seed}: ${String(e)}`);
      }
      cl++;
    }
for (const [k, [n, t]] of Object.entries(longest)) {
  const label = k === 'island' ? 'SFL Island (peticiones de Apoyar)' : 'SFL Classic (decisiones)';
  console.log(`${label}: la mejor opción es la más larga en ${n}/${t} (${Math.round((100 * n) / t)} %, máximo ${MAX_LONGEST * 100} %)`);
  if (n / t > MAX_LONGEST) {
    failures++;
    console.log(`  ✗ La longitud delata la mejor respuesta en ${label}.`);
  }
}
console.log(`Redrock: ${rr} escenarios · Sea Wolf: ${sw} escenarios (${sw * 3} zonas) · SFL Island: ${isl} escenarios (${isl * 3} días) · SFL Classic: ${cl} escenarios · ${N} por módulo, dificultad e idioma · fallos del validador: ${failures}`);
process.exit(failures ? 1 : 0);
