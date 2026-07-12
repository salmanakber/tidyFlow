import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { getChatInboxForUser } from '@/lib/task-chat';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await getChatInboxForUser(auth.tokenUser);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Chat inbox GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
