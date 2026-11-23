// Cada simulado: as missões convivem no mesmo cluster. O ambiente começa
// reprovado e, com as soluções de todas as partes, chega a 300.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMS, chapterOf, trilha } from '../web/missions/index.js';
import { startMission, grade } from '../web/engine/game.js';
import { notaDoExame } from '../web/missions/exames.js';

for (const exame of EXAMS) {
  test(`simulado ${exame.id}`, async () => {
    const w = await startMission(exame);
    const antes = notaDoExame(exame, await grade(exame, w), chapterOf);
    assert.ok(antes.nota < 50, `nota inicial ${antes.nota}`);
    for (const passo of exame.solution) {
      const r = await w.sh(passo.cmd);
      if (!passo.falha) assert.equal(r.code, 0, `[${passo.parte}] "${passo.cmd}" saiu com ${r.code}: ${r.out}`);
    }
    w.cluster.tick(10);
    const depois = notaDoExame(exame, await grade(exame, w), chapterOf);
    const falhas = depois.porParte.flatMap((p) => p.itens.filter((i) => !i.ok).map((i) => `${p.id}: ${i.text.pt}`));
    assert.deepEqual(falhas, []);
    assert.equal(depois.nota, 300);
    // Cada domínio (capítulo) da trilha aparece na nota.
    assert.equal(depois.dominios.length, exame.guia ? 1 : trilha(exame.trilha).capitulos.filter((c) => !c.guia).length);
  });
}
