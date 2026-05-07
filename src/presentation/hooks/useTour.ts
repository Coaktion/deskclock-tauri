import { useCallback } from "react";
import { useTourContext } from "@presentation/contexts/TourContext";
import { useAppConfig } from "@presentation/contexts/ConfigContext";

export function useTour(tourId: string): {
  startTour: () => void;
  hasSeenTour: boolean;
} {
  const { startTour: startTourCtx } = useTourContext();
  const config = useAppConfig();

  const hasSeenTour = config.get("toursSeen").includes(tourId);

  const startTour = useCallback(() => {
    startTourCtx(tourId);
  }, [startTourCtx, tourId]);

  return { startTour, hasSeenTour };
}
