// Comando `oc` simulado. Cada subcomando consulta ou altera o cluster simulado.
import yaml from '../../vendor/js-yaml.mjs';
import { ApiError, SERVER, APPS_DOMAIN } from '../cluster.js';
import { KINDS } from '../resources.js';
import { clone, parseSelector, deepEqual, b64, table, hashNum, rand } from '../util.js';
import { kustomize } from '../kustomize.js';
import { fusaoEstrategica, fusaoSimples, jsonPatch } from '../patch.js';
import { jsonpath, evalPath } from '../jsonpath.js';
import { findImage, parseRef, IMAGES } from '../images.js';
import { resolveEnv, podPronto } from '../controllers.js';
import { destinoTcp } from '../net.js';
import { VERSAO, KUBE } from '../seed.js';
import { parseArgs, ok, erro, naoSimulado, nsDe, alvos, umAlvo, lerManifestos, normaliza, tipoOuErro } from './args.js';
import { tabela, ordena, paraYaml, paraJson, descreve, podResumo } from './output.js';
import { ajuda } from './help.js';
import { explain as explica } from './explain.js';
import { contextoPod } from '../pod.js';
import { processa, parametros } from '../template.js';
import { autentica, pode, grupos } from '../rbac.js';
import { comUsuario, exige } from '../autoriza.js';
import { GERADORES_RBAC, authCmd, admIdentidade } from './identidade.js';
import { criaProjeto, configProjetos, templateInicial } from '../projetos.js';
import { jobDoCron } from '../jobs.js';
import { noHost } from '../no.js';
import { validaOpcoes, ajudaReal, ajudaOptions, versaoCliente, comandosRaiz } from './completar.js';
import { usoPod } from '../hpa.js';
import { render as renderGo } from '../gotemplate.js';
import { run, cp, autoscale, importImage, tag, setProbe, setTriggers, setImageLookup, config, completion, mustGather, inspect, nodeLogs, statusSts, registraContexto } from './do180.js';
import { resumoUpgrade, recomendadas, versaoAtual, kubeDa, imagemDa, CANAIS_DISPONIVEIS } from '../updates.js';

const APLICADO = 'kubectl.kubernetes.io/last-applied-configuration';

// Envia texto imediatamente ao terminal quando possível (comandos que esperam).
function emite(ctx, txt) {
  if (ctx.env.write) {
    ctx.env.write(txt);
    return '';
  }
  return txt;
}

const visao = (o, k) => (k.alias ? { ...o, kind: k.kind, apiVersion: k.apiVersion } : o);

function filtraCampos(itens, expr) {
  for (const parte of expr.split(',')) {
    const m = parte.match(/^([^!=]+)(!=|==|=)(.*)$/);
    if (!m) throw erro(`error: invalid field selector "${parte}"`);
    itens = itens.filter((o) => {
      const [v] = evalPath('.' + m[1], o);
      return (String(v ?? '') === m[3]) === (m[2] !== '!=');
    });
  }
  return itens;
}

// Seleciona objetos conforme os argumentos posicionais e os filtros.
function seleciona(ctx, pos, f, verbo) {
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  const todos = f.has('all-namespaces');
  return alvos(pos, verbo).map(({ k, nomes }) => {
    const r = c.tipo(k.kind);
    const tipoLista = k.alias ? k.kind : r.kind;
    let itens = nomes.length ? nomes.map((n) => c.must(tipoLista, n, ns)) : c.list(tipoLista, r.namespaced && !todos ? ns : null);
    if (f.has('selector')) {
      const sel = parseSelector(String(f.one('selector')));
      itens = itens.filter((o) => sel(o.metadata.labels));
    }
    if (f.has('field-selector')) itens = filtraCampos(itens, f.one('field-selector'));
    return { k, r, nomeado: nomes.length > 0, itens };
  });
}

// Manifesto com namespace diferente do -n informado: o oc real recusa.
function confereNs(ctx, f, o) {
  const pedido = f.one('namespace');
  const doArquivo = o.metadata?.namespace;
  if (pedido && doArquivo && pedido !== doArquivo && ctx.env.cluster.tipo(o.kind).namespaced) {
    throw erro(`error: the namespace from the provided object "${doArquivo}" does not match the namespace "${pedido}". You must pass '--namespace=${doArquivo}' to perform this operation.`);
  }
}

// Objeto novo não pode vir com resourceVersion (cópia de um export sem limpar).
function semVersao(c, o, ns, arquivo) {
  const k = c.tipo(o.kind);
  if (o.metadata?.resourceVersion && !c.get(k.kind, o.metadata.name, k.namespaced ? o.metadata.namespace || ns : undefined)) {
    throw new ApiError(`Error from server (BadRequest): error when creating "${arquivo}": resourceVersion should not be set on objects to be created`, 'BadRequest');
  }
}

// Cria o objeto ou, com --dry-run, apenas o exibe.
function entrega(ctx, f, obj, verbo = 'created') {
  const c = ctx.env.cluster;
  const k = tipoOuErro(obj.kind);
  const saida = f.one('output');
  const seco = f.has('dry-run');
  let final = obj;
  if (!seco) final = c.create(obj);
  else {
    final = { apiVersion: k.apiVersion, ...obj };
    final.metadata = { creationTimestamp: null, ...final.metadata };
  }
  if (saida === 'yaml') return ok(paraYaml(ordena(clone(final))));
  if (saida === 'json') return ok(paraJson(ordena(clone(final))));
  if (saida === 'name') return ok(`${k.out}/${obj.metadata.name}\n`);
  return ok(`${k.out}/${obj.metadata.name} ${verbo}${seco ? ' (dry run)' : ''}\n`);
}

// ------------------------------------------------------------------- get

async function get(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  const todos = f.has('all-namespaces');
  const grupos = seleciona(ctx, pos, f, 'get');
  if (f.has('sort-by')) {
    const caminho = String(f.one('sort-by')).replace(/^\{|\}$/g, '');
    for (const g of grupos) {
      g.itens = [...g.itens].sort((a, b) => {
        const [x] = evalPath(caminho, a);
        const [y] = evalPath(caminho, b);
        return x < y ? -1 : x > y ? 1 : 0;
      });
    }
  }
  const saida = String(f.one('output') || '');
  const total = grupos.reduce((n, g) => n + g.itens.length, 0);

  if (!saida || saida === 'wide') {
    if (!total) {
      const comNs = grupos.some((g) => g.r.namespaced) && !todos;
      return { err: comNs ? `No resources found in ${ns} namespace.\n` : 'No resources found\n', code: 0 };
    }
    const opcoesTabela = (semCabecalho) => ({ wide: saida === 'wide', labels: f.has('show-labels'), todosNs: todos, prefixo: grupos.length > 1, semCabecalho });
    const partes = grupos.filter((g) => g.itens.length).map((g) => tabela(g.k.alias ? g.k : g.r, g.itens, c, opcoesTabela(f.has('no-headers'))));
    if (!f.has('watch') || !ctx.env.write) return ok(partes.join('\n'));
    // -w: imprime a lista e depois cada mudança, até o Ctrl+C.
    emite(ctx, partes.join('\n'));
    const linha = (g, o) => tabela(g.k.alias ? g.k : g.r, [o], c, opcoesTabela(true));
    const vistos = new Map(grupos.flatMap((g) => g.itens.map((o) => [o.metadata.uid, linha(g, o)])));
    for (;;) {
      await ctx.env.sleep(1);
      for (const g of seleciona(ctx, pos, f, 'get')) {
        for (const o of g.itens) {
          const l = linha(g, o);
          if (vistos.get(o.metadata.uid) !== l) emite(ctx, l);
          vistos.set(o.metadata.uid, l);
        }
      }
    }
  }

  const planos = grupos.flatMap((g) => g.itens.map((o) => ordena(clone(visao(o, g.k)))));
  if (saida === 'name') return ok(grupos.flatMap((g) => g.itens.map((o) => `${g.k.out}/${o.metadata.name}\n`)).join(''));
  const unico = grupos.length === 1 && grupos[0].nomeado && planos.length === 1;
  const dados = unico ? planos[0] : { apiVersion: 'v1', items: planos, kind: 'List', metadata: { resourceVersion: '' } };
  if (saida === 'yaml') return ok(paraYaml(dados));
  if (saida === 'json') return ok(paraJson(dados));
  if (saida.startsWith('jsonpath=')) return ok(jsonpath(saida.slice(9), dados));
  if (saida.startsWith('custom-columns=')) {
    const cols = saida.slice(15).split(',').map((x) => {
      const i = x.indexOf(':');
      return [x.slice(0, i), x.slice(i + 1)];
    });
    const linhas = planos.map((o) => cols.map(([, caminho]) => {
      const v = evalPath(caminho, o);
      return v.length ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : x)).join(',') : '<none>';
    }));
    return ok(table(f.has('no-headers') ? linhas : [cols.map(([n]) => n), ...linhas]));
  }
  if (saida.startsWith('go-template')) throw naoSimulado(ctx, 'oc get -o go-template');
  throw erro(`error: unable to match a printer suitable for the output format "${saida}", allowed formats are: custom-columns,json,jsonpath,name,wide,yaml`);
}

function describe(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const grupos = seleciona(ctx, pos, f, 'describe');
  const partes = grupos.flatMap((g) => g.itens.map((o) => descreve(visao(o, g.k), c)));
  if (!partes.length) return { err: `No resources found in ${nsDe(ctx, f)} namespace.\n`, code: 0 };
  return ok(partes.join('\n\n'));
}

// ------------------------------------------------------------ apply / create

function poda(alvo, anterior, novo) {
  if (!anterior || typeof anterior !== 'object' || Array.isArray(anterior)) return;
  for (const k of Object.keys(anterior)) {
    if (novo == null || !(k in novo)) delete alvo[k];
    else if (alvo[k] && typeof alvo[k] === 'object' && !Array.isArray(alvo[k])) poda(alvo[k], anterior[k], novo[k]);
  }
}

function funde(alvo, novo) {
  for (const [k, v] of Object.entries(novo)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && alvo[k] && typeof alvo[k] === 'object' && !Array.isArray(alvo[k])) funde(alvo[k], v);
    else alvo[k] = clone(v);
  }
}

// Calcula o resultado de aplicar um manifesto, sem gravar nada.
function planeja(ctx, bruto, ns) {
  const c = ctx.env.cluster;
  const o = clone(normaliza(bruto));
  const k = c.tipo(o.kind);
  o.metadata ??= {};
  if (k.namespaced) o.metadata.namespace ??= ns;
  const atual = c.get(k.kind, o.metadata.name, o.metadata.namespace);
  const registro = JSON.stringify(o) + '\n';
  if (!atual) {
    const novo = clone(o);
    (novo.metadata.annotations ??= {})[APLICADO] = registro;
    return { k, o, atual: null, proximo: novo };
  }
  const proximo = clone(atual);
  const anterior = atual.metadata.annotations?.[APLICADO];
  if (anterior) {
    const antigo = JSON.parse(anterior);
    for (const chave of Object.keys(antigo)) {
      if (['apiVersion', 'kind', 'status'].includes(chave)) continue;
      if (chave === 'metadata') {
        for (const m of ['labels', 'annotations']) if (antigo.metadata[m]) poda((proximo.metadata[m] ??= {}), antigo.metadata[m], o.metadata[m] || {});
      } else if (!(chave in o)) delete proximo[chave];
      else poda(proximo[chave], antigo[chave], o[chave]);
    }
  }
  for (const [chave, v] of Object.entries(o)) {
    if (['apiVersion', 'kind', 'status'].includes(chave)) continue;
    if (chave === 'metadata') {
      for (const m of ['labels', 'annotations']) if (v[m]) funde((proximo.metadata[m] ??= {}), v[m]);
    } else if (v && typeof v === 'object' && !Array.isArray(v) && proximo[chave]) funde(proximo[chave], v);
    else proximo[chave] = clone(v);
  }
  (proximo.metadata.annotations ??= {})[APLICADO] = registro;
  // Reaplica os valores padrão do servidor, para que um manifesto idêntico
  // ao que já está no cluster resulte em "unchanged".
  c.padroes(proximo);
  return { k, o, atual, proximo };
}

function aplicaUm(ctx, bruto, ns) {
  const c = ctx.env.cluster;
  const p = planeja(ctx, bruto, ns);
  const nome = `${p.k.out}/${p.o.metadata.name}`;
  if (!p.atual) {
    c.create(p.proximo);
    return `${nome} created\n`;
  }
  if (deepEqual(p.proximo, p.atual)) return `${nome} unchanged\n`;
  c.update(p.proximo);
  return `${nome} configured\n`;
}

// Objetos indicados por -f (arquivos) ou -k (diretório do Kustomize).
function fontes(ctx, f) {
  if (f.has('kustomize')) {
    const dir = f.one('kustomize') === true ? '.' : f.one('kustomize');
    return kustomize(ctx.env.fs, ctx.env.fs.resolve(ctx.sh.cwd, dir));
  }
  if (!f.has('filename')) throw erro('error: must specify one of -f and -k');
  return lerManifestos(ctx, f);
}

function apply(ctx) {
  const { f } = parseArgs(ctx.args);
  const ns = nsDe(ctx, f);
  let out = '';
  let err = '';
  for (const o of fontes(ctx, f)) {
    try {
      confereNs(ctx, f, o);
      if (!f.has('dry-run')) semVersao(ctx.env.cluster, o, ns, f.one('filename') || f.one('kustomize'));
      out += f.has('dry-run') ? `${tipoOuErro(o.kind).out}/${o.metadata?.name} configured (dry run)\n` : aplicaUm(ctx, o, ns);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      err += e.message + '\n';
    }
  }
  return { out, err, code: err ? 1 : 0 };
}

function kustomizeCmd(ctx) {
  const { pos } = parseArgs(ctx.args);
  const objs = kustomize(ctx.env.fs, ctx.env.fs.resolve(ctx.sh.cwd, pos[0] || '.'));
  return ok(objs.map((o) => paraYaml(ordena(clone(o)))).join('---\n'));
}

// Diferença linha a linha, no formato unificado, com 3 linhas de contexto.
function difLinhas(a, b) {
  const n = a.length;
  const m = b.length;
  const t = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) ops.push([' ', a[i++], j++]);
    else if (i < n && (j >= m || t[i + 1][j] >= t[i][j + 1])) ops.push(['-', a[i++]]);
    else ops.push(['+', b[j++]]);
  }
  const perto = ops.map((_, x) => ops.slice(Math.max(0, x - 3), x + 4).some((o) => o[0] !== ' '));
  let out = '';
  let aberto = false;
  ops.forEach((o, x) => {
    if (!perto[x]) {
      aberto = false;
      return;
    }
    if (!aberto) out += '@@\n';
    aberto = true;
    out += `${o[0]}${o[1]}\n`;
  });
  return out;
}

function diff(ctx) {
  const { f } = parseArgs(ctx.args);
  const ns = nsDe(ctx, f);
  const limpa = (o) => {
    if (!o) return [];
    const x = clone(o);
    delete x.status;
    if (x.metadata.annotations) {
      delete x.metadata.annotations[APLICADO];
      if (!Object.keys(x.metadata.annotations).length) delete x.metadata.annotations;
    }
    return paraYaml(ordena(x)).trimEnd().split('\n');
  };
  let out = '';
  for (const bruto of fontes(ctx, f)) {
    const p = planeja(ctx, bruto, ns);
    const antes = limpa(p.atual);
    const depois = limpa(p.proximo);
    if (antes.join('\n') === depois.join('\n')) continue;
    const nome = `${p.k.apiVersion.replace('/', '.')}.${p.k.kind}.${p.o.metadata.namespace || ''}.${p.o.metadata.name}`;
    out += `diff -u -N /tmp/LIVE-1/${nome} /tmp/MERGED-1/${nome}\n--- /tmp/LIVE-1/${nome}\n+++ /tmp/MERGED-1/${nome}\n${difLinhas(antes, depois)}`;
  }
  // Como o diff real, sai com código 1 quando há diferenças.
  return { out, code: out ? 1 : 0 };
}

function dadosDe(ctx, f) {
  const fs = ctx.env.fs;
  const dados = {};
  for (const l of f.all('from-literal')) {
    const i = String(l).indexOf('=');
    if (i < 1) throw erro(`error: invalid literal source ${l}, expected key=value`);
    dados[l.slice(0, i)] = l.slice(i + 1);
  }
  for (const a of f.all('from-file')) {
    const i = String(a).indexOf('=');
    const [chave, arq] = i > 0 ? [a.slice(0, i), a.slice(i + 1)] : [null, a];
    const caminho = fs.resolve(ctx.sh.cwd, arq);
    if (fs.isDir(caminho)) for (const n of fs.ls(caminho)) if (fs.isFile(`${caminho}/${n}`)) dados[n] = fs.read(`${caminho}/${n}`);
    if (fs.isDir(caminho)) continue;
    if (!fs.isFile(caminho)) throw erro(`error: error reading ${arq}: no such file or directory`);
    dados[chave || arq.split('/').pop()] = fs.read(caminho);
  }
  for (const a of f.all('from-env-file')) {
    const caminho = fs.resolve(ctx.sh.cwd, a);
    if (!fs.isFile(caminho)) throw erro(`error: open ${a}: no such file or directory`);
    for (const linha of fs.read(caminho).split('\n')) {
      const t = linha.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 1) throw erro(`error: "${t}" is not a valid key name: a valid environment variable name must consist of alphabetic characters, digits, '_', '-', or '.', and must not start with a digit`);
      dados[t.slice(0, i)] = t.slice(i + 1);
    }
  }
  return dados;
}

const GERADORES = {
  namespace(ctx, pos) {
    return { kind: 'Namespace', metadata: { name: pos[0] } };
  },
  deployment(ctx, pos, f, resto) {
    if (!f.has('image')) throw erro('error: required flag(s) "image" not set');
    const nome = pos[0];
    const ct = { name: parseRef(f.one('image')).repo.split('/').pop(), image: f.one('image') };
    if (f.has('port')) ct.ports = [{ containerPort: Number(f.one('port')) }];
    if (resto?.length) ct.command = resto;
    return {
      kind: 'Deployment',
      metadata: { name: nome, labels: { app: nome } },
      spec: { replicas: Number(f.one('replicas') ?? 1), selector: { matchLabels: { app: nome } }, template: { metadata: { labels: { app: nome } }, spec: { containers: [ct] } } },
    };
  },
  configmap(ctx, pos, f) {
    return { kind: 'ConfigMap', metadata: { name: pos[0] }, data: dadosDe(ctx, f) };
  },
  secret(ctx, pos, f) {
    const [tipo, nome] = pos;
    if (tipo === 'generic') {
      const dados = dadosDe(ctx, f);
      return { kind: 'Secret', metadata: { name: nome }, type: f.one('type') || 'Opaque', data: Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, b64.enc(v)])) };
    }
    if (tipo === 'tls') {
      const le = (flag) => {
        if (!f.has(flag)) throw erro(`error: required flag(s) "${flag}" not set`);
        const p = ctx.env.fs.resolve(ctx.sh.cwd, f.one(flag));
        if (!ctx.env.fs.isFile(p)) throw erro(`error: open ${f.one(flag)}: no such file or directory`);
        return b64.enc(ctx.env.fs.read(p));
      };
      return { kind: 'Secret', metadata: { name: nome }, type: 'kubernetes.io/tls', data: { 'tls.crt': le('cert'), 'tls.key': le('key') } };
    }
    if (tipo === 'docker-registry') {
      const servidor = f.one('docker-server') || 'https://index.docker.io/v1/';
      const usuario = f.one('docker-username');
      const senha = f.one('docker-password');
      if (!usuario || !senha) throw erro('error: either --from-file or the combination of --docker-username, --docker-password and --docker-server is required');
      const conf = { auths: { [servidor]: { username: usuario, password: senha, ...(f.has('docker-email') ? { email: f.one('docker-email') } : {}), auth: b64.enc(`${usuario}:${senha}`) } } };
      return { kind: 'Secret', metadata: { name: nome }, type: 'kubernetes.io/dockerconfigjson', data: { '.dockerconfigjson': b64.enc(JSON.stringify(conf)) } };
    }
    throw desconhecido(tipo, 'create secret');
  },
  serviceaccount(ctx, pos) {
    return { kind: 'ServiceAccount', metadata: { name: pos[0] } };
  },
  service(ctx, pos, f) {
    const [tipo, nome] = pos;
    const mapa = { clusterip: 'ClusterIP', nodeport: 'NodePort', loadbalancer: 'LoadBalancer', externalname: 'ExternalName' };
    if (!mapa[tipo]) throw desconhecido(tipo, 'create service');
    if (!nome) throw erro('error: exactly one NAME is required, got 0');
    if (tipo === 'externalname') {
      if (!f.has('external-name')) throw erro('error: required flag(s) "external-name" not set');
      return { kind: 'Service', metadata: { name: nome, labels: { app: nome } }, spec: { type: 'ExternalName', externalName: f.one('external-name') } };
    }
    const portas = f.all('tcp').flatMap((t) => String(t).split(',')).map((t) => {
      const [porta, alvo] = t.split(':');
      return { name: `${porta}-${alvo || porta}`, port: Number(porta), targetPort: Number(alvo || porta), protocol: 'TCP' };
    });
    if (!portas.length && f.one('clusterip') !== 'None') throw erro('error: at least one tcp port specifier must be provided');
    if (tipo === 'nodeport' && f.has('node-port')) for (const p of portas) p.nodePort = Number(f.one('node-port'));
    const spec = { type: mapa[tipo], selector: { app: nome }, ports: portas };
    if (f.one('clusterip') === 'None') spec.clusterIP = 'None';
    return { kind: 'Service', metadata: { name: nome, labels: { app: nome } }, spec };
  },
  route(ctx, pos, f) {
    const [tipo, nomeArg] = pos;
    if (!['edge', 'passthrough', 'reencrypt'].includes(tipo)) throw desconhecido(tipo, 'create route');
    const svc = String(f.one('service') || '').replace(/^(services?|svc)\//, '');
    if (!svc) throw erro('error: you must specify a service via --service');
    const alvo = ctx.env.cluster.must('Service', svc, nsDe(ctx, f));
    const le = (flag) => {
      if (!f.has(flag)) return undefined;
      const p = ctx.env.fs.resolve(ctx.sh.cwd, f.one(flag));
      if (!ctx.env.fs.isFile(p)) throw erro(`error: open ${f.one(flag)}: no such file or directory`);
      return ctx.env.fs.read(p);
    };
    const tls = { termination: tipo };
    if (tipo !== 'passthrough') {
      for (const [flag, campo] of [['cert', 'certificate'], ['key', 'key'], ['ca-cert', 'caCertificate'], ['dest-ca-cert', 'destinationCACertificate']]) {
        const v = le(flag);
        if (v !== undefined) tls[campo] = v;
      }
    }
    if (f.has('insecure-policy')) {
      const pol = String(f.one('insecure-policy'));
      if (!['Allow', 'None', 'Redirect'].includes(pol)) throw erro(`error: invalid insecure policy "${pol}"`);
      if (tipo === 'passthrough' && pol === 'Allow') throw erro(`The Route "${nomeArg || svc}" is invalid: spec.tls.insecureEdgeTerminationPolicy: Invalid value: "Allow": InsecureEdgeTerminationPolicy is only allowed for edge termination; for passthrough termination only None and Redirect are valid`);
      tls.insecureEdgeTerminationPolicy = pol;
    }
    const rota = { kind: 'Route', metadata: { name: nomeArg || svc, labels: clone(alvo.metadata.labels) }, spec: { to: { kind: 'Service', name: svc }, tls } };
    if (f.has('hostname')) rota.spec.host = f.one('hostname');
    if (f.has('path')) rota.spec.path = f.one('path');
    const porta = f.one('port') ?? alvo.spec.ports?.[0]?.name ?? alvo.spec.ports?.[0]?.targetPort;
    if (porta !== undefined && porta !== '') rota.spec.port = { targetPort: /^\d+$/.test(String(porta)) ? Number(porta) : porta };
    return rota;
  },
};
function duros(f) {
  const hard = {};
  for (const item of f.all('hard').flatMap((x) => String(x).split(','))) {
    const i = item.indexOf('=');
    if (i < 1) throw erro(`error: invalid hard resource "${item}": expected key=value`);
    hard[item.slice(0, i).trim()] = item.slice(i + 1).trim();
  }
  return hard;
}
function pares(lista, rotulo) {
  const out = {};
  for (const item of lista.flatMap((x) => String(x).split(','))) {
    const i = item.indexOf('=');
    if (i < 1) throw erro(`error: invalid ${rotulo} "${item}"`);
    out[item.slice(0, i)] = item.slice(i + 1);
  }
  return out;
}
GERADORES.quota = (ctx, pos, f) => {
  const spec = { hard: duros(f) };
  if (f.has('scopes')) spec.scopes = String(f.one('scopes')).split(',');
  return { kind: 'ResourceQuota', metadata: { name: pos[0] }, spec };
};
GERADORES.resourcequota = GERADORES.quota;
GERADORES.job = (ctx, pos, f, resto) => {
  const nome = pos[0];
  if (f.has('from')) {
    const [tipo, origem] = String(f.one('from')).split('/');
    if (!/^(cronjob|cronjobs|cj)(\.batch)?$/.test(tipo) || !origem) throw erro(`error: from must be an existing cronjob: ${f.one('from')}`);
    return jobDoCron(ctx.env.cluster.must('CronJob', origem, nsDe(ctx, f)), nome, true);
  }
  if (!f.has('image')) throw erro('error: required flag(s) "image" not set');
  const ct = { name: nome, image: f.one('image'), ...(resto?.length ? { command: resto } : {}), resources: {} };
  return { kind: 'Job', metadata: { name: nome }, spec: { template: { spec: { containers: [ct], restartPolicy: 'Never' } } } };
};
GERADORES.cronjob = (ctx, pos, f, resto) => {
  const nome = pos[0];
  if (!f.has('image')) throw erro('error: required flag(s) "image" not set');
  if (!f.has('schedule')) throw erro('error: required flag(s) "schedule" not set');
  const ct = { name: nome, image: f.one('image'), ...(resto?.length ? { command: resto } : {}), resources: {} };
  return { kind: 'CronJob', metadata: { name: nome }, spec: { schedule: String(f.one('schedule')), jobTemplate: { metadata: { name: nome }, spec: { template: { spec: { containers: [ct], restartPolicy: f.one('restart') || 'OnFailure' } } } } } };
};
GERADORES.cj = GERADORES.cronjob;
GERADORES.clusterresourcequota = (ctx, pos, f) => {
  const rot = pares(f.all('project-label-selector'), 'label selector');
  const anot = pares(f.all('project-annotation-selector'), 'annotation selector');
  if (!Object.keys(rot).length && !Object.keys(anot).length) throw erro('error: one of --project-label-selector or --project-annotation-selector must be provided');
  const selector = {};
  if (Object.keys(rot).length) selector.labels = { matchLabels: rot };
  if (Object.keys(anot).length) selector.annotations = anot;
  return { kind: 'ClusterResourceQuota', metadata: { name: pos[0] }, spec: { quota: { hard: duros(f) }, selector } };
};
Object.assign(GERADORES, GERADORES_RBAC);
GERADORES.ns = GERADORES.namespace;

// Subcomandos de `oc create` que existem no oc real.
const CREATE_REAIS = ['build', 'clusterresourcequota', 'clusterrole', 'clusterrolebinding', 'configmap', 'cronjob', 'deployment', 'deploymentconfig', 'identity', 'imagestream', 'imagestreamtag', 'ingress', 'job', 'namespace', 'poddisruptionbudget', 'priorityclass', 'quota', 'role', 'rolebinding', 'route', 'secret', 'service', 'serviceaccount', 'token', 'user', 'useridentitymapping'];
// Subcomandos que agrupam outros e mostram a ajuda quando chamados sozinhos.
const CREATE_GRUPOS = ['secret', 'service', 'svc', 'route'];

const desconhecido = (tipo, comando) => erro(`error: unknown command "${tipo}"\nSee 'oc ${comando} -h' for help and examples`);
GERADORES.deploy = GERADORES.deployment;
GERADORES.cm = GERADORES.configmap;
GERADORES.sa = GERADORES.serviceaccount;
GERADORES.svc = GERADORES.service;

function create(ctx) {
  const { pos, f, resto } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  if (f.has('filename')) {
    let out = '';
    let err = '';
    for (const bruto of lerManifestos(ctx, f)) {
      try {
        const o = clone(normaliza(bruto));
        o.metadata ??= {};
        confereNs(ctx, f, o);
        if (c.tipo(o.kind).namespaced) o.metadata.namespace ??= ns;
        if (o.metadata.resourceVersion && !f.has('dry-run')) throw new ApiError(`Error from server (BadRequest): error when creating "${f.one('filename')}": resourceVersion should not be set on objects to be created`, 'BadRequest');
        out += entrega(ctx, f, o).out;
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        err += e.message + '\n';
      }
    }
    return { out, err, code: err ? 1 : 0 };
  }
  const [tipo, ...nomes] = pos;
  if (!tipo) throw erro('error: must specify one of -f and -k');
  const gerador = GERADORES[tipo];
  if (!gerador) {
    if (CREATE_REAIS.includes(tipo)) throw naoSimulado(ctx, `oc create ${tipo}`);
    throw desconhecido(tipo, 'create');
  }
  if (!nomes.length && CREATE_GRUPOS.includes(tipo)) return ok(ajuda(['create', tipo === 'svc' ? 'service' : tipo]));
  if (!nomes.length) throw erro('error: exactly one NAME is required, got 0');
  const obj = gerador(ctx, nomes, f, resto);
  if (c.tipo(obj.kind).namespaced) obj.metadata.namespace = ns;
  return entrega(ctx, f, obj);
}

function del(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  let lista = [];
  const porArquivo = f.has('filename') || f.has('kustomize');
  if (porArquivo) {
    for (const bruto of fontes(ctx, f)) {
      const o = normaliza(bruto);
      lista.push({ k: tipoOuErro(bruto.kind), nome: o.metadata.name, ns: o.metadata.namespace || ns });
    }
  } else {
    const temFiltro = f.has('all') || f.has('selector');
    for (const g of seleciona(ctx, pos, f, 'delete')) {
      if (!g.nomeado && !temFiltro) throw erro('error: resource(s) were provided, but no name was specified');
      for (const o of g.itens) lista.push({ k: g.k, nome: o.metadata.name, ns: o.metadata.namespace });
    }
  }
  if (!lista.length) return { err: 'No resources found\n', code: 0 };
  let out = '';
  let err = '';
  for (const { k, nome, ns: n } of lista) {
    const r = c.tipo(k.kind);
    try {
      if (r.kind === 'Namespace' && /^(default|kube-.*|openshift(-.*)?)$/.test(nome)) throw erro(`Error from server (Forbidden): namespaces "${nome}" is forbidden: this namespace may not be deleted`);
      if (!c.get(r.kind, nome, n)) {
        if (lista.length > 1 && !porArquivo) continue; // já removido em cascata
        c.must(r.kind, nome, n);
      }
      c.delete(r.kind, nome, n);
      out += r.namespaced ? `${k.out} "${nome}" deleted from ${n} namespace\n` : `${k.out} "${nome}" deleted\n`;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      err += e.message + '\n';
    }
  }
  return { out, err, code: err ? 1 : 0 };
}

// --------------------------------------------------------------- projetos

function newProject(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const nome = pos[0];
  if (!nome) throw erro('error: must have exactly one argument');
  const real = ctx.env.clusterReal || c;
  const usuario = ctx.env.usuario || ctx.env.session.user;
  if (!pode(real, usuario, 'create', 'projectrequests', 'project.openshift.io', null, undefined, ctx.env.gruposExtras)) {
    throw erro(`Error from server (Forbidden): ${configProjetos(real).projectRequestMessage || 'You may not request a new project via this API.'}`);
  }
  if (real.get('Namespace', nome)) throw erro(`Error from server (AlreadyExists): project.project.openshift.io "${nome}" already exists`);
  // O projeto sai do template configurado; quem pede vira admin dele.
  criaProjeto(real, { nome, usuario, display: f.one('display-name') || '', descricao: f.one('description') || '' });
  ctx.env.session.namespace = nome;
  return ok(`Now using project "${nome}" on server "${SERVER}".\n\nYou can add applications to this project with the 'new-app' command. For example, try:\n\n    oc new-app rails-postgresql-example\n\nto build a new example application in Ruby. Or use kubectl to deploy a simple Kubernetes application:\n\n    kubectl create deployment hello-node --image=registry.k8s.io/e2e-test-images/agnhost:2.43 -- /agnhost serve-hostname\n\n`);
}

function project(ctx) {
  const { pos } = parseArgs(ctx.args);
  const s = ctx.env.session;
  if (!pos.length) return ok(`Using project "${s.namespace}" on server "${SERVER}".\n`);
  const visiveis = ctx.env.cluster.list('Project').map((n) => n.metadata.name);
  if (!visiveis.includes(pos[0])) {
    if (!(ctx.env.clusterReal || ctx.env.cluster).get('Namespace', pos[0])) throw erro(`error: A project named "${pos[0]}" does not exist on "${SERVER}".\nYour projects are:\n${visiveis.map((n) => '* ' + n).join('\n')}\nTo see projects on another server, pass '--server=<server>'.`);
    throw erro(`error: You are not a member of project "${pos[0]}".\nYour projects are:\n${visiveis.map((n) => '* ' + n).join('\n')}`);
  }
  if (s.namespace === pos[0]) return ok(`Already on project "${pos[0]}" on server "${SERVER}".\n`);
  s.namespace = pos[0];
  return ok(`Now using project "${pos[0]}" on server "${SERVER}".\n`);
}

function projects(ctx) {
  const s = ctx.env.session;
  const nomes = ctx.env.cluster.list('Project').map((n) => n.metadata.name);
  if (!nomes.length) return ok("You are not a member of any projects. You can request a project to be created with the 'new-project' command.\n");
  return ok(`You have access to the following projects and can switch between them with ' project <projectname>':\n\n${nomes.map((n) => (n === s.namespace ? '  * ' : '    ') + n).join('\n')}\n\nUsing project "${s.namespace}" on server "${SERVER}".\n`);
}

const tokenDe = (u) => `sha256~${hashNum(u).toString(36)}SimuladoNaoEhUmTokenReal`;

async function login(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.clusterReal || ctx.env.cluster;
  const servidor = f.one('server') || pos[0];
  if (servidor) {
    const host = String(servidor).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^api\.lab\.example\.com(:6443)?$/.test(host)) return { err: `error: dial tcp: lookup ${host.split(':')[0]} on 172.25.250.254:53: no such host - verify you have provided the correct host and port and that the server is currently running.\n`, code: 1 };
  }
  let u = f.one('username');
  let p = f.one('password') ?? f.one('patch');
  let usuario;
  if (f.has('token')) {
    usuario = [...c.list('User').map((x) => x.metadata.name), 'kube:admin', 'admin'].find((x) => tokenDe(x) === f.one('token'));
    if (!usuario) return { err: 'error: The token provided is invalid or expired.\n\n', code: 1 };
  } else {
    const perguntar = (!u || u === true) || p === undefined || p === true;
    if (perguntar) {
      if (!ctx.env.ask) throw naoSimulado(ctx, ctx.env.t('oc login interativo', 'interactive oc login'));
      emite(ctx, `Authentication required for ${SERVER} (openshift)\n`);
      if (!u || u === true) u = (await ctx.env.ask('Username: ')).trim();
      if (p === undefined || p === true) p = await ctx.env.ask('Password: ', true);
    }
    const r = autentica(c, u, p);
    if (r.erro) return { err: 'Login failed (401 Unauthorized)\nVerify you have provided the correct credentials.\n', code: 1 };
    usuario = r.usuario;
  }
  const s = ctx.env.session;
  s.user = usuario;
  const visiveis = comUsuario(ctx, usuario).env.cluster.list('Project').map((n) => n.metadata.name);
  let out = 'Login successful.\n\n';
  if (!visiveis.length) {
    out += "You don't have any projects. You can try to create a new project, by running\n\n    oc new-project <projectname>\n\n";
    return ok(out);
  }
  if (!visiveis.includes(s.namespace)) s.namespace = visiveis.includes('default') ? 'default' : visiveis[0];
  if (visiveis.length === 1) out += `You have one project on this server: "${visiveis[0]}"\n\n`;
  else if (visiveis.length > 10) out += `You have access to ${visiveis.length} projects, the list has been suppressed. You can list all projects with 'oc projects'\n\n`;
  else out += `You have access to the following projects and can switch between them with 'oc project <projectname>':\n\n${visiveis.map((n) => (n === s.namespace ? '  * ' : '    ') + n).join('\n')}\n\n`;
  return ok(out + `Using project "${s.namespace}".\n`);
}

function whoami(ctx) {
  const { f } = parseArgs(ctx.args);
  if (f.has('show-server')) return ok(SERVER + '\n');
  if (f.has('show-console')) return ok(`https://console-openshift-console.${APPS_DOMAIN}\n`);
  if (f.has('show-token') || f.has('t')) return ok(`${tokenDe(ctx.env.session.user)}\n`);
  return ok(ctx.env.usuario + '\n');
}

// ------------------------------------------------------- new-app / expose

// Template indicado por --template, -f ou pelo nome (projeto atual ou `openshift`).
function acharTemplate(ctx, f, pos, ns) {
  const c = ctx.env.cluster;
  if (f.has('file') || f.has('filename')) {
    const ff = { all: (k) => (k === 'filename' ? [...f.all('file'), ...f.all('filename')] : []) };
    const t = lerManifestos(ctx, ff).find((o) => o.kind === 'Template');
    if (!t) throw erro('error: no template found in the file');
    return t;
  }
  const nome = f.one('template') || (pos[0] && !pos[0].includes('=') && !pos[0].includes('/') ? pos[0] : null);
  if (!nome) return null;
  const [nsT, n] = String(nome).includes('/') ? String(nome).split('/').filter(Boolean) : [null, nome];
  const t = nsT ? c.get('Template', n, nsT) : c.get('Template', n, ns) || c.get('Template', n, 'openshift');
  if (!t && f.has('template')) throw erro(`error: unable to locate any templates loaded in accessible projects with name "${nome}"`);
  return t || null;
}

function novoAppTemplate(ctx, f, tpl, ns) {
  const c = ctx.env.cluster;
  const informados = parametros(ctx.env.fs, ctx.sh.cwd, [...f.all('param'), ...f.all('p'), ...f.all('patch')], f.all('param-file'));
  const rotulos = Object.fromEntries(f.all('labels').concat(f.all('selector')).flatMap((l) => String(l).split(',')).map((x) => x.split('=')));
  const r = processa(tpl, informados, rotulos);
  const titulo = tpl.metadata.annotations?.['openshift.io/display-name'] || tpl.metadata.name;
  let out = `--> Deploying template "${tpl.metadata.namespace ? tpl.metadata.namespace + '/' : ''}${tpl.metadata.name}" ${tpl.metadata.namespace ? '' : 'for "' + (f.one('file') || f.one('filename')) + '" '}to project ${ns}\n\n`;
  out += `     ${titulo}\n     ${'-'.repeat(Math.min(titulo.length, 60))}\n     ${tpl.metadata.annotations?.description || ''}\n\n`;
  if (r.mensagem) out += r.mensagem.split('\n').map((l) => `     ${l}`).join('\n') + '\n\n';
  out += '     * With parameters:\n';
  for (const p of tpl.parameters || []) out += `        * ${p.displayName || p.name}=${r.valores[p.name]}${r.gerados.has(p.name) ? ' # generated' : ''}\n`;
  out += '\n--> Creating resources ...\n';
  let err = '';
  for (const o of r.objetos) {
    const k = tipoOuErro(o.kind);
    try {
      const x = clone(normaliza(o));
      if (c.tipo(x.kind).namespaced) x.metadata.namespace = ns;
      c.create(x);
      out += `    ${k.out === k.singular ? k.singular : k.out} "${o.metadata.name}" created\n`;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      err += `    error: ${e.message.replace(/^Error from server \(\w+\): /, '')}\n`;
    }
  }
  if (err) return { out: out + err + '--> Failed\n', code: 1 };
  out += '--> Success\n';
  const svc = r.objetos.find((o) => o.kind === 'Service');
  if (svc && !r.objetos.some((o) => o.kind === 'Route')) out += `    Application is not exposed. You can expose services to the outside world by executing one or more of the commands below:\n     'oc expose service/${svc.metadata.name}'\n`;
  else if (r.objetos.some((o) => o.kind === 'Route')) out += '    Access your application via route \'' + (c.get('Route', r.objetos.find((o) => o.kind === 'Route').metadata.name, ns)?.spec.host || '') + '\' \n';
  return ok(out + "    Run 'oc status' to view your app.\n");
}

function process(ctx) {
  const { pos, f } = parseArgs(ctx.args, ['parameters', 'local', 'ignore-unknown-parameters']);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  let tpl;
  const posicionais = pos.filter((p) => p.includes('=') && !p.includes('/'));
  const nomes = pos.filter((p) => !posicionais.includes(p));
  if (f.has('filename')) {
    tpl = lerManifestos(ctx, f).find((o) => o.kind === 'Template');
    if (!tpl) throw erro('error: unable to process template: no template found');
  } else {
    if (!nomes[0]) throw erro("error: must pass a template name or -f\nSee 'oc process -h' for help and examples");
    const [nsT, n] = nomes[0].includes('//') ? nomes[0].split('//') : [ns, nomes[0].replace(/^templates?(\.template\.openshift\.io)?\//, '')];
    tpl = c.get('Template', n, nsT);
    if (!tpl) throw erro(`Error from server (NotFound): templates.template.openshift.io "${n}" not found`);
  }
  if (f.has('parameters')) {
    const linhas = [['NAME', 'DESCRIPTION', 'GENERATOR', 'VALUE'], ...(tpl.parameters || []).map((p) => [p.name, (p.description || '').slice(0, 70), p.generate || '', p.generate ? p.from : p.value ?? ''])];
    return ok(table(linhas));
  }
  const informados = parametros(ctx.env.fs, ctx.sh.cwd, [...f.all('param'), ...f.all('p'), ...f.all('patch'), ...posicionais], f.all('param-file'));
  if (f.has('ignore-unknown-parameters')) for (const k of Object.keys(informados)) if (!(tpl.parameters || []).some((p) => p.name === k)) delete informados[k];
  const rotulos = Object.fromEntries(f.all('labels').concat(f.all('selector')).flatMap((l) => String(l).split(',')).map((x) => x.split('=')));
  const r = processa(tpl, informados, rotulos);
  const lista = { kind: 'List', apiVersion: 'v1', metadata: {}, items: r.objetos };
  const saida = String(f.one('output') || 'json');
  if (saida === 'yaml') return ok(paraYaml(lista));
  if (saida === 'name') return ok(r.objetos.map((o) => `${tipoOuErro(o.kind).out}/${o.metadata.name}\n`).join(''));
  if (saida === 'json') return ok(paraJson(lista));
  throw erro(`error: output format "${saida}" not recognized`);
}

function newApp(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  const tpl = acharTemplate(ctx, f, pos, ns);
  if (tpl) return novoAppTemplate(ctx, f, tpl, ns);
  const imagem = f.one('image') || f.one('docker-image') || pos[0];
  if (!imagem) throw erro('error: You must specify one or more images, image streams, templates, or source code locations to create an application.');
  if (/^https?:|\.git$|~/.test(imagem)) throw naoSimulado(ctx, ctx.env.t('oc new-app a partir de código-fonte', 'oc new-app from source code'));
  const achada = findImage(imagem);
  if (achada.error) throw erro(`error: unable to locate any images in image streams, local docker images with name "${imagem}"\n\nThe 'oc new-app' command will match arguments to the following types:\n\n  1. Images tagged into image streams in the current project or the 'openshift' project\n  2. Images in the container storage, on remote registries\n  3. Templates in the current project or the 'openshift' project\n  4. Git repository URLs or local paths that point to Git repositories\n\n--allow-missing-images can be used to point to an image that does not exist yet.`);
  const nome = f.one('name') || parseRef(imagem).repo.split('/').pop();
  const rotulos = { app: nome, 'app.kubernetes.io/component': nome, 'app.kubernetes.io/instance': nome };
  for (const l of [...f.all('labels'), ...f.all('selector')]) for (const par of String(l).split(',')) rotulos[par.split('=')[0]] = par.split('=')[1] ?? '';
  const ct = { name: nome, image: imagem };
  const env = f.all('env').map((e) => ({ name: String(e).split('=')[0], value: String(e).split('=').slice(1).join('=') }));
  if (env.length) ct.env = env;
  const porta = achada.image.port;
  if (porta) ct.ports = [{ containerPort: porta, protocol: 'TCP' }];
  const dep = { kind: 'Deployment', metadata: { name: nome, namespace: ns, labels: rotulos }, spec: { replicas: 1, selector: { matchLabels: { deployment: nome } }, template: { metadata: { labels: { deployment: nome } }, spec: { containers: [ct] } } } };
  if (f.has('dry-run')) return f.one('output') === 'yaml' ? ok(paraYaml(ordena({ apiVersion: 'apps/v1', ...dep }))) : ok(`deployment.apps "${nome}" created (dry run)\n`);
  let out = `--> Found container image ${achada.digest.slice(7, 14)} (3 weeks old) from ${parseRef(imagem).repo.split('/')[0]} for "${imagem}"\n\n    * An image stream tag will be created as "${nome}:${achada.tag}" that will track this image\n\n--> Creating resources ...\n`;
  c.create(dep);
  out += `    deployment.apps "${nome}" created\n`;
  if (porta) {
    c.create({ kind: 'Service', metadata: { name: nome, namespace: ns, labels: rotulos }, spec: { selector: { deployment: nome }, ports: [{ name: `${porta}-tcp`, port: porta, targetPort: porta, protocol: 'TCP' }] } });
    out += `    service "${nome}" created\n`;
  }
  out += '--> Success\n';
  if (porta) out += `    Application is not exposed. You can expose services to the outside world by executing one or more of the commands below:\n     'oc expose service/${nome}'\n`;
  return ok(out + "    Run 'oc status' to view your app.\n");
}

function expose(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  const { k, nome } = umAlvo(pos, 'expose');
  const o = c.must(k.kind, nome, ns);
  if (k.kind === 'Service') {
    const rota = { kind: 'Route', metadata: { name: f.one('name') || nome, namespace: ns, labels: clone(o.metadata.labels) }, spec: { to: { kind: 'Service', name: nome } } };
    if (f.has('hostname')) rota.spec.host = f.one('hostname');
    if (f.has('path')) rota.spec.path = f.one('path');
    const porta = f.one('port') || o.spec.ports?.[0]?.name || o.spec.ports?.[0]?.targetPort;
    if (porta) rota.spec.port = { targetPort: /^\d+$/.test(String(porta)) ? Number(porta) : porta };
    return entrega(ctx, f, rota, 'exposed');
  }
  if (k.kind === 'Deployment' || k.kind === 'Pod' || k.kind === 'ReplicaSet') {
    const spec = k.kind === 'Pod' ? o.spec : o.spec.template.spec;
    const porta = Number(f.one('port') ?? spec.containers[0].ports?.[0]?.containerPort);
    if (!porta) throw erro("error: couldn't find port via --port flag or introspection\nSee 'oc expose -h' for help and examples");
    const seletor = k.kind === 'Pod' ? o.metadata.labels : o.spec.selector.matchLabels;
    if (!seletor || !Object.keys(seletor).length) throw erro("error: couldn't retrieve selectors via --selector flag or introspection");
    const alvo = f.one('target-port');
    const svc = {
      kind: 'Service',
      metadata: { name: f.one('name') || nome, namespace: ns, labels: clone(o.metadata.labels) },
      spec: { type: f.one('type') || 'ClusterIP', selector: clone(seletor), ports: [{ port: porta, protocol: f.one('protocol') || 'TCP', targetPort: alvo === undefined ? porta : /^\d+$/.test(alvo) ? Number(alvo) : alvo }] },
    };
    return entrega(ctx, f, svc, 'exposed');
  }
  throw erro(`error: cannot expose a ${k.kind}`);
}

// ----------------------------------------------------- alterações pontuais

// Altera o template de pod de um deployment e grava.
function mudaTemplate(ctx, sub, k, nome, ns, fn) {
  const c = ctx.env.cluster;
  if (k.kind === 'Pod') {
    // Um pod em execução só aceita troca de imagem.
    if (sub !== 'image') throw erro(`The Pod "${nome}" is invalid: spec: Forbidden: pod updates may not change fields other than \`spec.containers[*].image\`,\`spec.initContainers[*].image\`,\`spec.activeDeadlineSeconds\`,\`spec.tolerations\` (only additions to existing tolerations),\`spec.terminationGracePeriodSeconds\` (allow it to be set to 1 if it was previously negative)`);
    const p = clone(c.must('Pod', nome, ns));
    const antes = JSON.stringify(p.spec);
    fn(p.spec, p);
    if (JSON.stringify(p.spec) === antes) return false;
    c.update(p);
    return true;
  }
  if (!['Deployment', 'ReplicaSet', 'StatefulSet', 'CronJob'].includes(k.kind)) {
    c.must(k.kind, nome, ns);
    throw erro(`error: ${k.plural}/${nome} the object is not a pod or does not have a pod template: *v1.${k.kind}`);
  }
  const d = clone(c.must(k.kind, nome, ns));
  // O template de pod de um CronJob fica dentro do jobTemplate.
  const modelo = k.kind === 'CronJob' ? d.spec.jobTemplate.spec : d.spec;
  const antes = JSON.stringify(modelo.template);
  fn(modelo.template.spec, d);
  if (JSON.stringify(modelo.template) === antes) return false;
  c.update(d);
  return true;
}

function quais(spec, f) {
  const alvo = f.one('container');
  const lista = alvo ? spec.containers.filter((x) => x.name === alvo) : spec.containers;
  if (!lista.length) throw erro(`error: unable to find container named "${alvo}"`);
  return lista;
}

// `oc set data`: troca chaves de um secret ou config map (ex.: o htpasswd do OAuth).
function setData(ctx, args) {
  const { pos, f } = parseArgs(args);
  const c = ctx.env.cluster;
  const { k, nome, resto } = umAlvo(pos, 'set data');
  if (k.kind !== 'Secret' && k.kind !== 'ConfigMap') throw erro(`error: ${k.plural}/${nome} is not a secret or config map`);
  const o = clone(c.must(k.kind, nome, nsDe(ctx, f)));
  const novos = dadosDe(ctx, f);
  for (const it of resto) {
    if (/^[^=]+-$/.test(it)) delete (o.data ??= {})[it.slice(0, -1)];
    else if (it.includes('=')) novos[it.slice(0, it.indexOf('='))] = it.slice(it.indexOf('=') + 1);
    else throw erro(`error: invalid key "${it}"`);
  }
  o.data ??= {};
  for (const [chave, v] of Object.entries(novos)) o.data[chave] = k.kind === 'Secret' ? b64.enc(v) : v;
  c.update(o);
  return ok(`${k.out}/${nome} data updated\n`);
}

function set(ctx) {
  let [sub, ...resto] = ctx.args;
  const { pos, f } = parseArgs(resto, ['read-only']);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  if (sub === 'volumes') sub = 'volume';
  if (sub === 'data') return setData(ctx, resto);
  if (!sub) return ok(ajuda(['set']));
  if (sub === 'serviceaccount' || sub === 'sa') {
    const { k, nome, resto: itens } = umAlvo(pos, 'set');
    const conta = itens[0];
    if (!conta) throw erro('error: serviceaccount is required');
    mudaTemplate(ctx, 'serviceaccount', k, nome, ns, (spec) => {
      spec.serviceAccountName = conta;
      delete spec.serviceAccount;
    });
    return ok(`${k.out}/${nome} serviceaccount updated\n`);
  }
  if (sub === 'probe') return setProbe(ctx, resto, mudaTemplate);
  if (sub === 'triggers') return setTriggers(ctx, resto, mudaTemplate);
  if (sub === 'image-lookup') return setImageLookup(ctx, resto);
  if (sub === 'selector') {
    const { k, nome, resto: itens } = umAlvo(pos, 'set');
    if (!itens.length) throw erro('error: at least one selector must be specified');
    const o = clone(c.must(k.kind, nome, ns));
    const sel = {};
    for (const it of String(itens[0]).split(',')) {
      if (!it.includes('=')) throw erro(`error: invalid selector "${it}"`);
      sel[it.split('=')[0]] = it.split('=').slice(1).join('=');
    }
    if (k.kind === 'Service') o.spec.selector = sel;
    else throw erro(`error: the object is not a service: ${k.plural}/${nome}`);
    c.update(o);
    return ok(`${k.out}/${nome} selector updated\n`);
  }
  if (!['env', 'image', 'resources', 'volume'].includes(sub)) {
    if (['build-hook', 'build-secret', 'data', 'deployment-hook', 'route-backends', 'subject'].includes(sub)) throw naoSimulado(ctx, `oc set ${sub}`);
    throw desconhecido(sub, 'set');
  }
  const { k, nome, resto: itens } = umAlvo(pos, 'set');

  if (sub === 'env') {
    if (f.has('list')) {
      const d = c.must(k.kind, nome, ns);
      const spec = k.kind === 'Pod' ? d.spec : d.spec.template.spec;
      let out = '';
      for (const ct of spec.containers) {
        out += `# ${k.plural}/${nome}, container ${ct.name}\n`;
        for (const e of ct.env || []) {
          const r = e.valueFrom?.secretKeyRef || e.valueFrom?.configMapKeyRef;
          out += r ? `# ${e.name} from ${e.valueFrom.secretKeyRef ? 'secret' : 'configmap'} ${r.name}, key ${r.key}\n` : `${e.name}=${e.value ?? ''}\n`;
        }
      }
      return ok(out);
    }
    const novos = [];
    const remove = [];
    for (const it of [...itens, ...f.all('env')]) {
      if (/^[^=]+-$/.test(it)) remove.push(it.slice(0, -1));
      else if (it.includes('=')) novos.push({ name: it.slice(0, it.indexOf('=')), value: it.slice(it.indexOf('=') + 1) });
      else throw erro(`error: invalid parameter assignment in "${it}"`);
    }
    if (f.has('from')) {
      const [tipo, origem] = String(f.one('from')).split('/');
      const kind = tipoOuErro(tipo).kind;
      if (kind !== 'Secret' && kind !== 'ConfigMap') throw erro('error: unsupported resource specified in --from');
      const fonte = c.must(kind, origem, ns);
      for (const chave of Object.keys(fonte.data || {})) {
        novos.push({ name: (f.one('prefix') || '') + chave.toUpperCase().replace(/[^A-Z0-9_]/g, '_'), valueFrom: { [kind === 'Secret' ? 'secretKeyRef' : 'configMapKeyRef']: { name: origem, key: chave } } });
      }
    }
    if (!novos.length && !remove.length) throw erro('error: at least one environment variable must be provided');
    mudaTemplate(ctx, sub, k, nome, ns, (spec) => {
      for (const ct of quais(spec, f)) {
        let env = (ct.env || []).filter((e) => !remove.includes(e.name) && !novos.some((n) => n.name === e.name));
        env = [...env, ...clone(novos)];
        if (env.length) ct.env = env;
        else delete ct.env;
      }
    });
    return ok(`${k.out}/${nome} updated\n`);
  }

  if (sub === 'image') {
    if (!itens.length) throw erro('error: at least one image update is required');
    const mudou = mudaTemplate(ctx, sub, k, nome, ns, (spec) => {
      for (const it of itens) {
        const i = it.indexOf('=');
        if (i < 1) throw erro(`error: invalid image update "${it}", expected CONTAINER=IMAGE`);
        const alvo = spec.containers.filter((x) => it.slice(0, i) === '*' || x.name === it.slice(0, i));
        if (!alvo.length) throw erro(`error: unable to find container named "${it.slice(0, i)}"`);
        for (const ct of alvo) ct.image = it.slice(i + 1);
      }
    });
    return ok(mudou ? `${k.out}/${nome} image updated\n` : '');
  }

  if (sub === 'volume') {
    if (!f.has('add') && !f.has('remove')) {
      const o = c.must(k.kind, nome, ns);
      const spec = k.kind === 'Pod' ? o.spec : o.spec.template?.spec;
      if (!spec) throw erro(`error: ${k.plural}/${nome} the object is not a pod or does not have a pod template: *v1.${k.kind}`);
      let out = `${k.plural}/${nome}\n`;
      for (const v of spec.volumes || []) {
        const fonte = v.configMap ? `configMap/${v.configMap.name}` : v.secret ? `secret/${v.secret.secretName}` : v.persistentVolumeClaim ? `pvc/${v.persistentVolumeClaim.claimName}` : v.hostPath ? `host path ${v.hostPath.path}` : 'empty directory';
        out += `  ${fonte} as ${v.name}\n`;
        for (const ct of spec.containers) for (const m of (ct.volumeMounts || []).filter((x) => x.name === v.name)) out += `    mounted at ${m.mountPath}${m.readOnly ? ' (read-only)' : ''}${spec.containers.length > 1 ? ` in container ${ct.name}` : ''}\n`;
      }
      return ok(out);
    }
    const nomeVol = f.one('name') || `volume-${rand(5)}`;
    if (f.has('remove')) {
      if (!f.has('name')) throw erro('error: must specify --name with --remove');
      mudaTemplate(ctx, sub, k, nome, ns, (spec) => {
        if (!(spec.volumes || []).some((v) => v.name === nomeVol)) throw erro(`error: volume '${nomeVol}' not found`);
        spec.volumes = spec.volumes.filter((v) => v.name !== nomeVol);
        if (!spec.volumes.length) delete spec.volumes;
        for (const ct of spec.containers) {
          if (!ct.volumeMounts) continue;
          ct.volumeMounts = ct.volumeMounts.filter((m) => m.name !== nomeVol);
          if (!ct.volumeMounts.length) delete ct.volumeMounts;
        }
      });
      return ok(`${k.out}/${nome} volume updated\n`);
    }
    const tipo = String(f.one('type') || (f.has('configmap-name') ? 'configmap' : f.has('secret-name') ? 'secret' : f.has('claim-name') ? 'pvc' : 'emptydir')).toLowerCase();
    const exige = (flag) => {
      if (!f.has(flag) || f.one(flag) === true) throw erro(`error: must provide --${flag} for --type=${tipo}`);
      return f.one(flag);
    };
    const vol = { name: nomeVol };
    let novoClaim = null;
    if (tipo === 'configmap') vol.configMap = { name: exige('configmap-name') };
    else if (tipo === 'secret') vol.secret = { secretName: exige('secret-name') };
    else if (tipo === 'pvc' || tipo === 'persistentvolumeclaim') {
      // Com --claim-size, o oc cria o PVC junto.
      if (f.has('claim-size')) {
        const modos = { rwo: 'ReadWriteOnce', rwx: 'ReadWriteMany', rox: 'ReadOnlyMany', rwop: 'ReadWriteOncePod' };
        const modo = String(f.one('claim-mode') || 'ReadWriteOnce');
        const claim = f.one('claim-name') || `pvc-${rand(5)}`;
        novoClaim = { kind: 'PersistentVolumeClaim', metadata: { name: claim, namespace: ns }, spec: { accessModes: [modos[modo.toLowerCase()] || modo], resources: { requests: { storage: f.one('claim-size') } }, ...(f.has('claim-class') ? { storageClassName: f.one('claim-class') } : {}) } };
        vol.persistentVolumeClaim = { claimName: claim };
      } else vol.persistentVolumeClaim = { claimName: exige('claim-name') };
    }
    else if (tipo === 'emptydir') vol.emptyDir = {};
    else if (tipo === 'hostpath') vol.hostPath = { path: exige('path') };
    else throw erro(`error: invalid volume type ${tipo}. Supported types: emptyDir, hostPath, secret, configmap, persistentVolumeClaim`);
    if (novoClaim) {
      if (c.get('PersistentVolumeClaim', novoClaim.metadata.name, ns)) throw erro(`Error from server (AlreadyExists): persistentvolumeclaims "${novoClaim.metadata.name}" already exists`);
      c.create(novoClaim);
    }
    mudaTemplate(ctx, sub, k, nome, ns, (spec) => {
      if ((spec.volumes || []).some((v) => v.name === nomeVol)) {
        if (!f.has('overwrite')) throw erro(`error: volume '${nomeVol}' already exists. Use --overwrite to replace`);
        spec.volumes = spec.volumes.filter((v) => v.name !== nomeVol);
        for (const ct of spec.containers) if (ct.volumeMounts) ct.volumeMounts = ct.volumeMounts.filter((m) => m.name !== nomeVol);
      }
      (spec.volumes ??= []).push(vol);
      if (f.has('mount-path')) {
        for (const ct of quais(spec, f)) {
          const m = { name: nomeVol, mountPath: f.one('mount-path') };
          if (f.has('sub-path')) m.subPath = f.one('sub-path');
          if (f.has('read-only')) m.readOnly = true;
          (ct.volumeMounts ??= []).push(m);
        }
      }
    });
    return ok(`${k.out}/${nome} volume updated\n`);
  }

  const le = (txt) => Object.fromEntries(String(txt).split(',').map((p) => p.split('=')));
  if (!f.has('limits') && !f.has('requests')) throw erro('error: you must specify an update for requests or limits');
  mudaTemplate(ctx, sub, k, nome, ns, (spec) => {
    for (const ct of quais(spec, f)) {
      ct.resources ??= {};
      if (f.has('limits')) ct.resources.limits = { ...ct.resources.limits, ...le(f.one('limits')) };
      if (f.has('requests')) ct.resources.requests = { ...ct.resources.requests, ...le(f.one('requests')) };
    }
  });
  return ok(`${k.out}/${nome} resource requirements updated\n`);
}

function scale(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  if (!f.has('replicas')) throw erro('error: required flag(s) "replicas" not set');
  const { k, nome } = umAlvo(pos, 'scale');
  if (!['Deployment', 'ReplicaSet', 'StatefulSet'].includes(k.kind)) throw erro(`error: could not find proper group-version for scale subresource of ${k.resource}`);
  const o = clone(c.must(k.kind, nome, nsDe(ctx, f)));
  o.spec.replicas = Number(f.one('replicas'));
  c.update(o);
  return ok(`${k.out}/${nome} scaled\n`);
}

function rotula(campo, verbo) {
  return (ctx) => {
    const { pos, f } = parseArgs(ctx.args);
    const c = ctx.env.cluster;
    const ns = nsDe(ctx, f);
    let k;
    let nomes;
    let itens;
    if (pos[0]?.includes('/')) {
      const a = umAlvo(pos, verbo);
      [k, nomes, itens] = [a.k, [a.nome], a.resto];
    } else {
      k = tipoOuErro(pos[0] ?? '');
      const i = pos.findIndex((p, n) => n > 0 && (p.includes('=') || p.endsWith('-')));
      nomes = pos.slice(1, i < 0 ? undefined : i);
      itens = i < 0 ? [] : pos.slice(i);
    }
    const r = c.tipo(k.kind);
    let objs = nomes.map((n) => c.must(r.kind, n, ns));
    if (f.has('selector')) {
      const sel = parseSelector(String(f.one('selector')));
      objs = c.list(r.kind, r.namespaced ? ns : null).filter((o) => sel(o.metadata.labels));
    } else if (f.has('all')) objs = c.list(r.kind, r.namespaced ? ns : null);
    if (!objs.length) throw erro('error: one or more resources must be specified as <resource> <name> or <resource>/<name>');
    if (!itens.length) throw erro(`error: at least one ${verbo} update is required`);
    let out = '';
    for (const atual of objs) {
      const o = clone(atual);
      const mapa = (o.metadata[campo] ??= {});
      for (const it of itens) {
        if (it.endsWith('-') && !it.includes('=')) delete mapa[it.slice(0, -1)];
        else {
          const chave = it.slice(0, it.indexOf('='));
          const valor = it.slice(it.indexOf('=') + 1);
          if (chave in mapa && mapa[chave] !== valor && !f.has('overwrite')) throw erro(`error: '${chave}' already has a value (${mapa[chave]}), and --overwrite is false`);
          mapa[chave] = valor;
        }
      }
      const mudou = !deepEqual(o.metadata[campo], atual.metadata[campo] || {});
      if (mudou) c.update(o);
      out += `${k.out}/${o.metadata.name} ${mudou ? verbo + (verbo === 'label' ? 'ed' : 'd') : 'not ' + verbo + (verbo === 'label' ? 'ed' : 'd')}\n`;
    }
    return ok(out);
  };
}

function patch(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const { k, nome } = umAlvo(pos, 'patch');
  if (!f.has('patch')) throw erro('error: must specify --patch or --patch-file containing the contents of the patch');
  let p;
  try {
    p = yaml.load(String(f.one('patch')));
  } catch {
    throw erro('error: unable to parse "patch": yaml: did not find expected node content');
  }
  const r = c.tipo(k.kind);
  const atual = c.must(r.kind, nome, nsDe(ctx, f));
  const o = clone(atual);
  const tipo = f.one('type') || 'strategic';
  if (tipo === 'json') jsonPatch(o, p);
  else if (tipo === 'merge') fusaoSimples(o, p);
  else if (tipo === 'strategic') fusaoEstrategica(o, p);
  else throw erro(`error: --type must be one of [json merge strategic], not "${tipo}"`);
  if (deepEqual(o, atual)) return ok(`${k.out}/${nome} patched (no change)\n`);
  c.update(o);
  return ok(`${k.out}/${nome} patched\n`);
}

async function edit(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const { k, nome } = umAlvo(pos, 'edit');
  const r = c.tipo(k.kind);
  const ns = nsDe(ctx, f);
  const atual = c.must(r.kind, nome, ns);
  if (!ctx.env.openEditor) throw erro('error: unable to launch the editor "vi"');
  const cabecalho = "# Please edit the object below. Lines beginning with a '#' will be ignored,\n# and an empty file will abort the edit. If an error occurs while saving this file will be\n# reopened with the relevant failures.\n#\n";
  const texto = await ctx.env.openEditor(`oc-edit-${nome}.yaml`, cabecalho + paraYaml(ordena(clone(visao(atual, k)))));
  if (texto === null || texto === undefined || !texto.replace(/^#.*$/gm, '').trim()) return ok('Edit cancelled, no changes made.\n');
  let novo;
  try {
    novo = yaml.load(texto);
  } catch (e) {
    throw erro(`error: error converting YAML to JSON: yaml: line ${(e.mark?.line ?? 0) + 1}: ${e.reason || 'could not parse'}`);
  }
  novo = normaliza(novo);
  if (novo.metadata?.name !== nome) throw erro(`error: the name of the object (${novo.metadata?.name}) does not match the name on the URL (${nome})`);
  novo.metadata.namespace = atual.metadata.namespace;
  novo.status = atual.status;
  if (deepEqual(novo, clone(atual))) return ok('Edit cancelled, no changes made.\n');
  c.update(novo);
  return ok(`${k.out}/${nome} edited\n`);
}

// ---------------------------------------------------------------- rollout

const donoDe = (filho, pai) => (filho.metadata.ownerReferences || []).some((r) => r.uid === pai.metadata.uid);
const REV = 'deployment.kubernetes.io/revision';

async function rollout(ctx) {
  const [sub, ...resto] = ctx.args;
  const { pos, f } = parseArgs(resto);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  if (!sub) return ok(ajuda(['rollout']));
  if (!['status', 'restart', 'history', 'undo', 'pause', 'resume'].includes(sub)) {
    if (['cancel', 'latest', 'retry'].includes(sub)) throw naoSimulado(ctx, `oc rollout ${sub}`);
    throw desconhecido(sub, 'rollout');
  }
  const { k, nome } = umAlvo(pos, 'rollout');
  if (k.kind === 'StatefulSet' && sub === 'status') return statusSts(ctx, nome, ns);
  if (k.kind === 'StatefulSet' && sub === 'restart') {
    const novo = clone(c.must('StatefulSet', nome, ns));
    ((novo.spec.template.metadata ??= {}).annotations ??= {})['kubectl.kubernetes.io/restartedAt'] = c.iso();
    c.update(novo);
    return ok(`statefulset.apps/${nome} restarted\n`);
  }
  if (k.kind !== 'Deployment') throw erro(`error: no ${sub === 'undo' ? 'rollbacker' : sub === 'history' ? 'history viewer' : sub === 'status' ? 'status viewer' : 'handler'} has been implemented for "${k.kind}"`);
  const d = c.must('Deployment', nome, ns);
  const rss = () => c.list('ReplicaSet', ns).filter((r) => donoDe(r, d)).sort((a, b) => Number(a.metadata.annotations[REV]) - Number(b.metadata.annotations[REV]));

  if (sub === 'status') {
    let out = '';
    let ultima = '';
    for (let i = 0; i <= 120; i++) {
      const atual = c.must('Deployment', nome, ns);
      const st = atual.status || {};
      const n = atual.spec.replicas;
      if ((st.updatedReplicas || 0) >= n && (st.readyReplicas || 0) >= n && (st.replicas || 0) === n) return ok(out + `deployment "${nome}" successfully rolled out\n`);
      const msg = (st.updatedReplicas || 0) < n
        ? `Waiting for deployment "${nome}" rollout to finish: ${st.updatedReplicas || 0} out of ${n} new replicas have been updated...\n`
        : (st.replicas || 0) > n && (st.availableReplicas || 0) >= (st.replicas || 0)
          ? `Waiting for deployment "${nome}" rollout to finish: ${(st.replicas || 0) - n} old replicas are pending termination...\n`
          : `Waiting for deployment "${nome}" rollout to finish: ${Math.max(0, (st.availableReplicas || 0) - ((st.replicas || 0) - (st.updatedReplicas || 0)))} of ${n} updated replicas are available...\n`;
      if (msg !== ultima) out += emite(ctx, msg);
      ultima = msg;
      await ctx.env.sleep(1);
    }
    return { out, err: 'error: timed out waiting for the condition\n', code: 1 };
  }

  if (sub === 'pause' || sub === 'resume') {
    const pausar = sub === 'pause';
    if (Boolean(d.spec.paused) === pausar) throw erro(`error: deployments.apps "${nome}" is ${pausar ? 'already paused' : 'not paused'}`);
    const novo = clone(d);
    if (pausar) novo.spec.paused = true;
    else delete novo.spec.paused;
    c.update(novo);
    return ok(`deployment.apps/${nome} ${pausar ? 'paused' : 'resumed'}\n`);
  }

  if (sub === 'restart') {
    const novo = clone(d);
    ((novo.spec.template.metadata ??= {}).annotations ??= {})['kubectl.kubernetes.io/restartedAt'] = c.iso();
    c.update(novo);
    return ok(`deployment.apps/${nome} restarted\n`);
  }

  if (sub === 'history') {
    const linhas = rss().map((r) => `${String(r.metadata.annotations[REV]).padEnd(10)}${r.metadata.annotations['kubernetes.io/change-cause'] || '<none>'}`);
    return ok(`deployment.apps/${nome} \nREVISION  CHANGE-CAUSE\n${linhas.join('\n')}\n\n`);
  }

  const lista = rss();
  const alvoRev = f.has('to-revision') ? Number(f.one('to-revision')) : null;
  const destino = alvoRev ? lista.find((r) => Number(r.metadata.annotations[REV]) === alvoRev) : lista.at(-2);
  if (!destino) throw erro(alvoRev ? `error: unable to find specified revision ${alvoRev} in history` : 'error: no rollout history found for deployment "' + nome + '"');
  if (destino.metadata.annotations[REV] === d.metadata.annotations?.[REV]) return ok(`deployment.apps/${nome} skipped rollback (current template already matches revision ${destino.metadata.annotations[REV]})\n`);
  const novo = clone(d);
  const tpl = clone(destino.spec.template);
  delete tpl.metadata.labels['pod-template-hash'];
  novo.spec.template = tpl;
  c.update(novo);
  return ok(`deployment.apps/${nome} rolled back\n`);
}

// ---------------------------------------------------------- logs e exec

// Resolve um pod a partir de `pod`, `pod/x`, `deploy/x`...
function achaPod(ctx, alvo, ns, comando = 'logs') {
  const c = ctx.env.cluster;
  if (!alvo) {
    if (comando === 'exec') throw erro("error: expected 'exec (POD | TYPE/NAME) [-c CONTAINER] [flags] -- COMMAND [args...]'.\nPOD or TYPE/NAME is a required argument for the exec command\nSee 'oc exec -h' for help and examples");
    if (comando === 'rsh') throw erro("error: rsh requires a single Pod to connect to\nSee 'oc rsh -h' for help and examples");
    throw erro('error: expected \'logs [-f] [-p] (POD | TYPE/NAME) [-c CONTAINER]\'.\nPOD or TYPE/NAME is a required argument for the logs command');
  }
  if (!alvo.includes('/')) return { pod: c.must('Pod', alvo, ns) };
  const k = tipoOuErro(alvo.split('/')[0]);
  const nome = alvo.slice(alvo.indexOf('/') + 1);
  if (k.kind === 'Pod') return { pod: c.must('Pod', nome, ns) };
  const dono = c.must(k.kind, nome, ns);
  let pods = [];
  if (k.kind === 'Deployment') {
    const rs = c.list('ReplicaSet', ns).filter((r) => donoDe(r, dono) && r.metadata.annotations?.[REV] === dono.metadata.annotations?.[REV]);
    pods = c.list('Pod', ns).filter((p) => rs.some((r) => donoDe(p, r)));
  } else pods = c.list('Pod', ns).filter((p) => donoDe(p, dono));
  if (!pods.length) throw erro(`error: no pods found for ${k.out}/${nome}`);
  return { pod: pods[0], aviso: pods.length > 1 ? `Found ${pods.length} pods, using pod/${pods[0].metadata.name}\n` : '' };
}

async function logs(ctx) {
  const { pos, f } = parseArgs(ctx.args, ['patch', 'filename']);
  const c = ctx.env.cluster;
  const { pod, aviso = '' } = achaPod(ctx, pos[0], nsDe(ctx, f), 'logs');
  exige(ctx, 'get', 'pods/log', '', pod.metadata.namespace, pod.metadata.name);
  const ct = f.one('container') || pos[1] || pod.spec.containers[0].name;
  if (!pod.spec.containers.some((x) => x.name === ct)) throw erro(`error: container ${ct} is not valid for pod ${pod.metadata.name}`);
  const reg = c.side[pod.metadata.uid]?.logs?.[ct];
  const esperando = (motivo) => ({ err: aviso + `Error from server (BadRequest): container "${ct}" in pod "${pod.metadata.name}" is waiting to start: ${motivo}\n`, code: 1 });
  if (!reg) return esperando('ContainerCreating');
  if (reg.espera) return esperando(reg.espera);
  let linhas = reg.linhas;
  // Imagem cujo log reflete a conexão feita agora (ex.: cliente do banco).
  const conecta = findImage(pod.spec.containers[0].image).image?.conecta;
  if (conecta && pod.status?.phase === 'Running') {
    const env = resolveEnv(c, pod, pod.spec.containers[0]).env;
    linhas = conecta(env, destinoTcp(c, pod, env.DB_HOST || '', Number(env.DB_PORT || 3306)));
  }
  if (f.has('tail')) linhas = linhas.slice(-Number(f.one('tail')));
  const texto = linhas.length ? linhas.join('\n') + '\n' : '';
  if (!f.has('follow') || !ctx.env.write) return { err: aviso, out: texto, code: 0 };
  // -f: segue o log até o Ctrl+C ou até o pod deixar de existir.
  emite(ctx, aviso + texto);
  let vistas = reg.linhas.length;
  for (;;) {
    await ctx.env.sleep(1);
    const atual = c.get('Pod', pod.metadata.name, pod.metadata.namespace);
    if (!atual || atual.metadata.uid !== pod.metadata.uid) return ok();
    const novas = c.side[pod.metadata.uid]?.logs?.[ct]?.linhas || [];
    if (novas.length > vistas) emite(ctx, novas.slice(vistas).join('\n') + '\n');
    vistas = novas.length;
  }
}

const SHELLS = ['sh', 'bash', '/bin/sh', '/bin/bash', '/usr/bin/sh', '/usr/bin/bash'];

// `oc exec` e `oc rsh`: executa um comando no contêiner ou abre um shell nele.
// Como no oc real, as opções do oc terminam no nome do pod: o que vem
// depois pertence ao comando executado no contêiner.
function separaComando(args) {
  const comValor = new Set(['-c', '--container', '-n', '--namespace', '--shell', '--timeout', '--pod-running-timeout']);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') return { opcoes: args.slice(0, i), comando: args.slice(i + 1), traco: true };
    if (comValor.has(a)) i++;
    else if (!a.startsWith('-')) {
      // Opções do oc ainda podem vir entre o pod e o `--` (ex.: `oc exec pod -c app -- ls`).
      let j = i + 1;
      const extras = [];
      while (j < args.length && args[j] !== '--' && args[j].startsWith('-') && args.includes('--', j)) {
        extras.push(args[j]);
        if (comValor.has(args[j])) extras.push(args[++j]);
        j++;
      }
      if (args[j] === '--') return { opcoes: [...args.slice(0, i + 1), ...extras], comando: args.slice(j + 1), traco: true };
      return { opcoes: args.slice(0, i + 1), comando: args.slice(i + 1), traco: false };
    }
  }
  return { opcoes: args, comando: [], traco: false };
}

async function exec(ctx, rsh = false) {
  const partes = separaComando(ctx.args);
  const { pos, f } = parseArgs(partes.opcoes, ['T', 'quiet', 'q']);
  const resto = partes.traco || partes.comando.length ? partes.comando : null;
  const c = ctx.env.cluster;
  const { pod } = achaPod(ctx, pos[0], nsDe(ctx, f), rsh ? 'rsh' : 'exec');
  exige(ctx, 'create', 'pods/exec', '', pod.metadata.namespace, pod.metadata.name);
  const nomeCt = f.one('container') || pod.spec.containers[0].name;
  const ct = pod.spec.containers.find((x) => x.name === nomeCt);
  if (!ct) throw erro(`error: container ${nomeCt} not found in pod ${pod.metadata.name}`);
  const estado = pod.status.containerStatuses?.find((x) => x.name === nomeCt);
  if (!estado?.state.running) {
    if (pod.status.phase === 'Succeeded' || pod.status.phase === 'Failed') throw erro(`error: cannot exec into a container in a completed pod; current phase is ${pod.status.phase}`);
    throw erro(`error: unable to upgrade connection: container not found ("${nomeCt}")`);
  }
  let cmd = resto || pos.slice(1);
  if (rsh && !cmd.length) cmd = [String(f.one('shell') || '/bin/sh')];
  if (!cmd.length) throw erro("error: you must specify at least one command for the container\nSee 'oc exec -h' for help and examples");
  const it = rsh ? !f.has('T') : (f.has('it') || f.has('ti') || (f.has('stdin') && f.has('tty')) || (f.has('i') && f.has('t')));
  const soShell = cmd.length === 1 && SHELLS.includes(cmd[0]);
  const shell = cmd[0].includes('bash') ? 'bash' : 'sh';
  const contexto = contextoPod(ctx.env, pod, ct, shell);

  if (soShell && it) {
    ctx.sh.entraPod(contexto);
    return ok();
  }
  let r;
  if (soShell) {
    // Sem terminal, o shell lê a entrada padrão e termina.
    const script = f.has('stdin') || f.has('i') ? ctx.stdin : '';
    r = script ? await ctx.sh.noPod(contexto, () => ctx.sh.run(script, { sub: true })) : { out: '', code: 0 };
  } else {
    r = await ctx.sh.noPod(contexto, () => ctx.sh.exec(cmd, ctx.stdin));
  }
  return { out: r.out || '', err: r.err || '', fim: r.code ? `command terminated with exit code ${r.code}\n` : '', code: r.code || 0 };
}

async function wait(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const para = String(f.one('for') || '');
  if (!para) throw erro('error: --for is required');
  const limite = parseInt(f.one('timeout') ?? '30', 10);
  const m = para.match(/^condition=([^=]+)(?:=(.*))?$/i);
  const jp = para.match(/^jsonpath=(\{.*\})(?:=(.*))?$/);
  if (!m && !jp && para !== 'delete') throw erro(`error: unrecognized condition: "${para}"`);
  let out = '';
  for (let t = 0; t <= limite; t++) {
    let grupos;
    try {
      grupos = seleciona(ctx, pos, f, 'wait');
    } catch (e) {
      if (para === 'delete' && e instanceof ApiError) return ok(out);
      throw e;
    }
    const itens = grupos.flatMap((g) => g.itens.map((o) => ({ o, k: g.k })));
    if (para === 'delete') {
      if (!itens.length) return ok(out);
    } else {
      if (!itens.length) throw erro('error: no matching resources found');
      const atende = (o) => {
        if (jp) {
          const v = evalPath(jp[1].slice(1, -1), ordena(clone(o)));
          return jp[2] === undefined ? v.length > 0 : v.some((x) => String(x) === jp[2]);
        }
        return (o.status?.conditions || []).some((x) => x.type.toLowerCase() === m[1].toLowerCase() && x.status.toLowerCase() === (m[2] || 'true').toLowerCase());
      };
      const pendentes = itens.filter(({ o }) => !atende(o));
      if (!pendentes.length) return ok(itens.map(({ o, k }) => `${k.out}/${o.metadata.name} condition met\n`).join(''));
      if (t === limite) return { err: pendentes.map(({ o, k }) => `error: timed out waiting for the condition on ${k.plural}/${o.metadata.name}\n`).join(''), code: 1 };
    }
    await ctx.env.sleep(1);
  }
  return { err: 'error: timed out waiting for the condition\n', code: 1 };
}

function extract(ctx) {
  const { pos, f } = parseArgs(ctx.args, ['confirm']);
  const c = ctx.env.cluster;
  const fs = ctx.env.fs;
  const { k, nome } = umAlvo(pos, 'extract');
  if (k.kind !== 'Secret' && k.kind !== 'ConfigMap') throw erro(`error: ${k.plural}/${nome} is not a secret or config map`);
  const o = c.must(k.kind, nome, nsDe(ctx, f));
  const chaves = f.has('keys') ? f.all('keys').flatMap((x) => String(x).split(',')) : Object.keys(o.data || {});
  const destino = f.one('to') ?? '.';
  let out = '';
  let err = '';
  for (const chave of chaves) {
    if (!(chave in (o.data || {}))) continue;
    const valor = k.kind === 'Secret' ? b64.dec(o.data[chave]) : o.data[chave];
    if (destino === '-') {
      out += `# ${chave}\n${valor.endsWith('\n') ? valor : valor + '\n'}`;
      continue;
    }
    const dir = fs.resolve(ctx.sh.cwd, destino);
    if (!fs.isDir(dir)) throw erro(`error: stat ${destino}: no such file or directory`);
    const arq = `${dir}/${chave}`;
    if (fs.isFile(arq) && !f.has('confirm')) {
      err += `error: ${destino}/${chave}: file exists, pass --confirm to overwrite\n`;
      continue;
    }
    fs.write(arq, valor);
    out += `${destino}/${chave}\n`;
  }
  // Com --to=-, cada valor é precedido por um comentário com o nome da chave.
  return { out, err, code: err ? 1 : 0 };
}

// ------------------------------------------------------------ informações

function status(ctx) {
  const { f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  let out = `In project ${ns} on server ${SERVER}\n\n`;
  const deps = c.list('Deployment', ns);
  const svcs = c.list('Service', ns);
  const rotas = c.list('Route', ns);
  const erros = [];
  for (const d of deps) {
    const svc = svcs.find((s) => s.spec.selector && Object.entries(s.spec.selector).every(([k, v]) => d.spec.template.metadata?.labels?.[k] === v));
    const rota = svc && rotas.find((r) => r.spec.to.name === svc.metadata.name);
    if (rota) out += `http${rota.spec.tls ? 's' : ''}://${rota.spec.host} to pod port ${rota.spec.port?.targetPort ?? '<all>'} (svc/${svc.metadata.name})\n`;
    else if (svc) out += `svc/${svc.metadata.name} - ${svc.spec.clusterIP}:${svc.spec.ports[0].port}\n`;
    out += `  deployment/${d.metadata.name} deploys ${d.spec.template.spec.containers.map((x) => x.image).join(',')}\n`;
    out += `    deployment #${d.metadata.annotations?.[REV] || 1} running - ${d.status.readyReplicas || 0}/${d.spec.replicas} pods\n\n`;
  }
  for (const p of c.list('Pod', ns)) {
    const r = podResumo(p);
    if (r.status === 'CrashLoopBackOff') erros.push(`  * pod/${p.metadata.name} is crash-looping\n`);
    if (r.status === 'ImagePullBackOff' || r.status === 'ErrImagePull') erros.push(`  * pod/${p.metadata.name} is unable to pull its image\n`);
  }
  if (!deps.length) out += "You have no services, deployment configs, or build configs.\nRun 'oc new-app' to create an application.\n";
  if (erros.length) out += `Errors:\n${erros.join('')}\n`;
  return ok(out + (deps.length ? `${erros.length ? erros.length + ' error' + (erros.length > 1 ? 's' : '') + ', ' : ''}View details with 'oc describe <resource>/<name>' or list resources with 'oc get all'.\n` : ''));
}

function version(ctx) {
  const { f } = parseArgs(ctx.args);
  const cliente = `${versaoCliente()}\n`;
  const v = versaoAtual(ctx.env.clusterReal || ctx.env.cluster);
  return ok(f.has('client') ? cliente : cliente + `Server Version: ${v}\nKubernetes Version: ${kubeDa(v)}\n`);
}

function apiResources() {
  const linhas = [['NAME', 'SHORTNAMES', 'APIVERSION', 'NAMESPACED', 'KIND']];
  for (const k of KINDS) linhas.push([k.plural, k.short.join(','), k.apiVersion, String(k.namespaced), k.kind]);
  return ok(table(linhas));
}

// `oc debug node/NOME -- chroot /host COMANDO`.
function debug(ctx) {
  const { pos, resto } = parseArgs(ctx.args);
  const alvo = pos[0];
  if (!alvo) throw erro('error: you must specify a resource, a name, or a file to debug');
  const m = alvo.match(/^(nodes?|no)\/(.+)$/);
  if (!m) throw naoSimulado(ctx, `oc debug ${alvo.split('/')[0]}`);
  const real = ctx.env.clusterReal || ctx.env.cluster;
  const usuario = ctx.env.usuario || ctx.env.session.user;
  if (!pode(real, usuario, 'create', 'pods', '', 'default', undefined, ctx.env.gruposExtras) || !pode(real, usuario, 'get', 'nodes', '', null, undefined, ctx.env.gruposExtras)) {
    throw erro(`Error from server (Forbidden): nodes "${m[2]}" is forbidden: User "${usuario}" cannot get resource "nodes" in API group "" at the cluster scope`);
  }
  const no = real.must('Node', m[2]);
  const inicio = `Starting pod/${no.metadata.name}-debug-${rand(5)} ...\nTo use host binaries, run \`chroot /host\`. Instead, if you need to access host namespaces, run \`nsenter -a -t 1\`.\n`;
  if (!resto?.length) throw naoSimulado(ctx, ctx.env.t('oc debug node interativo (use: oc debug node/NOME -- chroot /host COMANDO)', 'interactive oc debug node (use: oc debug node/NAME -- chroot /host COMMAND)'));
  let cmd = resto;
  if (cmd[0] !== 'chroot' || cmd[1] !== '/host') {
    return { err: inicio + `sh: ${cmd[0]}: command not found\n\nRemoving debug pod ...\n`, code: 127 };
  }
  cmd = cmd.slice(2);
  const linha = /^(ba)?sh$/.test(cmd[0]) && cmd[1] === '-c' ? cmd.slice(2).join(' ') : cmd.join(' ');
  const r = noHost(real, no, linha);
  return { out: r.out, err: inicio + (r.err || '') + '\nRemoving debug pod ...\n', code: r.code };
}

function upgrade(ctx, args) {
  const c = ctx.env.cluster;
  if (args[0] === 'channel') {
    const canal = args[1];
    const cv = clone(c.must('ClusterVersion', 'version'));
    if (canal === undefined) throw erro('error: channel argument is required');
    let aviso = '';
    if (canal && !CANAIS_DISPONIVEIS.includes(canal)) aviso = `warning: No updates in channel "${canal}"\n`;
    if (canal === '') delete cv.spec.channel;
    else cv.spec.channel = canal;
    c.update(cv);
    return { out: '', err: aviso, code: 0 };
  }
  const { f } = parseArgs(args, ['to-latest', 'allow-explicit-upgrade', 'allow-upgrade-with-warnings', 'clear']);
  if (f.has('to-image')) throw naoSimulado(ctx, 'oc adm upgrade --to-image');
  const cv = clone(c.must('ClusterVersion', 'version'));
  const emAndamento = (cv.status.conditions || []).some((x) => x.type === 'Progressing' && x.status === 'True');
  if (f.has('clear')) {
    if (!cv.spec.desiredUpdate) return ok('info: No update in progress\n');
    delete cv.spec.desiredUpdate;
    c.update(cv);
    return ok('Cleared the update field, still at ' + versaoAtual(c) + '\n');
  }
  if (!f.has('to') && !f.has('to-latest')) return ok(resumoUpgrade(c));
  if (emAndamento) throw erro(`error: already upgrading.\n\n  Reason: \n  Message: ${(cv.status.conditions.find((x) => x.type === 'Progressing') || {}).message}\n\nIf you want to upgrade anyway, use --allow-upgrade-with-warnings.`);
  const recs = recomendadas(c);
  let alvo = f.one('to');
  if (f.has('to-latest')) {
    if (!recs.length) return ok('info: Cluster is already at the latest available version ' + versaoAtual(c) + '\n');
    alvo = recs[0];
  }
  if (alvo === versaoAtual(c)) return ok(`info: Cluster is already at version ${alvo}\n`);
  if (!recs.includes(alvo)) throw erro(`error: The update ${alvo} is not one of the available updates: ${recs.join(', ') || '<none>'}`);
  cv.spec.desiredUpdate = { version: alvo, image: imagemDa(alvo), force: false };
  c.update(cv);
  return ok(`Requested update to ${alvo}\n`);
}

function adm(ctx) {
  const [sub, oque, ...resto] = ctx.args;
  const c = ctx.env.cluster;
  const id = admIdentidade(ctx, sub, [oque, ...resto].filter((x) => x !== undefined));
  if (id) return id;
  if (sub === 'upgrade') return upgrade(ctx, [oque, ...resto].filter((x) => x !== undefined));
  if (sub === 'create-bootstrap-project-template') {
    const { f } = parseArgs([oque, ...resto].filter((x) => x !== undefined));
    const tpl = templateInicial(f.one('name') || 'project-request');
    const saida = f.one('output');
    if (saida === 'json') return ok(paraJson(tpl));
    if (saida === 'name') return ok(`template.template.openshift.io/${tpl.metadata.name}\n`);
    return ok(paraYaml(tpl));
  }
  const resto2 = [oque, ...resto].filter((x) => x !== undefined);
  if (sub === 'must-gather') return mustGather(ctx, resto2);
  if (sub === 'inspect') return inspect(ctx, resto2);
  if (sub === 'node-logs') return nodeLogs(ctx, resto2);
  if (sub !== 'top') throw naoSimulado(ctx, `oc adm ${sub ?? ''}`.trim());
  const { f } = parseArgs(resto);
  if (/^nodes?$/.test(oque)) {
    const n = c.list('Pod').filter((p) => p.status.phase === 'Running').length;
    const cpu = 1100 + n * 35;
    const mem = 9200 + n * 110;
    return ok(table([['NAME', 'CPU(cores)', 'CPU(%)', 'MEMORY(bytes)', 'MEMORY(%)'], ['master01', `${cpu}m`, `${Math.round(cpu / 75)}%`, `${mem}Mi`, `${Math.round((mem / (31 * 1024)) * 100)}%`]]));
  }
  if (/^pods?$/.test(oque)) {
    const ns = nsDe(ctx, f);
    const pods = c.list('Pod', f.has('all-namespaces') ? null : ns).filter(podPronto);
    if (!pods.length) return { err: `No resources found in ${ns} namespace.\n`, code: 0 };
    const usos = pods.map((p) => ({ p, u: usoPod(c, p) }));
    const ordem = f.one('sort-by');
    if (ordem === 'cpu') usos.sort((a, b) => b.u.cpu - a.u.cpu);
    else if (ordem === 'memory') usos.sort((a, b) => b.u.mem - a.u.mem);
    else if (ordem) throw erro(`error: --sort-by accepts only cpu or memory`);
    const linhas = usos.map(({ p, u }) => [...(f.has('all-namespaces') ? [p.metadata.namespace] : []), p.metadata.name, `${Math.max(1, u.cpu)}m`, `${Math.round(u.mem / 2 ** 20)}Mi`]);
    return ok(table(f.has('no-headers') ? linhas : [[...(f.has('all-namespaces') ? ['NAMESPACE'] : []), 'NAME', 'CPU(cores)', 'MEMORY(bytes)'], ...linhas]));
  }
  throw erro('error: unknown command "' + (oque ?? '') + '" for "oc adm top"');
}

function imagem(ctx) {
  const [sub, ref] = ctx.args;
  if (sub !== 'info' || !ref) throw naoSimulado(ctx, `oc image ${sub ?? ''}`.trim());
  const a = findImage(ref);
  if (a.error) throw erro(`error: unable to read image ${ref}: ${a.error === 'repo' ? 'name unknown: repository not found' : 'manifest unknown'}`);
  const i = a.image;
  return ok([
    `Name:          ${ref}`,
    `Digest:        ${a.digest}`,
    'Media Type:    application/vnd.oci.image.manifest.v1+json',
    `Created:       3w ago`,
    `Image Size:    ${i.size} in 4 layers`,
    'OS:            linux',
    'Arch:          amd64',
    'Entrypoint:    container-entrypoint',
    'Command:       /usr/bin/run-app',
    'Working Dir:   /opt/app-root/src',
    `User:          ${i.user}`,
    `Exposes Ports: ${i.port ? i.port + '/tcp' : '<none>'}`,
    `Environment:   APP_VERSION=${a.tag}`,
    '               PATH=/opt/app-root/bin:/usr/local/bin:/usr/bin:/bin',
    '',
  ].join('\n'));
}

export function skopeo(ctx) {
  const [sub, ...resto] = ctx.args;
  const alvo = resto.find((a) => a.startsWith('docker://'));
  if (!alvo || !['inspect', 'list-tags'].includes(sub)) return { err: ctx.env.t('[simulador] skopeo: use `skopeo inspect docker://IMAGEM` ou `skopeo list-tags docker://REPOSITÓRIO`.\n', '[simulator] skopeo: use `skopeo inspect docker://IMAGE` or `skopeo list-tags docker://REPOSITORY`.\n'), code: 1 };
  const ref = alvo.slice(9);
  if (sub === 'list-tags') {
    const img = IMAGES.find((x) => x.repo === ref);
    if (!img) return { err: `FATA[0000] Error listing repository tags: fetching tags list: name unknown: repository not found\n`, code: 1 };
    return ok(JSON.stringify({ Repository: ref, Tags: Object.keys(img.tags) }, null, 4) + '\n');
  }
  const a = findImage(ref);
  if (a.error) return { err: `FATA[0000] Error parsing image name "${alvo}": reading manifest ${a.tag || a.digest} in ${a.repo}: ${a.error === 'repo' ? 'name unknown: repository not found' : 'manifest unknown'}\n`, code: 1 };
  const dados = { Name: a.image.repo, Digest: a.digest, RepoTags: Object.keys(a.image.tags), Created: '2026-10-20T09:14:02Z', DockerVersion: '', Labels: { version: a.tag }, Architecture: 'amd64', Os: 'linux', Layers: [0, 1, 2, 3].map((n) => `sha256:${hashNum(a.digest + n).toString(16).padStart(8, '0').repeat(8)}`), Env: [`APP_VERSION=${a.tag}`] };
  // --format / -f: template Go sobre o resultado.
  const i = resto.findIndex((x) => x === '--format' || x === '-f' || x.startsWith('--format='));
  if (i >= 0) {
    const fmt = resto[i].startsWith('--format=') ? resto[i].slice(9) : resto[i + 1];
    return ok(renderGo(fmt, dados) + '\n');
  }
  return ok(JSON.stringify(dados, null, 4) + '\n');
}

function replace(ctx) {
  const { f } = parseArgs(ctx.args, ['force']);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  let out = '';
  for (const bruto of lerManifestos(ctx, f)) {
    const o = clone(normaliza(bruto));
    const k = c.tipo(o.kind);
    if (k.namespaced) o.metadata.namespace ??= ns;
    const atual = c.get(k.kind, o.metadata.name, o.metadata.namespace);
    if (f.has('force')) {
      if (atual) c.delete(k.kind, o.metadata.name, o.metadata.namespace);
      delete o.metadata.uid;
      delete o.metadata.resourceVersion;
      c.create(o);
      out += `${tipoOuErro(bruto.kind).out}/${o.metadata.name} replaced\n`;
      continue;
    }
    if (!atual) throw erro(`Error from server (NotFound): error when replacing "${f.one('filename')}": ${k.resource} "${o.metadata.name}" not found`);
    o.status = atual.status;
    c.update(o);
    out += `${tipoOuErro(bruto.kind).out}/${o.metadata.name} replaced\n`;
  }
  return ok(out);
}

function explain(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  if (!pos[0]) throw erro('error: You must specify the type of resource to explain. Use "oc api-resources" for a complete list of supported resources.');
  const r = explica(pos[0], f.has('recursive'));
  if (r.erro?.startsWith('[simulador]')) throw naoSimulado(ctx, `oc explain ${pos[0]}`);
  if (r.erro) throw erro(r.erro);
  return ok(r.out);
}

// Todos os subcomandos do oc real, para separar "não simulado" de "não existe".
const OC_REAIS = ['adm', 'annotate', 'api-resources', 'api-versions', 'apply', 'attach', 'auth', 'autoscale', 'cancel-build', 'cluster-info', 'completion', 'config', 'cp', 'create', 'debug', 'delete', 'describe', 'diff', 'edit', 'events', 'exec', 'explain', 'expose', 'extract', 'get', 'idle', 'image', 'import-image', 'kustomize', 'label', 'login', 'logout', 'logs', 'new-app', 'new-build', 'new-project', 'observe', 'options', 'patch', 'plugin', 'policy', 'port-forward', 'process', 'project', 'projects', 'proxy', 'registry', 'replace', 'rollback', 'rollout', 'rsh', 'rsync', 'run', 'scale', 'secrets', 'set', 'start-build', 'status', 'tag', 'version', 'wait', 'whoami'];

export const SUBS = {
  get, describe, apply, create, delete: del, 'new-project': newProject, project, projects, login, whoami,
  'new-app': newApp, expose, set, scale, label: rotula('labels', 'label'), annotate: rotula('annotations', 'annotate'),
  patch, edit, rollout, logs, process, replace, auth: authCmd, exec: (ctx) => exec(ctx, false), rsh: (ctx) => exec(ctx, true), explain, wait, status, kustomize: kustomizeCmd, diff, extract, version, 'api-resources': apiResources, adm, image: imagem,
  policy: (ctx) => admIdentidade(ctx, 'policy', ctx.args),
  run, cp, autoscale, 'import-image': importImage, tag, completion,
  config: (ctx) => {
    const r = config(ctx);
    if (r) return r;
    if (!ctx.args[0]) return ok(ajudaReal(['config']));
    throw naoSimulado(ctx, `oc config ${ctx.args[0]}`);
  },
  debug,
  'cluster-info': () => ok(`Kubernetes control plane is running at ${SERVER}\n\nTo further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.\n`),
  events: (ctx) => get({ ...ctx, args: ['events', ...ctx.args] }),
  logout: (ctx) => {
    const u = ctx.env.session.user;
    ctx.env.session.user = null;
    return ok(`Logged "${u}" out on "${SERVER}"\n`);
  },
};

export async function oc(ctx) {
  // Opções globais antes do subcomando (`oc -n NS get pods`) vão para depois dele.
  const globais = [];
  let ini = 0;
  while (ini < ctx.args.length) {
    const a = ctx.args[ini];
    if (/^(-n|--namespace|--as|--as-group)$/.test(a) && ini + 1 < ctx.args.length) {
      globais.push(a, ctx.args[ini + 1]);
      ini += 2;
    } else if (/^(--namespace|--as|--as-group)=|^-n./.test(a)) {
      globais.push(a);
      ini += 1;
    } else break;
  }
  if (globais.length) ctx = { ...ctx, args: [ctx.args[ini], ...globais, ...ctx.args.slice(ini + 1)].filter((x) => x !== undefined) };
  const [sub, ...resto] = ctx.args;
  // Ajuda, opções e mensagens de erro iguais às do cliente oficial 4.22.
  if (!sub) return ok(ajudaReal([]));
  if (sub === 'help') return ok(ajudaReal(resto) || ajudaReal([]));
  if (sub === 'options') return { err: ajudaOptions(), code: 0 };
  const errOpcao = validaOpcoes(ctx.args);
  if (errOpcao) return { err: errOpcao, code: 1 };
  if (sub === '--help' || sub === '-h') return ok(ajudaReal([]));
  const fn = SUBS[sub];
  if (!fn) {
    if (comandosRaiz().includes(sub) || OC_REAIS.includes(sub)) {
      if (ctx.args.includes('--help') || ctx.args.includes('-h')) return ok(ajudaReal(ctx.args));
      throw naoSimulado(ctx, `oc ${sub}`);
    }
    const parecidos = comandosRaiz().filter((n) => !['help', 'completion'].includes(n) && (distancia(sub.toLowerCase(), n) <= 2 || n.startsWith(sub.toLowerCase())));
    return { err: `error: unknown command "${sub}" for "oc"\n${parecidos.length ? `\nDid you mean this?\n${parecidos.map((p) => `\t${p}`).join('\n')}\n` : ''}`, code: 1 };
  }
  // Ajuda só vale para as opções antes do `--`.
  const antes = resto.includes('--') ? resto.slice(0, resto.indexOf('--')) : resto;
  // --as e --as-group: o comando roda com a identidade de outro usuário.
  let como = null;
  const comoGrupos = [];
  const args = [];
  for (let i = 0; i < resto.length; i++) {
    const a = resto[i];
    if (i < antes.length && (a === '--as' || a === '--as-group')) (a === '--as' ? (como = resto[++i]) : comoGrupos.push(resto[++i]));
    else if (i < antes.length && a.startsWith('--as=')) como = a.slice(5);
    else if (i < antes.length && a.startsWith('--as-group=')) comoGrupos.push(a.slice(11));
    else args.push(a);
  }
  if (antes.includes('--help') || antes.includes('-h')) {
    const texto = ajudaReal(ctx.args) || ajuda([sub, ...antes]);
    if (texto) return ok(texto);
    throw naoSimulado(ctx, `oc ${sub} --help`);
  }
  const sessao = ctx.env.session.user;
  if (!sessao && !['login', 'version', 'logout', 'completion', 'config'].includes(sub)) throw erro('error: You must be logged in to the server (Unauthorized)');
  const real = ctx.env.clusterReal || ctx.env.cluster;
  if ((como || comoGrupos.length) && !pode(real, sessao, 'impersonate', como ? 'users' : 'groups', '', null, como || comoGrupos[0])) {
    throw erro(`Error from server (Forbidden): ${como ? 'users' : 'groups'} "${como || comoGrupos[0]}" is forbidden: User "${sessao}" cannot impersonate resource "${como ? 'users' : 'groups'}" in API group "" at the cluster scope`);
  }
  const contexto = sessao ? comUsuario(ctx, como || sessao, comoGrupos) : ctx;
  const r = await fn({ ...contexto, args });
  registraContexto(ctx.env);
  return r;
}

export const OC_SUBS = Object.keys(SUBS).sort();

// Distância de Levenshtein, como o cobra usa para sugerir comandos.
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
