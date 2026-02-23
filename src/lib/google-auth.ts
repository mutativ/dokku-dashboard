import { OAuth2Client } from "google-auth-library";

export interface GoogleUserInfo {
  email: string;
  name: string;
  picture: string;
  hd: string; // hosted domain
}

/**
 * Build the Google OAuth authorization URL.
 *
 * @param clientId   - Google OAuth client ID
 * @param publicUrl  - Dashboard public URL (e.g. https://dash.example.com)
 * @param state      - CSRF state parameter
 * @param allowedDomain - Workspace domain to hint (hd parameter)
 */
export function getGoogleAuthUrl(
  clientId: string,
  publicUrl: string,
  state: string,
  allowedDomain: string,
): string {
  const client = new OAuth2Client(clientId);
  return client.generateAuthUrl({
    redirect_uri: `${publicUrl}/auth/callback`,
    scope: ["openid", "email", "profile"],
    access_type: "online",
    response_type: "code",
    prompt: "select_account",
    state,
    hd: allowedDomain,
  });
}

/**
 * Exchange an authorization code for user info.
 * Validates the ID token signature, issuer, audience, expiry,
 * and enforces the `hd` (hosted domain) claim.
 */
export async function verifyGoogleCallback(
  code: string,
  clientId: string,
  clientSecret: string,
  publicUrl: string,
  allowedDomain: string,
): Promise<GoogleUserInfo> {
  const client = new OAuth2Client(clientId, clientSecret, `${publicUrl}/auth/callback`);

  // Exchange code for tokens
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) {
    throw new Error("No ID token received from Google");
  }

  // Verify ID token (checks signature, issuer, audience, expiry)
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: clientId,
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error("Invalid ID token payload");
  }

  // Enforce hosted domain
  if (payload.hd !== allowedDomain) {
    throw new Error(
      `Access denied: must use an @${allowedDomain} account (got ${payload.hd || "personal account"})`,
    );
  }

  return {
    email: payload.email ?? "",
    name: payload.name ?? "",
    picture: payload.picture ?? "",
    hd: payload.hd,
  };
}
