import { NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'app_session';

function isRequestSecure(request: Request) {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0].trim() === 'https';
  }
  return request.headers.get('referer')?.startsWith('https://') ?? false;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { password?: string } | null;
    const submittedPassword = body?.password ?? '';
    const expectedPassword = process.env.APP_PASSWORD ?? '';

    if (!expectedPassword) {
      return NextResponse.json(
        { error: 'Server auth password is not configured.' },
        { status: 500 },
      );
    }

    if (!submittedPassword || submittedPassword !== expectedPassword) {
      return NextResponse.json(
        { error: 'Invalid password.' },
        { status: 401 },
      );
    }

    const response = NextResponse.json({ success: true });

    response.cookies.set(SESSION_COOKIE_NAME, 'active', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' ? isRequestSecure(request) : false,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: 'Unexpected error during login.' },
      { status: 500 },
    );
  }
}
