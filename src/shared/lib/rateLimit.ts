import { NextResponse } from 'next/server';

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function clientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  return request.headers.get('x-real-ip') ?? 'unknown';
}

export function rateLimit(
  request: Request,
  scope: string,
  options: { limit: number; windowMs: number }
): NextResponse | null {
  const now = Date.now();
  const key = `${scope}:${clientIp(request)}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  if (bucket.count >= options.limit) {
    return NextResponse.json(
      { error: 'Слишком много попыток. Попробуйте позже.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((bucket.resetAt - now) / 1000))
        }
      }
    );
  }

  bucket.count += 1;
  return null;
}

export function setupSecretAllowed(request: Request): boolean {
  if (process.env.NODE_ENV !== 'production') return true;

  const registrationEnabled = process.env.TARTIB_OWNER_REGISTRATION_ENABLED === 'true';
  if (registrationEnabled) return true;

  const setupSecret = process.env.TARTIB_OWNER_REGISTRATION_SECRET;
  if (!setupSecret) return false;

  return request.headers.get('x-tartib-setup-secret') === setupSecret;
}
