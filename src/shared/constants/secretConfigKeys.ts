import type { ConfigKey } from "@shared/types/appConfig";

/**
 * Chaves de `config` que **não** podem sair da máquina do usuário.
 *
 * O backup do banco sobe para o Drive, onde o arquivo fica bem mais exposto do
 * que no `app_config_dir`. O comando Rust apaga estas chaves do snapshot antes
 * de enviá-lo, e recebe a lista daqui em vez de cravá-la no Rust: é ao lado do
 * `AppConfig` que uma integração nova acrescenta o token dela, e é aqui que
 * quem a acrescenta esbarra na lista.
 *
 * O preço da decisão é conhecido: restaurar um backup exige reconectar as
 * integrações. Ver `docs-internal/specs/backup-google-drive.md` §2.
 *
 * `secretConfigKeys.test.ts` reprova a chave de credencial que nascer fora
 * daqui — não conte com ninguém lembrando de vir editar este arquivo.
 */
export const SECRET_CONFIG_KEYS: readonly ConfigKey[] = [
  "googleAccessToken",
  "googleRefreshToken",
  "zendeskClientSecret",
  "zendeskAccessToken",
  "zendeskRefreshToken",
  "clockifyApiKey",
  "mondayApiKey",
  "llmApiKey",
];
