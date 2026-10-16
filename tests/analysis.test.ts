import { describe, expect, it } from 'vitest';
import { generateRedrock, emptyRedrockAnswers, type RedrockAnswers } from '../src/redrock';
import {
  correctProfile,
  emptyZoneAnswer,
  expectedDecision,
  generateSeaWolf,
  microbeIndex,
  playByRule,
  poolHasValidTrio,
  POOL_START_MAX,
  type SeaWolfScenario,
  type ZoneAnswer,
} from '../src/seawolf';
import { apportion, overall, redrockRubric, seaWolfRubric, splitEven, errorCounts } from '../src/analysis/rubric';
import { detectPatterns, makeTips, poolLoss } from '../src/analysis/process';
import type { RecEvent, SessionLog } from '../src/lib/recorder';
import { createRng } from '../src/lib/rng';

const T = (x: number) => Math.round(x * 10);

/** Respuestas perfectas de Redrock. */
function perfectRedrock(seed: string): { s: ReturnType<typeof generateRedrock>; a: RedrockAnswers } {
  const s = generateRedrock(seed, 'normal');
  const a = emptyRedrockAnswers(s);
  a.journal = Object.values(s.study.data).filter((d) => d.relevant).map((d) => d.id);
  s.study.questions.forEach((q) => (a.analysis[q.id] = String(q.answer)));
  s.study.blanks.forEach((b) => (a.blanks[b.id] = b.kind === 'select' ? String(b.correctIndex) : String(b.answer)));
  a.chartType = s.study.chartTask.correctType;
  a.chartValues = s.study.chartTask.elements.map((e) => e.correctIndex);
  s.cases.forEach((c) => (a.cases[c.id] = c.format === 'mcq' ? String(c.correctIndex) : String(c.answer)));
  return { s, a };
}

/** Juega Sea Wolf siguiendo la regla de clasificación y eligiendo un trío válido del pool. */
function perfectSeaWolf(sc: SeaWolfScenario): ZoneAnswer[] {
  return sc.zones.map((z, zi) => {
    const ans = emptyZoneAnswer();
    ans.profile = correctProfile(z);
    const next = sc.zones[zi + 1] ?? null;
    for (const m of z.classification) {
      const exp = expectedDecision(z, next, m, ans.pool.length >= POOL_START_MAX).expected;
      ans.decisions[m.id] = exp;
      if (exp === 'site') ans.pool.push(m.id);
    }
    const byRule = playByRule(z);
    z.rounds.forEach((r, ri) => {
      const pick = r.find((m) => byRule.some((x) => x.id === m.id))!;
      ans.roundPicks[ri] = pick.id;
      ans.pool.push(pick.id);
    });
    const all = ans.pool.map((id) => microbeIndex(sc).get(id)!);
    for (let i = 0; i < all.length && !ans.selected.length; i++)
      for (let j = i + 1; j < all.length && !ans.selected.length; j++)
        for (let k = j + 1; k < all.length && !ans.selected.length; k++)
          if (poolHasValidTrio(z, [all[i], all[j], all[k]])) ans.selected = [all[i].id, all[j].id, all[k].id];
    return ans;
  });
}

describe('Rúbrica de Redrock', () => {
  it('respuestas perfectas = 100 y sin respuestas = 0', () => {
    for (let i = 0; i < 40; i++) {
      const { s, a } = perfectRedrock(`rr-${i}`);
      const r = redrockRubric(s, a);
      expect(r.max).toBe(100);
      expect(r.earned).toBe(100);
      expect(redrockRubric(s, emptyRedrockAnswers(s)).earned).toBe(0);
    }
  });

  it('cada distractor guardado resta 1 punto del diario (sin bajar de 0)', () => {
    const { s, a } = perfectRedrock('rr-dist');
    const distractors = Object.values(s.study.data).filter((d) => !d.relevant).map((d) => d.id);
    a.journal = [...a.journal, distractors[0], distractors[1]];
    const r = redrockRubric(s, a);
    expect(r.parts.find((p) => p.key === 'journal')!.earned).toBe(8);
    expect(r.earned).toBe(98);
    const onlyDistractors = emptyRedrockAnswers(s);
    onlyDistractors.journal = distractors.slice(0, 5);
    expect(redrockRubric(s, onlyDistractors).parts.find((p) => p.key === 'journal')!.earned).toBe(0);
  });

  it('detecta la trampa en la que se cae', () => {
    const { s, a } = perfectRedrock('rr-trap');
    const q = s.study.questions[0];
    a.analysis[q.id] = String(Math.round(q.wrongApproaches[0].value * 100) / 100);
    const item = redrockRubric(s, a).parts.find((p) => p.key === 'analysis')!.items[0];
    expect(item.earned).toBe(0);
    expect(item.errorType).toBe(`rr-trap:${q.wrongApproaches[0].label}`);
  });
});

describe('Rúbrica de Sea Wolf', () => {
  it('seguir la regla y elegir un trío válido da 300/300', () => {
    for (let i = 0; i < 30; i++) {
      for (const diff of ['normal', 'hard'] as const) {
        const sc = generateSeaWolf(`sw-${i}`, diff);
        const r = seaWolfRubric(sc, perfectSeaWolf(sc));
        expect(r.max).toBe(300);
        expect(r.earned, `sw-${i} ${diff}: ${r.parts.filter((p) => p.earned < p.max).map((p) => p.label).join(', ')}`).toBe(300);
      }
    }
  });

  it('cada parte puntúa lo que dice su regla (10/20/20/50 por sitio)', () => {
    const sc = generateSeaWolf('parts', 'normal');
    const r = seaWolfRubric(sc, sc.zones.map(() => emptyZoneAnswer()));
    for (let zi = 0; zi < 3; zi++) {
      expect(r.parts.find((p) => p.key === `sw${zi}-profile`)!.max).toBe(10);
      expect(r.parts.find((p) => p.key === `sw${zi}-classification`)!.max).toBe(20);
      expect(r.parts.find((p) => p.key === `sw${zi}-pool`)!.max).toBe(20);
      expect(r.parts.find((p) => p.key === `sw${zi}-treatment`)!.max).toBe(50);
    }
    expect(r.earned).toBe(0);
  });

  it('una clasificación errónea explica valores frente al rango y qué tocaba', () => {
    const sc = generateSeaWolf('class', 'normal');
    const answers = perfectSeaWolf(sc);
    const z = sc.zones[0];
    const m = z.classification.find((x) => answers[0].decisions[x.id] === 'reject')!;
    answers[0].decisions[m.id] = 'site';
    const item = seaWolfRubric(sc, answers).parts.find((p) => p.key === 'sw0-classification')!.items.find((i) => i.id.endsWith(m.id))!;
    expect(item.earned).toBe(0);
    expect(item.why).toContain('rango');
    expect(item.why).toMatch(/tocaba «(Rechazar|Siguiente sitio)»/);
  });
});

describe('Puntos perdidos', () => {
  it('la suma de los puntos perdidos da exactamente la nota (puntos y %)', () => {
    const rng = createRng('random-answers');
    for (let i = 0; i < 60; i++) {
      const rr = generateRedrock(`o-${i}`, i % 2 ? 'hard' : 'normal');
      const a = emptyRedrockAnswers(rr);
      const ids = Object.keys(rr.study.data);
      a.journal = rng.sample(ids, rng.int(0, 8));
      rr.study.questions.forEach((q) => rng.chance(0.5) && (a.analysis[q.id] = String(q.answer)));
      rr.study.blanks.forEach((b) => rng.chance(0.5) && (a.blanks[b.id] = String(b.kind === 'select' ? rng.int(0, 2) : b.answer)));
      rr.cases.forEach((c) => (a.cases[c.id] = String(rng.int(0, 3))));
      const sw = generateSeaWolf(`o-${i}`, 'normal');
      const swAns = perfectSeaWolf(sw).map((z) => ({ ...z, selected: rng.chance(0.5) ? z.selected : z.pool.slice(0, 3), profile: rng.chance(0.5) ? z.profile : [] }));
      const games = [redrockRubric(rr, a), seaWolfRubric(sw, swAns)];
      const o = overall(games);
      const lostT = o.pointsOff.reduce((s, p) => s + T(p.lost), 0);
      expect(lostT).toBe(T(o.max) - T(o.earned));
      const pctT = o.pointsOff.reduce((s, p) => s + T(p.pct), 0);
      expect(pctT).toBe(1000 - T(o.scorePct));
      for (const g of games) for (const p of g.parts) expect(p.items.reduce((s, it) => s + T(it.earned), 0)).toBe(T(p.earned));
      expect(Object.values(errorCounts(games)).every((n) => n > 0)).toBe(true);
    }
  });

  it('apportion y splitEven suman exactamente el total', () => {
    expect(splitEven(100, 7).reduce((a, b) => a + b)).toBe(100);
    expect(apportion(337, [5, 3, 3, 1.5, 0.5]).reduce((a, b) => a + b)).toBe(337);
    expect(apportion(0, [1, 2])).toEqual([0, 0]);
  });
});

describe('Detector de patrones', () => {
  const log = (events: RecEvent[]): SessionLog => ({
    meta: { id: 'x', mode: 'redrock', seed: 's', difficulty: 'normal', lang: 'es', exam: false, startedAt: '' },
    events,
  });

  it('detecta decisiones rápidas en las que se falla', () => {
    const events: RecEvent[] = [
      { t: 1000, k: 'decision', kind: 'case', item: 'C1', value: '0', ms: 900 },
      { t: 2000, k: 'decision', kind: 'case', item: 'C2', value: '0', ms: 1100 },
      { t: 3000, k: 'decision', kind: 'case', item: 'C3', value: '0', ms: 6000 },
      { t: 4000, k: 'decision', kind: 'case', item: 'C4', value: '0', ms: 7000 },
    ];
    const correctness = new Map([
      ['case|C1', false],
      ['case|C2', false],
      ['case|C3', true],
      ['case|C4', true],
    ]);
    const p = detectPatterns({ log: log(events), correctness, labels: new Map() });
    expect(p.map((x) => x.id)).toContain('fast-wrong');
    // si las erróneas son lentas, no se marca
    const slow = new Map([...correctness].map(([k, v]) => [k, !v]));
    expect(detectPatterns({ log: log(events), correctness: slow, labels: new Map() }).map((x) => x.id)).not.toContain('fast-wrong');
  });

  it('detecta cambios de opinión frecuentes por tipo', () => {
    const events: RecEvent[] = Array.from({ length: 4 }, (_, i) => ({ t: i * 100, k: 'change' as const, kind: 'sw-treatment', item: `m${i}`, from: 'on', to: 'off' }));
    const p = detectPatterns({ log: log(events), correctness: new Map(), labels: new Map() });
    expect(p.find((x) => x.id === 'mind-sw-treatment')).toBeTruthy();
  });

  it('detecta datos mirados y no usados y datos usados sin mirar', () => {
    const { s, a } = perfectRedrock('pat');
    const relevant = Object.values(s.study.data).filter((d) => d.relevant);
    const missed = relevant[0].id;
    a.journal = a.journal.filter((id) => id !== missed);
    const events: RecEvent[] = [{ t: 10, k: 'hover', target: `datum:${missed}`, ms: 2500 }];
    const p = detectPatterns({ log: log(events), redrock: { scenario: s, answers: a }, correctness: new Map(), labels: new Map() });
    expect(p.find((x) => x.id === 'look-unused')?.severity).toBe('alta');
    expect(p.find((x) => x.id === 'use-unlooked')).toBeTruthy();
  });

  it('localiza en qué paso se perdió la solución de Sea Wolf y qué microbio la salvaba', () => {
    const sc = generateSeaWolf('loss', 'hard');
    const index = microbeIndex(sc);
    const good = perfectSeaWolf(sc);
    expect(poolLoss(sc.zones[0], good[0], index)).toBeNull();
    const bad = emptyZoneAnswer();
    sc.zones[0].classification.forEach((m) => (bad.decisions[m.id] = 'reject'));
    sc.zones[0].rounds.forEach((r, ri) => (bad.roundPicks[ri] = r[0].id));
    const loss = poolLoss(sc.zones[0], bad, index);
    if (loss) {
      expect(loss.step).toMatch(/clasificación|ronda/);
      expect(loss.explanation.length).toBeGreaterThan(10);
    } else {
      // rechazar todo puede seguir dejando solución a través de las rondas
      bad.pool = sc.zones[0].rounds.map((r) => r[0].id);
      expect(poolHasValidTrio(sc.zones[0], bad.pool.map((id) => index.get(id)!))).toBe(true);
    }
  });

  it('los consejos se basan en los errores reales', () => {
    const { s, a } = perfectRedrock('tips');
    const q = s.study.questions[0];
    a.analysis[q.id] = String(Math.round(q.wrongApproaches[0].value * 100) / 100);
    const tips = makeTips([redrockRubric(s, a)], []);
    expect(tips.length).toBeGreaterThanOrEqual(1);
    expect(tips[0]).toContain(q.wrongApproaches[0].label);
  });
});
