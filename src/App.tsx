import { useEffect, useMemo, useState } from 'react';
import { Home, RunConfig } from './screens/Home';
import { RedrockRun } from './screens/RedrockRun';
import { SeaWolfRun } from './screens/SeaWolfRun';
import { RedrockRunResult, Results, SeaWolfRunResult, seaWolfScore } from './screens/Results';
import { generateRedrock, gradeRedrock } from './redrock';
import { generateSeaWolf, gradeZone } from './seawolf';
import { randomSeed } from './lib/rng';
import { addHistory, HistoryEntry } from './lib/history';

type Screen = 'home' | 'redrock' | 'interlude' | 'seawolf' | 'results';

const REDROCK_SEC = 35 * 60;
const SEAWOLF_SEC = 30 * 60;

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [config, setConfig] = useState<RunConfig>({ mode: 'redrock', difficulty: 'normal', seed: '', aids: false });
  const [runId, setRunId] = useState(0);
  const [redrock, setRedrock] = useState<RedrockRunResult | undefined>();
  const [seawolf, setSeawolf] = useState<SeaWolfRunResult | undefined>();

  const rrScenario = useMemo(
    () => (config.seed && config.mode !== 'seawolf' ? generateRedrock(config.seed, config.difficulty) : null),
    [config, runId],
  );
  const swScenario = useMemo(
    () => (config.seed && config.mode !== 'redrock' ? generateSeaWolf(config.seed, config.difficulty) : null),
    [config, runId],
  );

  const inRun = screen === 'redrock' || screen === 'seawolf';
  useEffect(() => {
    if (!inRun) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [inRun]);

  const start = (c: RunConfig) => {
    const seed = c.seed || randomSeed();
    setConfig({ ...c, seed });
    setRedrock(undefined);
    setSeawolf(undefined);
    setRunId((x) => x + 1);
    setScreen(c.mode === 'seawolf' ? 'seawolf' : 'redrock');
    window.scrollTo(0, 0);
  };

  const finishAll = (rr?: RedrockRunResult, sw?: SeaWolfRunResult) => {
    const phases: HistoryEntry['phases'] = [];
    let score = 0;
    let n = 0;
    if (rr) {
      const g = gradeRedrock(rr.scenario, rr.answers);
      phases.push(
        { name: 'Estudio', timeSec: rr.times.study, score: Math.round(((g.analysis.correct + g.report.correct) / (g.analysis.total + g.report.total)) * 100) },
        { name: 'Casos', timeSec: rr.times.cases, score: Math.round((g.cases.correct / g.cases.total) * 100) },
      );
      score += g.overall;
      n++;
    }
    if (sw) {
      sw.scenario.zones.forEach((z, i) => phases.push({ name: `Zona ${i + 1}`, timeSec: sw.answers[i].timeSec, score: gradeZone(z, sw.answers[i]).score }));
      score += seaWolfScore(sw);
      n++;
    }
    addHistory({
      id: `${Date.now()}`,
      date: new Date().toISOString(),
      mode: config.mode,
      difficulty: config.difficulty,
      seed: config.seed,
      score: Math.round(score / Math.max(n, 1)),
      phases,
      aids: sw?.aidsUsed,
    });
    setScreen('results');
    window.scrollTo(0, 0);
  };

  return (
    <div className="app">
      {screen === 'home' && <Home initial={config} onStart={start} />}

      {screen === 'redrock' && rrScenario && (
        <RedrockRun
          key={`rr-${runId}`}
          scenario={rrScenario}
          durationSec={REDROCK_SEC}
          label={config.mode === 'full' ? 'Simulación completa · Parte 1: Redrock Study' : undefined}
          onFinish={(answers, times, timedOut) => {
            const res = { scenario: rrScenario, answers, times, timedOut };
            setRedrock(res);
            if (config.mode === 'full') {
              setScreen('interlude');
              window.scrollTo(0, 0);
            } else finishAll(res, undefined);
          }}
        />
      )}

      {screen === 'interlude' && (
        <div className="interlude card">
          <div className="q-num">Simulación completa</div>
          <h1>Parte 1 terminada</h1>
          <p>
            Redrock Study está cerrado. La corrección aparecerá al final, junto con Sea Wolf. Cuando estés listo, empieza la Parte 2 (30 minutos).
          </p>
          <button type="button" className="btn primary big" onClick={() => setScreen('seawolf')}>
            Empezar Sea Wolf →
          </button>
        </div>
      )}

      {screen === 'seawolf' && swScenario && (
        <SeaWolfRun
          key={`sw-${runId}`}
          scenario={swScenario}
          durationSec={SEAWOLF_SEC}
          initialAids={config.aids}
          label={config.mode === 'full' ? 'Simulación completa · Parte 2: Sea Wolf' : undefined}
          onFinish={(answers, aidsUsed, timedOut) => {
            const res = { scenario: swScenario, answers, aidsUsed, timedOut };
            setSeawolf(res);
            finishAll(redrock, res);
          }}
        />
      )}

      {screen === 'results' && (
        <Results mode={config.mode} redrock={redrock} seawolf={seawolf} onHome={() => setScreen('home')} onRepeat={() => start(config)} />
      )}
    </div>
  );
}
