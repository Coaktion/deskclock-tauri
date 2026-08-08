import type { CustomField, CustomValues } from "@domain/entities/CustomField";
import { serializeCustomValue } from "@domain/usecases/customFields/customValueCodec";
import { Autocomplete } from "@presentation/components/Autocomplete";
import {
  fieldClass,
  floatingFieldClass,
  floatingLabelClass,
} from "@presentation/components/fieldStyles";
import { useEffect, useRef, useState } from "react";

interface CustomFieldInputsProps {
  fields: CustomField[];
  values: CustomValues;
  onChange: (values: CustomValues) => void;
  /**
   * Destino do Enter para quem **não** está dentro de um formulário com submit
   * único — os editores por linha dos modais de lista. Ausente, o Enter sobe
   * para o `useSubmitOnEnter` do formulário, que é o caminho normal (§6.4).
   */
  onEnter?: () => void;
  /** `compact` encurta rótulos e alturas para caber em formulários inline. */
  compact?: boolean;
  /**
   * Substitui — não complementa — o espaçamento padrão entre os campos. Existe
   * para o formulário que os embute alinhar o ritmo vertical com os seus
   * próprios campos; somar as duas classes deixaria o resultado na mão da ordem
   * do CSS gerado.
   */
  className?: string;
}

/**
 * Renderiza os campos personalizados por tipo. Um só componente para os cinco
 * formulários que os capturam — cada um mantendo sua própria cópia dos valores
 * e devolvendo o objeto inteiro no `onChange`.
 *
 * Todo valor sai daqui já serializado (`serializeCustomValue`), porque é essa
 * string que entra na chave de agrupamento: quem grava não precisa normalizar
 * nada depois.
 */
export function CustomFieldInputs({
  fields,
  values,
  onChange,
  onEnter,
  compact = false,
  className,
}: CustomFieldInputsProps) {
  if (fields.length === 0) return null;

  function commit(field: CustomField, serialized: string) {
    onChange({ ...values, [field.id]: serialized });
  }

  return (
    <div className={className ?? (compact ? "space-y-1.5" : "space-y-2")}>
      {fields.map((field) => {
        const value = values[field.id] ?? "";
        const inputId = `custom-field-${field.id}`;

        // O checkbox não tem onde flutuar rótulo: fica ao lado da caixa, no
        // lugar do "Sim/Não" que a caixa marcada já comunica.
        if (field.type === "checkbox") {
          return (
            <div key={field.id} className="flex items-center gap-2 py-1 text-sm text-fg-secondary">
              <input
                id={inputId}
                type="checkbox"
                checked={value === "1"}
                onChange={(e) => commit(field, serializeCustomValue(field, e.target.checked))}
                className="accent-accent cursor-pointer"
              />
              <label htmlFor={inputId} className="cursor-pointer">
                {field.label}
              </label>
            </div>
          );
        }

        return (
          // O wrapper externo recebe o `space-y-*` do container: o `mt-1.5` da
          // caixa flutuante cairia no mesmo elemento e *substituiria* a margem.
          <div key={field.id}>
            <div className={floatingFieldClass}>
              {(field.type === "text" || field.type === "multiline") && (
                <TextCustomField
                  inputId={inputId}
                  field={field}
                  value={value}
                  onCommit={(serialized) => commit(field, serialized)}
                  onEnter={onEnter}
                  rows={compact ? 2 : 3}
                />
              )}

              {field.type === "select" && (
                <SelectCustomField
                  inputId={inputId}
                  field={field}
                  value={value}
                  onCommit={(serialized) => commit(field, serialized)}
                  onEnter={onEnter}
                />
              )}

              <label htmlFor={inputId} className={floatingLabelClass}>
                {field.label}
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Mantém o que está na tela separado do que foi gravado, e só reescreve a tela
 * quando o valor muda **por fora** (prefill de planejada, troca da tarefa em
 * edição).
 *
 * Sem essa separação o campo comeria teclas: o gravado é normalizado e o
 * digitado não, então digitar um espaço devolveria a string sem ele e o
 * `value` controlado apagaria a tecla recém-digitada.
 */
function useLocalText(stored: string, toText: (stored: string) => string) {
  const [text, setText] = useState(() => toText(stored));
  const emitted = useRef(stored);

  useEffect(() => {
    if (stored === emitted.current) return;
    emitted.current = stored;
    setText(toText(stored));
  }, [stored, toText]);

  /** Anota o valor que acabou de sair daqui, para o efeito não reescrever a tela. */
  function markEmitted(next: string) {
    emitted.current = next;
  }

  return { text, setText, markEmitted };
}

interface TextCustomFieldProps {
  inputId: string;
  field: CustomField;
  value: string;
  onCommit: (serialized: string) => void;
  onEnter?: () => void;
  rows: number;
}

function TextCustomField({ inputId, field, value, onCommit, onEnter, rows }: TextCustomFieldProps) {
  const { text, setText, markEmitted } = useLocalText(value, identity);

  function handle(raw: string) {
    setText(raw);
    const serialized = serializeCustomValue(field, raw);
    markEmitted(serialized);
    onCommit(serialized);
  }

  if (field.type === "multiline") {
    return (
      <textarea
        id={inputId}
        value={text}
        onChange={(e) => handle(e.target.value)}
        rows={rows}
        // Placeholder de um espaço: é o que faz `:placeholder-shown` valer e o
        // rótulo flutuante saber que o campo está vazio. Quem "escreve" aqui é
        // o próprio rótulo, em repouso.
        placeholder=" "
        className={`${fieldClass} resize-y`}
      />
    );
  }

  return (
    <input
      id={inputId}
      type="text"
      value={text}
      onChange={(e) => handle(e.target.value)}
      onKeyDown={(e) => {
        // Sem `onEnter`, a tecla sobe para o formulário. Marcar como consumida
        // aqui faria o `useSubmitOnEnter` ignorá-la (ver `Autocomplete`).
        if (!onEnter) return;
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onEnter();
        }
      }}
      placeholder=" "
      autoComplete="off"
      className={fieldClass}
    />
  );
}

function identity(value: string): string {
  return value;
}

interface SelectCustomFieldProps {
  inputId: string;
  field: CustomField;
  value: string;
  onCommit: (serialized: string) => void;
  onEnter?: () => void;
}

/**
 * Campo de escolha usando o mesmo `Autocomplete` com fuzzy search de projeto e
 * categoria — a lista de opções cresce e um `<select>` nativo obrigaria a
 * percorrê-la à mão.
 *
 * O gravado é o **id** da opção, mas o Autocomplete é um campo de texto: o
 * rótulo visível é estado local daqui e só sai o id. Texto que não bate com
 * nenhuma opção limpa o valor — não existe "meio selecionado".
 */
function SelectCustomField({ inputId, field, value, onCommit, onEnter }: SelectCustomFieldProps) {
  const options = field.options.map((o) => ({ id: o.id, name: o.label }));
  const { text, setText, markEmitted } = useLocalText(value, (stored) => labelOf(field, stored));

  function commit(optionId: string) {
    const serialized = serializeCustomValue(field, optionId);
    markEmitted(serialized);
    onCommit(serialized);
  }

  return (
    <Autocomplete
      id={inputId}
      value={text}
      onChange={(next) => {
        setText(next);
        commit(field.options.find((o) => o.label === next)?.id ?? "");
      }}
      onSelect={(option) => {
        setText(option.name);
        commit(option.id);
      }}
      onEnter={onEnter}
      options={options}
      placeholder=" "
    />
  );
}

function labelOf(field: CustomField, optionId: string): string {
  return field.options.find((o) => o.id === optionId)?.label ?? "";
}
