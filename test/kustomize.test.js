// Kustomization com campos do tipo errado: o simulador deve responder como o
// kustomize real, nunca com "erro interno".
import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS } from '../web/missions/index.js';
import { startMission } from '../web/engine/game.js';

const missao = MISSIONS.find((m) => m.id === 'c1-overlays');
const DIR = '/home/student/labs/portal/overlays/stage';
const CABECALHO = 'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources:\n- ../../base\nnamespace: portal-stage\n';

const CASOS = [
  ['replicas: 1\n', 'cannot unmarshal number into Go struct field Kustomization.replicas of type []types.Replica'],
  ['replicas:\n  name: portal\n  count: 1\n', 'cannot unmarshal object into Go struct field Kustomization.replicas of type []types.Replica'],
  ['replicas:\n- name: portal\n  count: "1"\n', 'cannot unmarshal string into Go struct field Replica.replicas.count of type int64'],
  ['replicas:\n- portal\n', 'cannot unmarshal string into Go struct field Kustomization.replicas of type types.Replica'],
  ['configMapGenerator:\n  name: portal-settings\n', 'cannot unmarshal object into Go struct field Kustomization.configMapGenerator of type []types.ConfigMapArgs'],
  ['configMapGenerator:\n- name: portal-settings\n  literals: MODE=staging\n', 'cannot unmarshal string into Go struct field ConfigMapArgs.configMapGenerator.literals of type []string'],
  ['images:\n  name: x\n', 'cannot unmarshal object into Go struct field Kustomization.images of type []types.Image'],
  ['patches: patch.yaml\n', 'cannot unmarshal string into Go struct field Kustomization.patches of type []types.Patch'],
  ['resources: ../../base\n', 'cannot unmarshal string into Go struct field Kustomization.resources of type []string'],
  ['commonLabels:\n- app=portal\n', 'cannot unmarshal array into Go struct field Kustomization.commonLabels of type map[string]string'],
  ['replicas:\n- name: portal\n  cont: 1\n', 'unknown field "cont"'],
];

for (const [trecho, esperado] of CASOS) {
  test(`kustomize com tipo errado: ${JSON.stringify(trecho)}`, async () => {
    const w = await startMission(missao, { lang: 'pt' });
    const yaml = trecho.startsWith('resources:') ? CABECALHO.replace('resources:\n- ../../base\n', '') + trecho : CABECALHO + trecho;
    w.fs.put(`${DIR}/kustomization.yaml`, yaml);
    const r = await w.sh(`oc apply -k ${DIR} --dry-run=server`);
    assert.notEqual(r.code, 0);
    assert.ok(!/erro interno|\[simulador\]|undefined/.test(r.out), r.out);
    assert.ok(r.out.includes('error: invalid Kustomization: json: '), r.out);
    assert.ok(r.out.includes(esperado), r.out);
  });
}

test('kustomize mantém newTag numérico como texto (2.0 não vira 2)', async () => {
  const w = await startMission(missao, { lang: 'pt' });
  w.fs.put(`${DIR}/kustomization.yaml`, `${CABECALHO}images:\n- name: registry.lab.example.com:8443/nimbus/portal\n  newTag: 2.0\n`);
  const r = await w.sh(`oc kustomize ${DIR}`);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /image: registry\.lab\.example\.com:8443\/nimbus\/portal:2\.0\n/);
});

test('kustomize mantém números como texto em labels e aceita count inteiro', async () => {
  const w = await startMission(missao, { lang: 'pt' });
  w.fs.put(`${DIR}/kustomization.yaml`, `${CABECALHO}commonLabels:\n  versao: 1.10\nreplicas:\n- name: portal\n  count: 2\n`);
  const r = await w.sh(`oc kustomize ${DIR}`);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /versao: "1\.10"/);
  assert.match(r.out, /replicas: 2\n/);
});
