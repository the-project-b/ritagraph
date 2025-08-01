import { VerifiedUser } from '../auth/types.js';

export interface GraphQLContext {
  user?: VerifiedUser;
  token?: string;
} 