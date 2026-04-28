export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export function getSupabaseEnv(env: Record<string, string | undefined>): SupabaseEnv {
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return { url, anonKey };
}
