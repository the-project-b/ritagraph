import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { AuthError, VerifiedUser } from './types.js';

/**
 * Enhanced authentication middleware that verifies tokens against the backend
 * and populates request with user data including Auth0 and ACL roles
 */
export function authMiddleware(authService?: AuthService) {
  const service = authService || new AuthService();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`🔐 [${requestId}] Auth middleware started for ${req.method} ${req.path}`);
    
    try {
      // Extract token from Authorization header
      console.log(`🔐 [${requestId}] Extracting token from Authorization header`);
      const token = AuthService.extractBearerToken(req.headers.authorization);
      
      if (!token) {
        console.log(`❌ [${requestId}] No valid Bearer token found`);
        res.status(401).json({
          error: 'Unauthorized: Missing or invalid Authorization header. Expected: "Bearer <token>"',
        });
        return;
      }

      console.log(`✅ [${requestId}] Token extracted, length: ${token.length}`);
      console.log(`🔐 [${requestId}] Verifying token against backend...`);
      
      // Verify token and get user data
      const verifiedUser = await service.verifyToken(token);
      
      console.log(`✅ [${requestId}] Token verified successfully`);
      console.log(`👤 [${requestId}] User authenticated:`, {
        auth0Id: verifiedUser.auth0.id,
        auth0Roles: verifiedUser.auth0.roles,
        aclRole: verifiedUser.aclRole,
        companiesCount: verifiedUser.companies.length,
        companies: verifiedUser.companies.map(c => ({
          id: c.companyId,
          name: c.companyName,
          role: c.role,
          managing: c.managingCompany
        }))
      });
      
      // Attach user data to request
      req.user = verifiedUser;
      
      console.log(`🔐 [${requestId}] Auth middleware completed successfully`);
      next();
    } catch (error) {
      if (error instanceof AuthError) {
        console.log(`❌ [${requestId}] Authentication failed:`, error.message);
        res.status(error.status).json({
          error: error.message,
        });
        return;
      }
      
      // Handle unexpected errors
      console.error(`💥 [${requestId}] Unexpected auth middleware error:`, error);
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
  const requestId = Math.random().toString(36).substring(7);
  console.log(`🔓 [${requestId}] Basic auth middleware started for ${req.method} ${req.path}`);
  
  const token = AuthService.extractBearerToken(req.headers.authorization);
  
  if (!token) {
    console.log(`❌ [${requestId}] No valid Bearer token found in basic auth`);
    res.status(401).json({
      error: 'Unauthorized: Missing or invalid Authorization header. Expected: "Bearer <token>"',
    });
    return;
  }
  
  console.log(`✅ [${requestId}] Basic auth passed, token length: ${token.length}`);
  next();
} 