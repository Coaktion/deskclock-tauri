import { Autocomplete } from "@presentation/components/Autocomplete";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

interface ClockifyRef {
  id: string;
  name: string;
}

export function ProjectMappingRow({
  project,
  clockifyProjects,
  mapped,
  onUpdate,
}: {
  project: import("@domain/entities/Project").Project;
  clockifyProjects: ClockifyRef[];
  mapped: { clockifyProjectId: string; clockifyProjectName: string } | undefined;
  onUpdate: (deskclockProjectId: string, clockifyProjectId: string) => void;
}) {
  const [inputValue, setInputValue] = useState(mapped?.clockifyProjectName ?? "");

  useEffect(() => {
    setInputValue(mapped?.clockifyProjectName ?? "");
  }, [mapped?.clockifyProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-fg-secondary flex-1 truncate min-w-0">{project.name}</span>
      <div className="flex items-center gap-1 w-[210px] shrink-0">
        <div className="flex-1">
          <Autocomplete
            value={inputValue}
            onChange={setInputValue}
            onSelect={(opt) => {
              setInputValue(opt.name);
              onUpdate(project.id, opt.id);
            }}
            options={clockifyProjects}
            placeholder="sem mapeamento"
          />
        </div>
        {mapped?.clockifyProjectId && (
          <button
            onClick={() => {
              setInputValue("");
              onUpdate(project.id, "");
            }}
            title="Remover mapeamento"
            className="text-fg-muted hover:text-fg transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
