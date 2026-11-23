<p align="center"><img src="web/assets/logo.svg" alt="Terminauta" width="96"></p>

# Terminauta

*[Read in English](README.en.md)*

**Terminauta** é uma plataforma de estudo em que você aprende tecnologia pilotando um terminal
simulado: missões gamificadas, correção automática e flashcards com repetição espaçada. As
primeiras trilhas são de OpenShift.

A trilha principal prepara para a prova **Red Hat EX280** (Red Hat Certified OpenShift
Administrator). Você é o administrador OpenShift de uma empresa fictícia e resolve chamados
no formato dos labs da Red Hat: uma especificação do que precisa estar pronto, um terminal
com `oc` e uma correção item a item (`lab grade`).

O cluster é **simulado em JavaScript dentro do navegador**. É gratuito, roda offline e não
exige OpenShift, Docker nem conta Red Hat.

Há duas trilhas, escolhidas no seletor **EX280 | EX180** do topo da tela:

- **EX280** (Red Hat Certified OpenShift Administrator): 10 capítulos e 2 simulados, baseados
  no curso DO280 4.22.
- **EX180** (Red Hat Certified Technologist in OpenShift): 6 capítulos e 2 simulados,
  baseados no curso DO180 4.22. Veja [Trilha EX180](#trilha-ex180).

O XP e o progresso são os mesmos nas duas trilhas; trocar de trilha não perde nada.

## Como rodar

Requer apenas [Node.js](https://nodejs.org) 20 ou mais recente, usado como servidor de
arquivos estáticos. Não há dependências para instalar.

```bash
git clone https://github.com/baimas/Terminauta.git
```

```bash
cd Terminauta
```

```bash
npm start
```

Abra http://localhost:8280 no navegador.

## Como jogar

1. Escolha uma missão na lista e clique em **Iniciar missão**. O ambiente é preparado como
   no `lab start`, muitas vezes já com algo quebrado.
2. Resolva no terminal com `oc`. A tecla Tab funciona como no `oc` 4.22 real (comandos,
   subcomandos, opções, valores como `-o json`, tipos e nomes de recursos), e `vi arquivo`
   abre um editor.
3. Clique em **Corrigir** ou rode `lab grade` para ver o que passou e o que falta.
4. Cada dica custa parte do XP. A solução comentada fica disponível depois da primeira
   correção, e cada passo pode ser executado direto no terminal.
5. Abra **Procurar na documentação oficial** para treinar a busca, como na prova: cada missão
   indica o guia do OpenShift 4.22 (com link para a versão em página única) e os termos para
   procurar com Ctrl+F. Essa dica não custa XP. Todos os termos foram conferidos nos guias.

Quando estiver confiante, faça um **simulado** no topo da lista: 3 horas, nota de 0 a 300
e corte em 210.

O botão no canto superior alterna entre português e inglês. A prova é aplicada em inglês,
então vale treinar a leitura dos enunciados nesse idioma. O progresso fica salvo no
navegador.

## Estado atual

| Capítulo | Domínio da prova | Situação |
|---|---|---|
| 0. Primeiro dia | Gerenciar o OpenShift Container Platform | 6 missões |
| 1. Gestão declarativa | Manifestos, Kustomize, secrets, config maps, importar e exportar | 5 missões |
| 2. Aplicações empacotadas | Templates, Helm, rollouts, services, labels | 7 missões |
| 3. Identidade | HTPasswd, usuários, grupos, RBAC | 5 missões |
| 4. Segurança de rede | Routes, TLS, network policies | 5 missões |
| 5. Além do HTTP | LoadBalancer, acesso externo, redes adicionais (UDN e NAD) | 6 missões |
| 6. Autosserviço | Quotas, limit ranges, project template | 5 missões |
| 7. Operators | Instalar e remover operators | 4 missões |
| 8. Segurança de aplicações | Service accounts, SCC, aplicações privilegiadas, jobs, cron jobs | 6 missões |
| 9. Updates | Atualização do cluster e de operators | 4 missões |

### Modo prova

Dois simulados (A e B), de 18 tarefas cada, cobrindo todos os domínios num cluster só:

- 3 horas de cronômetro; quando o tempo acaba, a prova é entregue sozinha.
- Sem dicas, sem solução e sem `lab grade`: a correção acontece só na entrega.
- Nota de 0 a 300, com aprovação a partir de 210, como na EX280, e um relatório por
  domínio e por tarefa.

As tarefas dos simulados vêm das missões dos capítulos. Para treinar a prova de verdade,
faça um simulado antes de jogar as missões que ele usa, ou guarde-o para o fim.

### Missões disponíveis

**Capítulo 0 — Primeiro dia**

- **Primeiro dia na Nimbus:** criar projeto, deployment, service e route.
- **Inventário para a auditoria:** consultas com labels e `jsonpath`.
- **Tag não é contrato:** examinar imagens e referenciá-las por digest.
- **Plantão: três aplicações fora do ar:** troubleshooting com logs, eventos e `describe`.
- **Checagem de saúde:** cluster operators, versão do cluster e eventos de aviso.
- **Só o manual:** achar campos e opções com `oc explain` e `--help`, como na prova, sem internet.

**Capítulo 1 — Gestão declarativa**

- **O que vale é o arquivo:** corrigir e aplicar manifestos com `oc apply` e `oc diff`.
- **Configuração fora da imagem:** config maps e secrets como variáveis e como arquivos.
- **Kustomize: a base:** escrever uma `kustomization.yaml` com geradores e labels.
- **Kustomize: uma base, dois ambientes:** overlays com `namespace`, `replicas`, `images` e `patches`.
- **Mudança de casa:** exportar recursos para YAML, limpar os campos do cluster e importar em outro projeto.

**Capítulo 2 — Aplicações empacotadas**

- **Um pod em quarentena:** replica set, seletor e labels, e um service que ignora o pod isolado.
- **Loja fora do ar:** troubleshooting de route, service, seletor e `targetPort`.
- **Volta uma casa:** `oc rollout history`, `undo --to-revision` e `change-cause`.
- **Banco de dados pelo catálogo:** `oc process --parameters` e `oc new-app --template` com parâmetros gerados.
- **Um template para o time de Catálogo:** publicar um template no projeto e usá-lo com `--param-file`.
- **Helm: o primeiro chart:** `helm repo add`, `helm show values` e `helm install` com arquivo de valores.
- **Helm: atualizar, voltar e atualizar de novo:** `helm upgrade`, `helm rollback` e a armadilha do `--reuse-values`.

**Capítulo 3 — Identidade**

- **Crachás para o time novo:** `htpasswd`, secret em `openshift-config` e um segundo provedor HTPasswd no OAuth.
- **Entra um, sai outro:** trocar senha, remover usuário (com `user` e `identity`) e acrescentar outro.
- **Cada time no seu quadrado:** grupos e os papéis `admin`, `edit` e `view` por projeto.
- **Um papel sob medida:** `role`, `rolebinding`, `clusterrole` e `clusterrolebinding` próprios.
- **Fechando a porta dos fundos:** `cluster-admin` para um grupo e remoção do `kubeadmin`.

**Capítulo 4 — Segurança de rede**

- **Cadeado no pagamento:** chave, CSR e certificado com `openssl`, e route edge com redirecionamento.
- **O cofre fala TLS sozinho:** secret TLS montado no pod e route passthrough.
- **TLS também por dentro:** service CA, CA bundle injetado em config map e route reencrypt.
- **Ninguém entra sem convite:** `deny-all` e liberações por pod, por namespace e para o roteador.
- **Políticas que bloquearam demais:** troubleshooting de network policies com seletor e porta errados.

**Capítulo 5 — Além do HTTP**

- **Um banco para o parceiro:** service LoadBalancer para MySQL e acesso com o cliente `mysql`.
- **Endereços para o fliperama:** `IPAddressPool`, `L2Advertisement` e IP fixo no MetalLB.
- **Uma porta no nó:** services NodePort, inclusive trocando o tipo de um service existente.
- **O IP que ninguém alcança:** troubleshooting de MetalLB (pool, anúncio) e network policy para tráfego externo.
- **Cada cliente na sua rede:** rede primária definida pelo usuário (UserDefinedNetwork) com isolamento entre projetos.
- **O banco na rede de servidores:** NetworkAttachmentDefinition `host-device` com IP estático, testada do host `utility`.

**Capítulo 6 — Autosserviço**

- **Teto de gastos:** `ResourceQuota` e `oc set resources` para pods recusados pela quota.
- **Padrão para quem esquece:** `LimitRange` com valores padrão e máximo, e pods que passam do limite.
- **Um orçamento para o time Órion:** `ClusterResourceQuota` por label de projeto.
- **Todo projeto nasce pronto:** template de criação de projetos com quota e limit range.
- **Projeto só com pedido:** self-provisioner restrito a um grupo, à prova de reinício do servidor de API.

**Capítulo 7 — Operators**

- **Um vigia para os arquivos:** instalação pela CLI com `OperatorGroup` e `Subscription`.
- **Versão homologada:** `startingCSV`, aprovação manual e install plans.
- **O terminal que nunca chegou:** subscription travada (canal errado, modo de instalação não suportado) e dependências.
- **Desligando o que ninguém usa:** remoção completa de um operator (subscription e CSV).

A instalação de operators pelo console web não é simulada; o jogo cobre o caminho pela CLI.

**Capítulo 8 — Segurança de aplicações**

- **O legado que exige root:** service account própria com a SCC `anyuid` e `oc set serviceaccount`.
- **Um agente com chave do nó:** contêiner privilegiado com a SCC `privileged` presa a uma conta.
- **Ninguém aqui precisa de root:** pod recusado por todas as SCCs e `oc adm policy scc-subject-review`.
- **Quem vigia os pods:** aplicação que lê a API do cluster com uma service account e o papel `view` em dois projetos.
- **Migração de uma vez só:** jobs com `completions`, `parallelism` e `backoffLimit`, e o template imutável.
- **A conciliação da madrugada:** cron job com agenda, histórico e concorrência, e um job disparado a partir dele.

**Capítulo 9 — Updates**

- **Patch de segurança:** `oc adm upgrade` dentro da mesma minor, acompanhando a ClusterVersion e os cluster operators.
- **Rumo à 4.19:** `apirequestcounts`, admin-ack para APIs removidas, troca de canal e atualização de minor.
- **Um canal à frente:** troca de canal de um operator com aprovação manual.
- **Prova oral da Plataforma:** cinco perguntas sobre canais, rollback, EUS e atualização de operators.

## Guia de laboratório (EX280)

O capítulo **G · Guia de laboratório** e o **Simulado do Guia (20 questões)** trazem as 20 questões
do guia prático EX280, com o enunciado e os objetivos exatamente como no guia. Cada questão é uma
missão (`web/missions/g/guia.js`); o simulado reúne as 20 num cluster só, 3 horas, nota de 0 a 300.

- O guia usa `ocp4.example.com` (repositório Helm, registro, hosts de routes), e o simulador aceita
  esses nomes. Onde o guia dá variações do cenário (outros nomes e valores), a correção aceita as variações.
- A Questão 9 depende do secret da Questão 8, e a 12 da service account da 11, como no guia.
- A Questão 16 pede o console web, que não é simulado: a mesma instalação é feita pela CLI.
- O `oc` é o 4.22 real: `--docker-image` (`oc new-app`) e `--cpu-percent` (`oc autoscale`) não existem
  mais. Use `--image` e `--cpu 60%`; as dicas de cada questão avisam.
- Binários do guia no shell simulado: `oc`, `helm`, `htpasswd`, `openssl`, `curl`, `tar` e
  `/usr/bin/script` (o script de envio ao suporte da Questão 18). O shell também expande `*` e `?`.

## Flashcards

O item **Flashcards**, no topo da lista, abre um baralho com repetição espaçada no estilo do
Anki: 100 cards da EX280 e 90 da EX180, com perguntas sobre comandos e conceitos de cada
capítulo (por exemplo: "Qual comando mostra a diferença entre o YAML local e o servidor?" →
`oc diff -f`). Responda de cabeça, vire o card (Espaço) e dê a nota de 1 a 4 (De novo,
Difícil, Bom, Fácil). Cada botão mostra quando o card volta. São no máximo 20 cards novos por
dia, há filtro por capítulo e um atalho para praticar o assunto no Lab.

Para virar o card, clique nele ou aperte Espaço, nos dois sentidos. O botão de alto-falante (ou a
tecla L) lê a pergunta ou a resposta em voz alta, e a opção **Leitura automática** lê cada card
sozinha. Em inglês, o áudio foi gravado com a voz neural do [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M)
e fica em `web/audio/en/`. Em português, o jogo usa a voz mais natural instalada no sistema.

Ao mudar o texto de um card em inglês, regrave o áudio com `scripts/gera-audio.py`. As instruções
estão no começo do arquivo. O `npm test` avisa quando algum áudio fica desatualizado.

## Trilha EX180

Objetivos da versão EX180V422K, com o curso DO180 4.22 como base:

| Capítulo | Conteúdo | Missões |
|---|---|---|
| 1. Cluster e CLI | Instalar o `oc` pela rota de downloads, `oc config`, inspecionar recursos, saúde do cluster, `oc adm must-gather` e `oc adm inspect` | 4 |
| 2. Contêineres e pods | `oc run`, `oc exec`, `oc cp`, imagens por digest (`skopeo`, `oc image info`), troubleshooting | 3 |
| 3. Implantar e expor | `oc new-app` com imagem e template, deployments, jobs e cron jobs, DNS de services, `oc scale` e routes | 5 |
| 4. Configuração e dados | Config maps e secrets, PVC, storage classes (RWO e RWX), stateful sets | 4 |
| 5. Confiabilidade | Liveness, readiness e startup probes, requests, limits e OOMKilled, HPA com gerador de carga | 4 |
| 6. Atualizações | `oc set image`, histórico de rollout, image streams, `oc tag`, `oc set image-lookup` e gatilhos de imagem | 3 |

Os simulados da EX180 têm 11 tarefas e 2 horas, a duração informada na
[página oficial da prova](https://www.redhat.com/en/services/training/ex180-red-hat-certified-technologist-in-openshift-exam).
A Red Hat não publica a nota de corte da EX180; o jogo usa 210 de 300, como na EX280.

Para essa trilha, o simulador ganhou storage classes com provisionamento dinâmico (a padrão
liga o volume no primeiro consumidor e só aceita RWO; a NFS aceita RWX), volumes que guardam
os arquivos entre pods, stateful sets, probes que matam e reiniciam o contêiner, OOMKilled,
agendamento pela soma dos requests, HPA e image streams com gatilhos. Só a inspeção pelo
console web fica de fora.

## Cobertura dos objetivos oficiais

Os objetivos da [página oficial da prova](https://www.redhat.com/en/services/training/red-hat-certified-openshift-administrator-exam)
estão registrados em `web/missions/objetivos.js`, com o texto exato, e um teste garante que
cada um tem pelo menos uma missão. O que fica de fora ou só em parte:

- **Console web:** não é simulado. As mesmas tarefas são praticadas pela CLI.
- **Alertas:** eventos são simulados; os alertas do Prometheus e do Alertmanager não.
- **Documentação do produto:** treinada com `oc explain` e `--help`; a documentação HTML da
  Red Hat não está no jogo.

O capítulo 9 (updates) vem do curso DO280 e não está na lista atual da prova; fica como
conteúdo extra.

## Usuários do laboratório

O jogo começa logado como `admin` (senha `redhatocp`), que é administrador do cluster.
Também existe o usuário comum `developer` (senha `developer`). As permissões valem de
verdade: um usuário sem papel no projeto recebe `Forbidden`, como no OpenShift.

## Limites do simulador

Simulador não é cluster. Ele reproduz os comandos, as saídas e as regras que a prova cobra,
e responde "ainda não é simulado" quando um comando está fora do escopo, em vez de inventar
uma saída. Não reproduz tempos reais de rollout, problemas de infraestrutura nem o console
web. Use-o para ganhar fluência e, se puder, complemente com prática em um cluster real
antes da prova.

O simulador se apresenta como OpenShift 4.22 (Kubernetes 1.35), a versão do curso DO280 e da
prova atual, com o domínio `lab.example.com` dos laboratórios. Confira na
[página oficial da prova](https://www.redhat.com/en/services/training/red-hat-certified-openshift-administrator-exam)
e no portal da Red Hat qual versão foi atribuída a você.

### O que mudou do 4.18 para o 4.22

- **Redes adicionais:** UserDefinedNetwork, ClusterUserDefinedNetwork e
  NetworkAttachmentDefinition (seção "Configure Additional Pod Networks" do curso).
- **SCC:** as novas `restricted-v3` e `nested-container`, a anotação
  `openshift.io/required-scc` e o acesso a SCC por RBAC (`oc create role --verb use --resource scc`).
- **MetalLB:** a documentação usa `metallb.io/address-pool` e `spec.loadBalancerIP`; o prefixo
  antigo `metallb.universe.tf/` continua aceito.
- **Saídas do `oc`:** `deleted from X namespace` e a mensagem de quota `must specify ... for: CONTÊINER`.
- **Ambiente do curso:** template `mariadb-persistent` (`rhel10/mariadb-118`), `oc debug node`,
  canais `stable-4.22`, `eus-4.22` e `candidate-5.0`.

Na missão de atualização de minor (4.21 → 4.22), as APIs depreciadas são de um operator
fictício da Nimbus: o que a prova cobra é o mecanismo (`apirequestcounts` e admin-ack).

### O `oc` do jogo e o `oc` real

Os comandos, subcomandos, apelidos, opções, o autocomplete e o texto do `--help` vieram do
cliente oficial `oc` 4.22.22 (`scripts/extrai-oc.py`). Comparado com o binário em 1.074
casos de Tab, o jogo bate em 1.071; as diferenças são de cantos sem uso na prova. Opções
inexistentes dão os mesmos erros do `oc` real. O que o Tab não reproduz por completo é a lista
de tipos de recurso de um cluster real: o jogo oferece os tipos que ele simula.

## Como o projeto é organizado

- `web/sim/` — o cluster simulado: armazenamento de recursos, controllers, shell virtual e `oc`.
- `web/engine/` — preparação e correção das missões, pontuação e progresso.
- `web/missions/` — as missões. Cada uma traz enunciado, dicas, checks e solução em PT-BR e inglês.
- `web/ui/` e `web/app.js` — a interface e o terminal.
- `test/` — as baterias de teste:
  - `missions`: cada missão começa reprovada e a solução documentada aprova;
  - `robustez`: as soluções em inglês, recarregando a página a cada comando, sem saídas com lixo;
  - `armadilhas`: atalhos errados comuns precisam ser reprovados;
  - `exames`: cada simulado roda inteiro num cluster só e chega a 300;
  - `cobertura`: todo objetivo oficial tem missão;
  - `varredura` e `simulador`: todos os tipos e subcomandos do `oc`, e regras do simulador.

Para rodar os testes:

```bash
npm test
```

## Contribuindo

Encontrou um comando que se comporta diferente do OpenShift real, ou quer propor uma missão?
Abra uma issue. Missões novas seguem o formato dos arquivos em `web/missions/` e precisam
passar no `npm test`.

## Licença

[MIT](LICENSE). As bibliotecas embutidas em `web/vendor/` (xterm.js e js-yaml) mantêm as
suas próprias licenças MIT.
O áudio em inglês dos flashcards foi gerado com o modelo Kokoro-82M, de licença Apache 2.0.

## Aviso

Projeto independente, sem vínculo com a Red Hat. Os cenários são originais e cobrem os
objetivos públicos da prova; não há conteúdo de provas reais nem de material de curso.
Red Hat e OpenShift são marcas da Red Hat, Inc.
