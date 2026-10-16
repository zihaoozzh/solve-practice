// Ensambla el análisis completo de un intento (rúbrica, puntos perdidos, tiempos, patrones y consejos).

import type { SessionLog } from '../lib/recorder';
import type { RedrockAnswers, RedrockTimes } from '../redrock';
import type { RedrockScenario } from '../redrock/types';
import type { SeaWolfScenario, ZoneAnswer } from '../seawolf';
import { TIMING } from '../config';
import { buildContext, AnalysisContext } from './context';
import { detectPatterns, makeTips, Pattern, timeAnalysis, TimeAnalysis } from './process';
import { errorCounts, GameRubric, overall, Overall, redrockRubric, seaWolfRubric } from './rubric';

export interface PartTime {
  game: string;
  label: string;
  sec: number;
  refSec: number;
}

export interface ExtraGame {
  rubric: GameRubric;
  times: PartTime[];
  labels: Map<string, string>;
  correctness: Map<string, boolean>;
  patterns: Pattern[];
  describe?: (e: import('../lib/recorder').RecEvent) => string | null;
}

export interface FullAnalysis {
  games: GameRubric[];
  overall: Overall;
  patterns: Pattern[];
  tips: string[];
  time: TimeAnalysis;
  parts: PartTime[];
  context: AnalysisContext;
  errors: Record<string, number>;
}

export function buildAnalysis(args: {
  redrock?: { scenario: RedrockScenario; answers: RedrockAnswers; times: RedrockTimes };
  seawolf?: { scenario: SeaWolfScenario; answers: ZoneAnswer[] };
  extra?: ExtraGame[];
  log: SessionLog | null;
}): FullAnalysis {
  const games: GameRubric[] = [];
  const parts: PartTime[] = [];
  if (args.redrock) {
    games.push(redrockRubric(args.redrock.scenario, args.redrock.answers));
    const t = args.redrock.times;
    const g = TIMING.redrockPhaseGuideSec;
    parts.push(
      { game: 'Redrock', label: 'Investigación', sec: t.investigation, refSec: g.investigation },
      { game: 'Redrock', label: 'Análisis', sec: t.analysis, refSec: g.analysis },
      { game: 'Redrock', label: 'Informe', sec: t.report, refSec: g.report },
      { game: 'Redrock', label: 'Mini-casos', sec: t.cases, refSec: g.cases },
    );
  }
  if (args.seawolf) {
    games.push(seaWolfRubric(args.seawolf.scenario, args.seawolf.answers));
    args.seawolf.answers.forEach((a, i) => parts.push({ game: 'Sea Wolf', label: `Sitio ${i + 1}`, sec: a.timeSec, refSec: TIMING.seawolfZoneGuideMin[i] * 60 }));
  }
  for (const x of args.extra ?? []) {
    games.push(x.rubric);
    parts.push(...x.times);
  }
  const labels = new Map<string, string>();
  const correctness = new Map<string, boolean>();
  for (const x of args.extra ?? []) {
    x.labels.forEach((v, k) => labels.set(k, v));
    x.correctness.forEach((v, k) => correctness.set(k, v));
  }
  const extraDescribe = (args.extra ?? []).map((x) => x.describe).filter(Boolean) as ((e: import('../lib/recorder').RecEvent) => string | null)[];
  const context = buildContext(games, args.redrock?.scenario, args.seawolf?.scenario, {
    labels,
    correctness,
    describe: (e) => {
      for (const d of extraDescribe) {
        const r = d(e);
        if (r) return r;
      }
      return null;
    },
  });
  const patterns = [
    ...detectPatterns({
      log: args.log,
      redrock: args.redrock && { scenario: args.redrock.scenario, answers: args.redrock.answers },
      seawolf: args.seawolf,
      correctness: context.correctness,
      labels: context.labels,
    }),
    ...(args.extra ?? []).flatMap((x) => x.patterns),
  ];
  const refs: Record<string, number> = {
    'redrock-investigation': TIMING.redrockPhaseGuideSec.investigation,
    'redrock-analysis': TIMING.redrockPhaseGuideSec.analysis,
    'redrock-report': TIMING.redrockPhaseGuideSec.report,
    'redrock-cases': TIMING.redrockPhaseGuideSec.cases,
  };
  return {
    games,
    overall: overall(games),
    patterns,
    tips: makeTips(games, patterns),
    time: timeAnalysis(args.log, refs, context.correctness, context.labels),
    parts,
    context,
    errors: errorCounts(games),
  };
}
