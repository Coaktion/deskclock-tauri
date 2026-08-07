export interface CalendarDedupeEvent {
  id: string;
  title: string;
  /** "HH:MM" — ausente em evento de dia inteiro */
  startTime?: string;
  /** "HH:MM" — ausente em evento de dia inteiro */
  endTime?: string;
  /** O evento está configurado como recorrente neste import. */
  isRecurring: boolean;
  /** Dias escolhidos para a recorrência (0=Dom…6=Sáb). */
  recurringDays: number[];
}

export interface CalendarDedupe {
  /** Eventos que não devem virar planejada — já cobertos por outro do lote. */
  dedupedIds: Set<string>;
  /** Dias efetivos de cada sobrevivente, já com os das ocorrências absorvidas. */
  daysById: Map<string, number[]>;
}

/**
 * Chave de identidade de uma planejada recorrente: **nome + horário**.
 *
 * O dedupe era pelo `recurringEventId` — o id da *série* no Google —, e isso é
 * mais estreito do que a identidade da tarefa. O Google parte a série num id
 * novo a cada edição feita com "este e os seguintes eventos", e convites
 * duplicados também rendem séries distintas: a "Aktie Now - Daily" das
 * 09:30–10:00 chegava como três séries, todas com `BYDAY=MO,TU,WE,TH,FR` e o
 * mesmo link do Meet, e virava três planejadas idênticas — cada uma exigindo ser
 * concluída à parte todo dia.
 *
 * O horário entra na chave porque é o que separa duas reuniões de mesmo nome em
 * horas diferentes, que são trabalhos distintos. O nome é comparado aparado e em
 * minúsculas, como o chip "já existe".
 */
function dedupeKey(event: CalendarDedupeEvent): string {
  return `${event.title.trim().toLowerCase()}|${event.startTime ?? ""}|${event.endTime ?? ""}`;
}

/**
 * Colapsa os eventos recorrentes que descrevem a mesma planejada, devolvendo
 * quem sai do import e os dias efetivos de quem fica.
 *
 * Recebe **só os eventos que serão importados** — a decisão de quais estão
 * selecionados é da tela.
 *
 * Os dias são **unidos**, e é o que impede a correção de perder informação: uma
 * série partida pode ter Seg/Qua/Sex num id e Ter/Qui noutro, e ficar apenas com
 * a do primeiro apagaria dois dias em silêncio — hoje eles sobrevivem porque as
 * duas séries viram duas tarefas. A união preserva a ordem de chegada e só
 * acrescenta o que falta: `recurringDays` está na escala do `Date` (§5.3) e
 * reordená-la não é papel deste código.
 *
 * Evento marcado como "Específica" fica de fora: ali cada dia é uma tarefa por
 * definição, e colapsar dois dias diferentes perderia um deles.
 */
export function dedupeCalendarEvents(events: CalendarDedupeEvent[]): CalendarDedupe {
  const survivorByKey = new Map<string, string>();
  const dedupedIds = new Set<string>();
  const daysById = new Map<string, number[]>();

  for (const event of events) {
    if (!event.isRecurring) continue;

    const key = dedupeKey(event);
    const survivorId = survivorByKey.get(key);

    if (survivorId === undefined) {
      survivorByKey.set(key, event.id);
      daysById.set(event.id, [...event.recurringDays]);
      continue;
    }

    dedupedIds.add(event.id);
    const days = daysById.get(survivorId)!;
    for (const day of event.recurringDays) {
      if (!days.includes(day)) days.push(day);
    }
  }

  return { dedupedIds, daysById };
}
