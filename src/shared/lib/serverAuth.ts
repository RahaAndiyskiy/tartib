import type { AppUser, UserRole } from '@shared/types/domain';
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

export async function requireIdentity(request: Request): Promise<ServerIdentity | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const admin = getSupabaseAdmin();
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return null;

  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('*')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (profileError || !profile) return null;

  const { data: roleRows, error: roleError } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', profile.id);

  if (roleError) return null;

  return {
    authUserId: authData.user.id,
    profile: {
      ...profile,
      roles: roleRows.map((row) => row.role)
    },
    roles: roleRows.map((row) => row.role)
  };
}

export function hasServerRole(identity: ServerIdentity, role: UserRole): boolean {
  return identity.roles.includes(role);
}
