// Subconjunto do Kustomize: resources (arquivos e bases), namespace,
// namePrefix/nameSuffix, commonLabels/labels, commonAnnotations, images,
// replicas, patches e geradores de config map e secret.
import yaml from '../vendor/js-yaml.mjs';
import { ApiError } from './cluster.js';
import { kindOf } from './resources.js';
import { parseRef } from './images.js';
import { hashId, b64, clone } from './util.js';
import { fusaoEstrategica, jsonPatch } from './patch.js';

const NOMES = ['kustomization.yaml', 'kustomization.yml', 'Kustomization'];
const CAMPOS = new Set(['apiVersion', 'kind', 'metadata', 'resources', 'bases', 'namespace', 'namePrefix', 'nameSuffix', 'commonLabels', 'labels', 'commonAnnotations', 'images', 'replicas', 'patches', 'patchesStrategicMerge', 'configMapGenerator', 'secretGenerator', 'generatorOptions']);

const falha = (msg) => new ApiError(`error: ${msg}`);

// Tipos dos campos, como no struct Go do Kustomize. Um campo com o tipo errado
// (por exemplo `replicas: 1` em vez de uma lista) gera o mesmo erro do kustomize.
const TEXTO = { tipo: 'string' };
const NUMERO = { tipo: 'int64' };
const BOOL = { tipo: 'bool' };
const QUALQUER = { tipo: 'any' };
const MAPA = { tipo: 'map[string]string', mapa: true };
const LISTA_TEXTO = { tipo: '[]string', item: TEXTO };
const lista = (go, campos) => ({ tipo: `[]types.${go}`, item: { tipo: `types.${go}`, go, campos } });
const OPCOES_GERADOR = { tipo: '*types.GeneratorOptions', go: 'GeneratorOptions', campos: { labels: MAPA, annotations: MAPA, disableNameSuffixHash: BOOL, immutable: BOOL } };
const GERADOR = { name: TEXTO, namespace: TEXTO, behavior: TEXTO, literals: LISTA_TEXTO, files: LISTA_TEXTO, envs: LISTA_TEXTO, options: OPCOES_GERADOR };
const ALVO = { tipo: '*types.Selector', go: 'Selector', campos: { group: TEXTO, version: TEXTO, kind: TEXTO, name: TEXTO, namespace: TEXTO, labelSelector: TEXTO, annotationSelector: TEXTO } };
const ESQUEMA = {
  apiVersion: TEXTO, kind: TEXTO, namespace: TEXTO, namePrefix: TEXTO, nameSuffix: TEXTO,
  metadata: { tipo: '*types.ObjectMeta', go: 'ObjectMeta', campos: { name: TEXTO, namespace: TEXTO, labels: MAPA, annotations: MAPA } },
  resources: LISTA_TEXTO, bases: LISTA_TEXTO, patchesStrategicMerge: LISTA_TEXTO,
  commonLabels: MAPA, commonAnnotations: MAPA,
  labels: lista('Label', { pairs: MAPA, includeSelectors: BOOL, includeTemplates: BOOL, fields: QUALQUER }),
  images: lista('Image', { name: TEXTO, newName: TEXTO, newTag: TEXTO, digest: TEXTO }),
  replicas: lista('Replica', { name: TEXTO, count: NUMERO }),
  patches: lista('Patch', { path: TEXTO, patch: TEXTO, target: ALVO, options: { tipo: 'map[string]bool', mapa: true } }),
  configMapGenerator: lista('ConfigMapArgs', GERADOR),
  secretGenerator: lista('SecretArgs', { ...GERADOR, type: TEXTO }),
  generatorOptions: OPCOES_GERADOR,
};

// Números do YAML guardam o texto original: num campo de texto, `newTag: 2.0`
// continua "2.0", como no kustomize real (o sigs.k8s.io/yaml olha o tipo do campo).
class Numero {
  constructor(texto, valor) {
    this.texto = texto;
    this.valor = valor;
  }
}
const numero = (base) => new yaml.Type(base.tag, { kind: 'scalar', resolve: base.resolve, construct: (d) => new Numero(d, base.construct(d)) });
const YAML_K = yaml.FAILSAFE_SCHEMA.extend({ implicit: [yaml.types.null, yaml.types.bool, numero(yaml.types.int), numero(yaml.types.float)] });

const tipoJson = (v) => (v instanceof Numero ? 'number' : Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v === 'boolean' ? 'bool' : typeof v);

// Converte o que ficou sem esquema para valores comuns.
function comum(v) {
  if (v instanceof Numero) return v.valor;
  if (Array.isArray(v)) return v.map(comum);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([c, x]) => [c, comum(x)]));
  return v;
}

// Confere o tipo e devolve o valor normalizado.
function confere(valor, esq, dono, caminho) {
  if (valor === null || valor === undefined || esq === QUALQUER) return comum(valor);
  const t = tipoJson(valor);
  const erro = () => falha(`invalid Kustomization: json: cannot unmarshal ${t} into Go struct field ${dono}.${caminho} of type ${esq.tipo}`);
  if (esq === TEXTO) {
    if (t === 'object' || t === 'array') throw erro();
    return valor instanceof Numero ? valor.texto : String(valor);
  }
  if (esq === NUMERO) {
    if (t !== 'number' || !Number.isInteger(valor.valor)) throw erro();
    return valor.valor;
  }
  if (esq === BOOL) {
    if (t !== 'bool') throw erro();
    return valor;
  }
  if (esq.mapa) {
    if (t !== 'object') throw erro();
    const texto = esq.tipo === 'map[string]string';
    return Object.fromEntries(Object.entries(valor).map(([c, v]) => {
      const tv = tipoJson(v);
      if (tv === 'object' || tv === 'array') throw falha(`invalid Kustomization: json: cannot unmarshal ${tv} into Go struct field ${dono}.${caminho} of type ${esq.tipo.replace(/^map\[string\]/, '')}`);
      return [c, texto && v !== null ? (v instanceof Numero ? v.texto : String(v)) : comum(v)];
    }));
  }
  if (esq.item) {
    if (t !== 'array') throw erro();
    return valor.map((v) => confere(v, esq.item, dono, caminho));
  }
  if (t !== 'object') throw erro();
  return Object.fromEntries(Object.entries(valor).map(([c, v]) => {
    if (!esq.campos[c]) throw falha(`invalid Kustomization: json: unknown field "${c}"`);
    return [c, confere(v, esq.campos[c], esq.go, `${caminho}.${c}`)];
  }));
}

const validaTipos = (k) => Object.fromEntries(Object.entries(k).map(([campo, v]) => [campo, confere(v, ESQUEMA[campo], 'Kustomization', campo)]));

function carrega(fs, caminho, rotulo) {
  try {
    return yaml.loadAll(fs.read(caminho)).filter(Boolean);
  } catch (e) {
    throw falha(`accumulating resources: accumulation err='accumulating resources from '${rotulo}': yaml: line ${(e.mark?.line ?? 0) + 1}: ${e.reason || e.message}'`);
  }
}

// Todas as especificações de pod dentro de um objeto.
function podSpecs(o) {
  if (o.kind === 'Pod') return [o.spec];
  if (o.kind === 'CronJob') return [o.spec?.jobTemplate?.spec?.template?.spec].filter(Boolean);
  return [o.spec?.template?.spec].filter(Boolean);
}

// Atualiza referências a config maps, secrets e services renomeados.
function renomeiaRefs(objs, mapa) {
  const troca = (tipo, ref, campo = 'name') => {
    if (ref && mapa[`${tipo}/${ref[campo]}`]) ref[campo] = mapa[`${tipo}/${ref[campo]}`];
  };
  for (const o of objs) {
    for (const spec of podSpecs(o)) {
      for (const ct of [...(spec.containers || []), ...(spec.initContainers || [])]) {
        for (const f of ct.envFrom || []) {
          troca('ConfigMap', f.configMapRef);
          troca('Secret', f.secretRef);
        }
        for (const e of ct.env || []) {
          troca('ConfigMap', e.valueFrom?.configMapKeyRef);
          troca('Secret', e.valueFrom?.secretKeyRef);
        }
      }
      for (const v of spec.volumes || []) {
        troca('ConfigMap', v.configMap);
        troca('Secret', v.secret, 'secretName');
      }
    }
    if (o.kind === 'Route') troca('Service', o.spec?.to);
  }
}

function gera(fs, dir, lista, kind, opcoes, objs, mapa) {
  for (const g of lista || []) {
    if (!g.name) throw falha(`${kind} generator requires a name`);
    const dados = {};
    for (const l of g.literals || []) {
      const i = String(l).indexOf('=');
      if (i < 1) throw falha(`invalid literal source ${l}, expected key=value`);
      dados[l.slice(0, i)] = l.slice(i + 1);
    }
    for (const a of g.files || []) {
      const i = String(a).indexOf('=');
      const [chave, arq] = i > 0 ? [a.slice(0, i), a.slice(i + 1)] : [String(a).split('/').pop(), a];
      const p = fs.resolve(dir, arq);
      if (!fs.isFile(p)) throw falha(`loading KV pairs: file sources: [${a}]: evalsymlink failure on '${p}' : lstat ${p}: no such file or directory`);
      dados[chave] = fs.read(p);
    }
    for (const a of g.envs || []) {
      const p = fs.resolve(dir, a);
      if (!fs.isFile(p)) throw falha(`loading KV pairs: env source files: [${a}]: evalsymlink failure on '${p}' : lstat ${p}: no such file or directory`);
      for (const l of fs.read(p).split('\n')) {
        const i = l.indexOf('=');
        if (i > 0 && !l.trim().startsWith('#')) dados[l.slice(0, i).trim()] = l.slice(i + 1);
      }
    }
    const o = { apiVersion: 'v1', kind, metadata: { name: g.name }, data: kind === 'Secret' ? Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, b64.enc(v)])) : dados };
    if (g.namespace) o.metadata.namespace = g.namespace;
    if (kind === 'Secret') o.type = g.type || 'Opaque';
    const semHash = g.options?.disableNameSuffixHash ?? opcoes?.disableNameSuffixHash;
    if (!semHash) {
      o.metadata.name = `${g.name}-${hashId(JSON.stringify([kind, g.name, o.data]))}`;
      mapa[`${kind}/${g.name}`] = o.metadata.name;
    }
    const rotulos = { ...(opcoes?.labels || {}), ...(g.options?.labels || {}) };
    if (Object.keys(rotulos).length) o.metadata.labels = rotulos;
    objs.push(o);
  }
}

function aplicaPatch(objs, patch, alvo, rotulo) {
  const criterio = alvo || (Array.isArray(patch) ? null : { kind: patch.kind, name: patch.metadata?.name });
  if (!criterio) throw falha(`unable to parse SM or JSON patch from [${rotulo}]: a JSON patch requires a target`);
  const escolhidos = objs.filter((o) => (!criterio.kind || o.kind === criterio.kind) && (!criterio.name || o.metadata.name === criterio.name || o.metadata.name.startsWith(criterio.name + '-') && ['ConfigMap', 'Secret'].includes(o.kind)) && (!criterio.namespace || o.metadata.namespace === criterio.namespace));
  if (!escolhidos.length && !alvo) throw falha(`no matches for Id ${criterio.kind}.${criterio.name}; failed to find unique target for patch ${criterio.kind}.${criterio.name}`);
  for (const o of escolhidos) {
    if (Array.isArray(patch)) jsonPatch(o, patch);
    else {
      const { apiVersion, kind, ...resto } = patch;
      const p = clone(resto);
      if (p.metadata) delete p.metadata.name;
      fusaoEstrategica(o, p);
    }
  }
}

export function kustomize(fs, dir) {
  const arquivo = NOMES.map((n) => `${dir === '/' ? '' : dir}/${n}`).find((p) => fs.isFile(p));
  if (!fs.isDir(dir)) throw falha(`must build at directory: not a valid directory: evalsymlink failure on '${dir}' : lstat ${dir}: no such file or directory`);
  if (!arquivo) throw falha(`unable to find one of 'kustomization.yaml', 'kustomization.yml' or 'Kustomization' in directory '${dir}'`);
  let k;
  try {
    k = yaml.load(fs.read(arquivo), { schema: YAML_K }) || {};
  } catch (e) {
    throw falha(`invalid Kustomization: yaml: line ${(e.mark?.line ?? 0) + 1}: ${e.reason || e.message}`);
  }
  if (typeof k !== 'object' || Array.isArray(k)) throw falha('invalid Kustomization: json: cannot unmarshal into Go value of type types.Kustomization');
  for (const campo of Object.keys(k)) {
    if (!CAMPOS.has(campo)) throw falha(`invalid Kustomization: json: unknown field "${campo}"`);
  }
  k = validaTipos(k);

  let objs = [];
  for (const r of [...(k.resources || []), ...(k.bases || [])]) {
    if (/^https?:|^github\.com/.test(r)) throw new ApiError('[simulador] Kustomize com recursos remotos não é simulado.');
    const p = fs.resolve(dir, r);
    if (fs.isDir(p)) objs.push(...kustomize(fs, p));
    else if (fs.isFile(p)) {
      for (const d of carrega(fs, p, r)) {
        if (!d.kind || !d.metadata?.name) throw falha(`accumulating resources: accumulation err='accumulating resources from '${r}': missing kind or metadata.name in object'`);
        objs.push(d);
      }
    } else throw falha(`accumulating resources: accumulation err='accumulating resources from '${r}': evalsymlink failure on '${p}' : lstat ${p}: no such file or directory'`);
  }

  const mapa = {};
  gera(fs, dir, k.configMapGenerator, 'ConfigMap', k.generatorOptions, objs, mapa);
  gera(fs, dir, k.secretGenerator, 'Secret', k.generatorOptions, objs, mapa);

  for (const p of k.patchesStrategicMerge || []) {
    const docs = /\n/.test(p) ? yaml.loadAll(p).filter(Boolean) : carrega(fs, fs.resolve(dir, p), p);
    for (const d of docs) aplicaPatch(objs, d, null, p);
  }
  for (const p of k.patches || []) {
    let corpo;
    if (p.path) {
      const caminho = fs.resolve(dir, p.path);
      if (!fs.isFile(caminho)) throw falha(`trouble configuring builtin PatchTransformer with config: \`path: ${p.path}\`: failed to get the patch file from path(${p.path}): evalsymlink failure on '${caminho}' : lstat ${caminho}: no such file or directory`);
      corpo = yaml.load(fs.read(caminho));
    } else if (p.patch) corpo = yaml.load(p.patch);
    else throw falha('trouble configuring builtin PatchTransformer: must specify one of patch and path');
    aplicaPatch(objs, corpo, p.target, p.path || 'patch');
  }

  for (const r of k.replicas || []) {
    const alvos = objs.filter((o) => o.metadata.name === r.name && ['Deployment', 'StatefulSet', 'ReplicaSet'].includes(o.kind));
    if (!alvos.length) throw falha(`resource with name ${r.name ?? ''} does not match a config with the following GVK [Deployment.apps StatefulSet.apps ReplicaSet.apps]`);
    for (const o of alvos) o.spec.replicas = Number(r.count);
  }

  for (const i of k.images || []) {
    for (const o of objs) {
      for (const spec of podSpecs(o)) {
        for (const ct of [...(spec.containers || []), ...(spec.initContainers || [])]) {
          const ref = parseRef(ct.image);
          if (ref.repo !== i.name) continue;
          const repo = i.newName || ref.repo;
          if (i.digest) ct.image = `${repo}@${i.digest}`;
          else if (i.newTag !== undefined) ct.image = `${repo}:${i.newTag}`;
          else ct.image = ref.digest ? `${repo}@${ref.digest}` : `${repo}:${ref.tag}`;
        }
      }
    }
  }

  if (k.namePrefix || k.nameSuffix) {
    for (const o of objs) {
      if (o.kind === 'Namespace') continue;
      const novo = `${k.namePrefix || ''}${o.metadata.name}${k.nameSuffix || ''}`;
      // Referências podem citar tanto o nome original quanto o já gerado com hash.
      for (const [orig, atual] of Object.entries(mapa)) if (atual === o.metadata.name && orig.startsWith(o.kind + '/')) mapa[orig] = novo;
      mapa[`${o.kind}/${o.metadata.name}`] = novo;
      o.metadata.name = novo;
    }
  }
  renomeiaRefs(objs, mapa);

  if (k.namespace) {
    for (const o of objs) {
      const tipo = kindOf(o.kind);
      if (tipo && !tipo.namespaced && !tipo.alias) continue;
      o.metadata.namespace = k.namespace;
    }
  }

  const rotula = (pares, seletores, templates) => {
    for (const o of objs) {
      o.metadata.labels = { ...(o.metadata.labels || {}), ...pares };
      if (templates || seletores) {
        for (const tpl of [o.spec?.template, o.spec?.jobTemplate?.spec?.template].filter(Boolean)) {
          (tpl.metadata ??= {}).labels = { ...(tpl.metadata.labels || {}), ...pares };
        }
      }
      if (seletores) {
        if (o.spec?.selector?.matchLabels) Object.assign(o.spec.selector.matchLabels, pares);
        else if (o.kind === 'Service' && o.spec?.selector) Object.assign(o.spec.selector, pares);
      }
    }
  };
  if (k.commonLabels) rotula(k.commonLabels, true, true);
  for (const l of k.labels || []) rotula(l.pairs || {}, Boolean(l.includeSelectors), Boolean(l.includeTemplates));
  if (k.commonAnnotations) {
    for (const o of objs) o.metadata.annotations = { ...(o.metadata.annotations || {}), ...k.commonAnnotations };
  }
  return objs;
}
