# FEATURES_PLANEJADAS.md — Backlog de Features Futuras

> Features planejadas mas ainda não priorizadas para implementação. Cada item deve ser refinado antes de entrar em sprint.
>
> Legenda: `⬜` pendente · `🔧` em refinamento

---

## F1 — API Local (REST/WebSocket)

**Status:** ✅ concluída (v1.0.0)

**Implementação:**  
Servidor axum em Rust, porta `27420` (configurável), bind em `127.0.0.1`. Documentação interativa via Swagger UI (`/docs`). Habilitável nas Configurações.

**Endpoints implementados:** `GET /status`, `POST /tasks/start`, `/tasks/stop`, `/tasks/toggle`, `/tasks/pause`, `/tasks/resume`, `/tasks/cancel`, `GET /projects`, `GET /categories`, CRUD completo de tarefas planejadas (7 endpoints com regras de recorrência em Rust).

**Decisões tomadas:** sem autenticação (bind local), sem WebSocket (polling suficiente para casos de uso), evento Tauri `running-task-changed` emitido após cada mutação para sincronizar a UI.

**Referência:** `docs/F1_LOCAL_REST_API.md` (doc de planejamento), `src-tauri/src/api/`

---

## F2 — Sistema de Login / Conta

**Status:** ⬜

**Descrição:**  
Permitir uso pessoal vs. profissional com perfis separados. Cada perfil teria seus próprios projetos, categorias, configurações e histórico.

**Pontos a refinar antes da implementação:**
- Escopo: perfis locais (offline) ou conta na nuvem?
- Impacto na arquitetura do banco de dados
- Fluxo de migração de dados de instalações existentes

---

## F3 — Arredondamento Automático de Duração

**Status:** ✅ concluída (v1.3.0)

**Descrição:**  
Feature flag nas configurações do app. Quando ativada, ao parar uma tarefa, a duração registrada é arredondada para o intervalo de tempo mais próximo (configurável).

**Comportamento esperado:**
- O usuário ativa a feature em Configurações → Geral
- Ao parar uma tarefa, a duração é arredondada conforme as preferências salvas
- O `startTime` da tarefa não é alterado — apenas o `endTime` é ajustado para refletir a nova duração

**Slots de arredondamento (fixos):**  
A duração é arredondada para o múltiplo de 5 minutos mais próximo: 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60 min — e assim por diante para durações maiores que 1h (65, 70, 75…).

Exemplo: tarefa de 22 min → arredonda para **20 min** (pra baixo) ou **25 min** (pra cima).

**Configurações necessárias:**
| Configuração | Tipo | Opções |
|---|---|---|
| Arredondamento ativado | toggle | on/off |
| Direção do arredondamento | select | Para cima · Para baixo |

**Pontos a refinar antes da implementação:**
- Exibir ou não o valor original ao lado do arredondado na task card
- Comportamento quando a tarefa é pausada e retomada (arredonda a duração total? cada segmento?)
- Aplicar também em tarefas do lançamento retroativo?

---

## F4 — Modos de Sincronização com Google Sheets

**Status:** ✅ concluída (v1.1.0)

**Implementação:**  
Três modos disponíveis nas configurações de integração Google Sheets:
| Modo | Status |
|---|---|
| Por tarefa | ✅ — envia ao concluir cada tarefa (auto-sync em `RunningTaskContext`) |
| Diário — ao abrir o app | ✅ — envia tarefas desde o último envio ao iniciar o app |
| Diário — horário fixo | ✅ — cron interno dispara no horário configurado pelo usuário |

Envio por range (desde último envio) evita duplicidades. Indicador "Sincronizado · há Xmin" visível na UI. Comportamento se app estava fechado no horário: envio executado na próxima abertura.

---

---

## S1 — Migrar OAuth para PKCE (Segurança)

**Status:** ✅ concluída (branch `fix/pkce-oauth`)

**Implementação:**  
PKCE (RFC 7636) adicionado como camada de segurança sobre o fluxo Authorization Code. O par `code_verifier` / `code_challenge` é gerado via Web Crypto API (`src/infra/integrations/google/pkce.ts`) antes de abrir o browser; o `code_challenge` vai na URL de autorização e o `code_verifier` é enviado na troca do code por token.

**Limitação descoberta:** clientes OAuth do tipo "Desktop application" no Google Cloud Console ainda exigem `client_secret` na troca de code e no refresh — o PKCE para esse tipo de cliente é complementar, não substituto. O `client_secret` permanece no bundle, mas o `code_verifier` protege contra interceptação do authorization code (atacante que capture o code não consegue trocá-lo sem o verifier).

**Arquivos alterados:** `pkce.ts` (novo), `GoogleOAuth.ts`, `GoogleTokenManager.ts`, `GoogleTokenManager.test.ts`

---

*Última atualização: 28/04/2026*
