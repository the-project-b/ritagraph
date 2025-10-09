/**
 * Email-related types for RitaGraph
 *
 * These types mirror the backend email parser types but are duplicated here
 * because the ritagraph project doesn't have direct access to backend types.
 *
 * Source: backend/src/onboarding-app/ritav2/email/parser/types/
 */

export type EmailMessageType = "original" | "reply" | "forward";

export type EmailMessageRole = "trigger" | "context";

export interface EmailMessage {
  type: EmailMessageType;
  role: EmailMessageRole;
  content: string;
  depth: number;
  subject?: string;
  from?: string;
  to?: string;
  timestamp?: Date;
  isQuoted: boolean;
}

export interface CompactOnboardingUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  preferredLanguage: string | null;
}

export interface EmailPerson {
  email: string;
  name: string | null;
  signature: string | null;
  onboardingUser: CompactOnboardingUser | null;
  originalEmail: string;
}

export interface EmailCompany {
  id: string;
  name: string;
  slug: string;
  email: string;
}
