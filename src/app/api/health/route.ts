import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';

type EnvCheck = {
  configured: boolean;
  name: string;
  required: boolean;
};

function envCheck(name: string, required: boolean): EnvCheck {
  return {
    name,
    required,
    configured: Boolean(process.env[name])
  };
}

export async function GET(): Promise<NextResponse> {
  const checks = [
    envCheck('NEXT_PUBLIC_SUPABASE_URL', true),
    envCheck('NEXT_PUBLIC_SUPABASE_ANON_KEY', true),
    envCheck('SUPABASE_SERVICE_ROLE_KEY', true),
    envCheck('NEXT_PUBLIC_VAPID_PUBLIC_KEY', false),
    envCheck('VAPID_PRIVATE_KEY', false),
    envCheck('VAPID_SUBJECT', false)
  ];
  const missingRequired = checks.filter((check) => check.required && !check.configured);
  const pushConfigured = checks
    .filter((check) => check.name.includes('VAPID'))
    .every((check) => check.configured);
  let subscriptionsTableAvailable = false;

  if (missingRequired.length === 0) {
    try {
      const result = await getSupabaseAdmin()
        .from('push_subscriptions')
        .select('id')
        .limit(1);
      subscriptionsTableAvailable = !result.error;
    } catch {
      subscriptionsTableAvailable = false;
    }
  }

  return NextResponse.json(
    {
      ok: missingRequired.length === 0,
      service: 'tartib',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? 'unknown',
      checks,
      push: {
        configured: pushConfigured,
        subscriptionsTable: subscriptionsTableAvailable,
        ready: pushConfigured && subscriptionsTableAvailable
      }
    },
    {
      status: missingRequired.length === 0 ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  );
}
