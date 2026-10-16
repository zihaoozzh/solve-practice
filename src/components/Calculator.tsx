import { useRef } from 'react';

export interface CalcHistoryItem {
  expr: string;
  result: string;
}

/** Evaluador seguro de expresiones básicas (+ − × ÷ y paréntesis), como la calculadora de la prueba. Sin eval. */
export function evaluate(expr: string): number {
  const src = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '').replace(/\s+/g, '');
  let i = 0;
  const peek = () => src[i];
  const parseExpr = (): number => {
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = src[i++];
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const parseTerm = (): number => {
    let v = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = src[i++];
      const r = parseFactor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const parseFactor = (): number => {
    if (peek() === '-') {
      i++;
      return -parseFactor();
    }
    if (peek() === '+') {
      i++;
      return parseFactor();
    }
    let v: number;
    if (peek() === '(') {
      i++;
      v = parseExpr();
      if (peek() !== ')') throw new Error('Falta )');
      i++;
    } else {
      const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new Error('Número esperado');
      i += m[0].length;
      v = Number(m[0]);
    }
    return v;
  };
  const out = parseExpr();
  if (i !== src.length) throw new Error('Expresión no válida');
  if (!Number.isFinite(out)) throw new Error('Resultado no finito');
  return out;
}

export function formatResult(v: number): string {
  return String(Math.round(v * 1e8) / 1e8);
}

interface Props {
  expr: string;
  setExpr: (s: string) => void;
  history: CalcHistoryItem[];
  setHistory: (h: CalcHistoryItem[]) => void;
  /** Guarda el último resultado en el diario (los cálculos se guardan en el journal en la prueba real). */
  onSave?: (item: CalcHistoryItem) => void;
  labels?: { title: string; history: string; clear: string; save: string };
}

// Calculadora básica: sin potencias ni porcentaje (según las fuentes sobre la prueba real).
const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '(', '+', ')', '⌫'];

export function Calculator({ expr, setExpr, history, setHistory, onSave, labels = { title: 'Calculadora', history: 'Historial', clear: 'borrar', save: 'Guardar en el diario' } }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  let preview = '';
  try {
    preview = expr.trim() ? formatResult(evaluate(expr)) : '';
  } catch {
    preview = '';
  }

  const press = (k: string) => {
    if (k === '⌫') setExpr(expr.slice(0, -1));
    else setExpr(expr + k);
    inputRef.current?.focus();
  };
  const compute = () => {
    try {
      const r = formatResult(evaluate(expr));
      setHistory([{ expr, result: r }, ...history].slice(0, 30));
      setExpr(r);
    } catch {
      /* expresión incompleta: no hacemos nada */
    }
  };

  return (
    <div className="calc">
      <div className="panel-title">{labels.title}</div>
      <input
        ref={inputRef}
        className="calc-input"
        value={expr}
        placeholder="(2770-1940)/1940*100"
        onChange={(e) => setExpr(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') compute();
          if (e.key === 'Escape') setExpr('');
        }}
        aria-label="Expresión de la calculadora"
      />
      <div className="calc-preview">{preview && preview !== expr ? `= ${preview}` : ' '}</div>
      <div className="calc-keys">
        {KEYS.map((k) => (
          <button key={k} type="button" className="calc-key" onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <button type="button" className="calc-key clear" onClick={() => setExpr('')}>
          C
        </button>
        <button type="button" className="calc-key eq" onClick={compute}>
          =
        </button>
      </div>
      {onSave && history.length > 0 && (
        <button type="button" className="btn small outline calc-save" onClick={() => onSave(history[0])}>
          {labels.save}: {history[0].result}
        </button>
      )}
      {history.length > 0 && (
        <div className="calc-history">
          <div className="calc-history-head">
            <span>{labels.history}</span>
            <button type="button" className="link-btn" onClick={() => setHistory([])}>
              {labels.clear}
            </button>
          </div>
          {history.map((h, i) => (
            <button key={i} type="button" className="calc-history-item" title="Insertar resultado" onClick={() => setExpr(expr + h.result)}>
              <span className="muted">{h.expr} =</span> <strong>{h.result}</strong>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
