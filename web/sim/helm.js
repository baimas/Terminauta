// Helm 3 simulado. As revisões ficam em secrets `sh.helm.release.v1.*` no
// namespace da release, como no Helm real.
import yaml from '../vendor/js-yaml.mjs';
import { ApiError } from './cluster.js';
import { kindOf } from './resources.js';
import { clone, b64, deepEqual } from './util.js';
import { render, definicoes, TemplateError } from './gotemplate.js';
import { CHARTS, ehRepo } from './charts.js';
import { KUBE } from './seed.js';
import { comUsuario } from './autoriza.js';

const REPOS = '/home/student/.config/helm/repositories.yaml';
const VERSAO_HELM = 'v3.15.4';

class HelmError extends Error {}
const falha = (msg) => new HelmError(msg);

// ------------------------------------------------------------ argumentos

const BOOL = new Set(['create-namespace', 'dry-run', 'reuse-values', 'reset-values', 'install', 'wait', 'all-namespaces', 'A', 'untar', 'all', 'versions', 'devel', 'force', 'atomic', 'debug', 'keep-history', 'h', 'help']);
const CURTAS = { n: 'namespace', f: 'values', o: 'output', A: 'all-namespaces', a: 'all', h: 'help', l: 'versions' };

function args(lista) {
  const pos = [];
  const f = {};
  const add = (k, v) => (f[k] ??= []).push(v);
  for (let i = 0; i < lista.length; i++) {
    const a = lista[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      if (v !== undefined) add(k, v);
      else if (BOOL.has(k)) add(k, true);
      else add(k, lista[++i]);
    } else if (/^-[A-Za-z]$/.test(a)) {
      const k = CURTAS[a[1]] || a[1];
      if (BOOL.has(k) || BOOL.has(a[1])) add(k, true);
      else add(k, lista[++i]);
    } else pos.push(a);
  }
  return { pos, one: (k) => f[k]?.at(-1), all: (k) => f[k] || [], has: (k) => k in f };
}

// ----------------------------------------------------------- repositórios

function repos(fs) {
  if (!fs.isFile(REPOS)) return [];
  return yaml.load(fs.read(REPOS))?.repositories || [];
}

function gravaRepos(fs, lista) {
  fs.put(REPOS, yaml.dump({ apiVersion: '', generated: '0001-01-01T00:00:00Z', repositories: lista }));
}

const ultima = (versoes) => versoes.at(-1);

// Localiza um chart: `repo/nome`, diretório local ou pacote .tgz.
function achaChart(ctx, ref, versao) {
  const fs = ctx.env.fs;
  const caminho = fs.resolve(ctx.sh.cwd, ref);
  if (fs.isDir(caminho)) {
    if (!fs.isFile(`${caminho}/Chart.yaml`)) throw falha(`Chart.yaml file is missing`);
    const files = {};
    for (const arq of fs.walk(caminho)) files[arq.slice(caminho.length + 1)] = fs.read(arq);
    return montaChart(files);
  }
  if (fs.isFile(caminho)) {
    try {
      return montaChart(JSON.parse(fs.read(caminho)).files);
    } catch {
      throw falha(`file '${ref}' does not appear to be a gzipped archive; got 'text/plain; charset=utf-8'`);
    }
  }
  if (!ref.includes('/') || ref.startsWith('.') || ref.startsWith('/')) throw falha(`non-absolute URLs should be in form of repo_name/path_to_chart, got: ${ref}`);
  const [nomeRepo, nome] = ref.split('/');
  const repo = repos(fs).find((r) => r.name === nomeRepo);
  if (!repo) throw falha(`repo ${nomeRepo} not found`);
  const versoes = ehRepo(repo.url) ? CHARTS[nome] : null;
  if (!versoes) throw falha(`chart "${nome}" not found in ${nomeRepo} index. (try 'helm repo update'): no chart name found`);
  const v = versao ? versoes.find((x) => x.versao === String(versao).replace(/^v/, '')) : ultima(versoes);
  if (!v) throw falha(`chart "${nome}" matching ${versao} not found in ${nomeRepo} index. (try 'helm repo update'): no chart version found for ${nome}-${versao}`);
  return montaChart(v.files);
}

function montaChart(files) {
  const meta = yaml.load(files['Chart.yaml']);
  if (!meta?.name || !meta?.version) throw falha('validation: chart.metadata.name is required');
  return { meta, valores: yaml.load(files['values.yaml'] || '') || {}, files };
}

// --------------------------------------------------------------- valores

function funde(base, extra) {
  const out = clone(base) || {};
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = funde(out[k], v);
    else out[k] = clone(v);
  }
  return out;
}

function atribui(alvo, caminho, valor) {
  const partes = caminho.split('.');
  let no = alvo;
  partes.forEach((p, i) => {
    const m = p.match(/^(.+)\[(\d+)\]$/);
    const chave = m ? m[1] : p;
    if (i === partes.length - 1) {
      if (m) (no[chave] ??= [])[Number(m[2])] = valor;
      else no[chave] = valor;
    } else if (m) {
      no = (no[chave] ??= [])[Number(m[2])] ??= {};
    } else {
      if (!no[chave] || typeof no[chave] !== 'object') no[chave] = {};
      no = no[chave];
    }
  });
}

const tipado = (v) => (v === 'true' ? true : v === 'false' ? false : v === 'null' ? null : /^-?\d+$/.test(v) ? Number(v) : v);

// Valores informados pelo usuário: -f, --set e --set-string, nessa ordem.
function valoresDoUsuario(ctx, a) {
  let out = {};
  for (const arq of a.all('values')) {
    const p = ctx.env.fs.resolve(ctx.sh.cwd, arq);
    if (!ctx.env.fs.isFile(p)) throw falha(`open ${arq}: no such file or directory`);
    try {
      out = funde(out, yaml.load(ctx.env.fs.read(p)) || {});
    } catch (e) {
      if (e instanceof HelmError) throw e;
      throw falha(`failed to parse ${arq}: error converting YAML to JSON: yaml: line ${(e.mark?.line ?? 0) + 1}: ${e.reason}`);
    }
  }
  for (const [flag, conv] of [['set', tipado], ['set-string', String]]) {
    for (const s of a.all(flag)) {
      for (const par of String(s).split(/,(?![^{]*\})/)) {
        const i = par.indexOf('=');
        if (i < 1) throw falha(`failed parsing --${flag} data: key "${par}" has no value`);
        atribui(out, par.slice(0, i), conv(par.slice(i + 1)));
      }
    }
  }
  return out;
}

// ------------------------------------------------------------- releases

const nomeSecret = (nome, rev) => `sh.helm.release.v1.${nome}.v${rev}`;

function historico(c, ns, nome) {
  return c.list('Secret', ns)
    .filter((s) => s.type === 'helm.sh/release.v1' && s.metadata.labels?.name === nome)
    .map((s) => JSON.parse(b64.dec(s.data.release)))
    .sort((a, b) => a.version - b.version);
}

// Releases (última revisão de cada) de um namespace, ou de todos com ns null.
export function releases(c, ns = null) {
  const nomes = new Map();
  for (const s of c.list('Secret', ns)) {
    if (s.type !== 'helm.sh/release.v1') continue;
    const r = JSON.parse(b64.dec(s.data.release));
    const chave = `${r.namespace}/${r.name}`;
    if (!nomes.has(chave) || nomes.get(chave).version < r.version) nomes.set(chave, r);
  }
  return [...nomes.values()];
}

export function releaseHistory(c, ns, nome) {
  return historico(c, ns, nome);
}

function gravaRelease(c, r) {
  const nome = nomeSecret(r.name, r.version);
  const labels = { name: r.name, owner: 'helm', status: r.info.status, version: String(r.version) };
  const atual = c.get('Secret', nome, r.namespace);
  const obj = { kind: 'Secret', metadata: { name: nome, namespace: r.namespace, labels }, type: 'helm.sh/release.v1', data: { release: b64.enc(JSON.stringify(r)) } };
  if (atual) c.update({ ...clone(atual), metadata: { ...atual.metadata, labels }, data: obj.data });
  else c.create(obj);
}

function marca(c, r, status) {
  r.info.status = status;
  gravaRelease(c, r);
}

// --------------------------------------------------------------- render

function renderiza(chart, valores, rel) {
  const dot = {
    Values: valores,
    Chart: { Name: chart.meta.name, Version: chart.meta.version, AppVersion: String(chart.meta.appVersion ?? ''), Description: chart.meta.description },
    Release: { Name: rel.nome, Namespace: rel.ns, Revision: rel.revisao, IsInstall: rel.revisao === 1, IsUpgrade: rel.revisao > 1, Service: 'Helm' },
    Capabilities: { KubeVersion: { Version: KUBE, Major: '1', Minor: '31' }, APIVersions: [] },
    Template: { BasePath: `${chart.meta.name}/templates` },
  };
  const tpls = Object.keys(chart.files).filter((f) => f.startsWith('templates/')).sort();
  const defs = definicoes(tpls.filter((f) => f.endsWith('.tpl')).map((f) => chart.files[f]));
  let manifest = '';
  let notas = '';
  for (const f of tpls) {
    if (f.endsWith('.tpl')) continue;
    let out;
    try {
      out = render(chart.files[f], { ...dot, Template: { ...dot.Template, Name: `${chart.meta.name}/${f}` } }, defs);
    } catch (e) {
      if (e instanceof TemplateError) throw falha(`template: ${chart.meta.name}/${f}: execution error at (${chart.meta.name}/${f}): ${e.message}`);
      throw e;
    }
    if (f === 'templates/NOTES.txt') {
      notas = out;
      continue;
    }
    if (!out.trim()) continue;
    for (const doc of out.split(/^---\s*$/m)) if (doc.trim()) manifest += `---\n# Source: ${chart.meta.name}/${f}\n${doc.replace(/^\n+/, '')}${doc.endsWith('\n') ? '' : '\n'}`;
  }
  let objetos;
  try {
    objetos = yaml.loadAll(manifest).filter(Boolean);
  } catch (e) {
    throw falha(`YAML parse error on ${chart.meta.name}: error converting YAML to JSON: yaml: line ${(e.mark?.line ?? 0) + 1}: ${e.reason}`);
  }
  return { manifest, objetos, notas };
}

const chave = (o, ns) => `${o.kind}/${o.metadata.name}/${kindOf(o.kind)?.namespaced ? ns : ''}`;

// Cria ou atualiza os objetos renderizados e remove os que saíram do chart.
function aplica(c, objetos, antigos, rel) {
  const ns = rel.ns;
  for (const o of objetos) {
    const k = kindOf(o.kind);
    if (!k) throw falha(`resource mapping not found for name: "${o.metadata?.name}" namespace: "" from "": no matches for kind "${o.kind}" in version "${o.apiVersion}"\nensure CRDs are installed first`);
    const existente = c.get(o.kind, o.metadata.name, k.namespaced ? ns : undefined);
    const dono = existente?.metadata.annotations?.['meta.helm.sh/release-name'];
    if (existente && dono !== rel.nome) {
      throw falha(`rendered manifests contain a resource that already exists. Unable to continue with ${rel.revisao === 1 ? 'install' : 'update'}: ${o.kind} "${o.metadata.name}" in namespace "${ns}" exists and cannot be imported into the current release: invalid ownership metadata; label validation error: missing key "app.kubernetes.io/managed-by": must be set to "Helm"; annotation validation error: missing key "meta.helm.sh/release-name": must be set to "${rel.nome}"; annotation validation error: missing key "meta.helm.sh/release-namespace": must be set to "${ns}"`);
    }
  }
  for (const bruto of objetos) {
    const k = kindOf(bruto.kind);
    const o = clone(bruto);
    o.metadata.labels = { ...(o.metadata.labels || {}), 'app.kubernetes.io/managed-by': 'Helm' };
    o.metadata.annotations = { ...(o.metadata.annotations || {}), 'meta.helm.sh/release-name': rel.nome, 'meta.helm.sh/release-namespace': ns };
    if (k.namespaced) o.metadata.namespace = ns;
    const existente = c.get(o.kind, o.metadata.name, k.namespaced ? ns : undefined);
    if (!existente) c.create(o);
    else {
      const novo = { ...o, metadata: { ...existente.metadata, labels: o.metadata.labels, annotations: { ...existente.metadata.annotations, ...o.metadata.annotations } }, status: existente.status };
      const semStatus = (x) => ({ ...x, status: undefined, metadata: { ...x.metadata, resourceVersion: undefined, generation: undefined } });
      if (!deepEqual(semStatus(clone(novo)), semStatus(clone(existente)))) c.update(novo);
    }
  }
  const atuais = new Set(objetos.map((o) => chave(o, ns)));
  for (const o of antigos) {
    if (atuais.has(chave(o, ns))) continue;
    const k = kindOf(o.kind);
    if (k && c.get(o.kind, o.metadata.name, k.namespaced ? ns : undefined)) c.delete(o.kind, o.metadata.name, k.namespaced ? ns : undefined);
  }
}

// --wait: espera os deployments da release ficarem prontos.
async function espera(ctx, objetos, ns, limite) {
  for (let t = 0; t <= limite; t += 2) {
    const ok = objetos.filter((o) => o.kind === 'Deployment').every((o) => {
      const d = ctx.env.cluster.get('Deployment', o.metadata.name, ns);
      // Pronto = só pods novos, todos prontos (pods antigos ainda de pé não contam).
      const st = d?.status || {};
      return d && st.replicas === d.spec.replicas && st.updatedReplicas === d.spec.replicas && st.readyReplicas === d.spec.replicas;
    });
    if (ok) return true;
    await ctx.env.sleep(2);
  }
  return false;
}

const segundos = (txt) => {
  const m = String(txt || '5m0s').match(/(?:(\d+)m)?(?:(\d+)s)?/);
  return Math.min(Number(m[1] || 0) * 60 + Number(m[2] || 0) || 300, 120);
};

// ----------------------------------------------------------------- saída

const dataLonga = (iso) => new Date(iso).toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) ([\d:]+) GMT$/, '$1 $3 $2 $5 $4');
const dataLista = (iso) => iso.replace('T', ' ').replace(/\.\d+Z|Z$/, '.000000000 +0000 UTC');

function tabela(linhas) {
  const larg = [];
  for (const l of linhas) l.forEach((c, i) => (larg[i] = Math.max(larg[i] || 0, String(c).length)));
  return linhas.map((l) => l.map((c, i) => (i === l.length - 1 ? String(c) : String(c).padEnd(larg[i]) + '\t')).join('').trimEnd()).join('\n') + '\n';
}

function statusTexto(r, notasVisiveis = true) {
  let s = `NAME: ${r.name}\nLAST DEPLOYED: ${dataLonga(r.info.last_deployed)}\nNAMESPACE: ${r.namespace}\nSTATUS: ${r.info.status}\nREVISION: ${r.version}\nTEST SUITE: None\n`;
  if (notasVisiveis && r.info.notes) s += `NOTES:\n${r.info.notes.replace(/\n*$/, '\n')}`;
  return s;
}

// ------------------------------------------------------------ comandos

async function instala(ctx, a, upgrade) {
  const c = ctx.env.cluster;
  const prefixo = upgrade ? 'UPGRADE FAILED' : 'INSTALLATION FAILED';
  let [nome, ref] = a.pos;
  if (!upgrade && a.has('generate-name')) [nome, ref] = [`${(a.pos[0] || 'chart').split('/').pop()}-${Date.now() % 10000000000}`, a.pos[0]];
  if (!nome || !ref) throw falha(`"helm ${upgrade ? 'upgrade' : 'install'}" requires 2 arguments\n\nUsage:  helm ${upgrade ? 'upgrade [RELEASE] [CHART]' : 'install [NAME] [CHART]'} [flags]`);
  if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(nome) || nome.length > 53) throw falha(`${prefixo}: release name "${nome}": invalid release name, must match regex ^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$ and the length must not be longer than 53`);
  const ns = a.one('namespace') || ctx.env.session.namespace;
  let chart;
  try {
    chart = achaChart(ctx, ref, a.one('version'));
  } catch (e) {
    throw falha(`${prefixo}: ${e.message}`);
  }
  const hist = historico(c, ns, nome);
  const atual = hist.at(-1);
  const instalando = !upgrade || !atual || (a.has('install') && !hist.some((r) => r.info.status === 'deployed'));
  if (upgrade && !atual && !a.has('install')) throw falha(`${prefixo}: "${nome}" has no deployed releases`);
  if (!upgrade && atual && atual.info.status !== 'uninstalled') throw falha('INSTALLATION FAILED: cannot re-use a name that is still in use');
  if (!c.get('Namespace', ns)) {
    if (!a.has('create-namespace')) throw falha(`${prefixo}: create: failed to create: namespaces "${ns}" not found`);
    if (!a.has('dry-run')) c.create({ kind: 'Namespace', metadata: { name: ns } });
  }

  // Valores do usuário: no upgrade sem nenhum valor novo, o Helm reaproveita os anteriores.
  let config = valoresDoUsuario(ctx, a);
  const semValoresNovos = !a.has('values') && !a.has('set') && !a.has('set-string');
  if (!instalando && !a.has('reset-values') && (a.has('reuse-values') || semValoresNovos)) config = funde(atual.config || {}, config);
  const revisao = instalando ? (atual ? atual.version + 1 : 1) : atual.version + 1;
  const valores = funde(chart.valores, config);
  let r;
  try {
    r = renderiza(chart, valores, { nome, ns, revisao });
  } catch (e) {
    throw falha(`${prefixo}: ${e.message}`);
  }
  const agora = ctx.env.cluster.iso();
  const rel = {
    name: nome,
    namespace: ns,
    version: revisao,
    info: { first_deployed: hist[0]?.info.first_deployed || agora, last_deployed: agora, status: 'pending-' + (instalando ? 'install' : 'upgrade'), description: instalando ? 'Install complete' : 'Upgrade complete', notes: r.notas },
    chart: { metadata: { name: chart.meta.name, version: chart.meta.version, appVersion: String(chart.meta.appVersion ?? ''), description: chart.meta.description } },
    config,
    manifest: r.manifest,
  };
  if (a.has('dry-run')) {
    rel.info.status = 'pending-install';
    return { out: `${statusTexto(rel, false)}HOOKS:\nMANIFEST:\n${r.manifest}\n${r.notas ? 'NOTES:\n' + r.notas : ''}`, code: 0 };
  }
  try {
    aplica(c, r.objetos, atual && atual.info.status !== 'uninstalled' ? yaml.loadAll(atual.manifest).filter(Boolean) : [], { nome, ns, revisao });
  } catch (e) {
    if (!(e instanceof HelmError) && !(e instanceof ApiError)) throw e;
    rel.info.status = 'failed';
    rel.info.description = `${instalando ? 'Release' : 'Upgrade'} "${nome}" failed: ${e.message}`;
    if (instalando && !atual) return { err: `Error: ${prefixo}: ${e.message.replace(/^Error from server \(\w+\): /, '')}\n`, code: 1 };
    gravaRelease(c, rel);
    return { err: `Error: ${prefixo}: ${e.message.replace(/^Error from server \(\w+\): /, '')}\n`, code: 1 };
  }
  if (a.has('wait') || a.has('atomic')) {
    const pronto = await espera(ctx, r.objetos, ns, segundos(a.one('timeout')));
    if (!pronto) {
      rel.info.status = 'failed';
      rel.info.description = `${instalando ? 'Release' : 'Upgrade'} "${nome}" failed: context deadline exceeded`;
      gravaRelease(c, rel);
      return { err: `Error: ${prefixo}: context deadline exceeded\n`, code: 1 };
    }
  }
  for (const antiga of hist) if (antiga.info.status === 'deployed') marca(c, antiga, 'superseded');
  rel.info.status = 'deployed';
  gravaRelease(c, rel);
  const cabecalho = upgrade ? (instalando ? `Release "${nome}" does not exist. Installing it now.\n` : `Release "${nome}" has been upgraded. Happy Helming!\n`) : '';
  return { out: cabecalho + statusTexto(rel), code: 0 };
}

function lista(ctx, a) {
  const c = ctx.env.cluster;
  const ns = a.has('all-namespaces') ? null : a.one('namespace') || ctx.env.session.namespace;
  const rels = releases(c, ns).filter((r) => r.info.status !== 'uninstalled' && (a.has('all') || ['deployed', 'failed'].includes(r.info.status)));
  if (a.one('output') === 'json') return { out: JSON.stringify(rels.map((r) => ({ name: r.name, namespace: r.namespace, revision: String(r.version), updated: dataLista(r.info.last_deployed), status: r.info.status, chart: `${r.chart.metadata.name}-${r.chart.metadata.version}`, app_version: r.chart.metadata.appVersion }))) + '\n', code: 0 };
  const linhas = [['NAME', 'NAMESPACE', 'REVISION', 'UPDATED', 'STATUS', 'CHART', 'APP VERSION']];
  for (const r of rels) linhas.push([r.name, r.namespace, r.version, dataLista(r.info.last_deployed), r.info.status, `${r.chart.metadata.name}-${r.chart.metadata.version}`, r.chart.metadata.appVersion]);
  return { out: tabela(linhas), code: 0 };
}

function obter(ctx, a, nome) {
  const ns = a.one('namespace') || ctx.env.session.namespace;
  const hist = historico(ctx.env.cluster, ns, nome);
  if (!hist.length || hist.at(-1).info.status === 'uninstalled') throw falha('release: not found');
  if (a.has('revision')) {
    const r = hist.find((x) => x.version === Number(a.one('revision')));
    if (!r) throw falha('release: not found');
    return { hist, r, ns };
  }
  return { hist, r: hist.at(-1), ns };
}

function rollback(ctx, a) {
  const c = ctx.env.cluster;
  const [nome, revTxt] = a.pos;
  if (!nome) throw falha('"helm rollback" requires at least 1 argument\n\nUsage:  helm rollback <RELEASE> [REVISION] [flags]');
  const { hist, r: atual, ns } = obter(ctx, a, nome);
  const alvoRev = revTxt ? Number(revTxt) : atual.version - 1;
  const alvo = hist.find((x) => x.version === alvoRev);
  if (!alvo || alvoRev < 1) throw falha(`release has no ${alvoRev} version`);
  const agora = c.iso();
  const novo = { ...clone(alvo), version: atual.version + 1, info: { ...alvo.info, first_deployed: hist[0].info.first_deployed, last_deployed: agora, status: 'deployed', description: `Rollback to ${alvoRev}` } };
  aplica(c, yaml.loadAll(alvo.manifest).filter(Boolean), yaml.loadAll(atual.manifest).filter(Boolean), { nome, ns, revisao: novo.version });
  for (const r of hist) if (r.info.status === 'deployed' || r.info.status === 'failed') marca(c, r, r.info.status === 'deployed' ? 'superseded' : 'failed');
  gravaRelease(c, novo);
  return { out: 'Rollback was a success! Happy Helming!\n', code: 0 };
}

function desinstala(ctx, a) {
  const c = ctx.env.cluster;
  if (!a.pos.length) throw falha('"helm uninstall" requires at least 1 argument\n\nUsage:  helm uninstall RELEASE_NAME [...] [flags]');
  let out = '';
  for (const nome of a.pos) {
    const { hist, r, ns } = obter(ctx, a, nome);
    aplica(c, [], yaml.loadAll(r.manifest).filter(Boolean), { nome, ns, revisao: r.version });
    for (const x of hist) c.delete('Secret', nomeSecret(nome, x.version), ns);
    out += `release "${nome}" uninstalled\n`;
  }
  return { out, code: 0 };
}

const AJUDA = `The Kubernetes package manager

Common actions for Helm:

- helm search:    search for charts
- helm pull:      download a chart to your local directory to view
- helm install:   upload the chart to Kubernetes
- helm list:      list releases of charts

Usage:
  helm [command]

Available Commands:
  get         download extended information of a named release
  history     fetch release history
  install     install a chart
  lint        examine a chart for possible issues
  list        list releases
  pull        download a chart from a repository and (optionally) unpack it in local directory
  repo        add, list, remove, update, and index chart repositories
  rollback    roll back a release to a previous revision
  search      search for a keyword in charts
  show        show information of a chart
  status      display the status of the named release
  template    locally render templates
  uninstall   uninstall a release
  upgrade     upgrade a release
  version     print the client version information

Flags:
  -n, --namespace string   namespace scope for this request

Use "helm [command] --help" for more information about a command.
`;

const AJUDAS = {
  install: 'This command installs a chart archive.\n\nThe install argument must be a chart reference, a path to a packaged chart,\na path to an unpacked chart directory or a URL.\n\nTo override values in a chart, use either the \'--values\' flag and pass in a file\nor use the \'--set\' flag and pass configuration from the command line.\n\n    $ helm install -f myvalues.yaml myredis ./redis\n\nor\n\n    $ helm install --set name=prod myredis ./redis\n\nUsage:\n  helm install [NAME] [CHART] [flags]\n\nFlags:\n      --create-namespace   create the release namespace if not present\n      --dry-run            simulate an install\n      --set stringArray    set values on the command line (can specify multiple or separate values with commas: key1=val1,key2=val2)\n  -f, --values strings     specify values in a YAML file or a URL (can specify multiple)\n      --version string     specify a version constraint for the chart version to use\n      --wait               wait until all resources are in a ready state\n  -n, --namespace string   namespace scope for this request\n',
  upgrade: 'This command upgrades a release to a new version of a chart.\n\nThe upgrade arguments must be a release and chart. The chart argument can be\neither: a chart reference(\'example/mariadb\'), a path to a chart directory,\na packaged chart, or a fully qualified URL.\n\nIf no values are provided with --set or --values, the values of the previous\nrevision are reused. When any value is provided, the values of the previous\nrevision are dropped unless --reuse-values is used.\n\nUsage:\n  helm upgrade [RELEASE] [CHART] [flags]\n\nFlags:\n  -i, --install           if a release by this name doesn\'t already exist, run an install\n      --reset-values      when upgrading, reset the values to the ones built into the chart\n      --reuse-values      when upgrading, reuse the last release\'s values and merge in any overrides\n      --set stringArray   set values on the command line\n  -f, --values strings    specify values in a YAML file or a URL (can specify multiple)\n      --version string    specify a version constraint for the chart version to use\n      --wait              wait until all resources are in a ready state\n',
  rollback: 'This command rolls back a release to a previous revision.\n\nThe first argument of the rollback command is the name of a release, and the\nsecond is a revision (version) number. If this argument is omitted or set to\n0, it will roll back to the previous release.\n\nTo see revision numbers, run \'helm history RELEASE\'.\n\nUsage:\n  helm rollback <RELEASE> [REVISION] [flags]\n',
  repo: 'This command consists of multiple subcommands to interact with chart repositories.\n\nUsage:\n  helm repo [command]\n\nAvailable Commands:\n  add         add a chart repository\n  list        list chart repositories\n  remove      remove one or more chart repositories\n  update      update information of available charts locally from chart repositories\n',
  show: 'This command consists of multiple subcommands to display information about a chart\n\nUsage:\n  helm show [command]\n\nAvailable Commands:\n  all         show all information of the chart\n  chart       show the chart\'s definition\n  readme      show the chart\'s README\n  values      show the chart\'s values\n',
  search: 'Search provides the ability to search for Helm charts in the various places\nthey can be stored including the Artifact Hub and repositories you have added.\n\nUsage:\n  helm search [command]\n\nAvailable Commands:\n  repo        search repositories for a keyword in charts\n\nFlags:\n  -l, --versions   show the long listing, with each version of each chart on its own line\n',
};

export async function helm(ctx) {
  const [cmd, ...resto] = ctx.args;
  // O Helm usa as credenciais da sessão do oc.
  if (ctx.env.session.user) ctx = comUsuario(ctx, ctx.env.session.user);
  else if (!['repo', 'search', 'show', 'pull', 'template', 'lint', 'version', 'help', undefined].includes(cmd)) return { err: 'Error: Kubernetes cluster unreachable: Unauthorized\n', code: 1 };
  const a = args(resto);
  const c = ctx.env.cluster;
  const fs = ctx.env.fs;
  const ok = (out) => ({ out, code: 0 });
  try {
    if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') return ok(AJUDA);
    if (a.has('help')) {
      if (AJUDAS[cmd]) return ok(AJUDAS[cmd]);
      return ok(AJUDA);
    }
    switch (cmd) {
      case 'version':
        return ok(a.has('short') ? `${VERSAO_HELM}+g1a2b3c4\n` : `version.BuildInfo{Version:"${VERSAO_HELM}", GitCommit:"1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b", GitTreeState:"clean", GoVersion:"go1.22.6"}\n`);
      case 'repo': {
        const [sub, nome, url] = a.pos;
        const lista = repos(fs);
        if (sub === 'add') {
          if (!nome || !url) throw falha('"helm repo add" requires 2 arguments\n\nUsage:  helm repo add [NAME] [URL] [flags]');
          const limpa = url.replace(/\/$/, '');
          const existente = lista.find((r) => r.name === nome);
          if (existente) {
            if (existente.url === limpa) return ok(`"${nome}" already exists with the same configuration, skipping\n`);
            throw falha(`repository name (${nome}) already exists, please specify a different name`);
          }
          if (!ehRepo(limpa)) {
            const host = limpa.replace(/^https?:\/\//, '').split('/')[0];
            throw falha(`looks like "${url}" is not a valid chart repository or cannot be reached: Get "${limpa}/index.yaml": dial tcp: lookup ${host} on 172.25.250.254:53: no such host`);
          }
          gravaRepos(fs, [...lista, { name: nome, url: limpa, caFile: '', certFile: '', keyFile: '', insecure_skip_tls_verify: false, pass_credentials_all: false }]);
          return ok(`"${nome}" has been added to your repositories\n`);
        }
        if (sub === 'list' || sub === 'ls') {
          if (!lista.length) throw falha('no repositories to show');
          return ok(tabela([['NAME', 'URL'], ...lista.map((r) => [r.name, r.url])]));
        }
        if (sub === 'update' || sub === 'up') {
          if (!lista.length) throw falha('no repositories found. You must add one before updating');
          return ok(`Hang tight while we grab the latest from your chart repositories...\n${lista.map((r) => `...Successfully got an update from the "${r.name}" chart repository\n`).join('')}Update Complete. ⎈Happy Helming!⎈\n`);
        }
        if (sub === 'remove' || sub === 'rm') {
          if (!lista.some((r) => r.name === nome)) throw falha(`no repo named "${nome}" found`);
          gravaRepos(fs, lista.filter((r) => r.name !== nome));
          return ok(`"${nome}" has been removed from your repositories\n`);
        }
        return ok(AJUDAS.repo);
      }
      case 'search': {
        if (a.pos[0] !== 'repo') return ok(AJUDAS.search);
        const termo = (a.pos[1] || '').toLowerCase();
        const linhas = [['NAME', 'CHART VERSION', 'APP VERSION', 'DESCRIPTION']];
        for (const r of repos(fs)) {
          if (!ehRepo(r.url)) continue;
          for (const [nome, versoes] of Object.entries(CHARTS)) {
            const ref = `${r.name}/${nome}`;
            if (termo && !ref.toLowerCase().includes(termo) && !versoes[0].descricao.toLowerCase().includes(termo)) continue;
            for (const v of a.has('versions') ? [...versoes].reverse() : [ultima(versoes)]) linhas.push([ref, v.versao, v.appVersion, v.descricao]);
          }
        }
        if (linhas.length === 1) return ok('No results found\n');
        return ok(tabela(linhas));
      }
      case 'show':
      case 'inspect': {
        const [sub, ref] = a.pos;
        if (!['all', 'chart', 'readme', 'values'].includes(sub)) return ok(AJUDAS.show);
        if (!ref) throw falha(`"helm show ${sub}" requires 1 argument\n\nUsage:  helm show ${sub} [CHART] [flags]`);
        const ch = achaChart(ctx, ref, a.one('version'));
        if (sub === 'chart') return ok(ch.files['Chart.yaml']);
        if (sub === 'values') return ok(ch.files['values.yaml'] || '');
        if (sub === 'readme') return ok(ch.files['README.md'] || '');
        return ok(`${ch.files['Chart.yaml']}\n---\n${ch.files['values.yaml'] || ''}\n---\n${ch.files['README.md'] || ''}`);
      }
      case 'pull':
      case 'fetch': {
        const [ref] = a.pos;
        if (!ref) throw falha('"helm pull" requires at least 1 argument\n\nUsage:  helm pull [chart URL | repo/chartname] [...] [flags]');
        const ch = achaChart(ctx, ref, a.one('version'));
        const destino = fs.resolve(ctx.sh.cwd, a.one('untardir') || a.one('destination') || '.');
        if (a.has('untar')) {
          const dir = `${destino}/${ch.meta.name}`;
          if (fs.exists(dir)) throw falha(`failed to untar: a file or directory with the name ${dir} already exists`);
          for (const [arq, conteudo] of Object.entries(ch.files)) fs.put(`${dir}/${arq}`, conteudo);
        } else fs.put(`${destino}/${ch.meta.name}-${ch.meta.version}.tgz`, JSON.stringify({ aviso: 'Pacote simulado do Terminauta. Use helm pull --untar para ver os arquivos.', files: ch.files }));
        return ok('');
      }
      case 'install':
        return await instala(ctx, a, false);
      case 'upgrade':
        return await instala(ctx, args(resto.map((x) => (x === '-i' ? '--install' : x))), true);
      case 'template': {
        const [nome, ref] = a.pos.length > 1 ? a.pos : ['release-name', a.pos[0]];
        if (!ref) throw falha('"helm template" requires at least 1 argument\n\nUsage:  helm template [NAME] [CHART] [flags]');
        const ch = achaChart(ctx, ref, a.one('version'));
        const r = renderiza(ch, funde(ch.valores, valoresDoUsuario(ctx, a)), { nome, ns: a.one('namespace') || ctx.env.session.namespace, revisao: 1 });
        return ok(r.manifest);
      }
      case 'lint': {
        const ref = a.pos[0] || '.';
        try {
          const ch = achaChart(ctx, ref);
          renderiza(ch, funde(ch.valores, valoresDoUsuario(ctx, a)), { nome: 'release-name', ns: 'default', revisao: 1 });
          return ok(`==> Linting ${ref}\n[INFO] Chart.yaml: icon is recommended\n\n1 chart(s) linted, 0 chart(s) failed\n`);
        } catch (e) {
          if (!(e instanceof HelmError)) throw e;
          return { out: `==> Linting ${ref}\n[ERROR] templates/: ${e.message}\n\nError: 1 chart(s) linted, 1 chart(s) failed\n`, code: 1 };
        }
      }
      case 'list':
      case 'ls':
        return lista(ctx, a);
      case 'status': {
        if (!a.pos[0]) throw falha('"helm status" requires 1 argument\n\nUsage:  helm status RELEASE_NAME [flags]');
        return ok(statusTexto(obter(ctx, a, a.pos[0]).r));
      }
      case 'history':
      case 'hist': {
        if (!a.pos[0]) throw falha('"helm history" requires 1 argument\n\nUsage:  helm history RELEASE_NAME [flags]');
        const { hist } = obter(ctx, a, a.pos[0]);
        const linhas = [['REVISION', 'UPDATED', 'STATUS', 'CHART', 'APP VERSION', 'DESCRIPTION']];
        for (const r of hist) linhas.push([r.version, dataLonga(r.info.last_deployed), r.info.status, `${r.chart.metadata.name}-${r.chart.metadata.version}`, r.chart.metadata.appVersion, r.info.description]);
        return ok(tabela(linhas));
      }
      case 'get': {
        const [sub, nome] = a.pos;
        if (!['values', 'manifest', 'notes', 'all'].includes(sub) || !nome) throw falha('"helm get" requires a subcommand: all, manifest, notes or values, and a release name');
        const { r } = obter(ctx, a, nome);
        if (sub === 'manifest') return ok(r.manifest);
        if (sub === 'notes') return ok(`NOTES:\n${r.info.notes}`);
        const valores = a.has('all') ? funde(achaChartDaRelease(r), r.config) : r.config;
        if (a.one('output') === 'json') return ok(JSON.stringify(valores) + '\n');
        const corpo = valores && Object.keys(valores).length ? yaml.dump(valores) : 'null\n';
        if (sub === 'values') return ok(`${a.has('all') ? 'COMPUTED' : 'USER-SUPPLIED'} VALUES:\n${corpo}`);
        return ok(`${statusTexto(r, false)}USER-SUPPLIED VALUES:\n${corpo}\nMANIFEST:\n${r.manifest}`);
      }
      case 'rollback':
        return rollback(ctx, a);
      case 'uninstall':
      case 'delete':
      case 'del':
      case 'un':
        return desinstala(ctx, a);
      case 'create':
      case 'package':
      case 'dependency':
      case 'plugin':
      case 'registry':
      case 'push':
      case 'test':
      case 'env':
      case 'completion':
        return { err: ctx.env.t(`[simulador] "helm ${cmd}" ainda não é simulado neste jogo.\n`, `[simulator] "helm ${cmd}" is not simulated in this game yet.\n`), code: 1 };
      default:
        throw falha(`unknown command "${cmd}" for "helm"\nRun 'helm --help' for usage.`);
    }
  } catch (e) {
    if (e instanceof HelmError) return { err: `Error: ${e.message}\n`, code: 1 };
    if (e instanceof ApiError) return { err: `Error: ${e.message.replace(/^Error from server \(\w+\): /, '')}\n`, code: 1 };
    throw e;
  }
  // Os valores padrão do chart de uma release (para `helm get values --all`).
  function achaChartDaRelease(r) {
    const versoes = CHARTS[r.chart.metadata.name];
    const v = versoes?.find((x) => x.versao === r.chart.metadata.version);
    return v ? yaml.load(v.files['values.yaml']) : {};
  }
}
