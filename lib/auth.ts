import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const JWT_EXPIRES_IN = '7d';

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'your-secret-key-change-in-production';
}

export interface JWTPayload {
  userId: number;
  email: string;
  role: string;
  companyId?: number;
}

export interface User {
  id: number;
  email: string;
  password_hash: string;
  first_name?: string;
  last_name?: string;
  role: string;
  company_id?: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare a password with a hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a JWT token
 */
export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string, options?: { quiet?: boolean }): JWTPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JWTPayload;
  } catch (error) {
    if (!options?.quiet) {
      console.error('Token verification failed:', error);
    }
    return null;
  }
}

export function getJwtVerifyError(token: string): string | null {
  try {
    jwt.verify(token, getJwtSecret());
    return null;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) return 'expired';
    if (error instanceof jwt.JsonWebTokenError) return error.message;
    return 'unknown';
  }
}

/**
 * Extract token from Authorization header or cookie
 */
export function extractToken(request: NextRequest): string | null {
  // First check Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
  return authHeader.substring(7);
  }

  // Query token — used when opening PDFs in the mobile system browser
  const queryToken = request.nextUrl.searchParams.get('token');
  if (queryToken) {
    return queryToken;
  }
  
  // Then check cookie
  const tokenCookie = request.cookies.get('authToken');
  if (tokenCookie) {
    return tokenCookie.value;
  }
  
  return null;
}

/**
 * Get user from request token
 */
export function getUserFromRequest(request: NextRequest): JWTPayload | null {
  const token = extractToken(request);
  if (!token) {
    return null;
  }
  return verifyToken(token);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function isValidPassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
}
