import type { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error("[ERROR]", err);
  const e = err as any;
  const message = e instanceof Error ? e.message : "Internal server error";
  const statusCode = res.statusCode && res.statusCode >= 400 ? res.statusCode : 500;

  const payload: Record<string, unknown> = { error: message };

  // Surface the underlying cause so the client can see WHY the request failed.
  if (process.env.NODE_ENV !== "test" && e?.cause) {
    const cause = e.cause;
    if (cause instanceof Response) {
      // openid-client attaches the failed Response as cause
      const ct = cause.headers.get("content-type") ?? "(none)";
      payload.cause = `HTTP ${cause.status} ${cause.statusText} (content-type=${ct})`;
      // Include a short body preview when it's an error (helps debug "unexpected content-type")
      if (!cause.ok) {
        cause.text().then((body) => {
          // We can't change statusCode here (response already sent), but log for debugging
          console.error(`[ERROR] Failed response body (${cause.status}, ct=${ct}):`, body.substring(0, 500));
        }).catch(() => {});
      }
    } else {
      payload.cause = cause instanceof Error ? cause.message : String(cause);
    }
  }

  res.status(statusCode).json(payload);
}
