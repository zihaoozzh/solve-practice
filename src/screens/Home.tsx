import { useState } from 'react';
import { fmtTime } from '../lib/format';
import { clearHistory, HistoryEntry, loadHistory, Mode, MODE_LABEL } from '../lib/history';

export interface RunConfig {
  mode: Mode;
  difficulty: 'normal' | 'hard';
  seed: string;
  aids: boolean;
}

const MODES: { key: Mode; title: string; minutes: number; desc: string }[] = [
  {
    key: 'redrock',
    title: 'Redrock Study',
    minutes: 35,
    desc: 'Investigación ecológica: Investigación → Análisis → Informe (≈23 min) y 6 casos (≈12 min).',
  },
  {
    key: 'seawolf',
    title: 'Sea Wolf',
    minutes: 30,
    desc: '3 zonas contaminadas: guarda microbios en 3 oleadas y elige un tratamiento de 3 (≈8/10/12 min).',
  },
  {
    key: 'full',
    title: 'Simulación completa',
    minutes: 65,
    desc: 'Redrock (35 min) seguido de Sea Wolf (30 min), con una corrección conjunta al final.',
  },
];

export function Home({ initial, onStart }: { initial: RunConfig; onStart: (c: RunConfig) => void }) {
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [difficulty, setDifficulty] = useState(initial.difficulty);
  const [seed, setSeed] = useState('');
  const [aids, setAids] = useState(initial.aids);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

  return (
    <div className="home">
      <header className="home-header">
        <div>
          <h1>Entrenador de razonamiento ecológico</h1>
          <p className="muted">
            Práctica personal con la mecánica y la presión de tiempo de Redrock Study y Sea Wolf. Todo el contenido se genera aquí, sin conexión.
          </p>
        </div>
      </header>

      <section className="mode-grid">
        {MODES.map((m) => (
          <button key={m.key} type="button" className={`mode-card ${mode === m.key ? 'selected' : ''}`} onClick={() => setMode(m.key)}>
            <div className="mode-top">
              <span className="mode-title">{m.title}</span>
              <span className="mode-min">{m.minutes} min</span>
            </div>
            <div className="mode-desc">{m.desc}</div>
          </button>
        ))}
      </section>

      <section className="config card">
        <div className="config-row">
          <span className="config-label">Dificultad</span>
          <div className="segmented">
            {(['normal', 'hard'] as const).map((d) => (
              <button key={d} type="button" className={difficulty === d ? 'selected' : ''} onClick={() => setDifficulty(d)}>
                {d === 'normal' ? 'Normal' : 'Difícil'}
              </button>
            ))}
          </div>
        </div>
        <div className="config-row">
          <label className="config-label" htmlFor="seed">
            Semilla (opcional)
          </label>
          <input id="seed" className="text-input" value={seed} placeholder="vacía = escenario nuevo" onChange={(e) => setSeed(e.target.value.trim().slice(0, 24))} />
          <span className="muted small">Usa la misma semilla y dificultad para repetir exactamente un escenario.</span>
        </div>
        {mode !== 'redrock' && (
          <div className="config-row">
            <span className="config-label">Sea Wolf</span>
            <label className="switch">
              <input type="checkbox" checked={aids} onChange={(e) => setAids(e.target.checked)} />
              Ayudas de práctica (sumas parciales en directo)
            </label>
          </div>
        )}
        <div className="config-row">
          <button type="button" className="btn primary big" onClick={() => onStart({ mode, difficulty, seed, aids })}>
            Empezar {MODES.find((m) => m.key === mode)!.title} →
          </button>
        </div>
      </section>

      <section className="history">
        <div className="history-head">
          <h2>Historial</h2>
          {history.length > 0 && (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                clearHistory();
                setHistory([]);
              }}
            >
              Borrar historial
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="muted">Aún no hay intentos. Tus partidas se guardan en este navegador.</p>
        ) : (
          <table className="history-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Modo</th>
                <th>Dificultad</th>
                <th>Semilla</th>
                <th>Puntuación</th>
                <th>Tiempo por fase</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.date).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>
                    {MODE_LABEL[h.mode]}
                    {h.aids ? <span className="tag">ayudas</span> : null}
                  </td>
                  <td>{h.difficulty === 'hard' ? 'Difícil' : 'Normal'}</td>
                  <td>
                    <code>{h.seed}</code>
                  </td>
                  <td>
                    <strong>{h.score}%</strong>
                  </td>
                  <td className="phases">
                    {h.phases.map((p) => (
                      <span key={p.name} className="phase-chip">
                        {p.name} {fmtTime(p.timeSec)}
                        {p.score != null ? ` · ${p.score}%` : ''}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <footer className="foot muted small">Herramienta de entrenamiento personal con contenido original. No está afiliada a ningún proceso de selección.</footer>
    </div>
  );
}
