-- Categorias associadas a um projeto. Existindo ao menos uma linha para o projeto, os
-- autocompletes de categoria passam a oferecer só essas; sem nenhuma linha, oferecem o
-- catálogo inteiro (a regra do "conjunto vazio = sem filtro", em
-- domain/usecases/projectCategories/resolveCategoriesForProject.ts). É essa regra que
-- torna a tabela inerte enquanto ninguém a popula.
--
-- Sem workspace_id: as duas FKs já o carregam, e a UI só oferece projeto e categoria do
-- mesmo workspace. Uma terceira cópia seria uma terceira coisa a manter em sincronia.
--
-- ON DELETE CASCADE nas duas pontas porque excluir projeto e categoria é sem confirmação
-- (CLAUDE.md §1): linha órfã ressuscitaria numa reutilização de id.
--
-- A PK é o par, não um id próprio — par duplicado não significa nada. O `source` separa o
-- que o usuário associou à mão do que a varredura diária do Monday semeou: sem ele, a
-- varredura apagaria a escolha manual todo dia, como já acontecia com o "ID Quadro
-- Projeto" antes da guarda de "vazio nunca apaga".
CREATE TABLE IF NOT EXISTS project_categories (
  project_id  TEXT NOT NULL REFERENCES projects(id)   ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('monday', 'manual')),
  created_at  TEXT NOT NULL,
  PRIMARY KEY (project_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_project_categories_project
  ON project_categories (project_id);
