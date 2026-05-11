---
description: Analisa os commits da versão recém-gerada pelo standard-version e reescreve o CHANGELOG.md com linguagem orientada ao usuário
allowed-tools: Bash(git log:*), Bash(git describe:*), Bash(git diff:*), Read, Edit, Bash(git add:*), Bash(git commit:*)
---

## Template de referência

!`cat docs/changelog-template.md`

## Versão gerada pelo standard-version

- Tag atual: !`git describe --tags --abbrev=0`
- Tag anterior: !`git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "(nenhuma)"`

## Commits desta versão (excluindo o commit de release)

!`git log "$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null)..HEAD^" --pretty=format:"- %s" --no-merges 2>/dev/null || git log HEAD^ --pretty=format:"- %s" --no-merges`

## Entrada atual no CHANGELOG.md (gerada automaticamente)

!`head -80 CHANGELOG.md`

---

## Tarefa

Reescreva a entrada desta versão no CHANGELOG.md seguindo estas regras:

1. **Preserve o cabeçalho** exatamente como o standard-version gerou — `### [X.Y.Z](...)` para patch, `## [X.Y.Z](...)` para minor/major. Não altere nada nessa linha.
2. **Agrupe** os commits nas seções corretas: `### Features`, `### Bug Fixes`, `### Performance Improvements`. Use apenas seções que tiverem ao menos um item.
3. **Reescreva** cada bullet em português claro, orientado ao usuário final — sem hashes de commit, sem jargão técnico interno, sem URLs.
4. **Omita** commits sem impacto visível ao usuário: `refactor:`, `docs:`, `chore:`, `test:`, `ci:`, `style:`.
5. **Mantenha o escopo** (`**scope:**`) somente quando contextualiza a mudança para o usuário. Remova escopos puramente técnicos.
6. **Não toque** nas entradas de versões anteriores.

Ao terminar a edição, mostre o diff com `git diff CHANGELOG.md` e aguarde confirmação explícita do usuário antes de executar:

```
git add CHANGELOG.md
git commit --amend --no-edit
```

Não execute o commit sem confirmação.
