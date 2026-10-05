/** Typed application errors. Messages are safe to show to users; stack traces never are. */
export type AppErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "READ_ONLY" | "RATE_LIMITED";

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  READ_ONLY: 403,
  RATE_LIMITED: 429,
};

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
  get status() {
    return STATUS[this.code];
  }
}

export const READ_ONLY_MESSAGE = "The demo workspace is read-only. Create a free account to track your own competitors.";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; code: AppErrorCode | "INTERNAL"; message: string; fieldErrors?: Record<string, string[]> };

export function toActionError(e: unknown): Extract<ActionResult, { ok: false }> {
  if (e instanceof AppError) {
    return { ok: false, code: e.code, message: e.message, fieldErrors: e.details as Record<string, string[]> | undefined };
  }
  console.error(e);
  return { ok: false, code: "INTERNAL", message: "Something went wrong. Please try again." };
}
