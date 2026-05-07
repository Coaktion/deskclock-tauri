import type { DriveStep } from "driver.js";
import { tasksTourSteps } from "./tasksTour";

export const TOURS: Record<string, DriveStep[]> = {
  tasks: tasksTourSteps,
};
