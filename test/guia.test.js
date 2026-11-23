// Guia de laboratório EX280: as 20 questões existem na ordem do guia, com o
// número de objetivos do guia, e todo binário que o guia usa existe no shell.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, EXAMS } from '../web/missions/index.js';
import { createWorld } from '../web/engine/world.js';

const GUIA = MISSIONS.filter((m) => m.chapter === 'g');
// Número de objetivos de cada questão no guia (.md).
const OBJETIVOS = [4, 8, 6, 3, 3, 3, 4, 3, 4, 4, 3, 4, 5, 4, 6, 4, 6, 3, 4, 3];

test('o guia tem as 20 questões, na ordem, com os objetivos do guia', () => {
  assert.equal(GUIA.length, 20);
  GUIA.forEach((m, i) => {
    assert.ok(m.title.pt.startsWith(`Questão ${i + 1}: `), m.id);
    assert.ok(m.title.en.startsWith(`Question ${i + 1}: `), m.id);
    assert.equal(m.tasks.pt.length, OBJETIVOS[i], `${m.id}: objetivos`);
  });
});

test('o simulado do guia reúne as 20 questões', () => {
  const ex = EXAMS.find((e) => e.id === 'prova-guia');
  assert.deepEqual(ex.partes.map((m) => m.id), GUIA.map((m) => m.id));
});

test('todo binário do guia existe no shell simulado', async () => {
  const w = createWorld();
  for (const bin of ['oc', 'helm', 'htpasswd', 'openssl', 'curl', 'tar', 'sed', 'cat', 'sleep', 'ls', 'mkdir', 'echo']) {
    assert.ok(w.shell.cmds[bin], `${bin} não existe`);
  }
  // /usr/bin/script é o script de envio do laboratório.
  const r = await w.sh('/usr/bin/script');
  assert.notEqual(r.code, 127, r.out);
  assert.match(r.out, /Usage/);
  for (const cmd of ['htpasswd', 'openssl version', 'helm version', 'curl --version', 'oc version --client']) {
    const x = await w.sh(cmd);
    assert.notEqual(x.code, 127, `${cmd}: ${x.out}`);
  }
});

test('script recusa pacote que não é do cluster ou sem must-gather', async () => {
  const w = createWorld();
  await w.sh('mkdir vazio; touch vazio/a');
  await w.sh('tar cvaf system10-errado.tar.gz vazio');
  assert.match((await w.sh('/usr/bin/script system10-errado.tar.gz')).out, /does not match this cluster/);
  await w.sh('tar cvaf system10-6f1c2a34-0b5d-4c8e-9a7f-2d3e4b5c6a70.tar.gz vazio');
  assert.match((await w.sh('/usr/bin/script system10-6f1c2a34-0b5d-4c8e-9a7f-2d3e4b5c6a70.tar.gz')).out, /no must-gather data/);
});

test('curingas do shell: * e ? expandem, e sem correspondência ficam literais', async () => {
  const w = createWorld();
  await w.sh('mkdir d; touch d/a.txt d/b.txt d/c.log');
  assert.equal((await w.sh('ls d/*.txt')).out.trim(), 'd/a.txt\nd/b.txt');
  assert.match((await w.sh('echo d/?.log')).out, /d\/c\.log/);
  assert.match((await w.sh('echo d/*.zip')).out, /d\/\*\.zip/);
  assert.match((await w.sh("echo 'd/*.txt'")).out, /d\/\*\.txt/);
});

test('o oc é o 4.22: --docker-image e --cpu-percent não existem mais', async () => {
  const w = createWorld();
  assert.match((await w.sh('oc new-app --docker-image x/y')).out, /unknown flag: --docker-image/);
  assert.match((await w.sh('oc autoscale deployment/x --max 3 --cpu-percent=60')).out, /unknown flag: --cpu-percent/);
});

test('o repositório e o registro do guia (ocp4) resolvem para o laboratório', async () => {
  const w = createWorld();
  assert.match((await w.sh('helm repo add do280-repo http://helm.ocp4.example.com/charts')).out, /has been added/);
  assert.match((await w.sh('helm search repo etherpad -l')).out, /do280-repo\/etherpad\s+0\.0\.7/);
  await w.sh('oc new-project t');
  const r = await w.sh('oc create deployment landing --image registry.ocp4.example.com:8443/redhattraining/hello-world-nginx:v1.0');
  assert.equal(r.code, 0, r.out);
  w.cluster.tick(30);
  assert.equal((await w.sh('oc get pods')).out.includes('Running'), true);
});
