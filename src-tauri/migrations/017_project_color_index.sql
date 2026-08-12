-- Slot de cor do projeto, persistido.
--
-- Antes daqui a cor saía de `hash(project.id) % 6`, em shared/utils/projectColor.ts. O
-- hash não era o defeito — sobre uuid ele distribui parelho —, o número de slots era: com
-- 6 cores e um catálogo de 60 projetos, cada cor carregava ~10 projetos, e duas linhas na
-- mesma tela tinham 98% de chance de coincidir. Sorteio não conserta isso em nenhum
-- tamanho de paleta: é o problema do aniversário, e com 24 cores o sorteio ainda repetiria
-- em 95% dos casos com 8 projetos. O que conserta é atribuir — cada projeto novo fica com
-- um slot que ninguém do workspace está usando.
--
-- `NOT NULL DEFAULT 0` para o INSERT que não conhece a coluna continuar válido; quem
-- escolhe o valor de verdade é `nextProjectColorIndex` (domain/utils/projectColorIndex.ts),
-- que devolve o menor índice livre e por isso reaproveita o buraco que um projeto excluído
-- deixa. O índice **não** é limitado a 24: quem passa do fim da paleta dá a volta
-- (`índice % 24`), na apresentação. Guardar o índice cru é o que mantém a cor estável
-- quando a paleta cresce ou encolhe.
--
-- O backfill numera por ordem de inserção (rowid) dentro de cada workspace, começando em
-- 0. Ordenar por nome pareceria mais arrumado e seria pior: renomear um projeto passaria a
-- mexer na cor dele e na de todos os que vêm depois. `projects` é tabela rowid comum — a
-- PK é TEXT, não WITHOUT ROWID —, então o rowid existe e é a ordem de criação.
ALTER TABLE projects ADD COLUMN color_index INTEGER NOT NULL DEFAULT 0;

UPDATE projects
   SET color_index = (
         SELECT COUNT(*)
           FROM projects AS earlier
          WHERE earlier.workspace_id = projects.workspace_id
            AND earlier.rowid < projects.rowid
       );
