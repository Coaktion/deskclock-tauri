import { createContext, useCallback, useContext } from "react";
import { driver } from "driver.js";
import type { ConfigContextValue } from "./ConfigContext";
import { TOURS } from "@presentation/tours";

interface TourContextValue {
  startTour: (tourId: string) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({
  children,
  config,
}: {
  children: React.ReactNode;
  config: ConfigContextValue;
}) {
  const startTour = useCallback(
    (tourId: string) => {
      const steps = TOURS[tourId];
      if (!steps) return;

      const driverObj = driver({
        animate: true,
        overlayOpacity: 0.75,
        smoothScroll: true,
        popoverClass: "deskclock-tour",
        showProgress: true,
        progressText: "{{current}} de {{total}}",
        nextBtnText: "Próximo →",
        prevBtnText: "← Anterior",
        doneBtnText: "Concluir",
        steps,
        onPopoverRender: (popover) => {
          const skipBtn = document.createElement("button");
          skipBtn.textContent = "Pular tour";
          skipBtn.className = "driver-tour-skip-btn";
          skipBtn.addEventListener("click", () => {
          const seen = config.get("toursSeen");
          if (!seen.includes(tourId)) {
            void config.set("toursSeen", [...seen, tourId]);
          }
          driverObj.destroy();
        });
          popover.footer.prepend(skipBtn);
        },
        onDestroyStarted: () => {
          const seen = config.get("toursSeen");
          if (!seen.includes(tourId)) {
            config.set("toursSeen", [...seen, tourId]);
          }
          driverObj.destroy();
        },
      });

      driverObj.drive();
    },
    [config]
  );

  return <TourContext.Provider value={{ startTour }}>{children}</TourContext.Provider>;
}

export function useTourContext(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTourContext must be used inside TourProvider");
  return ctx;
}
