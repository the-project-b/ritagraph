import { VerifiedUser } from '@ritagraph/types';

export interface GraphQLContext {
  user?: VerifiedUser;
  token?: string;
} 