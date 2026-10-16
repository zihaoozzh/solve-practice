export type Difficulty = 'normal' | 'hard';

/** Una cifra concreta del material que se puede guardar en el Research Journal. */
export interface Datum {
  id: string;
  value: number;
  /** Texto tal como aparece en el material (p. ej. "4.6"). */
  display: string;
  unit: string;
  label: string;
  /** true si alguna pregunta de Analysis la necesita. */
  relevant: boolean;
  /** Explicación (ES) de por qué es una trampa o es irrelevante. */
  note?: string;
}

export type Segment = string | { datum: string };

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'scatter';
  title: string;
  labels: string[];
  series: { name: string; values: number[]; datumIds?: string[] }[];
  yLabel?: string;
  decimals?: number;
}

export type Material =
  | { kind: 'paragraph'; id: string; title: string; segments: Segment[] }
  | {
      kind: 'table';
      id: string;
      title: string;
      columns: string[];
      rows: { label: string; cells: { datum?: string; text?: string; mark?: string }[] }[];
      footnotes: string[];
    }
  | { kind: 'chart'; id: string; chart: ChartSpec; footnotes: string[] };

export interface NumericQuestion {
  id: string;
  prompt: string;
  unit: string;
  decimals: number;
  tolerance: number;
  answer: number;
  requiredData: string[];
  /** Pasos de la solución en español. */
  steps: string[];
  trap: string;
  /** Resultados de errores típicos: deben quedar fuera de la tolerancia. */
  wrongApproaches: { label: string; value: number }[];
}

export type MemoPart = string | { blank: string };

export interface ReportBlank {
  id: string;
  kind: 'number' | 'select';
  options?: string[];
  /** Para select: índice correcto. Para number: valor. */
  correctIndex?: number;
  answer?: number;
  tolerance?: number;
  decimals?: number;
  explanation: string;
}

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter';

export interface ChartTask {
  message: string;
  correctType: ChartType;
  elements: { label: string; correctIndex: number }[];
  /** Valores candidatos (texto) que se pueden asignar a cada elemento. */
  valueOptions: { text: string; value: number }[];
  unit: string;
  explanation: string;
}

export interface Study {
  theme: string;
  objective: string;
  context: string;
  materials: Material[];
  data: Record<string, Datum>;
  questions: NumericQuestion[];
  memoTitle: string;
  memo: MemoPart[][];
  blanks: ReportBlank[];
  chartTask: ChartTask;
}

export interface CaseTable {
  title: string;
  columns: string[];
  rows: string[][];
  footnotes?: string[];
}

export interface CaseQuestion {
  id: string;
  type: 'pct_change' | 'pp_vs_pct' | 'weighted_mean' | 'ratio_units' | 'projection' | 'chart_read';
  typeLabel: string;
  intro: string;
  table?: CaseTable;
  chart?: ChartSpec;
  prompt: string;
  format: 'mcq' | 'numeric';
  options?: string[];
  optionValues?: number[];
  correctIndex?: number;
  answer: number;
  unit: string;
  decimals: number;
  tolerance: number;
  steps: string[];
  trap: string;
}

export interface RedrockScenario {
  seed: string;
  difficulty: Difficulty;
  study: Study;
  cases: CaseQuestion[];
}
