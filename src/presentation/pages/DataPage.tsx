import { useState } from "react";
import { ProjectsPanel } from "@presentation/components/ProjectsPanel";
import { CategoriesPanel } from "@presentation/components/CategoriesPanel";
import { useProjects } from "@presentation/hooks/useProjects";
import { useCategories } from "@presentation/hooks/useCategories";

export function DataPage() {
  const [section, setSection] = useState<"projetos" | "categorias">("projetos");
  const { projects } = useProjects();
  const { categories } = useCategories();

  return (
    <div className="h-full overflow-y-auto p-5">
      <h1 className="text-lg font-semibold text-gray-100 mb-4">Dados</h1>
      <div className="flex gap-2 mb-5">
        {(
          [
            ["projetos", "Projetos", projects.length],
            ["categorias", "Categorias", categories.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              section === key
                ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
                : "bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
            }`}
          >
            {label}
            <span
              className={`ml-1.5 ${section === key ? "text-blue-400/60" : "text-gray-600"}`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>
      {section === "projetos" ? (
        <ProjectsPanel showTitle={false} />
      ) : (
        <CategoriesPanel showTitle={false} />
      )}
    </div>
  );
}
