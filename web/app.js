// Interface do jogo: lista de missões, chamado, terminal, editor e correção.
import { CHAPTERS, MISSIONS, EXAMS, TRILHAS, trilha, byId, chapterOf, objective } from './missions/index.js';
import { notaDoExame, CORTE, NOTA_MAXIMA } from './missions/exames.js';
import { DOCS, GUIAS, linkGuia, indiceDocs, VERSAO_DOCS } from './missions/docs-oficiais.js';
import { startMission, grade, score, level, HINT_COST } from './engine/game.js';
import { createWorld } from './engine/world.js';
import { progress } from './engine/progress.js';
import { GameTerminal } from './ui/terminal.js';
import { Abort } from './sim/shell.js';
import { banner, icone, temaDe } from './ui/ilustracoes.js';
import { cardsDa } from './flashcards/index.js';
import { criaVoz } from './ui/voz.js';
import { responde, rotuloIntervalo, fila, resumo, novoEstado } from './engine/repeticao.js';

const TEXTOS = {
  pt: {
    subtitulo: 'OpenShift simulado para treinar a prova', idioma: 'English', iniciar: 'Iniciar missão (lab start)', reiniciar: 'Reiniciar', corrigir: 'Corrigir (lab grade)',
    dica: 'Pedir dica', solucao: 'Ver solução', encerrar: 'Encerrar', tarefas: 'Especificação', resultado: 'Correção', dicas: 'Dicas', objetivos: 'Objetivos da prova',
    tempo: 'Tempo sugerido', min: 'min', dificuldade: 'Dificuldade', emBreve: 'em construção', aprovado: 'Missão concluída', parcial: 'Ainda falta',
    custoDica: `cada dica reduz ${HINT_COST * 100}% do XP`, custoSolucao: 'ver a solução antes de concluir reduz o XP pela metade', soApos: 'disponível após a primeira correção',
    executar: 'Executar', passo: 'Passo', semDicas: 'Não há mais dicas.', trocar: 'Há uma missão em andamento. Abandoná-la e começar esta?', zerar: 'Zerar progresso',
    confirmaZerar: 'Apagar todo o progresso e o XP?', salvar: 'Salvar', cancelar: 'Cancelar', editorDica: 'Ctrl+S ou ⌘S salva · Esc cancela · Tab insere dois espaços',
    terminalParado: 'Escolha uma missão na lista e clique em "Iniciar missão" para ligar o terminal.\r\n',
    pronto: (id) => `Ambiente da missão ${id} preparado. Digite "help" para ver os comandos simulados.\n\n`,
    retomado: (id) => `Missão ${id} retomada de onde você parou.\n\n`,
    bemVindo: (p) => `Bem-vindo ao Terminauta ${p}`,
    intro: [
      'Você é o novo administrador OpenShift da Nimbus Tecnologia. Cada chamado é um lab no formato da prova: uma especificação do que precisa estar pronto, sem o passo a passo.',
      'O cluster é simulado dentro do navegador. Não há nada para instalar e nada sai da sua máquina.',
    ],
    regras: ['Escolha uma missão à esquerda e clique em Iniciar: o ambiente é preparado como no `lab start`.', 'Resolva no terminal com `oc`. Tab completa comandos, tipos e nomes de recursos; `vi arquivo` abre o editor.', 'Clique em Corrigir (ou rode `lab grade`) para ver item a item o que passou.', 'Dicas custam XP. A solução comentada fica disponível depois da primeira correção.'],
    limite: 'Simulador não é cluster: ele cobre os comandos e regras que a prova cobra, e avisa quando um comando ainda não é simulado. Quando estiver confiante, faça um simulado no modo prova.',
    nota: 'Nota', xp: 'XP', de: 'de', melhor: 'melhor resultado',
    flash: 'Flashcards', flashDesc: 'Repetição espaçada dos conceitos da prova', flashIntro: 'Leia a pergunta, responda de cabeça e só então vire o card. Seja honesto na nota: o intervalo até a próxima revisão depende dela.',
    novos: 'Novos', aprendendo: 'Aprendendo', revisar: 'Para revisar', dominados: 'Dominados', todos: 'Todos', virar: 'Mostrar resposta', atalhoVirar: 'Espaço', cliqueVirar: 'Clique no cartão para virar', cliqueVoltar: 'Clique para ver a pergunta de novo', ouvir: 'Ouvir', autoLeitura: 'Leitura automática', atalhoOuvir: 'L ouve',
    notas: ['De novo', 'Difícil', 'Bom', 'Fácil'], restam: (n) => `${n} na fila`, praticar: 'Praticar no Lab',
    fim: 'Tudo revisado por agora!', fimProximo: (q) => `A próxima revisão é ${q}.`, fimNada: 'Não há mais cards novos neste filtro.', adiantar: 'Estudar adiantado', limiteNovos: (n) => `Limite de ${n} cards novos por dia, como no Anki.`, pergunta: 'Pergunta', resposta: 'Resposta',
    docsTitulo: `Procurar na documentação oficial (${'4.22'})`, docsGuia: 'Guia', docsTermos: 'Procure (Ctrl+F) por', docsComo: 'Abra o guia em página única e use a busca do navegador, como na prova. A dica não custa XP.', docsProva: 'Na prova você tem a documentação do produto, sem dicas. Treine a busca no índice:',
    modoProva: 'Modo prova', provaDesc: (h) => `${h} horas · todos os domínios · sem dicas`, trocaTrilha: 'Prova que você está estudando', cursoBase: (c) => `Missões baseadas no curso ${c} 4.22 e nos objetivos oficiais da prova.`, iniciarProva: 'Começar prova', entregar: 'Entregar prova', abandonar: 'Abandonar',
    confirmaEntregar: 'Entregar a prova agora? Depois disso a nota é calculada e não dá mais para mexer.', confirmaAbandonar: 'Abandonar a prova? Nada será corrigido.',
    regrasProva: ['Todas as tarefas rodam no mesmo cluster. Faça na ordem que quiser.', 'Não há dicas, solução nem `lab grade`: a correção só acontece na entrega.', 'Quando o tempo acabar, a prova é entregue sozinha.', `Nota de 0 a ${NOTA_MAXIMA}; aprovação a partir de ${CORTE}.`, 'As configurações precisam estar valendo no fim: o que só existe em arquivo não conta.'],
    tarefa: 'Tarefa', restante: 'restante', aprovadoProva: 'Aprovado', reprovadoProva: 'Reprovado', porDominio: 'Desempenho por domínio', porTarefa: 'Tarefas',
    semGrade: 'lab grade não está disponível no modo prova. Entregue a prova para ver a nota.\n', melhorNota: 'melhor nota', tempoEsgotado: 'Tempo esgotado: a prova foi entregue.', refazer: 'Fazer de novo', corte: 'aprovação a partir de',
  },
  en: {
    subtitulo: 'Simulated OpenShift to practice for the exam', idioma: 'Português', iniciar: 'Start mission (lab start)', reiniciar: 'Restart', corrigir: 'Grade (lab grade)',
    dica: 'Ask for a hint', solucao: 'Show solution', encerrar: 'Finish', tarefas: 'Specification', resultado: 'Grading', dicas: 'Hints', objetivos: 'Exam objectives',
    tempo: 'Suggested time', min: 'min', dificuldade: 'Difficulty', emBreve: 'under construction', aprovado: 'Mission complete', parcial: 'Not there yet',
    custoDica: `each hint takes ${HINT_COST * 100}% off the XP`, custoSolucao: 'viewing the solution before finishing halves the XP', soApos: 'available after the first grading',
    executar: 'Run', passo: 'Step', semDicas: 'No more hints.', trocar: 'A mission is in progress. Abandon it and start this one?', zerar: 'Reset progress',
    confirmaZerar: 'Erase all progress and XP?', salvar: 'Save', cancelar: 'Cancel', editorDica: 'Ctrl+S or ⌘S saves · Esc cancels · Tab inserts two spaces',
    terminalParado: 'Pick a mission from the list and click "Start mission" to power on the terminal.\r\n',
    pronto: (id) => `Environment for mission ${id} is ready. Type "help" to list the simulated commands.\n\n`,
    retomado: (id) => `Mission ${id} resumed where you left off.\n\n`,
    bemVindo: (p) => `Welcome to Terminauta ${p}`,
    intro: [
      'You are the new OpenShift administrator at Nimbus Tecnologia. Each ticket is a lab in the exam format: a specification of what must be in place, with no step-by-step.',
      'The cluster is simulated inside the browser. There is nothing to install and nothing leaves your machine.',
    ],
    regras: ['Pick a mission on the left and click Start: the environment is prepared as with `lab start`.', 'Solve it in the terminal with `oc`. Tab completes commands, resource types, and names; `vi file` opens the editor.', 'Click Grade (or run `lab grade`) to see item by item what passed.', 'Hints cost XP. The commented solution becomes available after the first grading.'],
    limite: 'A simulator is not a cluster: it covers the commands and rules the exam asks for, and tells you when a command is not simulated yet. When you feel ready, take a practice exam in exam mode.',
    nota: 'Score', xp: 'XP', de: 'of', melhor: 'best result',
    flash: 'Flashcards', flashDesc: 'Spaced repetition of the exam concepts', flashIntro: 'Read the question, answer from memory, and only then flip the card. Be honest when rating: the interval until the next review depends on it.',
    novos: 'New', aprendendo: 'Learning', revisar: 'Due', dominados: 'Mature', todos: 'All', virar: 'Show answer', atalhoVirar: 'Space', cliqueVirar: 'Click the card to flip it', cliqueVoltar: 'Click to see the question again', ouvir: 'Listen', autoLeitura: 'Read aloud automatically', atalhoOuvir: 'L listens',
    notas: ['Again', 'Hard', 'Good', 'Easy'], restam: (n) => `${n} in the queue`, praticar: 'Practice in the Lab',
    fim: 'All caught up for now!', fimProximo: (q) => `The next review is ${q}.`, fimNada: 'No more new cards in this filter.', adiantar: 'Study ahead', limiteNovos: (n) => `Limit of ${n} new cards per day, as in Anki.`, pergunta: 'Question', resposta: 'Answer',
    docsTitulo: `Search the official documentation (${'4.22'})`, docsGuia: 'Guide', docsTermos: 'Search (Ctrl+F) for', docsComo: 'Open the single-page guide and use the browser search, as in the exam. This hint costs no XP.', docsProva: 'In the exam you have the product documentation, without hints. Practice searching from the index:',
    modoProva: 'Exam mode', provaDesc: (h) => `${h} hours · every domain · no hints`, trocaTrilha: 'Exam you are studying for', cursoBase: (c) => `Missions based on the ${c} 4.22 course and the official exam objectives.`, iniciarProva: 'Start exam', entregar: 'Submit exam', abandonar: 'Abandon',
    confirmaEntregar: 'Submit the exam now? The score is calculated and nothing else can be changed.', confirmaAbandonar: 'Abandon the exam? Nothing will be graded.',
    regrasProva: ['Every task runs on the same cluster. Work in any order you like.', 'There are no hints, solution, or `lab grade`: grading only happens when you submit.', 'When time runs out, the exam is submitted automatically.', `Score from 0 to ${NOTA_MAXIMA}; passing from ${CORTE}.`, 'Configuration must be in effect at the end: what only exists in a file does not count.'],
    tarefa: 'Task', restante: 'left', aprovadoProva: 'Passed', reprovadoProva: 'Failed', porDominio: 'Performance by domain', porTarefa: 'Tasks',
    semGrade: 'lab grade is not available in exam mode. Submit the exam to see your score.\n', melhorNota: 'best score', tempoEsgotado: 'Time is up: the exam was submitted.', refazer: 'Take it again', corte: 'passing from',
  },
};

const $ = (id) => document.getElementById(id);
const L = () => (progress.lang === 'en' ? 'en' : 'pt');
const T = () => TEXTOS[L()];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rico = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

const term = new GameTerminal($('terminal'));
let selecionada = null; // missão exibida no painel
let ativa = null; // { missao, world, dicas, tentativas, viuSolucao, segundos, resultado }

// ------------------------------------------------------------------ editor

function abreEditor(caminho, conteudo) {
  return new Promise((resolve) => {
    const caixa = $('editor');
    const area = $('editor-texto');
    $('editor-arquivo').textContent = caminho;
    area.value = conteudo;
    caixa.hidden = false;
    area.focus();
    area.setSelectionRange(0, 0);
    area.scrollTop = 0;
    const fecha = (valor) => {
      caixa.hidden = true;
      area.removeEventListener('keydown', tecla);
      $('editor-salvar').onclick = null;
      $('editor-cancelar').onclick = null;
      document.activeElement?.blur();
      term.focus();
      resolve(valor);
    };
    const tecla = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        fecha(null);
      } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        fecha(area.value);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end');
      }
    };
    area.addEventListener('keydown', tecla);
    $('editor-salvar').onclick = () => fecha(area.value);
    $('editor-cancelar').onclick = () => fecha(null);
  });
}

// ------------------------------------------------------------------ mundo

function opcoesDoMundo() {
  return {
    lang: progress.lang,
    openEditor: abreEditor,
    write: (txt) => term.write(txt),
    ask: (texto, secreto) => term.ask(texto, secreto),
    // No navegador a espera é em tempo real e pode ser interrompida com Ctrl+C.
    sleep: (s) => new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        term.cancelar = null;
        resolve();
      }, s * 1000);
      term.cancelar = () => {
        clearTimeout(t);
        term.cancelar = null;
        reject(new Abort());
      };
    }),
  };
}

function ligaLab(a) {
  a.world.env.lab = async (args) => {
    if (args[0] !== 'grade') return { err: 'usage: lab grade\n', code: 1 };
    if (a.missao.exam) return { err: T().semGrade, code: 1 };
    const r = await corrigir();
    const pontos = (txt) => '.'.repeat(Math.max(3, 74 - txt.length));
    let out = `\nGrading the student's work for ${a.missao.id}:\n\n`;
    for (const item of r.resultado) out += ` · ${item.text[L()]} ${pontos(item.text[L()])} ${item.ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}\n`;
    return { out: out + `\nOverall lab grade: ${r.nota.passou ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}\n\n`, code: r.nota.passou ? 0 : 1 };
  };
}

function salvaSessao() {
  if (!ativa) return progress.saveSession(null);
  progress.saveSession({ id: ativa.missao.id, mundo: ativa.world.serialize(), dicas: ativa.dicas, tentativas: ativa.tentativas, viuSolucao: ativa.viuSolucao, segundos: ativa.segundos, resultado: ativa.resultado, entregue: ativa.entregue, historico: ativa.world.shell.history.slice(-200) });
}

async function iniciar(missao) {
  if (ativa && ativa.missao.id !== missao.id && !ativa.entregue && !confirm(T().trocar)) return;
  const world = await startMission(missao, opcoesDoMundo());
  ativa = { missao, world, dicas: 0, tentativas: 0, viuSolucao: false, segundos: 0, resultado: null };
  ligaLab(ativa);
  term.attach(world, T().pronto(missao.id));
  salvaSessao();
  desenha();
  term.focus();
}

function retomar() {
  const s = progress.loadSession();
  const missao = s && byId(s.id);
  if (!missao) return;
  try {
    const world = createWorld({ ...opcoesDoMundo(), salvo: s.mundo });
    world.shell.history.push(...(s.historico || []));
    ativa = { missao, world, dicas: s.dicas, tentativas: s.tentativas, viuSolucao: s.viuSolucao, segundos: s.segundos, resultado: s.resultado, entregue: s.entregue };
    ligaLab(ativa);
    selecionada = missao;
    if (missao.trilha && missao.trilha !== progress.trilha) progress.trilha = missao.trilha;
    if (ativa.entregue) term.detach('');
    else term.attach(world, T().retomado(missao.id));
  } catch (e) {
    console.error(e);
    progress.saveSession(null);
  }
}

function encerrar() {
  ativa = null;
  salvaSessao();
  term.detach(T().terminalParado);
  desenha();
}

async function entregar() {
  const a = ativa;
  if (!a || a.entregue) return;
  const resultado = await grade(a.missao, a.world);
  a.relatorio = notaDoExame(a.missao, resultado, chapterOf);
  a.resultado = { resultado, exame: { nota: a.relatorio.nota, passou: a.relatorio.passou, porParte: a.relatorio.porParte.map(({ id, ok, total }) => ({ id, ok, total })), dominios: a.relatorio.dominios.map((d) => ({ id: d.capitulo.id, pct: d.pct })) } };
  a.entregue = true;
  progress.recordExam(a.missao.id, a.relatorio.nota, a.relatorio.passou);
  salvaSessao();
  term.detach('');
  desenha();
  $('chamado').scrollTop = 0;
}

async function corrigir() {
  const a = ativa;
  const resultado = await grade(a.missao, a.world);
  const bruto = score(a.missao, resultado, a.dicas);
  const nota = { ...bruto, xp: a.viuSolucao && !progress.of(a.missao.id).done ? Math.round(bruto.xp / 2) : bruto.xp };
  a.tentativas++;
  a.resultado = { resultado, nota };
  progress.record(a.missao.id, nota);
  salvaSessao();
  desenha();
  return a.resultado;
}

// ---------------------------------------------------------------- desenho

function desenhaTopo() {
  const t = T();
  document.documentElement.lang = progress.lang;
  $('subtitulo').textContent = t.subtitulo;
  $('btn-idioma').textContent = t.idioma;
  const tr = trilha(progress.trilha);
  $('marca-nome').textContent = 'Terminauta';
  document.title = `Terminauta ${tr.nome}`;
  $('trilhas').setAttribute('aria-label', t.trocaTrilha);
  $('trilhas').innerHTML = TRILHAS.map((x) => `<button type="button" class="trilha${x.id === tr.id ? ' ativa' : ''}" data-trilha="${x.id}" aria-pressed="${x.id === tr.id}" title="${esc(x.titulo[L()])}">${x.nome}</button>`).join('');
  $('editor-salvar').textContent = t.salvar;
  $('editor-cancelar').textContent = t.cancelar;
  $('editor-dica').textContent = t.editorDica;
  const xp = progress.totalXp();
  const n = level(xp);
  $('nivel-nome').textContent = `${n.n} · ${n[L()]}`;
  $('nivel-xp').textContent = n.proximo ? `${xp} / ${n.proximo} XP` : `${xp} XP`;
  $('nivel-barra').style.width = n.proximo ? `${Math.min(100, ((xp - n.atual) / (n.proximo - n.atual)) * 100)}%` : '100%';
}

function desenhaLista() {
  const t = T();
  const tr = trilha(progress.trilha);
  const exames = EXAMS.filter((ex) => ex.trilha === tr.id);
  const r = resumo(cardsDa(tr.id), progress.flash.estados);
  let html = `<button type="button" class="missao flash-entrada${selecionada?.flash ? ' atual' : ''}" data-id="flash">${icone('cartas', 18)}<span class="nome"><b>${t.flash}</b><small>${t.flashDesc}</small></span><span class="selo${r.vencidos ? ' ativo' : ''}">${r.vencidos || r.novos}</span></button>`;
  html += `<div class="capitulo"><h2><span class="rotulo">${icone('trofeu', 15)}${t.modoProva}</span><span></span></h2><p>${t.provaDesc(exames[0].minutes / 60)}</p></div>`;
  for (const ex of exames) {
    const p = progress.ofExam(ex.id);
    const classes = ['missao', 'prova', p.passou ? 'feita' : '', selecionada?.id === ex.id ? 'atual' : ''].join(' ');
    const andamento = ativa?.missao.id === ex.id && !ativa.entregue ? ' andamento' : '';
    html += `<button type="button" class="${classes}${andamento}" data-id="${ex.id}"><span class="estado">${p.passou ? '✓' : ''}</span><span class="nome">${esc(ex.title[L()])}</span><span class="xp">${p.tentativas ? `${p.melhor}/${NOTA_MAXIMA}` : `${ex.minutes} min`}</span></button>`;
  }
  for (const cap of tr.capitulos) {
    const feitas = cap.missions.filter((m) => progress.of(m.id).done).length;
    const pct = cap.missions.length ? Math.round((feitas / cap.missions.length) * 100) : 0;
    html += `<div class="capitulo${cap.missions.length ? '' : ' vazio'}"><h2><span class="rotulo">${icone(temaDe(cap.missions[0]?.id || ''), 15)}${esc(cap.guia ? 'G' : cap.id.slice(1))} · ${esc(cap.title[L()])}</span><span>${cap.missions.length ? `${feitas}/${cap.missions.length}` : ''}</span></h2><p>${esc(cap.domain[L()])}</p><div class="progresso"><span style="width:${pct}%"></span></div></div>`;
    if (!cap.missions.length) html += `<div class="em-breve">${t.emBreve}</div>`;
    for (const m of cap.missions) {
      const p = progress.of(m.id);
      const classes = ['missao', p.done ? 'feita' : '', selecionada?.id === m.id ? 'atual' : ''].join(' ');
      const andamento = ativa?.missao.id === m.id && !p.done ? ' andamento' : '';
      html += `<button type="button" class="${classes}${andamento}" data-id="${m.id}"><span class="estado">${p.done ? '✓' : ''}</span><span class="nome">${esc(m.title[L()])}</span><span class="xp">${p.xp || m.xp} XP</span></button>`;
    }
  }
  html += `<div class="rodape-lateral"><button type="button" class="fantasma" id="btn-zerar">${t.zerar}</button></div>`;
  $('lista').innerHTML = html;
}

// Tarefas que o jogador pode ir marcando (só para ele se organizar; a correção
// continua sendo o lab grade). Fica guardado no navegador.
// As chaves mantêm o nome antigo para não perder o progresso de quem já jogava.
const CHAVE_TAREFAS = 'labgame-ex280.tarefas';
function marcadas() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_TAREFAS)) || {};
  } catch {
    return {};
  }
}
function listaTarefas(chave, itens) {
  const m = marcadas()[chave] || [];
  return `<ol class="tarefas" data-chave="${esc(chave)}">${itens.map((x, i) => `<li data-i="${i}" class="${m.includes(i) ? 'marcada' : ''}">${rico(x)}</li>`).join('')}</ol>`;
}

function desenhaChamado() {
  const t = T();
  const el = $('chamado');
  const m = selecionada;
  if (!m) {
    const tr = trilha(progress.trilha);
    const icones = ['terminal', 'pod', 'escudo', 'documento'];
    el.innerHTML = `<div class="boas-vindas"><img class="logo-grande" src="assets/logo.svg" alt=""><h1>${esc(t.bemVindo(tr.nome))}</h1><p><b>${esc(tr.titulo[L()])}</b> · ${esc(t.cursoBase(tr.curso))}</p>${t.intro.map((p) => `<p>${rico(p)}</p>`).join('')}<ul class="passos">${t.regras.map((r, i) => `<li>${icone(icones[i], 22)}${rico(r)}</li>`).join('')}</ul><p class="aviso">${rico(t.limite)}</p></div>`;
    return;
  }
  if (m.flash) return desenhaFlash(el);
  if (m.exam) return desenhaProva(el, m);
  const emCurso = ativa?.missao.id === m.id ? ativa : null;
  const p = progress.of(m.id);
  const cap = chapterOf(m.id);
  let html = banner(m.id, m.title[L()]);
  html += `<div class="etiqueta">${icone(temaDe(m.id), 14)}${esc(cap ? `${cap.guia ? 'G' : cap.id.slice(1)} · ${cap.title[L()]}` : '')}</div><h1>${esc(m.title[L()])}</h1>`;
  html += `<div class="meta"><span>${t.tempo}: <b>${m.minutes} ${t.min}</b></span><span>${t.dificuldade}: <b>${'●'.repeat(m.difficulty)}${'○'.repeat(3 - m.difficulty)}</b></span><span>XP: <b>${m.xp}</b></span>${p.tries ? `<span>${t.melhor}: <b>${p.xp} XP</b></span>` : ''}</div>`;
  html += `<p class="historia">${rico(m.story[L()])}</p>`;
  html += `<h3>${t.tarefas}</h3>${listaTarefas(m.id, m.tasks[L()])}`;
  const doc = DOCS[m.id];
  if (doc) {
    html += `<details class="docs"><summary>${icone('documento', 16)}${esc(t.docsTitulo)}</summary><p>${esc(t.docsGuia)}: <a href="${linkGuia(doc.guia)}" target="_blank" rel="noopener">${esc(GUIAS[doc.guia])}</a></p><p>${esc(t.docsTermos)}: ${doc.termos.map((x) => `<code>${esc(x)}</code>`).join(' · ')}</p><p class="nota">${esc(t.docsComo)}</p></details>`;
  }

  if (emCurso) {
    html += `<div class="botoes"><button type="button" class="primario" data-acao="corrigir">${t.corrigir}</button><button type="button" data-acao="dica" ${emCurso.dicas >= m.hints.length ? 'disabled' : ''}>${t.dica} (${emCurso.dicas}/${m.hints.length})</button><button type="button" data-acao="solucao" ${emCurso.tentativas ? '' : 'disabled'} title="${emCurso.tentativas ? t.custoSolucao : t.soApos}">${t.solucao}</button><button type="button" class="fantasma" data-acao="reiniciar">${t.reiniciar}</button><button type="button" class="fantasma" data-acao="encerrar">${t.encerrar}</button><span class="nota">${t.custoDica}</span></div>`;
    if (emCurso.resultado) {
      const { resultado, nota } = emCurso.resultado;
      html += `<h3>${t.resultado}</h3><ul class="resultado">${resultado.map((r) => `<li class="${r.ok ? 'ok' : 'falha'}">${esc(r.text[L()])}</li>`).join('')}</ul>`;
      html += `<div class="placar ${nota.passou ? 'ok' : 'falha'}">${nota.passou ? t.aprovado : t.parcial} · ${nota.acertos} ${t.de} ${nota.total} · ${nota.xp} XP</div>`;
    }
    if (emCurso.dicas) html += `<h3>${t.dicas}</h3>${m.hints.slice(0, emCurso.dicas).map((h, i) => `<div class="dica"><b>${i + 1}.</b> ${rico(h[L()])}</div>`).join('')}`;
    if (emCurso.viuSolucao) {
      html += `<h3>${t.solucao}</h3>${m.solution.map((s, i) => `<div class="passo"><p><b>${t.passo} ${i + 1}.</b> ${rico(s[L()])}</p><pre><span>${esc(s.cmd)}</span><button type="button" data-cmd="${i}">${t.executar}</button></pre></div>`).join('')}`;
    }
  } else {
    html += `<div class="botoes"><button type="button" class="primario" data-acao="iniciar">${t.iniciar}</button></div>`;
  }
  html += `<h3>${t.objetivos}</h3><div class="meta">${m.objectives.map((o) => `<span>· ${esc(objective(o, L()))}</span>`).join('')}</div>`;
  el.innerHTML = html;
}

function desenhaProva(el, m) {
  const t = T();
  const emCurso = ativa?.missao.id === m.id ? ativa : null;
  const p = progress.ofExam(m.id);
  let html = banner(m.id, m.title[L()]) + `<div class="etiqueta">${icone('trofeu', 14)}${t.modoProva}</div><h1>${esc(m.title[L()])}</h1>`;
  html += `<div class="meta"><span>${t.tempo}: <b>${m.minutes} ${t.min}</b></span><span>${t.tarefa}s: <b>${m.partes.length}</b></span><span>${t.nota}: <b>0–${NOTA_MAXIMA}</b>, ${t.corte} ${CORTE}</span>${p.tentativas ? `<span>${t.melhorNota}: <b>${p.melhor}</b></span>` : ''}</div>`;
  html += `<p class="historia">${rico(m.story[L()])}</p>`;
  if (emCurso?.entregue && emCurso.resultado?.exame) {
    const r = emCurso.resultado.exame;
    html += `<div class="placar ${r.passou ? 'ok' : 'falha'}">${r.passou ? t.aprovadoProva : t.reprovadoProva} · ${t.nota} ${r.nota} / ${NOTA_MAXIMA}</div>`;
    html += `<h3>${t.porDominio}</h3><ul class="dominios">${r.dominios.map((d) => {
      const cap = CHAPTERS.find((c) => c.id === d.id);
      return `<li><span>${esc(cap.title[L()])}</span><span class="barra-dominio"><span style="width:${d.pct}%"></span></span><b>${d.pct}%</b></li>`;
    }).join('')}</ul>`;
    html += `<h3>${t.porTarefa}</h3><ul class="resultado">${r.porParte.map((x, i) => `<li class="${x.ok === x.total ? 'ok' : 'falha'}">${t.tarefa} ${i + 1} · ${esc(byId(x.id).title[L()])} — ${x.ok}/${x.total}</li>`).join('')}</ul>`;
    html += `<div class="botoes"><button type="button" class="primario" data-acao="iniciar">${t.refazer}</button><button type="button" class="fantasma" data-acao="encerrar">${t.encerrar}</button></div>`;
  } else if (emCurso) {
    html += `<div class="botoes"><button type="button" class="primario" data-acao="entregar">${t.entregar}</button><button type="button" class="fantasma" data-acao="abandonar">${t.abandonar}</button></div>`;
  } else {
    html += `<ul>${t.regrasProva.map((r) => `<li>${rico(r)}</li>`).join('')}</ul><div class="botoes"><button type="button" class="primario" data-acao="iniciar">${t.iniciarProva}</button></div>`;
  }
  if (emCurso && !emCurso.entregue) {
    html += `<details class="docs"><summary>${esc(t.docsTitulo)}</summary><p>${esc(t.docsProva)} <a href="${indiceDocs()}" target="_blank" rel="noopener">docs.redhat.com · OpenShift ${VERSAO_DOCS}</a></p></details>`;
    m.partes.forEach((parte, i) => {
      html += `<h3>${t.tarefa} ${i + 1} · ${esc(parte.title[L()])}</h3><p class="historia">${rico(parte.story[L()])}</p>${listaTarefas(`${m.id}:${parte.id}`, parte.tasks[L()])}`;
    });
  }
  el.innerHTML = html;
}

// ------------------------------------------------------------- flashcards

const flash = { filtro: null, fila: null, virado: false, adiantado: false };

function montaFila() {
  const cards = cardsDa(progress.trilha, flash.filtro);
  const f = progress.flash;
  flash.fila = fila(cards, f.estados, Date.now(), f.novos);
  if (flash.adiantado && !flash.fila.length) {
    // Estudar adiantado: os próximos a vencer, mesmo antes da hora.
    flash.fila = cards.filter((c) => f.estados[c.id]).sort((a, b) => f.estados[a.id].vence - f.estados[b.id].vence).slice(0, 20);
  }
  flash.virado = false;
}

function quando(ms) {
  const min = Math.round((ms - Date.now()) / 60000);
  const pt = L() === 'pt';
  if (min < 60) return pt ? `em ${Math.max(1, min)} min` : `in ${Math.max(1, min)} min`;
  if (min < 1440) return pt ? `em ${Math.round(min / 60)} h` : `in ${Math.round(min / 60)} h`;
  return pt ? `em ${Math.round(min / 1440)} dias` : `in ${Math.round(min / 1440)} days`;
}

function desenhaFlash(el) {
  const t = T();
  const tr = trilha(progress.trilha);
  if (!flash.fila) montaFila();
  const estados = progress.flash.estados;
  const todos = cardsDa(tr.id, flash.filtro);
  const r = resumo(todos, estados);
  let html = banner(`flash-${tr.id}`, t.flash);
  html += `<div class="etiqueta">${icone('cartas', 14)}${t.flash} · ${tr.nome}</div><h1>${t.flash} ${tr.nome}</h1>`;
  html += `<div class="meta"><span>${t.novos}: <b>${r.novos}</b></span><span>${t.aprendendo}: <b>${r.aprendendo}</b></span><span>${t.revisar}: <b>${r.vencidos}</b></span><span>${t.dominados}: <b>${r.maduros}</b> / ${r.total}</span></div>`;
  html += `<div class="filtros">${[{ id: null, rotulo: t.todos }, ...tr.capitulos.filter((c) => !c.guia).map((c) => ({ id: c.id, rotulo: `${c.id.slice(1)} · ${c.title[L()]}` }))].map((f) => `<button type="button" class="chip${flash.filtro === f.id ? ' ativo' : ''}" data-filtro="${f.id ?? ''}">${esc(f.rotulo)}</button>`).join('')}</div>`;
  const card = flash.fila[0];
  if (!card) {
    const proximos = todos.map((c) => estados[c.id]?.vence).filter(Boolean).sort((a, b) => a - b);
    html += `<div class="flashcard vazio"><div class="fim">🎉</div><h2>${t.fim}</h2><p>${proximos.length ? t.fimProximo(quando(proximos[0])) : t.fimNada}</p><p class="nota">${t.limiteNovos(20)}</p>${proximos.length ? `<button type="button" data-flash="adiantar">${t.adiantar}</button>` : ''}</div>`;
    el.innerHTML = html;
    return;
  }
  const cap = tr.capitulos.find((c) => c.id === card.cap);
  const estado = estados[card.id] || novoEstado();
  const tipo = !estados[card.id] ? t.novos : estado.intervalo === 0 ? t.aprendendo : t.revisar;
  const v = flash.virado;
  const botaoOuvir = (lado) => (voz.suporta ? `<button type="button" class="ouvir" data-falar="${lado}" title="${t.ouvir}" aria-label="${t.ouvir}">${icone('som', 18)}</button>` : '');
  html += `<div class="flash-topo"><span class="chip-tipo">${esc(tipo)}</span><span>${icone(temaDe(cap?.missions[0]?.id || ''), 14)} ${esc(cap ? cap.title[L()] : '')}</span><span>${t.restam(flash.fila.length)}</span>${voz.suporta ? `<label class="auto-leitura"><input type="checkbox" data-auto-leitura${voz.auto ? ' checked' : ''}> ${t.autoLeitura}</label>` : ''}</div>
  <div class="pilha${v ? ' virada' : ''}" data-id-card="${esc(card.id)}">
    <div class="pilha-fundo um" aria-hidden="true"></div>
    <div class="pilha-fundo dois" aria-hidden="true"></div>
    <div class="carta" data-flash="virar" role="button" tabindex="0" aria-label="${v ? t.cliqueVoltar : t.virar}">
      <div class="face frente" aria-hidden="${v}">
        ${botaoOuvir('q')}
        <div class="flash-rotulo">${t.pergunta}</div>
        <div class="flash-pergunta">${rico(card.q[L()])}</div>
        <div class="face-rodape">${t.cliqueVirar}<span class="atalhos"> · <kbd>${t.atalhoVirar}</kbd> · <kbd>${t.atalhoOuvir}</kbd></span></div>
      </div>
      <div class="face verso" aria-hidden="${!v}">
        ${botaoOuvir('a')}
        <div class="flash-rotulo">${t.resposta}</div>
        <div class="flash-resposta">${rico(card.a[L()])}</div>
        <div class="face-rodape">${t.cliqueVoltar}</div>
      </div>
    </div>
  </div>`;
  html += `<div class="notas-flash${v ? ' visivel' : ''}" aria-hidden="${!v}">${t.notas.map((n, i) => `<button type="button" class="nota-${i}" data-nota="${i}"${v ? '' : ' tabindex="-1"'}><span>${n}</span><small>${rotuloIntervalo(estado, i)}</small><kbd>${i + 1}</kbd></button>`).join('')}</div>`;
  if (cap?.missions[0]) html += `<p class="praticar"><button type="button" class="fantasma" data-praticar="${cap.missions[0].id}">${icone('terminal', 15)} ${t.praticar}: ${esc(cap.title[L()])}</button></p>`;
  html += `<p class="nota flash-dica">${t.flashIntro}</p>`;
  const novoCard = voz.ultimo !== card.id;
  el.innerHTML = html;
  // Leitura automática: lê a pergunta quando um cartão novo aparece.
  if (novoCard) {
    voz.ultimo = card.id;
    voz.para();
    if (voz.auto && !v) voz.falaCard(card, 'q');
  }
}

// Leitura em voz alta: áudio gravado em inglês ou a melhor voz do sistema.
const voz = criaVoz(() => L());

// Lê a face que está visível.
function ouvirFlash(lado) {
  const card = flash.fila?.[0];
  if (!card) return;
  const qual = lado || (flash.virado ? 'a' : 'q');
  voz.falaCard(card, qual);
}

function notaFlash(nota) {
  const card = flash.fila?.[0];
  if (!card || !flash.virado) return;
  const estados = progress.flash.estados;
  const eraNovo = !estados[card.id];
  const novo = responde(estados[card.id] || novoEstado(), nota);
  progress.gravaCard(card.id, novo, eraNovo);
  flash.fila.shift();
  // Ainda em aprendizado e vencendo nesta sessão: volta para o fim da fila.
  if (novo.intervalo === 0) flash.fila.push(card);
  flash.virado = false;
  desenha();
}

// Vira o cartão nos dois sentidos, sem redesenhar, para a animação 3D aparecer.
function virarFlash() {
  const card = flash.fila?.[0];
  if (!card) return;
  flash.virado = !flash.virado;
  const v = flash.virado;
  const t = T();
  $('chamado').querySelector('.pilha')?.classList.toggle('virada', v);
  $('chamado').querySelector('.frente')?.setAttribute('aria-hidden', String(v));
  $('chamado').querySelector('.verso')?.setAttribute('aria-hidden', String(!v));
  $('chamado').querySelector('.carta')?.setAttribute('aria-label', v ? t.cliqueVoltar : t.virar);
  const notas = $('chamado').querySelector('.notas-flash');
  if (notas) {
    notas.classList.toggle('visivel', v);
    notas.setAttribute('aria-hidden', String(!v));
    notas.querySelectorAll('button').forEach((b) => (v ? b.removeAttribute('tabindex') : b.setAttribute('tabindex', '-1')));
  }
  voz.para();
  if (voz.auto) voz.falaCard(card, v ? 'a' : 'q');
}

function desenhaRelogio() {
  const r = $('relogio');
  if (!ativa) {
    r.textContent = '';
    $('console-titulo').textContent = 'workstation';
    return;
  }
  const s = ativa.segundos;
  if (ativa.missao.exam) {
    const resta = Math.max(0, ativa.missao.minutes * 60 - s);
    const hh = Math.floor(resta / 3600);
    r.textContent = ativa.entregue ? '' : `${hh}:${String(Math.floor((resta % 3600) / 60)).padStart(2, '0')}:${String(resta % 60).padStart(2, '0')} ${T().restante}`;
    r.classList.toggle('estourou', resta < 900);
    $('console-titulo').textContent = `student@workstation · ${ativa.missao.title[L()]}`;
    return;
  }
  r.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')} / ${ativa.missao.minutes}:00`;
  r.classList.toggle('estourou', s > ativa.missao.minutes * 60);
  $('console-titulo').textContent = `student@workstation · ${ativa.missao.id}`;
}

function desenha() {
  // Nos flashcards o terminal sai de cena e o card ocupa o painel todo.
  document.body.classList.toggle('modo-flash', Boolean(selecionada?.flash));
  if (!selecionada?.flash) {
    voz.para();
    voz.ultimo = null;
  }
  desenhaTopo();
  desenhaLista();
  desenhaChamado();
  desenhaRelogio();
}

// ----------------------------------------------------------------- eventos

$('lista').addEventListener('click', (e) => {
  if (e.target.closest('#btn-zerar')) {
    if (confirm(T().confirmaZerar)) {
      progress.reset();
      encerrar();
    }
    return;
  }
  const b = e.target.closest('.missao');
  if (!b) return;
  selecionada = b.dataset.id === 'flash' ? { flash: true, id: 'flash' } : byId(b.dataset.id);
  if (selecionada.flash) flash.fila = null;
  desenha();
  $('chamado').scrollTop = 0;
});

$('chamado').addEventListener('click', async (e) => {
  const filtro = e.target.closest('[data-filtro]');
  if (filtro) {
    flash.filtro = filtro.dataset.filtro || null;
    flash.adiantado = false;
    montaFila();
    desenhaChamado();
    return;
  }
  const nota = e.target.closest('[data-nota]');
  if (nota) return notaFlash(Number(nota.dataset.nota));
  const praticar = e.target.closest('[data-praticar]');
  if (praticar) {
    selecionada = byId(praticar.dataset.praticar);
    desenha();
    $('chamado').scrollTop = 0;
    return;
  }
  const falar = e.target.closest('[data-falar]');
  if (falar) return ouvirFlash(falar.dataset.falar);
  if (e.target.closest('.auto-leitura')) return;
  const acaoFlash = e.target.closest('[data-flash]')?.dataset.flash;
  if (acaoFlash === 'virar') return virarFlash();
  if (acaoFlash === 'adiantar') {
    flash.adiantado = true;
    montaFila();
    desenhaChamado();
    return;
  }
  const tarefa = e.target.closest('.tarefas li');
  if (tarefa && !e.target.closest('a')) {
    const chave = tarefa.parentElement.dataset.chave;
    const i = Number(tarefa.dataset.i);
    const todas = marcadas();
    const lista = new Set(todas[chave] || []);
    lista.has(i) ? lista.delete(i) : lista.add(i);
    todas[chave] = [...lista];
    try {
      localStorage.setItem(CHAVE_TAREFAS, JSON.stringify(todas));
    } catch { /* sem armazenamento: só não lembra */ }
    tarefa.classList.toggle('marcada');
    return;
  }
  const cmd = e.target.closest('[data-cmd]');
  if (cmd && ativa) {
    await term.type(ativa.missao.solution[Number(cmd.dataset.cmd)].cmd);
    term.focus();
    return;
  }
  const acao = e.target.closest('[data-acao]')?.dataset.acao;
  if (!acao) return;
  if (acao === 'iniciar' || acao === 'reiniciar') await iniciar(selecionada);
  else if (acao === 'encerrar') encerrar();
  else if (acao === 'entregar') {
    if (confirm(T().confirmaEntregar)) await entregar();
  } else if (acao === 'abandonar') {
    if (confirm(T().confirmaAbandonar)) encerrar();
  }
  else if (acao === 'corrigir') await corrigir();
  else if (acao === 'dica') {
    ativa.dicas = Math.min(ativa.dicas + 1, ativa.missao.hints.length);
    salvaSessao();
    desenha();
  } else if (acao === 'solucao') {
    ativa.viuSolucao = true;
    salvaSessao();
    desenha();
  }
});

$('trilhas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-trilha]');
  if (!b || b.dataset.trilha === progress.trilha) return;
  progress.trilha = b.dataset.trilha;
  flash.fila = null;
  flash.filtro = null;
  // A missão em andamento continua; só a lista muda.
  if (selecionada && !selecionada.flash && selecionada.trilha !== progress.trilha) selecionada = ativa && ativa.missao.trilha === progress.trilha ? ativa.missao : null;
  desenha();
  $('chamado').scrollTop = 0;
});

$('btn-idioma').addEventListener('click', () => {
  progress.lang = progress.lang === 'en' ? 'pt-BR' : 'en';
  if (ativa) ativa.world.env.lang = progress.lang;
  else term.detach(T().terminalParado);
  desenha();
});

term.onCommand = () => salvaSessao();

document.addEventListener('change', (e) => {
  if (e.target.matches?.('[data-auto-leitura]')) {
    voz.defineAuto(e.target.checked);
    if (voz.auto) ouvirFlash();
    else voz.para();
  }
});

// Atalhos dos flashcards: Espaço vira (nos dois sentidos), L lê em voz alta, 1 a 4 respondem (fora do terminal e do editor).
document.addEventListener('keydown', (e) => {
  if (!selecionada?.flash || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest?.('.terminal, textarea, input, .editor')) return;
  if (e.key === ' ' || e.key === 'Enter') {
    // Em outros botões o Espaço continua clicando neles; no de áudio, vira o cartão.
    if (e.target.closest?.('button:not(.ouvir), label')) return;
    e.preventDefault();
    virarFlash();
  } else if (e.key === 'l' || e.key === 'L') {
    e.preventDefault();
    ouvirFlash();
  } else if (flash.virado && ['1', '2', '3', '4'].includes(e.key)) {
    e.preventDefault();
    notaFlash(Number(e.key) - 1);
  }
});

// O relógio do cluster simulado anda em tempo real enquanto há missão ativa.
setInterval(() => {
  if (!ativa || ativa.entregue) return;
  // O cluster anda mesmo com a aba oculta, para não travar comandos que esperam.
  ativa.world.cluster.tick(1);
  if (document.hidden) return;
  ativa.segundos++;
  desenhaRelogio();
  if (ativa.segundos % 15 === 0) salvaSessao();
  if (ativa.missao.exam && ativa.segundos >= ativa.missao.minutes * 60) {
    entregar().then(() => alert(T().tempoEsgotado));
  }
}, 1000);

retomar();
if (!ativa) term.detach(T().terminalParado);
if (!selecionada) selecionada = null;
desenha();

// Acesso para depuração e para os testes de interface.
window.terminauta = { term, get ativa() { return ativa; }, MISSIONS };
