/**
 * The part of expo-sqlite's `SQLiteDatabase` the platform uses; an expo-sqlite database satisfies it
 * as is. Narrowing to three methods keeps storage testable against a real SQLite in Node.
 */
export interface SqlDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: (string | number | null)[]): Promise<unknown>;
  getAllAsync<T>(source: string, params?: (string | number | null)[]): Promise<T[]>;
}
