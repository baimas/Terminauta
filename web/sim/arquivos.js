// Comandos de arquivos da estação de trabalho usados no DO180: tar, chmod,
// which, sudo, source e file. O `tar` guarda os arquivos num texto JSON com uma
// marca do simulador, para poder extrair depois.
const ok = (out = '') => ({ out, code: 0 });
const falha = (msg, code = 1) => ({ err: msg + '\n', code });

export const MARCA_TAR = 'LABGAME-TAR\n';
// Conteúdo do binário `oc` baixado do cluster.
export const BINARIO_OC = '\x7fELF LABGAME oc 4.22.22 (linux/amd64)\n';
export const PATH_PADRAO = '/home/student/.local/bin:/home/student/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin';

export const ehTar = (texto) => typeof texto === 'string' && texto.startsWith(MARCA_TAR);
export const leTar = (texto) => JSON.parse(texto.slice(MARCA_TAR.length));
export const montaTar = (arquivos, dirs = []) => MARCA_TAR + JSON.stringify({ arquivos, dirs });

// Separa as letras de `tar cvzf x.tgz dir`, `tar -xvf x`, `tar --extract`...
function opcoesTar(args) {
  const o = { modo: null, v: false, arquivo: null, dir: null, alvos: [] };
  const letras = (s) => {
    for (const ch of s) {
      if ('cxt'.includes(ch)) o.modo = ch;
      else if (ch === 'v') o.v = true;
      else if (ch === 'f') o.querArquivo = true;
      else if (ch === 'C') o.querDir = true;
      else if (!'zjJap'.includes(ch)) return ch;
    }
    return null;
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (o.querArquivo) {
      o.arquivo = a;
      o.querArquivo = false;
      continue;
    }
    if (o.querDir) {
      o.dir = a;
      o.querDir = false;
      continue;
    }
    if (a === '--create') o.modo = 'c';
    else if (a === '--extract' || a === '--get') o.modo = 'x';
    else if (a === '--list') o.modo = 't';
    else if (a === '--verbose') o.v = true;
    else if (a.startsWith('--file=')) o.arquivo = a.slice(7);
    else if (a === '--file') o.querArquivo = true;
    else if (a.startsWith('--directory=')) o.dir = a.slice(12);
    else if (['--gzip', '--auto-compress', '--xz', '--bzip2'].includes(a)) continue;
    else if (a.startsWith('-')) {
      const ruim = letras(a.slice(1));
      if (ruim) return { erro: `tar: invalid option -- '${ruim}'\nTry 'tar --help' or 'tar --usage' for more information.` };
    } else if (i === 0 && /^[cxtvfzjJaC]+$/.test(a)) {
      const ruim = letras(a);
      if (ruim) return { erro: `tar: invalid option -- '${ruim}'` };
    } else o.alvos.push(a);
  }
  return o;
}

export function tar(ctx) {
  const fs = ctx.env.fs;
  const o = opcoesTar(ctx.args);
  if (o.erro) return falha(o.erro, 2);
  if (!o.modo) return falha("tar: You must specify one of the '-Acdtrux', '--delete' or '--test-label' options\nTry 'tar --help' or 'tar --usage' for more information.", 2);
  const base = o.dir ? fs.resolve(ctx.sh.cwd, o.dir) : ctx.sh.cwd;
  if (o.modo === 'c') {
    if (!o.arquivo) return falha('tar: Refusing to write archive contents to terminal (missing -f option?)\ntar: Error is not recoverable: exiting now', 2);
    if (!o.alvos.length) return falha('tar: Cowardly refusing to create an empty archive\nTry \'tar --help\' or \'tar --usage\' for more information.', 2);
    const arquivos = {};
    const dirs = [];
    const lista = [];
    for (const alvo of o.alvos) {
      const p = fs.resolve(base, alvo);
      const rel = alvo.replace(/^\/+/, '').replace(/\/+$/, '');
      if (fs.isFile(p)) {
        arquivos[rel] = fs.read(p);
        lista.push(rel);
      } else if (fs.isDir(p)) {
        dirs.push(rel);
        lista.push(rel + '/');
        for (const d of [...fs.dirs].filter((x) => x.startsWith(p + '/')).sort()) {
          dirs.push(rel + d.slice(p.length));
          lista.push(rel + d.slice(p.length) + '/');
        }
        for (const f of fs.walk(p)) {
          arquivos[rel + f.slice(p.length)] = fs.read(f);
          lista.push(rel + f.slice(p.length));
        }
      } else return falha(`tar: ${alvo}: Cannot stat: No such file or directory\ntar: Exiting with failure status due to previous errors`, 2);
    }
    try {
      fs.write(fs.resolve(ctx.sh.cwd, o.arquivo), montaTar(arquivos, dirs));
    } catch (e) {
      return falha(`tar: ${o.arquivo}: Cannot open: ${e.message}`, 2);
    }
    return ok(o.v ? lista.sort().join('\n') + '\n' : '');
  }
  if (!o.arquivo) return falha('tar: Refusing to read archive contents from terminal (missing -f option?)\ntar: Error is not recoverable: exiting now', 2);
  const caminho = fs.resolve(ctx.sh.cwd, o.arquivo);
  if (!fs.isFile(caminho)) return falha(`tar: ${o.arquivo}: Cannot open: No such file or directory\ntar: Error is not recoverable: exiting now`, 2);
  const texto = fs.read(caminho);
  if (!ehTar(texto)) return falha('tar: This does not look like a tar archive\ntar: Exiting with failure status due to previous errors', 2);
  const { arquivos, dirs } = leTar(texto);
  const nomes = [...dirs.map((d) => d + '/'), ...Object.keys(arquivos)].sort();
  if (o.modo === 't') {
    if (!o.v) return ok(nomes.join('\n') + '\n');
    return ok(nomes.map((n) => `${n.endsWith('/') ? 'drwxr-xr-x' : '-rwxr-xr-x'} student/student ${String(n.endsWith('/') ? 0 : (arquivos[n] || '').length).padStart(8)} 2026-11-18 09:00 ${n}`).join('\n') + '\n');
  }
  for (const d of dirs) fs.mkdir(fs.resolve(base, d), true);
  for (const [n, conteudo] of Object.entries(arquivos)) {
    const destino = fs.resolve(base, n);
    try {
      fs.mkdir(fs.pai(destino), true);
      fs.write(destino, conteudo);
    } catch (e) {
      return falha(`tar: ${n}: Cannot open: ${e.message}`, 2);
    }
  }
  return ok(o.v ? nomes.join('\n') + '\n' : '');
}

// /usr/bin/script do laboratório: envia ao suporte da Red Hat o pacote de
// diagnóstico (`system10-<id do cluster>.tar.gz`, feito com `tar` a partir da
// pasta do must-gather) e registra o envio no cluster.
export function script(ctx) {
  const fs = ctx.env.fs;
  const c = ctx.env.cluster;
  const arq = ctx.args.find((a) => !a.startsWith('-'));
  if (!arq) return falha('Usage: /usr/bin/script system10-<cluster-id>.tar.gz');
  const caminho = fs.resolve(ctx.sh.cwd, arq);
  if (!fs.isFile(caminho)) return falha(`script: ${arq}: No such file or directory`);
  const id = c.get('ClusterVersion', 'version')?.spec.clusterID;
  const m = arq.split('/').pop().match(/^system10-(.+)\.tar\.gz$/);
  if (!m) return falha(`script: ${arq}: the file name must be system10-<cluster-id>.tar.gz`);
  if (m[1] !== id) return falha(`script: cluster id "${m[1]}" does not match this cluster (${id})`);
  const texto = fs.read(caminho);
  if (!ehTar(texto)) return falha(`script: ${arq}: not a tar archive (create it with: tar cvaf ${arq.split('/').pop()} <must-gather directory>)`);
  const { arquivos } = leTar(texto);
  if (!Object.keys(arquivos).some((n) => n.endsWith('event-filter.html') || n.includes('cluster-scoped-resources'))) return falha(`script: ${arq}: no must-gather data found in the archive`);
  c.side.suporte = { arquivo: arq.split('/').pop(), id, arquivos: Object.keys(arquivos).length };
  return ok(`Uploading ${arq.split('/').pop()} ...\nUpload complete: ${Object.keys(arquivos).length} files received by Red Hat Support.\n`);
}

export function chmod(ctx) {
  const pos = ctx.args.filter((a) => !/^-[Rvcf]+$/.test(a));
  if (pos.length < 2) return falha(pos.length ? `chmod: missing operand after '${pos[0]}'\nTry 'chmod --help' for more information.` : "chmod: missing operand\nTry 'chmod --help' for more information.");
  const [modo, ...alvos] = pos;
  if (!/^([0-7]{3,4}|[ugoa]*[+\-=][rwxXst]+(,[ugoa]*[+\-=][rwxXst]+)*)$/.test(modo)) return falha(`chmod: invalid mode: '${modo}'\nTry 'chmod --help' for more information.`);
  for (const a of alvos) {
    const p = ctx.env.fs.resolve(ctx.sh.cwd, a);
    if (!ctx.env.fs.exists(p)) return falha(`chmod: cannot access '${a}': No such file or directory`);
  }
  return ok();
}

// Procura um executável no PATH; devolve o caminho ou null.
export function noPath(sh, fs, nome) {
  if (nome.includes('/')) {
    const p = fs.resolve(sh.cwd, nome);
    return fs.isFile(p) ? p : null;
  }
  for (const d of String(sh.vars.PATH || PATH_PADRAO).split(':')) {
    const p = `${d.replace(/\/$/, '')}/${nome}`;
    if (fs.isFile(p)) return p;
  }
  return null;
}

// Comandos que vêm com o sistema da estação (não ficam em arquivos).
const DO_SISTEMA = { tar: '/usr/bin/tar', curl: '/usr/bin/curl', helm: '/usr/local/bin/helm', htpasswd: '/usr/bin/htpasswd', openssl: '/usr/bin/openssl', skopeo: '/usr/bin/skopeo', ssh: '/usr/bin/ssh', grep: '/usr/bin/grep', ls: '/usr/bin/ls', cat: '/usr/bin/cat', psql: '/usr/bin/psql', mysql: '/usr/bin/mysql' };

export function which(ctx) {
  let out = '';
  let code = 0;
  for (const nome of ctx.args.filter((a) => !a.startsWith('-'))) {
    const semOc = ctx.env.cluster.side?.semOc;
    if ((nome === 'oc' || nome === 'kubectl') && (semOc || ctx.env.fs.isFile('/usr/local/bin/oc') || noPath(ctx.sh, ctx.env.fs, nome))) {
      const p = noPath(ctx.sh, ctx.env.fs, nome) || (semOc ? null : `/usr/local/bin/${nome}`);
      if (p) out += p + '\n';
      else {
        code = 1;
        out += '';
        ctx.err = (ctx.err || '') + `/usr/bin/which: no ${nome} in (${ctx.sh.vars.PATH || PATH_PADRAO})\n`;
      }
      continue;
    }
    if (DO_SISTEMA[nome]) out += DO_SISTEMA[nome] + '\n';
    else if (ctx.sh.cmds[nome]) out += `/usr/bin/${nome}\n`;
    else {
      code = 1;
      ctx.err = (ctx.err || '') + `/usr/bin/which: no ${nome} in (${ctx.sh.vars.PATH || PATH_PADRAO})\n`;
    }
  }
  return { out, err: ctx.err || '', code };
}

// `sudo CMD`: na estação, o aluno tem sudo sem senha.
export async function sudo(ctx) {
  const args = ctx.args.filter((a, i) => !(i === 0 && a === '-E'));
  if (!args.length) return falha('usage: sudo -h | -K | -k | -V\nusage: sudo [-AbEHknPS] [-C num] [-D directory] [-g group] [-h host] [-p prompt] [-R directory] [-T timeout] [-u user] [VAR=value] [-i|-s] [<command>]');
  const antes = ctx.env.fs.root;
  ctx.env.fs.root = true;
  try {
    return await ctx.sh.exec(args, ctx.stdin);
  } finally {
    ctx.env.fs.root = antes;
  }
}

// `source ARQ` / `. ARQ`: executa o arquivo no shell atual.
export async function source(ctx) {
  if (!ctx.args[0]) return falha('bash: source: filename argument required\nsource: usage: source filename [arguments]', 2);
  const fs = ctx.env.fs;
  const p = fs.resolve(ctx.sh.cwd, ctx.args[0]);
  if (!fs.isFile(p)) return falha(`bash: ${ctx.args[0]}: No such file or directory`);
  const texto = fs.read(p);
  // Script de autocomplete: o Tab do jogo já completa o oc.
  if (/__start_oc|_oc_root_command|complete -o default -F/.test(texto)) return ok();
  return ctx.sh.run(texto, { sub: true });
}

export function file(ctx) {
  let out = '';
  for (const a of ctx.args.filter((x) => !x.startsWith('-'))) {
    const p = ctx.env.fs.resolve(ctx.sh.cwd, a);
    if (ctx.env.fs.isDir(p)) out += `${a}: directory\n`;
    else if (!ctx.env.fs.isFile(p)) out += `${a}: cannot open \`${a}' (No such file or directory)\n`;
    else {
      const t = ctx.env.fs.read(p);
      out += `${a}: ${t === BINARIO_OC ? 'ELF 64-bit LSB executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, for GNU/Linux 3.2.0, stripped' : ehTar(t) ? 'POSIX tar archive (GNU)' : 'ASCII text'}\n`;
    }
  }
  return ok(out);
}
