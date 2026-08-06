import {
  importMondayProjects,
  resolveProjectDestination,
} from "@domain/usecases/monday/importMondayProjects";
import { normalizeProjectMappings } from "@domain/usecases/monday/normalizeProjectMappings";
import {
  seedMondayProjectCategories,
  type SeedMondayProjectCategoriesResult,
} from "@domain/usecases/monday/seedMondayProjectCategories";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { notifyProjectCategoriesChanged, notifyProjectsChanged } from "@shared/utils/catalogSync";
import { todayISO } from "@shared/utils/time";
import { showToast } from "@shared/utils/toast";
import { ImportActionButton, ImportCard } from "./ImportCard";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface SkippedBoard {
  boardName: string;
  reason: string;
}

/**
 * Campo do id do quadro, para o projeto cujo item de Portfólio ainda não tem a
 * coluna "ID Quadro Projeto" preenchida — 14 dos 62 hoje.
 *
 * Grava no blur ou no Enter, e não a cada tecla: um id parcial viraria uma
 * consulta a board inexistente no próximo ciclo do rastreador.
 *
 * **Gravar não é instantâneo, e a espera precisa aparecer.** O `onSave` lê o
 * schema do board no Monday antes de vincular, e sem sinal nenhum o campo ficava
 * parado por segundos: o usuário não sabia se o Enter tinha sido registrado, e
 * digitar de novo por cima disparava uma segunda leitura da mesma coisa.
 */
function ProjectBoardIdInput({
  value,
  onSave,
}: {
  value: string;
  onSave: (boardId: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  async function commit() {
    const next = draft.trim();
    // O `busy` também barra o commit que o próprio `disabled` provoca: desativar
    // o input tira o foco dele, e o blur cairia aqui de novo.
    if (next === value || busy) return;
    setBusy(true);
    try {
      await onSave(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="relative shrink-0">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        disabled={busy}
        placeholder="ID do quadro"
        title={
          busy
            ? "Lendo o board no Monday…"
            : "Id do board onde as horas deste projeto serão gravadas"
        }
        className={`w-28 bg-gray-800 border border-amber-500/40 rounded px-2 py-0.5 text-[11px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 ${
          busy ? "pr-6 opacity-70" : ""
        }`}
      />
      {/* Dentro do campo, e não ao lado: a linha inteira não pode mudar de
          largura enquanto a leitura corre, ou a lista se mexe sob o cursor. */}
      {busy && (
        <Loader2
          size={10}
          className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-gray-400"
        />
      )}
    </span>
  );
}

/** Um projeto por item do board de Portfólio. */
export function MondayProjectsImport({
  mappings,
  deskclockWorkspaceId,
  onImported,
  reloadProjects,
}: {
  mappings: MondayProjectMapping[];
  deskclockWorkspaceId: string;
  onImported: (mappings: MondayProjectMapping[]) => void;
  reloadProjects: () => Promise<void>;
}) {
  const { projectRepo, categoryRepo, projectCategoryRepo } = useRepositories();
  const config = useAppConfig();
  const factories = useIntegrations();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [skipped, setSkipped] = useState<SkippedBoard[]>([]);
  // Itens do Portfólio sem "Oferta". O progresso já conta só os classificados,
  // então o número não aparece mais em lugar nenhum — e é justamente ele que
  // explica por que o board tem mais linhas do que o app tem projetos.
  const [ignored, setIgnored] = useState(0);
  /** Quantas associações projeto ↔ categoria a varredura semeou no último clique. */
  const [seededCategories, setSeededCategories] =
    useState<SeedMondayProjectCategoriesResult | null>(null);
  const [namesById, setNamesById] = useState<Map<string, string>>(new Map());
  const [autoError, setAutoError] = useState("");
  // Recolhida por padrão: o caso comum é conferir se o import trouxe o número
  // certo de projetos, não ler os 60 nomes.
  const [listOpen, setListOpen] = useState(false);

  // Hidratação única: `config` é recriado a cada render do provider e reler a
  // cada um sobrescreveria o estado de um import em curso.
  useEffect(() => {
    if (config.isLoaded) setAutoError(config.get("mondayProjectsLastSyncError"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Os projetos que existem **no destino**, e não a lista do workspace ativo do
   * app. O vínculo mora na config e sobrevive a apagar o projeto: sem conferir,
   * a tela mostrava o nome do board e o board apagado parecia importado.
   */
  const loadNames = useCallback(async () => {
    if (!deskclockWorkspaceId) return;
    const rows = await projectRepo.findAll(deskclockWorkspaceId);
    setNamesById(new Map(rows.map((p) => [p.id, p.name])));
  }, [projectRepo, deskclockWorkspaceId]);

  useEffect(() => {
    void loadNames();
  }, [loadNames, mappings]);

  const portfolioBoardId = config.isLoaded ? config.get("mondayPortfolioBoardId") : "";
  const linked = mappings.filter((m) => namesById.has(m.deskclockProjectId));
  const stale = mappings.length - linked.length;
  const missingBoard = linked.filter((m) => !m.mondayBoardId).length;

  /**
   * Grava o quadro digitado à mão e já lê o schema dele.
   *
   * Sem ler o schema o vínculo ficaria sem grupo nem colunas — o projeto
   * apareceria vinculado e o envio continuaria sem ter onde criar a atividade,
   * que é o problema que o campo existe para resolver.
   */
  async function handleSetBoardId(portfolioItemId: string, boardId: string) {
    const { destination, failure } = await resolveProjectDestination(
      factories.createMondayApi(),
      boardId
    );
    if (failure) {
      await showToast("error", failure);
      return;
    }

    const next = normalizeProjectMappings(config.get("mondayProjectMapping")).map((m) =>
      m.portfolioItemId === portfolioItemId ? { ...m, mondayBoardId: boardId, ...destination } : m
    );
    await config.set("mondayProjectMapping", next);
    onImported(next);
    await showToast("success", boardId ? "Quadro vinculado." : "Quadro removido.");
  }

  async function handleImport() {
    setImporting(true);
    setProgress({ done: 0, total: 0 });
    try {
      const result = await importMondayProjects({
        api: factories.createMondayApi(),
        projectRepo,
        portfolioBoardId: config.get("mondayPortfolioBoardId"),
        deskclockWorkspaceId,
        // Sem isto, o quadro digitado à mão logo abaixo seria desfeito no
        // primeiro "Atualizar": o Portfólio devolve a coluna vazia.
        existingMappings: normalizeProjectMappings(config.get("mondayProjectMapping")),
        onProgress: (done, total) => setProgress({ done, total }),
      });

      await config.set("mondayProjectMapping", result.mappings);

      // Os Activity Types de cada board viram as categorias que o projeto
      // oferece. Não custa consulta nova — os rótulos vieram no import.
      const seeded = await seedMondayProjectCategories({
        mappings: result.mappings,
        categoryRepo,
        projectCategoryRepo,
        workspaceId: deskclockWorkspaceId,
      });
      setSeededCategories(seeded);

      // O clique acabou de fazer o trabalho do dia: marcar a data evita que a
      // releitura automática repita a mesma varredura horas depois, e limpar o
      // erro tira da tela uma falha que deixou de valer.
      await config.set("mondayProjectsSyncLastDate", todayISO());
      await config.set("mondayProjectsLastSyncError", "");
      setAutoError("");
      onImported(result.mappings);
      setSkipped(result.skipped);
      setIgnored(result.ignored);
      await loadNames();
      await reloadProjects();
      // Os projetos nascem pelo repositório, sem passar pelas mutações de
      // `useProjects`: sem este aviso, o overlay não os enxergaria até reiniciar.
      await notifyProjectsChanged();
      await notifyProjectCategoriesChanged();

      await showToast(
        result.skipped.length > 0 ? "warning" : "success",
        result.skipped.length > 0
          ? `${result.mappings.length} projeto(s); ${result.skipped.length} board(s) fora do template.`
          : `${result.mappings.length} projeto(s) importado(s).`
      );
    } catch (err) {
      await showToast("error", err instanceof Error ? err.message : "Erro ao importar projetos.");
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  return (
    <ImportCard
      title="Projetos"
      hint="Cada item do Portfólio vira um projeto e guarda onde as horas serão gravadas. A lista é relida sozinha uma vez por dia."
      action={
        <ImportActionButton
          label={linked.length > 0 ? "Atualizar" : "Importar"}
          busy={importing}
          disabled={!portfolioBoardId || !deskclockWorkspaceId}
          onClick={handleImport}
        />
      }
    >
      {progress && progress.total > 0 && (
        <p className="text-[11px] text-gray-500">
          Lendo projetos: {progress.done}/{progress.total}
        </p>
      )}

      {/* Os Activity Types de cada board viram as categorias que aquele projeto
          oferece. Sem esta linha a semeadura seria invisível: ela acontece no
          mesmo clique e só aparece na tela de Dados, projeto a projeto. */}
      {seededCategories && seededCategories.projects > 0 && (
        <p className="text-[11px] text-gray-500">
          {seededCategories.seeded} associação(ões) de categoria em {seededCategories.projects}{" "}
          projeto(s).
        </p>
      )}

      {linked.length === 0 ? (
        <p className="text-xs text-gray-600 italic">Nenhum projeto vinculado ainda.</p>
      ) : (
        <>
          {/* A lista acompanha o Portfólio e já passa de 60 itens: aberta, ela
              empurrava os catálogos e os três campos para fora da tela, e o card
              de Projetos virava a seção inteira. O contador e o aviso de quadro
              faltando ficam de fora do recolhimento — são eles que dizem se vale
              abrir. */}
          <button
            onClick={() => setListOpen((v) => !v)}
            aria-expanded={listOpen}
            className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-300 transition-colors"
          >
            {listOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {linked.length} projeto(s) vinculado(s)
            {missingBoard > 0 && (
              <span className="text-amber-500/80">· {missingBoard} sem quadro</span>
            )}
          </button>

          {listOpen && (
            // O teto é o que mantém o resto da seção alcançável; a rolagem, o que
            // mantém os 60 projetos acessíveis dentro dele. `pr-1` afasta a barra
            // do campo de id, que encosta na borda direita da linha.
            <div className="max-h-[300px] overflow-y-auto pr-1 space-y-1">
              {/* Só o nome do projeto. O nome do board remoto repetia a mesma
                  coisa por outro caminho — item do Portfólio e Project nascem
                  do mesmo nome — e não havia nada a decidir a partir dele. O
                  que interessa na linha é a exceção: o projeto sem quadro, que
                  ganha o campo no lugar onde o nome remoto ficava. */}
              {linked.map((m) => (
                <div key={m.portfolioItemId} className="flex items-center gap-3 py-1">
                  <span className="text-xs text-gray-300 flex-1 truncate">
                    {namesById.get(m.deskclockProjectId)}
                  </span>
                  {!m.mondayBoardId && (
                    <ProjectBoardIdInput
                      value={m.mondayBoardId}
                      onSave={(boardId) => handleSetBoardId(m.portfolioItemId, boardId)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* O motivo fica visível para o campo não parecer decoração: sem o id, tudo
          funciona menos o que a integração existe para fazer. Com a lista
          recolhida, o texto precisa dizer onde está o campo — "digite aqui"
          apontaria para nada. */}
      {missingBoard > 0 && (
        <p className="text-[11px] text-amber-500/80">
          {missingBoard} projeto(s) sem quadro — as horas deles não sobem. Preencha o &quot;ID
          Quadro Projeto&quot; no Portfólio ou abra a lista acima e digite o id.
        </p>
      )}

      {/* A releitura diária roda em segundo plano: sem esta linha, ela falharia
          em silêncio e a lista pararia de crescer sem nada na tela para dizer
          por quê — o mesmo motivo da frase de erro do rastreio da Agenda. */}
      {autoError && (
        <p className="text-[11px] text-amber-500/80">
          Falha na última atualização automática: {autoError}
        </p>
      )}

      {/* Fica depois do import e não some com a lista recolhida: é a resposta à
          pergunta "o board tem 63 linhas, por que importou 61?". */}
      {ignored > 0 && (
        <p className="text-[11px] text-gray-500">
          {ignored} item(ns) do Portfólio sem &quot;Oferta&quot; preenchida — não viram projeto.
          Classifique a coluna no Monday e importe de novo.
        </p>
      )}

      {stale > 0 && (
        <p className="text-[11px] text-amber-500/80">
          {stale} vínculo(s) apontam para projetos que não existem mais no destino. Importe de novo
          para recriá-los.
        </p>
      )}

      {/* O motivo de cada board recusado já existia no resultado do import e era
          descartado: o usuário via só o número e não tinha como agir. */}
      {skipped.length > 0 && (
        <div className="border-t border-gray-800 pt-2 space-y-1">
          <p className="text-[11px] text-gray-500">
            {skipped.length} board(s) fora do template de Activities:
          </p>
          {skipped.map((s) => (
            <div key={s.boardName} className="flex items-baseline gap-2">
              <span className="text-[11px] text-gray-400 truncate max-w-[45%]">{s.boardName}</span>
              <span className="text-[11px] text-gray-600 truncate">{s.reason}</span>
            </div>
          ))}
        </div>
      )}
    </ImportCard>
  );
}
