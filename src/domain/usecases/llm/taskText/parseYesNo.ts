import { normalizeForMatch } from "./matchCatalogItem";

const BILLABLE_YES = new Set(["b", "billable", "sim", "s", "yes", "y"]);
const BILLABLE_NO = new Set([
  "nb",
  "non-billable",
  "non billable",
  "nonbillable",
  "nao",
  "n",
  "no",
]);

const CHECKBOX_YES = new Set(["sim", "s", "yes", "y", "true", "1", "x"]);
const CHECKBOX_NO = new Set(["nao", "n", "no", "false", "0"]);

function lookup(value: string, yes: Set<string>, no: Set<string>): boolean | null {
  const normalized = normalizeForMatch(value);
  if (yes.has(normalized)) return true;
  if (no.has(normalized)) return false;
  return null;
}

/** `b`/`nb` e as variações de sim/não; `null` quando o valor não diz nem um nem outro. */
export function parseBillable(value: string): boolean | null {
  return lookup(value, BILLABLE_YES, BILLABLE_NO);
}

/** Sim/não de um campo `checkbox`; `null` quando o valor não diz nem um nem outro. */
export function parseCheckbox(value: string): boolean | null {
  return lookup(value, CHECKBOX_YES, CHECKBOX_NO);
}
