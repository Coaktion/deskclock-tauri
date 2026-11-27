import { useMemo } from "react";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import {
  buildTaskSendAdapter,
  type TaskSendAdapter,
  type TaskSendIntegrationId,
} from "@presentation/integrations/taskSendAdapters";

export function useTaskSendAdapter(
  integration: TaskSendIntegrationId,
  projects: Project[],
  categories: Category[]
): TaskSendAdapter {
  const config = useAppConfig();
  const factories = useIntegrations();
  return useMemo(
    () => buildTaskSendAdapter(integration, config, factories, { projects, categories }),
    // `config` e `factories` mudam de identidade a cada set(); recriar o adapter
    // a cada render remontaria a seleção do TaskSendModal no meio do envio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [integration, config.isLoaded, projects, categories]
  );
}
