import { VerifiedUser } from '@ritagraph/types';

declare global {
  namespace Express {
    interface Request {
      user?: VerifiedUser;
    }
  }
} 