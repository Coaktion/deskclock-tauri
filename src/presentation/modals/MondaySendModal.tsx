import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { useTaskSendAdapter } from "@presentation/hooks/useTaskSendAdapter";
import { TaskSendModal } from "./TaskSendModal";

interface MondaySendModalProps {
  projects: Project[];
  categories: Category[];
  onClose: () => void;
}

export function MondaySendModal({ projects, categories, onClose }: MondaySendModalProps) {
  const adapter = useTaskSendAdapter("monday", projects, categories);
  return (
    <TaskSendModal
      adapter={adapter}
      projects={projects}
      categories={categories}
      onClose={onClose}
    />
  );
}
