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

**Status:** ⬜

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

**Status:** ⬜

**Descrição:**  
Atualmente o fluxo OAuth usa **Authorization Code + client_secret**, que fica embutido no bundle compilado do app e pode ser extraído por qualquer pessoa com acesso ao instalador. O fluxo **PKCE (Proof Key for Code Exchange)** elimina a necessidade do `client_secret` em apps desktop — foi criado exatamente para esse cenário.

**Problema atual:**
```typescript
// client_secret compilado no bundle — visível após descompactar o instalador
const CLIENT_SECRET = import.meta.env.GCP_CLIENT_SECRET as string;
```

**Solução com PKCE:**
```
1. App gera code_verifier (aleatório) + code_challenge (SHA-256 do verifier)
2. Inicia OAuth enviando code_challenge — sem client_secret
3. Google devolve o code
4. App troca code por token enviando code_verifier — Google valida o hash
5. Sem client_secret em nenhuma etapa
```

**O que muda na implementação:**
- Remover `GCP_CLIENT_SECRET` do `.env` e do código
- Adicionar geração de `code_verifier` e `code_challenge` no frontend antes de iniciar o fluxo
- Atualizar a troca de `code` por token para usar `code_verifier` em vez de `client_secret`
- Backend Rust (servidor OAuth local) não muda
- Configurar o app no Google Cloud Console como **Desktop app sem secret**

**Impacto:**
- `GCP_CLIENT_SECRET` sai completamente do projeto
- `.env` passa a ter apenas `GCP_CLIENT_ID`
- Conformidade com as políticas do Google para apps OAuth públicos

**Referência de decisão:** CLAUDE.md — Registro de Decisões 09/04/2026 (OAuth via Authorization Code aceito como trade-off de MVP)

---

*Última atualização: 24/04/2026*
