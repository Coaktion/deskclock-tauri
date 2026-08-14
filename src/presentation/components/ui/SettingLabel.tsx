/**
 * A metade esquerda da linha de configuração: o que a chave faz, e a frase que
 * explica o que o nome não explica. A direita é o controle — chave, seletor,
 * slider, campo.
 *
 * Mora aqui porque estava escrito cinco vezes (`Toggle`, `SelectRow`,
 * `SliderRow`, `ShortcutRow`, a porta da API), e as cinco carregavam o mesmo
 * `mt-0.5` onde o design mede 1px.
 */
export function SettingLabel({
  label,
  description,
  /** `<label>` em vez de `<p>`, para o clique no texto focar o controle. */
  htmlFor,
  /** A linha inteira apaga junto com o controle que ela nomeia. */
  disabled = false,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  disabled?: boolean;
}) {
  const Tag = htmlFor ? "label" : "p";

  return (
    <div className="flex-1 min-w-0">
      <Tag htmlFor={htmlFor} className={`block text-sm ${disabled ? "text-fg-muted" : "text-fg"}`}>
        {label}
      </Tag>
      {description && <p className="text-xs text-fg-muted mt-px">{description}</p>}
    </div>
  );
}
