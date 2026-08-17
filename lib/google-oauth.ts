import crypto from 'crypto';
import { google } from 'googleapis';
import { getAppOrigin } from '@/lib/domains';

export type GoogleOAuthPortal = 'customer' | 'admin';

export interface GoogleOAuthState {
  portal: GoogleOAuthPortal;
  next?: string;
  plan?: string;
  useTrial?: boolean;
  companyName?: string;
}

function getClientId() {
  return (process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim();
}

function getClientSecret() {
  return (process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim();
}

export function isGoogleOAuthConfigured(): boolean {
  return !!(getClientId() && getClientSecret());
}

export function googleOauthRedirectUri(): string {
  return `${getAppOrigin()}/api/auth/google/callback`;
}

function oauthClient() {
  return new google.auth.OAuth2(getClientId(), getClientSecret(), googleOauthRedirectUri());
}

function stateSecret() {
  return process.env.JWT_SECRET || 'your-secret-key-change-in-production';
}

export function signGoogleOauthState(payload: GoogleOAuthState): string {
  const body = Buffer.from(JSON.stringify({ ...payload, t: Date.now() }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyGoogleOauthState(state: string): GoogleOAuthState | null {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as GoogleOAuthState & {
      t?: number;
    };
    if (parsed.t && Date.now() - parsed.t > 15 * 60 * 1000) return null;
    if (parsed.portal !== 'customer' && parsed.portal !== 'admin') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function googleAuthUrl(state: GoogleOAuthState): string {
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    scope: ['openid', 'email', 'profile'],
    state: signGoogleOauthState(state),
  });
}

export async function exchangeGoogleCode(code: string): Promise<{
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  picture?: string;
}> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();
  const email = String(data.email || '').toLowerCase().trim();
  if (!email || !data.id) {
    throw new Error('Google did not return an email address for this account.');
  }

  const given = String(data.given_name || '').trim();
  const family = String(data.family_name || '').trim();
  const nameParts = String(data.name || '').trim().split(/\s+/);
  return {
    googleId: String(data.id),
    email,
    firstName: given || nameParts[0] || '',
    lastName: family || nameParts.slice(1).join(' ') || '',
    picture: data.picture || undefined,
  };
}
