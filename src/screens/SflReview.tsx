// Corrección por decisión del Sustainable Futures Lab: mejor respuesta, por qué, qué información la justificaba y cuándo había que obtenerla.

export interface SflDecisionView {
  id: string;
  day: number;
  step: string;
  label: string;
  yours: string;
  best: string;
  ok: boolean | 'partial';
  why: string;
  info: string;
  when: string;
}

const STEP_ES: Record<string, string> = {
  explore: 'Explorar',
  assign: 'Asignar',
  reason: 'Motivos',
  support: 'Apoyar',
  reflect: 'Reflexionar',
  briefing: 'Briefing',
  ranking: 'Ranking',
  decision: 'Decisiones',
  scale: 'Escalar',
};

export function SflDecisionList({ decisions }: { decisions: SflDecisionView[] }) {
  const steps = [...new Set(decisions.map((d) => d.step))];
  return (
    <div className="sfl-decisions">
      {steps.map((st) => (
        <div key={st}>
          <h4>{STEP_ES[st] ?? st}</h4>
          {decisions
            .filter((d) => d.step === st)
            .map((d) => (
              <div key={d.id} className={`sfl-decision ${d.ok === true ? 'ok' : d.ok === 'partial' ? 'partial' : 'ko'}`}>
                <div className="review-head">
                  <strong>{d.label}</strong>
                  <span className={`verdict ${d.ok === true ? 'ok' : d.ok === 'partial' ? 'partial' : 'ko'}`}>
                    {d.ok === true ? '✓ Mejor respuesta' : d.ok === 'partial' ? '≈ Aceptable' : '✗ Mejorable'}
                  </span>
                </div>
                <div className="answers-compare">
                  <span>
                    Tu decisión: <strong>{d.yours}</strong>
                  </span>
                  {d.ok !== true && (
                    <span>
                      Mejor: <strong>{d.best}</strong>
                    </span>
                  )}
                </div>
                <div className="explain">{d.why}</div>
                <div className="muted small">
                  <strong>Información que lo justificaba:</strong> {d.info ? d.info[0].toUpperCase() + d.info.slice(1) : '—'} · <strong>Cuándo obtenerla:</strong> {d.when}
                </div>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

export function SflReview({ title, decisions, days }: { title: string; decisions: SflDecisionView[]; days: number }) {
  return (
    <section className="review">
      <h2>{title}: decisión a decisión</h2>
      {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
        const ds = decisions.filter((x) => x.day === d);
        if (!ds.length) return null;
        const okN = ds.filter((x) => x.ok === true).length;
        return (
          <details key={d} className="card" open={d === 1}>
            <summary>
              <strong>{days > 1 ? `Día ${d}` : 'Decisiones'}</strong>{' '}
              <span className="muted small">
                {okN} de {ds.length} con la mejor respuesta
              </span>
            </summary>
            <SflDecisionList decisions={ds} />
          </details>
        );
      })}
    </section>
  );
}
