import * as client from "openid-client";
import type { Request } from "express";
import { rawSocketFetch } from "../utils/rawSocketFetch.js";
import type { AuthUser } from "../types/auth.js";

let oidcConfigPromise: Promise<client.Configuration> | null = null;

export function isSsoEnabled(): boolean {
  return process.env.SSO_ENABLED === "true";
}

/**
 * Resolve a URI to an absolute URL based on the incoming request.
 * - If the env value is an absolute URL, use it as-is.
 * - Otherwise resolve the relative path against the request's base URL
 *   (protocol + Host header), so the app works regardless of the IP/host it
 *   is served on (no need for APP_BASE_URL).
 */
function resolveUriFromRequest(
  value: string | undefined,
  fallback: string,
  baseUrl: string,
): string {
  const raw = (value ?? "").trim();
  const target = raw || fallback;
  if (/^https?:\/\//i.test(target)) return target;
  const base = baseUrl.replace(/\/$/, "");
  const path = target.startsWith("/") ? target : `/${target}`;
  return `${base}${path}`;
}

/**
 * Build the base URL (protocol + host) for the current request.
 * Falls back to localhost:3001 if no Host header is present.
 */
export function getRequestBaseUrl(req: Request): string {
  const protocol = req.protocol || "http";
  const host = req.get("host") || "localhost:3001";
  const forwardedProto = req.get("x-forwarded-proto");
  return `${forwardedProto || protocol}://${host}`;
}

export function getOidcRedirectUri(baseUrl: string): string {
  return resolveUriFromRequest(process.env.OIDC_REDIRECT_URI, "/auth/callback", baseUrl);
}

/**
 * Pre-fetch OIDC discovery metadata via raw-socket fetch, bypassing any
 * system-level HTTP proxy interception (Windows WinHTTP → Squid, etc.).
 * The IdP is then constructed manually via `client.Configuration` since
 * `client.discovery()` always uses the default fetch (which goes through
 * the system proxy).
 */
async function fetchDiscoveryMetadata(issuer: URL): Promise<client.ServerMetadata> {
  const discoveryUrl = new URL(".well-known/openid-configuration", issuer).href;
  const res = await rawSocketFetch(discoveryUrl, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = (await res.text()).substring(0, 500);
    const err: any = new Error(`Discovery HTTP ${res.status} from ${discoveryUrl}`);
    err.statusCode = res.status;
    err.response = { status: res.status, body };
    throw err;
  }
  const metadata = (await res.json()) as client.ServerMetadata;
  if (!metadata.issuer) {
    throw new Error(`Discovery response missing required 'issuer' field`);
  }
  // OIDC spec requires issuer to match the request URL (allow trailing slash diff)
  const norm = (s: string) => s.replace(/\/+$/, "");
  if (norm(metadata.issuer) !== norm(issuer.href)) {
    throw new Error(
      `Discovery issuer mismatch: OIDC_ISSUER="${issuer.href}" but IdP returned "${metadata.issuer}"`,
    );
  }
  return metadata;
}

export async function getOidcConfig(): Promise<client.Configuration> {
  if (oidcConfigPromise) return oidcConfigPromise;

  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;

  if (!issuer || !clientId) {
    throw new Error(
      "OIDC configuration missing: OIDC_ISSUER and OIDC_CLIENT_ID are required when SSO_ENABLED=true",
    );
  }

  let issuerUrl: URL;
  try {
    issuerUrl = new URL(issuer);
  } catch {
    throw new Error(`OIDC_ISSUER is not a valid URL: ${issuer}`);
  }

  const discoveryUrl = new URL(".well-known/openid-configuration", issuerUrl).href;
  console.log(`[SSO] OIDC discovery (raw socket, bypasses WinHTTP proxy): ${discoveryUrl}`);
  console.log(
    `[SSO] Env: NODE_TLS_REJECT_UNAUTHORIZED=${process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? "(unset)"}, ` +
      `HTTPS_PROXY=${process.env.HTTPS_PROXY ?? "(unset)"}, HTTP_PROXY=${process.env.HTTP_PROXY ?? "(unset)"}`,
  );

  try {
    const metadata = await fetchDiscoveryMetadata(issuerUrl);
    const config = new client.Configuration(
      metadata,
      clientId,
      clientSecret || undefined,
    );
    // Install rawSocketFetch for subsequent calls (token, end_session, userinfo, etc.)
    (config as any)[client.customFetch] = rawSocketFetch;
    console.log(`[SSO] OIDC discovery OK: issuer=${metadata.issuer}`);
    oidcConfigPromise = Promise.resolve(config);
    return config;
  } catch (err) {
    oidcConfigPromise = null; // allow retry on next call
    const e = err as any;
    const status = e?.statusCode ?? e?.response?.status;
    const responsePreview = e?.response?.body
      ? String(e.response.body).substring(0, 300)
      : undefined;
    const causeMsg = e?.cause?.message ?? e?.cause;

    const lines: string[] = [];
    lines.push(`OIDC discovery failed${status ? ` (HTTP ${status})` : ""}: ${e?.message ?? err}`);
    if (responsePreview) lines.push(`Response: ${responsePreview}`);
    if (causeMsg) lines.push(`Cause: ${causeMsg}`);
    lines.push("Hints:");
    lines.push("  - If using self-signed cert, set NODE_TLS_REJECT_UNAUTHORIZED=0");
    lines.push("  - If behind corporate proxy blocking IdP, ensure raw socket fetch is active (it is, by default)");
    lines.push("  - Check that OIDC_ISSUER and OIDC_CLIENT_ID/SECRET are correct");
    lines.push(`  - Try: curl -k ${discoveryUrl}`);

    const enhanced = new Error(lines.join("\n"));
    (enhanced as any).cause = err;
    throw enhanced;
  }
}

export interface GeneratedAuthRequest {
  url: string;
  state: string;
  codeVerifier: string;
}

export async function generateAuthUrl(baseUrl: string, customRedirectUri?: string): Promise<GeneratedAuthRequest> {
  const config = await getOidcConfig();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const redirectUri = customRedirectUri || getOidcRedirectUri(baseUrl);

  const parameters: Record<string, string> = {
    redirect_uri: redirectUri,
    scope: "openid profile email",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  };

  const authorizationUrl = client.buildAuthorizationUrl(config, parameters);

  return {
    url: authorizationUrl.href,
    state,
    codeVerifier,
  };
}

export async function handleOidcCallback(
  currentUrl: URL,
  expectedState: string,
  codeVerifier: string
): Promise<AuthUser> {
  const config = await getOidcConfig();

  // openid-client v6 reads customFetch from `int(config).fetch`, which is set
  // via the `config[client.customFetch] = rawSocketFetch` getter/setter we
  // install in `getOidcConfig()`. (The 5th arg `options[customFetch]` is
  // ignored by v6's wrapper, but we pass it too as defense-in-depth.)
  const tokens = await client.authorizationCodeGrant(
    config,
    currentUrl,
    {
      pkceCodeVerifier: codeVerifier,
      expectedState,
    },
    undefined,
    {
      [client.customFetch]: rawSocketFetch,
    } as any,
  );

  const claims = tokens.claims();
  if (!claims || !claims.sub) {
    throw new Error("ID token missing required subject claim (sub)");
  }

  // Extract roles (supports standard Realm/Resource roles in Keycloak, Entra ID, etc.)
  const roles: string[] = [];
  if (Array.isArray(claims.roles)) {
    roles.push(...(claims.roles as string[]));
  } else if (claims.realm_access && Array.isArray((claims.realm_access as any).roles)) {
    roles.push(...(claims.realm_access as any).roles);
  }

  const username =
    (claims.preferred_username as string) ||
    (claims.email as string) ||
    (claims.name as string) ||
    claims.sub;

  const name =
    (claims.name as string) ||
    (claims.preferred_username as string) ||
    username;

  return {
    id: claims.sub,
    username,
    name,
    email: claims.email as string | undefined,
    roles,
  };
}

export async function getLogoutUrl(baseUrl: string): Promise<string> {
  if (!isSsoEnabled()) return "/";
  try {
    const config = await getOidcConfig();
    const postLogoutRedirectUri = resolveUriFromRequest(
      process.env.OIDC_LOGOUT_URI,
      "",
      baseUrl,
    );
    const endSessionUrl = client.buildEndSessionUrl(config, {
      post_logout_redirect_uri: postLogoutRedirectUri,
    });
    return endSessionUrl.href;
  } catch {
    return "/";
  }
}
