import { NextRequest, NextResponse } from 'next/server';
import { uploadVoiceNoteToCloudinary } from '@/lib/cloudinary';
import {
  assertTaskChatAccess,
  buildVoiceMessage,
  sendTaskThreadMessage,
} from '@/lib/task-chat';
import { requireAuth } from '@/lib/rbac';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { tokenUser } = auth;

  try {
    const formData = await request.formData();
    const taskId = Number(formData.get('taskId'));
    const file = formData.get('file') as File | null;
    const durationSec = Number(formData.get('durationSec') || 0);

    if (!taskId || !file) {
      return NextResponse.json(
        { success: false, message: 'taskId and file are required' },
        { status: 400 }
      );
    }

    const access = await assertTaskChatAccess(request, tokenUser, taskId);
    if (!access.ok) {
      return NextResponse.json({ success: false, message: access.message }, { status: access.status });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.length) {
      return NextResponse.json({ success: false, message: 'Empty audio file' }, { status: 400 });
    }

    const upload = await uploadVoiceNoteToCloudinary(buffer, taskId, tokenUser.userId, new Date());
    if (!upload.success || !upload.secureUrl) {
      return NextResponse.json(
        { success: false, message: upload.error || 'Voice upload failed' },
        { status: 500 }
      );
    }

    const sender = await prisma.user.findUnique({
      where: { id: tokenUser.userId },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
    });
    if (!sender) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const voiceText = buildVoiceMessage({
      url: upload.secureUrl,
      durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : undefined,
      publicId: upload.publicId,
    });

    const result = await sendTaskThreadMessage({
      taskId,
      senderId: tokenUser.userId,
      companyId: access.companyId,
      messageText: voiceText,
      senderRole: sender.role,
      senderName: [sender.firstName, sender.lastName].filter(Boolean).join(' ').trim() || sender.email,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          mode: 'task',
          taskId,
          messages: result.messages,
          sent: result.sent,
          voiceUrl: upload.secureUrl,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Chat voice POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
