// Registro del proceso de cada partida. Todo se queda en local: los eventos se guardan en memoria
// y, al final de cada fase, se escriben en data/sesiones/<fecha>-<semilla>.json a través del servidor
// local de Vite. Si no hay servidor (versión estática), solo quedan en memoria para la corrección.

export interface Region {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RecEvent =
  | { t: number; k: 'move'; x: number; y: number }
  | { t: number; k: 'click'; x: number; y: number; target?: string }
  | { t: number; k: 'scroll'; y: number }
  | { t: number; k: 'hover'; target: string; ms: number }
  | { t: number; k: 'phase'; name: string; layout: Region[]; vw: number; vh: number; dw: number; dh: number }
  | { t: number; k: 'journal'; op: 'add' | 'remove'; id: string }
  | { t: number; k: 'start'; kind: string; item: string }
  | { t: number; k: 'decision'; kind: string; item: string; value: string; ms: number }
  | { t: number; k: 'change'; kind: string; item: string; from: string; to: string }
  | { t: number; k: 'answer'; kind: string; item: string; value: string }
  | { t: number; k: 'focus'; target: string }
  | { t: number; k: 'open' | 'close'; target: string }
  | { t: number; k: 'calc'; expr: string; result: string }
  | { t: number; k: 'idle'; ms: number; from: number };

export interface SessionMeta {
  id: string;
  mode: string;
  seed: string;
  difficulty: string;
  lang: string;
  exam: boolean;
  startedAt: string;
}

export interface SessionLog {
  meta: SessionMeta;
  events: RecEvent[];
}

const MOVE_EVERY_MS = 100;
const HOVER_MIN_MS = 300;
const IDLE_MS = 10_000;
const API = './api/sesiones';

/** Elemento rastreado más cercano (atributo data-track). */
function trackOf(el: EventTarget | null): string | undefined {
  const node = el instanceof Element ? el.closest('[data-track]') : null;
  return node?.getAttribute('data-track') ?? undefined;
}

class Recorder {
  private meta: SessionMeta | null = null;
  private t0 = 0;
  private events: RecEvent[] = [];
  private unsent = 0; // índice del primer evento aún no escrito en disco
  private lastMove = 0;
  private lastScroll = 0;
  private lastActivity = 0;
  private hoverTarget: string | undefined;
  private hoverSince = 0;
  private detach: (() => void) | null = null;
  private lastDecisionStart = new Map<string, number>();

  get active() {
    return this.meta !== null;
  }

  now() {
    return this.meta ? Math.round(performance.now() - this.t0) : 0;
  }

  start(meta: Omit<SessionMeta, 'id' | 'startedAt'>) {
    this.stopListening();
    const startedAt = new Date().toISOString();
    const stamp = startedAt.slice(0, 19).replace(/[:T]/g, '-');
    const safeSeed = meta.seed.replace(/[^A-Za-z0-9_-]/g, '');
    this.meta = { ...meta, id: `${stamp}-${safeSeed}`, startedAt };
    this.t0 = performance.now();
    this.events = [];
    this.unsent = 0;
    this.lastActivity = 0;
    this.lastDecisionStart.clear();
    if (typeof window !== 'undefined') this.listen();
  }

  private push(e: RecEvent) {
    if (this.meta) this.events.push(e);
  }

  private activity() {
    const t = this.now();
    if (t - this.lastActivity > IDLE_MS) this.push({ t, k: 'idle', ms: t - this.lastActivity, from: this.lastActivity });
    this.lastActivity = t;
  }

  private listen() {
    const onMove = (e: MouseEvent) => {
      const t = this.now();
      this.activity();
      if (t - this.lastMove >= MOVE_EVERY_MS) {
        this.lastMove = t;
        this.push({ t, k: 'move', x: Math.round(e.pageX), y: Math.round(e.pageY) });
      }
    };
    const onClick = (e: MouseEvent) => {
      this.activity();
      this.push({ t: this.now(), k: 'click', x: Math.round(e.pageX), y: Math.round(e.pageY), target: trackOf(e.target) });
    };
    const onScroll = () => {
      const t = this.now();
      this.activity();
      if (t - this.lastScroll >= MOVE_EVERY_MS) {
        this.lastScroll = t;
        this.push({ t, k: 'scroll', y: Math.round(window.scrollY) });
      }
    };
    const onKey = () => this.activity();
    const onOver = (e: PointerEvent) => {
      const target = trackOf(e.target);
      if (target === this.hoverTarget) return;
      this.endHover();
      this.hoverTarget = target;
      this.hoverSince = this.now();
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('click', onClick, { capture: true, passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKey, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    this.detach = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('click', onClick, { capture: true });
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerover', onOver);
    };
  }

  private endHover() {
    if (!this.hoverTarget) return;
    const ms = this.now() - this.hoverSince;
    if (ms >= HOVER_MIN_MS) this.push({ t: this.hoverSince, k: 'hover', target: this.hoverTarget, ms });
    this.hoverTarget = undefined;
  }

  private stopListening() {
    this.detach?.();
    this.detach = null;
  }

  /** Marca el inicio de una fase: guarda la disposición de la pantalla y escribe lo pendiente en disco. */
  phase(name: string) {
    if (!this.meta) return;
    this.endHover();
    // la disposición se captura tras pintar la nueva fase
    const capture = () => {
      const layout: Region[] = [];
      document.querySelectorAll('[data-region]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return;
        layout.push({ name: el.getAttribute('data-region')!, x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) });
      });
      this.push({
        t: this.now(),
        k: 'phase',
        name,
        layout,
        vw: window.innerWidth,
        vh: window.innerHeight,
        dw: document.documentElement.scrollWidth,
        dh: document.documentElement.scrollHeight,
      });
    };
    void this.flush();
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => requestAnimationFrame(capture));
    else capture();
  }

  /** Inicio de una decisión (para medir cuánto se tarda en decidir). */
  begin(kind: string, item: string) {
    const t = this.now();
    this.lastDecisionStart.set(`${kind}|${item}`, t);
    this.push({ t, k: 'start', kind, item });
  }

  decide(kind: string, item: string, value: string) {
    const t = this.now();
    const start = this.lastDecisionStart.get(`${kind}|${item}`) ?? t;
    this.push({ t, k: 'decision', kind, item, value, ms: t - start });
  }

  change(kind: string, item: string, from: string, to: string) {
    this.push({ t: this.now(), k: 'change', kind, item, from, to });
  }

  answer(kind: string, item: string, value: string) {
    this.push({ t: this.now(), k: 'answer', kind, item, value });
  }

  journal(op: 'add' | 'remove', id: string) {
    this.push({ t: this.now(), k: 'journal', op, id });
  }

  calc(expr: string, result: string) {
    this.push({ t: this.now(), k: 'calc', expr, result });
  }

  focus(target: string) {
    this.push({ t: this.now(), k: 'focus', target });
  }

  openClose(op: 'open' | 'close', target: string) {
    this.push({ t: this.now(), k: op, target });
  }

  private queue: Promise<boolean> = Promise.resolve(true);

  /** Escribe en disco los eventos pendientes (agrupados). Las escrituras se encadenan para no pisarse. */
  flush(): Promise<boolean> {
    if (!this.meta || this.unsent >= this.events.length) return this.queue;
    const batch = this.events.slice(this.unsent);
    this.unsent = this.events.length;
    const meta = this.meta;
    this.queue = this.queue.then(async () => {
      try {
        const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meta, events: batch }) });
        return r.ok;
      } catch {
        return false;
      }
    });
    return this.queue;
  }

  /** Termina la sesión: escribe lo pendiente y devuelve el registro completo para la corrección. */
  async finish(): Promise<{ log: SessionLog | null; savedToFile: boolean }> {
    if (!this.meta) return { log: null, savedToFile: false };
    this.endHover();
    const t = this.now();
    if (t - this.lastActivity > IDLE_MS) this.push({ t, k: 'idle', ms: t - this.lastActivity, from: this.lastActivity });
    this.stopListening();
    const saved = await this.flush();
    const log = { meta: this.meta, events: this.events };
    this.meta = null;
    return { log, savedToFile: saved };
  }

  /** Para tests: registro actual sin terminar. */
  snapshot(): SessionLog | null {
    return this.meta ? { meta: this.meta, events: this.events.slice() } : null;
  }
}

export const recorder = new Recorder();
