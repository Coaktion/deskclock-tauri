# Migration Findings — Follow-ups

Itens fora do escopo do refactor atual, documentados para PRs separados.

---

## 1. `fix/handle-sync-now-validation` — UI ignora validação de campos obrigatórios

**Contexto:** Em `GoogleIntegrationSection.handleSyncNow`, o `runDailyTemplate` é chamado com `validate: () => true`, ignorando `validateTaskForSheets`. Isso significa que tarefas sem nome, projeto ou categoria são enviadas ao Sheets sem warning.

**Comportamento correto esperado:** Passar `validate: (t) => validateTaskForSheets(t).ok` e exibir o warning de inválidas no toast.

**Fix estimado:** ~2 linhas.

**Branch sugerida:** `fix/handle-sync-now-validation`

---

## 2. Race condition — auto-sync diário ↔ "Sincronizar agora" manual

**Contexto:** Tanto `SheetsSyncStrategy.runDaily` (via `AutoSyncRunner`) quanto `handleSyncNow` escrevem `sheetsDailySyncLastTimestamp` e chamam `markSent` para o mesmo `logKey = "google_sheets"`. Se ambos rodarem concorrentemente (ex: auto-sync disparado ao abrir o app enquanto o usuário clica "Sincronizar agora"), podem ocorrer:
- Duplicação de envio se ambos passam pelo `findSentIds` antes de qualquer `markSent` completar.
- Conflito de timestamp: o valor final depende de qual `set` completa por último.

**Pré-condição para bug:** Probabilidade baixa em uso normal, mas aumenta com `trigger: "on-open"` + usuário clicando imediatamente.

**Investigar:** Verificar se `markSent` usa `INSERT OR IGNORE` (idempotência). Se sim, duplicação de envio é o único risco real.

**Branch sugerida:** `fix/sync-race-condition`

---

## 3. Range crescente quando todas as tarefas completed são inválidas

**Contexto:** `SheetsSyncStrategy.runDaily` e `ClockifySyncStrategy.runDaily` (via `runDailyTemplate`) não atualizam o timestamp quando `valid.length === 0` (todas as tarefas do período são inválidas). Isso faz o range crescer indefinidamente: no próximo auto-sync, `calcDailyRange` vai incluir todos os dias desde o último timestamp bem-sucedido.

**Comportamento atual:** Preservado intencionalmente neste refactor (CLAUDE.md §9.6). Pode ser desejável para "retry" automático quando a validação for corrigida.

**Decisão pendente:** Setar timestamp mesmo em empty (limpa o backlog, sem retry) vs. manter para retry automático.

**Branch sugerida:** `fix/daily-sync-empty-range`
