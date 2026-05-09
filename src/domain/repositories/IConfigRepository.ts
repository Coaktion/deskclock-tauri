export interface IConfigRepository {
  get<T>(key: string, defaultValue: T): Promise<T>;
  loadAll(): Promise<Record<string, unknown>>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}
