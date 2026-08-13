import type { PlannedTaskAction } from "@domain/entities/PlannedTask";

export function normalizeUrl(url: string): string {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
}

/**
 * Host conhecido → o **destino** por extenso. `host` casa o domínio inteiro ou
 * qualquer subdomínio dele, e `path` — quando existe — é o que estreita um
 * domínio largo demais para servir de destino sozinho.
 *
 * **A ordem é significativa e a entrada do `google.com` é a razão.** A Agenda
 * devolve o `htmlLink` do evento como `www.google.com/calendar/event?eid=…`, não
 * como `calendar.google.com` — sem essa entrada, o fallback do
 * `conferenceLink ?? htmlLink` nunca ganharia nome, que é metade do par que este
 * módulo existe para separar. Só que `google.com` também é sufixo de
 * `meet.google.com`: quem o acrescentar sem o `path`, ou antes das entradas mais
 * específicas, faz todo link do Meet virar "Google Agenda".
 */
const DESTINATIONS: { host: string; path?: string; label: string }[] = [
  { host: "meet.google.com", label: "Meet" },
  { host: "calendar.google.com", label: "Google Agenda" },
  { host: "google.com", path: "/calendar", label: "Google Agenda" },
  { host: "zoom.us", label: "Zoom" },
  { host: "teams.microsoft.com", label: "Teams" },
  { host: "teams.live.com", label: "Teams" },
  { host: "monday.com", label: "Monday" },
  { host: "zendesk.com", label: "Zendesk" },
];

/**
 * A ação como ela é gravada. **Nome vazio não vira `label: ""`**: a ação sem
 * nome é a que não tem a chave, e é ela que o chip resolve derivando o rótulo do
 * valor. Mora aqui, e não no campo do formulário, porque é regra do dado — a
 * string de um espaço e a ausência do campo têm de significar a mesma coisa nas
 * três integrações e nas três telas que editam ações.
 */
export function buildPlannedAction(
  type: PlannedTaskAction["type"],
  value: string,
  label?: string
): PlannedTaskAction {
  const named = label?.trim();
  return named ? { type, value, label: named } : { type, value };
}

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
  let parsed: URL;
  try {
    parsed = new URL(normalizeUrl(url));
  } catch {
    return undefined;
  }
  const host = parsed.hostname.replace(/^www\./, "");
  const match = DESTINATIONS.find(
    (d) =>
      (host === d.host || host.endsWith(`.${d.host}`)) &&
      (!d.path || parsed.pathname.startsWith(d.path))
  );
  return match?.label;
}

/**
 * Ação de abrir uma URL, ou nada quando não há URL. Mora aqui, e não no use case
 * da Agenda onde nasceu, porque quem a chama são as **três** integrações que
 * criam ação — Agenda, Monday e Zendesk —, e nenhuma delas tem por que
 * atravessar um use case de calendário para montar a mesma coisa.
 */
export function openUrlAction(url: string | undefined): PlannedTaskAction | null {
  if (!url) return null;
  return buildPlannedAction("open_url", url, actionDestinationLabel(url));
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
