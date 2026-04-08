import type { UUID } from "@shared/types";

export interface Category {
  id: UUID;
  name: string;
  defaultBillable: boolean;
}
