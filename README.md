# Rumo à SEFAZ

Plataforma pessoal de preparação para **Analista de Planejamento, Orçamento e Finanças Públicas — SEFAZ-SP 2026**,
com dois percursos independentes: **Paulo · C03** (Ciências de Dados e TI) e **Cíntia · A01** (Orçamento e Finanças Públicas).

PWA em HTML, CSS e JavaScript (módulos ES), sem etapa de build. Estado do projeto por Gate: [docs/STATUS.md](docs/STATUS.md).

## Arquitetura

```
GitHub Pages (estático)            Neon
┌───────────────────────────┐      ┌──────────────────────────────────────┐
│ index.html + js/ + css/   │ JWT  │ Neon Auth (Google)                   │
│ data/content.json ◄───────┼──┐   │ Data API (PostgREST) + RLS           │
│ IndexedDB (offline)       │──┼──►│ user_answers, user_reviews,          │
│ Service Worker (cache)    │  │   │ user_simulados, user_kv, user_profiles│
└───────────────────────────┘  │   │ tabelas de conteúdo (já existentes)  │
                               └───┤ ◄── scripts/export-content.mjs        │
                                   └──────────────────────────────────────┘
```

- **Conteúdo** (edital, tópicos, questões, flashcards, aulas, mapas, incidência histórica, regras da prova)
  é exportado do Neon para `data/content.json` por `scripts/export-content.mjs`, que roda fora do navegador.
  O app nunca inventa conteúdo: o que não estiver no pacote aparece como "não carregado".
- **Dados pessoais** ficam primeiro no IndexedDB, por perfil, e entram numa fila (outbox) na mesma transação.
  Com login, a fila sobe para o Neon pela Data API. Respostas, revisões e simulados são eventos imutáveis com
  id gerado no aparelho: reenviar é seguro e dois aparelhos convergem (o estado dos flashcards é recalculado do log).
  Preferências usam "última gravação vence" com desempate no banco.
- **Segurança**: o navegador só conhece as URLs públicas do Neon Auth e da Data API e o JWT do usuário.
  A string de conexão do banco nunca vai para o front. As políticas RLS (`db/001_user_data.sql`) restringem
  cada linha ao `auth.user_id()` do JWT.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `js/logic/` | Regras puras e testadas: revisão espaçada (`srs.js`), domínio e estatísticas (`stats.js`), prioridades e plano (`planner.js`), pontuação oficial (`scoring.js`) |
| `js/data/` | Conteúdo (`content.js`), IndexedDB por perfil + outbox + backup (`store.js`), Neon Auth/Data API (`remote.js`), sincronização (`sync.js`) |
| `js/views/` | Uma tela por arquivo |
| `db/` | `001_user_data.sql` (tabelas pessoais + RLS) e `002_content_contract.sql` (views que o exportador lê) |
| `scripts/export-content.mjs` | Neon → `data/content.json`, com checagens de integridade; `--inspect` lista as tabelas existentes |
| `tests/` | Unitários (`node --test`), banco (`tests/db`, Postgres), ponta a ponta (Playwright, desktop e iPhone) com conteúdo **fictício** de teste |
| `vendor/` | SDK oficial `@neondatabase/neon-js`, empacotado para o navegador |

## Rodar localmente

```sh
npm install
npx http-server -p 8080 -c-1 .     # abra http://localhost:8080
npm test                           # unitários
npx playwright test                # ponta a ponta (usa tests/fixtures/content.json)
```

Sem configuração do Neon o app funciona em **modo local**: perfis Paulo e Cíntia neste aparelho, com backup manual.

## Configurar o Neon (uma vez)

1. No console do Neon, no projeto do Rumo à SEFAZ (separado do Viaggio): ativar **Neon Auth** com provedor Google e a **Data API**.
2. Rodar `db/001_user_data.sql` no SQL Editor (pode rodar de novo sem problema).
3. Inspecionar as tabelas de conteúdo e criar as views de `db/002_content_contract.sql`:
   `DATABASE_URL=... node scripts/export-content.mjs --inspect`
4. Exportar o conteúdo: `DATABASE_URL=... node scripts/export-content.mjs` e commitar `data/content.json`.
5. Preencher `neonAuthUrl` e `dataApiUrl` em `js/config.js` e incluir a URL do GitHub Pages nos domínios
   permitidos do Neon Auth.

Ao alterar arquivos do app, incremente `CACHE_VERSION` em `sw.js` e inclua arquivos novos em `APP_SHELL`.

## Formato de `data/content.json`

Veja `tests/fixtures/content.json` (fictício) para um exemplo completo. Campos principais:
`exam` (`date`, `areas.{A01,C03}.vagas`, `rules.provas[].subjects[]` com `questions`/`weight`, `rules.habilitacao`),
`subjects` (`id`, `prova`, `name`, `areas`), `topics` (`subjectId`, `parentId`, `pages`, `fragmentIds`),
`fragments` (`page`, `text`), `questions` (`options[{key,text}]`, `answer`, `explanation`, `provenance`),
`flashcards`, `lessons`, `mindmaps`, `incidence` (`topicId`, `count`, `verified`), `discursive`, `changes`.
