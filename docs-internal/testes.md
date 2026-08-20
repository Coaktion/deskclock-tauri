# Estratégia de testes — DeskClock

> Extraído da §7.6 do CLAUDE.md em 2026-08-10, verbatim. Leia antes de escrever teste.

### 7.6 Estratégia de testes

O projeto adota testes **unitários** com Vitest, focados nas camadas testáveis sem dependências de runtime externo (Tauri, DOM, rede).

**O que testamos:**
- `domain/usecases/` — lógica de negócio pura com repositório mockado (`vi.fn()`)
- `infra/database/` — repositórios SQLite com `getDb()` mockado via `vi.mock`
- `infra/integrations/google/` — funções utilitárias puras (ex: `parseRRuleDays`)
- `shared/utils/` — funções utilitárias sem side-effects
- `presentation/hooks/` — hooks cuja lógica decide dados, com `renderHook` (ex:
  `useMultiSelect`, que define o que uma exclusão sem confirmação apaga)
- `presentation/components/ui/` — os primitivos canônicos, com `render`, e **só eles**. É exceção
  explícita à regra abaixo: são contrato compartilhado por dezenas de call sites, e a asserção é
  sobre o contrato (papel ARIA, nome acessível, o que a prop ausente deixa de desenhar), nunca
  sobre classe ou markup. Componente de tela continua sem teste de renderização.

> Não há `@testing-library/jest-dom` no setup — `toBeInTheDocument` não existe. Use
> `expect(...).toBeTruthy()` e os atributos direto do elemento.

> **Corrigido em 2026-07-31.** Esta seção afirmava que `@testing-library/react` "não está
> configurado". Ele está no `package.json` desde antes e já era usado em
> `src/tests/presentation/contexts/ConfigContext.test.tsx` — a afirmação levava agentes a pular
> teste de hook achando que a ferramenta não existia.

**O que não testamos (e por quê):**
- Renderização de componentes React — decisão de custo, não de ferramenta: a asserção é sobre
  markup, que muda a cada ajuste visual. Se a lógica valer teste, ela sai do componente e vira
  hook ou use case.
- `GoogleCalendarImporter` / `GoogleSheetsTaskSender` — dependem de `fetch` externo
- Contexts React acoplados ao runtime Tauri (`RunningTaskContext`)

**Convenções:**
- Arquivos espelham o source: `src/tests/domain/usecases/plannedTasks/CreatePlannedTask.test.ts`
- Factory `makeRepo()` reutilizada por arquivo de teste para minimizar boilerplate
- Casos de teste nomeados em português, descrevendo o comportamento esperado
- **Instante de teste nunca é literal UTC** — use `localISO(ano, mês, dia, hora)`
  (`src/tests/helpers/localTime.ts`). Boa parte da lógica de data raciocina em dia
  local (§6.6): o dia da tarefa, o agrupamento por dia, o `calcDailyRange` do envio
  diário e as colunas de data do Monday. `"2026-07-30T12:00:00.000Z"` é dia 30 em
  São Paulo e dia 31 em Auckland, então o literal fazia a asserção depender do fuso
  da máquina — seis testes passavam na CI e falhavam a partir de UTC+12. Fixar o
  `TZ` da suíte resolveria os sintomas e esconderia o defeito: o que se quer dizer
  é "meio-dia do dia 30 **para quem trabalhou**", e é isso que o helper escreve.

---

