// Guia de laboratório EX280: as 20 questões do guia prático, com o enunciado e os
// objetivos exatamente como no guia. Cada questão é uma missão e, juntas, formam o
// simulado do guia (web/missions/exames.js). Onde o guia dá variações do cenário
// (outros nomes e valores), a correção aceita as variações.
import { b64 } from '../../sim/util.js';
import { leHtpasswd, confereSenha, pode as rbacPode } from '../../sim/rbac.js';
import { umCert, umaChave } from '../../sim/tls.js';
import { valor } from '../../sim/quota.js';
import { cron } from '../../sim/jobs.js';
import { releases } from '../../sim/helm.js';
import { criaProjeto, reconciliaPapeisPadrao } from '../../sim/projetos.js';
import { destinoTcp } from '../../sim/net.js';
import { PROJECT_CONFIG } from '../../sim/resources.js';
import { deployment } from '../../engine/world.js';
import { copia, mesmos } from '../c6/comum.js';

const HTTPD = 'registry.access.redhat.com/ubi9/httpd-24';
// Dentro do exame (side.exame existe) as questões convivem no mesmo cluster, e a
// preparação do que vem de outra questão só vale quando ela roda sozinha.
const sozinha = (w) => !w.cluster.side.exame;
const standalone = (w, fn) => (sozinha(w) ? fn() : undefined);

const pode = (w, u, ...r) => w.pode(u, ...r);
const criaProjetos = (w, u) => pode(w, u, 'create', 'projectrequests', 'project.openshift.io');
const mem = (x) => valor('memory', x);
const cpu = (x) => valor('cpu', x);

// Questão 1 ---------------------------------------------------------------------

const USUARIOS_Q1 = { bob: ['indionce', 'redhat'], qwerty: ['catalog'], john: ['john123'], armstrong: ['natasha123'], natasha: ['arthstrong'], harry: ['harry123'], susan: ['susuan123'] };
const idps = (w) => w.get('OAuth', 'cluster').spec.identityProviders || [];
const sessao = (w, u) => w.credencial(u, USUARIOS_Q1[u][0]) || USUARIOS_Q1[u].some((s) => w.credencial(u, s));

const q01 = {
  id: 'g01-htpasswd',
  minutes: 15,
  xp: 220,
  difficulty: 2,
  objectives: ['Configurar o identity provider HTPasswd', 'Criar e excluir usuários'],
  title: { pt: 'Questão 1: Gerenciamento de Provedores de Identidade (HTPasswd)', en: 'Question 1: Identity provider management (HTPasswd)' },
  story: {
    pt: 'Configure o serviço de autenticação OAuth do cluster OpenShift para utilizar um provedor de identidade baseado em arquivo `HTPasswd`.',
    en: 'Configure the OpenShift cluster OAuth authentication service to use a file-based `HTPasswd` identity provider.',
  },
  tasks: {
    pt: [
      'Criar um arquivo de senhas utilizando a ferramenta `htpasswd` contendo os seguintes usuários e senhas: `bob` / senha: `indionce` *(Nota: no ambiente de teste foi usado `redhat`, ajuste conforme sua preferência de estudo)*; `qwerty` / senha: `catalog`; `john` / senha: `john123`; `armstrong` / senha: `natasha123`; `natasha` / senha: `arthstrong`; `harry` / senha: `harry123`; `susan` / senha: `susuan123`.',
      'Criar um *Secret* genérico no namespace `openshift-config` chamado `ex280-secure` contendo o arquivo gerado (chave `htpasswd`).',
      'Configurar o recurso `OAuth` (`cluster`) adicionando um provedor do tipo `HTPasswd` com: nome do provedor `ex280-idp-secure`; método de mapeamento (`mappingMethod`) `claim`; referência ao Secret `ex280-secure`.',
      'Validar que os pods de autenticação (`openshift-authentication`) foram reiniciados com sucesso e testar o login (`oc login`) com os novos usuários.',
    ],
    en: [
      'Create a password file with the `htpasswd` tool containing the following users and passwords: `bob` / password `indionce` *(Note: the test environment used `redhat`, adjust to your study preference)*; `qwerty` / password `catalog`; `john` / password `john123`; `armstrong` / password `natasha123`; `natasha` / password `arthstrong`; `harry` / password `harry123`; `susan` / password `susuan123`.',
      'Create a generic *Secret* in the `openshift-config` namespace named `ex280-secure` containing the generated file (key `htpasswd`).',
      'Configure the `OAuth` resource (`cluster`) by adding an `HTPasswd` provider with: provider name `ex280-idp-secure`; mapping method (`mappingMethod`) `claim`; reference to the `ex280-secure` Secret.',
      'Validate that the authentication pods (`openshift-authentication`) restarted successfully and test the login (`oc login`) with the new users.',
    ],
  },
  hints: [
    { pt: '`htpasswd -c -B -b ARQUIVO usuário senha` cria o arquivo; sem o `-c`, acrescenta usuários. A chave do secret precisa se chamar `htpasswd`.', en: '`htpasswd -c -B -b FILE user password` creates the file; without `-c`, it adds users. The secret key must be named `htpasswd`.' },
    { pt: 'Acrescente o provedor em `spec.identityProviders` do `oauth/cluster` sem apagar o `localusers` (`oc edit oauth cluster` ou `oc patch --type json`).', en: 'Add the provider under `spec.identityProviders` of `oauth/cluster` without deleting `localusers` (`oc edit oauth cluster` or `oc patch --type json`).' },
    { pt: 'A mudança só vale depois que os pods de `openshift-authentication` são recriados: acompanhe com `oc get pods -n openshift-authentication` antes do `oc login`.', en: 'The change only takes effect after the `openshift-authentication` pods are recreated: follow them with `oc get pods -n openshift-authentication` before `oc login`.' },
  ],
  setup(w) {
    w.fs.mkdir('/home/student/auth', true);
  },
  checks: [
    {
      text: { pt: 'O arquivo de senhas tem os sete usuários com as senhas certas', en: 'The password file has the seven users with the right passwords' },
      test: (w) => {
        const arq = w.fs.walk('/home/student').filter((f) => /\/(auth|htpasswd)[^/]*$|htpasswd/.test(f) && w.fs.isFile(f));
        const bruto = b64.dec(w.get('Secret', 'ex280-secure', 'openshift-config').data.htpasswd);
        const m = leHtpasswd(bruto);
        return arq.length > 0 && Object.entries(USUARIOS_Q1).every(([u, senhas]) => m[u] && senhas.some((s) => confereSenha(m[u], s)));
      },
    },
    {
      text: { pt: 'O secret ex280-secure existe em openshift-config com a chave htpasswd', en: 'The ex280-secure secret exists in openshift-config with the htpasswd key' },
      test: (w) => Object.keys(USUARIOS_Q1).every((u) => b64.dec(w.get('Secret', 'ex280-secure', 'openshift-config').data.htpasswd).includes(`${u}:`)),
    },
    {
      text: { pt: 'O OAuth tem o provedor HTPasswd ex280-idp-secure (claim) ligado ao secret', en: 'The OAuth has the ex280-idp-secure HTPasswd provider (claim) bound to the secret' },
      test: (w) => {
        const p = idps(w).find((i) => i.name === 'ex280-idp-secure');
        return p?.type === 'HTPasswd' && p.mappingMethod === 'claim' && p.htpasswd?.fileData?.name === 'ex280-secure' && idps(w).some((i) => i.name === 'localusers');
      },
    },
    {
      text: { pt: 'Os pods de autenticação foram reiniciados e estão prontos', en: 'The authentication pods were restarted and are ready' },
      test: (w) => w.pods('openshift-authentication').length > 0 && w.pods('openshift-authentication').every(w.podPronto) && w.get('ClusterOperator', 'authentication').status.conditions.some((c) => c.type === 'Progressing' && c.status === 'False'),
    },
    {
      text: { pt: 'Os sete usuários conseguem fazer login', en: 'All seven users can log in' },
      test: (w) => Object.keys(USUARIOS_Q1).every((u) => sessao(w, u)),
    },
  ],
  solution: [
    { cmd: 'mkdir -p ~/auth', pt: 'Pasta do arquivo de senhas.', en: 'Folder for the password file.' },
    { cmd: "htpasswd -c -B -b ~/auth/ex280.htpasswd bob indionce", pt: 'Cria o arquivo com o primeiro usuário.', en: 'Creates the file with the first user.' },
    { cmd: 'htpasswd -B -b ~/auth/ex280.htpasswd qwerty catalog', pt: 'Sem `-c`, para não apagar o arquivo.', en: 'Without `-c`, so the file is not erased.' },
    { cmd: 'htpasswd -B -b ~/auth/ex280.htpasswd john john123', pt: 'Terceiro usuário.', en: 'Third user.' },
    { cmd: 'htpasswd -B -b ~/auth/ex280.htpasswd armstrong natasha123', pt: 'Quarto usuário.', en: 'Fourth user.' },
    { cmd: 'htpasswd -B -b ~/auth/ex280.htpasswd natasha arthstrong', pt: 'Quinto usuário.', en: 'Fifth user.' },
    { cmd: 'htpasswd -B -b ~/auth/ex280.htpasswd harry harry123', pt: 'Sexto usuário.', en: 'Sixth user.' },
    { cmd: 'htpasswd -B -b ~/auth/ex280.htpasswd susan susuan123', pt: 'Sétimo usuário.', en: 'Seventh user.' },
    { cmd: 'oc create secret generic ex280-secure --from-file htpasswd=$HOME/auth/ex280.htpasswd -n openshift-config', pt: 'A chave do secret precisa ser `htpasswd`.', en: 'The secret key must be `htpasswd`.' },
    { cmd: 'oc patch oauth cluster --type json -p \'[{"op":"add","path":"/spec/identityProviders/-","value":{"name":"ex280-idp-secure","mappingMethod":"claim","type":"HTPasswd","htpasswd":{"fileData":{"name":"ex280-secure"}}}}]\'', pt: 'Acrescenta o provedor sem tocar no `localusers`. Pelo `oc edit` o resultado é o mesmo.', en: 'Appends the provider without touching `localusers`. With `oc edit` the result is the same.' },
    { cmd: 'sleep 60', pt: 'Espera o rollout dos pods de autenticação.', en: 'Waits for the authentication pods rollout.' },
    { cmd: 'oc get pods -n openshift-authentication', pt: 'Pods novos, `Running`.', en: 'New pods, `Running`.' },
    { cmd: 'oc login -u bob -p indionce', pt: 'Testa um usuário novo.', en: 'Tests a new user.' },
    { cmd: 'oc login -u admin -p redhatocp', pt: 'Volta para o administrador.', en: 'Goes back to the administrator.' },
  ],
};

// Questão 2 ---------------------------------------------------------------------

const q02 = {
  id: 'g02-projetos-rbac',
  minutes: 25,
  xp: 260,
  difficulty: 3,
  objectives: ['Criar e excluir projetos', 'Modificar permissões de usuários e grupos', 'Configurar o autoprovisionamento de projetos'],
  title: { pt: 'Questão 2: Gerenciamento de Projetos, Permissões (RBAC) e Remoção do Kubeadmin', en: 'Question 2: Projects, permissions (RBAC), and removing kubeadmin' },
  story: {
    pt: 'Configure a estrutura de namespaces e controle de acesso baseado em funções (RBAC) para os usuários criados anteriormente, além de reforçar a segurança removendo o usuário administrador temporário.',
    en: 'Set up the namespace structure and role-based access control (RBAC) for the users created earlier, and strengthen security by removing the temporary administrator user.',
  },
  tasks: {
    pt: [
      'Criar três novos projetos no cluster: `apollo`, `test` e `demo`.',
      'Conceder a role de administrador do cluster (`cluster-admin`) ao usuário `bob`.',
      'Impedir que usuários comuns criem novos projetos por conta própria, removendo a role `self-provisioner` do grupo `system:authenticated:oauth` (garantindo que a alteração não seja sobrescrita pelo operador).',
      'Conceder permissão específica para que apenas o usuário `john` possa criar novos projetos (`self-provisioner`).',
      'Validar que o usuário `qwerty` está bloqueado de criar novos projetos.',
      'Conceder permissão de apenas leitura (`view`) para a usuária `natasha` nos projetos `apollo` e `test`.',
      'Conceder permissão de administrador local (`admin`) para o usuário `armstrong` no projeto `apollo`.',
      'Remover o usuário padrão `kubeadmin` excluindo seu respectivo *Secret* no namespace `kube-system`.',
    ],
    en: [
      'Create three new projects in the cluster: `apollo`, `test`, and `demo`.',
      'Grant the cluster administrator role (`cluster-admin`) to the user `bob`.',
      'Prevent regular users from creating new projects on their own, by removing the `self-provisioner` role from the `system:authenticated:oauth` group (making sure the change is not overwritten by the operator).',
      'Grant a specific permission so that only the user `john` can create new projects (`self-provisioner`).',
      'Validate that the user `qwerty` is blocked from creating new projects.',
      'Grant read-only permission (`view`) to the user `natasha` in the `apollo` and `test` projects.',
      'Grant local administrator permission (`admin`) to the user `armstrong` in the `apollo` project.',
      'Remove the default `kubeadmin` user by deleting its *Secret* in the `kube-system` namespace.',
    ],
  },
  hints: [
    { pt: '`oc adm policy add-cluster-role-to-user cluster-admin bob` e `oc adm policy add-role-to-user view natasha -n apollo` cuidam das permissões.', en: '`oc adm policy add-cluster-role-to-user cluster-admin bob` and `oc adm policy add-role-to-user view natasha -n apollo` take care of the permissions.' },
    { pt: 'O servidor de API recoloca o binding `self-provisioners` ao reiniciar, a menos que ele tenha a anotação `rbac.authorization.kubernetes.io/autoupdate=false`. Anote o binding e depois tire os subjects dele com `oc patch ... -p \'{"subjects":null}\'`: `oc adm policy remove-cluster-role-from-group` apaga o binding inteiro, e com ele a anotação.', en: 'The API server puts the `self-provisioners` binding back on restart unless it has the `rbac.authorization.kubernetes.io/autoupdate=false` annotation. Annotate the binding and then clear its subjects with `oc patch ... -p \'{"subjects":null}\'`: `oc adm policy remove-cluster-role-from-group` deletes the whole binding, and the annotation with it.' },
    { pt: 'O `kubeadmin` é o secret `kubeadmin` do namespace `kube-system`: `oc delete secret kubeadmin -n kube-system`. Faça isso por último, depois de ter o `bob` como `cluster-admin`.', en: 'The `kubeadmin` user is the `kubeadmin` secret in the `kube-system` namespace: `oc delete secret kubeadmin -n kube-system`. Do it last, once `bob` is `cluster-admin`.' },
  ],
  setup() {},
  checks: [
    {
      text: { pt: 'Os projetos apollo, test e demo existem', en: 'The apollo, test, and demo projects exist' },
      test: (w) => ['apollo', 'test', 'demo'].every((n) => w.get('Namespace', n)),
    },
    {
      text: { pt: 'bob é cluster-admin', en: 'bob is cluster-admin' },
      test: (w) => pode(w, 'bob', '*', '*', '') && pode(w, 'bob', 'delete', 'nodes', ''),
    },
    {
      text: { pt: 'Usuários comuns não criam projetos, e a regra sobrevive ao reinício da API', en: 'Regular users cannot create projects, and the rule survives an API restart' },
      test: (w) => {
        const c = copia(w);
        reconciliaPapeisPadrao(c);
        return !criaProjetos(w, 'qwerty') && !criaProjetos(w, 'developer') && !rbacPode(c, 'qwerty', 'create', 'projectrequests', 'project.openshift.io') && !rbacPode(c, 'developer', 'create', 'projectrequests', 'project.openshift.io');
      },
    },
    {
      text: { pt: 'Só john (além do cluster-admin) cria projetos', en: 'Only john (besides cluster-admin) creates projects' },
      test: (w) => criaProjetos(w, 'john') && !criaProjetos(w, 'qwerty') && !criaProjetos(w, 'natasha') && !criaProjetos(w, 'armstrong'),
    },
    {
      text: { pt: 'natasha só lê em apollo e test', en: 'natasha only reads in apollo and test' },
      test: (w) => ['apollo', 'test'].every((n) => pode(w, 'natasha', 'get', 'pods', '', n) && !pode(w, 'natasha', 'create', 'pods', '', n)) && !pode(w, 'natasha', 'get', 'pods', '', 'demo'),
    },
    {
      text: { pt: 'armstrong é admin de apollo, e só dele', en: 'armstrong is admin of apollo, and only there' },
      test: (w) => pode(w, 'armstrong', 'delete', 'pods', '', 'apollo') && pode(w, 'armstrong', 'create', 'rolebindings', 'rbac.authorization.k8s.io', 'apollo') && !pode(w, 'armstrong', 'get', 'pods', '', 'test'),
    },
    {
      text: { pt: 'O secret kubeadmin foi excluído', en: 'The kubeadmin secret was deleted' },
      test: (w) => !w.get('Secret', 'kubeadmin', 'kube-system'),
    },
  ],
  solution: [
    { cmd: 'oc new-project apollo', pt: 'Primeiro projeto.', en: 'First project.' },
    { cmd: 'oc new-project test', pt: 'Segundo projeto.', en: 'Second project.' },
    { cmd: 'oc new-project demo', pt: 'Terceiro projeto.', en: 'Third project.' },
    { cmd: 'oc adm policy add-cluster-role-to-user cluster-admin bob', pt: 'bob vira administrador do cluster.', en: 'bob becomes cluster administrator.' },
    { cmd: 'oc describe clusterrolebinding self-provisioners', pt: 'O papel vai para todos os usuários autenticados.', en: 'The role goes to every authenticated user.' },
    { cmd: 'oc annotate clusterrolebinding self-provisioners rbac.authorization.kubernetes.io/autoupdate=false --overwrite', pt: 'Impede que o servidor de API restaure o binding.', en: 'Stops the API server from restoring the binding.' },
    { cmd: 'oc patch clusterrolebinding.rbac self-provisioners -p \'{"subjects":null}\'', pt: 'Tira o grupo `system:authenticated:oauth`, sem apagar o binding.', en: 'Removes the `system:authenticated:oauth` group, without deleting the binding.' },
    { cmd: 'oc adm policy add-cluster-role-to-user self-provisioner john', pt: 'Só john pode criar projetos.', en: 'Only john can create projects.' },
    { cmd: 'oc auth can-i create projectrequests --as qwerty', pt: '`no`: qwerty está bloqueado.', en: '`no`: qwerty is blocked.', falha: true },
    { cmd: 'oc adm policy add-role-to-user view natasha -n apollo', pt: 'Leitura em apollo.', en: 'Read access in apollo.' },
    { cmd: 'oc adm policy add-role-to-user view natasha -n test', pt: 'Leitura em test.', en: 'Read access in test.' },
    { cmd: 'oc adm policy add-role-to-user admin armstrong -n apollo', pt: 'Administrador local de apollo.', en: 'Local administrator of apollo.' },
    { cmd: 'oc delete secret kubeadmin -n kube-system', pt: 'Remove o usuário temporário.', en: 'Removes the temporary user.' },
  ],
};

// Questão 3 ---------------------------------------------------------------------

const q03 = {
  id: 'g03-grupos',
  minutes: 15,
  xp: 200,
  difficulty: 2,
  objectives: ['Criar e gerenciar grupos', 'Modificar permissões de usuários e grupos'],
  title: { pt: 'Questão 3: Gerenciamento de Grupos e Permissões Coletivas', en: 'Question 3: Group management and collective permissions' },
  story: {
    pt: 'Organize os usuários em grupos lógicos e atribua permissões em nível de projeto para facilitar a administração de acessos.',
    en: 'Organize the users into logical groups and assign project-level permissions to make access administration easier.',
  },
  tasks: {
    pt: [
      'Criar dois grupos no OpenShift: `site-users` e `guest-users`.',
      'Adicionar o usuário `qwerty` ao grupo `guest-users`.',
      'Adicionar os usuários `harry` e `susan` ao grupo `site-users`.',
      'Conceder permissão de edição (`edit`) para o grupo `site-users` no projeto `test`.',
      'Conceder permissão de visualização (`view`) para o grupo `guest-users` no projeto `demo`.',
      'Verificar os *RoleBindings* gerados nos projetos `test` e `demo`.',
    ],
    en: [
      'Create two groups in OpenShift: `site-users` and `guest-users`.',
      'Add the user `qwerty` to the `guest-users` group.',
      'Add the users `harry` and `susan` to the `site-users` group.',
      'Grant edit permission (`edit`) to the `site-users` group in the `test` project.',
      'Grant view permission (`view`) to the `guest-users` group in the `demo` project.',
      'Check the *RoleBindings* generated in the `test` and `demo` projects.',
    ],
  },
  hints: [
    { pt: '`oc adm groups new site-users harry susan` cria o grupo já com membros; `oc adm groups add-users guest-users qwerty` acrescenta depois.', en: '`oc adm groups new site-users harry susan` creates the group with members; `oc adm groups add-users guest-users qwerty` adds more later.' },
    { pt: '`oc adm policy add-role-to-group edit site-users -n test` gera o RoleBinding. Confira com `oc get rolebinding -n test`.', en: '`oc adm policy add-role-to-group edit site-users -n test` generates the RoleBinding. Check it with `oc get rolebinding -n test`.' },
  ],
  setup(w) {
    standalone(w, () => {
      for (const n of ['test', 'demo']) w.cluster.create({ kind: 'Namespace', metadata: { name: n } });
    });
  },
  checks: [
    {
      text: { pt: 'Os grupos site-users e guest-users existem com os membros certos', en: 'The site-users and guest-users groups exist with the right members' },
      test: (w) => {
        const s = (w.get('Group', 'site-users')?.users || []).slice().sort().join();
        const g = (w.get('Group', 'guest-users')?.users || []).slice().sort().join();
        return s === 'harry,susan' && g === 'qwerty';
      },
    },
    {
      text: { pt: 'site-users edita o projeto test, e só ele', en: 'site-users edits the test project, and only that one' },
      test: (w) => pode(w, 'harry', 'create', 'pods', '', 'test') && pode(w, 'susan', 'delete', 'pods', '', 'test') && !pode(w, 'harry', 'get', 'pods', '', 'demo'),
    },
    {
      text: { pt: 'guest-users só visualiza o projeto demo', en: 'guest-users only views the demo project' },
      test: (w) => pode(w, 'qwerty', 'get', 'pods', '', 'demo') && !pode(w, 'qwerty', 'create', 'pods', '', 'demo') && !pode(w, 'qwerty', 'get', 'pods', '', 'test'),
    },
    {
      text: { pt: 'Os RoleBindings apontam os grupos, e não os usuários', en: 'The RoleBindings point to the groups, not the users' },
      test: (w) => {
        const sub = (ns, papel) => w.list('RoleBinding', ns).filter((b) => b.roleRef.name === papel).flatMap((b) => b.subjects || []);
        return sub('test', 'edit').some((s) => s.kind === 'Group' && s.name === 'site-users') && sub('demo', 'view').some((s) => s.kind === 'Group' && s.name === 'guest-users');
      },
    },
  ],
  solution: [
    { cmd: 'oc adm groups new site-users harry susan', pt: 'Cria o grupo com os dois membros.', en: 'Creates the group with both members.' },
    { cmd: 'oc adm groups new guest-users', pt: 'Cria o segundo grupo vazio.', en: 'Creates the second, empty group.' },
    { cmd: 'oc adm groups add-users guest-users qwerty', pt: 'qwerty entra em guest-users.', en: 'qwerty joins guest-users.' },
    { cmd: 'oc adm policy add-role-to-group edit site-users -n test', pt: 'Edição em test.', en: 'Edit access in test.' },
    { cmd: 'oc adm policy add-role-to-group view guest-users -n demo', pt: 'Visualização em demo.', en: 'View access in demo.' },
    { cmd: 'oc get rolebinding -n test', pt: 'O binding `edit` para o grupo.', en: 'The `edit` binding for the group.' },
    { cmd: 'oc get rolebinding -n demo', pt: 'O binding `view` para o grupo.', en: 'The `view` binding for the group.' },
  ],
};

// Questão 4 ---------------------------------------------------------------------

const q04 = {
  id: 'g04-quota',
  minutes: 12,
  xp: 180,
  difficulty: 2,
  objectives: ['Configurar quotas de recursos por projeto'],
  title: { pt: 'Questão 4: Configuração de Cotas de Recursos (ResourceQuota)', en: 'Question 4: Resource quota configuration (ResourceQuota)' },
  story: {
    pt: 'Limite o consumo total de recursos computacionais e de objetos dentro de um projeto específico.',
    en: 'Limit the total consumption of compute resources and objects inside a specific project.',
  },
  tasks: {
    pt: [
      'Criar (ou acessar) o projeto chamado `rocky`.',
      'Criar uma `ResourceQuota` chamada `my-quota` no projeto `rocky` com os seguintes limites rígidos (*hard limits*): máximo de Pods `3`; máximo de CPU `2` cores; máximo de Memória `1Gi`; máximo de Services `6`; máximo de Secrets `6`; máximo de ReplicationControllers `6`.',
      'Validar a aplicação da cota verificando o status de uso e limite no namespace.',
    ],
    en: [
      'Create (or switch to) the project named `rocky`.',
      'Create a `ResourceQuota` named `my-quota` in the `rocky` project with the following hard limits: maximum Pods `3`; maximum CPU `2` cores; maximum Memory `1Gi`; maximum Services `6`; maximum Secrets `6`; maximum ReplicationControllers `6`.',
      'Validate the quota by checking the usage and limit status in the namespace.',
    ],
  },
  hints: [
    { pt: '`oc create quota my-quota --hard=pods=3,cpu=2,memory=1Gi,services=6,secrets=6,replicationcontrollers=6 -n rocky`.', en: '`oc create quota my-quota --hard=pods=3,cpu=2,memory=1Gi,services=6,secrets=6,replicationcontrollers=6 -n rocky`.' },
    { pt: '`oc describe quota my-quota -n rocky` mostra `Used` e `Hard` de cada recurso.', en: '`oc describe quota my-quota -n rocky` shows `Used` and `Hard` for each resource.' },
  ],
  setup() {},
  checks: [
    { text: { pt: 'O projeto rocky existe', en: 'The rocky project exists' }, test: (w) => Boolean(w.get('Namespace', 'rocky')) },
    {
      text: { pt: 'my-quota tem exatamente os seis limites pedidos', en: 'my-quota has exactly the six requested limits' },
      test: (w) => mesmos(w.get('ResourceQuota', 'my-quota', 'rocky')?.spec?.hard, { pods: '3', cpu: '2', memory: '1Gi', services: '6', secrets: '6', replicationcontrollers: '6' }),
    },
    {
      text: { pt: 'O status da cota mostra os limites e o uso', en: 'The quota status shows the limits and usage' },
      test: (w) => {
        const st = w.get('ResourceQuota', 'my-quota', 'rocky')?.status;
        return st?.hard?.pods === '3' && st?.used?.pods !== undefined;
      },
    },
  ],
  solution: [
    { cmd: 'oc new-project rocky', pt: 'Cria o projeto.', en: 'Creates the project.' },
    { cmd: 'oc create quota my-quota --hard=pods=3,cpu=2,memory=1Gi,services=6,secrets=6,replicationcontrollers=6', pt: 'Cria a cota.', en: 'Creates the quota.' },
    { cmd: 'oc describe quota my-quota', pt: 'Uso e limite de cada recurso.', en: 'Usage and limit for each resource.' },
    { cmd: 'oc get quota -n rocky', pt: 'Visão resumida da cota.', en: 'Short view of the quota.' },
  ],
};

// Questão 5 ---------------------------------------------------------------------

const lr = (w) => w.get('LimitRange', 'dev-limit', 'darpa')?.spec?.limits || [];
const q05 = {
  id: 'g05-limitrange',
  minutes: 15,
  xp: 200,
  difficulty: 2,
  objectives: ['Configurar limit ranges por projeto'],
  title: { pt: 'Questão 5: Configuração de Limites Padrão (LimitRange)', en: 'Question 5: Default limits configuration (LimitRange)' },
  story: {
    pt: 'Estabeleça restrições mínimas, máximas e valores padrão de requisição de recursos para Pods e Containers em um projeto.',
    en: 'Establish minimum and maximum restrictions and default resource request values for Pods and Containers in a project.',
  },
  tasks: {
    pt: [
      'Criar (ou acessar) o projeto chamado `darpa`.',
      'Criar um objeto `LimitRange` chamado `dev-limit` no projeto `darpa` com as seguintes especificações. Para Pods: memória mínima `5Mi` e máxima `300Mi`; CPU mínima `5m` e máxima `300m`. Para Containers: memória mínima `5Mi`, máxima `300Mi`, Default Request/Limit `100Mi`; CPU mínima `5m`, máxima `300m`, Default Request/Limit `100m`.',
      'Descrever o `LimitRange` criado para confirmar que as regras foram aplicadas corretamente.',
    ],
    en: [
      'Create (or switch to) the project named `darpa`.',
      'Create a `LimitRange` object named `dev-limit` in the `darpa` project with the following specifications. For Pods: minimum memory `5Mi` and maximum `300Mi`; minimum CPU `5m` and maximum `300m`. For Containers: minimum memory `5Mi`, maximum `300Mi`, Default Request/Limit `100Mi`; minimum CPU `5m`, maximum `300m`, Default Request/Limit `100m`.',
      'Describe the created `LimitRange` to confirm the rules were applied correctly.',
    ],
  },
  hints: [
    { pt: 'Não há `oc create limitrange`: escreva o YAML (`kind: LimitRange`, com `spec.limits` de `type: Pod` e `type: Container`) e use `oc create -f`.', en: 'There is no `oc create limitrange`: write the YAML (`kind: LimitRange`, with `spec.limits` of `type: Pod` and `type: Container`) and use `oc create -f`.' },
    { pt: 'No tipo `Container`, `default` é o limit padrão e `defaultRequest` é o request padrão.', en: 'In the `Container` type, `default` is the default limit and `defaultRequest` is the default request.' },
    { pt: '`oc explain limitrange.spec.limits` lista os campos.', en: '`oc explain limitrange.spec.limits` lists the fields.' },
  ],
  setup(w) {
    w.fs.mkdir('/home/student/darpa', true);
  },
  checks: [
    { text: { pt: 'O projeto darpa existe', en: 'The darpa project exists' }, test: (w) => Boolean(w.get('Namespace', 'darpa')) },
    {
      text: { pt: 'O LimitRange de Pod tem memória 5Mi a 300Mi e CPU 5m a 300m', en: 'The Pod LimitRange has memory 5Mi to 300Mi and CPU 5m to 300m' },
      test: (w) => {
        const p = lr(w).find((x) => x.type === 'Pod');
        return Boolean(p) && mesmos(p.min, { memory: '5Mi', cpu: '5m' }) && mesmos(p.max, { memory: '300Mi', cpu: '300m' });
      },
    },
    {
      text: { pt: 'O LimitRange de Container tem mínimos, máximos e padrões pedidos', en: 'The Container LimitRange has the requested minimums, maximums, and defaults' },
      test: (w) => {
        const c = lr(w).find((x) => x.type === 'Container');
        return Boolean(c) && mesmos(c.min, { memory: '5Mi', cpu: '5m' }) && mesmos(c.max, { memory: '300Mi', cpu: '300m' }) && mesmos(c.default, { memory: '100Mi', cpu: '100m' }) && mesmos(c.defaultRequest, { memory: '100Mi', cpu: '100m' });
      },
    },
  ],
  solution: [
    { cmd: 'oc new-project darpa', pt: 'Cria o projeto.', en: 'Creates the project.' },
    { cmd: `cat > ~/darpa/dev-limit.yaml <<EOF
apiVersion: v1
kind: LimitRange
metadata:
  name: dev-limit
spec:
  limits:
    - type: Pod
      min:
        memory: 5Mi
        cpu: 5m
      max:
        memory: 300Mi
        cpu: 300m
    - type: Container
      min:
        memory: 5Mi
        cpu: 5m
      max:
        memory: 300Mi
        cpu: 300m
      default:
        memory: 100Mi
        cpu: 100m
      defaultRequest:
        memory: 100Mi
        cpu: 100m
EOF`, pt: 'O manifesto do LimitRange.', en: 'The LimitRange manifest.' },
    { cmd: 'oc create -f ~/darpa/dev-limit.yaml', pt: 'Cria o objeto no projeto atual.', en: 'Creates the object in the current project.' },
    { cmd: 'oc describe limitrange dev-limit', pt: 'Confere Type, Resource, Min, Max e Default.', en: 'Checks Type, Resource, Min, Max, and Default.' },
  ],
};

// Questão 6 ---------------------------------------------------------------------

const q06 = {
  id: 'g06-escala-manual',
  minutes: 12,
  xp: 170,
  difficulty: 1,
  objectives: ['Gerenciar implantações de aplicações', 'Trabalhar com replica sets'],
  title: { pt: 'Questão 6: Escalonamento Manual de Aplicações', en: 'Question 6: Manual application scaling' },
  story: {
    pt: 'Ajuste manualmente a capacidade de atendimento de uma aplicação web implantada no cluster.',
    en: 'Manually adjust the serving capacity of a web application deployed in the cluster.',
  },
  tasks: {
    pt: [
      'Preparar o ambiente criando o projeto `world` e implantando uma aplicação de teste (ex: `httpd` com 1 réplica).',
      'Escalar manualmente o *Deployment* `httpd` para exatamente `5` réplicas.',
      'Garantir que todos os 5 pods estejam no estado `Running` e disponíveis (`5/5`).',
    ],
    en: [
      'Prepare the environment by creating the `world` project and deploying a test application (e.g. `httpd` with 1 replica).',
      'Manually scale the `httpd` *Deployment* to exactly `5` replicas.',
      'Make sure all 5 pods are `Running` and available (`5/5`).',
    ],
  },
  hints: [
    { pt: `Na 4.22 o \`oc new-app\` usa \`--image\` (a antiga \`--docker-image\` não existe mais): \`oc new-app --name httpd --image ${HTTPD}\`.`, en: `In 4.22 \`oc new-app\` uses \`--image\` (the old \`--docker-image\` no longer exists): \`oc new-app --name httpd --image ${HTTPD}\`.` },
    { pt: '`oc scale deployment httpd --replicas 5` e depois `oc get deployment httpd` até ver `5/5`.', en: '`oc scale deployment httpd --replicas 5` and then `oc get deployment httpd` until you see `5/5`.' },
  ],
  setup() {},
  checks: [
    { text: { pt: 'O Deployment httpd existe no projeto world', en: 'The httpd Deployment exists in the world project' }, test: (w) => /httpd/.test(w.get('Deployment', 'httpd', 'world')?.spec.template.spec.containers[0].image || '') },
    { text: { pt: 'httpd tem exatamente 5 réplicas', en: 'httpd has exactly 5 replicas' }, test: (w) => w.get('Deployment', 'httpd', 'world')?.spec.replicas === 5 },
    { text: { pt: 'Os 5 pods estão Running e disponíveis (5/5)', en: 'All 5 pods are Running and available (5/5)' }, test: (w) => w.ready('httpd', 'world') && w.pods('world').length === 5 },
  ],
  solution: [
    { cmd: 'oc new-project world', pt: 'Cria o projeto.', en: 'Creates the project.' },
    { cmd: `oc new-app --name httpd --image ${HTTPD}`, pt: 'Implanta o httpd com 1 réplica.', en: 'Deploys httpd with 1 replica.' },
    { cmd: 'oc scale deployment httpd --replicas 5', pt: 'Escala para 5.', en: 'Scales to 5.' },
    { cmd: 'sleep 20', pt: 'Espera os pods subirem.', en: 'Waits for the pods to come up.' },
    { cmd: 'oc get deployment httpd', pt: '`5/5`.', en: '`5/5`.' },
    { cmd: 'oc get pods', pt: 'Cinco pods `Running`.', en: 'Five `Running` pods.' },
  ],
};

// Questão 7 ---------------------------------------------------------------------

const q07 = {
  id: 'g07-hpa',
  minutes: 15,
  xp: 210,
  difficulty: 2,
  objectives: ['Gerenciar implantações de aplicações', 'Configurar os requisitos de recursos do projeto'],
  title: { pt: 'Questão 7: Escalonamento Automático de Pods (HPA)', en: 'Question 7: Pod autoscaling (HPA)' },
  story: {
    pt: 'Configure o Horizontal Pod Autoscaler (HPA) para ajustar automaticamente o número de réplicas de uma aplicação com base no consumo de CPU.',
    en: 'Configure the Horizontal Pod Autoscaler (HPA) to automatically adjust an application replica count based on CPU consumption.',
  },
  tasks: {
    pt: [
      'Criar o projeto `scaling` e implantar uma aplicação base (ex: `httpd`).',
      'Configurar as requisições de recursos (*requests*) no *Deployment* `httpd` para: CPU `50m`; Memória `100Mi`.',
      'Configurar o autoescalonamento (`oc autoscale`) para o *Deployment* `httpd` com os seguintes parâmetros: mínimo de réplicas `2`; máximo de réplicas `9`; porcentagem alvo de CPU `60%`.',
      'Verificar a criação e o status do objeto `HorizontalPodAutoscaler` (`oc get hpa`).',
    ],
    en: [
      'Create the `scaling` project and deploy a base application (e.g. `httpd`).',
      'Set the resource requests (*requests*) in the `httpd` *Deployment* to: CPU `50m`; Memory `100Mi`.',
      'Configure autoscaling (`oc autoscale`) for the `httpd` *Deployment* with the following parameters: minimum replicas `2`; maximum replicas `9`; target CPU percentage `60%`.',
      'Check the creation and status of the `HorizontalPodAutoscaler` object (`oc get hpa`).',
    ],
  },
  hints: [
    { pt: '`oc set resources deployment httpd --requests cpu=50m,memory=100Mi`. Sem o request de CPU o HPA não calcula a porcentagem.', en: '`oc set resources deployment httpd --requests cpu=50m,memory=100Mi`. Without a CPU request the HPA cannot compute the percentage.' },
    { pt: 'Na 4.22 a flag é `--cpu` (a antiga `--cpu-percent` não existe): `oc autoscale deployment httpd --min 2 --max 9 --cpu 60%`.', en: 'In 4.22 the flag is `--cpu` (the old `--cpu-percent` does not exist): `oc autoscale deployment httpd --min 2 --max 9 --cpu 60%`.' },
  ],
  setup() {},
  checks: [
    {
      text: { pt: 'O Deployment httpd pede 50m de CPU e 100Mi de memória', en: 'The httpd Deployment requests 50m CPU and 100Mi memory' },
      test: (w) => {
        const r = w.get('Deployment', 'httpd', 'scaling')?.spec.template.spec.containers[0].resources?.requests;
        return Boolean(r) && cpu(r.cpu) === cpu('50m') && mem(r.memory) === mem('100Mi');
      },
    },
    {
      text: { pt: 'O HPA aponta o Deployment httpd com mínimo 2 e máximo 9', en: 'The HPA targets the httpd Deployment with minimum 2 and maximum 9' },
      test: (w) => {
        const h = w.list('HorizontalPodAutoscaler', 'scaling').find((x) => x.spec.scaleTargetRef.name === 'httpd');
        return h?.spec.minReplicas === 2 && h.spec.maxReplicas === 9 && h.spec.scaleTargetRef.kind === 'Deployment';
      },
    },
    {
      text: { pt: 'O alvo é 60% de CPU', en: 'The target is 60% CPU' },
      test: (w) => w.list('HorizontalPodAutoscaler', 'scaling').some((h) => h.spec.metrics?.some((m) => m.resource?.name === 'cpu' && m.resource.target?.averageUtilization === 60)),
    },
    {
      text: { pt: 'O HPA já levou o httpd a pelo menos 2 réplicas prontas', en: 'The HPA already took httpd to at least 2 ready replicas' },
      test: (w) => w.pods('scaling').filter(w.podPronto).length >= 2,
    },
  ],
  solution: [
    { cmd: 'oc new-project scaling', pt: 'Cria o projeto.', en: 'Creates the project.' },
    { cmd: `oc new-app --name httpd --image ${HTTPD}`, pt: 'Aplicação base.', en: 'Base application.' },
    { cmd: 'oc set resources deployment httpd --requests cpu=50m,memory=100Mi', pt: 'Requests de CPU e memória.', en: 'CPU and memory requests.' },
    { cmd: 'oc autoscale deployment httpd --min 2 --max 9 --cpu 60%', pt: 'Cria o HPA.', en: 'Creates the HPA.' },
    { cmd: 'sleep 30', pt: 'Dá tempo ao HPA para agir.', en: 'Gives the HPA time to act.' },
    { cmd: 'oc get hpa', pt: 'MINPODS 2, MAXPODS 9, alvo 60%.', en: 'MINPODS 2, MAXPODS 9, target 60%.' },
  ],
};

// Questão 8 ---------------------------------------------------------------------

const VARIANTES_Q8 = [['monday', 'MYSQL_ROOT_PASSWORD', 'redhat'], ['magic', 'dirlong', 'asdf234234=']];
const segredoQ8 = (w) => VARIANTES_Q8.map(([ns, chave, v]) => [ns, chave, v, w.get('Secret', ns === 'monday' ? 'monday' : 'magic', ns === 'monday' ? 'monday' : 'math')]).find(([, chave, v, s]) => s && b64.dec(s.data?.[chave] || '') === v && s.type === 'Opaque');

const q08 = {
  id: 'g08-secret',
  minutes: 10,
  xp: 160,
  difficulty: 1,
  objectives: ['Criar e usar secrets', 'Criar e aplicar secrets para informações sensíveis'],
  title: { pt: 'Questão 8: Criação de Secrets para Aplicações', en: 'Question 8: Creating Secrets for applications' },
  story: {
    pt: 'Armazene informações sensíveis de configuração de banco de dados de forma segura no cluster.',
    en: 'Store sensitive database configuration information securely in the cluster.',
  },
  tasks: {
    pt: [
      'Criar (ou acessar) o projeto `monday` (ou `math`, conforme variação do cenário).',
      'Criar um *Secret* genérico chamado `monday` (ou `magic`) dentro do projeto com o seguinte par chave-valor: chave `MYSQL_ROOT_PASSWORD` (ou `dirlong`); valor `redhat` (ou `asdf234234=`).',
      'Confirmar que o *Secret* do tipo `Opaque` foi criado corretamente no namespace.',
    ],
    en: [
      'Create (or switch to) the `monday` project (or `math`, depending on the scenario variation).',
      'Create a generic *Secret* named `monday` (or `magic`) inside the project with the following key-value pair: key `MYSQL_ROOT_PASSWORD` (or `dirlong`); value `redhat` (or `asdf234234=`).',
      'Confirm that the `Opaque` *Secret* was created correctly in the namespace.',
    ],
  },
  hints: [
    { pt: '`oc create secret generic monday --from-literal MYSQL_ROOT_PASSWORD=redhat`, dentro do projeto `monday`.', en: '`oc create secret generic monday --from-literal MYSQL_ROOT_PASSWORD=redhat`, inside the `monday` project.' },
    { pt: '`oc get secret monday` mostra o tipo `Opaque`; `oc get secret monday -o jsonpath=\'{.data}\'` mostra o valor em base64.', en: '`oc get secret monday` shows the `Opaque` type; `oc get secret monday -o jsonpath=\'{.data}\'` shows the base64 value.' },
  ],
  setup() {},
  checks: [
    {
      text: { pt: 'O projeto do cenário existe (monday ou math)', en: 'The scenario project exists (monday or math)' },
      test: (w) => Boolean(w.get('Namespace', 'monday') || w.get('Namespace', 'math')),
    },
    {
      text: { pt: 'O secret Opaque tem a chave e o valor do cenário', en: 'The Opaque secret has the scenario key and value' },
      test: (w) => Boolean(segredoQ8(w)),
    },
  ],
  solution: [
    { cmd: 'oc new-project monday || oc project monday', pt: 'Cria o projeto (ou entra nele, se o ambiente já o criou).', en: 'Creates the project (or switches to it, if the environment already created it).' },
    { cmd: 'oc create secret generic monday --from-literal MYSQL_ROOT_PASSWORD=redhat', pt: 'Cria o secret.', en: 'Creates the secret.' },
    { cmd: 'oc get secret monday', pt: 'Tipo `Opaque`, 1 chave.', en: 'Type `Opaque`, 1 key.' },
  ],
};

// Questão 9 ---------------------------------------------------------------------

const IMG_MYSQL = 'registry.access.redhat.com/rhscl/mysql-57-rhel7:5.7-47';
const q09 = {
  id: 'g09-secret-env',
  minutes: 15,
  xp: 220,
  difficulty: 2,
  objectives: ['Criar e aplicar secrets para informações sensíveis', 'Solucionar problemas comuns de contêineres e pods'],
  title: { pt: 'Questão 9: Injeção de Secrets em Aplicações (Troubleshooting)', en: 'Question 9: Injecting Secrets into applications (troubleshooting)' },
  story: {
    pt: 'Corrija uma aplicação de banco de dados que está falhando ao iniciar devido à ausência de variáveis de ambiente obrigatórias.',
    en: 'Fix a database application that fails to start because of missing mandatory environment variables.',
  },
  tasks: {
    pt: [
      `**Preparação do laboratório:** Implantar uma aplicação MySQL no projeto \`monday\` sem passar a senha (ex: \`oc new-app --name monday --docker-image registry.access.redhat.com/rhscl/mysql-57-rhel7:5.7-47\`), gerando um estado de erro (\`CrashLoopBackOff\`). *(Já feito pelo ambiente. Na 4.22 a opção é \`--image\`, e o \`--docker-image\` não existe mais.)*`,
      'Diagnosticar o problema analisando os logs e eventos do pod/deployment.',
      'Injetar todas as chaves do *Secret* criado na Questão 8 como variáveis de ambiente no *Deployment* `monday` (`oc set env --from=secret/...`).',
      'Verificar se o novo pod sobe corretamente e atinge o estado `Running` (`1/1`).',
    ],
    en: [
      `**Lab preparation:** Deploy a MySQL application in the \`monday\` project without passing the password (e.g. \`oc new-app --name monday --docker-image registry.access.redhat.com/rhscl/mysql-57-rhel7:5.7-47\`), producing an error state (\`CrashLoopBackOff\`). *(Already done by the environment. In 4.22 the option is \`--image\`, and \`--docker-image\` no longer exists.)*`,
      'Diagnose the problem by analyzing the pod/deployment logs and events.',
      'Inject all keys of the *Secret* created in Question 8 as environment variables in the `monday` *Deployment* (`oc set env --from=secret/...`).',
      'Check that the new pod starts correctly and reaches the `Running` state (`1/1`).',
    ],
  },
  hints: [
    { pt: '`oc logs deployment/monday` mostra qual variável o MySQL exige; `oc get events` e `oc describe pod` mostram o `CrashLoopBackOff`.', en: '`oc logs deployment/monday` shows which variable MySQL requires; `oc get events` and `oc describe pod` show the `CrashLoopBackOff`.' },
    { pt: '`oc set env deployment/monday --from=secret/monday` injeta todas as chaves do secret. O secret `monday` vem da Questão 8.', en: '`oc set env deployment/monday --from=secret/monday` injects every key in the secret. The `monday` secret comes from Question 8.' },
  ],
  async setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: 'monday' } });
    await w.sh(`oc new-app --name monday --image ${IMG_MYSQL} -n monday`);
    if (sozinha(w)) await w.sh('oc create secret generic monday --from-literal MYSQL_ROOT_PASSWORD=redhat -n monday');
  },
  checks: [
    {
      text: { pt: 'O Deployment monday recebe as chaves do secret monday como variáveis', en: 'The monday Deployment receives the monday secret keys as variables' },
      test: (w) => {
        const ct = w.get('Deployment', 'monday', 'monday').spec.template.spec.containers[0];
        return (ct.envFrom || []).some((e) => e.secretRef?.name === 'monday') || (ct.env || []).some((e) => e.valueFrom?.secretKeyRef?.name === 'monday' && e.name === 'MYSQL_ROOT_PASSWORD');
      },
    },
    {
      text: { pt: 'O pod do MySQL está Running (1/1)', en: 'The MySQL pod is Running (1/1)' },
      test: (w) => w.ready('monday', 'monday') && w.pods('monday', { deployment: 'monday' }).every((p) => w.podPronto(p) && !(p.status.containerStatuses || []).some((s) => s.state?.waiting)),
    },
  ],
  solution: [
    { cmd: 'oc project monday', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get pods', pt: '`CrashLoopBackOff`.', en: '`CrashLoopBackOff`.' },
    { cmd: 'oc logs deployment/monday', pt: 'O MySQL pede `MYSQL_ROOT_PASSWORD`.', en: 'MySQL asks for `MYSQL_ROOT_PASSWORD`.' },
    { cmd: 'oc get secret monday', pt: 'O secret da Questão 8.', en: 'The secret from Question 8.' },
    { cmd: 'oc set env deployment/monday --from=secret/monday', pt: 'Injeta todas as chaves do secret.', en: 'Injects every key of the secret.' },
    { cmd: 'sleep 30', pt: 'Espera o novo pod.', en: 'Waits for the new pod.' },
    { cmd: 'oc get pods', pt: '`1/1 Running`.', en: '`1/1 Running`.' },
  ],
};

// Questão 10 --------------------------------------------------------------------

const HOSTS_Q10 = ['quart.apps.ocp4.example.com', 'quart.apps.domain3.example.com'];
const arqs = (w, nome) => w.fs.walk('/home/student').filter((f) => f.endsWith(`/${nome}`) && w.fs.isFile(f)).map((f) => w.fs.read(f));
const q10 = {
  id: 'g10-rota-edge',
  minutes: 25,
  xp: 250,
  difficulty: 2,
  objectives: ['Proteger tráfego externo e interno com certificados TLS', 'Criar e editar routes externas'],
  title: { pt: 'Questão 10: Criação de Rota Segura (HTTPS / Edge Termination)', en: 'Question 10: Secure route (HTTPS / edge termination)' },
  story: {
    pt: 'Exponha uma aplicação web interna utilizando protocolo seguro HTTPS com um certificado digital autoassinado customizado.',
    en: 'Expose an internal web application using the secure HTTPS protocol with a custom self-signed digital certificate.',
  },
  tasks: {
    pt: [
      'Criar o projeto `quart` e implantar uma aplicação HTTP simples (ex: `httpd`).',
      'Gerar uma chave privada RSA de 2048 bits (`req.key`) e um certificado autoassinado X.509 (`req.crt`) válido por 365 dias utilizando `openssl`, contendo exatamente o seguinte *Subject*: `/C=US/ST=North Carolina/L=Raleigh/O=RedHat/CN=quart.apps.ocp4.example.com`.',
      'Criar uma rota segura do tipo `edge` chamada `htquart` apontando para o serviço da aplicação com: hostname `quart.apps.ocp4.example.com` (ou `quart.apps.domain3.example.com`); certificado `req.crt`; chave `req.key`.',
      'Validar o acesso HTTPS à rota e confirmar que a aplicação responde com sucesso.',
    ],
    en: [
      'Create the `quart` project and deploy a simple HTTP application (e.g. `httpd`).',
      'Generate a 2048-bit RSA private key (`req.key`) and a self-signed X.509 certificate (`req.crt`) valid for 365 days using `openssl`, with exactly the following *Subject*: `/C=US/ST=North Carolina/L=Raleigh/O=RedHat/CN=quart.apps.ocp4.example.com`.',
      'Create a secure `edge` route named `htquart` pointing to the application service with: hostname `quart.apps.ocp4.example.com` (or `quart.apps.domain3.example.com`); certificate `req.crt`; key `req.key`.',
      'Validate HTTPS access to the route and confirm that the application responds successfully.',
    ],
  },
  hints: [
    { pt: '`openssl req -x509 -newkey rsa:2048 -nodes -keyout req.key -out req.crt -days 365 -subj "..."` faz chave e certificado de uma vez só.', en: '`openssl req -x509 -newkey rsa:2048 -nodes -keyout req.key -out req.crt -days 365 -subj "..."` makes the key and the certificate in one go.' },
    { pt: '`oc create route edge htquart --service httpd --hostname ... --cert req.crt --key req.key`. O certificado é autoassinado, então o `curl` precisa de `-k` ou `--cacert req.crt`.', en: '`oc create route edge htquart --service httpd --hostname ... --cert req.crt --key req.key`. The certificate is self-signed, so `curl` needs `-k` or `--cacert req.crt`.' },
  ],
  setup() {},
  checks: [
    {
      text: { pt: 'req.key e req.crt: RSA 2048, autoassinado, 365 dias, com o Subject exato', en: 'req.key and req.crt: RSA 2048, self-signed, 365 days, with the exact Subject' },
      test: (w) => {
        const crt = arqs(w, 'req.crt').map(umCert).find(Boolean);
        const chave = arqs(w, 'req.key').map(umaChave).find(Boolean);
        const s = crt?.subject || {};
        return Boolean(crt && chave) && chave.bits === 2048 && chave.id === crt.pub && s.C === 'US' && s.ST === 'North Carolina' && s.L === 'Raleigh' && s.O === 'RedHat' && s.CN === HOSTS_Q10[0] && Math.round((crt.notAfter - crt.notBefore) / 86400) === 365 && JSON.stringify(crt.issuer) === JSON.stringify(crt.subject);
      },
    },
    {
      text: { pt: 'A route htquart é edge, no host pedido e usa req.crt', en: 'The htquart route is edge, on the requested host, and uses req.crt' },
      test: (w) => {
        const r = w.get('Route', 'htquart', 'quart');
        const crt = arqs(w, 'req.crt').map(umCert).find(Boolean);
        return Boolean(r) && HOSTS_Q10.includes(r.spec.host) && r.spec.tls?.termination === 'edge' && umCert(r.spec.tls.certificate)?.serial === crt?.serial && r.spec.tls.key === undefined ? true : Boolean(r) && HOSTS_Q10.includes(r.spec.host) && r.spec.tls?.termination === 'edge' && Boolean(crt) && umCert(r.spec.tls.certificate)?.serial === crt.serial;
      },
    },
    {
      text: { pt: 'O HTTPS responde 200 com o certificado do guia', en: 'HTTPS answers 200 with the guide certificate' },
      test: (w) => {
        const r = w.get('Route', 'htquart', 'quart');
        const resp = r ? w.http(`https://${r.spec.host}`) : null;
        return resp?.status === 200 && umCert(resp.cert)?.subject?.CN === HOSTS_Q10[0];
      },
    },
  ],
  solution: [
    { cmd: 'oc new-project quart', pt: 'Cria o projeto.', en: 'Creates the project.' },
    { cmd: `oc new-app --name httpd --image ${HTTPD}`, pt: 'Aplicação HTTP (já cria o service).', en: 'HTTP application (also creates the service).' },
    { cmd: 'openssl req -x509 -newkey rsa:2048 -nodes -keyout req.key -out req.crt -days 365 -subj "/C=US/ST=North Carolina/L=Raleigh/O=RedHat/CN=quart.apps.ocp4.example.com"', pt: 'Chave de 2048 bits e certificado autoassinado.', en: '2048-bit key and self-signed certificate.' },
    { cmd: 'openssl x509 -in req.crt -noout -subject -dates', pt: 'Confere o Subject e a validade.', en: 'Checks the Subject and validity.' },
    { cmd: 'oc create route edge htquart --service httpd --hostname quart.apps.ocp4.example.com --cert req.crt --key req.key', pt: 'Route edge com o certificado.', en: 'Edge route with the certificate.' },
    { cmd: 'curl -k https://quart.apps.ocp4.example.com', pt: 'Responde pelo HTTPS (`-k` porque é autoassinado).', en: 'Answers over HTTPS (`-k` because it is self-signed).' },
  ],
};

// Questão 11 e 12 ---------------------------------------------------------------

const usar = (w, ns, conta, scc) => w.pode(`system:serviceaccount:${ns}:${conta}`, 'use', 'securitycontextconstraints', 'security.openshift.io', ns, scc);

const q11 = {
  id: 'g11-sa-anyuid',
  minutes: 10,
  xp: 190,
  difficulty: 2,
  objectives: ['Criar e usar service accounts', 'Gerenciar e aplicar permissões com security context constraints'],
  title: { pt: 'Questão 11: Service Accounts e Security Context Constraints (SCC)', en: 'Question 11: Service accounts and Security Context Constraints (SCC)' },
  story: {
    pt: 'Crie uma identidade de serviço específica e conceda privilégios para execução de containers que exigem UIDs customizados ou root.',
    en: 'Create a specific service identity and grant privileges to run containers that require custom UIDs or root.',
  },
  tasks: {
    pt: [
      'Criar (ou acessar) o projeto `qed`.',
      'Criar uma *ServiceAccount* chamada `project1-sa` no projeto `qed`.',
      'Associar a *Security Context Constraint* (SCC) `anyuid` à *ServiceAccount* `project1-sa`.',
    ],
    en: [
      'Create (or switch to) the `qed` project.',
      'Create a *ServiceAccount* named `project1-sa` in the `qed` project.',
      'Bind the `anyuid` *Security Context Constraint* (SCC) to the `project1-sa` *ServiceAccount*.',
    ],
  },
  hints: [
    { pt: '`oc create sa project1-sa -n qed` cria a conta de serviço.', en: '`oc create sa project1-sa -n qed` creates the service account.' },
    { pt: '`oc adm policy add-scc-to-user anyuid -z project1-sa -n qed` (o `-z` indica uma service account do projeto).', en: '`oc adm policy add-scc-to-user anyuid -z project1-sa -n qed` (`-z` means a service account of the project).' },
  ],
  setup() {},
  checks: [
    { text: { pt: 'A service account project1-sa existe em qed', en: 'The project1-sa service account exists in qed' }, test: (w) => Boolean(w.get('ServiceAccount', 'project1-sa', 'qed')) },
    { text: { pt: 'project1-sa pode usar a SCC anyuid', en: 'project1-sa can use the anyuid SCC' }, test: (w) => usar(w, 'qed', 'project1-sa', 'anyuid') },
    { text: { pt: 'A conta default não ganhou a anyuid', en: 'The default account did not get anyuid' }, test: (w) => !usar(w, 'qed', 'default', 'anyuid') },
  ],
  solution: [
    { cmd: 'oc new-project qed || oc project qed', pt: 'Cria o projeto (ou entra nele, se já existir).', en: 'Creates the project (or switches to it, if it already exists).' },
    { cmd: 'oc create serviceaccount project1-sa', pt: 'Cria a service account.', en: 'Creates the service account.' },
    { cmd: 'oc adm policy add-scc-to-user anyuid -z project1-sa', pt: 'Concede a SCC anyuid só a ela.', en: 'Grants the anyuid SCC only to it.' },
    { cmd: 'oc get sa project1-sa', pt: 'Confere a conta.', en: 'Checks the account.' },
  ],
};

const IMG_GITLAB = 'gitlab/gitlab-ce:8.4.3-ce.0';
const q12 = {
  id: 'g12-gitlab-scc',
  minutes: 15,
  xp: 230,
  difficulty: 2,
  objectives: ['Executar aplicações privilegiadas', 'Gerenciar e aplicar permissões com security context constraints', 'Solucionar problemas comuns de contêineres e pods'],
  title: { pt: 'Questão 12: Implantação de Aplicação com Permissões Elevadas (SCC)', en: 'Question 12: Deploying an application with elevated permissions (SCC)' },
  story: {
    pt: 'Solucione problemas de permissão de execução de um container legado/específico associando-o à *ServiceAccount* configurada anteriormente.',
    en: 'Solve execution permission problems of a legacy/specific container by binding it to the *ServiceAccount* configured earlier.',
  },
  tasks: {
    pt: [
      '**Preparação do laboratório:** No projeto `qed`, implantar a aplicação GitLab (ex: `oc new-app --name gitlab --docker-image gitlab/gitlab-ce:8.4.3-ce.0` e expor a porta 80). Observar a falha de inicialização (`CrashLoopBackOff`) por falta de permissão de usuário no container. *(Já feito pelo ambiente. Na 4.22 a opção é `--image`.)*',
      'Diagnosticar a falha verificando logs e eventos do pod.',
      'Configurar o *Deployment* `gitlab` para utilizar a *ServiceAccount* `project1-sa` (`oc set serviceaccount`).',
      'Validar que o pod reinicia com sucesso e entra no estado `Running` (`1/1`).',
    ],
    en: [
      '**Lab preparation:** In the `qed` project, deploy the GitLab application (e.g. `oc new-app --name gitlab --docker-image gitlab/gitlab-ce:8.4.3-ce.0` and expose port 80). Observe the startup failure (`CrashLoopBackOff`) caused by a missing user permission in the container. *(Already done by the environment. In 4.22 the option is `--image`.)*',
      'Diagnose the failure by checking the pod logs and events.',
      'Configure the `gitlab` *Deployment* to use the `project1-sa` *ServiceAccount* (`oc set serviceaccount`).',
      'Validate that the pod restarts successfully and reaches the `Running` state (`1/1`).',
    ],
  },
  hints: [
    { pt: '`oc logs deployment/gitlab` mostra o erro de permissão: a imagem exige UID 0, e a SCC `restricted-v2` não deixa.', en: '`oc logs deployment/gitlab` shows the permission error: the image requires UID 0, and the `restricted-v2` SCC does not allow it.' },
    { pt: '`oc set serviceaccount deployment gitlab project1-sa`. A conta com a `anyuid` vem da Questão 11.', en: '`oc set serviceaccount deployment gitlab project1-sa`. The account with `anyuid` comes from Question 11.' },
  ],
  async setup(w) {
    if (!w.get('Namespace', 'qed')) w.cluster.create({ kind: 'Namespace', metadata: { name: 'qed' } });
    await w.sh(`oc new-app --name gitlab --image ${IMG_GITLAB} -n qed`);
    if (sozinha(w)) {
      await w.sh('oc create serviceaccount project1-sa -n qed');
      await w.sh('oc adm policy add-scc-to-user anyuid -z project1-sa -n qed');
    }
  },
  checks: [
    {
      text: { pt: 'O Deployment gitlab usa a service account project1-sa', en: 'The gitlab Deployment uses the project1-sa service account' },
      test: (w) => w.get('Deployment', 'gitlab', 'qed').spec.template.spec.serviceAccountName === 'project1-sa',
    },
    {
      text: { pt: 'project1-sa tem a SCC anyuid', en: 'project1-sa has the anyuid SCC' },
      test: (w) => usar(w, 'qed', 'project1-sa', 'anyuid'),
    },
    {
      text: { pt: 'O pod do gitlab está Running (1/1)', en: 'The gitlab pod is Running (1/1)' },
      test: (w) => w.ready('gitlab', 'qed') && w.pods('qed', { deployment: 'gitlab' }).every((p) => p.spec.serviceAccountName === 'project1-sa' && p.metadata.annotations?.['openshift.io/scc'] === 'anyuid'),
    },
  ],
  solution: [
    { cmd: 'oc project qed', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get pods', pt: '`CrashLoopBackOff` ou `Error`.', en: '`CrashLoopBackOff` or `Error`.' },
    { cmd: 'oc logs deployment/gitlab', pt: 'A imagem exige root.', en: 'The image requires root.' },
    { cmd: 'oc get events --sort-by=.lastTimestamp', pt: 'Os eventos do pod.', en: 'The pod events.' },
    { cmd: 'oc get sa project1-sa || oc create sa project1-sa', pt: 'A conta da Questão 11.', en: 'The account from Question 11.' },
    { cmd: 'oc adm policy add-scc-to-user anyuid -z project1-sa', pt: 'Garante a SCC anyuid na conta.', en: 'Makes sure the account has the anyuid SCC.' },
    { cmd: 'oc set serviceaccount deployment gitlab project1-sa', pt: 'O deployment passa a usar a conta.', en: 'The deployment now uses the account.' },
    { cmd: 'sleep 30', pt: 'Espera o rollout.', en: 'Waits for the rollout.' },
    { cmd: 'oc get pods', pt: '`1/1 Running`.', en: '`1/1 Running`.' },
  ],
};

// Questão 13 --------------------------------------------------------------------

const q13 = {
  id: 'g13-helm',
  minutes: 20,
  xp: 230,
  difficulty: 2,
  objectives: ['Implantar aplicações a partir de Helm charts'],
  title: { pt: 'Questão 13: Implantação de Aplicações via Helm Charts', en: 'Question 13: Deploying applications with Helm charts' },
  story: {
    pt: 'Utilize o gerenciador de pacotes Helm para adicionar um repositório externo e implantar uma aplicação no OpenShift.',
    en: 'Use the Helm package manager to add an external repository and deploy an application on OpenShift.',
  },
  tasks: {
    pt: [
      'Criar (ou acessar) um projeto para a aplicação (ex: `helm-pro`).',
      'Adicionar o repositório Helm `http://helm.ocp4.example.com/charts` com o nome `do280-repo`.',
      'Pesquisar as versões disponíveis do chart `etherpad` no repositório adicionado.',
      'Instalar o chart `do280-repo/etherpad` com o nome de release `example-app`.',
      'Verificar todos os recursos criados (`oc get all`), garantindo que o pod, serviço e rota estejam ativos.',
    ],
    en: [
      'Create (or switch to) a project for the application (e.g. `helm-pro`).',
      'Add the Helm repository `http://helm.ocp4.example.com/charts` with the name `do280-repo`.',
      'Search the available versions of the `etherpad` chart in the added repository.',
      'Install the `do280-repo/etherpad` chart with the release name `example-app`.',
      'Check all created resources (`oc get all`), making sure the pod, service, and route are active.',
    ],
  },
  hints: [
    { pt: '`helm repo add do280-repo URL`, depois `helm repo update` e `helm search repo etherpad -l` (o `-l` lista todas as versões).', en: '`helm repo add do280-repo URL`, then `helm repo update` and `helm search repo etherpad -l` (`-l` lists every version).' },
    { pt: '`helm install example-app do280-repo/etherpad` instala no projeto atual; `helm list` confere a release.', en: '`helm install example-app do280-repo/etherpad` installs in the current project; `helm list` checks the release.' },
  ],
  setup() {},
  checks: [
    {
      text: { pt: 'O repositório do280-repo aponta para http://helm.ocp4.example.com/charts', en: 'The do280-repo repository points to http://helm.ocp4.example.com/charts' },
      test: (w) => (w.file('.config/helm/repositories.yaml') || '').includes('name: do280-repo\n    url: http://helm.ocp4.example.com/charts'),
    },
    {
      text: { pt: 'A release example-app do chart etherpad está instalada', en: 'The example-app release of the etherpad chart is installed' },
      test: (w) => releases(w.cluster).some((r) => r.name === 'example-app' && r.chart?.metadata?.name === 'etherpad' && r.info?.status === 'deployed'),
    },
    {
      text: { pt: 'Pod, service e route da release estão ativos', en: 'The release pod, service, and route are active' },
      test: (w) => {
        const r = releases(w.cluster).find((x) => x.name === 'example-app');
        if (!r) return false;
        const ns = r.namespace;
        const da = (kind) => w.list(kind, ns).filter((o) => o.metadata.labels?.['app.kubernetes.io/instance'] === 'example-app');
        return da('Pod').length > 0 && da('Pod').every(w.podPronto) && da('Service').length > 0 && da('Route').length > 0;
      },
    },
  ],
  solution: [
    { cmd: 'oc new-project helm-pro', pt: 'Projeto da aplicação.', en: 'Application project.' },
    { cmd: 'helm repo add do280-repo http://helm.ocp4.example.com/charts', pt: 'Registra o repositório.', en: 'Registers the repository.' },
    { cmd: 'helm repo update', pt: 'Atualiza o índice.', en: 'Updates the index.' },
    { cmd: 'helm search repo etherpad -l', pt: 'Lista as versões do chart.', en: 'Lists the chart versions.' },
    { cmd: 'helm install example-app do280-repo/etherpad', pt: 'Instala a release.', en: 'Installs the release.' },
    { cmd: 'sleep 30', pt: 'Espera o pod subir.', en: 'Waits for the pod.' },
    { cmd: 'oc get all', pt: 'Pod, service, deployment e replica set.', en: 'Pod, service, deployment, and replica set.' },
    { cmd: 'oc get route', pt: 'A route da release.', en: 'The release route.' },
  ],
};

// Questão 14 --------------------------------------------------------------------

const cj = (w) => w.get('CronJob', 'test-cron', 'cron-test') || w.get('CronJob', 'cron-test', 'cron-test');
const q14 = {
  id: 'g14-cronjob',
  minutes: 20,
  xp: 220,
  difficulty: 2,
  objectives: ['Configurar cron jobs', 'Criar e usar service accounts'],
  title: { pt: 'Questão 14: Criação e Agendamento de CronJobs', en: 'Question 14: Creating and scheduling CronJobs' },
  story: {
    pt: 'Configure uma tarefa agendada recorrente no cluster utilizando uma *ServiceAccount* dedicada.',
    en: 'Configure a recurring scheduled task in the cluster using a dedicated *ServiceAccount*.',
  },
  tasks: {
    pt: [
      'Criar o projeto `cron-test`.',
      'Criar uma *ServiceAccount* (ex: `project1-sa` ou `jupiter`) e associá-la às permissões necessárias (`anyuid` e/ou `cluster-admin`, conforme cenário).',
      'Criar um `CronJob` chamado `test-cron` (ou `cron-test`) com as seguintes configurações: agendamento (*Schedule*) `05 04 2 * *` (às 04:05, no 2º dia de cada mês); histórico de jobs bem-sucedidos (`successfulJobsHistoryLimit`) `14`; imagem do container: imagem especificada no ambiente (ex: `registry.io/imagename` ou imagem base de shell executando `date; echo Hello from the Kubernetes cluster`); *ServiceAccount*: associar a conta de serviço criada ao CronJob.',
      'Validar o objeto criado (`oc get cronjob`) e conferir o agendamento e histórico configurado.',
    ],
    en: [
      'Create the `cron-test` project.',
      'Create a *ServiceAccount* (e.g. `project1-sa` or `jupiter`) and bind it to the required permissions (`anyuid` and/or `cluster-admin`, depending on the scenario).',
      'Create a `CronJob` named `test-cron` (or `cron-test`) with the following settings: schedule (*Schedule*) `05 04 2 * *` (at 04:05 on the 2nd day of every month); successful jobs history (`successfulJobsHistoryLimit`) `14`; container image: the image specified in the environment (e.g. `registry.io/imagename` or a base shell image running `date; echo Hello from the Kubernetes cluster`); *ServiceAccount*: bind the created service account to the CronJob.',
      'Validate the created object (`oc get cronjob`) and check the configured schedule and history.',
    ],
  },
  hints: [
    { pt: '`oc create cronjob test-cron --image IMG --schedule \'05 04 2 * *\' -- /bin/sh -c \'date; echo Hello from the Kubernetes cluster\'`. O histórico está em `spec.successfulJobsHistoryLimit`.', en: '`oc create cronjob test-cron --image IMG --schedule \'05 04 2 * *\' -- /bin/sh -c \'date; echo Hello from the Kubernetes cluster\'`. The history lives in `spec.successfulJobsHistoryLimit`.' },
    { pt: '`oc set serviceaccount cronjob test-cron project1-sa` liga a conta ao CronJob. Ajuste o histórico com `oc patch cronjob`.', en: '`oc set serviceaccount cronjob test-cron project1-sa` links the account to the CronJob. Adjust the history with `oc patch cronjob`.' },
  ],
  setup() {},
  checks: [
    { text: { pt: 'O projeto cron-test existe', en: 'The cron-test project exists' }, test: (w) => Boolean(w.get('Namespace', 'cron-test')) },
    {
      text: { pt: 'O CronJob test-cron (ou cron-test) roda às 04:05 do dia 2 de cada mês', en: 'The test-cron (or cron-test) CronJob runs at 04:05 on the 2nd of every month' },
      test: (w) => {
        const casa = cron(cj(w)?.spec?.schedule || '');
        if (!casa) return false;
        const ini = Date.UTC(2026, 10, 1) / 1000;
        const dias = [];
        for (let t = ini; t < ini + 30 * 86400; t += 60) if (casa(t)) dias.push(t);
        return dias.length === 1 && dias[0] === Date.UTC(2026, 10, 2, 4, 5) / 1000;
      },
    },
    { text: { pt: 'O histórico de sucessos é 14 e há uma imagem de contêiner', en: 'The success history is 14 and there is a container image' }, test: (w) => cj(w)?.spec?.successfulJobsHistoryLimit === 14 && Boolean(cj(w).spec.jobTemplate.spec.template.spec.containers[0].image) },
    {
      text: { pt: 'O CronJob usa uma service account do projeto com anyuid e/ou cluster-admin', en: 'The CronJob uses a project service account with anyuid and/or cluster-admin' },
      test: (w) => {
        const sa = cj(w)?.spec.jobTemplate.spec.template.spec.serviceAccountName;
        return Boolean(sa) && Boolean(w.get('ServiceAccount', sa, 'cron-test')) && (usar(w, 'cron-test', sa, 'anyuid') || w.pode(`system:serviceaccount:cron-test:${sa}`, '*', '*', ''));
      },
    },
  ],
  solution: [
    { cmd: 'oc new-project cron-test', pt: 'Cria o projeto.', en: 'Creates the project.' },
    { cmd: 'oc create serviceaccount project1-sa', pt: 'Cria a service account.', en: 'Creates the service account.' },
    { cmd: 'oc adm policy add-scc-to-user anyuid -z project1-sa', pt: 'Associa a SCC anyuid.', en: 'Binds the anyuid SCC.' },
    { cmd: "oc create cronjob test-cron --image registry.lab.example.com:8443/ubi9/ubi:9.4 --schedule '05 04 2 * *' -- /bin/sh -c 'date; echo Hello from the Kubernetes cluster'", pt: 'Cria o CronJob: minuto 5, hora 4, dia 2.', en: 'Creates the CronJob: minute 5, hour 4, day 2.' },
    { cmd: 'oc patch cronjob test-cron -p \'{"spec":{"successfulJobsHistoryLimit":14}}\'', pt: 'Histórico de 14 sucessos.', en: 'History of 14 successes.' },
    { cmd: 'oc set serviceaccount cronjob test-cron project1-sa', pt: 'O CronJob roda com a service account.', en: 'The CronJob runs with the service account.' },
    { cmd: 'oc get cronjob test-cron', pt: 'SCHEDULE `05 04 2 * *`.', en: 'SCHEDULE `05 04 2 * *`.' },
    { cmd: 'oc get cronjob test-cron -o yaml', pt: 'Confere o histórico e a conta.', en: 'Checks the history and the account.' },
  ],
};

// Questão 15 --------------------------------------------------------------------

const MINIMOS_Q15 = ['5Mi', '128Mi'];
const REQ_Q15 = ['254Mi', '256Mi'];
const tplLimites = (w) => (w.get('Template', 'project-request', 'openshift-config')?.objects || []).find((o) => o.kind === 'LimitRange')?.spec?.limits?.find((l) => l.type === 'Container');
const q15 = {
  id: 'g15-template-projeto',
  minutes: 25,
  xp: 260,
  difficulty: 3,
  objectives: ['Configurar o template de criação de projetos', 'Configurar limit ranges por projeto'],
  title: { pt: 'Questão 15: Template Padrão de Criação de Projetos (Project Request Template)', en: 'Question 15: Default project creation template (Project Request Template)' },
  story: {
    pt: 'Personalize o template global do OpenShift para que todo novo projeto criado pelos usuários receba automaticamente uma política padrão de limites de memória.',
    en: 'Customize the global OpenShift template so that every new project created by users automatically receives a default memory limits policy.',
  },
  tasks: {
    pt: [
      'Gerar o template base de criação de projetos (`oc adm create-bootstrap-project-template -o yaml > template.yaml`).',
      'Adicionar um objeto `LimitRange` à lista de objetos do template com os seguintes parâmetros para containers: memória mínima (`min`) `5Mi` (ou `128Mi`, conforme variação); memória máxima (`max`) `1Gi`; requisição padrão (`defaultRequest`) `254Mi` (ou `256Mi`); limite padrão (`default`) `512Mi`.',
      'Criar o template no namespace `openshift-config` com o nome `project-request`.',
      'Editar a configuração global de projetos do cluster (`projects.config.openshift.io/cluster`) definindo `spec.projectRequestTemplate.name: project-request`.',
      'Aguardar a reinicialização dos pods do `openshift-apiserver`.',
      'Criar um novo projeto de teste e verificar com `oc get limitranges` se o limite de memória foi aplicado automaticamente.',
    ],
    en: [
      'Generate the base project creation template (`oc adm create-bootstrap-project-template -o yaml > template.yaml`).',
      'Add a `LimitRange` object to the template object list with the following parameters for containers: minimum memory (`min`) `5Mi` (or `128Mi`, depending on the variation); maximum memory (`max`) `1Gi`; default request (`defaultRequest`) `254Mi` (or `256Mi`); default limit (`default`) `512Mi`.',
      'Create the template in the `openshift-config` namespace with the name `project-request`.',
      'Edit the cluster global project configuration (`projects.config.openshift.io/cluster`) setting `spec.projectRequestTemplate.name: project-request`.',
      'Wait for the `openshift-apiserver` pods to restart.',
      'Create a new test project and check with `oc get limitranges` that the memory limit was applied automatically.',
    ],
  },
  hints: [
    { pt: 'Acrescente o LimitRange na lista `objects` (antes de `parameters`), com `namespace: ${PROJECT_NAME}`. Use `oc create -f template.yaml -n openshift-config`.', en: 'Add the LimitRange to the `objects` list (before `parameters`), with `namespace: ${PROJECT_NAME}`. Use `oc create -f template.yaml -n openshift-config`.' },
    { pt: '`oc edit projects.config.openshift.io cluster` (ou `oc patch ... --type merge`) com `spec.projectRequestTemplate.name: project-request`.', en: '`oc edit projects.config.openshift.io cluster` (or `oc patch ... --type merge`) with `spec.projectRequestTemplate.name: project-request`.' },
    { pt: 'A configuração nova leva cerca de um minuto, até os pods do `openshift-apiserver` serem recriados. Um projeto criado antes disso nasce sem o limit range.', en: 'The new configuration takes about a minute, until the `openshift-apiserver` pods are recreated. A project created before that is born without the limit range.' },
  ],
  setup(w) {
    w.fs.mkdir('/home/student/template', true);
  },
  checks: [
    {
      text: { pt: 'O template project-request, em openshift-config, tem o LimitRange de contêiner pedido', en: 'The project-request template, in openshift-config, has the requested container LimitRange' },
      test: (w) => {
        const l = tplLimites(w);
        return Boolean(l) && MINIMOS_Q15.some((m) => mem(l.min?.memory) === mem(m)) && mem(l.max?.memory) === mem('1Gi') && REQ_Q15.some((m) => mem(l.defaultRequest?.memory) === mem(m)) && mem(l.default?.memory) === mem('512Mi');
      },
    },
    {
      text: { pt: 'O template ainda tem o projeto e o rolebinding admin do dono', en: 'The template still has the project and the owner admin rolebinding' },
      test: (w) => {
        const o = w.get('Template', 'project-request', 'openshift-config')?.objects || [];
        return o.some((x) => x.kind === 'Project') && o.some((x) => x.kind === 'RoleBinding' && x.roleRef?.name === 'admin');
      },
    },
    {
      text: { pt: 'projects.config.openshift.io/cluster usa o template project-request', en: 'projects.config.openshift.io/cluster uses the project-request template' },
      test: (w) => w.get(PROJECT_CONFIG, 'cluster')?.spec?.projectRequestTemplate?.name === 'project-request',
    },
    {
      text: { pt: 'Um projeto novo nasce com o limit range de memória e o dono como admin', en: 'A new project is born with the memory limit range and the owner as admin' },
      test: (w) => {
        const c = copia(w);
        c.side.projetos = { ativo: c.get(PROJECT_CONFIG, 'cluster').spec, fp: JSON.stringify(c.get(PROJECT_CONFIG, 'cluster').spec) };
        try {
          criaProjeto(c, { nome: 'teste-da-correcao', usuario: 'developer' });
        } catch {
          return false;
        }
        const l = c.list('LimitRange', 'teste-da-correcao').flatMap((x) => x.spec.limits).find((x) => x.type === 'Container');
        return mem(l?.default?.memory) === mem('512Mi') && c.list('RoleBinding', 'teste-da-correcao').some((b) => b.roleRef.name === 'admin' && (b.subjects || []).some((s) => s.name === 'developer'));
      },
    },
  ],
  solution: [
    { cmd: 'cd ~/template', pt: 'Pasta de trabalho.', en: 'Working folder.' },
    { cmd: 'oc adm create-bootstrap-project-template -o yaml > template.yaml', pt: 'O template padrão: o projeto e o rolebinding `admin`.', en: 'The default template: the project and the `admin` rolebinding.' },
    { cmd: 'cat template.yaml', pt: 'A lista `objects` vem antes de `parameters`.', en: 'The `objects` list comes before `parameters`.' },
    { cmd: `cat > template.yaml <<'EOF'
apiVersion: template.openshift.io/v1
kind: Template
metadata:
  name: project-request
objects:
- apiVersion: project.openshift.io/v1
  kind: Project
  metadata:
    annotations:
      openshift.io/description: \${PROJECT_DESCRIPTION}
      openshift.io/display-name: \${PROJECT_DISPLAYNAME}
      openshift.io/requester: \${PROJECT_REQUESTING_USER}
    name: \${PROJECT_NAME}
- apiVersion: rbac.authorization.k8s.io/v1
  kind: RoleBinding
  metadata:
    name: admin
    namespace: \${PROJECT_NAME}
  roleRef:
    apiGroup: rbac.authorization.k8s.io
    kind: ClusterRole
    name: admin
  subjects:
  - apiGroup: rbac.authorization.k8s.io
    kind: User
    name: \${PROJECT_ADMIN_USER}
- apiVersion: v1
  kind: LimitRange
  metadata:
    name: project-limits
    namespace: \${PROJECT_NAME}
  spec:
    limits:
    - type: Container
      min:
        memory: 5Mi
      max:
        memory: 1Gi
      defaultRequest:
        memory: 254Mi
      default:
        memory: 512Mi
parameters:
- name: PROJECT_NAME
- name: PROJECT_DISPLAYNAME
- name: PROJECT_DESCRIPTION
- name: PROJECT_ADMIN_USER
- name: PROJECT_REQUESTING_USER
EOF`, pt: 'O template com o LimitRange acrescentado à lista `objects`. As aspas em `EOF` impedem o shell de trocar `${...}`.', en: 'The template with the LimitRange added to the `objects` list. The quotes around `EOF` stop the shell from replacing `${...}`.' },
    { cmd: 'oc create -f template.yaml -n openshift-config', pt: 'O template precisa estar no `openshift-config`.', en: 'The template must live in `openshift-config`.' },
    { cmd: 'oc patch projects.config.openshift.io cluster --type merge -p \'{"spec":{"projectRequestTemplate":{"name":"project-request"}}}\'', pt: 'Aponta a configuração global para o template.', en: 'Points the global configuration to the template.' },
    { cmd: 'oc get pods -n openshift-apiserver', pt: 'Os pods do apiserver são recriados.', en: 'The apiserver pods are recreated.' },
    { cmd: 'sleep 70', pt: 'Espera o rollout do `openshift-apiserver`.', en: 'Waits for the `openshift-apiserver` rollout.' },
    { cmd: 'oc new-project teste-limites', pt: 'Projeto de teste.', en: 'Test project.' },
    { cmd: 'oc get limitranges -n teste-limites', pt: 'O limit range nasceu junto.', en: 'The limit range was born along with it.' },
    { cmd: 'oc delete project teste-limites', pt: 'Limpa o projeto de teste.', en: 'Cleans up the test project.' },
  ],
};

// Questão 16 --------------------------------------------------------------------

const q16 = {
  id: 'g16-file-integrity',
  minutes: 20,
  xp: 230,
  difficulty: 2,
  objectives: ['Instalar operators'],
  title: { pt: 'Questão 16: Instalação de Operators via OperatorHub', en: 'Question 16: Installing Operators via OperatorHub' },
  story: {
    pt: 'Instale um operador oficial da Red Hat para gerenciamento de integridade de arquivos nos nós do cluster.',
    en: 'Install an official Red Hat operator to manage file integrity on the cluster nodes.',
  },
  tasks: {
    pt: [
      'Acessar o Console Web do OpenShift na seção **Operators > OperatorHub**.',
      'Localizar o operador **File Integrity Operator** (`file-integrity-manager`).',
      'Realizar a instalação utilizando as seguintes configurações: namespace de instalação `openshift-file-integrity`; estratégia de atualização (*Approval Plan*) `Automatic`.',
      'Aguardar a conclusão da instalação e verificar na aba **Installed Operators** se o status consta como `Succeeded`.',
    ],
    en: [
      'Open the OpenShift Web Console in the **Operators > OperatorHub** section.',
      'Find the **File Integrity Operator** (`file-integrity-manager`).',
      'Install it with the following settings: installation namespace `openshift-file-integrity`; update strategy (*Approval Plan*) `Automatic`.',
      'Wait for the installation to finish and check in the **Installed Operators** tab that the status is `Succeeded`.',
    ],
  },
  hints: [
    { pt: 'O console web não é simulado: faça o mesmo pela CLI. `oc get packagemanifests` e `oc describe packagemanifest file-integrity-operator` mostram canal e modos de instalação (o nome do pacote é `file-integrity-operator`).', en: 'The web console is not simulated: do the same through the CLI. `oc get packagemanifests` and `oc describe packagemanifest file-integrity-operator` show the channel and install modes (the package name is `file-integrity-operator`).' },
    { pt: 'Crie o namespace, um `OperatorGroup` (modo OwnNamespace) e uma `Subscription` com `installPlanApproval: Automatic`, fonte `redhat-operators` do namespace `openshift-marketplace`.', en: 'Create the namespace, an `OperatorGroup` (OwnNamespace mode), and a `Subscription` with `installPlanApproval: Automatic`, source `redhat-operators` from the `openshift-marketplace` namespace.' },
  ],
  setup(w) {
    w.fs.mkdir('/home/student/operators', true);
  },
  checks: [
    { text: { pt: 'O namespace openshift-file-integrity existe', en: 'The openshift-file-integrity namespace exists' }, test: (w) => Boolean(w.get('Namespace', 'openshift-file-integrity')) },
    {
      text: { pt: 'A subscription do File Integrity Operator tem aprovação Automatic', en: 'The File Integrity Operator subscription has Automatic approval' },
      test: (w) => w.list('Subscription', 'openshift-file-integrity').some((s) => s.spec.name === 'file-integrity-operator' && s.spec.installPlanApproval === 'Automatic'),
    },
    {
      text: { pt: 'O ClusterServiceVersion está em Succeeded', en: 'The ClusterServiceVersion is Succeeded' },
      test: (w) => w.list('ClusterServiceVersion', 'openshift-file-integrity').some((c) => /file-integrity-operator/.test(c.metadata.name) && c.status?.phase === 'Succeeded'),
    },
    { text: { pt: 'O deployment do operator está pronto', en: 'The operator deployment is ready' }, test: (w) => w.ready('file-integrity-operator', 'openshift-file-integrity') },
  ],
  solution: [
    { cmd: 'oc get packagemanifests', pt: 'O catálogo disponível.', en: 'The available catalog.' },
    { cmd: 'oc describe packagemanifest file-integrity-operator | grep -A3 -i "name: stable\\|suggested\\|OwnNamespace"', pt: 'Canal `stable`, projeto sugerido e modo OwnNamespace.', en: 'The `stable` channel, the suggested project, and OwnNamespace mode.' },
    { cmd: 'oc create namespace openshift-file-integrity', pt: 'O namespace do operator.', en: 'The operator namespace.' },
    { cmd: `cat > ~/operators/fio.yaml <<EOF
apiVersion: operators.coreos.com/v1
kind: OperatorGroup
metadata:
  name: file-integrity-operator
  namespace: openshift-file-integrity
spec:
  targetNamespaces:
    - openshift-file-integrity
---
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: file-integrity-operator
  namespace: openshift-file-integrity
spec:
  channel: stable
  name: file-integrity-operator
  source: redhat-operators
  sourceNamespace: openshift-marketplace
  installPlanApproval: Automatic
EOF`, pt: 'Operator group e subscription.', en: 'Operator group and subscription.' },
    { cmd: 'oc apply -f ~/operators/fio.yaml', pt: 'O OLM resolve o pacote e cria o install plan.', en: 'OLM resolves the package and creates the install plan.' },
    { cmd: 'sleep 30', pt: 'Espera a instalação.', en: 'Waits for the installation.' },
    { cmd: 'oc get csv -n openshift-file-integrity', pt: 'O CSV em `Succeeded` (aba Installed Operators).', en: 'The CSV in `Succeeded` (Installed Operators tab).' },
  ],
};

// Questão 17 --------------------------------------------------------------------

const IMG_NGINX = 'registry.ocp4.example.com:8443/redhattraining/hello-world-nginx:v1.0';
const SC_NFS = 'nfs2';
const NFS = { server: '192.168.50.254', path: '/exports-ocp4/landing' };
const q17 = {
  id: 'g17-pv-nfs',
  minutes: 30,
  xp: 280,
  difficulty: 3,
  objectives: ['Escolher uma storage class', 'Provisionar volumes de dados persistentes', 'Expor aplicações para acesso externo'],
  title: { pt: 'Questão 17: Armazenamento Persistente (PV, PVC e Deployment)', en: 'Question 17: Persistent storage (PV, PVC, and Deployment)' },
  story: {
    pt: 'Configure armazenamento persistente baseado em NFS e anexe-o a uma aplicação web Nginx.',
    en: 'Configure NFS-based persistent storage and attach it to an Nginx web application.',
  },
  tasks: {
    pt: [
      'Inspecionar a *StorageClass* existente no ambiente (ex: `nfs2`) para identificar o servidor NFS e o caminho exportado (`path`).',
      'Criar um *PersistentVolume* (PV) chamado `landing-pv` com: capacidade `1Gi`; modo de acesso `ReadOnlyMany`; política de recuperação (`persistentVolumeReclaimPolicy`) `Retain`; configuração NFS apontando para o servidor e diretório do ambiente.',
      'Criar o projeto `page` e, dentro dele, criar um *PersistentVolumeClaim* (PVC) chamado `landing-pvc` solicitando `1Gi` com modo `ReadOnlyMany` (vinculado ao PV/StorageClass).',
      'Criar um *Deployment* chamado `landing` no projeto `page` utilizando a imagem `registry.ocp4.example.com:8443/redhattraining/hello-world-nginx:v1.0`.',
      'Montar o volume `landing-pvc` no diretório `/usr/share/nginx/html` do container.',
      'Expor o serviço da aplicação criando uma rota com o hostname `contet.example.ocp4.com` e validar o conteúdo servido via `curl`.',
    ],
    en: [
      'Inspect the existing *StorageClass* in the environment (e.g. `nfs2`) to identify the NFS server and the exported path (`path`).',
      'Create a *PersistentVolume* (PV) named `landing-pv` with: capacity `1Gi`; access mode `ReadOnlyMany`; reclaim policy (`persistentVolumeReclaimPolicy`) `Retain`; NFS configuration pointing to the environment server and directory.',
      'Create the `page` project and, inside it, create a *PersistentVolumeClaim* (PVC) named `landing-pvc` requesting `1Gi` with `ReadOnlyMany` mode (bound to the PV/StorageClass).',
      'Create a *Deployment* named `landing` in the `page` project using the image `registry.ocp4.example.com:8443/redhattraining/hello-world-nginx:v1.0`.',
      'Mount the `landing-pvc` volume in the container `/usr/share/nginx/html` directory.',
      'Expose the application service by creating a route with the hostname `contet.example.ocp4.com` and validate the served content with `curl`.',
    ],
  },
  hints: [
    { pt: '`oc get storageclass nfs2 -o yaml` mostra o servidor e o caminho em `parameters`. O PV precisa ter a mesma `storageClassName`, e o PVC pede essa classe para se vincular a ele.', en: '`oc get storageclass nfs2 -o yaml` shows the server and the path under `parameters`. The PV needs the same `storageClassName`, and the PVC asks for that class to bind to it.' },
    { pt: '`oc set volumes deployment/landing --add --name landing --claim-name landing-pvc --mount-path /usr/share/nginx/html --type persistentVolumeClaim`.', en: '`oc set volumes deployment/landing --add --name landing --claim-name landing-pvc --mount-path /usr/share/nginx/html --type persistentVolumeClaim`.' },
    { pt: '`oc expose deployment landing --port 8080`, depois `oc expose service landing --hostname contet.example.ocp4.com`. O `curl` vai direto no hostname da route.', en: '`oc expose deployment landing --port 8080`, then `oc expose service landing --hostname contet.example.ocp4.com`. `curl` goes straight to the route hostname.' },
  ],
  setup(w) {
    w.cluster.create({
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: { name: SC_NFS, annotations: { description: 'NFS export with the landing page content' } },
      provisioner: 'kubernetes.io/no-provisioner',
      parameters: NFS,
      reclaimPolicy: 'Retain',
      volumeBindingMode: 'Immediate',
    });
    w.fs.mkdir('/home/student/storage', true);
  },
  checks: [
    {
      text: { pt: 'O PV landing-pv: 1Gi, ReadOnlyMany, Retain, NFS do ambiente', en: 'The landing-pv PV: 1Gi, ReadOnlyMany, Retain, environment NFS' },
      test: (w) => {
        const pv = w.get('PersistentVolume', 'landing-pv');
        return pv?.spec.capacity?.storage === '1Gi' && (pv.spec.accessModes || []).join() === 'ReadOnlyMany' && pv.spec.persistentVolumeReclaimPolicy === 'Retain' && pv.spec.nfs?.server === NFS.server && pv.spec.nfs?.path === NFS.path;
      },
    },
    {
      text: { pt: 'O PVC landing-pvc (page) pede 1Gi ReadOnlyMany e está Bound ao landing-pv', en: 'The landing-pvc PVC (page) requests 1Gi ReadOnlyMany and is Bound to landing-pv' },
      test: (w) => {
        const p = w.get('PersistentVolumeClaim', 'landing-pvc', 'page');
        return p?.spec.resources?.requests?.storage === '1Gi' && (p.spec.accessModes || []).join() === 'ReadOnlyMany' && p.status?.phase === 'Bound' && p.spec.volumeName === 'landing-pv';
      },
    },
    {
      text: { pt: 'O Deployment landing usa a imagem pedida e monta o PVC em /usr/share/nginx/html', en: 'The landing Deployment uses the requested image and mounts the PVC at /usr/share/nginx/html' },
      test: (w) => {
        const d = w.get('Deployment', 'landing', 'page');
        const spec = d?.spec.template.spec;
        const ct = spec?.containers[0];
        const vol = (spec?.volumes || []).find((v) => v.persistentVolumeClaim?.claimName === 'landing-pvc');
        return ct?.image === IMG_NGINX && Boolean(vol) && (ct.volumeMounts || []).some((m) => m.name === vol.name && m.mountPath === '/usr/share/nginx/html') && w.ready('landing', 'page');
      },
    },
    {
      text: { pt: 'A route com o host contet.example.ocp4.com serve o conteúdo do volume', en: 'The route with host contet.example.ocp4.com serves the volume content' },
      test: (w) => {
        const r = w.http('http://contet.example.ocp4.com');
        return r.status === 200 && /Landing page served from NFS/.test(r.corpo || '') && w.list('Route', 'page').some((x) => x.spec.host === 'contet.example.ocp4.com');
      },
    },
  ],
  solution: [
    { cmd: 'oc get storageclass', pt: 'As classes de armazenamento.', en: 'The storage classes.' },
    { cmd: 'oc get storageclass nfs2 -o yaml', pt: 'O servidor e o caminho exportado em `parameters`.', en: 'The server and exported path under `parameters`.' },
    { cmd: `cat > ~/storage/landing-pv.yaml <<EOF
apiVersion: v1
kind: PersistentVolume
metadata:
  name: landing-pv
spec:
  capacity:
    storage: 1Gi
  accessModes:
    - ReadOnlyMany
  persistentVolumeReclaimPolicy: Retain
  storageClassName: nfs2
  nfs:
    server: ${NFS.server}
    path: ${NFS.path}
EOF`, pt: 'O manifesto do PV.', en: 'The PV manifest.' },
    { cmd: 'oc create -f ~/storage/landing-pv.yaml', pt: 'Cria o PV (cluster-wide).', en: 'Creates the PV (cluster-wide).' },
    { cmd: 'oc new-project page', pt: 'Cria o projeto.', en: 'Creates the project.' },
    { cmd: `cat > ~/storage/landing-pvc.yaml <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: landing-pvc
spec:
  accessModes:
    - ReadOnlyMany
  storageClassName: nfs2
  resources:
    requests:
      storage: 1Gi
EOF`, pt: 'O manifesto do PVC.', en: 'The PVC manifest.' },
    { cmd: 'oc create -f ~/storage/landing-pvc.yaml', pt: 'Cria o PVC no projeto `page`.', en: 'Creates the PVC in the `page` project.' },
    { cmd: 'oc get pvc,pv', pt: 'PVC `Bound` ao `landing-pv`.', en: 'PVC `Bound` to `landing-pv`.' },
    { cmd: `oc create deployment landing --image ${IMG_NGINX}`, pt: 'Cria o deployment.', en: 'Creates the deployment.' },
    { cmd: 'oc set volumes deployment/landing --add --name landing --claim-name landing-pvc --mount-path /usr/share/nginx/html --type persistentVolumeClaim', pt: 'Monta o PVC na pasta do nginx.', en: 'Mounts the PVC on the nginx folder.' },
    { cmd: 'oc expose deployment landing --port 8080', pt: 'Cria o service.', en: 'Creates the service.' },
    { cmd: 'oc expose service landing --hostname contet.example.ocp4.com', pt: 'Cria a route com o hostname pedido.', en: 'Creates the route with the requested hostname.' },
    { cmd: 'sleep 30', pt: 'Espera o rollout.', en: 'Waits for the rollout.' },
    { cmd: 'curl http://contet.example.ocp4.com', pt: 'O conteúdo do NFS.', en: 'The NFS content.' },
  ],
};

// Questão 18 --------------------------------------------------------------------

const ID_CLUSTER = '6f1c2a34-0b5d-4c8e-9a7f-2d3e4b5c6a70';
const q18 = {
  id: 'g18-must-gather',
  minutes: 15,
  xp: 200,
  difficulty: 2,
  objectives: ['Coletar dados de suporte do cluster', 'Examinar recursos e o status do cluster'],
  title: { pt: 'Questão 18: Coleta de Diagnósticos do Cluster (Must-Gather)', en: 'Question 18: Cluster diagnostics collection (Must-Gather)' },
  story: {
    pt: 'Colete informações completas de diagnóstico do cluster OpenShift, empacote os dados e execute o envio para o suporte.',
    en: 'Collect complete diagnostic information from the OpenShift cluster, package the data, and submit it to support.',
  },
  tasks: {
    pt: [
      'Executar o comando `oc adm must-gather` para coletar os logs e estados atuais dos recursos do cluster.',
      'Compactar o diretório gerado pelo `must-gather` em um arquivo `.tar.gz` utilizando o comando `tar cvaf` seguindo o padrão de nomenclatura: `system10-<cluster-id>.tar.gz`.',
      'Executar o script de envio fornecido no ambiente (`/usr/bin/script system10-<cluster-id>.tar.gz`) para submeter o pacote de diagnóstico.',
    ],
    en: [
      'Run the `oc adm must-gather` command to collect the cluster resource logs and current states.',
      'Compress the directory generated by `must-gather` into a `.tar.gz` file with the `tar cvaf` command following the naming pattern: `system10-<cluster-id>.tar.gz`.',
      'Run the submission script provided in the environment (`/usr/bin/script system10-<cluster-id>.tar.gz`) to submit the diagnostic package.',
    ],
  },
  hints: [
    { pt: 'O `<cluster-id>` é o ID do cluster: `oc get clusterversion version -o jsonpath=\'{.spec.clusterID}\'` (o resumo do must-gather também mostra `ClusterID`).', en: 'The `<cluster-id>` is the cluster ID: `oc get clusterversion version -o jsonpath=\'{.spec.clusterID}\'` (the must-gather summary also shows `ClusterID`).' },
    { pt: '`oc adm must-gather` cria uma pasta `must-gather.local.NNN` no diretório atual. Use `ls` para achar o nome e depois `tar cvaf system10-ID.tar.gz must-gather.local.NNN`.', en: '`oc adm must-gather` creates a `must-gather.local.NNN` folder in the current directory. Use `ls` to find the name, then `tar cvaf system10-ID.tar.gz must-gather.local.NNN`.' },
  ],
  setup(w) {
    w.fs.mkdir('/home/student/diag', true);
    w.shell.cwd = '/home/student/diag';
  },
  checks: [
    {
      text: { pt: 'O must-gather foi coletado (pasta must-gather.local.* com os dados do cluster)', en: 'must-gather was collected (must-gather.local.* folder with the cluster data)' },
      test: (w) => w.fs.walk('/home/student').some((f) => /must-gather\.local\.\d+\/.+\/cluster-scoped-resources\//.test(f) || /must-gather\.local\.\d+\/event-filter\.html$/.test(f)),
    },
    {
      text: { pt: 'Existe um system10-<cluster-id>.tar.gz com os dados do must-gather', en: 'There is a system10-<cluster-id>.tar.gz with the must-gather data' },
      test: (w) => w.fs.walk('/home/student').some((f) => f.endsWith(`/system10-${ID_CLUSTER}.tar.gz`) && /must-gather\.local\.\d+\//.test(w.fs.read(f))),
    },
    {
      text: { pt: 'O pacote foi enviado com o script de envio', en: 'The package was submitted with the submission script' },
      test: (w) => w.cluster.side.suporte?.arquivo === `system10-${ID_CLUSTER}.tar.gz` && w.cluster.side.suporte.arquivos > 3,
    },
  ],
  solution: [
    { cmd: 'oc adm must-gather', pt: 'Coleta os dados (pode levar alguns minutos no cluster real).', en: 'Collects the data (it may take a few minutes on a real cluster).' },
    { cmd: 'ls', pt: 'A pasta `must-gather.local.NNN`.', en: 'The `must-gather.local.NNN` folder.' },
    { cmd: "oc get clusterversion version -o jsonpath='{.spec.clusterID}{\"\\n\"}'", pt: 'O ID do cluster.', en: 'The cluster ID.' },
    { cmd: `tar cvaf system10-${ID_CLUSTER}.tar.gz must-gather.local.*`, pt: 'Empacota a pasta do must-gather.', en: 'Packages the must-gather folder.' },
    { cmd: `/usr/bin/script system10-${ID_CLUSTER}.tar.gz`, pt: 'Envia o pacote ao suporte.', en: 'Submits the package to support.' },
  ],
};

// Questão 19 --------------------------------------------------------------------

const acessaDb = (w, app) => {
  const pod = w.pods('checker', { deployment: app }).find(w.podPronto);
  return pod ? destinoTcp(w.cluster, pod, 'mysql-db.database', 3306) : { erro: 'sem-pod' };
};
const q19 = {
  id: 'g19-netpol-mysql',
  minutes: 25,
  xp: 270,
  difficulty: 3,
  objectives: ['Configurar network policies de aplicações', 'Controlar o tráfego de entrada (ingress) do cluster'],
  title: { pt: 'Questão 19: Isolamento e Comunicação entre Projetos via NetworkPolicy', en: 'Question 19: Isolation and communication between projects via NetworkPolicy' },
  story: {
    pt: 'Configure políticas de rede para permitir que apenas pods autorizados de um projeto específico se comuniquem com um banco de dados em outro namespace.',
    en: 'Configure network policies so that only authorized pods from a specific project can communicate with a database in another namespace.',
  },
  tasks: {
    pt: [
      'Preparar dois namespaces: `database` (onde reside o pod do banco de dados) e `checker` (onde reside o pod cliente de verificação).',
      'Garantir que o namespace `checker` possua o label `team=devsecops` e que o pod de origem possua o label `deployment=web-mysql` (ou `deployment=my-web-mysql`).',
      'Criar uma `NetworkPolicy` chamada `mysql-db-conn` no namespace `database` com as seguintes regras: `podSelector` selecionando os pods do banco de dados no namespace `database`; regra de `ingress` permitindo tráfego exclusivamente vindo de namespaces com label `team: devsecops` **E** pods com label `deployment: web-mysql`; porta permitida `3306/TCP`.',
      'Verificar os logs do pod no projeto `checker` para confirmar que a conexão com o banco de dados foi estabelecida com sucesso.',
    ],
    en: [
      'Prepare two namespaces: `database` (where the database pod lives) and `checker` (where the verification client pod lives).',
      'Make sure the `checker` namespace has the label `team=devsecops` and that the source pod has the label `deployment=web-mysql` (or `deployment=my-web-mysql`).',
      'Create a `NetworkPolicy` named `mysql-db-conn` in the `database` namespace with the following rules: `podSelector` selecting the database pods in the `database` namespace; `ingress` rule allowing traffic exclusively from namespaces labeled `team: devsecops` **AND** pods labeled `deployment: web-mysql`; allowed port `3306/TCP`.',
      'Check the pod logs in the `checker` project to confirm that the connection to the database was established successfully.',
    ],
  },
  hints: [
    { pt: 'Os namespaces e os pods já existem (o ambiente os prepara). O `database` nega todo tráfego de entrada por padrão (`deny-all`). Veja `oc get pods -n database --show-labels` e `oc get ns checker --show-labels`.', en: 'The namespaces and pods already exist (the environment prepares them). `database` denies all ingress by default (`deny-all`). See `oc get pods -n database --show-labels` and `oc get ns checker --show-labels`.' },
    { pt: 'No mesmo item de `from`, `namespaceSelector` e `podSelector` juntos significam "estes pods naquele namespace" (E). Em itens separados, seriam "um ou outro" (OU).', en: 'In the same `from` item, `namespaceSelector` and `podSelector` together mean "these pods in that namespace" (AND). In separate items they would mean "one or the other" (OR).' },
    { pt: 'O label do namespace sai de `oc label namespace checker team=devsecops`. O log do pod `web-mysql` mostra se a conexão com `mysql-db.database:3306` passou.', en: 'The namespace label comes from `oc label namespace checker team=devsecops`. The `web-mysql` pod log shows whether the connection to `mysql-db.database:3306` went through.' },
  ],
  setup(w) {
    const c = w.cluster;
    for (const ns of ['database', 'checker']) c.create({ kind: 'Namespace', metadata: { name: ns } });
    c.create(deployment('mysql-db', 'database', 'rhel9/mysql-80', { labels: { tier: 'database' }, env: { MYSQL_ROOT_PASSWORD: 'redhat' } }));
    c.create({ kind: 'Service', metadata: { name: 'mysql-db', namespace: 'database', labels: { app: 'mysql-db' } }, spec: { selector: { app: 'mysql-db' }, ports: [{ port: 3306, targetPort: 3306 }] } });
    c.create({ kind: 'NetworkPolicy', metadata: { name: 'deny-all', namespace: 'database' }, spec: { podSelector: {}, policyTypes: ['Ingress'] } });
    const cliente = (nome) => deployment(nome, 'checker', 'redhattraining/db-checker:1.0', { labels: { deployment: nome }, env: { DB_HOST: 'mysql-db.database', DB_PORT: '3306' } });
    c.create(cliente('web-mysql'));
    c.create(cliente('other-client'));
  },
  checks: [
    {
      text: { pt: 'O namespace checker tem o label team=devsecops', en: 'The checker namespace has the team=devsecops label' },
      test: (w) => w.get('Namespace', 'checker').metadata.labels?.team === 'devsecops',
    },
    {
      text: { pt: 'mysql-db-conn: podSelector do banco, ingress E (namespace + pod) na porta 3306/TCP', en: 'mysql-db-conn: database podSelector, ingress AND (namespace + pod) on port 3306/TCP' },
      test: (w) => {
        const np = w.get('NetworkPolicy', 'mysql-db-conn', 'database');
        const regra = np?.spec.ingress?.[0];
        const de = regra?.from?.[0];
        return (np.spec.podSelector?.matchLabels?.app === 'mysql-db' || np.spec.podSelector?.matchLabels?.tier === 'database') && np.spec.ingress.length === 1 && regra.from.length === 1 && de.namespaceSelector?.matchLabels?.team === 'devsecops' && ['web-mysql', 'my-web-mysql'].includes(de.podSelector?.matchLabels?.deployment) && (regra.ports || []).length === 1 && regra.ports[0].port === 3306 && (regra.ports[0].protocol || 'TCP') === 'TCP';
      },
    },
    {
      text: { pt: 'O pod web-mysql do checker alcança o banco (e o log mostra a conexão)', en: 'The checker web-mysql pod reaches the database (and the log shows the connection)' },
      test: (w) => !acessaDb(w, 'web-mysql').erro,
    },
    {
      text: { pt: 'Outro pod do checker, sem o label, continua bloqueado', en: 'Another checker pod, without the label, stays blocked' },
      test: (w) => acessaDb(w, 'other-client').erro === 'bloqueada',
    },
  ],
  solution: [
    { cmd: 'oc get pods -n database --show-labels', pt: 'O pod do banco e seus labels.', en: 'The database pod and its labels.' },
    { cmd: 'oc get pods -n checker --show-labels', pt: 'O pod `web-mysql` tem o label `deployment=web-mysql`.', en: 'The `web-mysql` pod has the `deployment=web-mysql` label.' },
    { cmd: 'oc logs deployment/web-mysql -n checker', pt: 'Sem a policy, a conexão estoura o tempo.', en: 'Without the policy, the connection times out.' },
    { cmd: 'oc label namespace checker team=devsecops', pt: 'O label que a policy usa.', en: 'The label the policy uses.' },
    { cmd: `cat > ~/mysql-db-conn.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: mysql-db-conn
  namespace: database
spec:
  podSelector:
    matchLabels:
      app: mysql-db
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              team: devsecops
          podSelector:
            matchLabels:
              deployment: web-mysql
      ports:
        - protocol: TCP
          port: 3306
EOF`, pt: 'O namespaceSelector e o podSelector no mesmo item: E.', en: 'namespaceSelector and podSelector in the same item: AND.' },
    { cmd: 'oc create -f ~/mysql-db-conn.yaml', pt: 'Cria a policy no namespace `database`.', en: 'Creates the policy in the `database` namespace.' },
    { cmd: 'oc logs deployment/web-mysql -n checker', pt: 'Agora: conexão estabelecida.', en: 'Now: connection established.' },
  ],
};

// Questão 20 --------------------------------------------------------------------

const q20 = {
  id: 'g20-liveness',
  minutes: 12,
  xp: 190,
  difficulty: 2,
  objectives: ['Gerenciar implantações de aplicações', 'Solucionar problemas comuns de contêineres e pods'],
  title: { pt: 'Questão 20: Configuração de Health Checks (Liveness Probe)', en: 'Question 20: Health check configuration (Liveness Probe)' },
  story: {
    pt: 'Adicione uma sonda de verificação de integridade (*Liveness Probe*) para garantir que o OpenShift reinicie automaticamente o container caso a aplicação pare de responder.',
    en: 'Add a health check probe (*Liveness Probe*) to make sure OpenShift automatically restarts the container if the application stops responding.',
  },
  tasks: {
    pt: [
      'Acessar o projeto `tuesday` (ou `start`) onde existe um *Deployment* com 1 pod em execução.',
      'Configurar uma **Liveness Probe** no container da aplicação com os seguintes parâmetros: porta de verificação `8443`; atraso inicial (`initialDelaySeconds`) `3` segundos; tempo limite (`timeoutSeconds`) `10` segundos; limite de falhas consecutivas antes de reiniciar (`failureThreshold`) `3` (sobreviver a pelo menos 3 falhas).',
      'Salvar a alteração e verificar o rollout do novo pod com a probe configurada.',
    ],
    en: [
      'Switch to the `tuesday` (or `start`) project, where a *Deployment* with 1 running pod exists.',
      'Configure a **Liveness Probe** on the application container with the following parameters: check port `8443`; initial delay (`initialDelaySeconds`) `3` seconds; timeout (`timeoutSeconds`) `10` seconds; consecutive failures before restart (`failureThreshold`) `3` (survive at least 3 failures).',
      'Save the change and check the rollout of the new pod with the configured probe.',
    ],
  },
  hints: [
    { pt: '`oc set probe deployment/NOME --liveness --open-tcp=8443 --initial-delay-seconds=3 --timeout-seconds=10 --failure-threshold=3`. O nome do deployment sai de `oc get deployment -n tuesday`.', en: '`oc set probe deployment/NAME --liveness --open-tcp=8443 --initial-delay-seconds=3 --timeout-seconds=10 --failure-threshold=3`. The deployment name comes from `oc get deployment -n tuesday`.' },
    { pt: 'Também serve `oc edit deployment`, com `livenessProbe` no contêiner. Depois `oc rollout status deployment/NOME` e `oc describe deployment/NOME`.', en: '`oc edit deployment` works too, with `livenessProbe` in the container. Then `oc rollout status deployment/NAME` and `oc describe deployment/NAME`.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: 'tuesday' } });
    w.cluster.create(deployment('secure-app', 'tuesday', 'redhattraining/hello-secure:1.0'));
    w.cluster.get('Deployment', 'secure-app', 'tuesday').spec.template.spec.containers[0].ports = [{ containerPort: 8443, protocol: 'TCP' }];
  },
  startNamespace: 'tuesday',
  checks: [
    {
      text: { pt: 'A liveness probe verifica a porta 8443', en: 'The liveness probe checks port 8443' },
      test: (w) => {
        const pr = w.get('Deployment', 'secure-app', 'tuesday').spec.template.spec.containers[0].livenessProbe;
        return Number(pr?.tcpSocket?.port ?? pr?.httpGet?.port) === 8443;
      },
    },
    {
      text: { pt: 'initialDelaySeconds 3, timeoutSeconds 10 e failureThreshold 3', en: 'initialDelaySeconds 3, timeoutSeconds 10, and failureThreshold 3' },
      test: (w) => {
        const pr = w.get('Deployment', 'secure-app', 'tuesday').spec.template.spec.containers[0].livenessProbe;
        return pr?.initialDelaySeconds === 3 && pr.timeoutSeconds === 10 && pr.failureThreshold === 3;
      },
    },
    {
      text: { pt: 'O rollout terminou: 1 pod novo, pronto e sem reinícios', en: 'The rollout finished: 1 new pod, ready and with no restarts' },
      test: (w) => w.ready('secure-app', 'tuesday') && w.pods('tuesday', { app: 'secure-app' }).every((p) => (p.status.containerStatuses || []).every((s) => !s.restartCount) && p.spec.containers[0].livenessProbe),
    },
  ],
  solution: [
    { cmd: 'oc project tuesday', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get deployment,pods', pt: 'Um deployment, um pod em execução.', en: 'One deployment, one running pod.' },
    { cmd: 'oc set probe deployment/secure-app --liveness --open-tcp=8443 --initial-delay-seconds=3 --timeout-seconds=10 --failure-threshold=3', pt: 'Liveness probe TCP na porta 8443.', en: 'TCP liveness probe on port 8443.' },
    { cmd: 'oc rollout status deployment/secure-app', pt: 'Acompanha o rollout.', en: 'Follows the rollout.' },
    { cmd: 'oc describe deployment/secure-app | grep -i liveness', pt: 'A probe com os parâmetros pedidos.', en: 'The probe with the requested parameters.' },
    { cmd: 'oc get pods', pt: 'O pod novo, `1/1 Running`.', en: 'The new pod, `1/1 Running`.' },
  ],
};

const QUESTOES = [q01, q02, q03, q04, q05, q06, q07, q08, q09, q10, q11, q12, q13, q14, q15, q16, q17, q18, q19, q20];
export default QUESTOES;
