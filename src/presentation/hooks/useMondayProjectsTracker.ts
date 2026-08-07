import { useEffect } from "react";
import { importMondayProjects } from "@domain/usecases/monday/importMondayProjects";
import { seedMondayProjectCategories } from "@domain/usecases/monday/seedMondayProjectCategories";
import { normalizeProjectMappings } from "@domain/usecases/monday/normalizeProjectMappings";
import { shouldSyncMondayProjects } from "@domain/usecases/monday/mondayProjectsSyncPolicy";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { notifyProjectCategoriesChanged, notifyProjectsChanged } from "@shared/utils/catalogSync";
import { truncateError } from "@shared/utils/syncError";
import { todayISO } from "@shared/utils/time";

// Cadência do relógio, não do trabalho: o ciclo só vai à rede quando o dia
// virou. Um app aberto a semana inteira precisa perceber a virada sem depender
// de ser reaberto.
const TICK_MS = 30 * 60 * 1000;
// Atraso do primeiro tick, para tirar a busca do caminho da abertura do app.
const INITIAL_DELAY_MS = 8000;

/**
 * Relê o Portfólio do Monday como Projects **uma vez por dia**.
 *
 * Cliente novo no Portfólio vira Project sem ninguém lembrar de abrir
 * Integrações e apertar "Atualizar" — que era a única forma de a lista crescer.
 * Faz exatamente o que aquele botão faz (`importMondayProjects`), no mesmo
 * destino.
 *
 * **O destino é o workspace da integração**, lido da config. Enquanto era o
 * ativo, uma guarda provisória (`isMondayLinkedWorkspace`) impedia a varredura
 * de rodar onde ainda não houvesse projeto do Monday — sem ela, bastava estar
 * num workspace pessoal na virada do dia para os projetos da empresa nascerem
 * lá dentro. Com o destino escolhido explicitamente não há mais o que adivinhar,
 * e a varredura passa a fazer também o **primeiro** import.
 *
 * Deve rodar na janela principal, como os outros rastreadores.
 */
export function useMondayProjectsTracker() {
  const config = useAppConfig();
  const { createMondayApi } = useIntegrations();
  const { projectRepo, categoryRepo, projectCategoryRepo } = useRepositories();

  useEffect(() => {
    if (!config.isLoaded) return;

    let disposed = false;
    let inFlight = false;

    async function runSync(): Promise<void> {
      const deskclockWorkspaceId = resolveIntegrationWorkspaceId(
        config.get("mondayDeskclockWorkspaceId")
      );
      const existingMappings = normalizeProjectMappings(config.get("mondayProjectMapping"));

      const result = await importMondayProjects({
        api: createMondayApi(),
        projectRepo,
        portfolioBoardId: config.get("mondayPortfolioBoardId"),
        deskclockWorkspaceId,
        // Os vínculos atuais são a única fonte do quadro que foi preenchido à
        // mão: o Portfólio devolve a coluna vazia e, sem eles, a varredura
        // apagaria a referência todo dia. São também o cache do schema de cada
        // board, com a marca que decide quais precisam ser relidos.
        existingMappings,
        nowISO: new Date().toISOString(),
        // Sem `forceSchemaRead`: o ciclo automático respeita a validade do cache
        // — quem quer o rótulo novo agora aperta "Atualizar" em Integrações.
      });

      await config.set("mondayProjectMapping", result.mappings);

      // Os Activity Types de cada board viram as categorias que o projeto
      // oferece. Não custa consulta nova — os rótulos vieram no import.
      await seedMondayProjectCategories({
        mappings: result.mappings,
        categoryRepo,
        projectCategoryRepo,
        workspaceId: deskclockWorkspaceId,
      });

      // Os projetos nascem pelo repositório, sem passar pelas mutações de
      // `useProjects`: sem o aviso, o overlay-popup — que nasce com o app e
      // nunca remonta — ficaria com o catálogo velho para sempre (§9.2).
      await notifyProjectsChanged();
      await notifyProjectCategoriesChanged();

      // Só depois do sucesso: gravar antes trocaria uma falha de rede pela
      // perda da varredura do dia inteiro.
      await config.set("mondayProjectsSyncLastDate", todayISO());
    }

    async function tick(): Promise<void> {
      if (disposed || inFlight) return;
      const due = shouldSyncMondayProjects({
        apiKey: config.get("mondayApiKey"),
        portfolioBoardId: config.get("mondayPortfolioBoardId"),
        lastSyncDate: config.get("mondayProjectsSyncLastDate"),
        todayISO: todayISO(),
      });
      if (!due) return;

      inFlight = true;
      let failure = "";
      try {
        await runSync();
      } catch (err: unknown) {
        failure = truncateError(err instanceof Error ? err.message : String(err));
        console.error("[mondayProjectsTracker] falha ao reler os boards", err);
      } finally {
        inFlight = false;
      }

      // Escrever só na mudança: o tick roda a cada 30 min e gravar sempre seria
      // um UPDATE no SQLite sem nada de novo para dizer.
      if (config.get("mondayProjectsLastSyncError") !== failure) {
        await config.set("mondayProjectsLastSyncError", failure);
      }
    }

    /**
     * Semeia as categorias a partir dos vínculos **já gravados**, sem passar
     * pelo Portfólio.
     *
     * Existe separado de `runSync` porque a semeadura não é a varredura: ela não
     * fala com o Monday — os rótulos estão em `mondayProjectMapping` desde o
     * último import — e por isso não tem por que ficar atrás do portão de uma
     * vez por dia. Presa a ele, no dia em que a feature subiu, com a varredura
     * do dia já feita, nenhum vínculo nascia até o dia seguinte: a integração
     * parecia não criá-los.
     *
     * Rodar a cada abertura é barato porque o use case pula o projeto cujo
     * conjunto não mudou — depois da primeira vez, o custo é uma leitura.
     */
    async function seedFromStoredMappings(): Promise<void> {
      const mappings = normalizeProjectMappings(config.get("mondayProjectMapping"));
      if (mappings.length === 0) return;

      const result = await seedMondayProjectCategories({
        mappings,
        categoryRepo,
        projectCategoryRepo,
        workspaceId: resolveIntegrationWorkspaceId(config.get("mondayDeskclockWorkspaceId")),
      });
      // Só avisa quando algo mudou: o evento recarrega o mapa em toda janela.
      if (result.projects > 0) await notifyProjectCategoriesChanged();
    }

    void seedFromStoredMappings().catch((err: unknown) => {
      // Não derruba o rastreador: a varredura do dia é o trabalho principal, e
      // a semeadura tenta de novo na próxima abertura.
      console.error("[mondayProjectsTracker] falha ao semear categorias", err);
    });

    const initialTimer = setTimeout(() => void tick(), INITIAL_DELAY_MS);
    const interval = setInterval(() => void tick(), TICK_MS);

    return () => {
      disposed = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
    // createMondayApi e projectRepo vêm de Providers e são estáveis por sessão;
    // capturá-los uma vez na montagem é seguro (§9.2).
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
}
