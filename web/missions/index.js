// Catálogo de trilhas (EX280 e EX180), capítulos e missões. Cada capítulo
// espelha um domínio dos objetivos oficiais da prova da trilha.
import primeiroDia from './c0/primeiro-dia.js';
import inventario from './c0/inventario.js';
import plantao from './c0/plantao.js';
import imagens from './c0/imagens.js';
import saude from './c0/saude.js';
import manifestos from './c1/manifestos.js';
import configuracao from './c1/configuracao.js';
import kustomizeBase from './c1/kustomize-base.js';
import overlays from './c1/overlays.js';
import replicasets from './c2/replicasets.js';
import servicos from './c2/services.js';
import templates from './c2/templates.js';
import templateProprio from './c2/template-proprio.js';
import helmInstall from './c2/helm-install.js';
import helmUpgrade from './c2/helm-upgrade.js';
import htpasswdMissao from './c3/htpasswd.js';
import usuarios from './c3/usuarios.js';
import gruposMissao from './c3/grupos.js';
import papelProprio from './c3/papel-proprio.js';
import kubeadmin from './c3/kubeadmin.js';
import edge from './c4/edge.js';
import passthrough from './c4/passthrough.js';
import serviceCa from './c4/service-ca.js';
import netpolIsola from './c4/netpol-isola.js';
import netpolConserto from './c4/netpol-conserto.js';
import loadbalancer from './c5/loadbalancer.js';
import metallb from './c5/metallb.js';
import nodeport from './c5/nodeport.js';
import troubleshootLb from './c5/troubleshoot.js';
import udnMissao from './c5/udn.js';
import nadMissao from './c5/nad.js';
import quotaMissao from './c6/quota.js';
import limitrange from './c6/limitrange.js';
import clusterquota from './c6/clusterquota.js';
import templateProjeto from './c6/template-projeto.js';
import selfProvisioner from './c6/self-provisioner.js';
import instalarOp from './c7/instalar.js';
import manualOp from './c7/manual.js';
import travadoOp from './c7/travado.js';
import removerOp from './c7/remover.js';
import anyuid from './c8/anyuid.js';
import sccDiagnostico from './c8/scc-diagnostico.js';
import apiAcesso from './c8/api.js';
import cronjobMissao from './c8/cronjob.js';
import zstream from './c9/zstream.js';
import minorUp from './c9/minor.js';
import operadorUp from './c9/operador.js';
import quizUp from './c9/quiz.js';
import instalarOc from './e1/instalar-oc.js';
import inspecionar180 from './e1/inspecionar.js';
import saude180 from './e1/saude.js';
import suporte180 from './e1/suporte.js';
import pods180 from './e2/pods.js';
import imagens180 from './e2/imagens.js';
import troubleshoot180 from './e2/troubleshoot.js';
import imagem180 from './e3/imagem.js';
import template180 from './e3/template.js';
import workloads180 from './e3/workloads.js';
import rede180 from './e3/rede.js';
import escalar180 from './e3/escalar-expor.js';
import config180 from './e4/config.js';
import pvc180 from './e4/pvc.js';
import sc180 from './e4/storageclass.js';
import sts180 from './e4/statefulset.js';
import probes180 from './e5/probes.js';
import requests180 from './e5/requests.js';
import limits180 from './e5/limits.js';
import hpa180 from './e5/hpa.js';
import atualizar180 from './e6/atualizar.js';
import is180 from './e6/imagestream.js';
import gatilho180 from './e6/gatilho.js';
import { SIMULADOS, montaExame } from './exames.js';
import documentacao from './c0/documentacao.js';
import exportar from './c1/exportar.js';
import rollback from './c2/rollback.js';
import QUESTOES_GUIA from './g/guia.js';
import jobMissao from './c8/job.js';
import privilegiado from './c8/privilegiado.js';

const CAPITULOS_280 = [
  { id: 'c0', title: { pt: 'Primeiro dia', en: 'First day' }, domain: { pt: 'Gerenciar o OpenShift Container Platform', en: 'Manage OpenShift Container Platform' }, missions: [primeiroDia, inventario, imagens, plantao, saude, documentacao] },
  { id: 'c1', title: { pt: 'Gestão declarativa', en: 'Declarative management' }, domain: { pt: 'Manifestos, Kustomize, secrets e config maps', en: 'Manifests, Kustomize, secrets, and config maps' }, missions: [manifestos, configuracao, kustomizeBase, overlays, exportar] },
  { id: 'c2', title: { pt: 'Aplicações empacotadas', en: 'Packaged applications' }, domain: { pt: 'Templates, Helm, services e labels', en: 'Templates, Helm, services, and labels' }, missions: [replicasets, servicos, rollback, templates, templateProprio, helmInstall, helmUpgrade] },
  { id: 'c3', title: { pt: 'Identidade', en: 'Identity' }, domain: { pt: 'HTPasswd, usuários, grupos e RBAC', en: 'HTPasswd, users, groups, and RBAC' }, missions: [htpasswdMissao, usuarios, gruposMissao, papelProprio, kubeadmin] },
  { id: 'c4', title: { pt: 'Segurança de rede', en: 'Network security' }, domain: { pt: 'Routes, TLS e network policies', en: 'Routes, TLS, and network policies' }, missions: [edge, passthrough, serviceCa, netpolIsola, netpolConserto] },
  { id: 'c5', title: { pt: 'Além do HTTP', en: 'Beyond HTTP' }, domain: { pt: 'LoadBalancer, acesso externo e redes adicionais', en: 'LoadBalancer, external access, and additional networks' }, missions: [loadbalancer, metallb, nodeport, troubleshootLb, udnMissao, nadMissao] },
  { id: 'c6', title: { pt: 'Autosserviço', en: 'Self-service' }, domain: { pt: 'Quotas, limit ranges e project template', en: 'Quotas, limit ranges, and project template' }, missions: [quotaMissao, limitrange, clusterquota, templateProjeto, selfProvisioner] },
  { id: 'c7', title: { pt: 'Operators', en: 'Operators' }, domain: { pt: 'Instalar e remover operators', en: 'Install and remove operators' }, missions: [instalarOp, manualOp, travadoOp, removerOp] },
  { id: 'c8', title: { pt: 'Segurança de aplicações', en: 'Application security' }, domain: { pt: 'Service accounts, SCC, jobs e cron jobs', en: 'Service accounts, SCCs, jobs, and cron jobs' }, missions: [anyuid, privilegiado, sccDiagnostico, apiAcesso, jobMissao, cronjobMissao] },
  { id: 'c9', title: { pt: 'Updates', en: 'Updates' }, domain: { pt: 'Atualização do cluster e de operators', en: 'Cluster and operator updates' }, missions: [zstream, minorUp, operadorUp, quizUp] },
];

// As 20 questões do guia de laboratório prático, na ordem do guia.
const CAPITULO_GUIA = { id: 'g', guia: true, title: { pt: 'Guia de laboratório', en: 'Lab guide' }, domain: { pt: 'As 20 questões do guia prático EX280, com o enunciado do guia', en: 'The 20 questions of the EX280 practical guide, with the guide wording' }, missions: QUESTOES_GUIA };
CAPITULOS_280.push(CAPITULO_GUIA);

const CAPITULOS_180 = [
  { id: 'e1', title: { pt: 'Cluster e CLI', en: 'Cluster and CLI' }, domain: { pt: 'Gerenciar o OpenShift: CLI, inspeção, saúde e dados de suporte', en: 'Manage OpenShift: CLI, inspection, health, and support data' }, missions: [instalarOc, inspecionar180, saude180, suporte180] },
  { id: 'e2', title: { pt: 'Contêineres e pods', en: 'Containers and pods' }, domain: { pt: 'Pods, imagens e troubleshooting', en: 'Pods, images, and troubleshooting' }, missions: [pods180, imagens180, troubleshoot180] },
  { id: 'e3', title: { pt: 'Implantar e expor', en: 'Deploy and expose' }, domain: { pt: 'Imagens, templates, workloads, rede e routes', en: 'Images, templates, workloads, networking, and routes' }, missions: [imagem180, template180, workloads180, rede180, escalar180] },
  { id: 'e4', title: { pt: 'Configuração e dados', en: 'Configuration and data' }, domain: { pt: 'Config maps, secrets, PVCs, storage classes e stateful sets', en: 'Config maps, secrets, PVCs, storage classes, and stateful sets' }, missions: [config180, pvc180, sc180, sts180] },
  { id: 'e5', title: { pt: 'Confiabilidade', en: 'Reliability' }, domain: { pt: 'Probes, requests, limits e autoscaling', en: 'Probes, requests, limits, and autoscaling' }, missions: [probes180, requests180, limits180, hpa180] },
  { id: 'e6', title: { pt: 'Atualizações', en: 'Updates' }, domain: { pt: 'Imagens, rollouts, image streams e gatilhos', en: 'Images, rollouts, image streams, and triggers' }, missions: [atualizar180, is180, gatilho180] },
];

// As duas provas. O progresso é por missão, então trocar de trilha não perde nada.
export const TRILHAS = [
  { id: 'ex280', nome: 'EX280', curso: 'DO280', versao: '4.22', titulo: { pt: 'Red Hat Certified OpenShift Administrator', en: 'Red Hat Certified OpenShift Administrator' }, capitulos: CAPITULOS_280 },
  { id: 'ex180', nome: 'EX180', curso: 'DO180', versao: '4.22', titulo: { pt: 'Red Hat Certified Technologist in OpenShift', en: 'Red Hat Certified Technologist in OpenShift' }, capitulos: CAPITULOS_180 },
];
for (const t of TRILHAS) for (const c of t.capitulos) c.trilha = t.id;

export const CHAPTERS = TRILHAS.flatMap((t) => t.capitulos);
export const MISSIONS = CHAPTERS.flatMap((c) => c.missions.map((m) => ({ ...m, chapter: c.id, trilha: c.trilha })));
export const EXAMS = SIMULADOS.map((d) => montaExame(d, MISSIONS));
export const trilha = (id) => TRILHAS.find((t) => t.id === id) || TRILHAS[0];
export const missoesDa = (id) => MISSIONS.filter((m) => m.trilha === id);
export const examesDa = (id) => EXAMS.filter((e) => e.trilha === id);
export const byId = (id) => MISSIONS.find((m) => m.id === id) || EXAMS.find((m) => m.id === id);
export const chapterOf = (id) => CHAPTERS.find((c) => c.missions.some((m) => m.id === id));

// Rótulos das missões e o texto oficial em inglês (web/missions/objetivos.js).
import { OBJETIVOS_EN } from './objetivos.js';
export const objective = (texto, idioma) => (idioma === 'en' ? OBJETIVOS_EN[texto] || texto : texto);
