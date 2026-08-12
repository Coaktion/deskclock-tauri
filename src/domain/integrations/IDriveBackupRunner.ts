/**
 * O que a UI e o agendador enxergam do backup: uma execução, e o id do arquivo
 * que subiu. A pasta, a poda e a conversa com o Drive ficam do lado de `infra/`.
 *
 * `run` lança com a mensagem **já pronta para a tela** — quem chama exibe o
 * `message` do erro sem traduzir nada, e é assim que o 403 do escopo faltante
 * chega ao usuário como "reconecte o Google" em vez do texto cru da API.
 */
export interface IDriveBackupRunner {
  run(): Promise<string>;
}
