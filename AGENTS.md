# DeskClock — Instruções para agentes de IA

**Fonte da verdade:** [`CLAUDE.md`](./CLAUDE.md). Leia o arquivo completo antes de qualquer mudança. Em particular, **§9 (Guardrails arquiteturais)** lista regras invioláveis para evitar que novas contribuições reintroduzam os antipatterns mapeados na análise SOLID/DRY de 2026-05-05.

Resumo do que `CLAUDE.md` cobre:

- Visão e princípios de produto (§1, §5)
- Stack e arquitetura Clean (§2, §3)
- Modelo de dados e regras de negócio (§4, §6)
- Workflow de desenvolvimento, testes, branches, commits (§7)
- Convenções de código e design system (§8)
- **Guardrails arquiteturais — regras invioláveis por camada, limites de tamanho, checagem anti-DRY, roteiro para nova integração (§9)**

Antes de implementar qualquer feature ou refactor, valide o plano contra §9.

---

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **deskclock-tauri** (3635 symbols, 7846 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/deskclock-tauri/context` | Codebase overview, check index freshness |
| `gitnexus://repo/deskclock-tauri/clusters` | All functional areas |
| `gitnexus://repo/deskclock-tauri/processes` | All execution flows |
| `gitnexus://repo/deskclock-tauri/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
