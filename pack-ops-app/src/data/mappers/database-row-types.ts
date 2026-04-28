import type { Database } from "@/data/supabase/types";

export type PublicTables = Database["public"]["Tables"];

export type TableRow<TName extends keyof PublicTables> = PublicTables[TName] extends {
  Row: infer TRow;
}
  ? TRow
  : never;

export type TableInsert<TName extends keyof PublicTables> = PublicTables[TName] extends {
  Insert: infer TInsert;
}
  ? TInsert
  : never;

export type TableUpdate<TName extends keyof PublicTables> = PublicTables[TName] extends {
  Update: infer TUpdate;
}
  ? TUpdate
  : never;
