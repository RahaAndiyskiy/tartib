import { NextResponse } from 'next/server';

export function GET(): NextResponse {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  return NextResponse.json({
    publicKey: publicKey ?? null,
    enabled: Boolean(publicKey)
  });
}
