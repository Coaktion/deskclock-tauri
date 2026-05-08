import type { DriveStep } from "driver.js";
import { tasksTourSteps } from "./tasksTour";
import { planningTourSteps } from "./planningTour";
import { retroactiveTourSteps } from "./retroactiveTour";
import { integrationsTourSteps } from "./integrationsTour";
import { googleDetailTourSteps } from "./googleDetailTour";
import { clockifyDetailTourSteps } from "./clockifyDetailTour";
import { zendeskDetailTourSteps } from "./zendeskDetailTour";

export const TOURS: Record<string, DriveStep[]> = {
  tasks: tasksTourSteps,
  planning: planningTourSteps,
  retroactive: retroactiveTourSteps,
  integrations: integrationsTourSteps,
  "google-detail": googleDetailTourSteps,
  "clockify-detail": clockifyDetailTourSteps,
  "zendesk-detail": zendeskDetailTourSteps,
};
