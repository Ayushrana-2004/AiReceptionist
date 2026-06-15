import { Router, Request, Response } from 'express';
import { login, refreshToken, IUserRepository } from '../services/auth';

/**
 * Auth API routes — POST /api/auth/login, POST /api/auth/refresh.
 *
 * These endpoints are excluded from JWT auth middleware since they
 * are the entry points for obtaining tokens.
 */
export function createAuthRouter(repository: IUserRepository): Router {
  const router = Router();

  /**
   * POST /api/auth/login
   * Body: { email: string, password: string }
   * Returns: { token, refreshToken } on success, error on failure.
   */
  router.post('/login', async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || typeof email !== 'string') {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Email is required and must be a string',
      });
      return;
    }

    if (!password || typeof password !== 'string') {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Password is required and must be a string',
      });
      return;
    }

    const result = await login(email.trim(), password, repository);

    if (result.success) {
      res.status(200).json({
        token: result.data.token,
        refreshToken: result.data.refreshToken,
      });
    } else {
      const statusCode = result.error.code === 'ACCOUNT_LOCKED' ? 423 : 401;
      res.status(statusCode).json({
        error: result.error.code,
        message: result.error.message,
        ...(result.error.code === 'ACCOUNT_LOCKED' && {
          lockedUntil: result.error.lockedUntil.toISOString(),
        }),
      });
    }
  });

  /**
   * POST /api/auth/refresh
   * Body: { refreshToken: string }
   * Returns: { token } on success, error on failure.
   */
  router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
    const { refreshToken: tokenValue } = req.body;

    // Validate required field
    if (!tokenValue || typeof tokenValue !== 'string') {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'refreshToken is required and must be a string',
      });
      return;
    }

    const result = await refreshToken(tokenValue, repository);

    if (result.success) {
      res.status(200).json({
        token: result.data.token,
      });
    } else {
      const statusCode = result.error.code === 'SESSION_EXPIRED' ? 401 : 401;
      res.status(statusCode).json({
        error: result.error.code,
        message: result.error.message,
      });
    }
  });

  return router;
}
