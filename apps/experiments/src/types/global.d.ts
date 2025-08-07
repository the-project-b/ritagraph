import { VerifiedUser } from "../auth/types.js";

declare global {
  namespace Express {
    interface Request {
      user?: VerifiedUser;
    }
  }
}
