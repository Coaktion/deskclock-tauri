import type { DriveStep } from "driver.js";
import { tasksTourSteps } from "./tasksTour";
import { planningTourSteps } from "./planningTour";
import { retroactiveTourSteps } from "./retroactiveTour";
import { integrationsTourSteps } from "./integrationsTour";

export const TOURS: Record<string, DriveStep[]> = {
  tasks: tasksTourSteps,
  planning: planningTourSteps,
  retroactive: retroactiveTourSteps,
  integrations: integrationsTourSteps,
};
