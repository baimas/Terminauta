// Um "mundo" é o conjunto cluster + arquivos + shell de uma sessão de jogo.
import { Cluster } from '../sim/cluster.js';
import { migra } from '../sim/seed.js';
import { FS, HOME } from '../sim/fs.js';
import { Shell } from '../sim/shell.js';
import { podPronto } from '../sim/controllers.js';
import { REGISTRY } from '../sim/images.js';
import { requisicao } from '../sim/net.js';
import { credencialValida, pode } from '../sim/rbac.js';

export { REGISTRY, HOME };

export function createWorld({ lang = 'pt-BR', openEditor, sleep, write, ask, salvo } = {}) {
  // Sessões salvas antes da versão 4.22 do jogo usavam o domínio ocp4.example.com.
  // As salvas desde então levam a marca `dominio`: o guia de laboratório usa
  // ocp4.example.com de propósito, e esses nomes não podem ser trocados.
  if (salvo && !salvo.dominio && JSON.stringify(salvo).includes('ocp4.example.com')) salvo = JSON.parse(JSON.stringify(salvo).replaceAll('ocp4.example.com', 'lab.example.com'));
  const cluster = salvo ? Cluster.restore(salvo.cluster) : new Cluster();
  if (salvo) migra(cluster);
  const fs = salvo ? FS.restore(salvo.fs) : new FS();
  const env = {
    cluster,
    fs,
    lang,
    session: salvo?.session || { user: 'admin', namespace: 'default' },
    t: (pt, en) => (env.lang === 'en' ? en : pt),
    openEditor,
    write,
    ask,
    // Fora do navegador o tempo simulado avança na hora.
    sleep: sleep || (async (s) => cluster.tick(s)),
  };
  const shell = new Shell(env);
  if (salvo?.cwd) shell.cwd = salvo.cwd;
  if (salvo?.vars) Object.assign(shell.vars, salvo.vars);

  const w = {
    env,
    cluster,
    fs,
    shell,
    sh: (cmd) => shell.run(cmd),
    get: (kind, nome, ns) => cluster.get(kind, nome, ns),
    list: (kind, ns) => cluster.list(kind, ns),
    // Conteúdo de um arquivo (sem espaços nas pontas) ou null.
    file: (caminho) => {
      const p = fs.resolve(HOME, caminho);
      return fs.isFile(p) ? fs.read(p).trim() : null;
    },
    lines: (caminho) => (w.file(caminho) ?? '').split('\n').map((l) => l.trim()).filter(Boolean).sort(),
    // Deployment com todas as réplicas prontas e atualizadas, sem pods antigos sobrando.
    ready: (nome, ns) => {
      const d = cluster.get('Deployment', nome, ns);
      const st = d?.status || {};
      return Boolean(d) && d.spec.replicas > 0 && st.replicas === d.spec.replicas && st.readyReplicas === d.spec.replicas && st.updatedReplicas === d.spec.replicas;
    },
    pods: (ns, rotulos = {}) => cluster.list('Pod', ns).filter((p) => Object.entries(rotulos).every(([k, v]) => p.metadata.labels?.[k] === v)),
    podPronto,
    // O usuário consegue logar com essa senha na configuração em vigor?
    credencial: (u, p) => Boolean(credencialValida(cluster, u, p)),
    pode: (u, verbo, recurso, grupo = '', ns = null, nome) => pode(cluster, u, verbo, recurso, grupo, ns, nome),
    // Requisição HTTP feita da estação de trabalho (devolve { status, corpo } ou { erro }).
    http: (url) => {
      const m = url.match(/^(https?):\/\/([^/:]+)(?::(\d+))?(\/.*)?$/);
      return requisicao(cluster, null, { https: m[1] === 'https', host: m[2], porta: m[3] ? Number(m[3]) : null, caminho: m[4] || '/' });
    },
    serialize: () => ({ dominio: 'lab', cluster: cluster.serialize(), fs: fs.serialize(), session: env.session, cwd: shell.cwdEstacao(), vars: shell.varsEstacao() }),
  };
  return w;
}

// Atalho para montar um deployment simples na preparação das missões.
export function deployment(nome, ns, imagem, { replicas = 1, labels = {}, env = {}, extra = {}, container = nome } = {}) {
  const rotulos = { app: nome, ...labels };
  const ct = { name: container, image: /^[^/]+[.:][^/]*\//.test(imagem) ? imagem : `${REGISTRY}/${imagem}`, ports: [{ containerPort: 8080, protocol: 'TCP' }] };
  const vars = Object.entries(env).map(([name, value]) => ({ name, value }));
  if (vars.length) ct.env = vars;
  Object.assign(ct, extra.container || {});
  return {
    kind: 'Deployment',
    metadata: { name: nome, namespace: ns, labels: rotulos },
    spec: { replicas, selector: { matchLabels: { app: nome } }, template: { metadata: { labels: rotulos }, spec: { containers: [ct], ...(extra.pod || {}) } } },
  };
}

export function service(nome, ns, porta = 8080) {
  return { kind: 'Service', metadata: { name: nome, namespace: ns, labels: { app: nome } }, spec: { selector: { app: nome }, ports: [{ port: porta, targetPort: porta }] } };
}
