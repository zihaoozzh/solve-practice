import { useEffect, useState } from 'react';
import { TIMING } from '../config';
import { fmtTime } from '../lib/format';
import { HistoryEntry, Lang, loadHistory, Mode, MODE_LABEL, Source } from '../lib/history';

export interface RunConfig {
  mode: Mode;
  difficulty: 'normal' | 'hard';
  seed: string;
  aids: boolean;
  /** Modo examen: reloj real, sin pistas ni ayudas y corrección solo al final. */
  exam: boolean;
  /** Idioma del contenido de la prueba. */
  lang: Lang;
}

const min = (sec: number) => Math.round(sec / 60);

const MODES: { key: Mode; title: string; minutes: number; desc: string }[] = [
  {
    key: 'redrock',
    title: 'Redrock Study',
    minutes: min(TIMING.redrockSec),
    desc: `Investigación ecológica: Investigación → Análisis → Informe (≈${min(TIMING.redrockStudyGuideSec)} min) y 6 mini-casos (≈${min(TIMING.redrockCasesGuideSec)} min).`,
  },
  {
    key: 'seawolf',
    title: 'Sea Wolf',
    minutes: min(TIMING.seawolfSec),
    desc: `3 sitios contaminados: clasifica 10 microbios, completa el pool en 4 rondas de «elige 1 de 3» y elige un tratamiento de 3 (≈${TIMING.seawolfZoneGuideMin[0]} min por sitio).`,
  },
  {
    key: 'sfl-island',
    title: 'SFL Island',
    minutes: min(TIMING.sflIslandSec),
    desc: '3 días dirigiendo a 4 investigadores en 4 estaciones: pocas preguntas al día, asignaciones con motivo, peticiones de apoyo y valoración del equipo.',
  },
  {
    key: 'sfl-classic',
    title: 'SFL Classic',
    minutes: min(TIMING.sflClassicSec),
    desc: 'La versión de las invitaciones de 85 min: briefing que no se puede releer, ranking de 4 iniciativas y 12 decisiones encadenadas hasta decidir si escalar.',
  },
  {
    key: 'full',
    title: 'Simulación 65 min',
    minutes: min(TIMING.redrockSec + TIMING.seawolfSec),
    desc: `Redrock (${min(TIMING.redrockSec)} min) seguido de Sea Wolf (${min(TIMING.seawolfSec)} min), con una corrección conjunta al final.`,
  },
  {
    key: 'full85',
    title: 'Simulación 85 min',
    minutes: min(TIMING.redrockSec + TIMING.seawolfSec + TIMING.sflClassicSec),
    desc: `La invitación de 85 min: Redrock (${min(TIMING.redrockSec)}) → Sea Wolf (${min(TIMING.seawolfSec)}) → SFL Classic (${min(TIMING.sflClassicSec)}), volviendo al menú entre juegos y con corrección conjunta.`,
  },
  {
    key: 'full95',
    title: 'Simulación 95 min',
    minutes: min(TIMING.redrockSec + TIMING.seawolfSec + TIMING.sflIslandSec),
    desc: `La invitación de «aprox. 95 min»: Redrock (${min(TIMING.redrockSec)}) → Sea Wolf (${min(TIMING.seawolfSec)}) → SFL Island (${min(TIMING.sflIslandSec)}), volviendo al menú entre juegos y con corrección conjunta.`,
  },
];

export function Home({ initial, onStart, onStats }: { initial: RunConfig; onStart: (c: RunConfig) => void; onStats: () => void }) {
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [difficulty, setDifficulty] = useState(initial.difficulty);
  const [seed, setSeed] = useState('');
  const [aids, setAids] = useState(initial.aids);
  const [exam, setExam] = useState(initial.exam);
  const [lang, setLang] = useState<Lang>(initial.lang);
  const [history, setHistory] = useState<{ entries: HistoryEntry[]; source: Source } | null>(null);

  useEffect(() => {
    let alive = true;
    loadHistory().then((h) => alive && setHistory(h));
    return () => {
      alive = false;
    };
  }, []);

  const recent = history?.entries.slice(0, 5) ?? [];

  return (
    <div className="home">
      <header className="home-header">
        <div>
          <h1>Entrenador de razonamiento ecológico</h1>
          <p className="muted">
            Práctica personal con la mecánica y la presión de tiempo de Redrock Study y Sea Wolf. Todo el contenido se genera aquí y es original.
          </p>
        </div>
      </header>

      <section className="mode-grid">
        {MODES.map((m) => (
          <button key={m.key} type="button" className={`mode-card ${mode === m.key ? 'selected' : ''}`} onClick={() => setMode(m.key)} aria-label={m.title}>
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
          <span className="config-label">Sesión</span>
          <div className="segmented">
            <button type="button" className={!exam ? 'selected' : ''} onClick={() => setExam(false)}>
              Práctica
            </button>
            <button type="button" className={exam ? 'selected' : ''} onClick={() => setExam(true)}>
              Examen
            </button>
          </div>
          <span className="muted small">
            {exam
              ? 'Reloj real, sin pistas, sin guía de tiempos ni ayudas y corrección solo al final.'
              : 'Con pistas, guía de tiempos, ayudas opcionales, la solución de cada mini-caso al momento y la eficacia de cada tratamiento.'}
          </span>
        </div>
        <div className="config-row">
          <span className="config-label">Idioma de la prueba</span>
          <div className="segmented">
            <button type="button" className={lang === 'es' ? 'selected' : ''} onClick={() => setLang('es')}>
              Español
            </button>
            <button type="button" className={lang === 'en' ? 'selected' : ''} onClick={() => setLang('en')}>
              English
            </button>
          </div>
          <span className="muted small">Las correcciones se muestran siempre en español.</span>
        </div>
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
          <span className="muted small">La misma semilla y dificultad repiten exactamente el escenario (en cualquier idioma).</span>
        </div>
        {(mode === 'seawolf' || mode === 'full' || mode === 'full85' || mode === 'full95') && !exam && (
          <div className="config-row">
            <span className="config-label">Sea Wolf</span>
            <label className="switch">
              <input type="checkbox" checked={aids} onChange={(e) => setAids(e.target.checked)} />
              Ayudas de práctica (sumas parciales en directo)
            </label>
          </div>
        )}
        <div className="config-row">
          <button type="button" className="btn primary big" onClick={() => onStart({ mode, difficulty, seed, aids: exam ? false : aids, exam, lang })}>
            Empezar {MODES.find((m) => m.key === mode)!.title}
            {exam ? ' (examen)' : ''} →
          </button>
        </div>
      </section>

      <section className="history">
        <div className="history-head">
          <h2>Últimos intentos</h2>
          <button type="button" className="btn outline small" onClick={onStats}>
            Ver evolución y estadísticas →
          </button>
        </div>
        {history === null ? (
          <p className="muted">Cargando…</p>
        ) : recent.length === 0 ? (
          <p className="muted">
            Aún no hay intentos. {history.source === 'file' ? 'Se guardarán en data/intentos.json.' : 'Se guardarán en este navegador.'}
          </p>
        ) : (
          <table className="history-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Modo</th>
                <th>Semilla</th>
                <th>Puntuación</th>
                <th>Tiempo y aciertos por fase</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.date).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>
                    {MODE_LABEL[h.mode]}
                    {h.exam ? <span className="tag">examen</span> : null}
                    {h.aids ? <span className="tag">ayudas</span> : null}
                  </td>
                  <td>
                    <code>{h.seed}</code>
                  </td>
                  <td>
                    <strong>{h.score}%</strong>
                  </td>
                  <td className="phases">
                    {h.phases.map((p) => (
                      <span key={p.key} className="phase-chip">
                        {p.name} {fmtTime(p.timeSec)}
                        {p.total ? ` · ${p.correct}/${p.total}` : p.score != null ? ` · ${p.score}%` : ''}
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
