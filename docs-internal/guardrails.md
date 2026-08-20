# Guardrails arquiteturais — DeskClock

> Extraído da §9 do CLAUDE.md em 2026-08-10, verbatim. O CLAUDE.md mantém só as
> regras invioláveis por camada (§9.2 condensada); os procedimentos estão aqui.

> Este projeto passou por análise SOLID/DRY completa em 2026-05-05. As regras abaixo existem para impedir que novas contribuições reintroduzam os antipatterns mapeados. **Violar uma regra exige justificativa explícita ao usuário antes do código rodar.**

### 9.1 Antes de tocar código

- [ ] **Rodou `gitnexus_impact` no símbolo a ser modificado.** Reportar blast radius ao usuário antes de editar.
- [ ] **Identificou em qual camada está mexendo** (`domain/`, `infra/`, `presentation/`, `shared/`) e revisou as regras da camada (§3).
- [ ] **Procurou primeiro abstração existente** em `domain/repositories/` ou `domain/integrations/` antes de instanciar classe concreta.

### 9.2 Regras invioláveis por camada

#### `domain/`
- ❌ **Nunca** importar de `infra/` ou `presentation/`.
- ❌ **Nunca** importar `@tauri-apps/*`, `react`, ou qualquer SDK externo.
- ✅ Apenas tipos puros, interfaces (`I*Repository`, `I*Sender`, `I*Importer`, `ISyncStrategy`), entidades e use cases.

#### `infra/`
- ❌ **Nunca** importar de `presentation/`.
- ❌ **Nunca** depender de `ConfigContextValue` diretamente. Se precisa ler config, declare uma porta estreita (ex.: `ISheetsConfigPort`, `IClockifyConfigPort`) em `domain/integrations/` listando só as chaves usadas. A UI implementa a porta via adaptador. Esta regra existe porque hoje 10 arquivos de `infra/` dependem de uma interface com 65 chaves heterogêneas.
- ✅ Toda classe pública implementa uma interface declarada em `domain/`.

#### `presentation/`
- ❌ **Nunca** instanciar classes concretas de `infra/` em componentes/hooks/modais. Se aparecer `new GoogleSheetsTaskSender(...)`, `new ClockifyClient(...)`, `new GoogleCalendarImporter(...)`, `new AutoSyncRunner([new XSyncStrategy(...)])` em código novo de `presentation/`, **pare e injete via Provider/context**.
- ❌ **Nunca** adicionar `new XxxRepository()` ou `new XxxAdapter()` no nível de módulo. Composition root vai num Provider com prop `value?` injetável.
- ❌ **Nunca** usar `await import("@infra/...")` dinâmico para "esconder" dependência. Se está fazendo isso, é sinal de que falta abstração.
- ❌ **Nunca** suprimir `react-hooks/exhaustive-deps` sem comentário explicando por quê. Hoje há 30+ supressões — não adicione mais.
- ❌ **Nunca** criar, renomear ou excluir Project/Category direto pelo repositório sem chamar `notifyProjectsChanged()` / `notifyCategoriesChanged()` (`shared/utils/catalogSync.ts`). Cada janela tem seu próprio `useProjects`/`useCategories`, e o `overlay-popup` nasce com o app e **nunca remonta**: sem o aviso, ele fica para sempre com o catálogo do momento em que o app abriu, e toda tarefa que aponte para um projeto novo aparece lá sem projeto nem categoria. As mutações dos próprios hooks já avisam — a regra vale para os importadores de integração, que gravam pelo repositório. (O `SetupModal` também gravava, até deixar de cadastrar catálogo; ver §5.9.)

#### `shared/`
- ✅ Apenas utils puros, tipos, constantes. Sem side-effects, sem I/O, sem estado.
- ❌ Não use como "lugar onde colocar quando não sei onde vai" — se é regra de negócio, é `domain/`.

### 9.3 Limites de tamanho (orientações, não regras absolutas)

| Tipo | Verde | Amarelo (revisar) | Vermelho (split obrigatório) |
|---|---|---|---|
| Componente React | < 200 linhas | 200–350 | > 350 |
| Hook customizado | < 80 linhas | 80–150 | > 150 |
| Use case | < 50 linhas | 50–100 | > 100 |
| `useEffect` por componente | ≤ 4 | 5–8 | > 8 (hooks focados) |
| `useState` por componente | ≤ 8 | 9–15 | > 15 (extrair `useReducer` ou hook próprio) |

Quando atingir vermelho: **não adicionar mais features ao símbolo. Refatorar primeiro, feature depois.**

### 9.4 Antes de duplicar lógica — checagem obrigatória

Se você está prestes a:

- **Copiar lógica de uma SyncStrategy** → use `BaseSyncStrategy`/template existente (a ser introduzido pelo item 2 do refactor).
- **Copiar UI de seleção de tarefas (toggleGroup, toggleDay, selKey, hasSentSelected)** → use `<TaskSendModal>`/`useTaskSendSelection` (item 1 do refactor).
- **Copiar UI de envio automático (Modo / Gatilho / Horário / Último envio)** → use `<AutoSyncControls keys={...}>` com as chaves vindas de `autoSyncIntegrations.ts`. Dentro de uma seção que já existe, `shell="inline"`; no nível do card, o padrão `section`.
- **Escrever um "Enviar agora" que monta as deps do `runDailyTemplate` à mão** → é `runDailyFor(nome, todayISO())`. A estratégia já faz isso, e a cópia no componente diverge em silêncio quando a estratégia muda.
- **Copiar lógica de import de catálogo (fetch → find/create → mapping → persist)** → use helper `runIntegrationImport(...)`.

Se a abstração ainda não existe (porque o item de refactor está pending), **pare e pergunte** se vale criá-la agora vs esperar o refactor agendado.

### 9.5 Adicionando uma nova integração externa (Toggl, Jira, Linear…)

Roteiro obrigatório:
1. Criar interface em `domain/integrations/` (ex.: `ITogglApi`, `ITogglConfigPort`).
2. Implementar adaptador em `infra/integrations/toggl/` que `implements` a interface.
3. Se sincroniza tarefas: criar `TogglSyncStrategy implements ISyncStrategy`.
4. Registrar a strategy no Provider central de auto-sync (não em `App.tsx` nem em `usePostStopLogic` — esses dois lugares hoje têm cópias hardcoded; novo trabalho deve usar o ponto único).
4.1. **Registrar as chaves de envio automático em `AUTO_SYNC_INTEGRATIONS`**
   (`presentation/sections/integrations/autoSyncIntegrations.ts`) — inclusive a
   `<integração>AutoSyncLastFiredDate`. É de lá que o `useDailySyncScheduler` descobre o gatilho, e
   é o passo que faltou no Monday: a tela gravava horário fixo, nenhum código lia a chave e o envio
   nunca disparava. Strategy registrada sem entrada aqui só sobe no modo por tarefa.
5. UI consome via hook injetado, **nunca** `new TogglClient()` direto em componente.
6. Adicionar testes em `tests/infra/integrations/toggl/` espelhando a estrutura dos existentes.
7. **Escopar as leituras pelo workspace da integração.** Declare a chave
   `<integração>DeskclockWorkspaceId` no `AppConfig`, resolva-a com
   `resolveIntegrationWorkspaceId` (vazio = workspace "Padrão") e passe o resultado a
   `findAll(ws)` / `findByDateRange(start, end, ws)`. No modo por tarefa, a de outro workspace é
   pulada **sem `warning`**. A integração lê a **própria** config — não recebe workspace por
   parâmetro nem do `WorkspaceContext` (§6.7).

   > **Esta regra dizia o contrário até 2026-08-06** ("integrações são externas ao workspace e
   > enxergam tudo"), e a inversão é o ponto. Sem escopo, o board do cliente recebia as horas do
   > trabalho pessoal e o import nascia em qualquer workspace que estivesse aberto na hora do
   > ciclo. Quem encontrar código escopado e a regra antiga na memória: a regra antiga foi
   > revogada, não esquecida.

### 9.6 Adicionando configuração ao usuário

- ✅ Ao adicionar uma chave em `AppConfig`, considere se cabe numa porta estreita já existente. Se a chave só interessa a uma integração, **declare a porta** em `domain/integrations/` e atualize só os consumidores reais.
- ❌ Não acoplar `ConfigContextValue` ao infra. Se precisa de uma chave dela em `infra/`, passe-a como argumento ou via porta — não receba `ConfigContextValue` inteiro.

### 9.7 Quando o refactor SOLID está em curso

Há um tracker de 10 itens em memória (`project_solid_analysis_2026_05.md`). Antes de tocar um símbolo listado lá, **verificar se o item está em andamento** — pode haver branch ativa. Se sim, coordenar com o usuário em vez de criar conflito.

