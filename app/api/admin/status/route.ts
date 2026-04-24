import { NextResponse } from 'next/server';
import { AdminApiError, getCurrentAdminAccess } from '../_shared';

export async function GET(request: Request) {
  try {
    const access = await getCurrentAdminAccess(request);
    return NextResponse.json(access);
  } catch (error) {
    const status = error instanceof AdminApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status });
  }
}
