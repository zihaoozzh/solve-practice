// Tiempos y límites de la simulación. El origen de cada valor está en research/solve-2026.md.

export const TIMING = {
  /** Un solo reloj para el estudio y los mini-casos (~35 min) [web de preparación]. */
  redrockSec: 35 * 60,
  /** Un solo reloj para los 3 sitios (~30 min) [web de preparación]. */
  seawolfSec: 30 * 60,
  /** Presupuestos orientativos (no hay temporizadores oficiales por fase). */
  redrockPhaseGuideSec: { investigation: 6 * 60, analysis: 10 * 60, report: 6 * 60, cases: 12 * 60 },
  redrockStudyGuideSec: 22 * 60,
  redrockCasesGuideSec: 12 * 60,
  /** 6 mini-casos de ~2 min [web de preparación]. */
  perCaseGuideSec: 2 * 60,
  /** Reparto orientativo por sitio de Sea Wolf (minutos). */
  seawolfZoneGuideMin: [10, 10, 10],
};

/** Límite del diario: NO confirmado por ninguna fuente; se mantiene como restricción de práctica. */
export const JOURNAL_LIMIT = 8;
