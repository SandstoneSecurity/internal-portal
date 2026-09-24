import type { PortalData } from "../../shared/types";

/** A failed API call. `fields` maps form field names to the server's message for each. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: Record<string, string> = {}
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON (e.g. an Access sign-in page after the session expired).
  }
  if (!res.ok) {
    const body = (json ?? {}) as { error?: string; message?: string; fields?: Record<string, string> };
    const message =
      res.status === 401 || res.status === 403
        ? body.message ?? "Your sign-in has expired. Reload the page to sign in again."
        : body.error ?? `Request failed (${res.status}).`;
    throw new ApiError(message, res.status, body.fields ?? {});
  }
  return json as T;
}

export async function fetchPortal(): Promise<PortalData> {
  return parse<PortalData>(await fetch("/api/portal", { credentials: "same-origin" }));
}

/** Writes carry the portal header; the Worker refuses writes without it (cross-site guard). */
export async function send<T = { ok: true; id?: number; ref?: string }>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: { "X-Sandstone-Portal": "1", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parse<T>(res);
}
