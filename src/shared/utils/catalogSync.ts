import { emit } from "@tauri-apps/api/event";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";

/**
 * Notifica todas as janelas de que o catálogo de projetos mudou — criação,
 * renomeação, exclusão ou importação a partir de uma integração.
 *
 * Sem isso, `useProjects` numa janela que não fez a mudança fica com a lista do
 * momento em que montou. O `overlay-popup` nasce junto com o app e nunca
 * remonta: um projeto importado depois disso não existiria para ele, e toda
 * tarefa que apontasse para esse projeto apareceria sem nome de projeto até um
 * reload manual da janela.
 *
 * Espelha o padrão de `notifyTasksChanged` (§ tasks) e de
 * `OVERLAY_EVENTS.PLANNED_TASKS_CHANGED`.
 */
export function notifyProjectsChanged(): Promise<void> {
  return emit(OVERLAY_EVENTS.PROJECTS_CHANGED, {});
}

/** O mesmo de `notifyProjectsChanged`, para o catálogo de categorias. */
export function notifyCategoriesChanged(): Promise<void> {
  return emit(OVERLAY_EVENTS.CATEGORIES_CHANGED, {});
}
