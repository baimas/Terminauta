// Armazenamento: storage classes, provisionamento dinâmico de volumes (PV) e o
// vínculo dos claims (PVC). Como no laboratório do DO180, há uma classe padrão
// de bloco local (só ReadWriteOnce, liga no primeiro consumidor) e uma de NFS
// (ReadWriteMany, liga na hora).
import { uuid } from './util.js';

const PADRAO = 'storageclass.kubernetes.io/is-default-class';

export function objetosStorage() {
  return [
    {
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: { name: 'lvms-vg1', annotations: { [PADRAO]: 'true', description: 'Provides RWO and RWOP Filesystem & Block volumes' } },
      provisioner: 'topolvm.io',
      parameters: { 'csi.storage.k8s.io/fstype': 'xfs', 'topolvm.io/device-class': 'vg1' },
      reclaimPolicy: 'Delete',
      volumeBindingMode: 'WaitForFirstConsumer',
      allowVolumeExpansion: true,
    },
    {
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: { name: 'nfs-storage', annotations: { description: 'Shared NFS volumes (RWX)' } },
      provisioner: 'k8s-sigs.io/nfs-subdir-external-provisioner',
      parameters: { archiveOnDelete: 'false' },
      reclaimPolicy: 'Delete',
      volumeBindingMode: 'Immediate',
      allowVolumeExpansion: false,
    },
  ];
}

// Modos de acesso que cada provisionador aceita.
const MODOS = { 'topolvm.io': ['ReadWriteOnce', 'ReadWriteOncePod'], 'k8s-sigs.io/nfs-subdir-external-provisioner': ['ReadWriteOnce', 'ReadWriteMany', 'ReadOnlyMany'] };

// Conteúdo dos diretórios exportados pelo servidor NFS do laboratório.
export const EXPORTS_NFS = {
  '/exports-ocp4/landing': { 'index.html': '<html>\n  <head><title>Landing page</title></head>\n  <body><h1>Landing page served from NFS</h1></body>\n</html>\n' },
};

// Capacidade em bytes (1Gi, 500Mi, 1G...).
const bytes = (q) => {
  const m = String(q).match(/^(\d+(?:\.\d+)?)([KMGT]i?)?$/);
  if (!m) return 0;
  const exp = { K: 1, M: 2, G: 3, T: 4 }[(m[2] || '')[0]] || 0;
  return Number(m[1]) * (m[2]?.endsWith('i') ? 1024 : 1000) ** exp;
};

// Procura um PV pré-criado que atenda ao claim (classe, tamanho e modos de acesso).
function pvEstatico(c, pvc) {
  const modos = pvc.spec.accessModes || ['ReadWriteOnce'];
  const pedido = bytes(pvc.spec.resources?.requests?.storage || '0');
  return c.list('PersistentVolume').find((pv) => {
    const r = pv.spec.claimRef;
    if (r && !(r.name === pvc.metadata.name && r.namespace === pvc.metadata.namespace && (!r.uid || r.uid === pvc.metadata.uid))) return false;
    if (!r && pv.status?.phase && pv.status.phase !== 'Available') return false;
    if (pv.status?.phase === 'Released' || pv.status?.phase === 'Bound') return false;
    if (pvc.spec.volumeName && pvc.spec.volumeName !== pv.metadata.name) return false;
    if ((pv.spec.storageClassName || '') !== (pvc.spec.storageClassName || '')) return false;
    if (bytes(pv.spec.capacity?.storage) < pedido) return false;
    return modos.every((m) => (pv.spec.accessModes || []).includes(m));
  });
}

export const classePadrao = (c) => c.list('StorageClass').find((s) => s.metadata.annotations?.[PADRAO] === 'true');

// O claim é usado por algum pod (agendado ou à espera)?
const consumidores = (c, pvc) => c.list('Pod', pvc.metadata.namespace).filter((p) => (p.spec.volumes || []).some((v) => v.persistentVolumeClaim?.claimName === pvc.metadata.name));

export function storageCtl(c) {
  for (const pvc of c.list('PersistentVolumeClaim')) {
    if (pvc.status?.phase === 'Bound') continue;
    const st = (c.side[pvc.metadata.uid] ??= { ev: {} });
    const evento = (chave, tipo, motivo, msg, fonte) => {
      if (st.ev[chave]) return;
      st.ev[chave] = 1;
      c.event(pvc, tipo, motivo, msg, fonte);
    };
    pvc.status = { phase: 'Pending' };
    const nomeClasse = pvc.spec.storageClassName;
    const sc = nomeClasse ? c.get('StorageClass', nomeClasse) : null;
    if (!sc) {
      evento(`sc:${nomeClasse}`, 'Warning', 'ProvisioningFailed', `storageclass.storage.k8s.io "${nomeClasse}" not found`, 'persistentvolume-controller');
      continue;
    }
    const modos = pvc.spec.accessModes || ['ReadWriteOnce'];
    const estatico = pvEstatico(c, pvc);
    if (estatico) {
      estatico.spec.claimRef = { apiVersion: 'v1', kind: 'PersistentVolumeClaim', name: pvc.metadata.name, namespace: pvc.metadata.namespace, uid: pvc.metadata.uid };
      estatico.status = { phase: 'Bound' };
      pvc.spec.volumeName = estatico.metadata.name;
      pvc.metadata.annotations = { ...pvc.metadata.annotations, 'pv.kubernetes.io/bind-completed': 'yes' };
      pvc.status = { phase: 'Bound', accessModes: estatico.spec.accessModes, capacity: estatico.spec.capacity };
      continue;
    }
    if (sc.provisioner === 'kubernetes.io/no-provisioner') {
      evento('sem-pv', 'Normal', 'FailedBinding', 'no persistent volumes available for this claim and no storage class is set', 'persistentvolume-controller');
      continue;
    }
    const aceitos = MODOS[sc.provisioner] || ['ReadWriteOnce'];
    const recusado = modos.find((m) => !aceitos.includes(m));
    if (sc.volumeBindingMode === 'WaitForFirstConsumer' && !consumidores(c, pvc).length) {
      evento('espera', 'Normal', 'WaitForFirstConsumer', 'waiting for first consumer to be created before binding', 'persistentvolume-controller');
      continue;
    }
    if (recusado) {
      evento(`modo:${recusado}`, 'Warning', 'ProvisioningFailed', `failed to provision volume with StorageClass "${sc.metadata.name}": rpc error: code = InvalidArgument desc = unsupported access mode: ${recusado === 'ReadWriteMany' ? 'MULTI_NODE_MULTI_WRITER' : 'MULTI_NODE_READER_ONLY'}`, `${sc.provisioner}_${sc.provisioner === 'topolvm.io' ? 'topolvm-controller-7d4b9c6f5-x2k8q' : 'nfs-client-provisioner-5b7c9d8f6-q4w2n'}`);
      continue;
    }
    const nomePv = `pvc-${uuid(`${pvc.metadata.namespace}/${pvc.metadata.name}/${pvc.metadata.uid}`)}`;
    const tamanho = pvc.spec.resources?.requests?.storage || '1Gi';
    if (!c.get('PersistentVolume', nomePv)) {
      c.create({
        kind: 'PersistentVolume',
        metadata: { name: nomePv, annotations: { 'pv.kubernetes.io/provisioned-by': sc.provisioner }, finalizers: ['kubernetes.io/pv-protection'] },
        spec: {
          accessModes: modos,
          capacity: { storage: tamanho },
          claimRef: { apiVersion: 'v1', kind: 'PersistentVolumeClaim', name: pvc.metadata.name, namespace: pvc.metadata.namespace, uid: pvc.metadata.uid },
          persistentVolumeReclaimPolicy: sc.reclaimPolicy || 'Delete',
          storageClassName: sc.metadata.name,
          volumeMode: pvc.spec.volumeMode || 'Filesystem',
          ...(sc.provisioner === 'topolvm.io' ? { csi: { driver: 'topolvm.io', fsType: 'xfs', volumeHandle: uuid(nomePv) } } : { nfs: { path: `/exports-ocp4/${pvc.metadata.namespace}-${pvc.metadata.name}-${nomePv}`, server: '192.168.50.254' } }),
        },
        status: { phase: 'Bound' },
      });
      evento('provisiona', 'Normal', 'Provisioning', `External provisioner is provisioning volume for claim "${pvc.metadata.namespace}/${pvc.metadata.name}"`, sc.provisioner);
      evento('ok', 'Normal', 'ProvisioningSucceeded', `Successfully provisioned volume ${nomePv}`, sc.provisioner);
    }
    pvc.spec.volumeName = nomePv;
    pvc.metadata.annotations = { ...pvc.metadata.annotations, 'pv.kubernetes.io/bind-completed': 'yes', 'pv.kubernetes.io/bound-by-controller': 'yes', 'volume.beta.kubernetes.io/storage-provisioner': sc.provisioner, 'volume.kubernetes.io/storage-provisioner': sc.provisioner };
    pvc.status = { phase: 'Bound', accessModes: modos, capacity: { storage: tamanho } };
  }
  // Volumes cujo claim sumiu: com reclaimPolicy Delete, somem também.
  for (const pv of c.list('PersistentVolume')) {
    const r = pv.spec.claimRef;
    if (!r) {
      if (!pv.status?.phase) pv.status = { phase: 'Available' };
      continue;
    }
    const pvc = c.get('PersistentVolumeClaim', r.name, r.namespace);
    if (pvc && pvc.metadata.uid === r.uid) continue;
    if (pv.spec.persistentVolumeReclaimPolicy === 'Delete') c.delete('PersistentVolume', pv.metadata.name);
    else pv.status = { phase: 'Released' };
  }
}

// Motivo para o pod não ser agendado por causa dos claims, ou null.
export function claimPendente(c, pod) {
  for (const v of pod.spec.volumes || []) {
    if (!v.persistentVolumeClaim) continue;
    const pvc = c.get('PersistentVolumeClaim', v.persistentVolumeClaim.claimName, pod.metadata.namespace);
    if (!pvc || pvc.status?.phase === 'Bound') continue;
    const sc = c.get('StorageClass', pvc.spec.storageClassName || '');
    if (sc?.volumeBindingMode === 'WaitForFirstConsumer' && !(pvc.spec.accessModes || []).some((m) => !(MODOS[sc.provisioner] || []).includes(m))) continue;
    return '0/1 nodes are available: pod has unbound immediate PersistentVolumeClaims. preemption: 0/1 nodes are available: 1 Preemption is not helpful for scheduling.';
  }
  return null;
}

// Arquivos guardados num volume persistente, para sobreviver ao pod.
export const dadosDoVolume = (c, ns, claim) => {
  const pvc = c.get('PersistentVolumeClaim', claim, ns);
  if (!pvc?.spec.volumeName) return null;
  return ((c.side.volumes ??= {})[pvc.spec.volumeName] ??= { files: {}, dirs: [] });
};
