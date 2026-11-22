#!/usr/bin/env python3
"""Gera o áudio em inglês dos flashcards com o Kokoro (voz neural, Apache 2.0).

O navegador tem vozes ruins em inglês na maioria dos sistemas; por isso os cards
em inglês vêm com o áudio já gravado em web/audio/en/<id>-q.mp3 e <id>-a.mp3.
O manifesto web/audio/en/manifesto.json guarda um hash do texto de cada lado:
o app só usa o arquivo quando o texto bate, e o teste avisa se ficar desatualizado.

Uso (fora do repositório, num ambiente próprio):
  uv venv venv && uv pip install --python venv/bin/python kokoro-onnx soundfile
  baixe kokoro-v1.0.onnx e voices-v1.0.bin de
  https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
  venv/bin/python scripts/gera-audio.py --modelo PASTA_DO_MODELO [--tudo]

Precisa de node (para ler os cards) e ffmpeg (para gerar o MP3).
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, 'web', 'audio', 'en')
VOZ = 'af_heart'

# Palavras em maiúsculas que são marcadores para trocar (NAME, POD...) e viram palavra comum.
MARCADORES = {
    'CM': 'config map', 'SVC': 'service', 'DIR': 'directory', 'VAR': 'variable', 'NS': 'namespace',
}
# Pronúncia de termos que a voz erraria.
TERMOS = [
    (r'\bHTPasswd\b', 'H T password'), (r'\bhtpasswd\b', 'H T password'), (r'\bOAuth\b', 'O auth'),
    (r'\bYAML\b', 'yammel'), (r'\byaml\b', 'yammel'), (r'\bJSON\b', 'jason'), (r'\bjsonpath\b', 'jason path'),
    (r'\bkubeadmin\b', 'kube admin'), (r'\bkubectl\b', 'kube control'), (r'\bkustomize\b', 'customize'),
    (r'\bKustomize\b', 'Customize'), (r'\bKustomization\b', 'Customization'), (r'\bkustomization\b', 'customization'),
    (r'\bsha256\b', 'sha 256'), (r'\bskopeo\b', 'scopeo'), (r'\bAPIs\b', 'A P Is'), (r'\bPVCs\b', 'P V Cs'),
    (r'\bREMOVEDINRELEASE\b', 'removed in release'), (r'\bSHORTNAMES\b', 'short names'), (r'\bAPIVERSION\b', 'API version'),
    (r'\be\.g\.', 'for example'), (r'(\d+)Gi\b', r'\1 gibibytes'), (r'(\d+)Mi\b', r'\1 mebibytes'), (r'\bpvc\b', 'P V C'),
    (r'\bnginx\b', 'engine x'), (r'\bOpenShift\b', 'Open Shift'), (r'\bopenshift\b', 'open shift'),
]


def separa_camel(p):
    p = re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', p)
    return re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1 \2', p)


def fala_codigo(seg):
    """Transforma um trecho de comando em algo que se fala em voz alta."""
    # Primeiro os símbolos que separam palavras; depois cada palavra.
    seg = seg.replace('\\n', ' new line ').replace('...', ' ').replace('../', ' dot dot slash ')
    seg = seg.replace('[*]', ' star ').replace('[0]', ' zero ').replace('>', ' into ')
    seg = re.sub(r'[{}\[\]()"\',]', ' ', seg)
    seg = re.sub(r'(?<=\S)=', ' equals ', seg).replace('|', ' pipe ')
    seg = seg.replace('://', ' colon slash slash ').replace('~/', ' home slash ')
    seg = re.sub(r':(?=\S)', ' colon ', seg).replace(':', ' ')
    seg = re.sub(r'(?<=\w)/(?=\S)', ' slash ', seg)
    seg = re.sub(r'(?<=\w)\.(?=\w)', ' dot ', seg)
    seg = re.sub(r'(\d+)Gi\b', r'\1 gibibytes', seg)
    seg = re.sub(r'\b(rwo|rwx|rox)\b', lambda m: ' '.join(m.group(1).upper()), seg)
    palavras = []
    for tok in seg.split():
        if tok == 'oc':
            palavras.append('O C')
            continue
        if tok == '--':
            palavras.append('dash dash')
            continue
        m = re.match(r'^(-{1,2})([A-Za-z].*)$', tok)
        prefixo = ''
        if m:
            prefixo = 'dash dash ' if m.group(1) == '--' else 'dash '
            tok = m.group(2)
        if re.fullmatch(r'[A-Z][A-Z0-9_]+', tok) and tok not in ('RWO', 'RWX', 'ROX'):
            tok = MARCADORES.get(tok, tok.replace('_', ' ').lower())
        else:
            tok = tok.replace('\\n', ' new line ')
            tok = re.sub(r'\.\.\.', ' ', tok)
            tok = re.sub(r'(?<=\w)\.(?=\w)', ' dot ', tok)
            tok = re.sub(r'^\.(?=\w)', 'dot ', tok)
            tok = tok.replace('[*]', ' star ').replace('[0]', ' zero ')
            tok = tok.replace('=', ' equals ').replace('|', ' pipe ').replace('@', ' at ').replace('*', ' star ')
            tok = re.sub(r'(?<=\w):(?=\w)', ' colon ', tok)
            tok = re.sub(r'(?<=\w)/(?=\w)', ' slash ', tok)
            tok = re.sub(r'^/', 'slash ', tok)
            tok = re.sub(r'[{}\[\]()"\'`,:/]', ' ', tok)
            tok = separa_camel(tok).replace('-', ' ').replace('_', ' ')
        palavras.append(prefixo + tok)
    return re.sub(r'\s+', ' ', ' '.join(palavras)).strip()


def falado(texto):
    partes = re.split(r'(`[^`]+`)', texto)
    saida = []
    for p in partes:
        if p.startswith('`') and p.endswith('`'):
            saida.append(fala_codigo(p[1:-1]))
        else:
            # Siglas de status em maiúsculas (AVAILABLE, AND) viram palavra comum.
            p = re.sub(r'\b(AVAILABLE|PROGRESSING|DEGRADED|AND|OR|EXTERNAL|TARGETS)\b', lambda m: m.group(1).lower(), p)
            saida.append(p)
    t = ''.join(saida)
    for padrao, troca in TERMOS:
        t = re.sub(padrao, troca, t)
    # Palavras coladas em CamelCase (ReadWriteOnce, MetalLB) ficam separadas.
    t = re.sub(r'\b[A-Za-z]*[a-z][A-Z][A-Za-z]*\b', lambda m: separa_camel(m.group(0)), t)
    t = t.replace('→', ', then ').replace(';', ',')
    return re.sub(r'\s+', ' ', t).strip()


def hash_texto(texto):
    return hashlib.sha1(texto.encode('utf-8')).hexdigest()[:12]


def cards():
    js = "import('./web/flashcards/index.js').then(({CARDS}) => console.log(JSON.stringify(CARDS.map((c) => ({id: c.id, q: c.q.en, a: c.a.en})))))"
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js], cwd=RAIZ))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--modelo', required=True, help='pasta com kokoro-v1.0.onnx e voices-v1.0.bin')
    ap.add_argument('--tudo', action='store_true', help='regera mesmo o que já está em dia')
    ap.add_argument('--so', help='gera só os ids que contêm este texto')
    ap.add_argument('--mostra', action='store_true', help='só mostra o texto falado, sem gerar')
    args = ap.parse_args()

    lista = cards()
    if args.so:
        lista = [c for c in lista if args.so in c['id']]
    if args.mostra:
        for c in lista:
            print(c['id'], '|', falado(c['q']), '|', falado(c['a']))
        return

    from kokoro_onnx import Kokoro
    import soundfile as sf
    kokoro = Kokoro(os.path.join(args.modelo, 'kokoro-v1.0.onnx'), os.path.join(args.modelo, 'voices-v1.0.bin'))

    os.makedirs(SAIDA, exist_ok=True)
    caminho_manifesto = os.path.join(SAIDA, 'manifesto.json')
    manifesto = json.load(open(caminho_manifesto)) if os.path.exists(caminho_manifesto) else {}
    feitos = 0
    for i, c in enumerate(lista, 1):
        for lado in ('q', 'a'):
            h = hash_texto(c[lado])
            destino = os.path.join(SAIDA, f"{c['id']}-{lado}.mp3")
            if not args.tudo and manifesto.get(c['id'], {}).get(lado) == h and os.path.exists(destino):
                continue
            amostras, taxa = kokoro.create(falado(c[lado]), voice=VOZ, speed=1.0, lang='en-us')
            with tempfile.NamedTemporaryFile(suffix='.wav') as wav:
                sf.write(wav.name, amostras, taxa)
                subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav.name, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '40k', destino], check=True)
            manifesto.setdefault(c['id'], {})[lado] = h
            feitos += 1
        print(f'{i}/{len(lista)} {c["id"]}', file=sys.stderr, flush=True)
    validos = {c['id'] for c in cards()}
    manifesto = {k: v for k, v in sorted(manifesto.items()) if k in validos}
    with open(caminho_manifesto, 'w') as f:
        json.dump(manifesto, f, indent=1, sort_keys=True)
        f.write('\n')
    print(f'{feitos} arquivos gerados; manifesto com {len(manifesto)} cards.', file=sys.stderr)


if __name__ == '__main__':
    main()
