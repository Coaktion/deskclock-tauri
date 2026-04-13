import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ProjectsPanel } from "@presentation/components/ProjectsPanel";
import { CategoriesPanel } from "@presentation/components/CategoriesPanel";
import { useProjects } from "@presentation/hooks/useProjects";
import { useCategories } from "@presentation/hooks/useCategories";

interface AccordionProps {
  title: string;
  count: number;
  children: React.ReactNode;
}

function Accordion({ title, count, children }: AccordionProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-900 hover:bg-gray-800 transition-colors text-left"
      >
        {open ? <ChevronDown size={14} className="text-gray-500 shrink-0" /> : <ChevronRight size={14} className="text-gray-500 shrink-0" />}
        <span className="text-sm font-semibold text-gray-100">{title}</span>
        <span className="ml-auto text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{count}</span>
      </button>
      {open && (
        <div className="px-4 py-4 bg-gray-950">
          {children}
        </div>
      )}
    </div>
  );
}

export function DataPage() {
  const { projects } = useProjects();
  const { categories } = useCategories();

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-xl font-semibold mb-6 text-gray-100">Dados</h1>
      <div className="flex flex-col gap-4">
        <Accordion title="Projetos" count={projects.length}>
          <ProjectsPanel showTitle={false} />
        </Accordion>
        <Accordion title="Categorias" count={categories.length}>
          <CategoriesPanel showTitle={false} />
        </Accordion>
      </div>
    </div>
  );
}
