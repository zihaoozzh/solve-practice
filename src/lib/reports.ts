// Informes completos de cada intento, para volver a abrirlos desde el historial.
// Se guarda lo necesario para recalcular el informe (escenarios generados, respuestas y tiempos) en
// data/informes/<id>.json; el registro del ratón y los clics ya está en data/sesiones/<sesión>.json.
// Sin servidor local (versión estática) se usa el navegador, que tiene poco espacio: si no cabe, no se guarda.

import type { Collected } from './evaluate';
import type { Mode, Lang } from './history';
import type { SessionLog } from './recorder';

export interface AttemptRecord extends Collected {
  version: 1;
  /** Mismo id que la entrada del historial. */
  id: string;
  date: string;
  config: { mode: Mode; difficulty: 'normal' | 'hard'; seed: string; aids: boolean; exam: boolean; lang: Lang };
  /** Id del registro del proceso en data/sesiones/ (si se guardó). */
  sessionId?: string;
}

const REPORTS_API = './api/informes';
const SESSIONS_API = './api/sesiones';
const LOCAL_PREFIX = 'solve-practice-report-v1:';

const safeId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '');

function saveLocal(rec: AttemptRecord): boolean {
  try {
    localStorage.setItem(LOCAL_PREFIX + rec.id, JSON.stringify(rec));
    return true;
  } catch {
    return false;
  }
}

/** Guarda el informe. Devuelve dónde quedó: en fichero, en el navegador o en ningún sitio. */
export async function saveReport(rec: AttemptRecord): Promise<'file' | 'browser' | null> {
  try {
    const r = await fetch(REPORTS_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec) });
    if (r.ok) return 'file';
  } catch {
    /* sin servidor local */
  }
  return saveLocal(rec) ? 'browser' : null;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('application/json')) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function loadReport(id: string): Promise<AttemptRecord | null> {
  const fromFile = await getJson<AttemptRecord>(`${REPORTS_API}?id=${encodeURIComponent(safeId(id))}`);
  if (fromFile?.version === 1) return fromFile;
  try {
    const raw = localStorage.getItem(LOCAL_PREFIX + id);
    const parsed = raw ? (JSON.parse(raw) as AttemptRecord) : null;
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

/** Registro del proceso (ratón, clics, decisiones) de una sesión guardada en data/sesiones/. */
export async function loadSession(sessionId: string | undefined): Promise<SessionLog | null> {
  if (!sessionId) return null;
  const log = await getJson<SessionLog>(`${SESSIONS_API}?id=${encodeURIComponent(safeId(sessionId))}`);
  return log && Array.isArray(log.events) ? log : null;
}

/** Borra todos los informes (al borrar el historial). */
export async function clearReports(): Promise<void> {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(LOCAL_PREFIX)) localStorage.removeItem(k);
  } catch {
    /* ignorar */
  }
  try {
    await fetch(REPORTS_API, { method: 'DELETE' });
  } catch {
    /* sin servidor local */
  }
}
