// Leitura em voz alta: escolha da voz do sistema e áudio gravado dos cards em inglês.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { CARDS } from '../web/flashcards/index.js';
import { melhorVoz, notaVoz, textoFalado } from '../web/ui/voz.js';

const PASTA = new URL('../web/audio/en/', import.meta.url);
const v = (name, lang, localService = true) => ({ name, lang, localService });

test('evita as vozes de efeito do macOS e prefere as naturais', () => {
  const mac = [v('Albert', 'en-US'), v('Bad News', 'en-US'), v('Fred', 'en-US'), v('Eddy (English (US))', 'en-US'), v('Samantha', 'en-US'), v('Daniel', 'en-GB')];
  assert.equal(melhorVoz(mac, 'en').name, 'Samantha');
  const chrome = [...mac, v('Google US English', 'en-US', false)];
  assert.equal(melhorVoz(chrome, 'en').name, 'Google US English');
  const edge = [...mac, v('Microsoft Ava Online (Natural) - English (United States)', 'en-US', false)];
  assert.match(melhorVoz(edge, 'en').name, /Natural/);
  assert.equal(melhorVoz([v('Eddy (português (Brasil))', 'pt-BR'), v('Flo (português (Brasil))', 'pt-BR'), v('Luciana', 'pt-BR')], 'pt').name, 'Luciana');
  assert.equal(notaVoz(v('Zarvox', 'en-US'), 'en'), -1);
  assert.equal(melhorVoz([v('Albert', 'en-US')], 'en'), null);
});

test('texto para a voz do sistema sem crases e com comandos pronunciáveis', () => {
  assert.equal(textoFalado('Use `oc diff -f file.yaml` agora'), 'Use O C diff f file.yaml agora');
  assert.equal(textoFalado('`oc apply --dry-run=server`'), 'O C apply dry-run=server');
});

test('todo card tem áudio em inglês gravado e em dia com o texto', () => {
  const manifesto = JSON.parse(readFileSync(new URL('manifesto.json', PASTA)));
  const hash = (t) => createHash('sha1').update(t).digest('hex').slice(0, 12);
  const problemas = [];
  for (const c of CARDS) {
    for (const lado of ['q', 'a']) {
      if (manifesto[c.id]?.[lado] !== hash(c[lado].en)) problemas.push(`${c.id}-${lado}: texto mudou ou falta no manifesto`);
      if (!existsSync(new URL(`${c.id}-${lado}.mp3`, PASTA))) problemas.push(`${c.id}-${lado}.mp3 não existe`);
    }
  }
  assert.deepEqual(problemas, [], 'rode scripts/gera-audio.py para regravar');
  // Nenhum arquivo sobrando de card que não existe mais.
  const ids = new Set(CARDS.flatMap((c) => [`${c.id}-q.mp3`, `${c.id}-a.mp3`]));
  assert.deepEqual(readdirSync(PASTA).filter((f) => f.endsWith('.mp3') && !ids.has(f)), []);
});
