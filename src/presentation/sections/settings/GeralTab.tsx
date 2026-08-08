import { useEffect, useState } from "react";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { ALL_ROUNDING_SLOTS } from "@shared/utils/roundDuration";
import type { RoundingSlot } from "@shared/utils/roundDuration";
import { SectionCard, SectionRow, Toggle } from "@presentation/components/ui";
import { NumberInputWithCommit } from "./SettingsShared";

/** Escolha dentro de um grupo — retangular, ao contrário da pílula de filtro. */
function ChoiceChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`px-2.5 py-1 rounded-chip text-xs font-medium border transition-colors ${
        active
          ? "bg-accent/10 border-accent/40 text-accent-text"
          : "bg-raised border-border text-fg-muted hover:border-fg-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

export function GeralTab() {
  const config = useAppConfig();

  const [userName, setUserName] = useState("");
  const [showWelcome, setShowWelcome] = useState(true);
  const [startOnBoot, setStartOnBoot] = useState(false);
  const [liveTrayTimer, setLiveTrayTimer] = useState(false);
  const [closeOnFocusLoss, setCloseOnFocusLoss] = useState(false);
  const [discardTasksUnderOneMinute, setDiscardTasksUnderOneMinute] = useState(false);
  const [showIntegrationsRail, setShowIntegrationsRail] = useState(true);
  const [roundingEnabled, setRoundingEnabled] = useState(false);
  const [roundingSlots, setRoundingSlots] = useState<RoundingSlot[]>([15, 30, 45, 60]);
  const [roundingTolerance, setRoundingTolerance] = useState(0);
  const [dailyGoalHours, setDailyGoalHours] = useState(8);
  const [weeklyGoalHours, setWeeklyGoalHours] = useState(40);

  useEffect(() => {
    if (!config.isLoaded) return;
    setUserName(config.get("userName"));
    setShowWelcome(config.get("showWelcomeMessage"));
    setLiveTrayTimer(config.get("liveTrayTimer"));
    setCloseOnFocusLoss(config.get("closeOnFocusLoss"));
    setDiscardTasksUnderOneMinute(config.get("discardTasksUnderOneMinute"));
    setShowIntegrationsRail(config.get("showIntegrationsRail"));
    setRoundingEnabled(config.get("roundingEnabled"));
    setRoundingSlots(config.get("roundingSlots"));
    setRoundingTolerance(config.get("roundingTolerance"));
    setDailyGoalHours(config.get("dailyGoalHours"));
    setWeeklyGoalHours(config.get("weeklyGoalHours"));
    isEnabled()
      .then(setStartOnBoot)
      .catch(() => {});
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle(
    key:
      | "showWelcomeMessage"
      | "liveTrayTimer"
      | "closeOnFocusLoss"
      | "discardTasksUnderOneMinute"
      | "showIntegrationsRail",
    setter: (v: boolean) => void,
    value: boolean
  ) {
    setter(value);
    await config.set(key, value);
  }

  async function handleStartOnBoot(value: boolean) {
    setStartOnBoot(value);
    await config.set("startOnBoot", value);
    if (value) {
      await enable();
    } else {
      await disable();
    }
  }

  async function handleRoundingEnabled(value: boolean) {
    setRoundingEnabled(value);
    await config.set("roundingEnabled", value);
  }

  async function handleRoundingSlotToggle(slot: RoundingSlot) {
    const next = roundingSlots.includes(slot)
      ? roundingSlots.filter((s) => s !== slot)
      : ([...roundingSlots, slot].sort((a, b) => a - b) as RoundingSlot[]);
    setRoundingSlots(next);
    await config.set("roundingSlots", next);
  }

  async function handleRoundingTolerance(value: number) {
    setRoundingTolerance(value);
    await config.set("roundingTolerance", value);
  }

  async function handleUserNameBlur() {
    await config.set("userName", userName);
  }

  return (
    <div className="space-y-3">
      <SectionCard title="Conta">
        <SectionRow className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center text-accent-text text-lg font-semibold shrink-0 select-none">
            {userName ? userName[0].toUpperCase() : "?"}
          </div>
          <div className="flex-1 min-w-0">
            <label htmlFor="settings-user-name" className="block text-xs text-fg-muted">
              Como quer ser chamado?
            </label>
            <input
              id="settings-user-name"
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              onBlur={handleUserNameBlur}
              placeholder="Seu nome"
              className="w-full bg-transparent text-sm font-medium text-fg placeholder-fg-muted focus:outline-none"
              autoComplete="off"
            />
          </div>
        </SectionRow>
      </SectionCard>

      <SectionCard title="Comportamento" divided>
        <SectionRow>
          <Toggle
            label="Abrir acesso rápido ao iniciar"
            description="Exibe o painel de ações ao abrir o app. Use Ctrl+K para abrí-lo a qualquer momento."
            checked={showWelcome}
            onChange={(v) => handleToggle("showWelcomeMessage", setShowWelcome, v)}
          />
        </SectionRow>
        <SectionRow>
          <Toggle
            label="Iniciar na inicialização do computador"
            description="Abre o DeskClock automaticamente ao ligar o computador"
            checked={startOnBoot}
            onChange={handleStartOnBoot}
          />
        </SectionRow>
        <SectionRow>
          <Toggle
            label="Timer ao vivo no ícone da bandeja"
            description="Mostra o tempo da tarefa em execução no tooltip do ícone"
            checked={liveTrayTimer}
            onChange={(v) => handleToggle("liveTrayTimer", setLiveTrayTimer, v)}
          />
        </SectionRow>
        <SectionRow>
          <Toggle
            label="Fechar ao perder foco"
            description="Oculta a janela automaticamente ao clicar fora dela. Use o pin na barra de título para fixá-la temporariamente."
            checked={closeOnFocusLoss}
            onChange={(v) => handleToggle("closeOnFocusLoss", setCloseOnFocusLoss, v)}
          />
        </SectionRow>
        <SectionRow>
          <Toggle
            label="Mostrar rail de integrações"
            description="Exibe uma coluna estreita à direita com atalhos para as integrações conectadas (Sheets, Agenda, Clockify)."
            checked={showIntegrationsRail}
            onChange={(v) => handleToggle("showIntegrationsRail", setShowIntegrationsRail, v)}
          />
        </SectionRow>
      </SectionCard>

      <SectionCard title="Duração" divided>
        <SectionRow>
          <Toggle
            label="Descartar tarefas com menos de 1 minuto"
            description="Ao parar uma tarefa com duração inferior a 1 minuto, ela é descartada automaticamente."
            checked={discardTasksUnderOneMinute}
            onChange={(v) =>
              handleToggle("discardTasksUnderOneMinute", setDiscardTasksUnderOneMinute, v)
            }
          />
        </SectionRow>
        <SectionRow>
          <Toggle
            label="Arredondar duração ao parar"
            description="Arredonda a duração registrada para o slot de tempo ativo mais próximo."
            checked={roundingEnabled}
            onChange={handleRoundingEnabled}
          />
          {roundingEnabled && (
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-xs text-fg-secondary mb-2">Slots ativos</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_ROUNDING_SLOTS.map((slot) => (
                    <ChoiceChip
                      key={slot}
                      active={roundingSlots.includes(slot)}
                      onClick={() => handleRoundingSlotToggle(slot)}
                    >
                      {slot === 60 ? "1h" : `${slot}m`}
                    </ChoiceChip>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-fg-secondary mb-1">Tolerância</p>
                <p className="text-xs text-fg-muted mb-2">
                  Quando uma tarefa passa de um slot ativo, se for encerrada ainda dentro desta
                  tolerância, é arredondada para o slot recém ultrapassado. Do contrário, irá para o
                  próximo slot.
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {[0, 1, 2, 5, 10, 15].map((min) => (
                    <ChoiceChip
                      key={min}
                      active={roundingTolerance === min}
                      onClick={() => handleRoundingTolerance(min)}
                    >
                      {min === 0 ? "0m (sempre sobe)" : `${min}m`}
                    </ChoiceChip>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SectionRow>
      </SectionCard>

      <SectionCard title="Jornada">
        <SectionRow className="flex gap-4">
          <NumberInputWithCommit
            label="Meta diária (horas)"
            min={1}
            max={24}
            committed={dailyGoalHours}
            onCommit={async (v) => {
              setDailyGoalHours(v);
              await config.set("dailyGoalHours", v);
            }}
          />
          <NumberInputWithCommit
            label="Meta semanal (horas)"
            min={1}
            max={168}
            committed={weeklyGoalHours}
            onCommit={async (v) => {
              setWeeklyGoalHours(v);
              await config.set("weeklyGoalHours", v);
            }}
          />
        </SectionRow>
      </SectionCard>

      <SectionCard title="Janelas">
        <SectionRow>
          <button
            onClick={async () => {
              await config.set("mainWindowPosition", { x: -1, y: -1 });
              await config.set("overlayPosition_execution", { x: -1, y: -1 });
              await config.set("overlayPosition_planning", { x: -1, y: -1 });
              await config.set("overlayPosition_compact", { x: -1, y: -1 });
            }}
            className="text-xs text-fg-secondary hover:text-fg underline underline-offset-2 transition-colors"
          >
            Redefinir posições salvas das janelas
          </button>
        </SectionRow>
      </SectionCard>
    </div>
  );
}
