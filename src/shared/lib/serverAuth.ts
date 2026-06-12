import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppUser, UserRole } from '@shared/types/domain';
import type { Database } from '@shared/types/database';
import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';

export type ServerIdentity = {
  authUserId: string;
  profile: AppUser;
  roles: UserRole[];
};

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

export function createSupabaseClientForToken(token: string): SupabaseClient<Database> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
}

export async function requireIdentity(request: Request): Promise<ServerIdentity | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const admin = getSupabaseAdmin();
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return null;

  const start = performance.now();
  const client = createSupabaseClientForToken(token);
  const result = await client.rpc('get_current_identity');
  console.info(
    '[performance] identity',
    `requireIdentity ${Math.round(performance.now() - start)}ms`
  );

  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  const data = row as
    | {
        auth_user_id: string;
        profile_id: string;
        organization_id: string;
        role: UserRole;
        username: string | null;
        first_name: string;
        last_name: string;
        phone: string | null;
        email: string | null;
        created_at: string;
        roles: UserRole[];
      }
    | null;
  if (result.error || !data?.auth_user_id) return null;

  return {
    authUserId: authData.user.id,
    profile: {
      id: data.profile_id,
      auth_user_id: data.auth_user_id,
      organization_id: data.organization_id,
      role: data.role,
      username: data.username ?? undefined,
      first_name: data.first_name,
      last_name: data.last_name,
      phone: data.phone,
      email: data.email,
      created_at: data.created_at,
      roles: data.roles
    },
    roles: data.roles
  };
}

export function hasServerRole(identity: ServerIdentity, role: UserRole): boolean {
  return identity.roles.includes(role);
}
