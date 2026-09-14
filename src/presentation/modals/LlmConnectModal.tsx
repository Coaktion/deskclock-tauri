import { useState } from "react";
import { Eye, EyeOff, KeyRound, PlugZap } from "lucide-react";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import {
  DEFAULT_LLM_PROVIDER_ID,
  LLM_PROVIDERS,
  findLlmProvider,
} from "@infra/integrations/llm/providers";
import { Button, Field, IconButton, Input, Modal, Select } from "@presentation/components/ui";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import {
  describeLlmError,
  pickDefaultModel,
} from "@presentation/sections/integrations/llm/llmConnection";

interface LlmConnectModalProps {
  onConnected: () => void;
  onClose: () => void;
}

/**
 * Conexão a um provedor de LLM, em dois passos: **testar, depois gravar**.
 *
 * O teste é o `listModels()`, que é a requisição mais barata que a API tem — não
 * consome token nenhum — e faz duas coisas de uma vez: valida a chave e preenche
 * o seletor de modelo. Nada é persistido antes de ele responder, que é o padrão
 * dos outros modais de conexão.
 */
export function LlmConnectModal({ onConnected, onClose }: LlmConnectModalProps) {
  const config = useAppConfig();
  const factories = useIntegrations();

  const [providerId, setProviderId] = useState(
    () => config.get("llmProviderId") || DEFAULT_LLM_PROVIDER_ID
  );
  const [baseUrl, setBaseUrl] = useState(
    () => config.get("llmBaseUrl") || findLlmProvider(config.get("llmProviderId"))?.baseUrl || ""
  );
  const [apiKey, setApiKey] = useState(() => config.get("llmApiKey"));
  const [model, setModel] = useState(() => config.get("llmModel"));
  const [models, setModels] = useState<string[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = findLlmProvider(providerId);
  const needsKey = preset?.requiresApiKey ?? false;
  const tested = models.length > 0;
  const canTest = baseUrl.trim() !== "" && (!needsKey || apiKey.trim() !== "");
  const busy = testing || saving;
  // Montada fora do JSX: entre expressões, o JSX junta as linhas com um espaço,
  // e "disponíve" + "is" sairia partido ao meio.
  const modelCountLabel =
    models.length === 1 ? "1 modelo disponível." : `${models.length} modelos disponíveis.`;

  const handleKeyDown = useSubmitOnEnter(() => void handleSubmit(), { disabled: busy });

  /**
   * Trocar de preset reescreve URL e modelo, e zera a lista testada: ela é a
   * resposta do provedor **anterior**, e mantê-la ofereceria modelos que o novo
   * não conhece. A chave sobrevive só quando o novo provedor pede uma — indo do
   * Groq para o Ollama local, ela deixa de fazer sentido.
   */
  function handleProviderChange(nextId: string) {
    const next = findLlmProvider(nextId);
    setProviderId(nextId);
    setBaseUrl(next?.baseUrl ?? "");
    setModel(next?.suggestedModel ?? "");
    setModels([]);
    setError(null);
    if (!next?.requiresApiKey) setApiKey("");
  }

  async function handleTest() {
    if (!canTest) return;
    setTesting(true);
    setError(null);
    try {
      const client = factories.createLlmApi({
        providerId,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        model: model.trim(),
      });
      const available = await client.listModels();
      setModels(available);
      setModel(pickDefaultModel(available, model.trim(), preset?.suggestedModel ?? ""));
    } catch (err) {
      setModels([]);
      setError(describeLlmError(err));
    } finally {
      setTesting(false);
    }
  }

  async function handleConnect() {
    if (!tested || model.trim() === "") return;
    setSaving(true);
    await config.set("llmProviderId", providerId);
    await config.set("llmBaseUrl", baseUrl.trim());
    await config.set("llmApiKey", apiKey.trim());
    await config.set("llmModel", model.trim());
    setSaving(false);
    onConnected();
  }

  /** Enter faz o passo em que o formulário está: testar, ou gravar o que passou. */
  async function handleSubmit() {
    if (tested && model.trim() !== "") return handleConnect();
    return handleTest();
  }

  return (
    <Modal
      title="Conectar a um provedor de IA"
      description="O resumo do dia é gerado pelo provedor que você escolher aqui."
      onClose={onClose}
      onKeyDown={handleKeyDown}
      bodyClassName="p-5 flex flex-col gap-4"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleConnect}
            disabled={!tested || model.trim() === ""}
            loading={saving}
          >
            Conectar
          </Button>
        </>
      }
    >
      <Field label="Provedor" htmlFor="llm-provider">
        <Select
          id="llm-provider"
          size="sm"
          variant="bare"
          className="w-full"
          value={providerId}
          onChange={(e) => handleProviderChange(e.target.value)}
        >
          {LLM_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="URL base" htmlFor="llm-base-url">
        <Input
          id="llm-base-url"
          size="sm"
          variant="bare"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.exemplo.com/v1"
        />
      </Field>

      {needsKey && (
        <Field label="Chave de API" htmlFor="llm-api-key" boxClassName="relative flex items-center">
          <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
          <Input
            id="llm-api-key"
            type={showKey ? "text" : "password"}
            size="sm"
            variant="bare"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Cole a sua chave aqui"
            className="pl-8"
            autoFocus
          />
          <IconButton
            icon={showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            title={showKey ? "Ocultar chave" : "Mostrar chave"}
            variant="neutral"
            size="sm"
            className="mr-1"
            onClick={() => setShowKey((v) => !v)}
          />
        </Field>
      )}

      <div className="flex items-center gap-2">
        <Button
          onClick={handleTest}
          disabled={!canTest}
          loading={testing}
          icon={<PlugZap size={14} />}
        >
          Testar conexão
        </Button>
        {tested && !error && <span className="text-xs text-success">{modelCountLabel}</span>}
      </div>

      {/* A lista do provedor sugere, não restringe: ela vem crua e mistura
          transcrição, TTS e embeddings com os de chat, e modelo novo aparece
          antes de qualquer release. Por isso o campo livre ao lado dela. */}
      <div className="flex items-end gap-2">
        <Field label="Modelos disponíveis" htmlFor="llm-model-list" className="flex-1 min-w-0">
          <Select
            id="llm-model-list"
            size="sm"
            variant="bare"
            className="w-full"
            disabled={!tested}
            value={models.includes(model) ? model : ""}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="">{tested ? "Escolher da lista" : "Teste a conexão primeiro"}</option>
            {models.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Modelo" htmlFor="llm-model" className="flex-1 min-w-0">
          <Input
            id="llm-model"
            size="sm"
            variant="bare"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="ex.: openai/gpt-oss-20b"
          />
        </Field>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
    </Modal>
  );
}
