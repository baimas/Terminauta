// Registro de imagens simulado. O comportamento de cada imagem (porta, variáveis
// obrigatórias, logs) define o que acontece com o pod que a usa.
import { fakeDigest } from './util.js';

export const REGISTRY = 'registry.lab.example.com:8443';

// Registro do guia de laboratório (ex.: registry.ocp4.example.com:8443): é o mesmo
// registro do laboratório, com outro nome.
const REGISTRO_GUIA = 'registry.ocp4.example.com:8443';
const canonico = (repo) => (repo.startsWith(`${REGISTRO_GUIA}/`) ? REGISTRY + repo.slice(REGISTRO_GUIA.length) : repo === 'gitlab/gitlab-ce' ? `docker.io/${repo}` : repo);

function img(nome, tags, extra = {}) {
  const repo = /^[^/]+[.:][^/]*\//.test(nome) ? nome : `${REGISTRY}/${nome}`;
  const mapa = {};
  for (const t of tags) {
    const [tag, igualA] = t.split('=');
    mapa[tag] = igualA ? mapa[igualA] : fakeDigest(`${repo}:${tag}`);
  }
  return { repo, tags: mapa, port: 8080, user: '1001', size: '98.4MB', ...extra };
}

const VALIDA_MYSQL = [
  '=> sourcing 20-validate-variables.sh ...',
  'You must either specify the following environment variables:',
  '  MYSQL_USER',
  '  MYSQL_PASSWORD',
  '  MYSQL_DATABASE',
  'Or the following environment variable:',
  '  MYSQL_ROOT_PASSWORD',
];

const VALIDA_PG = [
  'For general container run, you must either specify the following environment variables:',
  '  POSTGRESQL_USER  POSTGRESQL_PASSWORD  POSTGRESQL_DATABASE',
  'Or the following environment variable:',
  '  POSTGRESQL_ADMIN_PASSWORD',
];

export const IMAGES = [
  img('nimbus/portal', ['1.0', '1.1', '2.0', 'latest=2.0'], {
    logs: (v) => [`[portal] starting version ${v.tag}`, '[portal] listening on 0.0.0.0:8080', '[portal] ready'],
  }),
  img('nimbus/billing-api', ['1.0', '1.1', 'latest=1.1'], {
    requires: [['DB_HOST']],
    crashLog: ['[billing-api] loading configuration', '[billing-api] FATAL: environment variable DB_HOST is not set', '[billing-api] exiting with status 1'],
    logs: (v) => [`[billing-api] connecting to database at ${v.env.DB_HOST}`, '[billing-api] listening on 0.0.0.0:8080'],
  }),
  img('nimbus/inventory', ['3.2', '3.3', 'latest=3.3'], {
    logs: () => ['[inventory] cache warm-up done', '[inventory] listening on 0.0.0.0:8080'],
  }),
  img('nimbus/reports', ['4.0', '4.1', 'latest=4.1'], {
    logs: () => ['[reports] scheduler started', '[reports] listening on 0.0.0.0:8080'],
  }),
  img('nimbus/chat', ['1.0', '1.1', 'latest=1.1'], {
    port: 9000,
    proto: 'chat',
    logs: (v) => [`[chat] nimbus chat server ${v.tag}`, '[chat] listening on tcp 0.0.0.0:9000'],
  }),
  img('rhel9/mysql-80', ['1-228', 'latest=1-228'], {
    proto: 'mysql',
    port: 3306,
    user: '27',
    size: '172.1MB',
    requires: [['MYSQL_ROOT_PASSWORD'], ['MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']],
    crashLog: VALIDA_MYSQL,
    logs: () => ['=> sourcing 20-validate-variables.sh ...', '=> sourcing 25-validate-replication-variables.sh ...', "[System] [MY-010931] [Server] /usr/libexec/mysqld: ready for connections. Version: '8.0.36'  port: 3306"],
  }),
  img('rhel10/mariadb-118', ['10.1-6', 'latest=10.1-6'], {
    proto: 'mysql',
    port: 3306,
    user: '27',
    size: '160.4MB',
    requires: [['MYSQL_ROOT_PASSWORD'], ['MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']],
    crashLog: VALIDA_MYSQL,
    logs: () => ['=> sourcing 20-validate-variables.sh ...', '=> sourcing 25-validate-replication-variables.sh ...', "[Note] mariadbd: ready for connections. Version: '11.8.3-MariaDB'  socket: '/var/lib/mysql/mysql.sock'  port: 3306  MariaDB Server"],
  }),
  img('rhel10/postgresql-18', ['10.1-4', 'latest=10.1-4'], {
    proto: 'postgresql',
    port: 5432,
    user: '26',
    size: '131.6MB',
    requires: [['POSTGRESQL_ADMIN_PASSWORD'], ['POSTGRESQL_USER', 'POSTGRESQL_PASSWORD', 'POSTGRESQL_DATABASE']],
    crashLog: VALIDA_PG,
    logs: () => ['Starting server...', 'LOG:  listening on IPv4 address "0.0.0.0", port 5432', 'LOG:  database system is ready to accept connections'],
  }),
  img('rhel9/postgresql-13', ['1-150', 'latest=1-150'], {
    proto: 'postgresql',
    port: 5432,
    user: '26',
    size: '120.3MB',
    requires: [['POSTGRESQL_ADMIN_PASSWORD'], ['POSTGRESQL_USER', 'POSTGRESQL_PASSWORD', 'POSTGRESQL_DATABASE']],
    crashLog: VALIDA_PG,
    logs: () => ['Starting server...', 'LOG:  listening on IPv4 address "0.0.0.0", port 5432', 'LOG:  database system is ready to accept connections'],
  }),
  img('ubi9/httpd-24', ['1-321', 'latest=1-321'], {
    logs: () => ['=> sourcing 10-set-mpm.sh ...', "AH00558: httpd: Could not reliably determine the server's fully qualified domain name", '[mpm_event:notice] AH00489: Apache/2.4.57 (Red Hat Enterprise Linux) configured -- resuming normal operations'],
  }),
  img('ubi9/nginx-120', ['1-148', 'latest=1-148'], {
    logs: () => ['[notice] 1#1: nginx/1.20.1', '[notice] 1#1: start worker processes'],
  }),
  img('nimbus/legacy-ftp', ['3.0', 'latest=3.0'], {
    user: '0',
    root: true,
    rootLog: ['[legacy-ftp] preparing /var/ftp', 'chown: changing ownership of \'/var/ftp\': Operation not permitted', '[legacy-ftp] FATAL: this image must run as root (UID 0)'],
    logs: () => ['[legacy-ftp] preparing /var/ftp', '[legacy-ftp] running as root', '[legacy-ftp] listening on 0.0.0.0:8080'],
  }),
  img('nimbus/pod-watcher', ['1.0', 'latest=1.0'], { port: null, api: true, logs: () => [] }),
  // DO180: aplicação que demora a subir e tem endpoints de saúde.
  img('nimbus/catalog', ['1.0', '1.1', 'latest=1.1'], {
    paths: ['/', '/health/live', '/health/ready'],
    inicio: 25,
    mem: '180Mi',
    logs: (v) => [`[catalog] starting version ${v.tag}`, '[catalog] loading product index (this takes about 25 seconds)', '[catalog] index loaded: 18421 products', '[catalog] listening on 0.0.0.0:8080'],
  }),
  // Gerador de carga: chama TARGET_URL sem parar.
  img('nimbus/loadgen', ['1.0', 'latest=1.0'], {
    port: null,
    loadgen: true,
    logs: (v) => [`[loadgen] sending requests to ${v.env.TARGET_URL || '(TARGET_URL not set)'}`, '[loadgen] 40 concurrent clients'],
  }),
  // Gera relatórios em memória: precisa de 600Mi.
  img('nimbus/report-builder', ['2.0', 'latest=2.0'], {
    mem: '600Mi',
    logs: (v) => [`[report-builder] version ${v.tag}`, '[report-builder] loading 12 months of sales into memory', '[report-builder] cache warm (582 MiB)', '[report-builder] listening on 0.0.0.0:8080'],
  }),
  // Servidor de arquivos dos anexos: grava em /var/lib/notes.
  img('nimbus/notes', ['1.0', 'latest=1.0'], {
    paths: ['/', '/healthz'],
    logs: (v) => [`[notes] version ${v.tag}`, '[notes] storing attachments in /var/lib/notes', '[notes] listening on 0.0.0.0:8080'],
  }),
  img('ubi9/ubi', ['9.4', 'latest=9.4'], { port: null, user: '0', exits: 0, size: '78.2MB', logs: () => [] }),
  // Guia de laboratório EX280: imagens citadas nas questões.
  img('redhattraining/hello-world-nginx', ['v1.0', 'latest=v1.0'], {
    logs: () => ['[notice] 1#1: nginx/1.20.1', '[notice] 1#1: start worker processes'],
  }),
  // Aplicação que escuta na porta 8443 (alvo da liveness probe do guia).
  img('redhattraining/hello-secure', ['1.0', 'latest=1.0'], {
    port: 8443,
    logs: () => ['[secure] loading configuration', '[secure] listening on 0.0.0.0:8443'],
  }),
  // Cliente do banco: o log mostra se a conexão com DB_HOST:3306 passa pelas network policies.
  img('redhattraining/db-checker', ['1.0', 'latest=1.0'], {
    port: null,
    conecta: (env, t) => {
      const alvo = `${env.DB_HOST}:${env.DB_PORT || 3306}`;
      const falha = { dns: `could not resolve host ${env.DB_HOST}`, bloqueada: `connection to ${alvo} timed out`, recusada: `connection to ${alvo} refused` }[t.erro];
      return ['[checker] version 1.0', `[checker] connecting to ${alvo}`, falha ? `[checker] ERROR: ${falha}` : `[checker] connection to ${alvo} established`];
    },
    logs: () => ['[checker] version 1.0'],
  }),
  img('redhattraining/etherpad', ['1.8.0', 'latest=1.8.0'], {
    logs: () => ['[INFO] server - Etherpad is running', '[INFO] http - HTTP server listening on 0.0.0.0:8080'],
  }),
  img('registry.access.redhat.com/rhscl/mysql-57-rhel7', ['5.7-47', 'latest=5.7-47'], {
    proto: 'mysql',
    port: 3306,
    user: '27',
    size: '172.1MB',
    requires: [['MYSQL_ROOT_PASSWORD'], ['MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']],
    crashLog: VALIDA_MYSQL,
    logs: () => ['=> sourcing 20-validate-variables.sh ...', '=> sourcing 25-validate-replication-variables.sh ...', "[Note] /opt/rh/rh-mysql57/root/usr/libexec/mysqld: ready for connections. Version: '5.7.24'  socket: '/var/lib/mysql/mysql.sock'  port: 3306"],
  }),
  img('registry.access.redhat.com/ubi9/httpd-24', ['1-321', 'latest=1-321'], {
    logs: () => ['=> sourcing 10-set-mpm.sh ...', "AH00558: httpd: Could not reliably determine the server's fully qualified domain name", '[mpm_event:notice] AH00489: Apache/2.4.57 (Red Hat Enterprise Linux) configured -- resuming normal operations'],
  }),
  // Exige UID 0: sem a SCC anyuid, o contêiner cai em CrashLoopBackOff.
  img('docker.io/gitlab/gitlab-ce', ['8.4.3-ce.0', 'latest=8.4.3-ce.0'], {
    port: 80,
    user: '0',
    root: true,
    size: '1.2GB',
    rootLog: ['Thank you for using GitLab Docker Image!', 'chown: changing ownership of \'/var/opt/gitlab\': Operation not permitted', 'FATAL: this image must run as root (UID 0)'],
    logs: () => ['Thank you for using GitLab Docker Image!', 'Current version: gitlab-ce=8.4.3-ce.0', 'Configure GitLab for your system by editing /etc/gitlab/gitlab.rb file', 'Running handlers complete', 'gitlab Reconfigured!'],
  }),
];

// Imagens de componentes do próprio cluster: sempre válidas.
const SISTEMA = { repo: 'quay.io/openshift-release-dev/ocp-v4.0-art-dev', tags: {}, port: null, user: '0', size: '150MB', logs: () => ['I0101 00:00:00.000000       1 start.go:42] component started'] };

export function parseRef(ref) {
  let r = String(ref);
  let digest = null;
  let tag = null;
  const arroba = r.indexOf('@');
  if (arroba >= 0) {
    digest = r.slice(arroba + 1);
    r = r.slice(0, arroba);
  }
  const barra = r.lastIndexOf('/');
  const doisPontos = r.lastIndexOf(':');
  if (doisPontos > barra) {
    tag = r.slice(doisPontos + 1);
    r = r.slice(0, doisPontos);
  }
  if (!tag && !digest) tag = 'latest';
  return { repo: r, tag, digest };
}

// Devolve {image, tag, digest} ou {error: 'repo' | 'manifest'}.
export function findImage(ref) {
  const analisada = parseRef(ref);
  const { tag, digest } = analisada;
  const repo = canonico(analisada.repo);
  if (repo.startsWith('quay.io/openshift-release-dev/') || repo.startsWith('registry.redhat.io/')) return { image: SISTEMA, tag: 'latest', digest: fakeDigest(ref) };
  const image = IMAGES.find((i) => i.repo === repo);
  if (!image) return { error: 'repo', repo, tag, digest };
  if (digest) {
    const t = Object.keys(image.tags).find((x) => image.tags[x] === digest);
    if (!t) return { error: 'manifest', image, repo, tag, digest };
    return { image, tag: t, digest };
  }
  if (!(tag in image.tags)) return { error: 'manifest', image, repo, tag, digest };
  return { image, tag, digest: image.tags[tag] };
}
