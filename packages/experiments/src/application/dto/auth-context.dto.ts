export interface UserContextDto {
  preferredLanguage: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface AuthContextDto {
  token: string;
  userId: string;
  companyId: string;
  user?: UserContextDto;
}
