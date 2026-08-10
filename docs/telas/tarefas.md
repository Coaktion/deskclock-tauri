# 5.2 Tela de Tarefas (página principal)

> Extraído da §5.2 do CLAUDE.md em 2026-08-10, verbatim.

### 5.2 Tela de Tarefas (página principal)

**Layout de cima para baixo:**

#### Seção 1 — Tarefa atual em execução
- Exibe todos os dados preenchidos + timer ativo.
- Campo de hora de início editável — ao alterar, recalcula o timer.
- **Botões:** Play/Pause | Stop | Edit | Cancel
- **Edit:** Abre campos inline: Nome, Projeto (autocomplete), Categoria (autocomplete), Billable toggle. Botões: Salvar / Cancelar.
- **Cancel:** Descarta a tarefa imediatamente, sem confirmação.
- **Atalhos globais:** Se configurados, exibir abaixo como texto informativo (ex: "Ctrl+Shift+S para parar").

#### Seção 2 — Tarefas planejadas para hoje
- Lista compacta: Nome + botão Play.
- Play inicia execução com dados da tarefa planejada preenchidos. As ações configuradas ficam disponíveis como chips clicáveis no Popup Flyout durante a execução (ver §6.5).

> **Nota:** O lançamento retroativo foi movido para uma tela dedicada na sidebar (ver 5.8). A ideia de "botão que abre modal" foi descartada — a tela dedicada permite entrada em sequência de múltiplas tarefas com muito mais agilidade.

#### Seção 3 — Totalizadores
- Horas billable hoje | Horas non-billable hoje | Total semana com dias (ex: "15:00 2d").

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
