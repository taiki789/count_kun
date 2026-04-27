import { NextResponse } from 'next/server';
import { AdminApiError, createOrUpdateAdminGrant, getCurrentAdminAccess, listAdminGrants, listFirebaseUsers, revokeAdminGrant, updateUserBanStatus } from '../_shared';

export async function GET(request: Request) {
  try {
    const access = await getCurrentAdminAccess(request);
    if (!access.isAdmin) {
      throw new AdminApiError('Forbidden', 403);
    }

    const [users, grants] = await Promise.all([
      listFirebaseUsers(),
      listAdminGrants(),
    ]);

    const grantMap = new Map(grants.map((grant) => [grant.email, grant] as const));

    const accounts = users.map((user) => {
      const email = String(user.email ?? '').trim().toLowerCase();
      const grant = grantMap.get(email) ?? null;
      return {
        uid: user.uid,
        email: user.email ?? '',
        displayName: user.displayName ?? '',
        createdAt: user.metadata.creationTime ?? null,
        lastSignInTime: user.metadata.lastSignInTime ?? null,
        disabled: user.disabled === true,
        customClaims: user.customClaims ?? {},
        admin: grant,
      };
    });

    const orphanedGrants = grants.filter((grant) => !accounts.some((account) => account.email.trim().toLowerCase() === grant.email));

    return NextResponse.json({
      accounts,
      orphanedGrants,
      currentUser: access,
    });
  } catch (error) {
    const status = error instanceof AdminApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getCurrentAdminAccess(request);
    if (!access.isAdmin) {
      throw new AdminApiError('Forbidden', 403);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? '').trim();
    const targetEmail = String(body.email ?? '').trim();

    if (action === 'grant') {
      const result = await createOrUpdateAdminGrant({
        requesterEmail: access.email,
        targetEmail,
      });
      return NextResponse.json(result);
    }

    if (action === 'revoke') {
      const result = await revokeAdminGrant({
        requesterEmail: access.email,
        targetEmail,
      });
      return NextResponse.json(result);
    }

    if (action === 'ban') {
      const result = await updateUserBanStatus({
        requesterEmail: access.email,
        targetEmail,
        banned: true,
      });
      return NextResponse.json(result);
    }

    if (action === 'unban') {
      const result = await updateUserBanStatus({
        requesterEmail: access.email,
        targetEmail,
        banned: false,
      });
      return NextResponse.json(result);
    }

    throw new AdminApiError('Invalid action', 400);
  } catch (error) {
    const status = error instanceof AdminApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status });
  }
}
