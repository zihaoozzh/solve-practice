// Traduce los identificadores del registro a etiquetas legibles y a acierto/fallo según la rúbrica.

import type { RecEvent } from '../lib/recorder';
import type { RedrockScenario } from '../redrock/types';
import type { SeaWolfScenario } from '../seawolf';
import type { GameRubric } from './rubric';

export interface AnalysisContext {
  labels: Map<string, string>;
  correctness: Map<string, boolean>;
  /** Descripción legible de un evento semántico (para la repetición). */
  describe: (e: RecEvent) => string | null;
  phaseLabel: (name: string) => string;
}

/** Nombre legible de una fase del registro. */
export function phaseLabel(name: string): string {
  const parts = name.split('-');
  if (parts[0] === 'redrock') return `Redrock · ${PHASES_ES[parts[1]] ?? parts[1]}`;
  if (parts[0] === 'seawolf') return `Sea Wolf · Sitio ${parts[1]} · ${PHASES_ES[parts[2]] ?? parts[2]}`;
  if (parts[0] === 'sfl') return `SFL ${parts[1] === 'island' ? 'Island' : 'Classic'} · ${parts.slice(2).map((x) => (/^\d+$/.test(x) ? `${parts[1] === 'island' ? 'Día' : 'Decisión'} ${x}` : (PHASES_ES[x] ?? x))).join(' · ')}`;
  if (name === 'pausa') return 'Pausa entre pruebas';
  return name;
}

const PHASES_ES: Record<string, string> = {
  investigation: 'Investigación',
  analysis: 'Análisis',
  report: 'Informe',
  cases: 'Mini-casos',
  profile: 'Perfil',
  review: 'Revisión',
  classify: 'Clasificación',
  rounds: 'Rondas',
  treatment: 'Tratamiento',
  efficacy: 'Eficacia',
  day: 'Día',
  explore: 'Explorar',
  assign: 'Asignar',
  support: 'Apoyar',
  reflect: 'Reflexionar',
  feedback: 'Resumen del día',
  scale: 'Escalar',
  onboarding: 'Presentación',
  briefing: 'Briefing',
  ranking: 'Ranking',
  decision: 'Decisión',
};

export function buildContext(rubrics: GameRubric[], redrock?: RedrockScenario, seawolf?: SeaWolfScenario, extra?: { labels: Map<string, string>; correctness: Map<string, boolean>; describe?: (e: RecEvent) => string | null }): AnalysisContext {
  const labels = new Map<string, string>(extra?.labels ?? []);
  const correctness = new Map<string, boolean>(extra?.correctness ?? []);
  const itemOk = new Map<string, boolean>();
  for (const g of rubrics) for (const p of g.parts) for (const i of p.items) itemOk.set(i.id, i.earned >= i.max);

  if (redrock) {
    redrock.cases.forEach((c, i) => {
      labels.set(`case|${c.id}`, `Mini-caso ${i + 1} (${c.typeLabel})`);
      if (itemOk.has(`case-${c.id}`)) correctness.set(`case|${c.id}`, itemOk.get(`case-${c.id}`)!);
    });
    redrock.study.questions.forEach((q, i) => {
      labels.set(`analysis|${q.id}`, `Análisis: pregunta ${i + 1}`);
      if (itemOk.has(`analysis-${q.id}`)) correctness.set(`analysis|${q.id}`, itemOk.get(`analysis-${q.id}`)!);
    });
    redrock.study.blanks.forEach((b, i) => {
      labels.set(`report|${b.id}`, `Informe: hueco ${i + 1}`);
      if (itemOk.has(`report-${b.id}`)) correctness.set(`report|${b.id}`, itemOk.get(`report-${b.id}`)!);
    });
    labels.set('chart|type', 'Informe: tipo de gráfico');
    if (itemOk.has('report-chart-type')) correctness.set('chart|type', itemOk.get('report-chart-type')!);
  }
  if (seawolf) {
    seawolf.zones.forEach((z, zi) => {
      const site = `Sitio ${zi + 1}`;
      labels.set(`sw-profile|${zi}`, `${site} · perfil`);
      correctness.set(`sw-profile|${zi}`, !!itemOk.get(`sw${zi}-profile-0`) && !!itemOk.get(`sw${zi}-profile-1`));
      labels.set(`sw-treatment|${zi}`, `${site} · tratamiento`);
      correctness.set(`sw-treatment|${zi}`, [0, 1, 2, 3, 4].every((k) => itemOk.get(`sw${zi}-treat-${k}`)));
      z.classification.forEach((m, mi) => {
        labels.set(`sw-classify|${m.id}`, `${site} · clasificación n.º ${mi + 1} (${m.name})`);
        if (itemOk.has(`sw${zi}-class-${m.id}`)) correctness.set(`sw-classify|${m.id}`, itemOk.get(`sw${zi}-class-${m.id}`)!);
      });
      z.rounds.forEach((_, r) => labels.set(`sw-round|${zi}-${r}`, `${site} · ronda ${r + 1}`));
      [...z.classification, ...z.rounds.flat()].forEach((m) => {
        labels.set(`sw-treatment|${m.id}`, `${site} · tratamiento: ${m.name}`);
        labels.set(`sw-review|${m.id}`, `Revisión de aplazado: ${m.name}`);
      });
    });
  }

  const datum = (id: string) => redrock?.study.data[id];
  const describe = (e: RecEvent): string | null => {
    if (extra?.describe) {
      const d = extra.describe(e);
      if (d) return d;
    }
    switch (e.k) {
      case 'journal':
        return `${e.op === 'add' ? 'Guarda en el diario' : 'Quita del diario'}: ${datum(e.id)?.label ?? e.id}`;
      case 'decision':
        return `${labels.get(`${e.kind}|${e.item}`) ?? e.kind}: ${e.value || '—'} (${(e.ms / 1000).toFixed(1)} s)`;
      case 'change':
        return `Cambio de opinión en ${labels.get(`${e.kind}|${e.item}`) ?? e.item}`;
      case 'calc':
        return `Calculadora: ${e.expr} = ${e.result}`;
      default:
        return null;
    }
  };

  return { labels, correctness, describe, phaseLabel };
}
