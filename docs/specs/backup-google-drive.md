# Backup do banco no Google Drive — plano de execução

> **Este documento é o handoff.** A execução acontece **uma fase por sessão**, por decisão do
> usuário (2026-08-12), para não gastar contexto. Quem retoma lê a §6 primeiro.
>
> Branch: `feat/backup-google-drive`, saída de **`refactor/design-tokens`** — não de `main`.
> O porquê está na §5.

---

## 1. O que se está construindo

Backup recorrente do banco do DeskClock numa pasta do Google Drive do próprio usuário. **Só
gerar backups** — restaurar não tem UI e não está no escopo; o procedimento manual fica
documentado em `docs/telas/dados.md`.

Recorrência: diária, semanal ou mensal.

## 2. Decisões tomadas — não reabrir sem motivo novo

Todas do usuário, em 2026-08-12.

| Decisão | Escolha | Por quê |
|---|---|---|
| Escopo OAuth | `drive.file`, pasta visível `DeskClock Backups` | Acesso só ao que o app criou. Escopo **não sensível**: dispensa a verificação de segurança (CASA) que o `drive` amplo exige. A pasta é visível para o usuário poder baixar o backup sem passar pelo app — que é o motivo de o backup existir. |
| Credenciais no snapshot | **Expurgadas** antes de subir | O banco guarda `googleRefreshToken`, `clockifyApiKey`, `mondayApiKey` e os tokens do Zendesk. Um arquivo no Drive é bem mais exposto que `app_config_dir`. Preço aceito: restaurar exige reconectar as integrações. |
| Contagem da recorrência | Intervalo desde o último sucesso | 24h / 7d / 30d desde `driveBackupLastRunAt`. Sem âncora de calendário: não há borda de dia 31, e o backup vencido roda assim que o app abre. |
| Lugar na UI | `SubSection` dentro do card do Google, em Integrações | Mesma conexão OAuth de Sheets e Agenda — um card, N chaves. É onde o aviso de reconexão precisa estar. |

### 2.1 Duas coisas que parecem descuido e são decisão

- **Não existe `driveDeskclockWorkspaceId`.** O §9.5 item 7 do `docs/guardrails.md` manda escopar
  toda integração por workspace. Aqui **não se aplica**: o backup é do banco inteiro, que atravessa
  todos os workspaces. Escopar seria errado, não incompleto.
- **Não existe `SyncStrategy`.** O item 3 do mesmo roteiro também não se aplica — isto não
  sincroniza tarefa nenhuma. Valem os itens 1, 2, 5 e 6 (porta em `domain/`, adaptador em `infra/`,
  injeção via Provider, testes espelhando).

### 2.2 O agendador não copia o `useDailySyncScheduler`

O scheduler existente **descarta disparo perdido de propósito** (`src/presentation/hooks/useDailySyncScheduler.ts`,
linhas 76–80): se o app estava fechado no minuto configurado, não roda depois. Para envio de horas
faz sentido — quem não viu a sync acontecer não fica com dúvida sobre quando ela rodou.

Para backup, essa mesma regra é o defeito: um backup mensal às 03:00 do dia 1 pode nunca acontecer.
Por isso o modelo aqui é **vencimento**, não horário. Quem for "uniformizar" os dois está desfazendo
decisão tomada.

## 3. Fases

Ordem obrigatória: 0 → 1 → 2, depois 3 e 4 em paralelo. A 5 acompanha cada fase.

### Fase 0 · Rust: snapshot + upload

**Arquivo novo:** `src-tauri/src/commands/backup.rs`

```rust
#[tauri::command]
pub async fn backup_db_to_drive(
    app: AppHandle,
    access_token: String,
    folder_id: String,
    file_name: String,
    secret_keys: Vec<String>,
) -> Result<String, String>   // devolve o fileId criado
```

Sequência interna:

1. `database::resolve_db_path()` → `VACUUM INTO <app_cache_dir>/backup-snapshot.db`.
   **Não copiar o arquivo**: são 4 janelas conectadas ao mesmo SQLite em modo WAL, e cópia crua
   sobe corrompida ou pela metade — defeito que só aparece no dia em que se precisa do backup.
   `VACUUM INTO` dá snapshot consistente e já compactado.
2. Abre o snapshot, `DELETE FROM config WHERE key IN (…)` com `secret_keys`, e `VACUUM` de novo
   (o `DELETE` deixa as páginas no arquivo — sem o segundo vacuum, o token continua legível nele).
3. `POST multipart/related` em `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`,
   com `reqwest`.
4. Apaga o temporário em **qualquer** desfecho.

Três detalhes que não são livres:

- **Nome fixo do temporário**, em `app_cache_dir()`. Um crash deixa no máximo um órfão, sobrescrito
  na execução seguinte — não um por tentativa.
- **`secret_keys` vem do TS**, não cravado no Rust. A lista precisa morar ao lado de `AppConfig`,
  que é onde uma integração nova acrescenta um token; cravada aqui, ela envelhece calada.
- **Sem dependência nova.** `rusqlite` e `reqwest` já estão no `Cargo.toml`, e `multipart/related`
  é corpo montado à mão — a feature `multipart` do reqwest serve a `form-data`, não a isto.

**Arquivos editados:** `src-tauri/src/commands/mod.rs` (`mod backup;` + `pub use`) e
`src-tauri/src/lib.rs` (entrada no `generate_handler![]`).

Sem mudança em `capabilities/default.json` — comando próprio não é permissão de plugin.

### Fase 1 · Domain: portas e a regra do vencimento

**`src/shared/types/appConfig.ts`** — chaves novas (defaults em `ConfigContext.tsx`):

| Chave | Tipo | Padrão |
|---|---|---|
| `driveBackupEnabled` | `boolean` | `false` |
| `driveBackupFrequency` | `"daily" \| "weekly" \| "monthly"` | `"weekly"` |
| `driveBackupFolderId` | `string` | `""` (ainda não criada) |
| `driveBackupLastRunAt` | `number` | `0` (nunca) |
| `driveBackupLastError` | `string` | `""` |
| `driveBackupKeepCount` | `number` | `10` |

**`src/shared/constants/secretConfigKeys.ts`** (novo) — `SECRET_CONFIG_KEYS`, tipado
`readonly (keyof AppConfig)[]`: tokens do Google, tokens e `zendeskClientSecret` do Zendesk,
`clockifyApiKey`, `mondayApiKey`.

**`src/domain/integrations/IDriveBackupPort.ts`** (novo) — porta estreita no molde de
`ISheetsConfigPort`, só as seis chaves acima.

**`src/domain/usecases/backup/shouldRunBackup.ts`** (novo) — função pura:

```ts
shouldRunBackup(input: {
  enabled: boolean;
  frequency: BackupFrequency;
  lastRunAt: number;
  now: number;
}): boolean
```

`lastRunAt === 0` com `enabled` verdadeiro ⇒ roda na primeira oportunidade. A regra inteira do
agendamento mora aqui, e é testável sem relógio nem rede.

### Fase 2 · Infra: o cliente do Drive

**`src/infra/integrations/googledrive/GoogleDriveClient.ts`** (novo) — só chamadas JSON, via
`fetch`, no molde do `GoogleSheetsTaskSender`:

- `ensureBackupFolder()` — lê `driveBackupFolderId`; vazio ou 404 ⇒ `files.list` por nome +
  `mimeType=application/vnd.google-apps.folder`, cria se não achar, persiste o id.
- `listBackups(folderId)` / `deleteFile(id)` — a poda.

**`src/infra/integrations/googledrive/DriveBackupRunner.ts`** (novo) — o que UI e agendador chamam:

```
getValidAccessToken (GoogleTokenManager, reaproveitado)
  → ensureBackupFolder()
  → invoke("backup_db_to_drive", { …, secretKeys: SECRET_CONFIG_KEYS })
  → grava driveBackupLastRunAt, limpa driveBackupLastError
  → poda: listBackups → apaga o que excede driveBackupKeepCount
```

Nome do arquivo: `deskclock-2026-08-12-1430.db`.

- **A poda roda depois** de gravar o timestamp e dentro de `try` próprio. Higiene de pasta não pode
  custar o backup que já subiu — mesmo raciocínio do `removeOrphans` do Monday
  (`docs/integracoes/README.md`).
- **403 tem tratamento próprio**: vira "reconecte o Google para conceder acesso ao Drive", não o
  texto cru da API. Sem isso, escopo faltante aparece como falha genérica e ninguém descobre o que
  fazer.

**`src/presentation/contexts/IntegrationsContext.tsx`** — `createDriveBackupRunner()` na
`IntegrationFactories`. A UI nunca dá `new DriveBackupRunner(...)`.

### Fase 3 · Agendador

**`src/presentation/hooks/useDriveBackupScheduler.ts`** (novo) — poll de 5 min + checagem no boot,
chamando `shouldRunBackup`. Guarda de reentrância por `useRef`.

**`src/App.tsx`** — montado ao lado de `useDailySyncScheduler`, no `AppInner`. **Janela principal
só** — nas outras três, quatro backups concorrentes.

O comentário no topo do hook explica por que ele não copia o `useDailySyncScheduler` (§2.2).

### Fase 4 · UI

**`src/presentation/sections/integrations/GoogleIntegrationSection.tsx`** — terceiro
`<SubSection icon={<DatabaseBackup size={14} />} title="Backup do banco">`, depois de Sheets e
Calendar. Conteúdo: `Toggle` de ativar · `SegmentedControl` de frequência (Diário/Semanal/Mensal) ·
`Button variant="secondary"` "Fazer backup agora" com `loading` · linha `caption` com "Último
backup: …" ou o erro, no molde da `SyncFeedbackLine`.

**`ALL_GOOGLE_SCOPES`** ganha `https://www.googleapis.com/auth/drive.file`.

> **Quem já conectou o Google precisa reconectar.** O `refresh_token` guardado carrega os escopos
> concedidos no consentimento; acrescentar o escopo à lista não revalida nada, e a primeira chamada
> ao Drive volta 403. A subseção mostra o aviso enquanto `driveBackupLastError` indicar escopo
> faltante. É o único ponto desta feature que mexe com quem já usa o app.

Restrições da fase: tudo por primitivo (`Button`, `IconButton`, `Toggle`, `SegmentedControl`) —
`componentPrimitives.test.ts` tem baseline **por arquivo**, e um `<button>` novo à mão em
`GoogleIntegrationSection.tsx` reprova. Token semântico, nunca cor crua. Verificar nos 2 modos ×
4 acentos. A rodada de `docs/specs/design-system-fidelity.md` **não** tem etapa sobre esta tela —
conferido em 2026-08-12.

### Fase 5 · Testes e docs

- `src/tests/domain/usecases/backup/shouldRunBackup.test.ts` — as três frequências, `lastRunAt: 0`,
  desligado, a borda exata do vencimento.
- `src/tests/infra/integrations/googledrive/GoogleDriveClient.test.ts` e `DriveBackupRunner.test.ts`
  — `fetch` e `invoke` mockados: pasta criada uma vez só, pasta apagada pelo usuário sendo
  recriada, poda respeitando `keepCount`, 403 virando a mensagem de reconexão, falha da poda não
  desfazendo o sucesso, timestamp não avançando em falha.
- `src/tests/shared/secretConfigKeys.test.ts` — trava no molde das outras: toda chave de `AppConfig`
  que casa `/token|apikey|secret|password/i` está em `SECRET_CONFIG_KEYS` ou numa lista explícita de
  isentas. É o que impede a integração nº 6 de mandar o token dela para o Drive sem ninguém notar.
- `docs/integracoes/google.md` — a subseção, o escopo `drive.file`, o recado de reconexão.
- `docs/telas/dados.md` — o restore manual: fechar o app, substituir o arquivo em `app_config_dir`,
  reconectar as integrações. É o contrapeso de termos expurgado os segredos.

## 4. O que fica sem cobertura, declaradamente

O comando Rust (`VACUUM INTO`, expurgo, upload) **não tem teste** — o projeto não tem
infraestrutura de teste em Rust, e criá-la está fora do escopo. Foi por isso que toda a lógica
testável (pasta, poda, vencimento, erro) ficou em TS.

Validação manual dele, uma vez, ao fim da Fase 2:

```
rodar o backup → baixar o .db do Drive → sqlite3 arquivo.db
  SELECT * FROM config WHERE key LIKE '%oken%';   -- deve voltar vazio
  SELECT COUNT(*) FROM tasks;                     -- deve bater com o app
```

## 5. Por que a branch sai de `refactor/design-tokens`

`src/presentation/components/ui/` **não existe em `main`** — os 21 primitivos, a migração inteira
do design system, vivem só naquela branch, que está à frente e não foi mergeada. Ela já toca cinco
dos arquivos deste plano (`App.tsx`, `ConfigContext.tsx`, `appConfig.ts`,
`GoogleIntegrationSection.tsx`, `integrations/shared.tsx`).

Sair de `main` significaria escrever a Fase 4 no vocabulário visual antigo e reescrevê-la inteira
depois. Decisão do usuário em 2026-08-12, com o custo à vista: **o PR do backup só vai para `main`
depois que a migração entrar**, ou carrega ela junto.

## 6. Retomando numa sessão nova

1. `git checkout feat/backup-google-drive`
2. Ler este documento inteiro (é curto de propósito) e o `CLAUDE.md` do projeto.
3. Identificar a próxima fase pendente no quadro abaixo. **Implementar só ela.**
4. Ao terminar: `pnpm lint`, `pnpm test`, verificar que compila, commit semântico, atualizar o
   quadro abaixo no mesmo commit.
5. Fase 4 pede também `pnpm tauri dev` nos 2 modos × 4 acentos.

### Estado

| Fase | Estado |
|---|---|
| 0 · Rust: snapshot + upload | pendente |
| 1 · Domain: portas e vencimento | pendente |
| 2 · Infra: cliente do Drive | pendente |
| 3 · Agendador | pendente |
| 4 · UI | pendente |
| 5 · Testes e docs | acompanha cada fase |

### Rollback

Desligar `driveBackupEnabled` faz o comportamento sumir. Reverter o merge desfaz o resto: as chaves
órfãs em `config` são inertes (o `ConfigRepository` só lê o que o `AppConfig` declara) e **não há
migration nova**, então não há downgrade de schema.
