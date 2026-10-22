import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { useTaskSendAdapter } from "@presentation/hooks/useTaskSendAdapter";
import { TaskSendModal } from "./TaskSendModal";

interface SheetsSendModalProps {
  projects: Project[];
  categories: Category[];
  onClose: () => void;
}

export function SheetsSendModal({ projects, categories, onClose }: SheetsSendModalProps) {
  const adapter = useTaskSendAdapter("google_sheets", projects, categories);
  return (
    <TaskSendModal
      adapter={adapter}
      projects={projects}
      categories={categories}
      onClose={onClose}
    />
  );
}
