import { createRng } from '../lib/rng';
import { parseUserNumber } from '../lib/format';
import { THEMES } from './themes';
import { generateStudy } from './study';
import { generateCases } from './cases';
import type { CaseQuestion, ChartType, Difficulty, NumericQuestion, RedrockScenario, ReportBlank } from './types';

export function generateRedrock(seed: string, difficulty: Difficulty): RedrockScenario {
  const rng = createRng(`redrock|${difficulty}|${seed}`);
  const theme = rng.pick(THEMES);
  const study = generateStudy(rng, theme, difficulty);
  const cases = generateCases(rng, theme, difficulty);
  return { seed, difficulty, study, cases };
}

export const JOURNAL_MAX = 8;

export interface RedrockAnswers {
  journal: string[]; // ids de datos guardados
  analysis: Record<string, string>;
  blanks: Record<string, string>; // number -> texto, select -> índice como texto
  chartType: ChartType | null;
  chartValues: (number | null)[]; // índice de valueOptions por elemento
  cases: Record<string, string>; // mcq -> índice como texto; numeric -> texto
}

export interface RedrockTimes {
  study: number;
  investigation: number;
  analysis: number;
  report: number;
  cases: number;
}

export function emptyRedrockAnswers(s: RedrockScenario): RedrockAnswers {
  return {
    journal: [],
    analysis: {},
    blanks: {},
    chartType: null,
    chartValues: s.study.chartTask.elements.map(() => null),
    cases: {},
  };
}

export function isNumericCorrect(q: { answer: number; tolerance: number }, raw: string | undefined): boolean {
  const v = parseUserNumber(raw ?? '');
  if (v == null) return false;
  return Math.abs(v - q.answer) <= q.tolerance + 1e-9;
}

export function gradeAnalysis(q: NumericQuestion, raw: string | undefined): boolean {
  return isNumericCorrect(q, raw);
}

export function gradeBlank(b: ReportBlank, raw: string | undefined): boolean {
  if (raw == null || raw === '') return false;
  if (b.kind === 'select') return Number(raw) === b.correctIndex;
  return isNumericCorrect({ answer: b.answer!, tolerance: b.tolerance! }, raw);
}

export function gradeCase(c: CaseQuestion, raw: string | undefined): boolean {
  if (raw == null || raw === '') return false;
  if (c.format === 'mcq') return Number(raw) === c.correctIndex;
  return isNumericCorrect(c, raw);
}

export interface RedrockGrade {
  analysis: { correct: number; total: number };
  report: { correct: number; total: number; chartTypeOk: boolean; chartValuesOk: boolean };
  cases: { correct: number; total: number };
  journal: { saved: number; relevantSaved: number; relevantTotal: number; precision: number };
  overall: number;
}

export function gradeRedrock(s: RedrockScenario, a: RedrockAnswers): RedrockGrade {
  const aCorrect = s.study.questions.filter((q) => gradeAnalysis(q, a.analysis[q.id])).length;
  const bCorrect = s.study.blanks.filter((b) => gradeBlank(b, a.blanks[b.id])).length;
  const chartTypeOk = a.chartType === s.study.chartTask.correctType;
  const chartValuesOk = s.study.chartTask.elements.every((e, i) => a.chartValues[i] === e.correctIndex);
  const cCorrect = s.cases.filter((c) => gradeCase(c, a.cases[c.id])).length;
  const relevantIds = Object.values(s.study.data).filter((d) => d.relevant).map((d) => d.id);
  const relevantSaved = a.journal.filter((id) => s.study.data[id]?.relevant).length;
  const reportCorrect = bCorrect + (chartTypeOk ? 1 : 0) + (chartValuesOk ? 1 : 0);
  const reportTotal = s.study.blanks.length + 2;
  const total = s.study.questions.length + reportTotal + s.cases.length;
  return {
    analysis: { correct: aCorrect, total: s.study.questions.length },
    report: { correct: reportCorrect, total: reportTotal, chartTypeOk, chartValuesOk },
    cases: { correct: cCorrect, total: s.cases.length },
    journal: {
      saved: a.journal.length,
      relevantSaved,
      relevantTotal: relevantIds.length,
      precision: a.journal.length ? relevantSaved / a.journal.length : 0,
    },
    overall: Math.round(((aCorrect + reportCorrect + cCorrect) / total) * 100),
  };
}
