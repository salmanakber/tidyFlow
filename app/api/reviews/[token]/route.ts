import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { assignClientReviewToCleaners } from '@/lib/reviews';

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const review = await prisma.reviewRequest.findUnique({
    where: { token: params.token },
    include: {
      task: {
        select: {
          title: true,
          property: { select: { address: true } },
          company: { select: { name: true } },
        },
      },
    },
  });

  if (!review) {
    return NextResponse.json({ success: false, message: 'Review not found' }, { status: 404 });
  }

  if (review.expiresAt && review.expiresAt < new Date()) {
    return NextResponse.json({ success: false, message: 'Review link expired' }, { status: 410 });
  }

  return NextResponse.json({
    success: true,
    data: {
      submitted: !!review.submittedAt,
      companyName: review.task.company.name,
      propertyAddress: review.task.property.address,
      taskTitle: review.task.title,
      rating: review.rating,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const review = await prisma.reviewRequest.findUnique({
    where: { token: params.token },
    include: {
      task: {
        select: { id: true, companyId: true, title: true },
      },
    },
  });

  if (!review) {
    return NextResponse.json({ success: false, message: 'Review not found' }, { status: 404 });
  }

  if (review.submittedAt) {
    return NextResponse.json({ success: false, message: 'Already submitted' }, { status: 400 });
  }

  const body = await request.json();
  const { rating, comment, clientName, clientEmail } = body;

  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json({ success: false, message: 'Valid rating 1-5 required' }, { status: 400 });
  }

  const isPublic = rating >= 4;

  await prisma.reviewRequest.update({
    where: { token: params.token },
    data: {
      rating: Number(rating),
      comment,
      isPublic,
      submittedAt: new Date(),
    },
  });

  await assignClientReviewToCleaners({
    taskId: review.taskId,
    companyId: review.task.companyId,
    rating: Number(rating),
    comment,
    clientName,
    clientEmail,
    isPublic,
  });

  return NextResponse.json({
    success: true,
    data: {
      isPublic,
      redirectUrl: isPublic && review.redirectUrl ? review.redirectUrl : null,
      message: isPublic
        ? 'Thank you! We appreciate your positive feedback.'
        : 'Thank you. Your feedback has been received privately and our team will follow up.',
    },
  });
}
