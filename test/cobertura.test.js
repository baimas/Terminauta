// Cobertura dos objetivos oficiais da EX280: todo objetivo que o simulador
// reproduz tem missão, e todo rótulo usado nas missões existe no registro.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, EXAMS, chapterOf, missoesDa, trilha } from '../web/missions/index.js';
import { OFICIAIS, EXTRAS, OFICIAIS_180, EXTRAS_180, OBJETIVOS_EN } from '../web/missions/objetivos.js';
import { DOCS, GUIAS } from '../web/missions/docs-oficiais.js';

const usadosDa = (id) => {
  const mapa = new Map();
  for (const m of missoesDa(id)) for (const o of m.objectives) mapa.set(o, [...(mapa.get(o) || []), m.id]);
  return mapa;
};
const usados = new Map();
for (const m of MISSIONS) for (const o of m.objectives) usados.set(o, [...(usados.get(o) || []), m.id]);

for (const [id, oficiais, extras] of [['ex280', OFICIAIS, EXTRAS], ['ex180', OFICIAIS_180, EXTRAS_180]]) {
  test(`${id}: todo objetivo oficial simulado tem pelo menos uma missão da trilha`, () => {
    const u = usadosDa(id);
    const sem = [];
    for (const s of oficiais) for (const o of s.itens) if (!o.fora && !o.pt.some((pt) => u.has(pt))) sem.push(o.en);
    assert.deepEqual(sem, []);
  });
  test(`${id}: os extras do curso têm missão na trilha`, () => {
    const u = usadosDa(id);
    for (const pt of Object.keys(extras)) assert.ok(u.has(pt), `extra sem missão: ${pt}`);
  });
}

test('todo rótulo de objetivo das missões é oficial ou extra do curso', () => {
  const soltos = [...usados.keys()].filter((o) => !OBJETIVOS_EN[o]);
  assert.deepEqual(soltos, []);
});

test('o que não é simulado está declarado, com motivo nos dois idiomas', () => {
  const fora = [...OFICIAIS, ...OFICIAIS_180].flatMap((s) => s.itens.filter((o) => o.fora || o.parcial));
  for (const o of fora) for (const x of [o.fora, o.parcial].filter(Boolean)) assert.ok(x.pt && x.en, o.en);
  // Só o console web fica totalmente de fora.
  assert.deepEqual(OFICIAIS.flatMap((s) => s.itens.filter((o) => o.fora).map((o) => o.en)), ['Use the web console to manage and configure an OpenShift cluster']);
});

test('cada simulado cobre todos os domínios da prova da trilha', () => {
  for (const ex of EXAMS.filter((e) => !e.guia)) {
    const caps = new Set(ex.partes.map((m) => chapterOf(m.id).id));
    const t = trilha(ex.trilha);
    // EX280: o capítulo de updates (c9) é conteúdo do curso, não da lista da prova.
    for (const c of t.capitulos.filter((x) => x.id !== 'c9' && !x.guia)) assert.ok(caps.has(c.id), `${ex.id} sem ${c.id}`);
    for (const m of ex.partes) assert.equal(m.trilha, ex.trilha, `${ex.id}: ${m.id} é de outra trilha`);
  }
});

test('missões têm ids únicos e textos completos', () => {
  const ids = MISSIONS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const m of MISSIONS) {
    assert.ok(m.hints.length >= 2, `${m.id}: poucas dicas`);
    assert.ok(m.checks.length >= 1 && m.solution.length >= 1, m.id);
    assert.equal(m.tasks.pt.length, m.tasks.en.length, `${m.id}: tarefas pt/en`);
    assert.ok(m.minutes > 0 && m.xp > 0 && m.difficulty >= 1 && m.difficulty <= 3, m.id);
  }
});

test('toda missão tem a dica de documentação oficial', () => {
  const problemas = [];
  for (const m of MISSIONS) {
    const d = DOCS[m.id];
    if (!d) problemas.push(`${m.id}: sem dica`);
    else if (!GUIAS[d.guia] || !d.termos?.length) problemas.push(`${m.id}: guia ou termos inválidos`);
  }
  for (const id of Object.keys(DOCS)) if (!MISSIONS.some((m) => m.id === id)) problemas.push(`${id}: dica de missão que não existe`);
  assert.deepEqual(problemas, []);
});
