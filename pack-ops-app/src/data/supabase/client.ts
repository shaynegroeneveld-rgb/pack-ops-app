import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/data/supabase/env";

let client: SupabaseClient | null = null;

export function getSupabaseClient(env: Record<string, string | undefined>): SupabaseClient {
  if (client) {
    return client;
  }

  const supabaseEnv = getSupabaseEnv(env);
  client = createClient(supabaseEnv.url, supabaseEnv.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return client;
}
