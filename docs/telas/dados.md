# 5.6 Tela de Dados

> Extraído da §5.6 do CLAUDE.md em 2026-08-10, verbatim.

### 5.6 Tela de Dados

#### Projetos
- **Importação em massa:** Textarea, um projeto por linha.
- **Lista:** Filtro por nome + adicionar individualmente + excluir sem confirmação.

#### Categorias
- **Importação em massa:** Textarea, uma categoria por linha. Prefixo `!` = non-billable (ex: `!Reuniões`). Sem prefixo = billable.
- **Lista:** Filtro por nome + adicionar individualmente (com toggle billable) + excluir sem confirmação.

#### Seleção múltipla (Projetos e Categorias)
- **Checkbox por linha.** Clicar em qualquer ponto da linha alterna a seleção; renomear e excluir param a propagação e continuam fazendo só o que prometem. Durante a edição inline a linha não alterna nada.
- **"Selecionar todos"** no topo da lista, com estado indeterminado quando a seleção é parcial. O rótulo também é clicável.
- **Exclusão em massa** sem confirmação (§1). O botão fica sempre no fluxo, invisível enquanto não há seleção — mostrar e esconder deslocaria a lista.
- **A seleção é sempre a interseção com o que está visível.** Filtrar não deixa selecionado nada fora da tela: como não existe desfazer, o número na barra tem de ser exatamente o que será apagado. A regra vive em `useMultiSelect` (genérico por id) — **não** reaproveitar `useTaskSendSelection`, que é acoplado a `TaskGroup` e dia (§9.4).

#### Categorias por projeto
- **Na linha do projeto**, uma pílula com a contagem (ou "todas") abre o bloco de associação. Ela
  fica **sempre visível**, ao contrário de renomear e excluir: carrega estado, e escondê-la no hover
  esconderia a informação junto com o controle.
- **Cada clique grava**, como o toggle de billable das listas de tarefas — não há botão de salvar.
- **"Desmarcar todas" aparece com mais de uma marcada** — com uma só, a própria caixa já é o botão.
  É o caminho de volta ao "oferece todas", e apaga também as do Monday, como a caixa individual.
- **Sem associação, o projeto oferece o catálogo inteiro** (§6.4). O bloco diz isso em texto: é o
  estado de todo projeto até alguém marcar algo, e sem a frase parece que a associação se perdeu.
- **As linhas semeadas pelo Monday aparecem marcadas e são removíveis**, mas a remoção vale só até a
  próxima varredura — para tirar de vez, remova o Activity Type do quadro. É esta tela a saída de
  emergência do filtro duro, e por isso ela existiu **antes** da semeadura.

#### Workspaces
- **Criar:** nome + seletor de cor. A cor sugerida é o primeiro slot ainda não usado da paleta e **não muda enquanto se digita** — só o seletor a altera.
- **Editar:** nome e cor inline.
- **Tornar ativo:** cada linha inativa tem a ação; havendo tarefa em execução, pergunta Concluída/Pendente antes de trocar.
- **Excluir:** abre modal com o destino obrigatório dos dados (mover para outro workspace ou apagar). **Exceção deliberada** ao §1 "exclusões sem confirmação" — um workspace pode guardar meses de horas e não há desfazer. Excluir o último é bloqueado.

---
