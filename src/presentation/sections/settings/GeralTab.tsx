import { useEffect, useState } from "react";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { ALL_ROUNDING_SLOTS } from "@shared/utils/roundDuration";
import type { RoundingSlot } from "@shared/utils/roundDuration";
import { ToggleRow, NumberInputWithCommit, SettingsCard, CardRow } from "./SettingsShared";

export function GeralTab() {
  const config = useAppConfig();

  const [userName, setUserName] = useState("");
  const [showWelcome, setShowWelcome] = useState(true);
  const [startOnBoot, setStartOnBoot] = useState(false);
  const [liveTrayTimer, setLiveTrayTimer] = useState(false);
  const [closeOnFocusLoss, setCloseOnFocusLoss] = useState(false);
  const [discardTasksUnderOneMinute, setDiscardTasksUnderOneMinute] = useState(false);
  const [roundingEnabled, setRoundingEnabled] = useState(false);
  const [roundingSlots, setRoundingSlots] = useState<RoundingSlot[]>([15, 30, 45, 60]);
  const [roundingTolerance, setRoundingTolerance] = useState(0);
  const [dailyGoalHours, setDailyGoalHours] = useState(8);
  const [weeklyGoalHours, setWeeklyGoalHours] = useState(40);
  const [showWeekend, setShowWeekend] = useState(true);

  useEffect(() => {
    if (!config.isLoaded) return;
    setUserName(config.get("userName"));
    setShowWelcome(config.get("showWelcomeMessage"));
    setLiveTrayTimer(config.get("liveTrayTimer"));
    setCloseOnFocusLoss(config.get("closeOnFocusLoss"));
    setDiscardTasksUnderOneMinute(config.get("discardTasksUnderOneMinute"));
    setRoundingEnabled(config.get("roundingEnabled"));
    setRoundingSlots(config.get("roundingSlots"));
    setRoundingTolerance(config.get("roundingTolerance"));
    setDailyGoalHours(config.get("dailyGoalHours"));
    setWeeklyGoalHours(config.get("weeklyGoalHours"));
    setShowWeekend(config.get("showWeekend"));
    isEnabled()
      .then(setStartOnBoot)
      .catch(() => {});
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle(
    key:
      | "showWelcomeMessage"
      | "liveTrayTimer"
      | "closeOnFocusLoss"
      | "discardTasksUnderOneMinute",
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

  async function handleShowWeekend(value: boolean) {
    setShowWeekend(value);
    await config.set("showWeekend", value);
  }

  async function handleUserNameBlur() {
    await config.set("userName", userName);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 p-4 bg-gray-900 border border-gray-800 rounded-xl">
        <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white text-lg font-semibold flex-shrink-0 select-none">
          {userName ? userName[0].toUpperCase() : "?"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">
            Como quer ser chamado?
          </p>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            onBlur={handleUserNameBlur}
            placeholder="Seu nome"
            className="w-full bg-transparent text-sm font-medium text-gray-100 placeholder-gray-500 focus:outline-none"
          />
        </div>
      </div>

      <SettingsCard>
        <CardRow>
          <ToggleRow
            label="Abrir acesso rápido ao iniciar"
            description="Exibe o painel de ações ao abrir o app. Use Ctrl+K para abrí-lo a qualquer momento."
            value={showWelcome}
            onChange={(v) => handleToggle("showWelcomeMessage", setShowWelcome, v)}
          />
        </CardRow>
        <CardRow>
          <ToggleRow
            label="Iniciar na inicialização do computador"
            description="Abre o DeskClock automaticamente ao ligar o computador"
            value={startOnBoot}
            onChange={handleStartOnBoot}
          />
        </CardRow>
        <CardRow>
          <ToggleRow
            label="Timer ao vivo no ícone da bandeja"
            description="Mostra o tempo da tarefa em execução no tooltip do ícone"
            value={liveTrayTimer}
            onChange={(v) => handleToggle("liveTrayTimer", setLiveTrayTimer, v)}
          />
        </CardRow>
        <CardRow>
          <ToggleRow
            label="Fechar ao perder foco"
            description="Oculta a janela automaticamente ao clicar fora dela. Use o pin na barra de título para fixá-la temporariamente."
            value={closeOnFocusLoss}
            onChange={(v) => handleToggle("closeOnFocusLoss", setCloseOnFocusLoss, v)}
          />
        </CardRow>
        <CardRow>
          <ToggleRow
            label="Descartar tarefas com menos de 1 minuto"
            description="Ao parar uma tarefa com duração inferior a 1 minuto, ela é descartada automaticamente."
            value={discardTasksUnderOneMinute}
            onChange={(v) =>
              handleToggle("discardTasksUnderOneMinute", setDiscardTasksUnderOneMinute, v)
            }
          />
        </CardRow>
        <CardRow>
          <ToggleRow
            label="Arredondar duração ao parar"
            description="Arredonda a duração registrada para o slot de tempo ativo mais próximo."
            value={roundingEnabled}
            onChange={handleRoundingEnabled}
          />
          {roundingEnabled && (
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-xs text-gray-400 mb-2">Slots ativos</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_ROUNDING_SLOTS.map((slot) => {
                    const active = roundingSlots.includes(slot);
                    return (
                      <button
                        key={slot}
                        onClick={() => handleRoundingSlotToggle(slot)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                          active
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                        }`}
                      >
                        {slot === 60 ? "1h" : `${slot}m`}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Tolerância</p>
                <p className="text-xs text-gray-500 mb-2">
                  Quando uma tarefa passa de um slot ativo, se for encerrada ainda dentro desta
                  tolerância, é arredondada para o slot recém ultrapassado. Do contrário, irá para o
                  próximo slot.
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {[0, 1, 2, 5, 10, 15].map((min) => (
                    <button
                      key={min}
                      onClick={() => handleRoundingTolerance(min)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                        roundingTolerance === min
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                      }`}
                    >
                      {min === 0 ? "0m (sempre sobe)" : `${min}m`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardRow>
      </SettingsCard>

      <SettingsCard>
        <CardRow>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-3">
            Jornada
          </p>
          <div className="flex gap-4">
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
          </div>
        </CardRow>
        <CardRow>
          <ToggleRow
            label="Exibir fim de semana no planejamento"
            description="Mostra sábado e domingo na visualização semanal"
            value={showWeekend}
            onChange={handleShowWeekend}
          />
        </CardRow>
      </SettingsCard>

      <SettingsCard>
        <CardRow>
          <button
            onClick={async () => {
              await config.set("mainWindowPosition", { x: -1, y: -1 });
              await config.set("overlayPosition_execution", { x: -1, y: -1 });
              await config.set("overlayPosition_planning", { x: -1, y: -1 });
              await config.set("overlayPosition_compact", { x: -1, y: -1 });
            }}
            className="text-xs text-gray-400 hover:text-gray-200 underline underline-offset-2 transition-colors"
          >
            Redefinir posições salvas das janelas
          </button>
        </CardRow>
      </SettingsCard>
    </div>
  );
}
