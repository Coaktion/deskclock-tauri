import type { DriveStep } from "driver.js";
import { tasksTourSteps } from "./tasksTour";
import { planningTourSteps } from "./planningTour";
import { retroactiveTourSteps } from "./retroactiveTour";

export const TOURS: Record<string, DriveStep[]> = {
  tasks: tasksTourSteps,
  planning: planningTourSteps,
  retroactive: retroactiveTourSteps,
};
