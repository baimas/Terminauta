// Leitura em voz alta dos flashcards.
// Em inglês, toca o áudio gravado com voz neural (web/audio/en, gerado por
// scripts/gera-audio.py) quando o texto do card bate com o do manifesto.
// Sem gravação, usa a voz do sistema (Web Speech API), escolhendo a mais natural.

const CHAVE = 'labgame-ex280.voz';
const PASTA = { en: 'audio/en' };

// Vozes de efeito e vozes antigas do macOS (Eloquence), que soam robóticas.
const RUINS = /\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Junior|Ralph|Fred|Kathy|Deranged|Hysterical|Pipe Organ)\b/i;
// Vozes conhecidas por soar bem, em ordem de preferência.
const BOAS = {
  en: ['Natural', 'Neural', 'Premium', 'Enhanced', 'Google US English', 'Ava', 'Samantha', 'Zoe', 'Allison', 'Evan', 'Nathan', 'Tom', 'Susan', 'Jenny', 'Aria', 'Guy', 'Daniel', 'Karen', 'Moira', 'Serena'],
  pt: ['Natural', 'Neural', 'Premium', 'Enhanced', 'Google português do Brasil', 'Luciana', 'Felipe', 'Francisca', 'Antonio', 'Thalita', 'Fernanda', 'Joana'],
};

// Nota de uma voz para o idioma; maior é melhor, negativa não serve.
export function notaVoz(v, lingua) {
  const idioma = lingua === 'pt' ? 'pt-BR' : 'en-US';
  const lang = (v.lang || '').replace('_', '-');
  if (!lang.toLowerCase().startsWith(lingua)) return -1;
  if (RUINS.test(v.name)) return -1;
  let nota = lang === idioma ? 20 : 10;
  const i = BOAS[lingua].findIndex((n) => v.name.includes(n));
  if (i >= 0) nota += 100 - i;
  if (v.localService === false) nota += 5; // vozes online (Google, Microsoft) costumam ser neurais
  return nota;
}

export function melhorVoz(vozes, lingua) {
  let melhor = null;
  let maior = -1;
  for (const v of vozes) {
    const n = notaVoz(v, lingua);
    if (n > maior) {
      maior = n;
      melhor = v;
    }
  }
  return melhor;
}

// Texto que a voz do sistema lê: sem crases e com comandos mais pronunciáveis.
export function textoFalado(texto) {
  return texto
    .replace(/`([^`]+)`/g, (_, c) => c.replace(/\boc\b/g, 'O C').replace(/--/g, ' ').replace(/(^|\s)-(\w)/g, '$1$2'))
    .replace(/\s+/g, ' ')
    .trim();
}

async function hash(texto) {
  const bytes = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

export function criaVoz(lingua) {
  const temSintese = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const temAudio = typeof Audio !== 'undefined';
  const manifestos = {};
  let tocando = null;
  let pedido = 0;

  const marca = (ligado) => document.querySelectorAll('.ouvir').forEach((b) => b.classList.toggle('falando', ligado));

  function manifesto(l) {
    if (!PASTA[l] || !temAudio) return Promise.resolve(null);
    manifestos[l] ??= fetch(`${PASTA[l]}/manifesto.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return manifestos[l];
  }

  // Endereço do áudio gravado, se existir e estiver em dia com o texto.
  async function gravado(card, lado, l) {
    const m = await manifesto(l);
    const esperado = m?.[card.id]?.[lado];
    if (!esperado || !globalThis.crypto?.subtle) return null;
    return (await hash(card[lado][l])) === esperado ? `${PASTA[l]}/${card.id}-${lado}.mp3` : null;
  }

  function sintetiza(texto, l) {
    if (!temSintese) return;
    const u = new SpeechSynthesisUtterance(textoFalado(texto));
    u.lang = l === 'pt' ? 'pt-BR' : 'en-US';
    const v = melhorVoz(speechSynthesis.getVoices(), l);
    if (v) u.voice = v;
    u.rate = 0.95;
    u.onstart = () => marca(true);
    u.onend = u.onerror = () => marca(false);
    speechSynthesis.speak(u);
  }

  const voz = {
    suporta: temSintese || temAudio,
    auto: (() => {
      try {
        return localStorage.getItem(CHAVE) === 'auto';
      } catch {
        return false;
      }
    })(),
    ultimo: null,
    para() {
      pedido++;
      if (tocando) {
        tocando.pause();
        tocando = null;
      }
      if (temSintese) speechSynthesis.cancel();
      marca(false);
    },
    async falaCard(card, lado) {
      this.para();
      const meu = pedido;
      const l = lingua();
      const url = await gravado(card, lado, l);
      if (meu !== pedido) return; // outro pedido chegou enquanto procurava
      if (url) {
        const a = new Audio(url);
        tocando = a;
        a.onplaying = () => marca(true);
        a.onended = a.onpause = () => marca(false);
        a.onerror = () => {
          if (tocando === a) sintetiza(card[lado][l], l);
        };
        a.play().catch(() => marca(false));
        return;
      }
      sintetiza(card[lado][l], l);
    },
    defineAuto(ligado) {
      this.auto = ligado;
      try {
        localStorage.setItem(CHAVE, ligado ? 'auto' : 'manual');
      } catch {
        /* sem armazenamento: vale só nesta visita */
      }
    },
  };
  // A lista de vozes do Chrome chega depois do carregamento.
  if (temSintese) speechSynthesis.getVoices();
  return voz;
}
