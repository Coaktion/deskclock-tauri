import { useEffect, useLayoutEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { useWorkspaceAdmin } from "@presentation/hooks/useWorkspaceAdmin";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import {
  notifyCategoriesChanged,
  notifyCustomFieldsChanged,
  notifyProjectCategoriesChanged,
  notifyProjectsChanged,
} from "@shared/utils/catalogSync";
import { notifyTasksChanged } from "@shared/utils/taskSync";
import { todayISO } from "@shared/utils/time";
import { waitsForNextCommit, dispatchLocalApiRequest } from "./dispatch";
import { errorResult } from "./errors";
import { claimRequestId, createSerialQueue, waitForSignal } from "./queue";
import type { LocalApiDeps, LocalApiParams } from "./types";

const REQUEST_EVENT = "local-api:request";
// Teto da espera pelo render depois de mexer em estado de contexto. Uma op que
// falhou não muda estado nenhum, e sem teto a fila pararia esperando.
const COMMIT_WAIT_MS = 300;

interface BridgeRequest {
  id: string;
  op: string;
  params: LocalApiParams | null;
}

/**
 * Atende a API local na janela principal: o Rust recebe o HTTP e repassa para
 * cá (`docs-internal/specs/api-local-nucleo.md` §3). Montado uma vez, dentro
 * do `RunningTaskProvider`.
 */
export function useLocalApiBridge(): void {
  const repos = useRepositories();
  const running = useRunningTask();
  const { activeWorkspaceId, switchTo } = useWorkspaces();
  const { create, update, remove } = useWorkspaceAdmin();
  const depsRef = useRef<LocalApiDeps | null>(null);
  const commitListeners = useRef(new Set<() => void>());

  // Sem lista de dependências de propósito: roda a cada commit. As operações
  // do contexto fecham sobre a tarefa em execução do render, então a próxima
  // requisição só pode começar com o retrato deste commit.
  useLayoutEffect(() => {
    depsRef.current = {
      taskRepo: repos.taskRepo,
      plannedTaskRepo: repos.plannedTaskRepo,
      projectRepo: repos.projectRepo,
      categoryRepo: repos.categoryRepo,
      workspaceRepo: repos.workspaceRepo,
      projectCategoryRepo: repos.projectCategoryRepo,
      customFieldRepo: repos.customFieldRepo,
      activeWorkspaceId,
      running,
      workspaces: { create, update, remove, switchTo },
      notifyTasksChanged,
      notifyPlannedTasksChanged: () => emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {}),
      notifyProjectsChanged,
      notifyCategoriesChanged,
      notifyProjectCategoriesChanged,
      notifyCustomFieldsChanged,
      nowISO: () => new Date().toISOString(),
      todayISO,
    };
    commitListeners.current.forEach((notify) => notify());
  });

  useEffect(() => {
    const enqueue = createSerialQueue();
    let disposed = false;

    const handle = async ({ id, op, params }: BridgeRequest) => {
      const deps = depsRef.current;
      // Sem resposta o Rust só desistiria no timeout; 503 diz o que houve na hora.
      const result = deps
        ? await dispatchLocalApiRequest(deps, op, params)
        : errorResult(503, "App ainda carregando — tente novamente em instantes");
      await invoke("local_api_respond", { id, status: result.status, body: result.body ?? null });
      if (deps && waitsForNextCommit(op) && depsRef.current === deps) {
        await waitForSignal(commitListeners.current, COMMIT_WAIT_MS);
      }
    };

    // No Tauri 2.10 um ouvinte pode sobreviver à limpeza e a mesma requisição
    // chegar a dois: descartado ignora, e o id deduplica os vivos (spec §6).
    const unlisten = listen<BridgeRequest>(REQUEST_EVENT, ({ payload }) => {
      if (disposed || !claimRequestId(payload.id)) return;
      void enqueue(() => handle(payload)).catch((error) => {
        console.error("[local-api] falha ao responder", error);
      });
    });
    // A prontidão só vale depois de o ouvinte existir; antes disso o Rust
    // responde 503 em vez de emitir para ninguém.
    void unlisten.then(() => {
      if (!disposed) void invoke("local_api_bridge_ready");
    });

    return () => {
      disposed = true;
      void unlisten
        .then((fn) => fn())
        .catch((error) => {
          console.error("[local-api] falha ao remover o ouvinte da ponte", error);
        });
    };
  }, []);
}
