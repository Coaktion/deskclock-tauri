import { useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "@domain/entities/Task";
import type { TaskGroup } from "@domain/utils/groupTasks";
import type { TaskValidationResult } from "@domain/integrations/taskValidation";
import { groupTasks } from "@domain/utils/groupTasks";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { todayISO, startOfDayISO, endOfDayISO, localDateISO } from "@shared/utils/time";
import { dateRangeFor, type DateRangeId } from "@shared/utils/datePresets";

export type QuickPeriod = "today" | "yesterday" | "week" | "month" | "custom";

export interface DayGroup {
  date: string;
  groups: TaskGroup[];
}

/**
 * O tom precisa de três estados porque o envio tem três desfechos, e o booleano
 * `error` só expressava dois. O desfecho que faltava é o comum: parte dos grupos
 * sobe e parte é recusada. Pintá-lo de vermelho negava o que já estava no
 * destino — foi o que fez um envio ao Monday com uma tarefa sem motivo de não
 * faturável parecer cancelado por inteiro.
 */
export type SendTone = "success" | "warning" | "error";

export interface SendMessage {
  text: string;
  tone: SendTone;
}

export function formatDayLabel(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  const weekday = d.toLocaleDateString("pt-BR", { weekday: "short" });
  const datePart = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${weekday}, ${datePart}`;
}

export function groupTasksByDay(tasks: Task[]): DayGroup[] {
  const byDate = new Map<string, Task[]>();
  for (const task of tasks) {
    const date = localDateISO(task.startTime);
    const list = byDate.get(date) ?? [];
    list.push(task);
    byDate.set(date, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayTasks]) => ({ date, groups: groupTasks(dayTasks) }));
}

/**
 * A frase que o modal exibe depois de enviar, a partir do que subiu e do que foi
 * recusado.
 *
 * Fica aqui, e não no componente, porque é a única regra de decisão do envio que
 * o usuário lê — e a anterior estava errada em silêncio: dizia "N grupo(s)
 * enviado(s)" contando a **seleção**, não o resultado, ou então nada era exibido
 * porque a recusa de um grupo virava exceção e derrubava a mensagem inteira.
 */
export function buildResultMessage(
  sentGroups: number,
  outcome: { refused: string[]; failed: string[] }
): SendMessage {
  const lines: string[] = [];
  if (sentGroups > 0) lines.push(`${sentGroups} grupo(s) enviado(s) com sucesso.`);
  if (outcome.refused.length > 0) {
    lines.push(`${outcome.refused.length} não subiu(ram): ${outcome.refused.join(" ")}`);
  }
  if (outcome.failed.length > 0) {
    lines.push(`${outcome.failed.length} falhou(ram): ${outcome.failed.join(" ")}`);
  }
  if (lines.length === 0) return { text: "Nenhum grupo enviado.", tone: "error" };

  // **Falha técnica é vermelha mesmo com parte enviada**, e recusa é amarela:
  // uma pede tentar de novo, a outra pede editar a tarefa. Enquanto as duas
  // moravam no mesmo campo, queda de rede aparecia como aviso, indistinguível
  // de "preencha o motivo".
  // Nada enviado é vermelho seja qual for o motivo: o clique não produziu nada.
  const tone: SendTone =
    sentGroups === 0 || outcome.failed.length > 0
      ? "error"
      : outcome.refused.length > 0
        ? "warning"
        : "success";
  return { text: lines.join(" "), tone };
}

export function selKey(date: string, groupKey: string): string {
  return `${date}\0${groupKey}`;
}

/**
 * O vocabulário desta tela traduzido para a tabela única (`datePresets`).
 *
 * **`week` aqui sempre foi janela móvel de sete dias**, não a semana do
 * calendário — e o rótulo do `TaskSendModal` já dizia "7 dias". O nome é que
 * discordava da conta; o `last7` da tabela diz o que ele faz.
 */
const QUICK_RANGE: Record<Exclude<QuickPeriod, "custom">, DateRangeId> = {
  today: "today",
  yesterday: "yesterday",
  week: "last7",
  month: "thisMonth",
};

export function quickToRange(
  quick: QuickPeriod,
  customStart: string,
  customEnd: string
): { start: string; end: string } {
  if (quick === "custom") return { start: customStart, end: customEnd };
  return dateRangeFor(QUICK_RANGE[quick]);
}

export interface UseTaskSendSelectionResult {
  quick: QuickPeriod;
  setQuick: (q: QuickPeriod) => void;
  customStart: string;
  setCustomStart: (v: string) => void;
  customEnd: string;
  setCustomEnd: (v: string) => void;
  dayGroups: DayGroup[];
  sentIds: Set<string>;
  selectedKeys: Set<string>;
  collapsedDays: Set<string>;
  loaded: boolean;
  loading: boolean;
  message: SendMessage | null;
  setMessage: (m: SendMessage | null) => void;
  reloadKey: number;
  triggerReload: () => void;
  hasSentSelected: boolean;
  toggleGroup: (date: string, key: string, group: TaskGroup) => void;
  toggleDay: (date: string, groups: TaskGroup[]) => void;
  toggleDayCollapse: (date: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  collectSelectedGroups: () => TaskGroup[];
}

export function useTaskSendSelection(
  integrationId: string,
  validateTask: (task: Task) => TaskValidationResult,
  workspaceId: string
): UseTaskSendSelectionResult {
  const { taskRepo, taskLogRepo } = useRepositories();

  const [quick, setQuickState] = useState<QuickPeriod>("today");
  const [customStart, setCustomStartState] = useState(todayISO());
  const [customEnd, setCustomEndState] = useState(todayISO());
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<SendMessage | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Trocar o recorte descarta a mensagem: ela descreve um envio sobre a lista
  // que acabou de sair de cena. É o contraponto de o efeito de carga não limpar
  // mais nada — sem estes três, a frase do envio sobreviveria à navegação.
  function setQuick(q: QuickPeriod) {
    setMessage(null);
    setQuickState(q);
  }
  function setCustomStart(v: string) {
    setMessage(null);
    setCustomStartState(v);
  }
  function setCustomEnd(v: string) {
    setMessage(null);
    setCustomEndState(v);
  }

  const customStartRef = useRef(customStart);
  const customEndRef = useRef(customEnd);
  useEffect(() => {
    customStartRef.current = customStart;
  }, [customStart]);
  useEffect(() => {
    customEndRef.current = customEnd;
  }, [customEnd]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // **Não limpe a mensagem aqui.** O envio termina com `triggerReload()`, que
    // muda `reloadKey` e reexecuta este efeito — zerar a mensagem no começo dele
    // apagava a frase do resultado no mesmo instante em que ela era exibida.
    // Valia para o sucesso desde sempre; passou a doer quando o resultado do
    // envio parcial virou a informação principal da tela. Quem limpa é quem
    // troca o recorte (`setQuick`, datas do período), porque aí a mensagem
    // descreve uma lista que saiu de cena.

    async function run() {
      try {
        const { start, end } = quickToRange(quick, customStartRef.current, customEndRef.current);
        const [tasks, sentIdsArr] = await Promise.all([
          // Só as tarefas do workspace **da integração**. Antes a busca era sem
          // escopo, de propósito — "integrações enxergam tudo" —, e a lista
          // oferecia ao board do cliente as horas do trabalho pessoal.
          taskRepo.findByDateRange(startOfDayISO(start), endOfDayISO(end), workspaceId),
          taskLogRepo.findSentIds(integrationId, startOfDayISO(start), endOfDayISO(end)),
        ]);
        if (cancelled) return;

        const completed = tasks.filter((t) => t.status === "completed");
        const newSentIds = new Set(sentIdsArr);
        const dg = groupTasksByDay(completed);

        const keys = new Set<string>();
        for (const { date, groups } of dg) {
          for (const g of groups) {
            if (validateTask(g.tasks[0]).ok && !g.tasks.every((t) => newSentIds.has(t.id))) {
              keys.add(selKey(date, g.key));
            }
          }
        }

        setDayGroups(dg);
        setSentIds(newSentIds);
        setSelectedKeys(keys);
        setCollapsedDays(new Set());
        setLoaded(true);
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error
              ? err.message
              : typeof err === "string"
                ? err
                : "Erro ao carregar tarefas.";
          setMessage({ text: msg, tone: "error" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // integrationId e validateTask são estáveis por contrato do chamador
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskRepo, taskLogRepo, quick, reloadKey, workspaceId]);

  function toggleGroup(date: string, key: string, group: TaskGroup) {
    if (!validateTask(group.tasks[0]).ok) return;
    const sk = selKey(date, key);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(sk)) next.delete(sk);
      else next.add(sk);
      return next;
    });
  }

  function toggleDay(date: string, groups: TaskGroup[]) {
    const validGroups = groups.filter((g) => validateTask(g.tasks[0]).ok);
    const dayKeys = validGroups.map((g) => selKey(date, g.key));
    if (dayKeys.length === 0) return;
    const allSelected = dayKeys.every((k) => selectedKeys.has(k));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allSelected) dayKeys.forEach((k) => next.delete(k));
      else dayKeys.forEach((k) => next.add(k));
      return next;
    });
  }

  function toggleDayCollapse(date: string) {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function selectAll() {
    const keys = new Set<string>();
    for (const { date, groups } of dayGroups) {
      for (const g of groups) {
        if (validateTask(g.tasks[0]).ok) keys.add(selKey(date, g.key));
      }
    }
    setSelectedKeys(keys);
  }

  function deselectAll() {
    setSelectedKeys(new Set());
  }

  function collectSelectedGroups(): TaskGroup[] {
    const result: TaskGroup[] = [];
    for (const { date, groups } of dayGroups) {
      for (const g of groups) {
        if (selectedKeys.has(selKey(date, g.key))) result.push(g);
      }
    }
    return result;
  }

  /**
   * Basta **uma** tarefa já enviada na seleção para o aviso aparecer. Exigir o
   * grupo inteiro calava o aviso justamente no caso mais arriscado: o grupo
   * parcialmente enviado, onde o reenvio mexe em algo que já está no destino. O
   * aviso nunca impede o envio — quem decide é o botão.
   */
  const hasSentSelected = useMemo(() => {
    if (selectedKeys.size === 0) return false;
    for (const { date, groups } of dayGroups) {
      for (const g of groups) {
        if (selectedKeys.has(selKey(date, g.key)) && g.tasks.some((t) => sentIds.has(t.id))) {
          return true;
        }
      }
    }
    return false;
  }, [selectedKeys, dayGroups, sentIds]);

  return {
    quick,
    setQuick,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    dayGroups,
    sentIds,
    selectedKeys,
    collapsedDays,
    loaded,
    loading,
    message,
    setMessage,
    reloadKey,
    triggerReload: () => setReloadKey((k) => k + 1),
    hasSentSelected,
    toggleGroup,
    toggleDay,
    toggleDayCollapse,
    selectAll,
    deselectAll,
    collectSelectedGroups,
  };
}
