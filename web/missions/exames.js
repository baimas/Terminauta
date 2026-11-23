// Modo prova: simulados de 3 horas montados com missões que convivem no
// mesmo cluster. Sem dicas, sem correção parcial; nota de 0 a 300, corte em 210.

export const NOTA_MAXIMA = 300;
export const CORTE = 210;

export const SIMULADOS = [
  {
    id: 'prova-a',
    trilha: 'ex280',
    title: { pt: 'Simulado A', en: 'Practice exam A' },
    partes: ['c0-plantao', 'c1-manifestos', 'c1-kustomize-base', 'c2-templates', 'c2-rollback', 'c2-helm-install', 'c3-grupos', 'c4-edge', 'c4-netpol-isola', 'c5-loadbalancer', 'c5-udn', 'c6-quota', 'c6-template-projeto', 'c7-instalar', 'c8-anyuid', 'c8-job', 'c8-cronjob', 'c9-zstream'],
  },
  {
    id: 'prova-b',
    trilha: 'ex280',
    title: { pt: 'Simulado B', en: 'Practice exam B' },
    partes: ['c0-imagens', 'c1-configuracao', 'c1-exportar', 'c2-replicasets', 'c2-helm-upgrade', 'c3-usuarios', 'c4-passthrough', 'c4-service-ca', 'c5-nodeport', 'c5-metallb', 'c5-nad', 'c6-limitrange', 'c6-clusterquota', 'c7-manual', 'c8-api', 'c8-privilegiado', 'c8-scc-diagnostico', 'c9-operador'],
  },
  // As 20 questões do guia de laboratório prático, exatamente como no guia.
  {
    id: 'prova-guia',
    trilha: 'ex280',
    guia: true,
    title: { pt: 'Simulado do Guia (20 questões)', en: 'Lab guide exam (20 questions)' },
    partes: ['g01-htpasswd', 'g02-projetos-rbac', 'g03-grupos', 'g04-quota', 'g05-limitrange', 'g06-escala-manual', 'g07-hpa', 'g08-secret', 'g09-secret-env', 'g10-rota-edge', 'g11-sa-anyuid', 'g12-gitlab-scc', 'g13-helm', 'g14-cronjob', 'g15-template-projeto', 'g16-file-integrity', 'g17-pv-nfs', 'g18-must-gather', 'g19-netpol-mysql', 'g20-liveness'],
  },
  // EX180: 2 horas (página oficial). A nota de corte oficial não foi publicada;
  // usamos 210 de 300, como na EX280.
  {
    id: 'prova180-a',
    trilha: 'ex180',
    minutos: 120,
    title: { pt: 'Simulado EX180 A', en: 'EX180 practice exam A' },
    partes: ['e1-saude', 'e1-suporte', 'e2-pods', 'e2-troubleshoot', 'e3-template', 'e3-escalar-expor', 'e4-config', 'e4-storageclass', 'e5-probes', 'e5-hpa', 'e6-gatilho'],
  },
  {
    id: 'prova180-b',
    trilha: 'ex180',
    minutos: 120,
    title: { pt: 'Simulado EX180 B', en: 'EX180 practice exam B' },
    partes: ['e1-inspecionar', 'e2-imagens', 'e3-imagem', 'e3-rede', 'e3-workloads', 'e4-pvc', 'e4-statefulset', 'e5-requests', 'e5-limits', 'e6-imagestream', 'e6-atualizar'],
  },
];

// Cada missão guarda seu estado de correção em `side.missao`; na prova, cada
// parte tem o seu, e a correção troca o estado antes de testar a parte.
const comEstado = (id, fn) => async (w) => {
  const c = w.cluster;
  const antes = c.side.missao;
  c.side.missao = c.side.exame?.[id];
  try {
    return await fn(w);
  } finally {
    c.side.missao = antes;
  }
};

export function montaExame(def, missoes) {
  const partes = def.partes.map((id) => {
    const m = missoes.find((x) => x.id === id);
    if (!m) throw new Error(`missão ${id} não existe`);
    return m;
  });
  return {
    id: def.id,
    exam: true,
    guia: Boolean(def.guia),
    trilha: def.trilha,
    minutes: def.minutos || 180,
    xp: 0,
    difficulty: 3,
    title: def.title,
    story: {
      pt: `Prova prática no formato da ${def.trilha === 'ex180' ? 'EX180' : 'EX280'}: ${def.minutos === 120 ? '2 horas' : '3 horas'}, um cluster só, as tarefas na ordem que você quiser. Não há dicas nem correção parcial; a nota sai quando você entregar a prova ou quando o tempo acabar.`,
      en: `Hands-on exam in the ${def.trilha === 'ex180' ? 'EX180' : 'EX280'} format: ${def.minutos === 120 ? '2 hours' : '3 hours'}, a single cluster, tasks in any order you like. There are no hints and no partial grading; the score comes out when you submit or when time runs out.`,
    },
    partes,
    tasks: { pt: partes.flatMap((m) => m.tasks.pt), en: partes.flatMap((m) => m.tasks.en) },
    hints: [],
    objectives: [...new Set(partes.flatMap((m) => m.objectives))],
    checks: partes.flatMap((m) => m.checks.map((ch) => ({ ...ch, parte: m.id, test: comEstado(m.id, ch.test) }))),
    solution: partes.flatMap((m) => m.solution.map((s) => ({ ...s, parte: m.id }))),
    async setup(w) {
      const c = w.cluster;
      c.side.exame = {};
      for (const m of partes) {
        c.side.missao = undefined;
        if (m.setup) await m.setup(w);
        c.side.exame[m.id] = c.side.missao;
      }
      c.side.missao = undefined;
    },
  };
}

// Nota final: cada tarefa vale o mesmo, proporcional aos itens aprovados.
export function notaDoExame(exame, resultado, capituloDe) {
  const porParte = exame.partes.map((m) => {
    const itens = resultado.filter((r, i) => exame.checks[i].parte === m.id);
    const ok = itens.filter((r) => r.ok).length;
    return { id: m.id, title: m.title, capitulo: capituloDe(m.id), ok, total: itens.length, fracao: itens.length ? ok / itens.length : 0, itens };
  });
  const nota = Math.round((porParte.reduce((n, p) => n + p.fracao, 0) / porParte.length) * NOTA_MAXIMA);
  const dominios = {};
  for (const p of porParte) {
    const d = (dominios[p.capitulo.id] ??= { capitulo: p.capitulo, soma: 0, n: 0 });
    d.soma += p.fracao;
    d.n++;
  }
  return { nota, passou: nota >= CORTE, porParte, dominios: Object.values(dominios).map((d) => ({ capitulo: d.capitulo, pct: Math.round((d.soma / d.n) * 100) })) };
}
