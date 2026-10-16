import { useEffect, useMemo, useState } from 'react';
import { Home, RunConfig } from './screens/Home';
import { RedrockRun } from './screens/RedrockRun';
import { SeaWolfRun } from './screens/SeaWolfRun';
import { RedrockRunResult, Results, SeaWolfRunResult, seaWolfScore } from './screens/Results';
import { Stats } from './screens/Stats';
import { generateRedrock, gradeCase, gradeRedrock } from './redrock';
import { generateSeaWolf, gradeZone, microbeIndex } from './seawolf';
import { randomSeed } from './lib/rng';
import { addHistory, clearHistory, exportHistory, HistoryEntry, loadHistory, PhaseStat, Source } from './lib/history';
import { TIMING } from './config';

type Screen = 'home' | 'stats' | 'redrock' | 'interlude' | 'seawolf' | 'results';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [config, setConfig] = useState<RunConfig>({ mode: 'full', difficulty: 'normal', seed: '', aids: false, exam: false, lang: 'es' });
  const [runId, setRunId] = useState(0);
  const [redrock, setRedrock] = useState<RedrockRunResult | undefined>();
  const [seawolf, setSeawolf] = useState<SeaWolfRunResult | undefined>();
  const [stats, setStats] = useState<{ entries: HistoryEntry[]; source: Source; file?: string } | null>(null);
  const [savedTo, setSavedTo] = useState<Source | null>(null);

  const rrScenario = useMemo(
    () => (config.seed && config.mode !== 'seawolf' ? generateRedrock(config.seed, config.difficulty, config.lang) : null),
    [config, runId],
  );
  const swScenario = useMemo(
    () => (config.seed && config.mode !== 'redrock' ? generateSeaWolf(config.seed, config.difficulty, config.lang) : null),
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

  const go = (s: Screen) => {
    setScreen(s);
    window.scrollTo(0, 0);
  };

  const start = (c: RunConfig) => {
    const seed = c.seed || randomSeed();
    setConfig({ ...c, seed });
    setRedrock(undefined);
    setSeawolf(undefined);
    setSavedTo(null);
    setRunId((x) => x + 1);
    go(c.mode === 'seawolf' ? 'seawolf' : 'redrock');
  };

  const openStats = async () => {
    setStats(await loadHistory());
    go('stats');
  };

  const finishAll = (rr?: RedrockRunResult, sw?: SeaWolfRunResult) => {
    const phases: PhaseStat[] = [];
    const detail: HistoryEntry['detail'] = {};
    const scores: number[] = [];
    if (rr) {
      const g = gradeRedrock(rr.scenario, rr.answers);
      const pct = (c: number, t: number) => Math.round((c / t) * 100);
      phases.push(
        { key: 'investigacion', name: 'Investigación', timeSec: rr.times.investigation },
        { key: 'analisis', name: 'Análisis', timeSec: rr.times.analysis, correct: g.analysis.correct, total: g.analysis.total, score: pct(g.analysis.correct, g.analysis.total) },
        { key: 'informe', name: 'Informe', timeSec: rr.times.report, correct: g.report.correct, total: g.report.total, score: pct(g.report.correct, g.report.total) },
        { key: 'casos', name: 'Mini-casos', timeSec: rr.times.cases, correct: g.cases.correct, total: g.cases.total, score: pct(g.cases.correct, g.cases.total) },
      );
      detail.journalPrecision = g.journal.precision;
      detail.caseTypes = {};
      for (const c of rr.scenario.cases) {
        const cur = detail.caseTypes[c.type] ?? { correct: 0, total: 0 };
        cur.total++;
        if (gradeCase(c, rr.answers.cases[c.id])) cur.correct++;
        detail.caseTypes[c.type] = cur;
      }
      scores.push(g.overall);
      if (rr.timedOut) detail.timedOut = true;
    }
    if (sw) {
      let valid = 0;
      const index = microbeIndex(sw.scenario);
      sw.scenario.zones.forEach((z, i) => {
        const g = gradeZone(z, sw.answers[i], index);
        if (g.check.valid) valid++;
        phases.push({ key: `zona-${i + 1}`, name: `Sitio ${i + 1}`, timeSec: sw.answers[i].timeSec, correct: g.check.rulesOk, total: g.check.rulesTotal, score: g.score });
      });
      detail.validZones = valid;
      scores.push(seaWolfScore(sw));
      if (sw.timedOut) detail.timedOut = true;
    }
    const entry: HistoryEntry = {
      id: `${Date.now()}`,
      date: new Date().toISOString(),
      mode: config.mode,
      difficulty: config.difficulty,
      seed: config.seed,
      score: Math.round(scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1)),
      phases,
      aids: sw?.aidsUsed,
      exam: config.exam,
      lang: config.lang,
      detail,
    };
    addHistory(entry).then(setSavedTo);
    go('results');
  };

  return (
    <div className="app">
      {screen === 'home' && <Home initial={config} onStart={start} onStats={openStats} />}

      {screen === 'stats' && stats && (
        <Stats
          entries={stats.entries}
          source={stats.source}
          file={stats.file}
          onBack={() => go('home')}
          onExport={() => exportHistory(stats.entries)}
          onClear={async () => {
            await clearHistory();
            setStats(await loadHistory());
          }}
        />
      )}

      {screen === 'redrock' && rrScenario && (
        <RedrockRun
          key={`rr-${runId}`}
          scenario={rrScenario}
          durationSec={TIMING.redrockSec}
          exam={config.exam}
          label={config.mode === 'full' ? 'Parte 1: Redrock Study' : undefined}
          onFinish={(answers, times, timedOut) => {
            const res = { scenario: rrScenario, answers, times, timedOut };
            setRedrock(res);
            if (config.mode === 'full') go('interlude');
            else finishAll(res, undefined);
          }}
        />
      )}

      {screen === 'interlude' && (
        <div className="interlude card">
          <div className="q-num">Simulación completa</div>
          <h1>Parte 1 terminada</h1>
          <p>
            Redrock Study está cerrado. La corrección aparecerá al final, junto con Sea Wolf. Cuando estés listo, empieza la Parte 2 ({Math.round(TIMING.seawolfSec / 60)}{' '}
            minutos).
          </p>
          <button type="button" className="btn primary big" onClick={() => go('seawolf')}>
            Empezar Sea Wolf →
          </button>
        </div>
      )}

      {screen === 'seawolf' && swScenario && (
        <SeaWolfRun
          key={`sw-${runId}`}
          scenario={swScenario}
          durationSec={TIMING.seawolfSec}
          initialAids={config.aids}
          exam={config.exam}
          label={config.mode === 'full' ? 'Parte 2: Sea Wolf' : undefined}
          onFinish={(answers, aidsUsed, timedOut) => {
            const res = { scenario: swScenario, answers, aidsUsed, timedOut };
            setSeawolf(res);
            finishAll(redrock, res);
          }}
        />
      )}

      {screen === 'results' && (
        <Results
          mode={config.mode}
          redrock={redrock}
          seawolf={seawolf}
          savedTo={savedTo}
          onHome={() => go('home')}
          onStats={openStats}
          onRepeat={() => start(config)}
        />
      )}
    </div>
  );
}
