import { useState } from "react";
import { ChevronRight, ChevronLeft, Clock, Plug } from "lucide-react";
import type { ReactNode } from "react";
import type { ConfigContextValue } from "@presentation/contexts/ConfigContext";
import type { Page } from "@presentation/components/Sidebar";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { GoogleLogo } from "@presentation/sections/integrations/google/GoogleLogo";
import { ZendeskLogoSmall } from "@presentation/sections/integrations/ZendeskIntegrationSection";
import { ClockifyLogo } from "@presentation/sections/integrations/clockify/ClockifyLogo";
import { MondayLogo } from "@presentation/sections/integrations/monday/MondayLogo";

const STEPS = ["Boas-vindas", "Integrações"] as const;

/**
 * As mesmas quatro integrações da tela de Integrações, na mesma ordem — aqui
 * elas são só um cartaz: os modais de conexão vivem dentro do
 * `IntegrationsModalsHost`, que só existe depois que o setup termina. Por isso o
 * passo tem um destino só, o botão que leva à tela.
 */
const SUGGESTIONS: { logo: ReactNode; name: string; description: string }[] = [
  {
    logo: <GoogleLogo size={18} />,
    name: "Google",
    description: "Reuniões da Agenda viram planejadas; horas sobem para uma planilha",
  },
  {
    logo: <MondayLogo size={18} />,
    name: "Monday",
    description: "Projetos e itens dos boards viram catálogo e planejadas",
  },
  {
    logo: <ClockifyLogo size={18} />,
    name: "Clockify",
    description: "Projetos e tags viram catálogo; cada tarefa vira uma entrada de tempo",
  },
  {
    logo: <ZendeskLogoSmall size={18} />,
    name: "Zendesk",
    description: "Tickets viram tarefas planejadas",
  },
];

interface SetupModalProps {
  config: ConfigContextValue;
  /** `page` é onde o app abre. Vazio abre onde sempre abriu, em Tarefas. */
  onComplete: (page?: Page) => void;
}

export function SetupModal({ config, onComplete }: SetupModalProps) {
  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleComplete(page?: Page) {
    setSaving(true);
    if (userName.trim()) await config.set("userName", userName.trim());
    await config.set("setupCompleted", true);
    onComplete(page);
  }

  const isLast = step === STEPS.length - 1;

  /**
   * Avançar é o submit deste formulário. No último passo ele segue o botão
   * primário — que é ir para Integrações, o único caminho que o passo oferece.
   */
  function advance() {
    if (isLast) void handleComplete("integrations");
    else setStep((s) => s + 1);
  }

  const handleKeyDown = useSubmitOnEnter(advance, { disabled: saving });

  return (
    // A lista de integrações fez o passo mais alto que a janela de 620 px em que
    // o setup abre (`useStartupWindow`), então o conteúdo rola: `my-auto` centra
    // quando cabe e vira 0 quando não cabe, sem cortar o topo como `items-center`
    // cortaria.
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-canvas">
      <div
        onKeyDown={handleKeyDown}
        className="w-full max-w-lg mx-4 my-auto py-8 flex flex-col gap-8"
      >
        {/* Logo + título */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="p-3 bg-accent/20 rounded-card">
            <Clock size={32} className="text-accent-text" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-fg">Bem-vindo ao DeskClock</h1>
            <p className="text-sm text-fg-secondary mt-1">
              Vamos configurar o básico para você começar
            </p>
          </div>
        </div>

        {/* Indicador de progresso */}
        <div className="flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div
                className={`flex-1 h-1 rounded-full transition-colors ${
                  i <= step ? "bg-accent" : "bg-raised"
                }`}
              />
              {i === STEPS.length - 1 && (
                <div
                  className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                    i < step ? "bg-accent" : i === step ? "bg-accent" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Conteúdo do passo */}
        <div className="bg-surface border border-border-subtle rounded-card p-6 flex flex-col gap-4">
          {step === 0 && (
            <>
              <div>
                <h2 className="text-base font-medium text-fg">Como quer ser chamado?</h2>
                <p className="text-sm text-fg-secondary mt-1">
                  Usado na mensagem de boas-vindas ao abrir o app.
                </p>
              </div>
              <input
                autoFocus
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Seu nome (opcional)"
                autoComplete="off"
                className="w-full px-3 py-2 text-sm bg-raised border border-border rounded-control text-fg placeholder-fg-muted focus:outline-none focus:border-accent"
              />
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <h2 className="text-base font-medium text-fg">Conecte suas ferramentas</h2>
                <p className="text-sm text-fg-secondary mt-1">
                  Uma integração traz projetos, categorias e tarefas planejadas prontos — e devolve
                  as horas para onde o time já as consulta.
                </p>
              </div>

              <ul className="flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <li
                    key={s.name}
                    className="flex items-center gap-3 px-3 py-2 rounded-control border border-border-subtle bg-raised/30"
                  >
                    <span className="shrink-0 w-8 h-8 rounded-control bg-raised/60 flex items-center justify-center text-fg-secondary">
                      {s.logo}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-fg">{s.name}</div>
                      <div className="text-xs text-fg-muted mt-0.5">{s.description}</div>
                    </div>
                  </li>
                ))}
              </ul>

              <p className="text-xs text-fg-muted">
                Sem integração nenhuma o app funciona igual: projetos e categorias se cadastram a
                qualquer momento na tela de Dados.
              </p>
            </>
          )}
        </div>

        {/* Navegação */}
        <div className="flex items-center justify-between">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-1.5 text-sm text-fg-secondary hover:text-fg transition-colors"
            >
              <ChevronLeft size={16} />
              Voltar
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            {isLast && (
              <button
                onClick={() => void handleComplete()}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-fg-muted hover:text-fg-secondary disabled:opacity-50 transition-colors"
              >
                Agora não
              </button>
            )}
            <button
              onClick={advance}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-accent hover:opacity-90 disabled:opacity-50 text-white rounded-control transition font-medium"
            >
              {isLast ? (
                <>
                  <Plug size={14} />
                  Configurar integrações
                </>
              ) : (
                <>
                  Próximo
                  <ChevronRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
