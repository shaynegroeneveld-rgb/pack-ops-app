export const REPOSITORY_BOUNDARY_RULES = [
  "Repositories fetch, persist, and map only.",
  "Repositories never compute derived workflow flags.",
  "Repositories never decide permissions.",
  "Repositories return domain objects, not raw Supabase rows.",
  "Repositories accept command inputs and produce insert/update payloads through mappers.",
] as const;
