import { seedSOW, SOWItem } from './seedSOW'

// Future integration point: replace the in-memory dataset with calls to AWS Postgres.
// Keep the function signatures intact so downstream UI never changes when data source swaps.

export async function loadSOW(): Promise<SOWItem[]> {
  // Simulate async data loading; in production, fetch from backend/DB here.
  return Promise.resolve([...seedSOW])
}

export async function persistSOW(_items: SOWItem[]): Promise<void> {
  // Placeholder for future persistence logic. When AWS Postgres is ready,
  // implement upsert logic here and keep UI untouched.
  return Promise.resolve()
}
