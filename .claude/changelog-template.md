# Template de CHANGELOG — DeskClock

Referência para editar o CHANGELOG.md após `pnpm release:patch|minor|major`.

---

## Como o standard-version gera o cabeçalho

O standard-version escolhe o número de `#` conforme o tipo de versão:

```md
### [1.4.2](...) (2026-05-11)   ← patch  (3 hashes)
## [1.5.0](...) (2026-05-11)    ← minor  (2 hashes)
## [2.0.0](...) (2026-05-11)    ← major  (2 hashes)
```

**Não altere o cabeçalho.** O script de extração do workflow usa esse padrão para localizar a seção correta.

---

## Seções reconhecidas pelo app (AtualizacoesTab)

| Seção no CHANGELOG    | Exibida no app como     |
|-----------------------|-------------------------|
| `### Features`        | Novidades               |
| `### Bug Fixes`       | Correções               |
| `### Performance Improvements` | Melhorias      |
| `### BREAKING CHANGES`| Mudanças importantes    |

Seções com outros nomes são exibidas com o nome original.

---

## Estrutura de uma entrada

```md
### [1.4.2](https://github.com/Coaktion/deskclock-tauri/compare/v1.4.1...v1.4.2) (2026-05-11)


### Features

* **escopo:** descrição curta da novidade
* descrição sem escopo também funciona

### Bug Fixes

* **escopo:** descrição curta da correção

### Performance Improvements

* **escopo:** descrição da melhoria
```

---

## O que editar após `pnpm release:patch`

O standard-version preenche os bullets com as mensagens dos commits. Você pode:

- Remover entradas que não têm relevância para o usuário final
- Reescrever a descrição em português mais claro
- Remover os links de hash no final de cada bullet — `([abc1234](...))` — se preferir texto limpo
- Adicionar bullets manualmente para mudanças não cobertas pelos commits

O que **não** mudar:
- O cabeçalho `### [X.Y.Z](...)` ou `## [X.Y.Z](...)`
- A ordem das seções (gerada automaticamente)

---

## Exemplo após edição manual

```md
### [1.4.2](https://github.com/Coaktion/deskclock-tauri/compare/v1.4.1...v1.4.2) (2026-05-11)


### Features

* **planejamento:** exclusão em massa de tarefas selecionadas
* **calendar:** abre link de videoconferência ao iniciar tarefa importada

### Bug Fixes

* **overlay:** posição do compact overlay preservada após reiniciar
* **shortcuts:** atalho global não registrava após alterar configuração
```

---

## Fluxo completo de release

```bash
# 1. Gera bump de versão, atualiza CHANGELOG e cria tag local
pnpm release:patch   # ou release:minor / release:major

# 2. Edita CHANGELOG.md conforme este template
# (a tag ainda está só local — há tempo para ajustar)

# 3. Amenda o commit do release com o CHANGELOG editado
git add CHANGELOG.md
git commit --amend --no-edit

# 4. Re-aponta a tag — o amend reescreveu o commit, e ela ficou no antigo
git tag -f vX.Y.Z HEAD
git rev-parse vX.Y.Z HEAD   # os dois hashes têm que bater

# 5. Empurra branch e tag — o push da tag dispara o workflow
git push origin develop
git push origin vX.Y.Z
```

### Por que o passo 4 existe

O `standard-version` cria o commit `chore(release): x.y.z` **e** a tag apontando para ele. O
`--amend` do passo 3 troca o commit por outro, de hash diferente — e a tag **não** acompanha:
ela fica no commit órfão, o que tinha o CHANGELOG cru.

O estrago é silencioso. O push da tag funciona, o `release.yml` roda e passa, os instaladores
saem — só que buildados do commit sem o texto reescrito, e o `AtualizacoesTab` do app mostra
ao usuário os bullets do standard-version com hash e URL. Nada falha para avisar.

`git rev-parse vX.Y.Z HEAD` imprime dois hashes: se forem diferentes, a tag está órfã.
