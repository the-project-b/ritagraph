import { Request, Response, NextFunction } from 'express';
import { createLogger } from '@the-project-b/logging';
import { AuthService } from './auth.service.js';
import { AuthError, VerifiedUser } from './types.js';

const logger = createLogger({ service: 'experiments' }).child({ module: 'AuthMiddleware' });

/**
 * Enhanced authentication middleware that verifies tokens against the backend
 * and populates request with user data including Auth0 and ACL roles
 */
export function authMiddleware(authService?: AuthService) {
  const service = authService || new AuthService();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Extract token from Authorization header
      const token = AuthService.extractBearerToken(req.headers.authorization);
      
      if (!token) {
        res.status(401).json({
          error: 'Unauthorized: Missing or invalid Authorization header. Expected: "Bearer <token>"',
        });
        return;
      }
      
      // Verify token and get user data
      const verifiedUser = await service.verifyToken(token);
      
      // Attach user data to request
      req.user = verifiedUser;
      
      next();
    } catch (error) {
      if (error instanceof AuthError) {
        res.status(error.status).json({
          error: error.message,
        });
        return;
      }
      
      // Handle unexpected errors
      logger.error('Unexpected error', error instanceof Error ? error : undefined);
      res.status(500).json({
        error: 'Internal server error during authentication',
      });
    }
  };
}

/**
 * Simple middleware that only checks for Bearer token format (no verification)
 * Use this for basic validation without backend calls
 */
export function basicAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = AuthService.extractBearerToken(req.headers.authorization);
  
  if (!token) {
    res.status(401).json({
      error: 'Unauthorized: Missing or invalid Authorization header. Expected: "Bearer <token>"',
    });
    return;
  }
  
  next();
} 