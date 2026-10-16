import { describe, expect, it } from 'vitest';
import {
  bestAssignments,
  beliefCore,
  dayKeyQuestions,
  effectiveWorkload,
  emptyIslandDay,
  generateIsland,
  IslandDayAnswer,
  IslandScenario,
  reflectTruth,
  validateIsland,
} from '../src/sfl/island';
import { gradeIsland, islandPatterns } from '../src/sfl/islandGrade';
import { overall, T } from '../src/analysis/rubric';
import {
  ClassicAnswers,
  ClassicScenario,
  classicPatterns,
  emptyClassic,
  generateClassic,
  gradeClassic,
  validateClassic,
  variantFor,
} from '../src/sfl/classic';

/** Juega un día "como un experto": pregunta lo clave, asigna lo óptimo, mejores respuestas, urgente primero, reflexión exacta. */
function perfectPlay(sc: IslandScenario): IslandDayAnswer[] {
  const ans: IslandDayAnswer[] = [];
  sc.days.forEach((day, d) => {
    const a = emptyIslandDay(sc, d);
    a.asked = dayKeyQuestions(day);
    a.askedAt = a.asked.map(() => 40);
    a.assign = { ...day.optimum };
    for (const [rid, rs] of Object.entries(day.reasons)) a.reasons[rid] = rs[0];
    const urgent = day.support.find((r) => r.urgent)!;
    a.supportOrder = [urgent.id, ...day.support.filter((r) => !r.urgent).map((r) => r.id)];
    for (const r of day.support) a.support[r.id] = r.options.findIndex((o) => o.quality === 'best');
    ans.push(a);
    for (const r of sc.researchers) a.reflect[r.id] = reflectTruth(sc, ans, d, r.id);
  });
  return ans;
}

describe('SFL Island: generador y validador', () => {
  it('es determinista y no depende del idioma', () => {
    const a = generateIsland('X1', 'normal', 'es');
    const b = generateIsland('X1', 'normal', 'es');
    const c = generateIsland('X1', 'normal', 'en');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    a.days.forEach((d, i) => {
      expect(c.days[i].optimum).toEqual(d.optimum);
      expect(c.days[i].keyFacts.map((f) => f.fact)).toEqual(d.keyFacts.map((f) => f.fact));
    });
  });

  it('cada día tiene una mejor asignación clara, distinta de la de los cargos y alcanzable con el presupuesto', () => {
    for (let i = 0; i < 40; i++) {
      const sc = generateIsland(`v${i}`, i % 2 ? 'hard' : 'normal');
      expect(validateIsland(sc)).toEqual([]);
      sc.days.forEach((day, d) => {
        expect(day.optimumValue - day.secondValue).toBeGreaterThanOrEqual(2);
        expect(sc.researchers.some((r) => day.optimum[r.id] !== day.baseline[r.id])).toBe(true);
        const keyQs = [...new Set(day.keyFacts.map((f) => f.question))];
        expect(dayKeyQuestions(day).length).toBeLessThanOrEqual(day.budget);
        // Con solo las preguntas clave se deduce el óptimo; sin preguntar, no
        expect(bestAssignments(beliefCore(sc, d, keyQs), sc.researchers, sc.stations)[0].a).toEqual(day.optimum);
        expect(bestAssignments(beliefCore(sc, d, []), sc.researchers, sc.stations)[0].a).not.toEqual(day.optimum);
        // Una sola mejor respuesta y al menos una aceptable por petición, y una urgente por día
        for (const req of day.support) {
          expect(req.options.filter((o) => o.quality === 'best')).toHaveLength(1);
          expect(req.options.some((o) => o.quality === 'ok')).toBe(true);
        }
        expect(day.support.filter((r) => r.urgent)).toHaveLength(1);
      });
    }
  });

  it('el validador rechaza un día sin mejor respuesta clara', () => {
    const sc = generateIsland('R1', 'normal');
    const broken: IslandScenario = JSON.parse(JSON.stringify(sc));
    // Quitar los giros ocultos del día 1: la mejor asignación pasa a ser la de los cargos
    const d0 = broken.days[0];
    for (const r of broken.researchers) {
      d0.pref[r.id] = null;
      d0.blocked[r.id] = null;
      d0.overloaded[r.id] = false;
    }
    broken.stations.forEach((s) => (d0.need[s.id] = s.usual));
    const codes = validateIsland(broken).map((x) => x.code);
    expect(codes).toContain('OPTIMUM');
    // Una petición con dos "mejores" respuestas también se rechaza
    const broken2: IslandScenario = JSON.parse(JSON.stringify(sc));
    broken2.days[1].support[0].options.forEach((o) => (o.quality = 'best'));
    expect(validateIsland(broken2).map((x) => x.code)).toContain('SUPPORT');
  });
});

describe('SFL Island: perfiles, presupuesto justo y apoyo según lo explorado', () => {
  it('cada investigador tiene una fortaleza distinta, una segunda habilidad y un punto débil', () => {
    for (let i = 0; i < 20; i++) {
      const sc = generateIsland(`pf${i}`, 'normal');
      expect(new Set(sc.researchers.map((r) => r.skill1)).size).toBe(4);
      for (const r of sc.researchers) {
        expect(r.prof[r.skill1]).toBe(4);
        expect(r.prof[r.skill2]).toBe(2);
        expect(r.prof[r.weak]).toBe(0);
      }
    }
  });

  it('el presupuesto es justo: en Difícil no sobra ninguna pregunta y en Normal como mucho una', () => {
    for (let i = 0; i < 40; i++)
      for (const diff of ['normal', 'hard'] as const) {
        const sc = generateIsland(`b${i}`, diff);
        for (const day of sc.days) {
          const k = dayKeyQuestions(day).length;
          expect(k).toBeLessThanOrEqual(day.budget);
          expect(k).toBeGreaterThanOrEqual(day.budget - (diff === 'hard' ? 0 : 1));
          // Una pregunta por objetivo: las clave son de objetivos distintos
          expect(new Set(dayKeyQuestions(day).map((q) => q.split(':')[0])).size).toBe(k);
        }
        // En los 3 días hay al menos un conflicto, una sobrecarga y datos contradictorios
        const types = new Set(sc.days.flatMap((d) => d.support.map((r) => r.type)));
        for (const ty of ['conflict', 'overload', 'contradiction']) expect(types.has(ty as never)).toBe(true);
      }
  });

  it('cada día una petición de Apoyar depende de saber quién tiene margen, y solo una persona lo tiene', () => {
    for (let i = 0; i < 30; i++) {
      const sc = generateIsland(`ev${i}`, i % 2 ? 'hard' : 'normal', i % 3 ? 'es' : 'en');
      sc.days.forEach((day, d) => {
        const linked = day.support.filter((r) => r.evidence);
        expect(linked).toHaveLength(1);
        const ev = linked[0].evidence!;
        expect(linked[0].options.find((o) => o.quality === 'best')!.who).toBe(ev.who);
        expect(sc.researchers.filter((r) => effectiveWorkload(sc, d, r.id) === 'low').map((r) => r.id)).toEqual([ev.who]);
        expect(day.answers[ev.question].facts).toContain(`workload:${ev.who}`);
        // Sin la información, hay una opción aceptable que no carga a nadie
        expect(linked[0].options.some((o) => o.quality === 'ok' && !o.who)).toBe(true);
      });
    }
  });

  it('la mejor respuesta no se delata por ser la más larga (ni la más corta)', () => {
    for (const lang of ['es', 'en'] as const) {
      let longest = 0;
      let shortest = 0;
      let total = 0;
      for (let i = 0; i < 60; i++)
        for (const day of generateIsland(`len${i}`, 'normal', lang).days)
          for (const r of day.support) {
            const best = r.options.find((o) => o.quality === 'best')!;
            const others = r.options.filter((o) => o !== best);
            total++;
            if (others.every((o) => o.text.length < best.text.length)) longest++;
            if (others.every((o) => o.text.length > best.text.length)) shortest++;
          }
      expect(longest / total).toBeLessThan(0.45);
      expect(shortest / total).toBeLessThan(0.45);
    }
  });

  it('el validador rechaza una petición enlazada cuya mejor respuesta no va a quien tiene margen', () => {
    const sc = generateIsland('evbad', 'normal');
    const broken: IslandScenario = JSON.parse(JSON.stringify(sc));
    const req = broken.days[0].support.find((r) => r.evidence)!;
    const best = req.options.find((o) => o.quality === 'best')!;
    const busy = req.options.find((o) => o.who && o.quality !== 'best')!;
    best.quality = 'poor';
    busy.quality = 'best';
    expect(validateIsland(broken).map((x) => x.code)).toContain('EVIDENCE');
    // Y un día con preguntas de sobra en Difícil
    const hard = generateIsland('evbad', 'hard');
    const loose: IslandScenario = JSON.parse(JSON.stringify(hard));
    loose.days[0].budget = 6;
    expect(validateIsland(loose).map((x) => x.code)).toContain('SLACK');
  });

  it('pasar trabajo sin haber preguntado quién tenía margen se marca como intuición; la opción prudente vale parcial', () => {
    const sc = generateIsland('guess', 'normal');
    const ans = perfectPlay(sc);
    const day = sc.days[0];
    const req = day.support.find((r) => r.evidence)!;
    ans[0].asked = ans[0].asked.filter((q) => q !== req.evidence!.question);
    // Apuesta: a la persona sin margen
    ans[0].support[req.id] = req.options.findIndex((o) => o.who && o.quality !== 'best');
    let g = gradeIsland(sc, ans);
    let item = g.rubric.parts.flatMap((p) => p.items).find((i) => i.id === `isl0-support-${req.id}`)!;
    expect(item.earned).toBe(0);
    expect(item.errorType).toBe('sfl-support-guess');
    expect(islandPatterns(sc, ans, g).map((p) => p.id)).toContain('sfl-intuition');
    const dec = g.decisions.find((x) => x.id === `isl0-support-${req.id}`)!;
    expect(dec.when).toMatch(/Explorar/);
    // Prudente: la aceptable, sin nombre
    ans[0].support[req.id] = req.options.findIndex((o) => o.quality === 'ok' && !o.who);
    g = gradeIsland(sc, ans);
    item = g.rubric.parts.flatMap((p) => p.items).find((i) => i.id === `isl0-support-${req.id}`)!;
    expect(item.earned).toBe(3);
    expect(item.errorType).toBe('sfl-support-ok');
    // Y la pregunta clave que faltó cuesta puntos de Explorar
    expect(g.rubric.parts.flatMap((p) => p.items).find((i) => i.id === `isl0-key-${req.evidence!.question}`)!.earned).toBe(0);
  });
});

describe('SFL Island: corrección', () => {
  it('el juego perfecto suma 300 de 300 y no deja patrones', () => {
    for (let i = 0; i < 10; i++) {
      const sc = generateIsland(`p${i}`, 'normal');
      const ans = perfectPlay(sc);
      const g = gradeIsland(sc, ans);
      expect(g.rubric.max).toBe(300);
      expect(g.rubric.earned).toBe(300);
      expect(g.decisions.every((d) => d.ok === true)).toBe(true);
      expect(islandPatterns(sc, ans, g)).toEqual([]);
    }
  });

  it('cada día vale 100: Explorar 20, Asignar 30, Motivos 10, Apoyar 30, Reflexionar 10', () => {
    const sc = generateIsland('m1', 'hard');
    const g = gradeIsland(sc, perfectPlay(sc));
    const by = (k: string) => g.rubric.parts.filter((p) => p.key.endsWith(k)).map((p) => p.max);
    expect(by('-explore')).toEqual([20, 20, 20]);
    expect(by('-assign')).toEqual([30, 30, 30]);
    expect(by('-reasons')).toEqual([10, 10, 10]);
    expect(by('-support')).toEqual([30, 30, 30]);
    expect(by('-reflect')).toEqual([10, 10, 10]);
  });

  it('los puntos perdidos suman exactamente 100 − nota con respuestas aleatorias', () => {
    for (let i = 0; i < 40; i++) {
      const sc = generateIsland(`r${i}`, 'normal');
      let x = i * 7 + 3;
      const rnd = (n: number) => ((x = (x * 1103515245 + 12345) % 2147483648), x % n);
      const ans = sc.days.map((day, d) => {
        const a = emptyIslandDay(sc, d);
        a.asked = day.questions.filter(() => rnd(3) === 0).slice(0, day.budget).map((q) => q.id);
        a.askedAt = a.asked.map(() => rnd(60));
        const perm = [...sc.stations].sort(() => rnd(3) - 1);
        sc.researchers.forEach((r, k) => (a.assign[r.id] = perm[k].id));
        sc.researchers.forEach((r) => (a.reasons[r.id] = (['personal', 'skills', 'goal', 'station', 'cover'] as const)[rnd(5)]));
        day.support.forEach((req) => {
          if (rnd(5)) {
            a.support[req.id] = rnd(3);
            a.supportOrder.push(req.id);
          }
        });
        sc.researchers.forEach((r) => (a.reflect[r.id] = (['high', 'mid', 'low', 'unknown', ''] as const)[rnd(5)]));
        return a;
      });
      const g = gradeIsland(sc, ans);
      const o = overall([g.rubric]);
      const lostT = o.pointsOff.reduce((s, p) => s + T(p.lost), 0);
      expect(lostT).toBe(T(g.rubric.max) - T(g.rubric.earned));
      expect(Math.round(o.pointsOff.reduce((s, p) => s + p.pct, 0) * 10)).toBe(1000 - Math.round(o.scorePct * 10));
    }
  });

  it('puntúa el orden de lo urgente, la calidad del apoyo y «No lo sé» según las pruebas', () => {
    const sc = generateIsland('u1', 'normal');
    const ans = perfectPlay(sc);
    const day = sc.days[0];
    const a = ans[0];
    // Urgente al final
    a.supportOrder = [...a.supportOrder.slice(1), a.supportOrder[0]];
    // Una respuesta aceptable
    const req = day.support.find((r) => !r.urgent)!;
    a.support[req.id] = req.options.findIndex((o) => o.quality === 'ok');
    // «No lo sé» sin pruebas (nadie preguntó por su estado) y con pruebas
    const r0 = sc.researchers.find((r) => !a.asked.includes(`${r.id}:state`) && !day.support.some((q) => q.from === r.id && (q.type === 'overload' || q.type === 'wellbeing')))!;
    a.reflect[r0.id] = 'unknown';
    const items = gradeIsland(sc, ans).rubric.parts.flatMap((p) => p.items);
    const item = (id: string) => items.find((i) => i.id === id)!;
    expect(item('isl0-urgent').earned).toBe(0);
    expect(item(`isl0-support-${req.id}`).earned).toBe(3);
    expect(item(`isl0-reflect-${r0.id}`).earned).toBe(1.5);
    // Con pruebas, «No lo sé» vale 0
    a.asked = [...a.asked.filter((q) => !q.startsWith(r0.id)), `${r0.id}:state`];
    const items2 = gradeIsland(sc, ans).rubric.parts.flatMap((p) => p.items);
    expect(items2.find((i) => i.id === `isl0-reflect-${r0.id}`)!.earned).toBe(0);
  });

  it('detecta preguntas gastadas en información irrelevante y asignaciones por intuición', () => {
    const sc = generateIsland('w1', 'normal');
    const ans = perfectPlay(sc);
    const day = sc.days[0];
    const keyQs = new Set(dayKeyQuestions(day));
    const keyTargets = new Set([...keyQs].map((q) => q.split(':')[0]));
    // Gastar todas las preguntas en objetivos sin datos clave, pronto, y asignar sin cambiar nada
    ans[0].asked = day.questions.filter((q) => !keyTargets.has(q.target) && q.kind !== 'contrib').map((q) => q.id).slice(0, day.budget);
    ans[0].askedAt = ans[0].asked.map(() => 3);
    ans[0].assign = { ...day.baseline };
    ans[0].reasons = {};
    const g = gradeIsland(sc, ans);
    const ids = islandPatterns(sc, ans, g).map((p) => p.id);
    expect(ids).toContain('sfl-wasted');
    expect(ids).toContain('sfl-early');
    expect(ids).toContain('sfl-intuition');
    const types = g.rubric.parts.flatMap((p) => p.items).map((i) => i.errorType);
    expect(types).toContain('sfl-explore-missed');
    expect(types).toContain('sfl-assign-intuition');
    // La corrección explica cuándo había que conseguir la información
    const missed = g.decisions.find((d) => d.step === 'explore' && d.ok === false)!;
    expect(missed.when).toMatch(/Día 1, fase Explorar/);
  });
});

// ---------------------------------------------------------------- SFL Classic


/** Juega el clásico eligiendo en cada pantalla la opción de la calidad pedida (por defecto, la mejor). */
function playClassic(sc: ClassicScenario, pickFor: (n: number) => 'best' | 'ok' | 'poor' = () => 'best', ranking = sc.correctRanking): ClassicAnswers {
  const a = emptyClassic();
  a.ranking = ranking.slice();
  a.timeSec.briefing = 120;
  for (const d of sc.decisions) {
    const key = variantFor(sc, a, d.n);
    a.shown[d.n] = key;
    a.choices[d.n] = d.variants[key].options.findIndex((o) => o.quality === pickFor(d.n));
  }
  return a;
}

describe('SFL Classic', () => {
  it('genera 13 tareas válidas, deterministas e iguales en los dos idiomas', () => {
    for (let i = 0; i < 40; i++) {
      const diff = i % 2 ? 'hard' : 'normal';
      const es = generateClassic(`k${i}`, diff, 'es');
      const en = generateClassic(`k${i}`, diff, 'en');
      expect(validateClassic(es)).toEqual([]);
      expect(es.decisions).toHaveLength(12);
      expect(en.correctRanking).toEqual(es.correctRanking);
      expect(en.results).toEqual(es.results);
      es.decisions.forEach((d, k) =>
        Object.keys(d.variants).forEach((v) => expect(en.decisions[k].variants[v].options.map((o) => o.quality)).toEqual(d.variants[v].options.map((o) => o.quality))),
      );
      if (diff === 'hard') expect(es.dependency).not.toBeNull();
    }
    expect(JSON.stringify(generateClassic('same', 'normal'))).toBe(JSON.stringify(generateClassic('same', 'normal')));
  });

  it('el validador rechaza un ranking sin orden claro y un escalado que no cuadra con los datos', () => {
    const sc = generateClassic('bad', 'normal');
    const tie: ClassicScenario = JSON.parse(JSON.stringify(sc));
    tie.initiatives[1].scores = { ...tie.initiatives[0].scores };
    expect(validateClassic(tie).map((x) => x.code)).toContain('RANKING');
    const wrong: ClassicScenario = JSON.parse(JSON.stringify(sc));
    wrong.results = wrong.results.map(() => wrong.target + 5);
    wrong.results[0] = wrong.target - 5;
    const meetsAll = sc.results.every((r) => r >= sc.target);
    const meetsSome = sc.results.some((r) => r >= sc.target) && !meetsAll;
    if (!meetsSome) expect(validateClassic(wrong).map((x) => x.code)).toContain('SCALE');
  });

  it('el juego perfecto suma 100 y cada decisión vale 7,5', () => {
    for (let i = 0; i < 10; i++) {
      const sc = generateClassic(`pp${i}`, 'hard');
      const g = gradeClassic(sc, playClassic(sc));
      expect(g.rubric.max).toBe(100);
      expect(g.rubric.earned).toBe(100);
      expect(g.rubric.parts.find((p) => p.key === 'cl-decisions')!.items.every((x) => x.max === 7.5)).toBe(true);
      expect(g.decisions.every((d) => d.ok === true)).toBe(true);
    }
  });

  it('las decisiones anteriores cambian la situación y la mejor respuesta de las posteriores', () => {
    const sc = generateClassic('chain', 'hard');
    // Alargar el análisis (6) deja sin margen la 8 y cambia su mejor respuesta
    const slack = playClassic(sc);
    const tight = playClassic(sc, (n) => (n === 6 ? 'ok' : 'best'));
    expect(variantFor(sc, slack, 8)).toBe('slack');
    expect(tight.shown[8]).toBe('tight');
    const best8 = (key: string) => sc.decisions.find((d) => d.n === 8)!.variants[key].options.find((o) => o.quality === 'best')!.text;
    expect(best8('slack')).not.toBe(best8('tight'));
    // Un indicador que no mide el objetivo (2) obliga a corregir en la 11
    expect(playClassic(sc, (n) => (n === 2 ? 'poor' : 'best')).shown[11]).toBe('other');
    // Poner primero la iniciativa que depende de otra bloquea el piloto (12)
    const dep = sc.dependency!;
    const badRanking = [dep.dependent, ...sc.correctRanking.filter((x) => x !== dep.dependent)];
    const blocked = playClassic(sc, () => 'best', badRanking);
    expect(blocked.shown[12]).toBe('blocked');
    const g = gradeClassic(sc, blocked);
    expect(g.rubric.parts[0].items.find((i) => i.errorType === 'sfl-c-dependency')).toBeTruthy();
    expect(classicPatterns(sc, blocked, g).map((p) => p.id)).toContain('sfl-chain');
    expect(g.decisions.find((d) => d.id === 'cl-d12')!.why).toMatch(/ranking/);
  });

  it('los puntos perdidos suman exactamente 100 − nota y detecta el briefing leído deprisa', () => {
    for (let i = 0; i < 30; i++) {
      const sc = generateClassic(`rand${i}`, 'normal');
      const q = ['best', 'ok', 'poor'] as const;
      const a = playClassic(sc, (n) => q[(n * 7 + i) % 3], [...sc.correctRanking].reverse());
      if (i % 4 === 0) delete a.choices[5];
      a.timeSec.briefing = 20;
      const g = gradeClassic(sc, a);
      const o = overall([g.rubric]);
      expect(o.pointsOff.reduce((s, p) => s + T(p.lost), 0)).toBe(T(g.rubric.max) - T(g.rubric.earned));
      expect(Math.round(o.pointsOff.reduce((s, p) => s + p.pct, 0) * 10)).toBe(1000 - Math.round(o.scorePct * 10));
      expect(classicPatterns(sc, a, g).map((p) => p.id)).toContain('sfl-briefing-fast');
    }
  });
});

describe('SFL Classic: la longitud no delata la mejor opción', () => {
  it('la mejor no es casi siempre la más larga, ni la más corta, ni la intermedia', () => {
    for (const lang of ['es', 'en'] as const) {
      const n = { longest: 0, shortest: 0, middle: 0, total: 0 };
      for (let i = 0; i < 80; i++)
        for (const d of generateClassic(`cl${i}`, i % 2 ? 'hard' : 'normal', lang).decisions)
          for (const v of Object.values(d.variants)) {
            const best = v.options.find((o) => o.quality === 'best')!;
            const others = v.options.filter((o) => o !== best);
            const longest = others.every((o) => o.text.length < best.text.length);
            const shortest = others.every((o) => o.text.length > best.text.length);
            n.total++;
            if (longest) n.longest++;
            else if (shortest) n.shortest++;
            else n.middle++;
          }
      expect(n.longest / n.total).toBeLessThan(0.45);
      expect(n.shortest / n.total).toBeLessThan(0.45);
      expect(n.middle / n.total).toBeLessThan(0.55);
    }
  });
});

describe('Nota global con varias pruebas', () => {
  it('cada prueba pesa lo mismo y los porcentajes perdidos siguen sumando 100 − nota', () => {
    const isl = generateIsland('mix', 'normal');
    const cl = generateClassic('mix', 'normal');
    const gi = gradeIsland(isl, perfectPlay(isl)).rubric; // 300 de 300
    const gc = gradeClassic(cl, emptyClassic()).rubric; // 0 de 100
    const o = overall([gi, gc]);
    expect(o.scorePct).toBe(50);
    expect(Math.round(o.pointsOff.reduce((s, p) => s + p.pct, 0) * 10)).toBe(500);
    // Con fallos en las dos, un punto de la prueba pequeña resta más nota que uno de la grande
    const half = perfectPlay(isl);
    half[0].assign = { ...isl.days[0].baseline };
    const o2 = overall([gradeIsland(isl, half).rubric, gradeClassic(cl, emptyClassic()).rubric]);
    const perPoint = (game: string) => {
      const xs = o2.pointsOff.filter((p) => p.game === game);
      return xs.reduce((s, p) => s + p.pct, 0) / xs.reduce((s, p) => s + p.lost, 0);
    };
    expect(perPoint('sfl-classic')).toBeGreaterThan(perPoint('sfl-island'));
    expect(Math.round(o2.pointsOff.reduce((s, p) => s + p.pct, 0) * 10)).toBe(1000 - Math.round(o2.scorePct * 10));
  });
});
