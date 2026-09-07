import * as client from "openid-client";
import type { AuthUser } from "../types/auth.js";

let oidcConfigPromise: Promise<client.Configuration> | null = null;

export function isSsoEnabled(): boolean {
  return process.env.SSO_ENABLED === "true";
}

export function getOidcRedirectUri(): string {
  return process.env.OIDC_REDIRECT_URI || "http://localhost:3001/auth/callback";
}

export async function getOidcConfig(): Promise<client.Configuration> {
  if (oidcConfigPromise) return oidcConfigPromise;

  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;

  if (!issuer || !clientId) {
    throw new Error("OIDC configuration missing: OIDC_ISSUER and OIDC_CLIENT_ID are required when SSO_ENABLED=true");
  }

  oidcConfigPromise = client.discovery(
    new URL(issuer),
    clientId,
    clientSecret || undefined
  );

  return oidcConfigPromise;
}

export interface GeneratedAuthRequest {
  url: string;
  state: string;
  codeVerifier: string;
}

export async function generateAuthUrl(customRedirectUri?: string): Promise<GeneratedAuthRequest> {
  const config = await getOidcConfig();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const redirectUri = customRedirectUri || getOidcRedirectUri();

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

  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState,
  });

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

export async function getLogoutUrl(): Promise<string> {
  if (!isSsoEnabled()) return "/";
  try {
    const config = await getOidcConfig();
    const endSessionUrl = client.buildEndSessionUrl(config, {
      post_logout_redirect_uri: process.env.APP_BASE_URL || "http://localhost:3001",
    });
    return endSessionUrl.href;
  } catch {
    return "/";
  }
}
