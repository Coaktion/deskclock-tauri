import type { PlannedTaskAction } from "@domain/entities/PlannedTask";

export function normalizeUrl(url: string): string {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
}

/**
 * Host conhecido → o **destino** por extenso. A ordem importa: o sufixo é
 * comparado depois do host inteiro, e `calendar.google.com` tem de decidir antes
 * de `google.com` chegar a qualquer regra mais larga.
 */
const DESTINATIONS: { suffix: string; label: string }[] = [
  { suffix: "meet.google.com", label: "Meet" },
  { suffix: "calendar.google.com", label: "Google Agenda" },
  { suffix: "zoom.us", label: "Zoom" },
  { suffix: "teams.microsoft.com", label: "Teams" },
  { suffix: "teams.live.com", label: "Teams" },
  { suffix: "monday.com", label: "Monday" },
];

/**
 * Como a ação se chama quando quem a cria é uma integração.
 *
 * O nome é o **destino** e não a entidade de origem, e isso é medida contra o
 * card do popup: a planejada importada já nasce com o nome do evento ou do item,
 * e nomear a ação com o mesmo texto faria o chip ecoar, uma linha acima, o nome
 * que o card mostra logo abaixo. "Meet" diz o que o nome da reunião não diz.
 *
 * Host desconhecido devolve `undefined` — de propósito. Sem nome, o chip deriva
 * o rótulo do valor, que é exatamente o que ele escreve hoje; inventar um nome
 * aqui só duplicaria a derivação que o `actionLabel` já faz.
 */
export function actionDestinationLabel(url: string): string | undefined {
  let host: string;
  try {
    host = new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
  const match = DESTINATIONS.find((d) => host === d.suffix || host.endsWith(`.${d.suffix}`));
  return match?.label;
}

/**
 * Ação de abrir uma URL, ou nada quando não há URL. Mora aqui, e não no use case
 * da Agenda onde nasceu, porque quem a chama são duas integrações — e o import
 * do Monday não tem por que atravessar um use case de calendário para montar a
 * mesma coisa.
 */
export function openUrlAction(url: string | undefined): PlannedTaskAction | null {
  if (!url) return null;
  const label = actionDestinationLabel(url);
  return label ? { type: "open_url", value: url, label } : { type: "open_url", value: url };
}

interface Opener {
  openUrl: (url: string) => Promise<void>;
  openPath: (path: string) => Promise<void>;
}

export async function executeActions(actions: PlannedTaskAction[], opener: Opener): Promise<void> {
  for (const action of actions) {
    if (action.type === "open_url") {
      await opener.openUrl(normalizeUrl(action.value));
    } else if (action.type === "open_file") {
      await opener.openPath(action.value);
    }
  }
}
