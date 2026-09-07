/**
 * Raw socket HTTPS fetch implementation.
 *
 * Why this exists:
 * On Windows machines behind corporate Squid proxies, Node's fetch/undici/axios
 * all go through WinHTTP auto-proxy detection, which routes requests to Squid.
 * Squid often ERR_ACCESS_DENIED for internal IPs.
 *
 * Using raw TCP+TLS sockets bypasses any HTTP-level proxy interception entirely.
 *
 * This is intentionally minimal — only implements what openid-client needs:
 *   - GET/POST with string/JSON/URLSearchParams body
 *   - Headers (object or Headers instance)
 *   - HTTPS only (HTTP falls back to global fetch)
 *
 * @see https://github.com/nodejs/node/issues/43522 for the proxy interception issue
 */

import { Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";

const isIPv4 = (h: string) => /^[0-9.]+$/.test(h);
const isIPv6 = (h: string) => h.includes(":");

function readHeaders(headerText: string): { status: number; statusText: string; headers: Record<string, string> } {
  const lines = headerText.split("\r\n");
  const statusLine = lines[0] || "";
  const m = statusLine.match(/^HTTP\/[\d.]+\s+(\d+)(?:\s+(.*))?$/);
  const status = m ? Number(m[1]) : 0;
  const statusText = m?.[2] ?? "";
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(":");
    if (idx > 0) headers[line.substring(0, idx).trim().toLowerCase()] = line.substring(idx + 1).trim();
  }
  return { status, statusText, headers };
}

function bodyToString(body: unknown): string | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer) return Buffer.from(body).toString("utf8");
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString("utf8");
  if (typeof body === "object") {
    try {
      return JSON.stringify(body);
    } catch {
      return String(body);
    }
  }
  return String(body);
}

function headersToObject(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((v, k) => (out[k] = v));
  } else if (Array.isArray(headers)) {
    for (const [k, v] of headers) out[k] = v;
  } else {
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v === "string" || typeof v === "number") out[k] = String(v);
    }
  }
  return out;
}

/**
 * A fetch-compatible function that uses raw TCP+TLS sockets to bypass any
 * system-level HTTP proxy interception (e.g. WinHTTP → Squid).
 */
export async function rawSocketFetch(
  input: string | URL | Request,
  init?: {
    method?: string;
    headers?: HeadersInit;
    body?: BodyInit | null;
    signal?: AbortSignal;
  },
): Promise<Response> {
  const url = input instanceof URL
    ? input
    : typeof input === "string"
      ? new URL(input)
      : new URL(input.url);

  // Fall back to global fetch for HTTP (no TLS handshake to worry about
  // and proxy on http is often less restrictive).
  if (url.protocol === "http:") {
    return fetch(input, init as RequestInit);
  }
  if (url.protocol !== "https:") {
    throw new Error(`rawSocketFetch: unsupported protocol ${url.protocol}`);
  }

  const port = url.port ? Number(url.port) : 443;
  const host = url.hostname;

  return new Promise<Response>((resolve, reject) => {
    if (init?.signal?.aborted) {
      reject(new Error("aborted"));
      return;
    }

    const sock = new Socket();
    let settled = false;
    const cleanup = () => {
      if (!settled) {
        settled = true;
        try {
          sock.destroy();
        } catch {}
      }
    };

    const onAbort = () => {
      cleanup();
      reject(new Error("aborted"));
    };
    init?.signal?.addEventListener("abort", onAbort, { once: true });

    sock.setTimeout(15000, () => {
      cleanup();
      reject(new Error(`rawSocketFetch: connect timeout to ${host}:${port}`));
    });
    sock.on("error", (err) => {
      cleanup();
      init?.signal?.removeEventListener("abort", onAbort);
      reject(err);
    });

    sock.connect(port, host, () => {
      try {
        const isIP = isIPv4(host) || isIPv6(host);
        const tlsSock = tlsConnect({
          socket: sock,
          ...(isIP ? {} : { servername: host }),
          rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0",
        });
        tlsSock.setTimeout(15000);

        let raw = "";
        let headersParsed: { status: number; statusText: string; headers: Record<string, string> } | null = null;
        const bodyChunks: Buffer[] = [];
        let expectedLength = -1;

        tlsSock.on("data", (chunk: Buffer) => {
          if (headersParsed) {
            bodyChunks.push(chunk);
            return;
          }
          raw += chunk.toString("binary");
          const sep = raw.indexOf("\r\n\r\n");
          if (sep >= 0) {
            const headerText = raw.substring(0, sep);
            const tail = raw.substring(sep + 4);
            headersParsed = readHeaders(headerText);
            const cl = headersParsed.headers["content-length"];
            if (cl) expectedLength = Number(cl);
            if (tail) bodyChunks.push(Buffer.from(tail, "binary"));
          }
        });

        tlsSock.on("end", () => {
          if (settled) return;
          settled = true;
          init?.signal?.removeEventListener("abort", onAbort);
          const body = Buffer.concat(bodyChunks);
          const headers = new Headers();
          if (headersParsed) {
            for (const [k, v] of Object.entries(headersParsed.headers)) headers.set(k, v);
            // Debug logging — visible only when SSO_DEBUG=1
            if (process.env.SSO_DEBUG === "1") {
              const ct = headersParsed.headers["content-type"] ?? "(none)";
              console.log(
                `[rawSocketFetch] ${url.href} → ${headersParsed.status} (${body.length} bytes, ct=${ct})`,
              );
            }
            resolve(new Response(body, { status: headersParsed.status, statusText: headersParsed.statusText, headers }));
          } else {
            reject(new Error("rawSocketFetch: connection closed before headers received"));
          }
        });

        tlsSock.on("error", (err) => {
          if (settled) return;
          settled = true;
          init?.signal?.removeEventListener("abort", onAbort);
          reject(err);
        });

        // Build HTTP/1.1 request
        const method = (init?.method || "GET").toUpperCase();
        const path = url.pathname + url.search;

        // Use a lowercase-keyed Map to avoid case-sensitive duplicates like
        // "Content-Type" vs "content-type" causing IIS to return 400 Bad Request.
        const headerMap = new Map<string, string>();
        const setHeader = (k: string, v: string) => {
          headerMap.set(k.toLowerCase(), v);
        };
        const addHeader = (k: string, v: string) => {
          // Use add for multi-value headers (e.g. Set-Cookie), set for single
          if (k.toLowerCase() === "set-cookie") {
            const existing = headerMap.get(k.toLowerCase());
            headerMap.set(k.toLowerCase(), existing ? `${existing}, ${v}` : v);
          } else {
            headerMap.set(k.toLowerCase(), v);
          }
        };

        setHeader("Host", url.host);
        setHeader("Connection", "close");
        setHeader("Accept", "*/*");

        const body = bodyToString(init?.body);
        if (body !== undefined) {
          setHeader("Content-Length", String(Buffer.byteLength(body, "utf8")));
          if (method === "POST") {
            // Only set default Content-Type if not provided in init.headers
            const initHeaders = headersToObject(init?.headers);
            if (!Object.keys(initHeaders).some((k) => k.toLowerCase() === "content-type")) {
              setHeader("Content-Type", "application/x-www-form-urlencoded");
            }
          }
        }
        for (const [k, v] of Object.entries(headersToObject(init?.headers))) {
          setHeader(k, v);
        }

        // Debug: log outgoing request when SSO_DEBUG=1
        if (process.env.SSO_DEBUG === "1") {
          console.log(`[rawSocketFetch] >>> ${method} ${url.href}`);
          for (const [k, v] of headerMap.entries()) {
            // Mask Authorization header for security
            console.log(
              `[rawSocketFetch]     ${k}: ${k === "authorization" ? v.substring(0, 20) + "..." : v}`,
            );
          }
          if (body !== undefined) {
            console.log(
              `[rawSocketFetch]     body (${body.length} bytes): ${body.substring(0, 300)}${body.length > 300 ? "..." : ""}`,
            );
          }
        }

        const headerLines = Array.from(headerMap.entries())
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n");
        tlsSock.write(`${method} ${path} HTTP/1.1\r\n${headerLines}\r\n\r\n${body ?? ""}`);
      } catch (err) {
        cleanup();
        init?.signal?.removeEventListener("abort", onAbort);
        reject(err);
      }
    });
  });
}
