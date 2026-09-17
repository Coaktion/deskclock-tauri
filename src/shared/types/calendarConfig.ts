/**
 * Regra do usuário para o rastreio e a importação da agenda deixarem um evento
 * de lado, pelo nome. Existe para o evento recorrente que é só lembrete: sem
 * ela, o rastreio automático recria a planejada dele toda semana.
 *
 * Mora em `shared/types` como os demais tipos de config: é o formato gravado
 * em `AppConfig`, e o domínio só o consome.
 */
export interface CalendarIgnoreRule {
  operator: "equals" | "contains";
  value: string;
}
