# Estado do projeto

Atualizado em 21/10/2026. Legenda: ✅ feito e testado · 🟡 código pronto, falta dado ou validação externa · ⛔ não feito.

"Testado" quer dizer coberto pelos testes automatizados deste repositório (unitários, banco local e Playwright
com conteúdo **fictício**). A configuração do Neon foi feita e conferida pelo conector, mas login e sincronização
ainda não foram exercitados num navegador real, nem num iPhone físico.

## Situação do Neon (projeto sefaz-estudos-2026, hidden-bar-42195602)

- ✅ Neon Auth (Better Auth gerenciado) e Data API ativados na branch `main`, com `js/config.js` apontando para eles.
- ✅ Tabelas pessoais (`user_*`) criadas com RLS forçado; o papel anônimo não lê nada; as tabelas do Codex não ficam expostas pela Data API.
- ✅ `https://paulosince.github.io` incluído nos domínios confiáveis do Neon Auth.
- 🟡 Google usa as credenciais **compartilhadas** do Neon (tipo "shared"). Para produção, o recomendado é criar um OAuth Client próprio no Google Cloud.
- 🟡 O conteúdo programático usado pelo app vem de `scripts/build_edital.py` (extraído direto do PDF oficial). As tabelas do Codex
  (`syllabus_topics` etc.) não foram alteradas; elas têm problemas de classificação (ver abaixo) e não são usadas.

### Problemas encontrados nos dados do Codex (`syllabus_topics`)

- Faltam duas disciplinas da P1: **Língua Portuguesa** (10 questões) e **Matemática Financeira / Estatística** (6 questões).
  O quadro do item 7.1 (p. 15) lista 10 disciplinas. Isso explica a divergência "7 × 8 disciplinas".
- Direito Financeiro, A01 bloco 2, Gestão ágil e BI têm só a linha de título; os itens ficaram em outras disciplinas.
- Os 324 fragmentos não têm página (`source_page_start` nulo) e estão todos `needs_review`.

## Pendências

1. Questões, flashcards, aulas e incidência histórica (Pareto) ainda não existem: não há questões no banco (`practice_questions` = 0).
2. Login Google precisa ser testado num navegador real (Safari do iPhone em especial).
3. Publicar no GitHub Pages: o workflow publica a partir da branch `main`.

## Gates

| Gate | Situação |
|---|---|
| 01 Estrutura e identidade | ✅ PWA, paleta (#10243A, #D8AD63, #F7F5F0), navegação lateral (desktop) e barra inferior (celular), manifest, SW. 🟡 A homepage foi recriada a partir da descrição; o desenho aprovado original não estava disponível. |
| 02 Homepage e concurso | ✅ Capa, data, vagas, indicadores, atalhos, "Continue de onde parou", cronograma oficial, provas e pesos, remuneração — tudo com página do edital. |
| 03 Conteúdo oficial | ✅ Anexo II (P1, A01, C03) extraído do PDF: 381 itens, cada um conferido literalmente contra o texto do PDF e com página. Regras (7.1, 8.1), cronograma (Anexo V), vagas e remuneração (2.1). 🟡 Validação pedagógica humana; retificações futuras. |
| 04 Estudo e questões | ✅ Matérias por área e prova, edital com busca e página de origem, uma questão por vez, correção, justificativa, proveniência, sessão preservada. ⛔ Aulas e questões reais dependem do conteúdo. |
| 05 Progresso individual | ✅ Perfis isolados, IndexedDB, histórico, acertos, sequência, domínio por tópico, backup sem duplicar. ✅ Neon Auth, Data API e tabelas com RLS no ar. 🟡 Login Google e sincronização ainda não testados num navegador real. |
| 06 Flashcards e mapas | ✅ Revelar, autoavaliar (4 níveis), revisão espaçada por desempenho, estado reconstruído do log (converge entre aparelhos). Mapas expansíveis; sem mapa publicado, deriva da hierarquia do edital. ⛔ Cartões e mapas dependem do conteúdo. |
| 07 Simulados | ✅ Por matéria, prova completa pela composição oficial, misto, cronômetro, retomada após recarregar, pontuação ponderada, habilitação, diagnóstico de erros, histórico. P3 com cronômetro, rascunho salvo e autoavaliação por critérios. ⛔ Banco amplo de questões. |
| 08 Pareto | ✅ Cálculo usa só incidência marcada como verificada; sem ela, divide igualmente e diz isso na tela. ⛔ Pesquisa das provas anteriores, gabaritos e classificação. |
| 09 Plano adaptativo | ✅ Disponibilidade, meta, prioridade = pontos × (1 − domínio) ÷ esforço, plano do dia com revisões e erros primeiro, cronograma até a prova, recalculado a cada resposta, estimativa de pontos contra a meta. |
| 10 Publicação | ✅ CI (unitários, banco, Playwright desktop + iPhone emulado) e workflow do GitHub Pages. ⛔ Ativar Pages, testar em iPhone real, offline/reconexão com o Neon, homologação com os dois perfis. |

## Limitações conhecidas

- O SDK `@neondatabase/neon-js` está em versão beta (0.8.0-beta). O fluxo de login com Google entre domínios
  (github.io → Neon Auth) precisa ser verificado no Safari do iPhone, que bloqueia cookies de terceiros.
- A estimativa de pontuação é um indicador (pontos × domínio estimado), não uma previsão de nota.
- O esforço por tópico é 1 bloco para todos até o conteúdo trazer `effort`.
