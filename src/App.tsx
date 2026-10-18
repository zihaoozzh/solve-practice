import { useEffect, useMemo, useState } from 'react';
import { Home, RunConfig } from './screens/Home';
import { RedrockRun } from './screens/RedrockRun';
import { SeaWolfRun } from './screens/SeaWolfRun';
import { RedrockRunResult, Results, SeaWolfRunResult } from './screens/Results';
import { Stats } from './screens/Stats';
import { generateRedrock, gradeCase } from './redrock';
import { generateSeaWolf } from './seawolf';
import { randomSeed } from './lib/rng';
import { addHistory, clearHistory, exportHistory, HistoryEntry, loadHistory, Mode, PhaseStat, Source } from './lib/history';
import { durationSec } from './config';
import { recorder, SessionLog } from './lib/recorder';
import type { FullAnalysis } from './analysis';
import { ClassicRunResult, Collected, evaluate, IslandRunResult } from './lib/evaluate';
import { AttemptRecord, clearReports, loadReport, loadSession, saveReport } from './lib/reports';
import { IslandRun } from './screens/IslandRun';
import { SflReview } from './screens/SflReview';
import { generateIsland } from './sfl/island';
import type { IslandDecision } from './sfl/islandGrade';
import { ClassicRun } from './screens/ClassicRun';
import { generateClassic } from './sfl/classic';
import type { SflDecisionView } from './screens/SflReview';

type Module = 'redrock' | 'seawolf' | 'sfl-island' | 'sfl-classic';

type Screen = 'home' | 'stats' | 'run' | 'interlude' | 'results';

const PLAN: Record<Mode, Module[]> = {
  redrock: ['redrock'],
  seawolf: ['seawolf'],
  full: ['redrock', 'seawolf'],
  full85: ['redrock', 'seawolf', 'sfl-classic'],
  full95: ['redrock', 'seawolf', 'sfl-island'],
  'sfl-island': ['sfl-island'],
  'sfl-classic': ['sfl-classic'],
};

const MODULE_LABEL: Record<Module, string> = { redrock: 'Redrock Study', seawolf: 'Sea Wolf', 'sfl-island': 'SFL Island', 'sfl-classic': 'SFL Classic' };

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [config, setConfig] = useState<RunConfig>({ mode: 'full', difficulty: 'normal', seed: '', aids: false, exam: false, lang: 'es' });
  const [runId, setRunId] = useState(0);
  const [step, setStep] = useState(0);
  const [redrock, setRedrock] = useState<RedrockRunResult | undefined>();
  const [seawolf, setSeawolf] = useState<SeaWolfRunResult | undefined>();
  const [island, setIsland] = useState<IslandRunResult | undefined>();
  const [islandDecisions, setIslandDecisions] = useState<IslandDecision[]>([]);
  const [classic, setClassic] = useState<ClassicRunResult | undefined>();
  const [classicDecisions, setClassicDecisions] = useState<SflDecisionView[]>([]);
  const [stats, setStats] = useState<{ entries: HistoryEntry[]; source: Source; file?: string } | null>(null);
  const [savedTo, setSavedTo] = useState<Source | null>(null);
  const [analysis, setAnalysis] = useState<FullAnalysis | undefined>();
  const [log, setLog] = useState<SessionLog | null>(null);
  const [sessionSaved, setSessionSaved] = useState<boolean | null>(null);
  const [previous, setPrevious] = useState<HistoryEntry[]>([]);
  /** Intento del historial cuyo informe se está viendo (null = el intento que acabas de terminar). */
  const [viewing, setViewing] = useState<HistoryEntry | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const plan = PLAN[config.mode];
  const current = plan[step];

  const rrScenario = useMemo(() => (config.seed && plan.includes('redrock') ? generateRedrock(config.seed, config.difficulty, config.lang) : null), [config, runId]);
  const swScenario = useMemo(() => (config.seed && plan.includes('seawolf') ? generateSeaWolf(config.seed, config.difficulty, config.lang) : null), [config, runId]);
  const clScenario = useMemo(() => (config.seed && plan.includes('sfl-classic') ? generateClassic(config.seed, config.difficulty, config.lang) : null), [config, runId]);
  const islScenario = useMemo(() => (config.seed && plan.includes('sfl-island') ? generateIsland(config.seed, config.difficulty, config.lang) : null), [config, runId]);

  const inRun = screen === 'run';
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
    setIsland(undefined);
    setIslandDecisions([]);
    setClassic(undefined);
    setClassicDecisions([]);
    setSavedTo(null);
    setAnalysis(undefined);
    setLog(null);
    setSessionSaved(null);
    setViewing(null);
    setStep(0);
    setRunId((x) => x + 1);
    recorder.start({ mode: c.mode, seed, difficulty: c.difficulty, lang: c.lang, exam: c.exam });
    go('run');
  };

  const openStats = async () => {
    setReportError(null);
    setStats(await loadHistory());
    go('stats');
  };

  /** Abre el informe completo de un intento del historial, recalculado con lo que se guardó al terminarlo. */
  const openReport = async (entry: HistoryEntry) => {
    setReportError(null);
    const rec = await loadReport(entry.id);
    if (!rec) {
      setReportError(`No se encuentra el informe del intento del ${new Date(entry.date).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}.`);
      return;
    }
    const sessionLog = await loadSession(rec.sessionId);
    const ev = evaluate(rec, sessionLog);
    setConfig(rec.config);
    setRedrock(rec.redrock);
    setSeawolf(rec.seawolf);
    setIsland(rec.island);
    setClassic(rec.classic);
    setAnalysis(ev.analysis);
    setIslandDecisions(ev.islGrade?.decisions ?? []);
    setClassicDecisions(ev.clGrade?.decisions ?? []);
    setLog(sessionLog);
    setSessionSaved(!!sessionLog);
    setPrevious((stats?.entries ?? []).filter((e) => e.mode === entry.mode && e.date < entry.date));
    setSavedTo(entry.report ?? null);
    setViewing(entry);
    go('results');
  };

  /** Pasa a la siguiente prueba del plan o termina la sesión. */
  const next = (got: Collected) => {
    if (step + 1 < plan.length) {
      recorder.phase('pausa');
      setStep(step + 1);
      go('interlude');
      return;
    }
    void finishAll({ redrock, seawolf, island, classic, ...got });
  };

  const finishAll = async ({ redrock: rr, seawolf: sw, island: isl, classic: cl }: Collected) => {
    const { log: sessionLog, savedToFile } = await recorder.finish();
    const prev = (await loadHistory()).entries.filter((e) => e.mode === config.mode);
    const { analysis: a, islGrade, clGrade } = evaluate({ redrock: rr, seawolf: sw, island: isl, classic: cl }, sessionLog);
    const phases: PhaseStat[] = [];
    if (rr) {
      const part = (k: string) => a.games.find((g) => g.game === 'redrock')!.parts.find((p) => p.key === k)!;
      const ph = (key: string, name: string, timeSec: number, pk: string) => {
        const p = part(pk);
        phases.push({ key, name, timeSec, score: Math.round((p.earned / p.max) * 100), correct: p.earned, total: p.max });
      };
      ph('investigacion', 'Investigación', rr.times.investigation, 'journal');
      ph('analisis', 'Análisis', rr.times.analysis, 'analysis');
      ph('informe', 'Informe', rr.times.report, 'report');
      ph('casos', 'Mini-casos', rr.times.cases, 'cases');
    }
    if (sw) {
      const g = a.games.find((x) => x.game === 'seawolf')!;
      sw.scenario.zones.forEach((_, i) => {
        const ps = g.parts.filter((p) => p.key.startsWith(`sw${i}-`));
        const earned = ps.reduce((s, p) => s + p.earned, 0);
        phases.push({ key: `zona-${i + 1}`, name: `Sitio ${i + 1}`, timeSec: sw.answers[i].timeSec, score: Math.round(earned), correct: earned, total: 100 });
      });
    }
    if (isl && islGrade) {
      const ob = islGrade.rubric.parts.find((p) => p.key === 'isl-onboarding')!;
      phases.push({ key: 'sfl-onboarding', name: 'SFL onboarding', timeSec: isl.onboarding.timeSec, score: Math.round((ob.earned / ob.max) * 100), correct: ob.earned, total: ob.max });
      isl.answers.forEach((ans, d) => {
        const ps = islGrade!.rubric.parts.filter((p) => p.key.startsWith(`isl${d}-`));
        const earned = Math.round(ps.reduce((s, p) => s + p.earned, 0) * 10) / 10;
        phases.push({ key: `sfl-dia-${d + 1}`, name: `SFL día ${d + 1}`, timeSec: ans.timeSec, score: Math.round(earned), correct: earned, total: 100 });
      });
    }
    // Partes agregadas por tipo (Sea Wolf suma los 3 sitios) para la evolución
    const parts: NonNullable<HistoryEntry['parts']> = [];
    for (const g of a.games)
      for (const p of g.parts) {
        // Sea Wolf y SFL Island suman sus sitios o días por tipo de parte
        const grouped = g.game === 'seawolf' || g.game === 'sfl-island';
        const key = grouped ? `${g.game}-${p.key.split('-')[1]}` : `${g.game}-${p.key}`;
        const label = grouped ? `${g.label} · ${p.label.split(' · ')[1]}` : `${g.label} · ${p.label}`;
        const cur = parts.find((x) => x.key === key);
        if (cur) {
          cur.earned = Math.round((cur.earned + p.earned) * 10) / 10;
          cur.max += p.max;
        } else parts.push({ key, label, earned: p.earned, max: p.max });
      }
    const detail: HistoryEntry['detail'] = {};
    if (rr) {
      detail.caseTypes = {};
      for (const c of rr.scenario.cases) {
        const cur = detail.caseTypes[c.type] ?? { correct: 0, total: 0 };
        cur.total++;
        if (gradeCase(c, rr.answers.cases[c.id])) cur.correct++;
        detail.caseTypes[c.type] = cur;
      }
    }
    if (cl && clGrade) {
      const g = clGrade.rubric;
      g.parts.forEach((p) => {
        const sec = p.key === 'cl-ranking' ? (cl.answers.timeSec.briefing ?? 0) + (cl.answers.timeSec.ranking ?? 0) : Object.entries(cl.answers.timeSec).filter(([k]) => k.startsWith('d')).reduce((s, [, v]) => s + v, 0);
        phases.push({ key: `sfl-c-${p.key}`, name: `SFL Classic · ${p.label}`, timeSec: sec, score: Math.round((p.earned / p.max) * 100), correct: p.earned, total: p.max });
      });
    }
    if (rr?.timedOut || sw?.timedOut || isl?.timedOut || cl?.timedOut) detail.timedOut = true;
    const entry: HistoryEntry = {
      id: `${Date.now()}`,
      date: new Date().toISOString(),
      mode: config.mode,
      difficulty: config.difficulty,
      seed: config.seed,
      score: Math.round(a.overall.scorePct),
      scorePct: a.overall.scorePct,
      phases,
      parts,
      errors: a.errors,
      aids: sw?.aidsUsed,
      exam: config.exam,
      lang: config.lang,
      detail,
    };
    setAnalysis(a);
    setIslandDecisions(islGrade?.decisions ?? []);
    setClassicDecisions(clGrade?.decisions ?? []);
    setLog(sessionLog);
    setSessionSaved(savedToFile);
    setPrevious(prev);
    // El informe completo se guarda aparte para poder reabrirlo desde el historial
    const rec: AttemptRecord = {
      version: 1,
      id: entry.id,
      date: entry.date,
      config: { mode: config.mode, difficulty: config.difficulty, seed: config.seed, aids: config.aids, exam: config.exam, lang: config.lang },
      sessionId: savedToFile ? sessionLog?.meta.id : undefined,
      redrock: rr,
      seawolf: sw,
      island: isl,
      classic: cl,
    };
    saveReport(rec)
      .then((where) => addHistory({ ...entry, session: rec.sessionId, report: where ?? undefined }))
      .then(setSavedTo);
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
          onOpenReport={openReport}
          reportError={reportError}
          onClear={async () => {
            await clearHistory();
            await clearReports();
            setStats(await loadHistory());
          }}
        />
      )}

      {screen === 'run' && current === 'redrock' && rrScenario && (
        <RedrockRun
          key={`rr-${runId}`}
          scenario={rrScenario}
          durationSec={durationSec('redrock')}
          exam={config.exam}
          label={plan.length > 1 ? `Parte ${step + 1}: Redrock Study` : undefined}
          onFinish={(answers, times, timedOut) => {
            const res = { scenario: rrScenario, answers, times, timedOut };
            setRedrock(res);
            next({ redrock: res });
          }}
        />
      )}

      {screen === 'run' && current === 'seawolf' && swScenario && (
        <SeaWolfRun
          key={`sw-${runId}`}
          scenario={swScenario}
          durationSec={durationSec('seawolf')}
          initialAids={config.aids}
          exam={config.exam}
          label={plan.length > 1 ? `Parte ${step + 1}: Sea Wolf` : undefined}
          onFinish={(answers, aidsUsed, timedOut) => {
            const res = { scenario: swScenario, answers, aidsUsed, timedOut };
            setSeawolf(res);
            next({ seawolf: res });
          }}
        />
      )}

      {screen === 'run' && current === 'sfl-island' && islScenario && (
        <IslandRun
          key={`isl-${runId}`}
          scenario={islScenario}
          durationSec={durationSec('sfl-island')}
          exam={config.exam}
          label={plan.length > 1 ? `Parte ${step + 1}: SFL Island` : undefined}
          onFinish={(answers, timedOut, onboarding) => {
            const res = { scenario: islScenario, answers, onboarding, timedOut };
            setIsland(res);
            next({ island: res });
          }}
        />
      )}

      {screen === 'run' && current === 'sfl-classic' && clScenario && (
        <ClassicRun
          key={`cl-${runId}`}
          scenario={clScenario}
          durationSec={durationSec('sfl-classic')}
          exam={config.exam}
          label={plan.length > 1 ? `Parte ${step + 1}: SFL Classic` : undefined}
          onFinish={(answers, timedOut) => {
            const res = { scenario: clScenario, answers, timedOut };
            setClassic(res);
            next({ classic: res });
          }}
        />
      )}

      {screen === 'interlude' && (
        <div className="interlude card">
          <div className="q-num">
            Parte {step} de {plan.length} terminada
          </div>
          <h1>Siguiente: {MODULE_LABEL[plan[step]]}</h1>
          <p>
            Igual que en la prueba real, entre juegos vuelves al menú de tareas: el tiempo sobrante no pasa a la siguiente prueba. La corrección aparecerá al final, junto
            con el resto. Empieza cuando estés listo ({Math.round(durationSec(plan[step]) / 60) || 1} min).
          </p>
          <button type="button" className="btn primary big" onClick={() => go('run')}>
            Empezar {MODULE_LABEL[plan[step]]} →
          </button>
        </div>
      )}

      {screen === 'results' && (
        <Results
          mode={config.mode}
          redrock={redrock}
          seawolf={seawolf}
          savedTo={savedTo}
          analysis={analysis}
          log={log}
          sessionSaved={sessionSaved}
          previous={previous}
          fromHistory={viewing?.date}
          extraReview={
            <>
              {island && islandDecisions.length > 0 && <SflReview title="SFL Island" decisions={islandDecisions} days={island.scenario.days.length} />}
              {classic && classicDecisions.length > 0 && <SflReview title="SFL Classic" decisions={classicDecisions} days={1} />}
            </>
          }
          onHome={() => go('home')}
          onStats={openStats}
          onRepeat={() => start(config)}
        />
      )}
    </div>
  );
}
