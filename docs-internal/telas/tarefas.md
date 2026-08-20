# 5.2 Tela de Tarefas (página principal)

> Extraído da §5.2 do CLAUDE.md em 2026-08-10, verbatim. **A seção 2 foi reescrita em
> 2026-08-19**, quando as planejadas do dia deixaram o bloco próprio e voltaram a ser a lista
> suspensa do omnibox.

### 5.2 Tela de Tarefas (página principal)

**Layout de cima para baixo:**

#### Seção 1 — Tarefa atual em execução
- Exibe todos os dados preenchidos + timer ativo.
- Campo de hora de início editável — ao alterar, recalcula o timer.
- **Botões:** Play/Pause | Stop | Edit | Cancel
- **Edit:** Abre campos inline: Nome, Projeto (autocomplete), Categoria (autocomplete), Billable toggle. Botões: Salvar / Cancelar.
- **Cancel:** Descarta a tarefa imediatamente, sem confirmação.
- **Atalhos globais:** Se configurados, exibir abaixo como texto informativo (ex: "Ctrl+Shift+S para parar").

#### Seção 2 — Tarefas planejadas para hoje (dentro do omnibox)
- **Não há bloco próprio na tela.** As planejadas pendentes do dia são a lista suspensa do omnibox:
  ela abre ao focar o campo e o texto digitado a filtra (`matchPlannedTasks`, busca fuzzy pelo nome).
- A lista é **flutuante** — pendurada no card, fora do fluxo. Em fluxo, abri-la a cada foco
  empurraria KPIs e Entradas tela abaixo, que é metade da queixa que a tirou daqui em `86e3245`.
- Ela **sobrepõe** de fato: recuada 8px de cada lado do card e 8px abaixo dele, com a sombra
  `--shadow-overlay`. Sem isso, painel e faixa de KPI ficavam a 0,025 de lightness um do outro no
  modo escuro, e a lista lia como mais uma seção da página. Ver a skill `design-system`.
- Mostra **quatro tarefas inteiras** (236px de teto) e deixa a quinta assomar cortada, que é o que
  indica que a lista rola.
- Cada linha é um `TaskRow`: ponto na cor do projeto, nome, `projeto · categoria` e o chip de
  faturamento, que **continua alternando** (o `BillableChip` barra a propagação, então alterná-lo
  não dispara a linha).
- **Clicar na linha inicia a tarefa na hora**, com o vínculo (`plannedTaskId`) e os campos
  personalizados da planejada. Pelo teclado: ↑/↓ andam pela lista e Enter inicia a ativa; com a
  lista fechada ou vazia, Enter inicia o rascunho como tarefa avulsa. ESC fecha só a lista.
- Rodapé da lista: **"Ver semana →"**, que leva ao Planejamento.
- As ações configuradas ficam disponíveis como chips clicáveis no Popup Flyout durante a execução (ver §6.5).

> **Nota:** O lançamento retroativo foi movido para uma tela dedicada na sidebar (ver 5.8). A ideia de "botão que abre modal" foi descartada — a tela dedicada permite entrada em sequência de múltiplas tarefas com muito mais agilidade.

#### Seção 3 — Totalizadores
- Horas billable hoje | Horas non-billable hoje | Total semana com dias (ex: "15:00 2d").
- Os quatro cartões ocupam a **linha inteira**, como o design desenha. O arranjo em 2×2 existia
  para dividir a linha com o bloco de planejadas e saiu com ele.

#### Seção 4 — Entradas de hoje
- **Header:** Título "Entradas de Hoje" + total de horas hoje.
- **Lista de tarefas registradas hoje:**
  - Card exibe: Nome, Projeto, Categoria, indicador billable (clicável para alternar), duração.
  - **Botões por card:** Play (inicia nova execução com os mesmos dados, se não houver tarefa em andamento) | Edit (modal completo) | Delete (sem confirmação).
- **Agrupamento:** Tarefas com mesmo Nome + Projeto + Categoria são agrupadas visualmente.
  - Grupo exibe duração total.
  - Botão "Unificar" no grupo → mescla em registro único somando durações, sem confirmação.
  - Edit no grupo → altera todas as tarefas do grupo.
  - Expandir grupo → editar/excluir tarefa individual.

---
