# Clockify

> Extraído da §5.7 do CLAUDE.md em 2026-08-10, verbatim.
> Contrato comum a todas as integrações: `docs/integracoes/README.md`.

**Clockify:**
| Campo | Tipo |
|---|---|
| API Key | input password + instrução inline |
| Workspace DeskClock | dropdown com os workspaces do app (`clockifyDeskclockWorkspaceId`) |
| Workspace Clockify | dropdown (buscado via API). Chamava-se "Workspace ativo" — com o do DeskClock logo acima, "ativo" deixou de dizer qual dos dois |
| Importar projetos | botão → cria Projects no DeskClock + mapeamento automático |
| Importar tags | botão → cria Categories no DeskClock + mapeamento automático |
| Mapeamento de projetos | tabela DeskClock Project ↔ Clockify Project (por workspace) |
| Mapeamento de categorias | tabela DeskClock Category ↔ Clockify Tags (multi-select, por workspace) |
| Tags padrão | multi-select de tags sempre incluídas em todo envio |
| Sincronização automática | toggle + modo (por tarefa / diário) + gatilho (ao abrir / horário fixo) |
| Gerenciar apontamentos | botão abre modal com CRUD direto sobre as time entries do workspace ativo (filtro por período + filtro por tags padrão; entries em andamento são ocultadas) |
