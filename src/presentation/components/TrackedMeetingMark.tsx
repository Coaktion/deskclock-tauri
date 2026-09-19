import { Bell } from "lucide-react";

/**
 * O sino ao lado do nome da planejada que o rastreamento automático vai lembrar
 * de iniciar. Uma redação só, onde quer que a linha apareça.
 */
export function TrackedMeetingMark() {
  return (
    <span
      className="shrink-0 flex items-center text-accent-text/80"
      title="Rastreada — o app vai lembrar de iniciar esta reunião"
    >
      <Bell size={14} />
    </span>
  );
}
