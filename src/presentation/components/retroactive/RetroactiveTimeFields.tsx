import { Field, Input } from "@presentation/components/ui";
import type { useRetroactiveForm } from "@presentation/hooks/useRetroactiveForm";

interface RetroactiveTimeFieldsProps {
  form: ReturnType<typeof useRetroactiveForm>;
  /** O submit da aba em uso — o formulário lança, a IA analisa ou confirma. */
  onSubmit: (overrideEndHHMM?: string) => void;
}

/**
 * Duração, início e fim do Lançamento Manual. São os mesmos nas duas abas: a IA
 * não lê horário do texto (decisão (b) de `iniciar-tarefa-por-texto.md`), então
 * o "quando" fica nestes campos e só o "quê" muda de forma.
 */
export function RetroactiveTimeFields({ form, onSubmit }: RetroactiveTimeFieldsProps) {
  return (
    <>
      <Field label="Duração" htmlFor="retro-duration" boxClassName="flex items-center">
        <Input
          id="retro-duration"
          data-tour="retroactive-duration"
          variant="bare"
          value={form.durationInput}
          onChange={(e) => form.setDurationInput(e.target.value)}
          onBlur={form.commitDuration}
          onKeyDown={(e) => {
            // Consome porque tem trabalho próprio antes do submit: o Enter não
            // dispara o `onBlur`, então a duração digitada precisa virar hora
            // de fim aqui — senão a tarefa nasceria com o fim antigo.
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            const newEnd = form.commitDuration();
            onSubmit(newEnd || undefined);
          }}
          placeholder="HH:MM"
          title="Aceita: 1:30, 90, 1h, 1h 30m"
          className="w-20!"
        />
        <span className="w-full pr-2.5 text-xs text-fg-muted truncate">Use: 1h30, 1h, 30...</span>
      </Field>

      <div data-tour="retroactive-timeinputs" className="flex gap-2">
        <Field label="Início" htmlFor="retro-start" className="flex-1">
          <Input
            id="retro-start"
            type="time"
            variant="bare"
            value={form.startTime}
            onChange={(e) => form.handleStartChange(e.target.value)}
            onBlur={(e) => form.handleStartCommit(e.target.value)}
            onKeyDown={(e) => {
              // Campo vazio: o Enter restaura o valor anterior e para por aqui —
              // o segundo Enter é que adiciona. Preenchido, sobe para o submit.
              if (e.key !== "Enter" || form.startTime) return;
              e.preventDefault();
              form.handleStartCommit("");
            }}
          />
        </Field>
        <Field label="Fim" htmlFor="retro-end" className="flex-1">
          <Input
            id="retro-end"
            type="time"
            variant="bare"
            value={form.endTime}
            onChange={(e) => form.handleEndChange(e.target.value)}
            onBlur={(e) => form.handleEndCommit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || form.endTime) return;
              e.preventDefault();
              form.handleEndCommit("");
            }}
          />
        </Field>
      </div>
    </>
  );
}
