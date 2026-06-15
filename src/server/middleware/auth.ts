import { Request, Response, NextFunction } from 'express';
import { decodeToken } from '../services/auth';

/**
 * Decoded user info attached to authenticated requests.
 */
export interface AuthenticatedUser {
  email: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

/**
 * Extend Express Request to include authenticated user info.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Routes that skip JWT authentication (webhook and auth endpoints).
 */
function shouldSkipAuth(path: string): boolean {
  return path.startsWith('/api/webhooks/') || path.startsWith('/api/auth/') ||
         path.startsWith('/webhooks/') || path.startsWith('/auth/') ||
         path === '/health';
}

/**
 * JWT authentication middleware.
 *
 * - Extracts Bearer token from the Authorization header
 * - Decodes and validates the token
 * - Attaches decoded user info to `req.user`
 * - Skips auth for webhook routes (/api/webhooks/*)
 * - Returns 401 for missing/invalid/expired tokens
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for webhook routes
  if (shouldSkipAuth(req.path)) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing or invalid Authorization header',
    });
    return;
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  const decoded = decodeToken(token);

  if (!decoded) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid or malformed token',
    });
    return;
  }

  // Check token expiration
  if (Date.now() > decoded.exp) {
    res.status(401).json({
      error: 'TOKEN_EXPIRED',
      message: 'Token has expired',
    });
    return;
  }

  // Check that it's an access token (not a refresh token)
  if (decoded.type !== 'access') {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid token type',
    });
    return;
  }

  // Attach user info to request
  req.user = decoded;
  next();
}
