/**
 * Cabeçalho de versão do standard-version: `## [2.0.0](…)` em minor/major e
 * `### [2.0.1](…)` em patch. O `[x.y.z](` é o que o separa de `### Features`,
 * que também é h3.
 */
const VERSION_HEADING = /^#{2,3} \[(\d+\.\d+\.\d+)\]\(/;

/**
 * Devolve o corpo da seção de `version` no changelog — o texto entre o cabeçalho
 * dela e o próximo cabeçalho de versão —, ou `null` se a versão não estiver lá
 * ou a seção estiver vazia. Havendo cabeçalho repetido, vale o primeiro.
 */
export function extractVersionNotes(changelog: string, version: string): string | null {
  const wanted = version.replace(/^v/, "");
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => VERSION_HEADING.exec(line)?.[1] === wanted);
  if (start === -1) return null;

  const rest = lines.slice(start + 1);
  const next = rest.findIndex((line) => VERSION_HEADING.test(line));
  const body = (next === -1 ? rest : rest.slice(0, next)).join("\n").trim();
  return body || null;
}
