#!/usr/bin/env python3
"""Extrai do PDF oficial do Edital nº 01/2026 o conteúdo programático (Anexo II)
das áreas A01 e C03, as regras das provas e o cronograma.

Uso: python3 scripts/build_edital.py caminho/do/edital.pdf > data/edital-2026.json

Determinístico: os títulos de disciplina vêm do negrito do PDF; as seções sem
negrito estão listadas em SECTIONS e o script falha se alguma não for encontrada.
Cada item é uma frase do edital, transcrita literalmente, com a página de origem.
Regras de prova e cronograma são transcritas à mão (tabelas do PDF não têm
estrutura extraível confiável) com a página de cada informação.
"""
import hashlib
import json
import re
import sys

import pdfplumber

PDF = sys.argv[1]
ANEXO_II = range(31, 37)  # páginas 31 a 36

# Disciplinas na ordem do edital: (id, prova, áreas, título exato no PDF)
SUBJECTS = [
    ('p1-adm', 'P1', ['A01', 'C03'], 'Administração Geral, Administração Pública e Auditoria Governamental'),
    ('p1-dadm', 'P1', ['A01', 'C03'], 'Direito Administrativo'),
    ('p1-dconst', 'P1', ['A01', 'C03'], 'Direito Constitucional'),
    ('p1-eco', 'P1', ['A01', 'C03'], 'Economia'),
    ('p1-port', 'P1', ['A01', 'C03'], 'Língua Portuguesa'),
    ('p1-mfe', 'P1', ['A01', 'C03'], 'Matemática Financeira / Estatística'),
    ('p1-afo', 'P1', ['A01', 'C03'], 'Administração Financeira e Orçamentária'),
    ('p1-cont', 'P1', ['A01', 'C03'], 'Contabilidade Geral e Pública'),
    ('p1-dfin', 'P1', ['A01', 'C03'], 'Direito Financeiro e Finanças Públicas'),
    ('p1-flu', 'P1', ['A01', 'C03'], 'Fluência de Dados'),
    ('p2-a01', 'P2', ['A01'], 'A01: CONHECIMENTOS ESPECÍFICOS - Área de conhecimento de Orçamento e Finanças Públicas'),
    ('p2-c03', 'P2', ['C03'], 'C03: CONHECIMENTOS ESPECÍFICOS - Área de conhecimento de Ciências de Dados e Tecnologia da Informação'),
]
SKIP_FROM = 'B02: CONHECIMENTOS ESPECÍFICOS'  # B02 não é área do Paulo nem da Cíntia
NAMES = {'p2-a01': 'Conhecimentos Específicos — Orçamento e Finanças Públicas',
         'p2-c03': 'Conhecimentos Específicos — Ciências de Dados e TI'}

# Seções sem negrito que abrem parágrafo no edital (rótulo seguido de ':').
SECTIONS = {
    'p1-adm': ['Administração Geral e Pública (Convergência Público-Privada)', 'Auditoria Governamental e Controle Interno'],
    'p1-mfe': ['Matemática Financeira', 'Estatística'],
    'p1-cont': ['Contabilidade Aplicada ao Setor Público', 'Contabilidade Geral'],
    'p1-flu': ['Ciência de Dados', 'Segurança da Informação e Proteção de Dados'],
    'p2-c03': ['Gestão ágil de produtos e projetos digitais', 'Ciência de dados e inteligência artificial',
               'Business Intelligence, Analytics e Visualização'],
}

HEADER_LINES = {'ANEXO II', 'CONTEÚDO PROGRAMÁTICO', 'PROVA 1 e PROVA 3', 'PROVA 2'}


def norm(s):
    return re.sub(r'\s+', ' ', s).strip()


def is_bold(ch):
    return 'Bold' in ch.get('fontname', '')


def lines_of(pdf):
    """[(página, texto, prefixo_em_negrito)] na ordem de leitura."""
    out = []
    for pn in ANEXO_II:
        for ln in pdf.pages[pn - 1].extract_text_lines(return_chars=True):
            chars = [c for c in ln['chars'] if c['text'].strip()]
            nbold = 0
            for c in chars:
                if not is_bold(c):
                    break
                nbold += len(c['text'])
            # pdfplumber não traz os espaços como caracteres: recorta o texto da linha
            prefix, seen = '', 0
            for ch in ln['text']:
                if seen >= nbold:
                    break
                prefix += ch
                if ch.strip():
                    seen += 1
            out.append((pn, ln['text'], norm(prefix)))
    return out


def join_lines(parts):
    """Junta linhas em texto corrido, guardando a página de cada caractere."""
    text, pages = '', []
    for pn, s in parts:
        s = s.strip()
        if text:
            # Hífen no fim da linha neste PDF é sempre hífen real (custo-benefício, k-means).
            sep = '' if text.endswith('-') and not text.endswith(' -') else ' '
            text += sep
            pages += [pn] * len(sep)
        text += s
        pages += [pn] * len(s)
    return text, pages


SENT_END = re.compile(r'(?<=[.;])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ(])')
LONG = 240
ABBREV = re.compile(r'(\bArts?|\bn|\bnº|\bNBC TA)\.$')


def sentences(text, pages, start):
    out, i = [], 0
    for m in SENT_END.finditer(text):
        if not text[:m.start()].endswith('.'):
            continue  # só quebra em ponto final
        if ABBREV.search(text[:m.start()]):
            continue
        out.append((i, m.start()))
        i = m.end()
    out.append((i, len(text)))
    # Frases longas que são listas separadas por ';' viram um item por elemento da lista.
    final = []
    for a, b in out:
        if b - a > LONG and ';' in text[a:b]:
            j = a
            for m in re.finditer(r';\s+', text[a:b]):
                final.append((j, a + m.start() + 1))
                j = a + m.end()
            final.append((j, b))
        else:
            final.append((a, b))
    return [(text[a:b].strip(), pages[a] if a < len(pages) else pages[-1]) for a, b in final if text[a:b].strip()]


def item_title(sent, section):
    """Título curto para listas (o texto oficial completo fica em 'text')."""
    t = sent.rstrip(' .;')
    if section and t.startswith(section + ':'):
        t = t[len(section) + 1:].strip()  # não repete o nome da seção
    elif ':' in t[:110]:
        t = t.split(':', 1)[0]
    if len(t) > 100:
        t = t[:97].rstrip() + '…'
    return t[:1].upper() + t[1:]


def main():
    with open(PDF, 'rb') as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    pdf = pdfplumber.open(PDF)
    lines = lines_of(pdf)

    titles = {norm(t): sid for sid, _, _, t in SUBJECTS}
    current, skipping = None, False
    body = {sid: [] for sid, *_ in SUBJECTS}
    bold_sections = {sid: [] for sid, *_ in SUBJECTS}
    for pn, text, bold in lines:
        t = norm(text)
        if t in HEADER_LINES or t.startswith('CONHECIMENTOS BÁSICOS') or t == 'Ciências de Dados e Tecnologia da Informação':
            continue
        if t.startswith(SKIP_FROM):
            skipping, current = True, None
            continue
        if bold and bold == t and t in titles:
            current, skipping = titles[t], False
            continue
        if skipping or current is None:
            continue
        if bold and t.startswith(bold) and len(bold) > 3 and t[len(bold):].lstrip().startswith(':'):
            bold_sections[current].append(bold)
        body[current].append((pn, text))

    missing = [sid for sid, parts in body.items() if not parts]
    if missing:
        sys.exit(f'Disciplinas sem texto: {missing}')

    subjects, topics, fragments = [], [], []
    for order, (sid, prova, areas, title) in enumerate(SUBJECTS, 1):
        text, pages = join_lines(body[sid])
        text = re.sub(r'\s+:', ':', text)  # "Teoria Microeconômica :" (negrito separado)
        pages = pages[:len(text)] + [pages[-1]] * max(0, len(text) - len(pages))
        labels = bold_sections[sid] + SECTIONS.get(sid, [])
        cuts = []
        for lab in labels:
            pos = text.find(lab + ':')
            if pos < 0:
                sys.exit(f'Seção "{lab}" não encontrada em {sid}')
            cuts.append((pos, lab))
        cuts.sort()
        if not cuts or cuts[0][0] > 0:
            cuts.insert(0, (0, None))
        subjects.append({'id': sid, 'prova': prova, 'areas': areas, 'name': NAMES.get(sid, title), 'officialTitle': title, 'order': order,
                         'pages': sorted(set(pages))})
        n = 0
        for k, (pos, lab) in enumerate(cuts):
            end = cuts[k + 1][0] if k + 1 < len(cuts) else len(text)
            seg, segp = text[pos:end].strip(), pages[pos:end]
            parent = None
            if lab:
                parent = f'{sid}-s{k + (0 if cuts[0][1] else 0)}'
                topics.append({'id': parent, 'subjectId': sid, 'parentId': None, 'code': None, 'title': lab, 'order': len(topics),
                               'pages': sorted(set(segp)), 'fragmentIds': [], 'section': True})
            # pdfplumber pode trazer espaços à esquerda; recalcula o deslocamento
            lead = len(text[pos:end]) - len(text[pos:end].lstrip())
            for sent, pg in sentences(seg, segp[lead:], pos):
                n += 1
                fid = f'{sid}-{n:03d}'
                short = item_title(sent, lab)
                fragments.append({'id': fid, 'page': pg, 'seq': n, 'subjectId': sid, 'topicId': fid, 'title': short, 'text': sent})
                topics.append({'id': fid, 'subjectId': sid, 'parentId': parent, 'code': f'{n}', 'title': short, 'order': len(topics),
                               'pages': [pg], 'fragmentIds': [fid]})
                if parent:
                    next(t for t in topics if t['id'] == parent)['fragmentIds'].append(fid)

    # O PDF traz o símbolo R² como imagem; o texto extraído fica "()".
    for f in fragments:
        if 'coeficiente de determinação ()' in f['text']:
            f['note'] = 'No PDF o símbolo aparece como imagem e não é extraído; trata-se do R² (coeficiente de determinação).'

    # Demais páginas do edital, inteiras, para a busca no "edital inteiro".
    for pn in list(range(1, 31)) + list(range(37, len(pdf.pages) + 1)):
        txt = (pdf.pages[pn - 1].extract_text() or '').strip()
        if txt:
            fragments.append({'id': f'pag-{pn:02d}', 'page': pn, 'seq': 0, 'subjectId': None, 'topicId': None,
                              'title': f'Página {pn}', 'text': txt})

    subjects.append({'id': 'p3', 'prova': 'P3', 'areas': ['A01', 'C03'], 'name': 'Estudo de Caso interdisciplinar (P3)',
                     'officialTitle': 'Prova Discursiva – P3 Estudo de Caso interdisciplinar', 'order': len(subjects) + 1, 'pages': [15, 16]})

    P1 = [('p1-adm', 8, 1), ('p1-dadm', 10, 1), ('p1-dconst', 10, 1), ('p1-eco', 4, 1), ('p1-port', 10, 1), ('p1-mfe', 6, 1),
          ('p1-afo', 8, 2), ('p1-cont', 8, 2), ('p1-dfin', 8, 2), ('p1-flu', 8, 2)]
    name = {s['id']: s['name'] for s in subjects}
    rules = {
        'source': {'page': 15, 'item': '7.1'},
        'provas': [
            {'id': 'P1', 'name': 'Conhecimentos Básicos', 'kind': 'objetiva', 'durationMin': 240, 'period': 'manhã', 'page': 15,
             'areas': ['A01', 'C03'], 'subjects': [{'subjectId': s, 'name': name[s], 'questions': q, 'weight': w} for s, q, w in P1]},
            {'id': 'P2', 'name': 'Conhecimentos Específicos — A01', 'kind': 'objetiva', 'durationMin': 240, 'period': 'tarde (junto com a P3)', 'page': 15,
             'areas': ['A01'], 'subjects': [{'subjectId': 'p2-a01', 'name': name['p2-a01'], 'questions': 40, 'weight': 3}]},
            {'id': 'P2', 'name': 'Conhecimentos Específicos — C03', 'kind': 'objetiva', 'durationMin': 240, 'period': 'tarde (junto com a P3)', 'page': 15,
             'areas': ['C03'], 'subjects': [{'subjectId': 'p2-c03', 'name': name['p2-c03'], 'questions': 40, 'weight': 3}]},
            {'id': 'P3', 'name': 'Discursiva — Estudo de Caso interdisciplinar', 'kind': 'discursiva', 'page': 15, 'areas': ['A01', 'C03'],
             'maxPoints': 120, 'maxLines': 30, 'subjects': []},
        ],
        'habilitacao': [
            {'type': 'min_points_prova', 'prova': 'P1', 'value': 45, 'text': 'Mínimo de 45 pontos na P1 (item 8.1-a, p. 16)'},
            {'type': 'min_points_prova', 'prova': 'P2', 'value': 48, 'text': 'Mínimo de 48 pontos na P2 (item 8.1-b, p. 16)'},
            {'type': 'min_points_prova', 'prova': 'P3', 'value': 48, 'text': 'Mínimo de 48 pontos na P3 (item 8.1-c e 9.6, p. 16)'},
            {'type': 'min_points_objetivas', 'value': 116, 'text': 'Mínimo de 116 pontos no total das Provas Objetivas (item 8.1-d, p. 16)'},
        ],
    }
    schedule = [
        ('Período de inscrições', '2026-10-05', '2026-11-03'),
        ('Solicitação de isenção/redução da inscrição', '2026-10-05', '2026-10-09'),
        ('Divulgação das isenções/reduções deferidas e indeferidas', '2026-10-21', None),
        ('Recursos quanto ao indeferimento de isenção/redução', '2026-10-22', '2026-10-23'),
        ('Divulgação das isenções/reduções após recursos', '2026-10-30', None),
        ('Data limite para envio do Laudo Médico (candidatos com deficiência)', '2026-11-03', None),
        ('Último dia para pagamento da inscrição', '2026-11-04', None),
        ('Divulgação das vagas reservadas e solicitações específicas deferidas', '2026-11-13', None),
        ('Recursos quanto às vagas reservadas e solicitações específicas', '2026-11-16', '2026-11-17'),
        ('Respostas dos recursos (deficiência, vagas reservadas, solicitações)', '2026-11-25', None),
        ('Edital de convocação para as provas e Cartão Informativo', '2026-12-03', None),
        ('Prova Objetiva P1 – Conhecimentos Básicos (manhã)', '2026-12-13', None),
        ('Prova Objetiva P2 – Conhecimentos Específicos (tarde)', '2026-12-13', None),
        ('Prova Discursiva P3 – Estudo de Caso (tarde)', '2026-12-13', None),
        ('Gabarito e questões das Provas Objetivas (a partir das 17h)', '2026-12-14', None),
        ('Recursos quanto a gabaritos e questões', '2026-12-15', '2026-12-16'),
        ('Resultado Preliminar das Provas Objetivas e Discursiva', '2027-03-02', None),
        ('Recursos quanto aos resultados das Provas Objetivas e Discursiva', '2027-03-03', '2027-03-04'),
        ('Resultado Definitivo das Provas e convocação para envio de Títulos', '2027-04-06', None),
        ('Envio dos Títulos', '2027-04-12', '2027-04-13'),
        ('Resultado Preliminar da avaliação de Títulos', '2027-05-18', None),
        ('Recursos quanto à avaliação de Títulos', '2027-05-19', '2027-05-20'),
        ('Resultado definitivo de Títulos e convocação para heteroidentificação', '2027-06-18', None),
        ('Procedimento de heteroidentificação', '2027-06-26', '2027-06-27'),
        ('Resultado Preliminar da heteroidentificação', '2027-07-06', None),
        ('Recursos quanto à heteroidentificação', '2027-07-07', '2027-07-08'),
        ('Resultado definitivo da heteroidentificação', '2027-08-17', None),
        ('Reconsideração quanto à heteroidentificação', '2027-08-18', '2027-08-24'),
        ('Resultado da entrevista de heteroidentificação e Resultado Final', '2027-09-13', None),
    ]
    out = {
        'source': {'edital': {'title': 'Edital nº 01/2026 – Abertura de Inscrições – APOFP (SEFAZ-SP, FCC)',
                              'url': 'https://www.concursosfcc.com.br/concursos/fazsp126/edital_n0_01-2026_-_abertura_das_incricoes_apofp.pdf',
                              'publishedAt': '2026-10-02', 'sha256': sha,
                              'note': 'Publicado no DOE-SP de 02/10/2026, Caderno Executivo'}},
        'exam': {
            'date': '2026-12-13',
            'areas': {'A01': {'vagas': 20, 'ampla': 19, 'pcd': 1, 'page': 2}, 'C03': {'vagas': 20, 'ampla': 19, 'pcd': 1, 'page': 2}},
            'rules': rules,
            'schedule': [{'event': e, 'date': d, 'end': end, 'page': 39 if i < 22 else 40} for i, (e, d, end) in enumerate(schedule)],
            'career': {'text': 'Vencimento mensal de R$ 11.359,50 (salário + Prêmio de Incentivo à Qualidade, variável, no valor máximo), '
                               'Nível I – SQC-III. Jornada de 40 horas semanais. Requisito: curso superior em qualquer área, reconhecido pelo MEC. '
                               'Inscrição: R$ 150,00.', 'page': 2},
        },
        'subjects': subjects, 'topics': topics, 'fragments': fragments,
    }
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)


main()
