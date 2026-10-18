import { describe, expect, it } from 'vitest';
import { generateRedrock, emptyRedrockAnswers } from '../src/redrock';
import { generateSeaWolf, emptyZoneAnswer } from '../src/seawolf';
import { generateIsland, emptyIslandDay, reflectTruth, dayKeyQuestions } from '../src/sfl/island';
import { generateClassic, emptyClassic, variantFor } from '../src/sfl/classic';
import { evaluate, Collected } from '../src/lib/evaluate';
import type { AttemptRecord } from '../src/lib/reports';

/** Un intento de 95 min con respuestas variadas (unas bien, otras mal o sin responder). */
function attempt95(seed: string): Collected {
  const rr = generateRedrock(seed, 'normal', 'es');
  const rrAns = emptyRedrockAnswers(rr);
  rrAns.journal = Object.keys(rr.study.data).slice(0, 3);
  rrAns.cases[rr.cases[0].id] = '1';
  const sw = generateSeaWolf(seed, 'normal', 'es');
  const swAns = sw.zones.map(() => ({ ...emptyZoneAnswer(), timeSec: 300 }));
  swAns[0].profile = sw.zones[0].attributes.slice(0, 2);
  swAns[0].selected = sw.zones[0].solutions[0] ?? [];
  const isl = generateIsland(seed, 'normal', 'es');
  const islAns = isl.days.map((day, d) => {
    const a = emptyIslandDay(isl, d);
    a.asked = dayKeyQuestions(day).slice(0, d === 1 ? 1 : 3);
    a.askedAt = a.asked.map(() => 20);
    if (d === 0) a.assign = { ...day.optimum };
    for (const r of day.support) {
      a.support[r.id] = 0;
      a.supportOrder.push(r.id);
    }
    a.timeSec = 400;
    return a;
  });
  isl.researchers.forEach((r) => (islAns[0].reflect[r.id] = reflectTruth(isl, islAns, 0, r.id)));
  return {
    redrock: { scenario: rr, answers: rrAns, times: { study: 900, investigation: 300, analysis: 400, report: 200, cases: 600 }, timedOut: false },
    seawolf: { scenario: sw, answers: swAns, aidsUsed: false, timedOut: true },
    island: { scenario: isl, answers: islAns, onboarding: { order: isl.onboarding.best.slice(), timeSec: 150 }, timedOut: false },
  };
}

function attemptClassic(seed: string): Collected {
  const cl = generateClassic(seed, 'hard', 'en');
  const a = emptyClassic();
  a.ranking = [...cl.correctRanking].reverse();
  for (const d of cl.decisions) {
    a.shown[d.n] = variantFor(cl, a, d.n);
    a.choices[d.n] = d.n % 3;
  }
  a.timeSec = { briefing: 60, ranking: 90 };
  return { classic: { scenario: cl, answers: a, timedOut: false } };
}

describe('Informe desde el historial', () => {
  it('un intento guardado en JSON y vuelto a leer da exactamente el mismo informe', () => {
    for (const c of [attempt95('H1'), attempt95('H2'), attemptClassic('H3')]) {
      const rec: AttemptRecord = {
        version: 1,
        id: '1',
        date: '2026-10-18T10:00:00.000Z',
        config: { mode: c.classic ? 'sfl-classic' : 'full95', difficulty: 'normal', seed: 'H', aids: false, exam: true, lang: 'es' },
        ...c,
      };
      const reread: AttemptRecord = JSON.parse(JSON.stringify(rec));
      const original = evaluate(c, null);
      const again = evaluate(reread, null);
      expect(again.analysis.overall).toEqual(original.analysis.overall);
      expect(again.analysis.games).toEqual(original.analysis.games);
      expect(again.analysis.patterns).toEqual(original.analysis.patterns);
      expect(again.analysis.tips).toEqual(original.analysis.tips);
      expect(again.islGrade?.decisions).toEqual(original.islGrade?.decisions);
      expect(again.clGrade?.decisions).toEqual(original.clGrade?.decisions);
    }
  });

  it('usa los escenarios guardados, no los regenera desde la semilla', () => {
    // Aunque el generador cambie en una versión futura, el informe es el del escenario que se jugó
    const c = attempt95('H4');
    const before = evaluate(c, null);
    const rec = JSON.parse(JSON.stringify(c)) as Collected;
    rec.redrock!.scenario.seed = 'OTRA';
    rec.seawolf!.scenario.seed = 'OTRA';
    rec.island!.scenario.seed = 'OTRA';
    const after = evaluate(rec, null);
    expect(after.analysis.overall).toEqual(before.analysis.overall);
    expect(after.islGrade!.rubric.max).toBe(310);
    expect(after.analysis.games.map((g) => g.game)).toEqual(['redrock', 'seawolf', 'sfl-island']);
  });
});
