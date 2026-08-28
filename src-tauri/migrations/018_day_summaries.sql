-- Resumos de dia gerados pelo provedor de IA, um por dia e por workspace.
--
-- O texto morava em três chaves de `AppConfig` (`llmSummaryDate`, `llmSummaryText`,
-- `llmSummaryWorkspaceId`), e a config só guarda **um** de cada: com um resumo por vez, o
-- Histórico — que resume vários dias de uma busca — sobrescreveria o dia anterior a cada
-- dia novo, e o mesmo dia seria regerado toda vez que aparecesse noutra busca.
--
-- Guardar é o que impede pagar duas vezes a mesma cota, e é a razão de existir do teto de
-- dias por geração (MAX_SUMMARY_DAYS, em domain/usecases/llm/SummarizeWorkdays.ts): o teto
-- só é suportável porque o dia já resumido não volta a consumir requisição. Um resumo de um
-- dia é fato que não muda — o dia acabou, e as tarefas dele também —, então guardá-lo não
-- cria dado a expirar.
--
-- A chave natural é o par dia+workspace, e não um id próprio: par duplicado não significa
-- nada, e é por ela que a consulta de cache é um SELECT direto. O workspace entra porque o
-- resumo descreve as tarefas daquele escopo — sem ele, trocar de workspace mostraria o
-- parágrafo do outro.
--
-- `day` é dia **local** (AAAA-MM-DD), como o resto do app raciocina sobre dia (§6.6), e não
-- o dia UTC do instante gravado.
--
-- ON DELETE CASCADE porque excluir workspace é escolha explícita do usuário e leva junto o
-- que era daquele escopo: resumo órfão ressuscitaria numa reutilização de id.
CREATE TABLE IF NOT EXISTS day_summaries (
  day          TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  summary      TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (day, workspace_id)
);
