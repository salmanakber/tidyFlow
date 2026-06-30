import { NextRequest, NextResponse } from 'next/server';
import { verifyOTP } from '@/lib/otp';
import { generateToken } from '@/lib/auth';
import prisma from '@/lib/prisma';
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumber, email, otp, purpose } = body;

    const identifier = phoneNumber?.trim() || email?.toLowerCase().trim();
    
    if (!identifier || !otp) {
      return NextResponse.json(
        { success: false, message: 'Identifier and OTP required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email?.toLowerCase().trim();
    const otpIdentifier = normalizedEmail
      ? (purpose === 'password_reset'
          ? `password_reset_${normalizedEmail}`
          : purpose === 'login'
            ? `login_${normalizedEmail}`
            : normalizedEmail)
      : identifier;

    const isValid = await verifyOTP(otpIdentifier, otp);
    
    if (!isValid) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired OTP' },
        { status: 401 }
      );
    }

    const user = normalizedEmail
      ? await prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: { company: true },
        })
      : null;

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      );
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    });

    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          companyId: user.companyId,
        },
      },
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
