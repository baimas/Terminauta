<p align="center"><img src="web/assets/logo.svg" alt="Terminauta" width="96"></p>

# Terminauta

*[Leia em português](README.md)*

**Terminauta** is a study platform where you learn technology by piloting a simulated terminal:
gamified missions, automatic grading, and spaced-repetition flashcards. The first tracks cover
OpenShift.

The main track prepares you for the **Red Hat EX280** exam (Red Hat Certified OpenShift
Administrator). You are the OpenShift administrator of a fictional company and work through
tickets in the format of Red Hat labs: a specification of what must be in place, a terminal
with `oc`, and item-by-item grading (`lab grade`).

The cluster is **simulated in JavaScript inside the browser**. It is free, runs offline, and
needs no OpenShift, Docker, or Red Hat account.

There are two tracks, chosen with the **EX280 | EX180** switch at the top of the screen:

- **EX280** (Red Hat Certified OpenShift Administrator): 10 chapters and 2 practice exams,
  based on the DO280 4.22 course.
- **EX180** (Red Hat Certified Technologist in OpenShift): 6 chapters and 2 practice exams,
  based on the DO180 4.22 course. See [EX180 track](#ex180-track).

XP and progress are shared by both tracks; switching tracks loses nothing.

## How to run

Requires only [Node.js](https://nodejs.org) 20 or newer, used as a static file server.
There are no dependencies to install.

```bash
git clone https://github.com/baimas/Terminauta.git
```

```bash
cd Terminauta
```

```bash
npm start
```

Open http://localhost:8280 in your browser.

## How to play

1. Pick a mission from the list and click **Start mission**. The environment is prepared as
   with `lab start`, often with something already broken.
2. Solve it in the terminal with `oc`. The Tab key works as in the real `oc` 4.22 (commands,
   subcommands, options, values such as `-o json`, resource types and names), and `vi file`
   opens an editor.
3. Click **Grade** or run `lab grade` to see what passed and what is missing.
4. Each hint costs part of the XP. The commented solution becomes available after the first
   grading, and each step can be run straight in the terminal.
5. Open **Search the official documentation** to practice searching, as in the exam: each
   mission points to the OpenShift 4.22 guide (with a link to the single-page version) and the
   terms to look for with Ctrl+F. This hint costs no XP. Every term was checked in the guides.

When you feel ready, take a **practice exam** at the top of the list: 3 hours, a score from
0 to 300, and a passing mark of 210.

The button in the top corner switches between Portuguese and English. The exam is given in
English, so it pays to practice reading the tasks in that language. Progress is saved in the
browser.

## Current status

| Chapter | Exam domain | Status |
|---|---|---|
| 0. First day | Manage OpenShift Container Platform | 6 missions |
| 1. Declarative management | Manifests, Kustomize, secrets, config maps, import and export | 5 missions |
| 2. Packaged applications | Templates, Helm, rollouts, services, labels | 7 missions |
| 3. Identity | HTPasswd, users, groups, RBAC | 5 missions |
| 4. Network security | Routes, TLS, network policies | 5 missions |
| 5. Beyond HTTP | LoadBalancer, external access, additional networks (UDN and NAD) | 6 missions |
| 6. Self-service | Quotas, limit ranges, project template | 5 missions |
| 7. Operators | Install and remove operators | 4 missions |
| 8. Application security | Service accounts, SCCs, privileged applications, jobs, cron jobs | 6 missions |
| 9. Updates | Cluster and operator updates | 4 missions |

### Exam mode

Two practice exams (A and B), with 18 tasks each, covering every domain on a single cluster:

- A 3-hour countdown; when time runs out, the exam is submitted automatically.
- No hints, no solution, and no `lab grade`: grading only happens when you submit.
- A score from 0 to 300, passing from 210 as in the EX280, with a report by domain and by
  task.

The practice exam tasks come from the chapter missions. To use one as a real rehearsal,
take it before playing the missions it uses, or save it for the end.

### Available missions

**Chapter 0 — First day**

- **First day at Nimbus:** create a project, a deployment, a service, and a route.
- **Inventory for the audit:** queries with labels and `jsonpath`.
- **A tag is not a contract:** inspect images and reference them by digest.
- **On call: three applications down:** troubleshooting with logs, events, and `describe`.
- **Health check:** cluster operators, cluster version, and warning events.
- **Just the manual:** find fields and options with `oc explain` and `--help`, as in the exam, with no internet.

**Chapter 1 — Declarative management**

- **The file is the truth:** fix and apply manifests with `oc apply` and `oc diff`.
- **Configuration out of the image:** config maps and secrets as variables and as files.
- **Kustomize: the base:** write a `kustomization.yaml` with generators and labels.
- **Kustomize: one base, two environments:** overlays with `namespace`, `replicas`, `images`, and `patches`.
- **Moving house:** export resources to YAML, strip the cluster fields, and import them into another project.

**Chapter 2 — Packaged applications**

- **A pod in quarantine:** replica set, selector, and labels, and a service that ignores the isolated pod.
- **Store is down:** troubleshooting a route, service, selector, and `targetPort`.
- **One step back:** `oc rollout history`, `undo --to-revision`, and `change-cause`.
- **A database from the catalog:** `oc process --parameters` and `oc new-app --template` with generated parameters.
- **A template for the Catalog team:** publish a template in the project and use it with `--param-file`.
- **Helm: the first chart:** `helm repo add`, `helm show values`, and `helm install` with a values file.
- **Helm: upgrade, roll back, upgrade again:** `helm upgrade`, `helm rollback`, and the `--reuse-values` trap.

**Chapter 3 — Identity**

- **Badges for the new team:** `htpasswd`, a secret in `openshift-config`, and a second HTPasswd provider in OAuth.
- **One in, one out:** change a password, remove a user (with its `user` and `identity`), and add another.
- **Every team in its lane:** groups and the `admin`, `edit`, and `view` roles per project.
- **A tailor-made role:** custom `role`, `rolebinding`, `clusterrole`, and `clusterrolebinding`.
- **Closing the back door:** `cluster-admin` for a group and removal of `kubeadmin`.

**Chapter 4 — Network security**

- **A padlock on payments:** key, CSR, and certificate with `openssl`, and an edge route with redirect.
- **The vault speaks TLS on its own:** a TLS secret mounted in the pod and a passthrough route.
- **TLS on the inside too:** service CA, CA bundle injected into a config map, and a reencrypt route.
- **No one gets in uninvited:** `deny-all` and allow rules by pod, by namespace, and for the router.
- **Policies that blocked too much:** troubleshooting network policies with the wrong selector and port.

**Chapter 5 — Beyond HTTP**

- **A database for the partner:** a LoadBalancer service for MySQL and access with the `mysql` client.
- **Addresses for the arcade:** `IPAddressPool`, `L2Advertisement`, and a fixed IP in MetalLB.
- **A port on the node:** NodePort services, including changing the type of an existing service.
- **The IP nobody can reach:** MetalLB troubleshooting (pool, advertisement) and a network policy for external traffic.
- **Every customer on its own network:** a primary UserDefinedNetwork with isolation between projects.
- **The database on the server network:** a `host-device` NetworkAttachmentDefinition with a static IP, tested from the `utility` host.

**Chapter 6 — Self-service**

- **Spending cap:** `ResourceQuota` and `oc set resources` for pods refused by the quota.
- **Defaults for the forgetful:** `LimitRange` with defaults and a maximum, and pods above the limit.
- **A budget for team Orion:** `ClusterResourceQuota` by project label.
- **Every project is born ready:** a project request template with a quota and a limit range.
- **Projects by request only:** self-provisioner limited to a group, surviving an API server restart.

**Chapter 7 — Operators**

- **A watchman for the files:** installation through the CLI with `OperatorGroup` and `Subscription`.
- **Certified version:** `startingCSV`, manual approval, and install plans.
- **The terminal that never arrived:** a stuck subscription (wrong channel, unsupported install mode) and dependencies.
- **Switching off what nobody uses:** full removal of an operator (subscription and CSV).

Installing operators through the web console is not simulated; the game covers the CLI path.

**Chapter 8 — Application security**

- **The legacy that demands root:** a dedicated service account with the `anyuid` SCC and `oc set serviceaccount`.
- **An agent with the node key:** a privileged container with the `privileged` SCC tied to one account.
- **Nobody here needs root:** a pod refused by every SCC and `oc adm policy scc-subject-review`.
- **Who watches the pods:** an application that reads the cluster API with a service account and the `view` role in two projects.
- **A one-time migration:** jobs with `completions`, `parallelism`, and `backoffLimit`, and the immutable template.
- **The overnight reconciliation:** a cron job with schedule, history, and concurrency, and a job triggered from it.

**Chapter 9 — Updates**

- **Security patch:** `oc adm upgrade` within the same minor version, following the ClusterVersion and cluster operators.
- **On to 4.19:** `apirequestcounts`, admin-ack for removed APIs, channel switch, and a minor version update.
- **One channel ahead:** switching an operator channel with manual approval.
- **Platform oral exam:** five questions on channels, rollback, EUS, and operator updates.

## Lab guide (EX280)

The **G · Lab guide** chapter and the **Lab guide exam (20 questions)** bring the 20 questions of the
EX280 practical guide, with the wording and objectives exactly as in the guide. Each question is a
mission (`web/missions/g/guia.js`); the exam gathers all 20 on a single cluster, 3 hours, score 0 to 300.

- The guide uses `ocp4.example.com` (Helm repository, registry, route hosts), and the simulator accepts
  those names. Where the guide gives scenario variations (other names and values), grading accepts them.
- Question 9 depends on the secret from Question 8, and 12 on the service account from 11, as in the guide.
- Question 16 asks for the web console, which is not simulated: the same installation is done through the CLI.
- The `oc` is the real 4.22: `--docker-image` (`oc new-app`) and `--cpu-percent` (`oc autoscale`) no longer
  exist. Use `--image` and `--cpu 60%`; each question hints at it.
- Guide binaries in the simulated shell: `oc`, `helm`, `htpasswd`, `openssl`, `curl`, `tar`, and
  `/usr/bin/script` (the support submission script of Question 18). The shell also expands `*` and `?`.

## Flashcards

The **Flashcards** item, at the top of the list, opens a spaced repetition deck in the style
of Anki: 100 EX280 cards and 90 EX180 cards, with questions about the commands and concepts of
each chapter (for example: "Which command shows the difference between the local YAML and the
server?" → `oc diff -f`). Answer from memory, flip the card (Space), and rate it from 1 to 4
(Again, Hard, Good, Easy). Each button shows when the card comes back. There are at most 20
new cards per day, a chapter filter, and a shortcut to practice the topic in the Lab.

Click the card or press Space to flip it either way. The speaker button (or the L key) reads
the question or the answer aloud, and the **Read aloud automatically** option reads every card
for you. The English audio was recorded with the [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M)
neural voice and lives in `web/audio/en/`. In Portuguese, the game uses the most natural voice
installed on the system.

When you change the text of an English card, record its audio again with `scripts/gera-audio.py`.
The instructions are at the top of the file. `npm test` warns when an audio file is out of date.

## EX180 track

Objectives of exam version EX180V422K, based on the DO180 4.22 course:

| Chapter | Content | Missions |
|---|---|---|
| 1. Cluster and CLI | Install `oc` from the downloads route, `oc config`, inspect resources, cluster health, `oc adm must-gather` and `oc adm inspect` | 4 |
| 2. Containers and pods | `oc run`, `oc exec`, `oc cp`, images by digest (`skopeo`, `oc image info`), troubleshooting | 3 |
| 3. Deploy and expose | `oc new-app` from an image and a template, deployments, jobs and cron jobs, service DNS, `oc scale` and routes | 5 |
| 4. Configuration and data | Config maps and secrets, PVCs, storage classes (RWO and RWX), stateful sets | 4 |
| 5. Reliability | Liveness, readiness, and startup probes, requests, limits and OOMKilled, HPA with a load generator | 4 |
| 6. Updates | `oc set image`, rollout history, image streams, `oc tag`, `oc set image-lookup`, and image triggers | 3 |

The EX180 practice exams have 11 tasks and 2 hours, the duration stated on the
[official exam page](https://www.redhat.com/en/services/training/ex180-red-hat-certified-technologist-in-openshift-exam).
Red Hat does not publish the EX180 passing score; the game uses 210 out of 300, as in the EX280.

For this track the simulator gained storage classes with dynamic provisioning (the default
one binds on first consumer and only supports RWO; the NFS one supports RWX), volumes that
keep files across pods, stateful sets, probes that kill and restart the container,
OOMKilled, scheduling by the sum of requests, HPA, and image streams with triggers. Only
inspection through the web console is left out.

## Coverage of the official objectives

The objectives from the [official exam page](https://www.redhat.com/en/services/training/red-hat-certified-openshift-administrator-exam)
are recorded in `web/missions/objetivos.js`, with their exact wording, and a test makes sure
each one has at least one mission. What is left out or only partly covered:

- **Web console:** not simulated. The same tasks are practiced through the CLI.
- **Alerts:** events are simulated; Prometheus and Alertmanager alerts are not.
- **Product documentation:** practiced with `oc explain` and `--help`; the Red Hat HTML
  documentation is not in the game.

Chapter 9 (updates) comes from the DO280 course and is not in the current exam list; it is
extra content.

## Lab users

The game starts logged in as `admin` (password `redhatocp`), a cluster administrator.
There is also the regular user `developer` (password `developer`). Permissions are real:
a user without a role in the project gets `Forbidden`, as in OpenShift.

## Simulator limits

A simulator is not a cluster. It reproduces the commands, outputs, and rules the exam asks
for, and answers "not simulated yet" when a command is out of scope instead of making up an
output. It does not reproduce real rollout times, infrastructure problems, or the web
console. Use it to build fluency and, if you can, complement it with practice on a real
cluster before the exam.

The simulator presents itself as OpenShift 4.22 (Kubernetes 1.35), the version of the DO280
course and of the current exam, with the `lab.example.com` lab domain. Check the
[official exam page](https://www.redhat.com/en/services/training/red-hat-certified-openshift-administrator-exam)
and the Red Hat portal for the version assigned to you.

### What changed from 4.18 to 4.22

- **Additional networks:** UserDefinedNetwork, ClusterUserDefinedNetwork, and
  NetworkAttachmentDefinition (the "Configure Additional Pod Networks" course section).
- **SCCs:** the new `restricted-v3` and `nested-container`, the `openshift.io/required-scc`
  annotation, and SCC access through RBAC (`oc create role --verb use --resource scc`).
- **MetalLB:** the documentation uses `metallb.io/address-pool` and `spec.loadBalancerIP`; the
  old `metallb.universe.tf/` prefix is still accepted.
- **`oc` output:** `deleted from X namespace` and the quota message `must specify ... for: CONTAINER`.
- **Course environment:** the `mariadb-persistent` template (`rhel10/mariadb-118`), `oc debug node`,
  and the `stable-4.22`, `eus-4.22`, and `candidate-5.0` channels.

In the minor update mission (4.21 → 4.22), the deprecated APIs belong to a fictional Nimbus
operator: what the exam tests is the mechanism (`apirequestcounts` and admin-ack).

### The game `oc` and the real `oc`

Commands, subcommands, aliases, options, autocomplete, and the `--help` text come from the
official `oc` 4.22.22 client (`scripts/extrai-oc.py`). Compared with the binary in 1,074 Tab
cases, the game matches 1,071; the differences are corner cases not used in the exam. Unknown
options give the same errors as the real `oc`. What Tab does not fully reproduce is the list of
resource types of a real cluster: the game offers the types it simulates.

## Project layout

- `web/sim/` — the simulated cluster: resource store, controllers, virtual shell, and `oc`.
- `web/engine/` — mission setup and grading, scoring, and progress.
- `web/missions/` — the missions. Each one carries its task, hints, checks, and solution in Portuguese and English.
- `web/ui/` and `web/app.js` — the interface and the terminal.
- `test/` — the test suites:
  - `missions`: each mission starts failing and the documented solution passes;
  - `robustez`: solutions in English, reloading the page after every command, with no garbage output;
  - `armadilhas`: common wrong shortcuts must fail;
  - `exames`: each practice exam runs in full on a single cluster and reaches 300;
  - `cobertura`: every official objective has a mission;
  - `varredura` and `simulador`: every `oc` resource type and subcommand, and simulator rules.

To run the tests:

```bash
npm test
```

## Contributing

Found a command that behaves differently from real OpenShift, or want to propose a mission?
Open an issue. New missions follow the format of the files in `web/missions/` and must pass
`npm test`.

## License

[MIT](LICENSE). The libraries bundled in `web/vendor/` (xterm.js and js-yaml) keep their own
MIT licenses.

The English flashcard audio was generated with the Kokoro-82M model, licensed under Apache 2.0.

## Disclaimer

Independent project, not affiliated with Red Hat. The scenarios are original and cover the
public exam objectives; there is no content from real exams or from course material.
Red Hat and OpenShift are trademarks of Red Hat, Inc.
