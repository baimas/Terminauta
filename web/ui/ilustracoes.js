// Ilustrações das missões: um banner em SVG por exercício, nas cores do Lab.
// O tema (ícone) vem do assunto da missão; a composição varia com o id, para
// cada exercício ter a sua imagem.

// Ícones de traço, 24×24.
const ICONES = {
  terminal: '<rect x="2.5" y="4" width="19" height="16" rx="3"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5"/>',
  pod: '<path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z"/><path d="M4 7.4l8 4.6 8-4.6M12 12v9.2"/>',
  imagem: '<path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5"/>',
  rede: '<circle cx="12" cy="5" r="2.4"/><circle cx="5" cy="18.5" r="2.4"/><circle cx="19" cy="18.5" r="2.4"/><path d="M10.8 7.1L6.2 16.4M13.2 7.1l4.6 9.3M7.4 18.5h9.2"/>',
  escudo: '<path d="M12 2.8l7.5 3v5.6c0 4.6-3.2 8.3-7.5 9.8-4.3-1.5-7.5-5.2-7.5-9.8V5.8z"/><path d="M8.8 12l2.2 2.2 4.3-4.4"/>',
  cadeado: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5"/>',
  pessoas: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.4 6-5.4s5.4 2 6 5.4"/><circle cx="17" cy="9" r="2.4"/><path d="M16.6 14.7c2.4.3 4 1.9 4.4 4.6"/>',
  disco: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  saude: '<path d="M12 20.5s-8-4.7-8-10.6A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 8 2.7c0 5.9-8 10.6-8 10.6z"/><path d="M6.5 12.5h3l1.5-2.5 2 4.5 1.5-2h3"/>',
  escala: '<path d="M4 20V14M10 20V9M16 20v-5M22 20H2"/><path d="M14 4.5h5v5M19 4.5l-6 6"/>',
  atualiza: '<path d="M20 11.5A8 8 0 0 0 6 6.3L4 8.5M4 4v4.5h4.5M4 12.5a8 8 0 0 0 14 5.2l2-2.2M20 20v-4.5h-4.5"/>',
  engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3"/>',
  relogio: '<circle cx="12" cy="12" r="8.8"/><path d="M12 7v5l3.5 2"/>',
  ajustes: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  boia: '<circle cx="12" cy="12" r="8.8"/><circle cx="12" cy="12" r="3.6"/><path d="M5.8 5.8l3.6 3.6M14.6 14.6l3.6 3.6M18.2 5.8l-3.6 3.6M9.4 14.6l-3.6 3.6"/>',
  globo: '<circle cx="12" cy="12" r="8.8"/><path d="M3.2 12h17.6M12 3.2c2.4 2.4 3.6 5.3 3.6 8.8s-1.2 6.4-3.6 8.8c-2.4-2.4-3.6-5.3-3.6-8.8s1.2-6.4 3.6-8.8z"/>',
  documento: '<path d="M6 2.8h8l4.5 4.5v13.9H6z"/><path d="M14 2.8v4.5h4.5M9 12h6M9 15.5h6"/>',
  trofeu: '<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.5a3 3 0 0 0 3 4M16.5 6h3a3 3 0 0 1-3 4M12 13.5V17M8.5 20.5h7M9.5 17h5"/>',
  cartas: '<rect x="7" y="3" width="13" height="17" rx="2.5" transform="rotate(8 13.5 11.5)"/><rect x="3.5" y="4.5" width="13" height="17" rx="2.5"/><path d="M8 11.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.5M10 17h.01"/>',
  som: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.4a8 8 0 0 1 0 11.2"/>',
  pacote: '<path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9M7.8 5.3l8.4 4.5"/>',
};

// Assunto de cada missão pelo id.
const TEMAS = [
  [/^flash/, 'cartas'],
  [/prova/, 'trofeu'],
  [/instalar-oc|inspecionar|inventario|primeiro-dia|e2-pods/, 'terminal'],
  [/documentacao/, 'documento'],
  [/suporte|plantao|troubleshoot|travado|diagnostico/, 'boia'],
  [/saude|probes|c0-saude/, 'saude'],
  [/imagens|imagem|imagestream|gatilho/, 'imagem'],
  [/helm|template|kustomize|overlays|manifestos|exportar/, 'pacote'],
  [/htpasswd|usuarios|grupos|papel|kubeadmin|self-provisioner/, 'pessoas'],
  [/edge|passthrough|service-ca/, 'cadeado'],
  [/netpol|anyuid|privilegiado|scc|api/, 'escudo'],
  [/loadbalancer|metallb|nodeport|udn|nad|rede|services/, 'rede'],
  [/escalar|hpa|replicasets/, 'escala'],
  [/pvc|storageclass|statefulset/, 'disco'],
  [/config|configuracao|quota|limitrange|clusterquota|requests|limits|template-projeto/, 'ajustes'],
  [/zstream|minor|operador|atualizar|rollback|quiz/, 'atualiza'],
  [/instalar|manual|remover/, 'engrenagem'],
  [/job|cronjob|workloads/, 'relogio'],
];

export const temaDe = (id) => (TEMAS.find(([re]) => re.test(id)) || [null, 'pod'])[1];

// Número pseudoaleatório estável a partir do id.
function semente(id) {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h >>>= 0) % 1000) / 1000;
  };
}

export function icone(nome, tamanho = 18, cor = 'currentColor') {
  return `<svg class="icone" viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="${cor}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome] || ICONES.pod}</svg>`;
}

// Banner da missão: fundo nas cores do Lab, constelação de "nós" do cluster e
// o ícone do tema em destaque.
export function banner(id, rotulo = '') {
  const r = semente(id);
  const tema = temaDe(id);
  const W = 720;
  const H = 150;
  const nos = Array.from({ length: 9 }, () => ({ x: 300 + r() * 400, y: 18 + r() * (H - 36), raio: 2.5 + r() * 4 }));
  let linhas = '';
  for (let i = 0; i < nos.length; i++) {
    const a = nos[i];
    const b = nos[(i + 1 + Math.floor(r() * 3)) % nos.length];
    linhas += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`;
  }
  const circulos = nos.map((n) => `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.raio.toFixed(1)}"/>`).join('');
  const anel = 40 + r() * 30;
  const gid = `g-${id.replace(/[^a-z0-9]/gi, '')}`;
  return `<svg class="banner" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${rotulo}">
  <defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#57449a"/><stop offset="1" stop-color="#3f3175"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#${gid})"/>
  <circle cx="${(560 + r() * 120).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${(90 + r() * 60).toFixed(0)}" fill="#d9d7ef" opacity=".08"/>
  <g stroke="#d9d7ef" stroke-opacity=".35" stroke-width="1.2">${linhas}</g>
  <g fill="#e8f1f9" fill-opacity=".85">${circulos}</g>
  <circle cx="92" cy="75" r="${anel.toFixed(0)}" fill="none" stroke="#d9d7ef" stroke-opacity=".25" stroke-width="1.5" stroke-dasharray="4 6"/>
  <circle cx="92" cy="75" r="38" fill="#e8f1f9"/>
  <g transform="translate(68 51) scale(2)" fill="none" stroke="#57449a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONES[tema]}</g>
</svg>`;
}
