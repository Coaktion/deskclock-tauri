import { v4 as uuidv4 } from "uuid";
import type { UUID } from "@shared/types";

export const generateUUID = (): UUID => uuidv4();
