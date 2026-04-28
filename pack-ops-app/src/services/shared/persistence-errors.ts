import { getSyncErrorMessage } from "@/data/sync/errors";

type ErrorWithCode = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function asErrorWithCode(error: unknown): ErrorWithCode {
  if (typeof error === "object" && error !== null) {
    return error as ErrorWithCode;
  }

  return {};
}

export function normalizePersistenceError(
  error: unknown,
  options: {
    entityLabel: string;
    operation: string;
    table: string;
    migrationHint?: string;
  },
): Error {
  const candidate = asErrorWithCode(error);
  const message = getSyncErrorMessage(error, `${options.entityLabel} ${options.operation} failed.`);

  if (
    candidate.code === "PGRST204" ||
    candidate.code === "42703" ||
    candidate.code === "42P01" ||
    candidate.message?.includes("schema cache") ||
    candidate.message?.includes("does not exist")
  ) {
    return new Error(
      `${options.entityLabel} ${options.operation} failed on ${options.table} because the database schema is out of date.${options.migrationHint ? ` Apply migration ${options.migrationHint} and try again.` : ""}`,
    );
  }

  if (candidate.code === "42501") {
    return new Error(
      `${options.entityLabel} ${options.operation} was blocked by a database policy on ${options.table}. ${message}`,
    );
  }

  return new Error(`${options.entityLabel} ${options.operation} failed on ${options.table} — ${message}`);
}
