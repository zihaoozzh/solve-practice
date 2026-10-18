// Evaluación completa de un intento: rúbricas, análisis del proceso y corrección decisión a decisión.
// Es una función pura: la usan el final de la partida y el historial («Ver informe»), que vuelve a calcular el
// informe a partir de lo guardado (escenarios, respuestas, tiempos y registro de la sesión).

import { buildAnalysis, ExtraGame, FullAnalysis } from '../analysis';
import type { SessionLog } from './recorder';
import type { RedrockRunResult, SeaWolfRunResult } from '../screens/Results';
import type { IslandDayAnswer, IslandOnboardingAnswer, IslandScenario } from '../sfl/island';
import { gradeIsland, IslandGrade, islandContext, islandPatterns, islandTimes } from '../sfl/islandGrade';
import { ClassicAnswers, ClassicGrade, ClassicScenario, classicContext, classicPatterns, classicTimes, gradeClassic } from '../sfl/classic';

export interface IslandRunResult {
  scenario: IslandScenario;
  answers: IslandDayAnswer[];
  onboarding: IslandOnboardingAnswer;
  timedOut: boolean;
}

export interface ClassicRunResult {
  scenario: ClassicScenario;
  answers: ClassicAnswers;
  timedOut: boolean;
}

export interface Collected {
  redrock?: RedrockRunResult;
  seawolf?: SeaWolfRunResult;
  island?: IslandRunResult;
  classic?: ClassicRunResult;
}

export interface Evaluation {
  analysis: FullAnalysis;
  islGrade: IslandGrade | null;
  clGrade: ClassicGrade | null;
}

export function evaluate(c: Collected, log: SessionLog | null): Evaluation {
  const extra: ExtraGame[] = [];
  let islGrade: IslandGrade | null = null;
  if (c.island) {
    const isl = c.island;
    islGrade = gradeIsland(isl.scenario, isl.answers, isl.onboarding);
    extra.push({
      rubric: islGrade.rubric,
      times: islandTimes(isl.answers, isl.onboarding),
      ...islandContext(isl.scenario, islGrade),
      patterns: islandPatterns(isl.scenario, isl.answers, islGrade, isl.onboarding),
    });
  }
  let clGrade: ClassicGrade | null = null;
  if (c.classic) {
    const cl = c.classic;
    clGrade = gradeClassic(cl.scenario, cl.answers);
    extra.push({
      rubric: clGrade.rubric,
      times: classicTimes(cl.answers),
      ...classicContext(cl.scenario, clGrade),
      patterns: classicPatterns(cl.scenario, cl.answers, clGrade),
    });
  }
  const analysis = buildAnalysis({
    redrock: c.redrock && { scenario: c.redrock.scenario, answers: c.redrock.answers, times: c.redrock.times },
    seawolf: c.seawolf && { scenario: c.seawolf.scenario, answers: c.seawolf.answers },
    extra,
    log,
  });
  return { analysis, islGrade, clGrade };
}
