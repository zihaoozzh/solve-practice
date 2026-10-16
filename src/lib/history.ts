export type Mode = 'redrock' | 'seawolf' | 'full';

export interface HistoryEntry {
  id: string;
  date: string;
  mode: Mode;
  difficulty: 'normal' | 'hard';
  seed: string;
  score: number;
  phases: { name: string; timeSec: number; score?: number }[];
  aids?: boolean;
}

const KEY = 'solve-practice-history-v1';

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addHistory(e: HistoryEntry): void {
  try {
    const all = [e, ...loadHistory().filter((x) => x.id !== e.id)].slice(0, 200);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* almacenamiento no disponible */
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignorar */
  }
}

export const MODE_LABEL: Record<Mode, string> = {
  redrock: 'Redrock',
  seawolf: 'Sea Wolf',
  full: 'Simulación completa',
};
