// Main auth service and middleware
export { AuthService } from './auth.service.js';
export { authMiddleware, basicAuthMiddleware } from './middleware.js';
export { AuthUtils } from './auth.utils.js';

// Types
export type {
  Auth0User,
  Auth0UserResponse,
  CompanyUser,
  UserToCompaniesResponse,
  VerifiedUser,
} from './types.js';

// Error class
export { AuthError } from './types.js'; 