import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { useTaskSendAdapter } from "@presentation/hooks/useTaskSendAdapter";
import { TaskSendModal } from "./TaskSendModal";

interface ClockifySendModalProps {
  projects: Project[];
  categories: Category[];
  onClose: () => void;
}

export function ClockifySendModal({ projects, categories, onClose }: ClockifySendModalProps) {
  const adapter = useTaskSendAdapter("clockify", projects, categories);
  return (
    <TaskSendModal
      adapter={adapter}
      projects={projects}
      categories={categories}
      onClose={onClose}
    />
  );
}
