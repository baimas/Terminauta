// Shell virtual: aspas, variáveis, $(...), pipes, redirecionamentos, heredoc,
// && / || / ; . Cada comando é uma função assíncrona registrada em `cmds`.
import { HOME } from './fs.js';
import { ApiError } from './cluster.js';
import { builtins } from './builtins.js';
import { oc, skopeo } from './oc/index.js';
import { tar, script, chmod, which, sudo, source, file, noPath, BINARIO_OC, PATH_PADRAO } from './arquivos.js';
import { curl } from './curl.js';
import { helm } from './helm.js';
import { htpasswd } from './rbac.js';
import { openssl } from './tls.js';
import { nc, mysql, psql } from './tcp.js';
import { contextoUtility } from './pod.js';

// `ssh utility`: abre uma sessão no host utility do laboratório.
async function ssh({ args, sh, env }) {
  const pos = args.filter((a) => !a.startsWith('-'));
  const host = (pos[0] || '').split('@').pop();
  if (!['utility', 'utility.lab.example.com'].includes(host)) return { err: `ssh: Could not resolve hostname ${host || '(none)'}: Name or service not known\n`, code: 255 };
  if (sh.pod) return { err: 'ssh: nested sessions are not simulated\n', code: 255 };
  // `ssh utility COMANDO` roda o comando no host e volta.
  if (pos.length > 1) return sh.noPod(contextoUtility(env), () => sh.run(pos.slice(1).join(' '), { sub: true }));
  sh.entraPod(contextoUtility(env));
  return { out: 'Register this system with Red Hat Insights: rhc connect\nLast login: from 172.25.250.9\n', code: 0 };
}

const OPS = ['2>&1', '&&', '||', '>>', '2>', '|', ';', '>', '<'];
const MARCA = '\u0001';

export class Abort extends Error {}

// `exit` dentro de um `oc exec` não interativo encerra o script.
class SaidaPod extends Error {
  constructor(code) {
    super('exit');
    this.code = code;
  }
}

function extraiHeredocs(src) {
  const linhas = src.split('\n');
  const docs = [];
  const saida = [];
  for (let i = 0; i < linhas.length; i++) {
    let l = linhas[i];
    const m = l.includes('<<<') ? null : l.match(/<<(-?)\s*(['"]?)([A-Za-z_]\w*)\2/);
    if (m) {
      const corpo = [];
      let j = i + 1;
      let fechou = false;
      for (; j < linhas.length; j++) {
        const t = m[1] ? linhas[j].replace(/^\t+/, '') : linhas[j];
        if (t.trim() === m[3]) {
          fechou = true;
          break;
        }
        corpo.push(t);
      }
      if (!fechou) return { incompleto: true };
      docs.push({ texto: corpo.length ? corpo.join('\n') + '\n' : '', literal: Boolean(m[2]) });
      l = l.replace(m[0], ` ${MARCA}${docs.length - 1}${MARCA} `);
      i = j;
    }
    saida.push(l);
  }
  return { src: saida.join('\n'), docs };
}

export class Shell {
  constructor(env) {
    this.env = env;
    this.cwd = HOME;
    this.vars = { HOME, USER: 'student', HOSTNAME: 'workstation', PATH: PATH_PADRAO, '?': '0' };
    this.history = [];
    this.cmds = { ...builtins, oc, kubectl: oc, skopeo, curl, helm, htpasswd, openssl, nc, ncat: nc, mysql, mariadb: mysql, psql, ssh, tar, script, chmod, which, sudo, source, '.': source, file };
    this.pod = null; // contexto do contêiner quando se está dentro de `oc rsh`
    this.salvo = null;
  }

  // Entra no shell de um contêiner; `exit` volta para a estação de trabalho.
  entraPod(contexto) {
    this.salvoHost = Boolean(contexto.hostExterno);
    this.salvo = { cwd: this.cwd, vars: this.vars, cmds: this.cmds };
    this.pod = contexto;
    this.cwd = contexto.cwd;
    this.vars = contexto.vars;
    this.cmds = contexto.cmds;
  }

  saiPod(code = 0) {
    if (!this.pod) return;
    if (this.pod.naoInterativo) throw new SaidaPod(code);
    const aoSair = this.pod.aoSair;
    Object.assign(this, this.salvo);
    this.pod = null;
    this.salvo = null;
    this.vars['?'] = String(code);
    // `oc run --rm -it`: o pod é apagado quando a sessão termina.
    if (aoSair) {
      this.env.write?.(code ? `exit\n${aoSair()}` : `exit\n${aoSair()}`);
      return;
    }
    if (this.salvoHost) {
      this.salvoHost = false;
      this.env.write?.('logout\nConnection to utility closed.\n');
      return;
    }
    this.env.write?.(code ? `exit\ncommand terminated with exit code ${code}\n` : 'exit\n');
  }

  // Executa `fn` dentro do contêiner e volta ao estado anterior.
  async noPod(contexto, fn) {
    const antes = { pod: this.pod, salvo: this.salvo, cwd: this.cwd, vars: this.vars, cmds: this.cmds };
    this.entraPod({ ...contexto, naoInterativo: true });
    try {
      return await fn();
    } catch (e) {
      if (e instanceof SaidaPod) return { out: e.out || '', code: e.code };
      throw e;
    } finally {
      Object.assign(this, antes);
    }
  }

  // Diretório da estação de trabalho, mesmo com uma sessão no pod aberta.
  // Variáveis da estação de trabalho (fora de um `oc rsh`), salvas com a sessão.
  varsEstacao() {
    return { ...(this.pod ? this.salvo.vars : this.vars) };
  }

  cwdEstacao() {
    return this.salvo ? this.salvo.cwd : this.cwd;
  }

  envAtual() {
    return this.pod ? this.pod.env : this.env;
  }

  // Se o pod sumiu ou parou, a sessão remota cai.
  verificaPod() {
    if (!this.pod || this.pod.naoInterativo || this.pod.hostExterno) return null;
    const p = this.env.cluster.get('Pod', this.pod.nome, this.pod.ns);
    const vivo = p && p.metadata.uid === this.pod.pod.metadata.uid && p.status.containerStatuses?.find((x) => x.name === this.pod.container)?.state.running;
    if (vivo) return null;
    Object.assign(this, this.salvo);
    this.pod = null;
    this.salvo = null;
    return { out: 'command terminated with exit code 137\n', code: 137 };
  }

  prompt() {
    if (this.pod?.prompt) return this.pod.prompt;
    if (this.pod) return `${this.pod.shell}-5.1$ `;
    const dir = this.cwd === HOME ? '~' : this.cwd.split('/').pop() || '/';
    return `[student@workstation ${dir}]$ `;
  }

  // Indica se a entrada ainda precisa de mais linhas (aspas ou heredoc abertos).
  needsMore(src) {
    if (extraiHeredocs(src).incompleto) return true;
    let aspas = null;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (aspas) {
        if (ch === '\\' && aspas === '"') i++;
        else if (ch === aspas) aspas = null;
      } else if (ch === '\\') i++;
      else if (ch === '"' || ch === "'") aspas = ch;
    }
    if (aspas) return true;
    return /(\\|\||&&)\s*$/.test(src);
  }

  expandeVars(txt) {
    return txt.replace(/\$\{(\w+)\}|\$(\w+|\?)/g, (_, a, b) => this.vars[a || b] ?? '');
  }

  async expande(src, i) {
    if (src[i + 1] === '(') {
      let nivel = 1;
      let j = i + 2;
      for (; j < src.length && nivel > 0; j++) {
        if (src[j] === '(') nivel++;
        if (src[j] === ')') nivel--;
      }
      const r = await this.run(src.slice(i + 2, j - 1), { sub: true });
      return [r.out.replace(/\n+$/, ''), j];
    }
    if (src[i + 1] === '{') {
      const fim = src.indexOf('}', i);
      return [this.vars[src.slice(i + 2, fim)] ?? '', fim + 1];
    }
    const m = src.slice(i + 1).match(/^(\w+|\?)/);
    if (!m) return ['$', i + 1];
    return [this.vars[m[1]] ?? '', i + 1 + m[1].length];
  }

  async tokens(src) {
    const out = [];
    let cur = null;
    let glob = false; // `*` ou `?` sem aspas na palavra atual
    const fecha = () => {
      if (cur !== null) {
        const achados = glob && !this.pod ? this.globa(cur) : null;
        if (achados) for (const a of achados) out.push({ t: 'w', v: a });
        else out.push({ t: 'w', v: cur });
        cur = null;
      }
      glob = false;
    };
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === "'") {
        const j = src.indexOf("'", i + 1);
        cur = (cur ?? '') + src.slice(i + 1, j);
        i = j + 1;
      } else if (c === '"') {
        i++;
        cur = cur ?? '';
        while (i < src.length && src[i] !== '"') {
          if (src[i] === '\\' && '"\\$`\n'.includes(src[i + 1])) {
            if (src[i + 1] !== '\n') cur += src[i + 1];
            i += 2;
          } else if (src[i] === '$') {
            const [val, ni] = await this.expande(src, i);
            cur += val;
            i = ni;
          } else cur += src[i++];
        }
        i++;
      } else if (c === '\\') {
        if (src[i + 1] !== '\n') cur = (cur ?? '') + (src[i + 1] ?? '');
        i += 2;
      } else if (c === '$') {
        const [val, ni] = await this.expande(src, i);
        i = ni;
        const pedacos = val.split(/\s+/);
        if (pedacos.length === 1) cur = (cur ?? '') + pedacos[0];
        else {
          pedacos.forEach((p, n) => {
            if (n > 0) fecha();
            if (p) cur = (cur ?? '') + p;
          });
        }
      } else if (c === '\n') {
        fecha();
        out.push({ t: 'op', v: ';' });
        i++;
      } else if (/\s/.test(c)) {
        fecha();
        i++;
      } else if (c === '#' && cur === null) {
        while (i < src.length && src[i] !== '\n') i++;
      } else if (c === '~' && cur === null && (src[i + 1] === undefined || /[\s/]/.test(src[i + 1]))) {
        cur = HOME;
        i++;
      } else {
        const op = OPS.find((o) => src.startsWith(o, i) && !(o === '2>' && cur !== null) && !(o === '2>&1' && cur !== null));
        if (op) {
          fecha();
          out.push({ t: 'op', v: op });
          i += op.length;
        } else {
          if (c === '*' || c === '?') glob = true;
          cur = (cur ?? '') + c;
          i++;
        }
      }
    }
    fecha();
    return out;
  }

  // Expande `*` e `?` no último trecho do caminho, como o bash: sem
  // correspondência, a palavra segue literal (devolve null).
  globa(padrao) {
    const fs = this.env.fs;
    const barra = padrao.lastIndexOf('/');
    const dir = barra >= 0 ? padrao.slice(0, barra + 1) : '';
    const base = padrao.slice(barra + 1);
    if (/[*?]/.test(dir)) return null;
    const pasta = fs.resolve(this.cwd, dir || '.');
    if (!fs.isDir(pasta)) return null;
    const re = new RegExp(`^${base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
    const nomes = fs.ls(pasta).filter((n) => re.test(n) && (base.startsWith('.') || !n.startsWith('.'))).sort();
    return nomes.length ? nomes.map((n) => dir + n) : null;
  }

  async run(fonte, { sub = false } = {}) {
    if (!sub) {
      const caiu = this.verificaPod();
      if (caiu) return caiu;
    }
    const h = extraiHeredocs(fonte);
    if (h.incompleto) return { out: 'bash: unexpected end of file\n', code: 2 };
    let toks;
    try {
      toks = await this.tokens(h.src);
    } catch (e) {
      if (e instanceof Abort) throw e;
      return { out: `bash: ${e.message}\n`, code: 2 };
    }

    // Monta a lista de pipelines.
    const lista = [];
    let pipeline = [];
    let cmd = { argv: [] };
    let conector = ';';
    const fechaCmd = () => {
      if (cmd.argv.length || cmd.stdin !== undefined) pipeline.push(cmd);
      cmd = { argv: [] };
    };
    const fechaPipeline = (proximo) => {
      fechaCmd();
      if (pipeline.length) lista.push({ conector, cmds: pipeline });
      pipeline = [];
      conector = proximo;
    };
    for (let i = 0; i < toks.length; i++) {
      const k = toks[i];
      if (k.t === 'w') {
        const m = k.v.match(new RegExp(`^${MARCA}(\\d+)${MARCA}$`));
        if (m) {
          const doc = h.docs[Number(m[1])];
          cmd.stdin = doc.literal ? doc.texto : this.expandeVars(doc.texto);
        } else cmd.argv.push(k.v);
        continue;
      }
      if (k.v === '|') fechaCmd();
      else if (k.v === ';' || k.v === '&&' || k.v === '||') fechaPipeline(k.v);
      else if (k.v === '2>&1') cmd.junta = true;
      else {
        const alvo = toks[++i];
        if (!alvo || alvo.t !== 'w') return { out: 'bash: syntax error near unexpected token `newline\'\n', code: 2 };
        if (k.v === '>') cmd.saida = { arq: alvo.v };
        if (k.v === '>>') cmd.saida = { arq: alvo.v, anexa: true };
        if (k.v === '2>') cmd.erro = alvo.v;
        if (k.v === '<') cmd.entrada = alvo.v;
      }
    }
    fechaPipeline(';');

    let out = '';
    let code = 0;
    for (const p of lista) {
      if (p.conector === '&&' && code !== 0) continue;
      if (p.conector === '||' && code === 0) continue;
      let r;
      try {
        r = await this.pipeline(p.cmds);
      } catch (e) {
        // `exit` dentro do pod: preserva o que já foi impresso.
        if (e instanceof SaidaPod) e.out = out + (e.out || '');
        throw e;
      }
      // No terminal, cada comando da lista aparece assim que termina.
      if (!sub && this.env.write) this.env.write(r.out);
      else out += r.out;
      code = r.code;
      if (!sub) this.vars['?'] = String(code);
    }
    return { out, code };
  }

  grava(arq, texto, anexa) {
    if (arq === '/dev/null') return null;
    const fs = this.envAtual().fs;
    const caminho = fs.resolve(this.cwd, arq);
    try {
      fs.write(caminho, (anexa && fs.isFile(caminho) ? fs.read(caminho) : '') + texto);
      return null;
    } catch (e) {
      return `bash: ${arq}: ${e.message}\n`;
    }
  }

  async pipeline(cmds) {
    let stdin = '';
    let combinado = '';
    let code = 0;
    for (let i = 0; i < cmds.length; i++) {
      const cmd = cmds[i];
      if (cmd.stdin !== undefined) stdin = cmd.stdin;
      if (cmd.entrada) {
        try {
          stdin = this.envAtual().fs.read(this.envAtual().fs.resolve(this.cwd, cmd.entrada));
        } catch (e) {
          combinado += `bash: ${cmd.entrada}: ${e.message}\n`;
          code = 1;
          stdin = '';
          continue;
        }
      }
      const r = await this.exec(cmd.argv, stdin);
      let saida = r.out || '';
      // `fim` é saída de erro emitida depois da saída normal (ex.: "command terminated").
      let erro = r.err || '';
      let erroFim = r.fim || '';
      code = r.code || 0;
      if (cmd.junta) {
        saida = erro + saida + erroFim;
        erro = '';
        erroFim = '';
      }
      if (cmd.erro !== undefined) {
        const falha = this.grava(cmd.erro, erro + erroFim, false);
        erro = falha || '';
        erroFim = '';
      }
      if (cmd.saida) {
        const falha = this.grava(cmd.saida.arq, saida, cmd.saida.anexa);
        if (falha) {
          erro += falha;
          code = 1;
        }
        saida = '';
      }
      combinado += erro;
      if (i === cmds.length - 1) combinado += saida;
      else stdin = saida;
      combinado += erroFim;
    }
    return { out: combinado, code };
  }

  async exec(argv, stdin) {
    // Atribuições no início: VAR=valor [comando...]
    while (argv.length && /^[A-Za-z_]\w*=/.test(argv[0])) {
      const [nome, ...resto] = argv[0].split('=');
      this.vars[nome] = resto.join('=');
      argv = argv.slice(1);
    }
    if (!argv.length) return { code: 0 };
    // Dentro do contêiner, /bin/ls e /usr/bin/ls são o mesmo `ls`.
    let nome = this.pod ? argv[0].replace(/^(\/usr)?\/s?bin\//, '') : argv[0];
    // O `oc` baixado do cluster: `./oc`, `~/bin/oc` ou pelo PATH.
    if (!this.pod) {
      const fs = this.env.fs;
      if (nome.includes('/')) {
        const p = fs.resolve(this.cwd, nome);
        if (fs.isFile(p) && fs.read(p) === BINARIO_OC) nome = 'oc';
        else if (fs.isDir(p)) return { err: `bash: ${argv[0]}: Is a directory\n`, code: 126 };
        else if (fs.isFile(p)) return { err: `bash: ${argv[0]}: Permission denied\n`, code: 126 };
        else if (/^(\/usr)?\/s?bin\//.test(nome) && this.cmds[nome.split('/').pop()]) nome = nome.split('/').pop();
        else return { err: `bash: ${argv[0]}: No such file or directory\n`, code: 127 };
      } else if ((nome === 'oc' || nome === 'kubectl') && this.env.cluster.side?.semOc) {
        const p = noPath(this, fs, 'oc');
        if (!p || fs.read(p) !== BINARIO_OC) return { err: `bash: ${nome}: command not found\n`, code: 127 };
      }
    }
    const fn = this.cmds[nome];
    if (!fn) return { err: `${this.pod ? 'sh' : 'bash'}: ${argv[0]}: command not found\n`, code: 127 };
    try {
      const r = await fn({ args: argv.slice(1), stdin, sh: this, env: this.envAtual(), nome });
      if (typeof r === 'string') return { out: r, code: 0 };
      return r || { code: 0 };
    } catch (e) {
      if (e instanceof Abort || e instanceof SaidaPod) throw e;
      if (e instanceof ApiError) return { err: e.message + '\n', code: 1 };
      console.error(e);
      return { err: `[simulador] erro interno em "${argv[0]}": ${e.message}\n`, code: 70 };
    }
  }
}
