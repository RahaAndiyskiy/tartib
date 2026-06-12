import { NextResponse } from 'next/server';
import { bearerToken, createSupabaseClientForToken, requireIdentity } from '@shared/lib/serverAuth';

export async function GET(request: Request): Promise<NextResponse> {
  const identity = await requireIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });
  }

  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });
  }

  const start = performance.now();
  const client = createSupabaseClientForToken(token);
  const result = await client.rpc('get_workspace');
  console.info('[performance] workspace', `get_workspace ${Math.round(performance.now() - start)}ms`);

  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  const data = row as { workspace?: unknown; active_user_id?: string } | null;
  if (result.error || !data?.workspace || !data?.active_user_id) {
    return NextResponse.json(
      { error: result.error?.message ?? 'Не удалось загрузить workspace.' },
      { status: 500 }
    );
  }

  return new NextResponse(JSON.stringify({ workspace: data.workspace, activeUserId: data.active_user_id }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store'
    }
  });
}
