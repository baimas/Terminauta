// Rede do cluster simulado: resolução de nomes, services, routes, network
// policies e as respostas HTTP das aplicações.
import { APPS_DOMAIN } from './cluster.js';
import { findImage } from './images.js';
import { endpoints, podPronto, resolveEnv, tlsDaAplicacao } from './controllers.js';
import { EXPORTS_NFS, dadosDoVolume } from './storage.js';
import { ROUTER_CERT, API_CERT, SERVICE_CA, verifica } from './tls.js';
import { matchLabels } from './util.js';
import { VERSAO, KUBE } from './seed.js';
import { redeDoPod, podPorIp, naRedeSecundaria, REDE_SERVIDORES } from './redes.js';

const API_HOST = 'api.lab.example.com';
const CONSOLE_HOST = `console-openshift-console.${APPS_DOMAIN}`;
const KUBE_IP = '172.30.0.1';
const DNS_IP = '172.30.0.10';

// Destino virtual dos pods de DNS do cluster, usado nas regras de egress.
const DNS = { ns: 'openshift-dns', labels: { 'dns.operator.openshift.io/daemonset-dns': 'default' }, porta: 5353, nomePorta: 'dns', protocolo: 'UDP' };

const PAGINA_503 = `<html>
  <head>
    <title>Application is not available</title>
  </head>
  <body>
    <h1>Application is not available</h1>
    <p>The application is currently not serving requests at this endpoint. It may not have been started or is still starting.</p>
  </body>
</html>
`;

// ------------------------------------------------------------- policies

function rotulosNs(c, ns) {
  return c.get('Namespace', ns)?.metadata.labels || {};
}

function ipNaFaixa(ip, cidr) {
  const [base, bits] = cidr.split('/');
  const num = (x) => x.split('.').reduce((n, p) => n * 256 + Number(p), 0);
  const mascara = bits === undefined ? 32 : Number(bits);
  const div = 2 ** (32 - mascara);
  return Math.floor(num(ip) / div) === Math.floor(num(base) / div);
}

// O par (namespace, labels, ip) atende a um item `from`/`to` da policy?
function casaPar(c, par, nsPolicy, alvo) {
  if (par.ipBlock) {
    if (!alvo.ip || !ipNaFaixa(alvo.ip, par.ipBlock.cidr)) return false;
    return !(par.ipBlock.except || []).some((x) => ipNaFaixa(alvo.ip, x));
  }
  if (!alvo.ns) return false;
  if (par.namespaceSelector) {
    if (!matchLabels(rotulosNs(c, alvo.ns), par.namespaceSelector)) return false;
  } else if (alvo.ns !== nsPolicy) return false;
  if (par.podSelector) return matchLabels(alvo.labels || {}, par.podSelector);
  return true;
}

function casaPorta(regra, alvo) {
  if (!regra.ports?.length) return true;
  return regra.ports.some((p) => {
    if ((p.protocol || 'TCP') !== (alvo.protocolo || 'TCP')) return false;
    if (p.port === undefined) return true;
    if (typeof p.port === 'string' && !/^\d+$/.test(p.port)) return p.port === alvo.nomePorta;
    const inicio = Number(p.port);
    return alvo.porta >= inicio && alvo.porta <= (p.endPort ?? inicio);
  });
}

const tipos = (np) => np.spec.policyTypes || (np.spec.egress ? ['Ingress', 'Egress'] : ['Ingress']);
const seleciona = (np, labels) => matchLabels(labels, np.spec.podSelector || {});

// Avalia ingress no destino e egress na origem. `origem` e `destino` têm
// { ns, labels, ip } e o destino também { porta, nomePorta, protocolo }.
export function permite(c, origem, destino) {
  // Redes primárias de usuário (UDN) isolam os pods de outras redes.
  if (origem.pod && destino.pod && origem.pod !== destino.pod && redeDoPod(c, origem.pod) !== redeDoPod(c, destino.pod)) return false;
  if (destino.ns) {
    const pols = c.list('NetworkPolicy', destino.ns).filter((np) => tipos(np).includes('Ingress') && seleciona(np, destino.labels || {}));
    if (pols.length && !pols.some((np) => (np.spec.ingress || []).some((r) => (!r.from || !r.from.length || r.from.some((par) => casaPar(c, par, np.metadata.namespace, origem))) && casaPorta(r, destino)))) return false;
  }
  if (origem.ns) {
    const pols = c.list('NetworkPolicy', origem.ns).filter((np) => tipos(np).includes('Egress') && seleciona(np, origem.labels || {}));
    if (pols.length && !pols.some((np) => (np.spec.egress || []).some((r) => (!r.to || !r.to.length || r.to.some((par) => casaPar(c, par, np.metadata.namespace, destino))) && casaPorta(r, destino)))) return false;
  }
  return true;
}

const comoOrigem = (p) => ({ ns: p.metadata.namespace, labels: p.metadata.labels || {}, ip: p.status?.podIP, pod: p });

function comoDestino(p, porta) {
  const nomePorta = p.spec.containers.flatMap((x) => x.ports || []).find((x) => x.containerPort === porta)?.name;
  return { ns: p.metadata.namespace, labels: p.metadata.labels || {}, ip: p.status?.podIP, porta, nomePorta, protocolo: 'TCP', pod: p };
}

// O roteador de ingress, origem do tráfego que chega pelas routes.
function roteador(c) {
  const p = c.list('Pod', 'openshift-ingress').find(podPronto);
  return p ? comoOrigem(p) : { ns: 'openshift-ingress', labels: {} };
}

// ------------------------------------------------------- nomes e destinos

// Resolve um host a partir de um pod (com os domínios de busca do cluster)
// ou da estação de trabalho (que só enxerga o DNS externo).
export function resolve(c, host, pod) {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (h === API_HOST) return { tipo: 'api', ip: '192.168.50.10' };
  if (h === CONSOLE_HOST) return { tipo: 'console', ip: '192.168.50.10' };
  if (h.endsWith('.' + APPS_DOMAIN)) return { tipo: 'route', ip: '192.168.50.10' };
  // O guia de laboratório usa apps.ocp4.example.com, e uma route pode ter qualquer
  // host (nome próprio): o roteador atende o que estiver cadastrado.
  if (h.endsWith('.apps.ocp4.example.com') || c.list('Route').some((r) => r.spec.host?.toLowerCase() === h)) return { tipo: 'route', ip: '192.168.50.10' };
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    if (h === '127.0.0.1') return pod ? { tipo: 'pod', pod, ip: h } : { tipo: 'local', ip: h };
    if (h === KUBE_IP) return pod ? { tipo: 'kube', ip: h } : { tipo: 'inalcancavel', ip: h };
    const lb = c.list('Service').find((s) => s.status?.loadBalancer?.ingress?.[0]?.ip === h);
    if (lb) return { tipo: 'lb', svc: lb, ip: h };
    const svc = c.list('Service').find((s) => s.spec.clusterIP === h);
    if (svc) return pod ? { tipo: 'service', svc, ip: h } : { tipo: 'inalcancavel', ip: h };
    const alvo = c.list('Pod').find((p) => p.status?.podIP === h);
    if (alvo) return pod ? { tipo: 'pod', pod: alvo, ip: h } : { tipo: 'inalcancavel', ip: h };
    const extra = podPorIp(c, h);
    if (extra?.tipo === 'udn') return pod ? { tipo: 'pod', pod: extra.pod, ip: h } : { tipo: 'inalcancavel', ip: h };
    if (extra?.tipo === 'secundaria') return { tipo: 'secundaria', pod: extra.pod, rede: extra.rede, ip: h };
    if (h === '192.168.50.10') return { tipo: 'no', ip: h };
    return { tipo: 'inalcancavel', ip: h };
  }
  if (!pod) return null;
  if (h === 'localhost') return { tipo: 'pod', pod, ip: '127.0.0.1' };
  const curto = h.replace(/\.cluster\.local$/, '').replace(/\.svc$/, '');
  if (['kubernetes', 'kubernetes.default', 'openshift', 'openshift.default'].includes(curto)) return { tipo: 'kube', ip: KUBE_IP };
  const partes = curto.split('.');
  if (partes.length > 2) return null;
  const [nome, ns = pod.metadata.namespace] = partes;
  const svc = c.get('Service', nome, ns);
  if (!svc) return null;
  return { tipo: 'service', svc, ip: svc.spec.clusterIP };
}

// O pod consegue usar o DNS do cluster? Uma policy de egress que não libera
// a porta 53/5353 do namespace openshift-dns quebra a resolução de nomes.
export function dnsLiberado(c, pod) {
  return permite(c, comoOrigem(pod), DNS) || permite(c, comoOrigem(pod), { ...DNS, porta: 53 });
}

// --------------------------------------------------------- aplicações

// Resposta HTTP do processo que escuta no pod, ou erro de conexão.
// `https` indica que o cliente abriu TLS; a resposta traz o certificado do pod.
function respostaDoPod(c, pod, porta, caminho, https = false) {
  if (!podPronto(pod)) return { erro: 'recusada' };
  const ct = pod.spec.containers[0];
  const achada = findImage(ct.image);
  if (achada.error || ct.command || ct.args) return { erro: 'recusada' };
  const img = achada.image;
  const tls = img.repo.includes('/nimbus/') ? tlsDaAplicacao(c, pod, ct, resolveEnv(c, pod, ct).env) : null;
  const portaTls = tls && !tls.erro ? tls.porta : null;
  if (porta === portaTls && !https) return { status: 400, tipo: 'text/plain', corpo: 'Client sent an HTTP request to an HTTPS server.\n' };
  if (porta !== portaTls && (!img.port || img.port !== porta)) return { erro: 'recusada' };
  if (porta !== portaTls && https) return { erro: 'tls-versao' };
  const extra = porta === portaTls ? { cert: tls.cert } : {};
  if (img.proto === 'chat') return { erro: 'mysql' };
  const nome = img.repo.split('/').slice(-2).join('/');
  const p = pod.metadata.name;
  const v = achada.tag;
  if (nome === 'rhel9/mysql-80') return { erro: 'mysql' };
  if (nome === 'rhel9/postgresql-13') return { erro: 'vazia' };
  const json = (o) => ({ status: 200, tipo: 'application/json', corpo: JSON.stringify(o) + '\n', ...extra });
  const html = (titulo, texto) => ({ status: 200, tipo: 'text/html; charset=UTF-8', corpo: `<html>\n  <head><title>${titulo}</title></head>\n  <body>\n    <h1>${titulo}</h1>\n    <p>${texto}</p>\n  </body>\n</html>\n`, ...extra });
  // Volume montado na pasta de conteúdo do servidor web: serve o que está nele.
  const RAIZES_WEB = ['/usr/share/nginx/html', '/var/www/html', '/opt/app-root/src'];
  const montagem = (ct.volumeMounts || []).find((vm) => RAIZES_WEB.includes(vm.mountPath));
  if (montagem && /nginx|httpd/.test(img.repo)) {
    const vol = (pod.spec.volumes || []).find((x) => x.name === montagem.name);
    const pvc = vol?.persistentVolumeClaim && c.get('PersistentVolumeClaim', vol.persistentVolumeClaim.claimName, pod.metadata.namespace);
    const pv = pvc?.spec.volumeName && c.get('PersistentVolume', pvc.spec.volumeName);
    const arquivos = { ...(pv?.spec.nfs ? EXPORTS_NFS[pv.spec.nfs.path] : {}), ...(dadosDoVolume(c, pod.metadata.namespace, vol?.persistentVolumeClaim?.claimName)?.files || {}) };
    const arq = caminho === '/' ? 'index.html' : caminho.replace(/^\//, '');
    if (arquivos[arq] === undefined) return { status: caminho === '/' ? 403 : 404, tipo: 'text/html', corpo: `<html>\n<head><title>${caminho === '/' ? '403 Forbidden' : '404 Not Found'}</title></head>\n<body>\n<center><h1>${caminho === '/' ? '403 Forbidden' : '404 Not Found'}</h1></center>\n<hr><center>nginx</center>\n</body>\n</html>\n`, ...extra };
    return { status: 200, tipo: 'text/html', corpo: arquivos[arq], ...extra };
  }
  if (caminho === '/healthz' || caminho === '/health' || caminho === '/ready') return { status: 200, tipo: 'text/plain', corpo: 'ok\n', ...extra };
  switch (nome) {
    case 'nimbus/portal': return html('Nimbus Portal', `version ${v} - served by ${p}`);
    case 'nimbus/billing-api': return json({ service: 'billing-api', version: v, pod: p, path: caminho });
    case 'nimbus/inventory': return json({ service: 'inventory', version: v, pod: p, items: 1342 });
    case 'nimbus/reports': return json({ service: 'reports', version: v, pod: p, status: 'idle' });
    case 'ubi9/httpd-24': return html('Test Page for the HTTP Server on Red Hat Enterprise Linux', `Apache httpd is running on ${p}.`);
    case 'ubi9/nginx-120': return html('Welcome to nginx!', `nginx is running on ${p}.`);
    default: return html('It works', `served by ${p}`);
  }
}

function escolhe(c, lista, chave) {
  c.side.rr ??= {};
  const n = (c.side.rr[chave] = (c.side.rr[chave] ?? -1) + 1);
  return lista[n % lista.length];
}

// Porta de destino no pod a partir da porta do service.
function portaAlvo(svc, pod, portaSvc) {
  const sp = typeof portaSvc === 'object' ? portaSvc : svc.spec.ports.find((p) => p.port === portaSvc);
  if (!sp) return null;
  if (typeof sp.targetPort === 'number' || /^\d+$/.test(String(sp.targetPort))) return Number(sp.targetPort);
  const cp = pod.spec.containers.flatMap((x) => x.ports || []).find((x) => x.name === sp.targetPort);
  return cp ? cp.containerPort : null;
}

// Requisição de um pod (ou do roteador) para um service.
function viaService(c, origem, svc, portaSvc, caminho, https = false) {
  const sp = typeof portaSvc === 'object' ? portaSvc : svc.spec.ports.find((p) => p.port === portaSvc);
  if (!sp) return { erro: 'recusada' };
  const eps = endpoints(c, svc);
  if (!eps.length) return { erro: 'recusada' };
  const pod = escolhe(c, eps, svc.metadata.uid);
  const porta = portaAlvo(svc, pod, sp);
  if (!porta) return { erro: 'recusada' };
  if (!permite(c, origem, comoDestino(pod, porta))) return { erro: 'bloqueada' };
  return { ...respostaDoPod(c, pod, porta, caminho, https), svcHost: `${svc.metadata.name}.${svc.metadata.namespace}.svc` };
}

const admitida = (r) => r.status?.ingress?.[0]?.conditions?.[0]?.status !== 'False';

function viaRoute(c, req) {
  const rotas = c.list('Route').filter((r) => r.spec.host === req.host && admitida(r) && caminhoCasa(r.spec.path, req.caminho));
  rotas.sort((a, b) => (b.spec.path || '').length - (a.spec.path || '').length);
  const rota = rotas[0];
  const nao = { status: 503, tipo: 'text/html', corpo: PAGINA_503 };
  if (!rota) return req.https ? { ...nao, cert: ROUTER_CERT } : nao;
  const tls = rota.spec.tls;
  const term = tls?.termination;
  if (!req.https) {
    if (!term) return encaminha(c, rota, req, false);
    if (term === 'edge' && tls.insecureEdgeTerminationPolicy === 'Allow') return encaminha(c, rota, req, false);
    if (tls.insecureEdgeTerminationPolicy === 'Redirect') return { status: 302, tipo: 'text/html', corpo: '', local: `https://${req.host}${req.caminho}` };
    return nao;
  }
  if (!term) return { ...nao, cert: ROUTER_CERT };
  // Passthrough: o roteador repassa o TLS e quem apresenta o certificado é o pod.
  if (term === 'passthrough') {
    const r = encaminha(c, rota, req, true, true);
    if (r.erro) return r;
    return r.cert ? r : { erro: 'tls-versao' };
  }
  const cert = tls.certificate || ROUTER_CERT;
  if (term === 'edge') return { ...encaminha(c, rota, req, false), cert };
  // Reencrypt: o roteador abre TLS até o pod e confere o certificado dele.
  const r = encaminha(c, rota, req, true, true);
  if (r.erro || !r.cert) return { ...nao, cert };
  const confiaveis = tls.destinationCACertificate ? [tls.destinationCACertificate] : [SERVICE_CA.pem];
  if (verifica(r.cert, confiaveis, r.svcHost, c.now)) return { ...nao, cert };
  return { ...r, cert };
}

function caminhoCasa(prefixo, caminho) {
  if (!prefixo || prefixo === '/') return true;
  return caminho === prefixo || caminho.startsWith(prefixo.replace(/\/$/, '') + '/');
}

function encaminha(c, rota, req, https, cru = false) {
  const svc = c.get('Service', rota.spec.to.name, rota.metadata.namespace);
  const nao = { status: 503, tipo: 'text/html', corpo: PAGINA_503 };
  if (!svc) return cru ? { erro: 'recusada' } : nao;
  const alvo = rota.spec.port?.targetPort;
  const sp = alvo === undefined ? svc.spec.ports[0] : svc.spec.ports.find((p) => p.name === alvo || p.targetPort === alvo || String(p.targetPort) === String(alvo) || String(p.port) === String(alvo));
  if (!sp) return cru ? { erro: 'recusada' } : nao;
  const r = viaService(c, roteador(c), svc, sp, req.caminho, https);
  if (cru) return r;
  return r.erro ? nao : r;
}

function apiServer(req) {
  if (!req.https) return { status: 400, tipo: 'text/plain', corpo: 'Client sent an HTTP request to an HTTPS server.\n' };
  const base = { cert: API_CERT };
  if (req.caminho === '/version') return { ...base, status: 200, tipo: 'application/json', corpo: JSON.stringify({ major: '1', minor: KUBE.split('.')[1], gitVersion: KUBE, platform: 'linux/amd64' }, null, 2) + '\n' };
  if (['/healthz', '/readyz', '/livez'].includes(req.caminho)) return { ...base, status: 200, tipo: 'text/plain', corpo: 'ok' };
  const usuario = req.token ? req.token : 'system:anonymous';
  const corpo = { kind: 'Status', apiVersion: 'v1', metadata: {}, status: 'Failure', message: `forbidden: User "${usuario}" cannot get path "${req.caminho}"`, reason: 'Forbidden', details: {}, code: 403 };
  return { ...base, status: 403, tipo: 'application/json', corpo: JSON.stringify(corpo, null, 2) + '\n' };
}

// A estação de trabalho, origem do tráfego externo (LoadBalancer e NodePort).
const EXTERNO = { ip: '172.25.250.9' };

// Protocolo do processo que escuta na porta do pod, ou null.
function escuta(c, pod, porta) {
  if (!podPronto(pod)) return null;
  const ct = pod.spec.containers[0];
  const achada = findImage(ct.image);
  if (achada.error || ct.command || ct.args) return null;
  const img = achada.image;
  const tls = img.repo.includes('/nimbus/') ? tlsDaAplicacao(c, pod, ct, resolveEnv(c, pod, ct).env) : null;
  if (tls && !tls.erro && tls.porta === porta) return 'https';
  if (img.port === porta) return img.proto || 'http';
  return null;
}

// Abre uma conexão TCP. Devolve { pod, porta, proto }, { servidor } ou { erro }.
export function destinoTcp(c, pod, host, porta) {
  // Origem fora do cluster que não é a estação de trabalho (host `utility`).
  const host_ = pod?.hostExterno ? pod : null;
  if (host_) pod = null;
  const alvo = resolve(c, host, pod);
  if (!alvo) return { erro: 'dns' };
  if (pod && !/^\d/.test(host) && host !== 'localhost' && !dnsLiberado(c, pod)) return { erro: 'dns' };
  const origem = pod ? comoOrigem(pod) : EXTERNO;
  const viaPorta = (svc, sp) => {
    const eps = endpoints(c, svc);
    if (!eps.length) return { erro: 'recusada' };
    const destino = escolhe(c, eps, svc.metadata.uid);
    const p = portaAlvo(svc, destino, sp);
    if (!p) return { erro: 'recusada' };
    if (!permite(c, origem, comoDestino(destino, p))) return { erro: 'bloqueada' };
    const proto = escuta(c, destino, p);
    return proto ? { pod: destino, porta: p, proto } : { erro: 'recusada' };
  };
  switch (alvo.tipo) {
    case 'api':
      return porta === 6443 ? { servidor: 'api' } : { erro: 'recusada' };
    case 'kube':
      return porta === 443 ? { servidor: 'api' } : { erro: 'bloqueada' };
    case 'route':
    case 'console':
      return porta === 80 || porta === 443 ? { servidor: 'roteador' } : { erro: 'recusada' };
    case 'service':
    case 'lb': {
      // Um IP que o MetalLB não anuncia não responde a ninguém de fora.
      if (alvo.tipo === 'lb' && !pod && !c.side.anunciados?.[alvo.ip]) return { erro: 'bloqueada' };
      const sp = alvo.svc.spec.ports.find((p) => p.port === porta);
      return sp ? viaPorta(alvo.svc, sp) : { erro: alvo.tipo === 'lb' ? 'bloqueada' : 'recusada' };
    }
    case 'no': {
      const svc = c.list('Service').find((s) => (s.spec.ports || []).some((p) => p.nodePort === porta));
      if (svc) return viaPorta(svc, svc.spec.ports.find((p) => p.nodePort === porta));
      if (porta === 80 || porta === 443) return { servidor: 'roteador' };
      if (porta === 6443) return { servidor: 'api' };
      return { erro: 'recusada' };
    }
    case 'pod': {
      if (alvo.pod !== pod && semRota(c, pod, alvo.pod)) return { erro: 'semRota' };
      if (alvo.pod !== pod && !permite(c, origem, comoDestino(alvo.pod, porta))) return { erro: 'bloqueada' };
      const proto = escuta(c, alvo.pod, porta);
      return proto ? { pod: alvo.pod, porta, proto } : { erro: 'recusada' };
    }
    case 'secundaria': {
      // Rede secundária (NAD): alcançável na rede de servidores e por pods ligados a ela.
      const alcanca = (host_ && alvo.ip.startsWith(`${REDE_SERVIDORES}.`)) || naRedeSecundaria(c, pod, alvo.rede);
      if (!alcanca) return { erro: 'bloqueada' };
      const proto = escuta(c, alvo.pod, porta);
      return proto ? { pod: alvo.pod, porta, proto } : { erro: 'recusada' };
    }
    default:
      return { erro: 'bloqueada' };
  }
}

// Pod de uma rede de usuário tentando um IP da rede padrão: não há rota.
function semRota(c, origemPod, destinoPod) {
  return Boolean(origemPod?.metadata) && redeDoPod(c, origemPod) !== 'default' && redeDoPod(c, destinoPod) === 'default';
}

// Executa uma requisição HTTP. `pod` é a origem (null = estação de trabalho).
export function requisicao(c, pod, req) {
  if (pod?.hostExterno) {
    const d = destinoTcp(c, pod, req.host, req.porta ?? (req.https ? 443 : 80));
    if (d.erro) return d;
    if (d.servidor === 'api') return apiServer(req);
    if (d.servidor === 'roteador') pod = null;
    else return respostaDoPod(c, d.pod, d.porta, req.caminho, req.https);
  }
  const alvo = resolve(c, req.host, pod);
  if (pod && alvo && !/^\d/.test(req.host) && req.host !== 'localhost' && !dnsLiberado(c, pod)) return { erro: 'dns' };
  if (!alvo) return { erro: 'dns' };
  const porta = req.porta ?? (req.https ? 443 : 80);
  switch (alvo.tipo) {
    case 'api':
      if (porta !== 6443) return { erro: 'recusada', ip: alvo.ip };
      return apiServer(req);
    case 'kube':
      if (porta !== 443) return { erro: 'bloqueada', ip: alvo.ip };
      return apiServer(req);
    case 'console':
    case 'route':
      if (porta !== 80 && porta !== 443) return { erro: 'recusada', ip: alvo.ip };
      if ((porta === 443) !== req.https) return req.https ? { erro: 'tls-versao' } : { status: 400, tipo: 'text/html', corpo: '<html><body><h1>400 Bad request</h1>\nYour browser sent an invalid request.\n</body></html>\n' };
      if (alvo.tipo === 'console') return { status: 200, tipo: 'text/html', corpo: '<!DOCTYPE html><html><head><title>Red Hat OpenShift</title></head><body>…</body></html>\n', cert: ROUTER_CERT };
      return viaRoute(c, req);
    case 'service': {
      const r = viaService(c, comoOrigem(pod), alvo.svc, porta, req.caminho, req.https);
      return r.erro ? { ...r, ip: alvo.ip } : r;
    }
    case 'pod': {
      const destino = alvo.pod;
      if (destino !== pod && semRota(c, pod, destino)) return { erro: 'semRota', ip: alvo.ip };
      if (destino !== pod && !permite(c, comoOrigem(pod), comoDestino(destino, porta))) return { erro: 'bloqueada', ip: alvo.ip };
      const r = respostaDoPod(c, destino, porta, req.caminho, req.https);
      return r.erro ? { ...r, ip: alvo.ip } : r;
    }
    case 'secundaria':
    case 'lb':
    case 'no': {
      const d = destinoTcp(c, pod, req.host, porta);
      if (d.erro) return { ...d, ip: alvo.ip };
      if (d.servidor === 'api') return apiServer(req);
      if (d.servidor === 'roteador') return { status: 503, tipo: 'text/html', corpo: PAGINA_503, ...(req.https ? { cert: ROUTER_CERT } : {}) };
      return respostaDoPod(c, d.pod, d.porta, req.caminho, req.https);
    }
    case 'local':
      return { erro: 'recusada', ip: alvo.ip };
    default:
      return { erro: 'bloqueada', ip: alvo.ip };
  }
}

export { API_HOST, CONSOLE_HOST, DNS_IP, KUBE_IP, VERSAO };
