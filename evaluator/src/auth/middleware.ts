import { Request, Response, NextFunction } from 'express';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const providedToken = req.headers.authorization;
  if (!providedToken || !providedToken.toLowerCase().startsWith('bearer ')) {
    res.status(401).json({
      error: 'Unauthorized: Missing or invalid Authorization header. Expected: "Bearer <token>"',
    });
    return;
  }
  next();
} 