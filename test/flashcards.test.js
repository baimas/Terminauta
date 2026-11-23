// Flashcards: baralhos completos nas duas trilhas e o agendamento no estilo do Anki.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, cardsDa } from '../web/flashcards/index.js';
import { TRILHAS } from '../web/missions/index.js';
import { responde, fila, novoEstado, rotuloIntervalo, NOVOS_POR_DIA } from '../web/engine/repeticao.js';

test('cards com id único, textos nos dois idiomas e capítulo existente', () => {
  const ids = CARDS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of CARDS) {
    for (const l of ['pt', 'en']) assert.ok(c.q[l] && c.a[l], `${c.id} sem ${l}`);
    const t = TRILHAS.find((x) => x.id === c.trilha);
    assert.ok(t.capitulos.some((cap) => cap.id === c.cap), `${c.id}: capítulo ${c.cap}`);
    assert.ok(c.id.startsWith(c.trilha === 'ex280' ? '280-' : '180-'), c.id);
  }
});

test('todo capítulo das duas trilhas tem pelo menos 5 cards', () => {
  for (const t of TRILHAS) for (const cap of t.capitulos.filter((c) => !c.guia)) assert.ok(cardsDa(t.id, cap.id).length >= 5, `${t.id} ${cap.id}`);
  assert.ok(cardsDa('ex280').length >= 90 && cardsDa('ex180').length >= 80);
});

test('o card da pergunta do oc diff existe', () => {
  assert.ok(CARDS.some((c) => c.a.pt.includes('oc diff -f')));
});

test('repetição espaçada: aprendizado, formatura e intervalos crescentes', () => {
  const t0 = Date.UTC(2026, 10, 19);
  const MIN = 60000;
  const DIA = 86400000;
  let e = responde(novoEstado(), 2, t0);
  assert.equal(e.vence - t0, 10 * MIN);
  e = responde(e, 2, t0);
  assert.equal(e.intervalo, 1);
  e = responde(e, 2, t0);
  assert.ok(e.intervalo >= 2);
  const antes = e.intervalo;
  e = responde(e, 2, t0);
  assert.ok(e.intervalo > antes);
  const errou = responde(e, 0, t0);
  assert.equal(errou.intervalo, 0);
  assert.equal(errou.lapsos, 1);
  assert.equal(errou.vence - t0, MIN);
  assert.equal(responde(novoEstado(), 3, t0).vence - t0, 4 * DIA);
  assert.equal(rotuloIntervalo(novoEstado(), 0, t0), '1 min');
});

test('fila: vencidos primeiro e limite de novos por dia', () => {
  const cards = cardsDa('ex180');
  const agora = Date.now();
  const estados = { [cards[5].id]: { ...novoEstado(), intervalo: 3, vence: agora - 1000 } };
  const f = fila(cards, estados, agora, 0);
  assert.equal(f[0].id, cards[5].id);
  assert.equal(f.length, 1 + NOVOS_POR_DIA);
  assert.equal(fila(cards, estados, agora, NOVOS_POR_DIA).length, 1);
});
