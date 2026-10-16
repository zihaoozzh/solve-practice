import { useRef, useState } from 'react';
import { ConfirmButton, TraitIcon, TraitTag } from '../components/ui';
import { TimerBadge, useCountdown } from '../components/Timer';
import { fmtTime } from '../lib/format';
import { LIST_MAX, Microbe, PICK, SeaWolfScenario, Zone, ZoneAnswer, zoneMicrobes } from '../seawolf';

interface Props {
  scenario: SeaWolfScenario;
  durationSec: number;
  initialAids: boolean;
  label?: string;
  onFinish: (answers: ZoneAnswer[], aidsUsed: boolean, timedOut: boolean) => void;
}

type Stage = { kind: 'wave'; wave: number } | { kind: 'select' };

export function SeaWolfRun({ scenario, durationSec, initialAids, label, onFinish }: Props) {
  const [zoneIdx, setZoneIdx] = useState(0);
  const [stage, setStage] = useState<Stage>({ kind: 'wave', wave: 0 });
  const [list, setList] = useState<string[]>([]);
  const [savedEver, setSavedEver] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [aids, setAids] = useState(initialAids);
  const [aidsUsed, setAidsUsed] = useState(initialAids);
  const [done, setDone] = useState<ZoneAnswer[]>([]);
  const zoneStart = useRef(Date.now());
  const finished = useRef(false);
  const state = useRef({ zoneIdx, list, savedEver, selected, done, aidsUsed });
  state.current = { zoneIdx, list, savedEver, selected, done, aidsUsed };

  const finishAll = (answers: ZoneAnswer[], timedOut: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onFinish(answers, state.current.aidsUsed, timedOut);
  };

  const { remaining, now } = useCountdown(durationSec, () => {
    const s = state.current;
    const answers = s.done.slice();
    answers.push({ saved: s.savedEver, selected: s.selected, timeSec: (Date.now() - zoneStart.current) / 1000, completed: false });
    while (answers.length < scenario.zones.length) answers.push({ saved: [], selected: [], timeSec: 0, completed: false });
    finishAll(answers, true);
  });

  const zone = scenario.zones[zoneIdx];
  const byId = new Map(zoneMicrobes(zone).map((m) => [m.id, m]));
  const zoneElapsed = (now - zoneStart.current) / 1000;

  const toggleSave = (id: string) => {
    if (list.includes(id)) {
      setList(list.filter((x) => x !== id));
      return;
    }
    if (list.length >= LIST_MAX) return;
    setList([...list, id]);
    if (!savedEver.includes(id)) setSavedEver([...savedEver, id]);
  };
  const toggleSelect = (id: string) => {
    if (selected.includes(id)) setSelected(selected.filter((x) => x !== id));
    else if (selected.length < PICK) setSelected([...selected, id]);
  };

  const confirmZone = () => {
    const ans: ZoneAnswer = { saved: savedEver, selected, timeSec: (Date.now() - zoneStart.current) / 1000, completed: true };
    const all = [...done, ans];
    if (zoneIdx === scenario.zones.length - 1) {
      finishAll(all, false);
      return;
    }
    setDone(all);
    setZoneIdx(zoneIdx + 1);
    setStage({ kind: 'wave', wave: 0 });
    setList([]);
    setSavedEver([]);
    setSelected([]);
    zoneStart.current = Date.now();
    window.scrollTo(0, 0);
  };

  const currentWave = stage.kind === 'wave' ? zone.waves[stage.wave] : [];

  return (
    <div className="run seawolf">
      <header className="run-header">
        <div className="run-title">
          <span className="brand-dot sea" /> {label ?? 'Sea Wolf'}
          <span className="seed-chip">semilla {scenario.seed} · {scenario.difficulty === 'hard' ? 'Difícil' : 'Normal'}</span>
        </div>
        <ol className="stepper">
          {scenario.zones.map((_, i) => (
            <li key={i} className={i === zoneIdx ? 'active' : i < zoneIdx ? 'done' : ''}>
              Zona {i + 1}
            </li>
          ))}
        </ol>
        <div className="guide">
          <span className={zoneElapsed > zone.suggestedMin * 60 ? 'over' : ''}>
            Zona {fmtTime(zoneElapsed)} / ≈{zone.suggestedMin}:00
          </span>
          <label className="switch">
            <input
              type="checkbox"
              checked={aids}
              onChange={(e) => {
                setAids(e.target.checked);
                if (e.target.checked) setAidsUsed(true);
              }}
            />
            Ayudas de práctica
          </label>
        </div>
        <TimerBadge remaining={remaining} total={durationSec} />
      </header>

      <div className="layout">
        <main className="main">
          <ZoneBrief zone={zone} aids={aids} />

          {stage.kind === 'wave' && (
            <>
              <div className="wave-head">
                <h2>
                  Oleada {stage.wave + 1} de 3 <span className="muted">· llegan {currentWave.length} microbios</span>
                </h2>
                <p className="hint">
                  Guarda los candidatos que quieras conservar (lista máx. {LIST_MAX}). Al pasar a la siguiente oleada, los no guardados se pierden.
                </p>
              </div>
              <div className="microbe-grid">
                {currentWave.map((m) => (
                  <MicrobeCard
                    key={m.id}
                    m={m}
                    zone={zone}
                    action={
                      <button
                        type="button"
                        className={`btn small ${list.includes(m.id) ? 'saved' : 'outline'}`}
                        disabled={!list.includes(m.id) && list.length >= LIST_MAX}
                        onClick={() => toggleSave(m.id)}
                        aria-label={`${list.includes(m.id) ? 'Quitar' : 'Guardar'} ${m.name}`}
                      >
                        {list.includes(m.id) ? '✓ Guardado' : 'Guardar'}
                      </button>
                    }
                    highlight={list.includes(m.id)}
                  />
                ))}
              </div>
              <div className="actions">
                <ConfirmButton
                  warning={stage.wave < 2 ? 'Los microbios no guardados de esta oleada se perderán.' : 'Pasarás a la selección final con tu lista.'}
                  onConfirm={() => {
                    setStage(stage.wave < 2 ? { kind: 'wave', wave: stage.wave + 1 } : { kind: 'select' });
                    window.scrollTo(0, 0);
                  }}
                >
                  {stage.wave < 2 ? `Siguiente oleada (${stage.wave + 2}/3) →` : 'Ir a la selección final →'}
                </ConfirmButton>
              </div>
            </>
          )}

          {stage.kind === 'select' && (
            <>
              <div className="wave-head">
                <h2>Selección final</h2>
                <p className="hint">Elige exactamente {PICK} microbios de tu lista y confirma el tratamiento.</p>
              </div>
              {list.length === 0 && <div className="card">No guardaste ningún candidato. Confirma para pasar a la siguiente zona.</div>}
              <div className="microbe-grid">
                {list.map((id) => {
                  const m = byId.get(id)!;
                  const on = selected.includes(id);
                  return (
                    <MicrobeCard
                      key={id}
                      m={m}
                      zone={zone}
                      highlight={on}
                      action={
                        <button type="button" className={`btn small ${on ? 'saved' : 'outline'}`} disabled={!on && selected.length >= PICK} onClick={() => toggleSelect(id)} aria-label={`${on ? 'Quitar' : 'Elegir'} ${m.name}`}>
                          {on ? '✓ Elegido' : 'Elegir'}
                        </button>
                      }
                    />
                  );
                })}
              </div>
              {aids && <AidsPanel zone={zone} picks={selected.map((id) => byId.get(id)!)} />}
              <div className="actions">
                <ConfirmButton
                  disabled={selected.length !== PICK && list.length >= PICK}
                  warning={zoneIdx < scenario.zones.length - 1 ? 'Confirmarás el tratamiento y pasarás a la siguiente zona.' : 'Confirmarás el tratamiento y terminarás Sea Wolf.'}
                  onConfirm={confirmZone}
                >
                  Confirmar tratamiento ({selected.length}/{PICK})
                </ConfirmButton>
              </div>
            </>
          )}
        </main>

        <aside className="side">
          <div className="panel">
            <div className="panel-title">
              Lista de candidatos <span className="count">{list.length}/{LIST_MAX}</span>
            </div>
            {list.length === 0 && <div className="muted small">Vacía.</div>}
            {list.map((id) => {
              const m = byId.get(id)!;
              return (
                <div key={id} className="list-entry">
                  <div>
                    <div className="list-name">{m.name}</div>
                    <div className="list-attrs">
                      {m.attrs.map((a, i) => (
                        <span key={i} title={zone.attributes[i]}>
                          {abbr(zone.attributes[i])} {a}
                        </span>
                      ))}
                      {m.traits.map((t) => (
                        <TraitIcon key={t} trait={t} size={14} />
                      ))}
                    </div>
                  </div>
                  {stage.kind === 'wave' && (
                    <button type="button" className="icon-btn" onClick={() => toggleSave(id)} aria-label={`Quitar ${m.name}`}>
                      ×
                    </button>
                  )}
                </div>
              );
            })}
            {stage.kind === 'wave' && <div className="muted small note">Quitar un microbio de una oleada anterior lo descarta para siempre.</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function abbr(attr: string) {
  return attr
    .split(' ')
    .filter((w) => !['de', 'a', 'la', 'al', 'el'].includes(w))
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function ZoneBrief({ zone, aids }: { zone: Zone; aids: boolean }) {
  return (
    <div className="zone-brief card">
      <div className="zone-head">
        <div>
          <div className="q-num">Zona {zone.index + 1}</div>
          <h2 className="zone-name">{zone.name}</h2>
          <div className="muted">{zone.description}</div>
        </div>
        <div className="rules-traits">
          <div>
            <div className="rule-label">Requerido (al menos uno)</div>
            <TraitTag trait={zone.required} tone="req" />
          </div>
          <div>
            <div className="rule-label">Prohibido (ninguno)</div>
            <TraitTag trait={zone.prohibited} tone="proh" />
          </div>
        </div>
      </div>
      <div className="ranges">
        {zone.attributes.map((a, i) => (
          <div key={a} className="range">
            <div className="range-label">{a}</div>
            <RangeBar lo={zone.ranges[i][0]} hi={zone.ranges[i][1]} />
            <div className="range-text">
              Media objetivo {zone.ranges[i][0]}–{zone.ranges[i][1]}
              {aids && <span className="aid"> · suma {zone.ranges[i][0] * 3}–{zone.ranges[i][1] * 3}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RangeBar({ lo, hi }: { lo: number; hi: number }) {
  return (
    <div className="range-bar">
      <div className="range-fill" style={{ left: `${((lo - 1) / 9) * 100}%`, width: `${((hi - lo) / 9) * 100}%` }} />
      <span className="range-min">1</span>
      <span className="range-max">10</span>
    </div>
  );
}

function MicrobeCard({ m, zone, action, highlight }: { m: Microbe; zone: Zone; action: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`microbe ${highlight ? 'highlight' : ''}`}>
      <div className="microbe-head">
        <span className="microbe-name">{m.name}</span>
        {action}
      </div>
      {zone.attributes.map((a, i) => (
        <div key={a} className="attr-row">
          <span className="attr-label">{a}</span>
          <div className="attr-bar">
            <div style={{ width: `${m.attrs[i] * 10}%` }} />
          </div>
          <span className="attr-value">{m.attrs[i]}</span>
        </div>
      ))}
      <div className="microbe-traits">
        {m.traits.length === 0 && <span className="muted small">Sin rasgos especiales</span>}
        {m.traits.map((t) => (
          <TraitTag key={t} trait={t} />
        ))}
      </div>
    </div>
  );
}

function AidsPanel({ zone, picks }: { zone: Zone; picks: Microbe[] }) {
  return (
    <div className="card aids">
      <div className="panel-title">Ayudas de práctica: sumas parciales de tu selección</div>
      <table>
        <thead>
          <tr>
            <th>Atributo</th>
            <th>Suma actual</th>
            <th>Suma objetivo (3 microbios)</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {zone.attributes.map((a, i) => {
            const sum = picks.reduce((s, m) => s + m.attrs[i], 0);
            const lo = zone.ranges[i][0] * 3;
            const hi = zone.ranges[i][1] * 3;
            const ok = picks.length === 3 && sum >= lo && sum <= hi;
            return (
              <tr key={a}>
                <td>{a}</td>
                <td className="num">{sum}</td>
                <td className="num">
                  {lo}–{hi}
                </td>
                <td>{picks.length < 3 ? `faltan ${3 - picks.length}` : ok ? '✓' : '✗'}</td>
              </tr>
            );
          })}
          <tr>
            <td>Rasgo requerido</td>
            <td colSpan={2}>{picks.some((m) => m.traits.includes(zone.required)) ? 'presente' : 'ausente'}</td>
            <td>{picks.some((m) => m.traits.includes(zone.required)) ? '✓' : '✗'}</td>
          </tr>
          <tr>
            <td>Rasgo prohibido</td>
            <td colSpan={2}>{picks.some((m) => m.traits.includes(zone.prohibited)) ? 'presente' : 'ausente'}</td>
            <td>{picks.some((m) => m.traits.includes(zone.prohibited)) ? '✗' : '✓'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
