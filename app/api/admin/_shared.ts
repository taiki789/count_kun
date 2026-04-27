import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, cert, getApps } from 'firebase-admin/app';

export const SUPER_ADMIN_EMAIL = 't.taiki1122@gmail.com';
export const TEMP_ADMIN_LIMIT = 2;
export const TEMP_ADMIN_DURATION_MONTHS = 18;
export const ADMIN_GRANTS_COLLECTION = 'adminGrants';

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

export type AdminGrantSummary = AdminGrantRecord & {
  activeTempAdminCount: number;
  remainingGrantQuota: number;
};

export class AdminApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

export function normalizeEmail(email: string | null | undefined) {
  return String(email ?? '').trim().toLowerCase();
}

export function isPermanentAdminEmail(email: string | null | undefined) {
  return normalizeEmail(email) === SUPER_ADMIN_EMAIL;
}

export function getAdminDB() {
  if (!getApps().length) {
    try {
      const key = process.env.FIREBASE_ADMIN_SDK_KEY;
      if (!key) {
        throw new Error('FIREBASE_ADMIN_SDK_KEY env variable is not set');
      }
      let parsedKey;
      try {
        parsedKey = JSON.parse(key);
      } catch {
        throw new Error('FIREBASE_ADMIN_SDK_KEY is not valid JSON');
      }
      initializeApp({
        credential: cert(parsedKey),
      });
    } catch (error) {
      console.error('Firebase Admin Init Error:', error);
      throw error;
    }
  }

  return getFirestore();
}

export function addMonths(source: Date, months: number) {
  const date = new Date(source.getTime());
  date.setMonth(date.getMonth() + months);
  return date;
}

export function toMillis(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function buildPermanentGrant(): AdminGrantRecord {
  return {
    email: SUPER_ADMIN_EMAIL,
    active: true,
    isPermanent: true,
    grantedByEmail: null,
    grantedAt: null,
    expiresAt: null,
    revokedAt: null,
    revokedReason: null,
    hasGrantedAdmin: false,
    grantedChildEmail: null,
    grantedChildAt: null,
  };
}

export function serializeGrantSnapshot(email: string, data?: Partial<AdminGrantRecord> | null): AdminGrantRecord {
  return {
    email,
    active: data?.active !== false,
    isPermanent: data?.isPermanent === true || isPermanentAdminEmail(email),
    grantedByEmail: typeof data?.grantedByEmail === 'string' ? normalizeEmail(data.grantedByEmail) : null,
    grantedAt: toMillis(data?.grantedAt),
    expiresAt: toMillis(data?.expiresAt),
    revokedAt: toMillis(data?.revokedAt),
    revokedReason: typeof data?.revokedReason === 'string' ? data.revokedReason : null,
    hasGrantedAdmin: data?.hasGrantedAdmin === true,
    grantedChildEmail: typeof data?.grantedChildEmail === 'string' ? normalizeEmail(data.grantedChildEmail) : null,
    grantedChildAt: toMillis(data?.grantedChildAt),
  };
}

export function isGrantActive(record: AdminGrantRecord, now = Date.now()) {
  if (!record.active) return false;
  if (record.isPermanent) return true;
  if (record.expiresAt === null) return false;
  return record.expiresAt > now;
}

export function grantExpirationMillis(now = Date.now()) {
  return addMonths(new Date(now), TEMP_ADMIN_DURATION_MONTHS).getTime();
}

export async function ensurePermanentAdminGrant(db = getAdminDB()) {
  const ref = db.collection(ADMIN_GRANTS_COLLECTION).doc(SUPER_ADMIN_EMAIL);
  const snapshot = await ref.get();
  const nextData = {
    ...buildPermanentGrant(),
    active: true,
    isPermanent: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (!snapshot.exists) {
    await ref.set({
      ...nextData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  await ref.set(nextData, { merge: true });
}

async function clearAdminClaims(email: string) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: false });
  } catch (error) {
    console.error('Failed to clear admin claims:', email, error);
  }
}

async function setAdminClaims(email: string, payload: Record<string, unknown>) {
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, payload);
}

export async function pruneAdminGrants(db = getAdminDB()) {
  await ensurePermanentAdminGrant(db);

  const snapshot = await db.collection(ADMIN_GRANTS_COLLECTION).get();
  const now = Date.now();
  const expiredDocs: Array<{ email: string; ref: FirebaseFirestore.DocumentReference; data: AdminGrantRecord }> = [];
  const activeTempDocs: Array<{ email: string; ref: FirebaseFirestore.DocumentReference; data: AdminGrantRecord }> = [];

  snapshot.docs.forEach((doc) => {
    const email = normalizeEmail(doc.id || doc.data().email);
    if (!email) return;
    const data = serializeGrantSnapshot(email, doc.data() as Partial<AdminGrantRecord> | undefined);

    if (data.isPermanent) {
      return;
    }

    if (isGrantActive(data, now)) {
      activeTempDocs.push({ email, ref: doc.ref, data });
      return;
    }

    if (data.active || data.revokedReason !== 'expired') {
      expiredDocs.push({ email, ref: doc.ref, data });
    }
  });

  if (expiredDocs.length > 0) {
    const batch = db.batch();
    expiredDocs.forEach(({ ref }) => {
      batch.set(
        ref,
        {
          active: false,
          revokedAt: now,
          revokedReason: 'expired',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
    await batch.commit();
    await Promise.all(expiredDocs.map(({ email }) => clearAdminClaims(email)));
  }

  const remainingActiveTemp = activeTempDocs
    .filter(({ data }) => isGrantActive(data, now))
    .sort((left, right) => (left.data.grantedAt ?? 0) - (right.data.grantedAt ?? 0));

  if (remainingActiveTemp.length > TEMP_ADMIN_LIMIT) {
    const overflow = remainingActiveTemp.slice(0, remainingActiveTemp.length - TEMP_ADMIN_LIMIT);
    const batch = db.batch();
    overflow.forEach(({ ref }) => {
      batch.set(
        ref,
        {
          active: false,
          revokedAt: now,
          revokedReason: 'limit_exceeded',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
    await batch.commit();
    await Promise.all(overflow.map(({ email }) => clearAdminClaims(email)));
  }
}

export async function getGrantRecord(db: FirebaseFirestore.Firestore, email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const doc = await db.collection(ADMIN_GRANTS_COLLECTION).doc(normalizedEmail).get();
  if (!doc.exists) {
    if (normalizedEmail === SUPER_ADMIN_EMAIL) {
      return buildPermanentGrant();
    }
    return null;
  }

  return serializeGrantSnapshot(normalizedEmail, doc.data() as Partial<AdminGrantRecord> | undefined);
}

export async function countActiveTemporaryAdmins(db = getAdminDB()) {
  const snapshot = await db.collection(ADMIN_GRANTS_COLLECTION).get();
  const now = Date.now();

  return snapshot.docs.filter((doc) => {
    const data = serializeGrantSnapshot(doc.id, doc.data() as Partial<AdminGrantRecord> | undefined);
    return !data.isPermanent && isGrantActive(data, now);
  }).length;
}

export async function listAdminGrants(db = getAdminDB()) {
  await pruneAdminGrants(db);
  const snapshot = await db.collection(ADMIN_GRANTS_COLLECTION).get();
  const now = Date.now();

  return snapshot.docs
    .map((doc) => serializeGrantSnapshot(doc.id, doc.data() as Partial<AdminGrantRecord> | undefined))
    .map((record) => ({
      ...record,
      active: isGrantActive(record, now),
    }))
    .sort((left, right) => {
      if (left.isPermanent !== right.isPermanent) {
        return left.isPermanent ? -1 : 1;
      }
      return (right.grantedAt ?? 0) - (left.grantedAt ?? 0);
    });
}

export async function getCurrentAdminAccess(request: Request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';

  if (!token) {
    throw new AdminApiError('Unauthorized', 401);
  }

  const decoded = await admin.auth().verifyIdToken(token);
  const email = normalizeEmail(decoded.email);

  if (!email) {
    throw new AdminApiError('Email is required', 401);
  }

  const db = getAdminDB();
  await pruneAdminGrants(db);

  const grant = await getGrantRecord(db, email);
  const now = Date.now();

  if (!grant) {
    return {
      email,
      isAdmin: false,
      isPermanent: false,
      active: false,
      grantedByEmail: null,
      grantedAt: null,
      expiresAt: null,
      hasGrantedAdmin: false,
      grantedChildEmail: null,
      grantedChildAt: null,
      tempAdminCount: await countActiveTemporaryAdmins(db),
      tempAdminLimit: TEMP_ADMIN_LIMIT,
      canGrantAdmin: false,
    } satisfies AdminAccess;
  }

  const active = isGrantActive(grant, now);

  return {
    email,
    isAdmin: active || grant.isPermanent,
    isPermanent: grant.isPermanent,
    active,
    grantedByEmail: grant.grantedByEmail,
    grantedAt: grant.grantedAt,
    expiresAt: grant.expiresAt,
    hasGrantedAdmin: grant.hasGrantedAdmin,
    grantedChildEmail: grant.grantedChildEmail,
    grantedChildAt: grant.grantedChildAt,
    tempAdminCount: await countActiveTemporaryAdmins(db),
    tempAdminLimit: TEMP_ADMIN_LIMIT,
    canGrantAdmin: (active || grant.isPermanent) && !grant.hasGrantedAdmin,
  } satisfies AdminAccess;
}

export async function createOrUpdateAdminGrant(options: {
  requesterEmail: string;
  targetEmail: string;
}) {
  const db = getAdminDB();
  const requesterEmail = normalizeEmail(options.requesterEmail);
  const targetEmail = normalizeEmail(options.targetEmail);

  if (!requesterEmail || !targetEmail) {
    throw new AdminApiError('Email is required', 400);
  }

  await pruneAdminGrants(db);
  await ensurePermanentAdminGrant(db);

  const requesterGrant = await getGrantRecord(db, requesterEmail);
  if (!requesterGrant || (!isGrantActive(requesterGrant) && !requesterGrant.isPermanent)) {
    throw new AdminApiError('You are not allowed to grant admin rights', 403);
  }

  if (!requesterGrant.isPermanent && requesterGrant.hasGrantedAdmin) {
    throw new AdminApiError('This admin has already granted one account', 409);
  }

  if (targetEmail === SUPER_ADMIN_EMAIL) {
    throw new AdminApiError('Permanent admin already exists', 409);
  }

  const targetUser = await admin.auth().getUserByEmail(targetEmail);
  const targetGrant = await getGrantRecord(db, targetEmail);

  if (targetGrant && isGrantActive(targetGrant) && targetGrant.isPermanent) {
    return {
      targetEmail,
      action: 'already-admin',
      activeTempAdminCount: await countActiveTemporaryAdmins(db),
    };
  }

  if (targetGrant && isGrantActive(targetGrant) && !targetGrant.isPermanent) {
    return {
      targetEmail,
      action: 'already-admin',
      activeTempAdminCount: await countActiveTemporaryAdmins(db),
    };
  }

  const allGrants = await listAdminGrants(db);
  const activeTemporaryAdmins = allGrants.filter((grant) => !grant.isPermanent && grant.active);
  const overflowCount = Math.max(0, activeTemporaryAdmins.length - (TEMP_ADMIN_LIMIT - 1));
  const revocations = overflowCount > 0 ? activeTemporaryAdmins.slice(0, overflowCount) : [];

  const batch = db.batch();
  const now = Date.now();

  for (const grant of revocations) {
    batch.set(
      db.collection(ADMIN_GRANTS_COLLECTION).doc(grant.email),
      {
        active: false,
        revokedAt: now,
        revokedReason: 'limit_exceeded',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  batch.set(
    db.collection(ADMIN_GRANTS_COLLECTION).doc(targetEmail),
    {
      email: targetEmail,
      active: true,
      isPermanent: false,
      grantedByEmail: requesterEmail,
      grantedAt: now,
      expiresAt: grantExpirationMillis(now),
      revokedAt: null,
      revokedReason: null,
      hasGrantedAdmin: false,
      grantedChildEmail: null,
      grantedChildAt: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    db.collection(ADMIN_GRANTS_COLLECTION).doc(requesterEmail),
    {
      hasGrantedAdmin: true,
      grantedChildEmail: targetEmail,
      grantedChildAt: now,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();

  await setAdminClaims(targetUser.email ?? targetEmail, {
    admin: true,
    adminPermanent: false,
    adminEmail: targetEmail,
    adminGrantedBy: requesterEmail,
    adminGrantedAt: now,
    adminExpiresAt: grantExpirationMillis(now),
  });

  await Promise.all(revocations.map((grant) => clearAdminClaims(grant.email)));

  return {
    targetEmail,
    action: 'granted',
    activeTempAdminCount: await countActiveTemporaryAdmins(db),
    revokedEmails: revocations.map((grant) => grant.email),
  };
}

export async function revokeAdminGrant(options: {
  requesterEmail: string;
  targetEmail: string;
}) {
  const db = getAdminDB();
  const requesterEmail = normalizeEmail(options.requesterEmail);
  const targetEmail = normalizeEmail(options.targetEmail);

  if (!requesterEmail || !targetEmail) {
    throw new AdminApiError('Email is required', 400);
  }

  await pruneAdminGrants(db);

  const requesterGrant = await getGrantRecord(db, requesterEmail);
  if (!requesterGrant || (!isGrantActive(requesterGrant) && !requesterGrant.isPermanent)) {
    throw new AdminApiError('You are not allowed to revoke admin rights', 403);
  }

  if (targetEmail === SUPER_ADMIN_EMAIL) {
    throw new AdminApiError('Permanent admin cannot be revoked', 403);
  }

  const targetGrant = await getGrantRecord(db, targetEmail);
  if (!targetGrant || (!targetGrant.isPermanent && !isGrantActive(targetGrant))) {
    return {
      targetEmail,
      action: 'already-inactive',
      activeTempAdminCount: await countActiveTemporaryAdmins(db),
    };
  }

  const targetUser = await admin.auth().getUserByEmail(targetEmail);
  const now = Date.now();

  await db.collection(ADMIN_GRANTS_COLLECTION).doc(targetEmail).set(
    {
      active: false,
      revokedAt: now,
      revokedReason: 'manual_revoke',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await setAdminClaims(targetUser.email ?? targetEmail, {
    admin: false,
    adminEmail: targetEmail,
  });

  return {
    targetEmail,
    action: 'revoked',
    activeTempAdminCount: await countActiveTemporaryAdmins(db),
  };
}

export async function updateUserBanStatus(options: {
  requesterEmail: string;
  targetEmail: string;
  banned: boolean;
}) {
  const db = getAdminDB();
  const requesterEmail = normalizeEmail(options.requesterEmail);
  const targetEmail = normalizeEmail(options.targetEmail);

  if (!requesterEmail || !targetEmail) {
    throw new AdminApiError('Email is required', 400);
  }

  await pruneAdminGrants(db);

  const requesterGrant = await getGrantRecord(db, requesterEmail);
  if (!requesterGrant || (!isGrantActive(requesterGrant) && !requesterGrant.isPermanent)) {
    throw new AdminApiError('You are not allowed to update ban status', 403);
  }

  if (targetEmail === SUPER_ADMIN_EMAIL) {
    throw new AdminApiError('Permanent admin cannot be banned', 403);
  }

  if (targetEmail === requesterEmail && options.banned) {
    throw new AdminApiError('You cannot ban yourself', 409);
  }

  const targetUser = await admin.auth().getUserByEmail(targetEmail);
  if (targetUser.disabled === options.banned) {
    return {
      targetEmail,
      action: options.banned ? 'already-banned' : 'already-unbanned',
      activeTempAdminCount: await countActiveTemporaryAdmins(db),
    };
  }

  await admin.auth().updateUser(targetUser.uid, { disabled: options.banned });

  if (options.banned) {
    const now = Date.now();
    const targetGrant = await getGrantRecord(db, targetEmail);
    if (targetGrant && !targetGrant.isPermanent) {
      await db.collection(ADMIN_GRANTS_COLLECTION).doc(targetEmail).set(
        {
          active: false,
          revokedAt: now,
          revokedReason: 'banned',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await setAdminClaims(targetEmail, {
        admin: false,
        adminEmail: targetEmail,
      });
    }
  }

  return {
    targetEmail,
    action: options.banned ? 'banned' : 'unbanned',
    activeTempAdminCount: await countActiveTemporaryAdmins(db),
  };
}

export async function listFirebaseUsers() {
  const users: admin.auth.UserRecord[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const result = await admin.auth().listUsers(1000, pageToken);
    users.push(...result.users);
    pageToken = result.pageToken || undefined;
  } while (pageToken);

  return users;
}
