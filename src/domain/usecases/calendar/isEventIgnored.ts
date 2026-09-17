import type { CalendarIgnoreRule } from "@shared/types/calendarConfig";
import { nameKey } from "./nameKey";

/**
 * Diz se o título do evento casa com alguma regra de ignorar.
 *
 * Usa a mesma normalização do casamento de nomes (`nameKey`): caixa e espaço
 * nas pontas não contam, acento e espaço interno contam. Regra com valor em
 * branco nunca casa — com `contains`, a string vazia casaria com todo evento e
 * apagaria a agenda inteira do rastreio sem ninguém perceber.
 */
export function isEventIgnored(title: string, rules: CalendarIgnoreRule[]): boolean {
  const key = nameKey(title);
  return rules.some((rule) => {
    const value = nameKey(rule.value);
    if (!value) return false;
    return rule.operator === "equals" ? key === value : key.includes(value);
  });
}

/**
 * Soma a regra à lista, sem repetir uma que já existe (mesmo operador e mesmo
 * valor normalizado) e sem aceitar valor em branco. Devolve a própria lista
 * quando não há o que somar, para o chamador poder pular a gravação.
 */
export function addIgnoreRule(
  rules: CalendarIgnoreRule[],
  rule: CalendarIgnoreRule
): CalendarIgnoreRule[] {
  const value = rule.value.trim();
  if (!value) return rules;
  const exists = rules.some(
    (r) => r.operator === rule.operator && nameKey(r.value) === nameKey(value)
  );
  return exists ? rules : [...rules, { operator: rule.operator, value }];
}
