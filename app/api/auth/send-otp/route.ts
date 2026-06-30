import { NextRequest, NextResponse } from 'next/server';
import { generateOTP, storeOTP } from '@/lib/otp';
import { sendOTP } from '@/lib/sms';
import { sendEmail } from '@/lib/email';
import prisma from '@/lib/prisma';

function resolveOtpIdentifier(
  purpose: string | undefined,
  email: string | undefined,
  phoneNumber: string | undefined
): string {
  const normalizedEmail = email?.toLowerCase().trim();
  if (normalizedEmail) {
    if (purpose === 'password_reset') return `password_reset_${normalizedEmail}`;
    if (purpose === 'login') return `login_${normalizedEmail}`;
    return normalizedEmail;
  }
  return phoneNumber!.trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumber, email, method, purpose } = body;

    const normalizedEmail = email?.toLowerCase().trim();

    if (!phoneNumber && !normalizedEmail) {
      return NextResponse.json(
        { success: false, message: 'Phone number or email required' },
        { status: 400 }
      );
    }

    const user = normalizedEmail
      ? await prisma.user.findUnique({ where: { email: normalizedEmail } })
      : null;

    if (normalizedEmail && !user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      );
    }

    const otp = generateOTP();
    const identifier = resolveOtpIdentifier(purpose, normalizedEmail, phoneNumber);
    const deliveryMethod = method || (normalizedEmail ? 'email' : 'sms');
    
    const { getOTPStats } = await import('@/lib/otp');
    const stats = await getOTPStats(identifier, 60);
    if (stats.count >= 5) {
      return NextResponse.json(
        { success: false, message: 'Too many OTP requests. Please try again later.' },
        { status: 429 }
      );
    }
    
    await storeOTP(identifier, otp);

    if (deliveryMethod === 'sms' && phoneNumber) {
      await sendOTP(phoneNumber, otp);
    } else if (normalizedEmail) {
      const userName = user?.firstName
        ? `${user.firstName} ${user.lastName || ''}`.trim()
        : normalizedEmail;
      const subject =
        purpose === 'password_reset'
          ? 'MayaOps - Password Reset OTP'
          : 'MayaOps - Login Verification Code';

      await sendEmail({
        to: normalizedEmail,
        subject,
        html: `
          <h2>Your Verification Code</h2>
          <p>Hi ${userName},</p>
          <p>Your MayaOps verification code is:</p>
          <h1 style="color: #3B82F6; font-size: 32px; letter-spacing: 4px;">${otp}</h1>
          <p>This code will expire in 10 minutes.</p>
        `,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'OTP sent successfully',
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
