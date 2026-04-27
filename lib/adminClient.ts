import { auth } from './firebase';

export type AdminAccess = {
  email: string;
  isAdmin: boolean;
  isPermanent: boolean;
  active: boolean;
  grantedByEmail: string | null;
  grantedAt: number | null;
  expiresAt: number | null;
  hasGrantedAdmin: boolean;
  grantedChildEmail: string | null;
  grantedChildAt: number | null;
  tempAdminCount: number;
  tempAdminLimit: number;
  canGrantAdmin: boolean;
};

export type AdminGrantRecord = {
  email: string;
  active: boolean;
  isPermanent: boolean;
  grantedByEmail: string | null;
  grantedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
  revokedReason: string | null;
  hasGrantedAdmin: boolean;
  grantedChildEmail: string | null;
  grantedChildAt: number | null;
};

export type AdminAccountRecord = {
  uid: string;
  email: string;
  displayName: string;
  createdAt: string | null;
  lastSignInTime: string | null;
  disabled: boolean;
  customClaims: Record<string, unknown>;
  admin: AdminGrantRecord | null;
};

async function requestAdminJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const token = await user.getIdToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<T>;
}

export async function getCurrentAdminAccess() {
  return requestAdminJson<AdminAccess>('/api/admin/status');
}

export async function getAdminAccounts() {
  return requestAdminJson<{ accounts: AdminAccountRecord[]; orphanedGrants: AdminGrantRecord[]; currentUser: AdminAccess }>('/api/admin/accounts');
}

export async function updateAdminAccount(action: 'grant' | 'revoke' | 'ban' | 'unban', email: string) {
  return requestAdminJson<{ action: string; targetEmail: string; activeTempAdminCount: number; revokedEmails?: string[] }>('/api/admin/accounts', {
    method: 'POST',
    body: JSON.stringify({ action, email }),
  });
}
