import type { DriveStep } from "driver.js";
import { tasksTourSteps } from "./tasksTour";
import { planningTourSteps } from "./planningTour";

export const TOURS: Record<string, DriveStep[]> = {
  tasks: tasksTourSteps,
  planning: planningTourSteps,
};
