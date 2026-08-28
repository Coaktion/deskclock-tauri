# 5.4 Tela de Histórico

> Extraído da §5.4 do CLAUDE.md em 2026-08-10, verbatim.

### 5.4 Tela de Histórico

#### Filtros
- **Rápidos:** Hoje | Último trabalhado | 7 dias | 30 dias | Este mês.

> **"Último trabalhado" não é "ontem" — é a pergunta que alguém vai fazer olhando o rótulo.**
> Ele resolve para o **último dia com tarefa concluída antes de hoje**, e é justamente por isso
> que atravessa fim de semana, feriado e férias: na segunda de manhã, o dia anterior de trabalho
> é a sexta, não o domingo vazio. E continua sendo a sexta mesmo depois de hoje ganhar registros —
> o corte é por dia, não pelo que já foi lançado.
>
> Quem resolve é `findLastDayWithCompletedTasks(workspaceId, { before: todayISO() })`
> (`ITaskRepository`). O `before` é opcional para não quebrar os mocks espalhados pelos testes, e
> o corte entra na query como o **instante local** em que o dia de corte começa (`startOfDayISO`):
> `start_time` é texto ISO em UTC, e compará-lo cru contra um `AAAA-MM-DD` recortaria o dia errado
> em todo fuso diferente de UTC.
>
> **O rótulo já foi "Dia anterior", e mudou por isso mesmo**: ele prometia *ontem*, e quando o
> filtro saltava para a sexta — ou não trazia nada — parecia defeito. A chave do tipo continua
> sendo `lastDay`; só o texto exibido mudou.
>
> Sem nenhum dia anterior com registro, a busca não encontra nada e o vazio tem **mensagem
> própria**: "Nenhum dia trabalhado antes de hoje". O genérico "Nenhum registro encontrado" não
> serve aqui — sobre um filtro que ninguém preencheu, ele lê como defeito do app em vez de
> resposta. Quem escolhe é `emptyResultMessage` (`sections/history/emptyResultMessage.ts`), a
> partir do `searchedQuick` — **o filtro da busca que rodou**, e não o que está na tela: o painel
> avançado muda `filters.quick` sem buscar. A mensagem chega ao `HistoryTasksTab` por prop, porque
> a aba foi extraída justamente para não guardar estado de filtro.
- **Avançados:** Período início/fim, Nome, Projeto, Categoria, Billable.
- **Botões:** Buscar | Exportar resultados.
- **Os dois blocos de filtro rolam com o resultado.** Só o `PageHeader` fica fixo: a tela tem um
  rolador único, e as pílulas de período, a busca e o painel avançado são os primeiros filhos
  dele. Antes eram irmãos `shrink-0` da área de resultado, presos ao topo.

#### Seção — Resumo por IA

Fica **acima da barra de abas**, dentro do rolador único: ela descreve o resultado inteiro, e não
um dos dois recortes. `sections/history/HistorySummarySection.tsx`, com toda a lógica em
`presentation/hooks/useDaySummaries.ts`.

- **Some por inteiro quando não há provedor de IA configurado** (`isLlmConnected`). Nada de faixa
  convidando a conectar: quem apresenta a integração é o card da tela de Integrações.
- **Nada é gerado sozinho, em nenhuma circunstância.** O único caminho é o botão. Cada dia é uma
  requisição paga, e uma tela que resume ao abrir gastaria a cota de quem só queria conferir as
  horas de ontem.
- **O botão diz quantos dias vai gerar antes do clique** (`summaryButtonLabel`) — "Gerar resumo de
  3 dias". Ele **some** quando não há busca feita ou quando o resultado não tem dia nenhum.
- **Teto de 5 dias por geração** (`MAX_SUMMARY_DAYS`). Passando disso, o rótulo avisa: "Gerar
  resumo dos 5 dias mais recentes" — e são os **mais recentes** que entram. Descobrir o corte
  depois, pelos parágrafos que faltam, pareceria falha. O porquê do número está no use case e em
  `docs-internal/integracoes/llm.md`.
- **Um parágrafo por dia, cada um com a sua data**, no mesmo formato do cabeçalho dos cartões de
  dia logo abaixo (`formatHistoryDayHeader`).
- **Dia já resumido não é regerado**: o use case consulta a tabela `day_summaries` antes de chamar
  o provedor, e grava o que gera. Nunca se paga duas vezes pelo mesmo dia.
- **Erro é por dia e discreto**, com a mensagem já traduzida por `describeLlmError` — a mesma
  tradução do card de Integrações, não uma segunda redação. **Erro não repete sozinho**: quem
  decide tentar de novo é o usuário, pelo mesmo botão.
- **Ao bater no limite de cota, o lote para.** Os dias que sobraram aparecem como "não gerados",
  numa linha só — e não como o mesmo 429 repetido em cada um.
- **Enquanto roda, o botão mostra o andamento** ("Gerando 2 de 5…") e não aceita novo clique.

#### Abas do resultado
O resultado se divide em duas abas, num `SegmentedControl` **grudado no topo do rolador**
(`sticky top-0`, fundo `bg-canvas`, `z-10`) — sem fundo opaco ele deixaria o conteúdo passar por
baixo do texto. É `SegmentedControl` e não pílula porque são duas opções, sempre à vista, com uma
sempre escolhida; e porque, logo abaixo das pílulas de período, um segundo grupo de pílulas
confundiria filtrar com trocar de recorte.

- **Tarefas** (inicial) — a barra de seleção em lote e a lista de entradas por dia.
  `sections/history/HistoryTasksTab.tsx`.
- **KPIs** — a linha do tempo, a distribuição por projeto e os quatro totalizadores.
  `sections/history/HistoryKpisTab.tsx`.

A aba é `useState` da página, e o estado da seleção em lote também: **trocar de aba não refaz a
busca nem desmarca o que estava marcado.**

#### Resultados
- **Totalizadores:** Total horas | Total billable | Total non-billable | Qtd registros — na aba KPIs.
- **Agrupamento por dia:** Header do grupo = "Ter. 7 de abr de 2026 — 8:00" (dia da semana abreviado + data + total de horas do dia).
- **Por grupo-dia:** Botão exportar individual.
- **Por tarefa:** Botões Edit (modal) | Delete (sem confirmação).

---
