// Historial de intentos. Con `npm run dev` / `npm run preview` se guarda en data/intentos.json
// (fichero local del proyecto). Si ese servidor no está disponible (versión estática), se usa el navegador.

export type Mode = 'redrock' | 'seawolf' | 'full' | 'full95' | 'sfl-island' | 'sfl-classic';
export type Lang = 'es' | 'en';

export interface PhaseStat {
  key: string;
  name: string;
  timeSec: number;
  correct?: number;
  total?: number;
  score?: number;
}

export interface HistoryEntry {
  id: string;
  date: string;
  mode: Mode;
  difficulty: 'normal' | 'hard';
  seed: string;
  score: number;
  phases: PhaseStat[];
  aids?: boolean;
  exam?: boolean;
  lang?: Lang;
  /** Puntos por parte según la rúbrica (para la evolución). */
  parts?: { key: string; label: string; earned: number; max: number }[];
  /** Nota global con un decimal (rúbrica). */
  scorePct?: number;
  /** Frecuencia de cada tipo de error en este intento. */
  errors?: Record<string, number>;
  detail?: {
    journalPrecision?: number;
    caseTypes?: Record<string, { correct: number; total: number }>;
    validZones?: number;
    timedOut?: boolean;
  };
}

export type Source = 'file' | 'browser';

const KEY = 'solve-practice-history-v1';
const API = './api/intentos';

function loadLocal(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalize) : [];
  } catch {
    return [];
  }
}

function saveLocal(all: HistoryEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, 500)));
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Compatibilidad con el formato antiguo (fases sin clave). */
function normalize(e: HistoryEntry): HistoryEntry {
  return {
    ...e,
    phases: (e.phases ?? []).map((p) => ({ ...p, key: p.key ?? p.name.toLowerCase() })),
  };
}

const newestFirst = (a: HistoryEntry, b: HistoryEntry) => b.date.localeCompare(a.date);

async function fetchFile(): Promise<{ attempts: HistoryEntry[]; file: string } | null> {
  try {
    const r = await fetch(API, { headers: { Accept: 'application/json' } });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('application/json')) return null;
    const body = await r.json();
    return Array.isArray(body?.attempts) ? { attempts: body.attempts.map(normalize), file: body.file } : null;
  } catch {
    return null;
  }
}

export async function loadHistory(): Promise<{ entries: HistoryEntry[]; source: Source; file?: string }> {
  const local = loadLocal();
  const remote = await fetchFile();
  if (!remote) return { entries: local.sort(newestFirst), source: 'browser' };
  // Une lo que hubiera solo en el navegador (p. ej. intentos antiguos) con el fichero.
  const ids = new Set(remote.attempts.map((a) => a.id));
  const missing = local.filter((a) => !ids.has(a.id));
  const all = [...remote.attempts, ...missing].sort(newestFirst);
  if (missing.length) await putAll(all);
  saveLocal(all);
  return { entries: all, source: 'file', file: remote.file };
}

async function putAll(all: HistoryEntry[]): Promise<boolean> {
  try {
    const r = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(all) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function addHistory(e: HistoryEntry): Promise<Source> {
  saveLocal([e, ...loadLocal().filter((x) => x.id !== e.id)].sort(newestFirst));
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e) });
    return r.ok ? 'file' : 'browser';
  } catch {
    return 'browser';
  }
}

export async function clearHistory(): Promise<void> {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignorar */
  }
  await putAll([]);
}

/** Descarga el historial como JSON (útil en la versión estática). */
export function exportHistory(entries: HistoryEntry[]) {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `intentos-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export const MODE_LABEL: Record<Mode, string> = {
  redrock: 'Redrock',
  seawolf: 'Sea Wolf',
  full: 'Simulación 65 min',
  full95: 'Simulación 95 min',
  'sfl-island': 'SFL Island',
  'sfl-classic': 'SFL Classic',
};
