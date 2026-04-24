# F1 — API REST Local para Integração com Apps Terceiros

> **Status: ✅ Implementada em v1.0.0** — `src-tauri/src/api/`
>
> Documento de planejamento original. Serve como referência histórica das decisões arquiteturais tomadas.

---

## 1. Motivação

Permitir que ferramentas externas (Alfred, Raycast, scripts shell, AutoHotKey,
n8n, Zapier via webhook local, extensões de navegador, etc.) controlem o
DeskClock sem interação direta com a GUI. Casos de uso reais:

- Iniciar tarefa ao abrir um projeto no VS Code
- Parar tarefa ao bloquear a tela
- Dashboard pessoal que consulta o status em tempo real
- Integração com Pomodoro timers

---

## 2. Decisões Arquiteturais

### 2.1 Onde vive o servidor?

**Rust (backend Tauri)** — `axum` rodando em thread separada dentro do `setup()`.

Justificativas:
- Acesso direto ao SQLite sem passar pelo frontend (evita IPC overhead)
- Ciclo de vida atrelado ao app (inicia junto, encerra junto)
- Reutiliza o padrão do `start_oauth_server` que já usa `std::net::TcpListener`
- `axum` é leve, async (tokio), e já usa `serde` que o projeto tem

### 2.2 Banco de dados

O SQLite é single-writer. O frontend usa `tauri-plugin-sql` (acesso via IPC). O
servidor Rust acessaria o mesmo `.db` diretamente via `rusqlite` (ou `sqlx`).

**Risco:** Escritas simultâneas (frontend via IPC + servidor REST) podem causar
`SQLITE_BUSY`. Mitigação: WAL mode + timeout de busy (já é o default do
`tauri-plugin-sql`). Alternativa: rotear todas as escritas via Tauri commands
(o servidor Rust emite eventos internos que o frontend executa). Decisão: usar
**acesso direto com `rusqlite`** + WAL mode, que é o padrão estabelecido por apps
como Obsidian e 1Password para acesso multi-thread.

### 2.3 Sincronização com o frontend

Quando o servidor REST muda o estado de uma tarefa, o frontend precisa saber.
Mecanismo: o servidor Rust emite um evento Tauri (`app.emit(...)`) após cada
mutação. O `RunningTaskContext` já ouve `RUNNING_TASK_CHANGED` — basta emitir
este evento com `source: "api"`.

### 2.4 Autenticação

**Nenhuma por padrão.** O servidor escuta apenas em `127.0.0.1` (não `0.0.0.0`),
acessível somente a processos locais. Isso é equivalente ao modelo do Discord RPC,
OBS WebSocket (que também começou sem auth) e Spotify local API. Uma API key
opcional pode ser adicionada futuramente se houver demanda.

### 2.5 Porta

- **Padrão:** `27420` (arbitrário, fora de ranges conhecidos)
- **Configurável** via settings do app
- Se a porta estiver ocupada: log de aviso, servidor não inicia, status na UI indica erro

---

## 3. Configuração no App

### 3.1 Novas chaves no AppConfig

```typescript
// ConfigContext.tsx — adicionar ao AppConfig
localApiEnabled: boolean;       // default: false
localApiPort: number;           // default: 27420
```

### 3.2 UI na Tela de Integrações

A API local aparece como um **card na IntegrationsPage**, acima do Google
(integrações locais primeiro, externas depois).

```
┌──────────────────────────────────────────────────────┐
│  [icon] API Local            ● Ativo na porta 27420  │
│  Controle o DeskClock via requisições HTTP locais.    │
│                                         [Desativar]  │
├──────────────────────────────────────────────────────┤
│  ▸ Configuração                                      │
│  ▸ Documentação                                      │
└──────────────────────────────────────────────────────┘
```

**Seção "Configuração" (colapsável):**
- Toggle: Ativar API local
- Campo: Porta (input numérico, blur salva, exige restart do servidor)
- Status: Indicador visual (verde = rodando, vermelho = erro, cinza = desativado)
- Mensagem de erro (se porta ocupada, por exemplo)

**Seção "Documentação" (colapsável):**
Texto inline com exemplos de uso para referência rápida, renderizado diretamente
na interface (sem link externo). Conteúdo:

```
Base URL: http://localhost:{porta}

── Status ──
GET /status
Retorna a tarefa em execução (ou null) e totalizadores do dia.

── Iniciar tarefa ──
POST /tasks/start
Body: { "name": "...", "projectId": "...", "billable": true }
Todos os campos são opcionais exceto billable.

── Pausar tarefa ──
POST /tasks/pause
Pausa a tarefa em execução.

── Retomar tarefa ──
POST /tasks/resume
Retoma a tarefa pausada.

── Parar tarefa ──
POST /tasks/stop
Body: { "completed": true }
Para a tarefa ativa. completed indica se foi concluída.

── Alternar (toggle) ──
POST /tasks/toggle
Se não há tarefa: inicia uma nova.
Se está rodando: pausa.
Se está pausada: retoma.

── Listar projetos ──
GET /projects

── Listar categorias ──
GET /categories
```

---

## 4. Endpoints — Especificação Detalhada

### 4.1 `GET /status`

Retorna o estado atual do timer e totais do dia.

**Response 200:**
```json
{
  "running": true,
  "task": {
    "id": "uuid",
    "name": "Reunião de alinhamento",
    "projectId": "uuid",
    "projectName": "Cliente X",
    "categoryId": "uuid",
    "categoryName": "Reunião",
    "billable": true,
    "status": "running",
    "startTime": "2026-04-09T14:00:00.000Z",
    "elapsedSeconds": 1832
  },
  "today": {
    "totalSeconds": 28800,
    "billableSeconds": 25200,
    "nonBillableSeconds": 3600,
    "taskCount": 5
  }
}
```

**Response 200 (sem tarefa ativa):**
```json
{
  "running": false,
  "task": null,
  "today": { ... }
}
```

### 4.2 `POST /tasks/start`

Inicia uma nova tarefa. Para automaticamente qualquer tarefa ativa.

**Request body (todos opcionais exceto billable):**
```json
{
  "name": "Implementar feature X",
  "projectId": "uuid",
  "projectName": "Nome do projeto",
  "categoryId": "uuid",
  "categoryName": "Nome da categoria",
  "billable": true
}
```

Regra de resolução: se `projectId` é fornecido, usa direto. Se apenas
`projectName`, busca o projeto pelo nome. Idem para `categoryId`/`categoryName`.

**Response 201:** Task criada (mesmo formato de `task` no `/status`).

**Response 409:** Erro se a resolução de nome falhar (projeto/categoria não encontrado).

### 4.3 `POST /tasks/pause`

Pausa a tarefa em execução.

**Response 200:** Task pausada.
**Response 404:** Nenhuma tarefa em execução.

### 4.4 `POST /tasks/resume`

Retoma a tarefa pausada.

**Response 200:** Task retomada.
**Response 404:** Nenhuma tarefa pausada.

### 4.5 `POST /tasks/stop`

Para a tarefa ativa (running ou paused).

**Request body:**
```json
{
  "completed": true
}
```

**Response 200:** Task parada (com `endTime` e `durationSeconds`).
**Response 404:** Nenhuma tarefa ativa.

### 4.6 `POST /tasks/toggle`

Atalho: se não há tarefa ativa, inicia nova (com `billable: true`).
Se está rodando, pausa. Se está pausada, retoma.

**Request body (opcional, aplicado apenas se iniciar nova):**
```json
{
  "name": "...",
  "projectId": "...",
  "billable": true
}
```

**Response 200:** Task no estado resultante.

### 4.7 `GET /projects`

**Response 200:**
```json
[
  { "id": "uuid", "name": "Cliente X" },
  { "id": "uuid", "name": "Interno" }
]
```

### 4.8 `GET /categories`

**Response 200:**
```json
[
  { "id": "uuid", "name": "Desenvolvimento", "defaultBillable": true },
  { "id": "uuid", "name": "Reunião", "defaultBillable": false }
]
```

### 4.9 Headers comuns

Todas as respostas incluem:
```
Content-Type: application/json
Access-Control-Allow-Origin: *
```

Todas as respostas de erro seguem o formato:
```json
{
  "error": "Descrição legível do erro"
}
```

---

## 5. Implementação Rust — Estrutura de Arquivos

```
src-tauri/
├── Cargo.toml                  # + axum, tokio, rusqlite
└── src/
    ├── lib.rs                  # setup() inicia o servidor
    ├── api/
    │   ├── mod.rs              # pub mod server, routes, handlers, db
    │   ├── server.rs           # start_api_server(app: AppHandle, port: u16)
    │   ├── routes.rs           # axum Router com todos os endpoints
    │   ├── handlers.rs         # handler functions (status, start, stop, etc.)
    │   └── db.rs               # Acesso SQLite via rusqlite (read/write tasks)
    └── ...
```

### 5.1 Dependências a adicionar no Cargo.toml

```toml
axum = "0.8"
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
rusqlite = { version = "0.32", features = ["bundled"] }
tower-http = { version = "0.6", features = ["cors"] }
```

### 5.2 Inicialização em `lib.rs`

No `setup()`, após o TrayIcon:

```rust
// Lê config do SQLite para verificar se a API está habilitada
// Se sim, inicia o servidor em thread/task separada
let app_handle = app.handle().clone();
std::thread::spawn(move || {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        api::server::start(app_handle).await;
    });
});
```

### 5.3 Sincronização com o frontend

Após cada mutação (start, pause, resume, stop), o handler:

1. Executa a operação no SQLite via `rusqlite`
2. Emite `app.emit("running-task-changed", payload)` para que o
   `RunningTaskContext` e o `OverlayApp` reajam
3. Retorna o JSON de resposta

O frontend já ouve esse evento — a atualização é automática.

### 5.4 Resolução do caminho do banco

O SQLite do Tauri fica em:
```
{app_data_dir}/deskclock.db
```

Obtido via `app.path().app_data_dir()` no Rust.

---

## 6. Fluxo de ativação/desativação

```
Usuário ativa toggle "API Local" na IntegrationsPage
  → config.set("localApiEnabled", true) + config.set("localApiPort", 27420)
  → invoke("start_local_api", { port: 27420 })
  → Rust: inicia axum server na porta
  → UI mostra "● Ativo na porta 27420"

Usuário desativa toggle
  → config.set("localApiEnabled", false)
  → invoke("stop_local_api")
  → Rust: fecha o servidor (graceful shutdown via tokio CancellationToken)
  → UI mostra "○ Desativado"

App inicia
  → Lê localApiEnabled do config
  → Se true: invoke("start_local_api", { port })
```

Tauri commands a adicionar:
- `start_local_api(port: u16) -> Result<(), String>`
- `stop_local_api() -> Result<(), String>`
- `get_local_api_status() -> Result<ApiStatus, String>` (para a UI exibir o estado)

---

## 7. Casos de Uso Mapeados

### 7.1 Automação de contexto (VS Code, terminal)

**Cenário:** Dev abre um projeto no VS Code e quer que o timer inicie automaticamente.

```bash
# .vscode/tasks.json ou script de inicialização
curl -s -X POST http://localhost:27420/tasks/start \
  -H 'Content-Type: application/json' \
  -d '{"name":"Desenvolvimento","projectName":"deskclock-tauri","billable":true}'
```

### 7.2 Launcher (Alfred/Raycast)

**Cenário:** Workflow que mostra status e permite toggle rápido.

```bash
# Status
curl -s http://localhost:27420/status | jq '.task.name // "Nenhuma tarefa"'

# Toggle
curl -s -X POST http://localhost:27420/tasks/toggle
```

### 7.3 Script de fim de expediente

```bash
#!/bin/bash
status=$(curl -s http://localhost:27420/status)
if echo "$status" | jq -e '.running' > /dev/null 2>&1; then
  curl -s -X POST http://localhost:27420/tasks/stop \
    -H 'Content-Type: application/json' \
    -d '{"completed": true}'
  echo "Tarefa parada e concluída."
fi
```

### 7.4 Pomodoro timer externo

```bash
# Inicia trabalho
curl -s -X POST http://localhost:27420/tasks/start \
  -d '{"name":"Pomodoro","billable":true}' -H 'Content-Type: application/json'

# Após 25 minutos
curl -s -X POST http://localhost:27420/tasks/stop -d '{"completed":false}' \
  -H 'Content-Type: application/json'
```

### 7.5 Dashboard web pessoal

```javascript
// Polling a cada 30s
const res = await fetch("http://localhost:27420/status");
const data = await res.json();
// Atualiza UI com data.task, data.today.totalSeconds, etc.
```

### 7.6 Integração com bloqueio de tela (Linux/Windows)

```bash
# Linux (systemd-logind/dbus)
dbus-monitor --session "type='signal',interface='org.gnome.ScreenSaver'" |
while read line; do
  if echo "$line" | grep -q "boolean true"; then
    curl -s -X POST http://localhost:27420/tasks/pause
  elif echo "$line" | grep -q "boolean false"; then
    curl -s -X POST http://localhost:27420/tasks/resume
  fi
done
```

---

## 8. Fases de Implementação

### Fase 1 — Servidor mínimo (MVP)
- Dependências Rust (axum, tokio, rusqlite, tower-http)
- Módulo `api/` com server, routes, handlers, db
- Endpoints: `GET /status`, `POST /tasks/start`, `/tasks/stop`, `/tasks/toggle`
- Emissão de evento Tauri após mutações
- Tauri commands: `start_local_api`, `stop_local_api`
- Chaves de config: `localApiEnabled`, `localApiPort`
- CORS permissivo (`Access-Control-Allow-Origin: *`)

### Fase 2 — UI de configuração
- Card "API Local" na IntegrationsPage
- Toggle + campo de porta + status indicator
- Seção de documentação inline com exemplos curl

### Fase 3 — Endpoints complementares
- `POST /tasks/pause`, `POST /tasks/resume`
- `GET /projects`, `GET /categories`
- Resolução por nome (`projectName` → `projectId`)

### Fase 4 — Robustez (pós-MVP)
- Graceful shutdown via `tokio_util::sync::CancellationToken`
- Retry de porta com fallback
- Log de requisições (integração com `tauri-plugin-log`)
- API key opcional (header `X-API-Key`)

---

## 9. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Porta ocupada | Servidor não inicia | Feedback na UI; porta configurável |
| SQLite lock contention | Escrita falha | WAL mode + busy timeout (5s) |
| App fecha mas servidor não para | Porta presa | Graceful shutdown no `on_exit` |
| Escrita pela API sem sync no frontend | UI desatualizada | Emit evento Tauri após cada mutação |
| Processo malicioso local | Acesso não autorizado | Bind `127.0.0.1` only; API key futura |

---

## 10. Checklist de Validação

- [x] Servidor inicia e responde em `http://localhost:{porta}/status`
- [x] `POST /tasks/start` cria tarefa e o overlay reflete imediatamente
- [x] `POST /tasks/stop` para tarefa e a lista de hoje atualiza
- [x] `POST /tasks/toggle` funciona nos 3 estados (sem tarefa, running, paused)
- [x] Desativar toggle na UI encerra o servidor
- [x] Reativar toggle na UI reinicia o servidor
- [x] Porta ocupada mostra mensagem de erro na UI
- [x] App reiniciado com API ativa: servidor reinicia automaticamente
- [x] Múltiplas requisições simultâneas não causam deadlock

> Swagger UI disponível em `http://localhost:{porta}/docs` (utoipa). Implementação: `src-tauri/src/api/`.

---

*Criado em: 09/04/2026*
