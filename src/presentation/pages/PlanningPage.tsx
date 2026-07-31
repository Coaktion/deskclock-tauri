import { WeekPlanningView } from "@presentation/components/WeekPlanningView";

export function PlanningPage() {
  return (
    // Sem `overflow-y-auto` aqui: quem rola agora são as duas colunas, cada uma
    // por conta própria. Rolagem na página inteira anularia o `min-h-0` delas e
    // faria a coluna do formulário empurrar a semana para baixo.
    <div className="h-full flex flex-col">
      <WeekPlanningView />
    </div>
  );
}
