// Genera N escenarios de cada módulo y comprueba que ninguno falla el validador.
// Uso: npm run check -- [N]
import { generateRedrock } from '../src/redrock';
import { validateStudy } from '../src/redrock/validate';
import { generateSeaWolf, validateZone } from '../src/seawolf';

const N = Number(process.argv[2] ?? 50);
let failures = 0;
for (const diff of ['normal', 'hard'] as const) {
  for (let i = 0; i < N; i++) {
    const seed = `check-${diff}-${i}`;
    const rr = validateStudy(generateRedrock(seed, diff).study);
    if (rr.length) {
      failures++;
      console.log(`Redrock ${seed}:`, rr.map((x) => x.message).join(' | '));
    }
    generateSeaWolf(seed, diff).zones.forEach((z) => {
      const sw = validateZone(z);
      if (sw.length) {
        failures++;
        console.log(`Sea Wolf ${seed} zona ${z.index + 1}:`, sw.map((x) => x.message).join(' | '));
      }
    });
  }
}
console.log(`Redrock: ${N * 2} escenarios · Sea Wolf: ${N * 2} escenarios (${N * 6} zonas) · fallos del validador: ${failures}`);
process.exit(failures ? 1 : 0);
