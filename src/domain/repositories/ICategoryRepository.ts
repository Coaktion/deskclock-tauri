import type { Category } from "@domain/entities/Category";
import type { UUID } from "@shared/types";

export interface ICategoryRepository {
  findAll(): Promise<Category[]>;
  findByName(name: string): Promise<Category | null>;
  save(category: Category): Promise<void>;
  update(id: UUID, name: string, defaultBillable: boolean): Promise<void>;
  delete(id: UUID): Promise<void>;
}
