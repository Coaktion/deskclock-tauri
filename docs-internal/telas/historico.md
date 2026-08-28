# 5.4 Tela de Histórico

> Extraído da §5.4 do CLAUDE.md em 2026-08-10, verbatim.

### 5.4 Tela de Histórico

#### Filtros
- **Rápidos:** Hoje | 7 dias | 30 dias | Este mês.
- **Avançados:** Período início/fim, Nome, Projeto, Categoria, Billable.
- **Botões:** Buscar | Exportar resultados.
- **Os dois blocos de filtro rolam com o resultado.** Só o `PageHeader` fica fixo: a tela tem um
  rolador único, e as pílulas de período, a busca e o painel avançado são os primeiros filhos
  dele. Antes eram irmãos `shrink-0` da área de resultado, presos ao topo.

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
