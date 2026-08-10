# 5.5 Exportação de Tarefas

> Extraído da §5.5 do CLAUDE.md em 2026-08-10, verbatim.

### 5.5 Exportação de Tarefas

#### Perfis de exportação
- CRUD completo com um perfil padrão pré-existente (editável).
- Interface simples: lista de perfis + criar novo / editar / excluir.

#### Configuração do perfil
- **Período:** Hoje | Personalizado (início + fim).
- **Formato:** CSV | JSON.
- **Separador (CSV):** Vírgula | Ponto-e-vírgula.
- **Formato de duração:** HH:MM:SS | Decimal | Minutos.
- **Formato de data:** ISO (AAAA-MM-DD) | DD/MM/AAAA.
- **Colunas:** Reordenáveis via drag-and-drop. Toggle de visibilidade por coluna. Nome editável por coluna.

#### Seleção de tarefas
- Todas selecionadas por padrão. Selecionar todas / Desmarcar todas / Individual.
- Tarefas agrupadas geram registro único com duração totalizada.

#### Destino
- Salvar arquivo | Copiar para área de transferência | Enviar para integração externa.

---
