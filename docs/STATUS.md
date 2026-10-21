# Estado do projeto

Atualizado em 21/10/2026. Legenda: ✅ feito e testado · 🟡 código pronto, falta dado ou validação externa · ⛔ não feito.

"Testado" quer dizer coberto pelos testes automatizados deste repositório (unitários, banco local e Playwright
com conteúdo **fictício**). Nada foi testado contra o Neon real nem num iPhone físico.

## O que bloqueia o resto

1. **Acesso ao Neon.** O conteúdo oficial (324 fragmentos do edital etc.) está no Neon, mas este repositório
   ainda não o leu. Falta: inspecionar as tabelas, escrever as views de `db/002_content_contract.sql` e exportar.
2. **Neon Auth + Data API** ativados e URLs em `js/config.js`.
3. **Validação humana** do conteúdo: classificação por disciplina (há a divergência 7 × 8 disciplinas comuns),
   questões e materiais.

## Gates

| Gate | Situação |
|---|---|
| 01 Estrutura e identidade | ✅ PWA, paleta (#10243A, #D8AD63, #F7F5F0), navegação lateral (desktop) e barra inferior (celular), manifest, SW. 🟡 A homepage foi recriada a partir da descrição; o desenho aprovado original não estava disponível. |
| 02 Homepage e concurso | ✅ Capa, data, vagas, indicadores, atalhos, "Continue de onde parou", telas de cronograma/provas/carreira/versões. 🟡 Data e vagas vêm de notícias até o pacote oficial trazer `exam`; cronograma, pesos e remuneração aparecem quando exportados do Neon. |
| 03 Conteúdo oficial | 🟡 Exportador com checagens de integridade pronto. ⛔ Views sobre as tabelas reais, revisão da classificação, retificações. |
| 04 Estudo e questões | ✅ Matérias por área e prova, edital com busca e página de origem, uma questão por vez, correção, justificativa, proveniência, sessão preservada. ⛔ Aulas e questões reais dependem do conteúdo. |
| 05 Progresso individual | ✅ Perfis isolados, IndexedDB, histórico, acertos, sequência, domínio por tópico, backup sem duplicar. 🟡 Login Google e sincronização prontos no código, não testados com o Neon real. ✅ RLS testado em Postgres local. |
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
