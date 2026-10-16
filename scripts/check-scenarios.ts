// Genera N escenarios de cada módulo (por dificultad e idioma) y comprueba que ninguno falla el validador.
// Uso: npm run check -- [N]
import { generateRedrock } from '../src/redrock';
import { validateStudy } from '../src/redrock/validate';
import { generateSeaWolf, validateZone } from '../src/seawolf';

const N = Number(process.argv[2] ?? 50);
let failures = 0;
let rr = 0;
let sw = 0;
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
    }
console.log(`Redrock: ${rr} escenarios · Sea Wolf: ${sw} escenarios (${sw * 3} zonas) · ${N} por módulo, dificultad e idioma · fallos del validador: ${failures}`);
process.exit(failures ? 1 : 0);
