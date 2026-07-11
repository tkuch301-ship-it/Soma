import { NextResponse } from "next/server";
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from "./errors";

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof ConflictError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Internal Server Error";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Minimal shape of the error object returned by @supabase/supabase-js (PostgREST/Postgres). */
export interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

/**
 * Translates a PostgREST/Postgres error (as returned by supabase-js in
 * `{ data, error }` responses) into the app's ValidationError / NotFoundError
 * / ConflictError hierarchy, so callers in src/lib/repo.ts can just `throw`
 * the result and let handleApiError produce the right HTTP status.
 *
 * Reference: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export function mapPostgrestError(
  error: PostgrestLikeError | null | undefined,
  fallbackMessage = "Unexpected database error"
): Error {
  if (!error) {
    return new Error(fallbackMessage);
  }
  const message = error.message || fallbackMessage;
  switch (error.code) {
    case "23505": // unique_violation
      return new ConflictError(message);
    case "23503": // foreign_key_violation
    case "23502": // not_null_violation
    case "23514": // check_violation
    case "22P02": // invalid_text_representation (e.g. bad enum/int literal)
      return new ValidationError(message);
    case "PGRST116": // e.g. .single() found no rows (or too many)
      return new NotFoundError(message);
    default:
      return new Error(message);
  }
}
