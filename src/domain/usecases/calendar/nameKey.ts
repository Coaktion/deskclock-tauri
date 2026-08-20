/**
 * Normaliza um nome para o casamento exato entre reunião, planejada e tarefa.
 *
 * Vive num módulo só porque os dois usos estão **acoplados por contrato**, não
 * por coincidência: `syncTodayMeetings` usa esta chave para decidir qual
 * planejada a reunião adota, e `computeMeetingPromptActions` usa a mesma para
 * reconhecer, pelo nome, a tarefa iniciada à mão. Duas normalizações diferentes
 * fariam o reconhecimento falhar em silêncio justamente na planejada que foi
 * adotada por nome.
 *
 * Deliberadamente **não** remove acentos nem colapsa espaços internos: o
 * casamento é exato de propósito (§5.7) — aproximar penduraria a reunião no
 * trabalho errado dentro de um job de fundo, sem ninguém para conferir.
 */
export const nameKey = (name: string) => name.toLowerCase().trim();
