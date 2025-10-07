import { Auth, HTTPException } from "@langchain/langgraph-sdk/auth";
import { createDecipheriv, createHash } from "crypto";
import { createLogger } from "@the-project-b/logging";
import { ViewAsValue, AuthUser } from "./types.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Authentication",
  component: "auth",
});

export const auth: Auth = new Auth();

/** Authentication types:
 * M2M: Generated in the backend when we parse incoming email, passed as token in header 'Authorization: Bearer ...'
 * Impersonation: Generated as 'appdata' in the backend and contains information around original user and their target for impersonation, this token is unchanged from how it's generated on the backend and is passed through 'x-appdata' header.
 * Flow:
 * We extract the token, and we pull user information from it using the 'me' query, including the prefferedLanguage of the sender user through 'fetchUserDataFromBackend'
 */

auth.authenticate(async (request: Request) => {
  // Extract the Authorization header from the request (Headers instance)
  let authorization: string | undefined = undefined;
  let appdataHeader: string | undefined = undefined;

  if (request.headers && typeof request.headers.get === "function") {
    // Log all headers as an object
    const allHeaders: Record<string, string> = {};
    for (const [key, value] of request.headers.entries()) {
      allHeaders[key] = value;
    }

    authorization =
      request.headers.get("authorization") ||
      request.headers.get("Authorization");
    appdataHeader =
      request.headers.get("x-appdata") || request.headers.get("X-Appdata");
  } else if (request.headers) {
    // fallback for plain object
    authorization =
      (request.headers as any).authorization ||
      (request.headers as any).Authorization;
    appdataHeader =
      (request.headers as any)["x-appdata"] ||
      (request.headers as any)["X-Appdata"];
  }

  if (!authorization || typeof authorization !== "string") {
    throw new HTTPException(401, { message: "Missing Authorization header" });
  }

  // At this point, authorization is a string
  const authHeader: string = authorization;
  let token = "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  } else {
    token = authHeader.trim();
  }
  if (!token) {
    throw new HTTPException(401, {
      message: "Invalid Authorization header format",
    });
  }

  let user = await fetchUserDataFromBackend(token);

  // Handle X-Appdata header for impersonation (replaces old X-Impersonation-Context)
  if (appdataHeader) {
    try {
      const viewAsData = await decryptAppdataHeader(appdataHeader);
      user = applyImpersonationContext(user, viewAsData);
      logger.info(
        "✅ Rita Graph Auth - Applied impersonation context from X-Appdata",
        {
          operation: "authenticate",
          hasImpersonation: true,
          targetRole: viewAsData.role,
          targetCompanyId: viewAsData.companyId,
        },
      );
    } catch (error) {
      logger.error(
        "❌ Rita Graph Auth - Failed to decrypt appdata header",
        error,
        {
          operation: "decryptAppdata",
          errorType:
            error instanceof Error ? error.constructor.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      );
      // Continue without impersonation if decryption fails
      logger.warn(
        "⚠️ Rita Graph Auth - Continuing without impersonation due to decryption failure",
      );
    }
  } else {
    logger.info(
      "ℹ️ Rita Graph Auth - No impersonation context found, using original user",
      {
        operation: "authenticate",
        hasImpersonation: false,
      },
    );
  }

  // No token validation for now (accept any token)
  return {
    identity: "Project-B Backend",
    name: "authenticated-user",
    token, // Pass the token so it is available in config.user.token
    appdataHeader, // Pass the appdata header for impersonation context
    permissions: [], // Required by BaseAuthReturn
    user: user.data.me,
  };
});

/**
 * Decrypt appdata header using the same encryption as backend
 * This matches the backend's EncryptionService.decryptJson method
 */
export async function decryptAppdataHeader(
  encryptedData: string,
): Promise<ViewAsValue> {
  const appSecret = process.env.APP_SECRET;

  if (!appSecret) {
    throw new Error(
      "APP_SECRET environment variable is required for appdata decryption",
    );
  }

  try {
    // First decode from base64 (the appdata cookie is base64-encoded)
    const decodedData = Buffer.from(encryptedData, "base64").toString();

    // Parse the encrypted appdata (same format as backend's appdata cookie)
    const parsedData = JSON.parse(decodedData);

    if (!parsedData.iv || !parsedData.encrypted) {
      throw new Error("Invalid appdata format");
    }

    // Get the secret key using the same method as backend
    const secretKey = getSecretKey(appSecret);

    // Decrypt using the same method as backend
    const decrypted = decrypt(
      Buffer.from(parsedData.encrypted, "hex"),
      Buffer.from(parsedData.iv, "hex"),
      secretKey,
    );

    // The decrypted value is base64-encoded JSON (matching backend's encryptJson logic)
    const decodedJson = Buffer.from(decrypted, "base64").toString();

    // Parse the decrypted JSON
    const viewAsData = JSON.parse(decodedJson) as ViewAsValue;

    // Validate ViewAsValue structure
    validateViewAsData(viewAsData);

    return viewAsData;
  } catch (error) {
    const errorMessage = error?.message || String(error) || "Unknown error";
    throw new Error(`Appdata decryption failed: ${errorMessage}`);
  }
}

/**
 * Decrypt using AES-256-CBC (matches backend EncryptionService.decrypt)
 */
function decrypt(ciphertext: Buffer, iv: Buffer, key: string): string {
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = decipher.update(ciphertext);
  const final = decipher.final();
  return Buffer.concat([decrypted, final]).toString();
}

/**
 * Get secret key using the same method as backend EncryptionService.getSecretKey
 */
function getSecretKey(appSecret: string): string {
  const key = createHash("sha256").update(appSecret).digest("hex");

  if (key.length > 32) {
    return key.substring(0, 32);
  }

  if (key.length === 32) return key;

  throw new Error(`Invalid key length. Expected 32, got: ${key.length}`);
}

/**
 * Validate ViewAsValue structure for security (matches backend validation)
 */
function validateViewAsData(viewAsData: ViewAsValue): void {
  if (
    !viewAsData.role ||
    !viewAsData.originalRole ||
    !viewAsData.userId ||
    !viewAsData.companyId
  ) {
    throw new Error("Invalid ViewAsValue structure: missing required fields");
  }

  if (typeof viewAsData.userRoleId !== "number") {
    throw new Error(
      "Invalid ViewAsValue structure: userRoleId must be a number",
    );
  }

  if (typeof viewAsData.clientImpersonated !== "boolean") {
    throw new Error(
      "Invalid ViewAsValue structure: clientImpersonated must be a boolean",
    );
  }

  // Validate viewAs.wanted if present (ACL v2)
  if (viewAsData.viewAs?.wanted) {
    const wanted = viewAsData.viewAs.wanted;
    if (
      !wanted.userId ||
      !wanted.companyId ||
      !wanted.role ||
      typeof wanted.userRoleId !== "number"
    ) {
      throw new Error(
        "Invalid ViewAsValue structure: viewAs.wanted has invalid structure",
      );
    }
  }
}

/**
 * Returns the user object that is fetched from the backend based on the token.
 * The construction of that user object is defined in auth.ts
 */
export function getAuthUser(config: any): AuthUser {
  const authUser = (config as any).configurable.langgraph_auth_user;

  return {
    ...authUser,
    token: authUser.token || config.backupAccessToken,
    appdataHeader: authUser.appdataHeader, // Include appdata header if present
  };
}

// Auth utilities are now exported individually above

/**
 * Creates a configured Auth instance for an app
 * This eliminates duplication across apps while maintaining the requirement
 * that each app has its own Auth instance for LangGraph module discovery
 */
export function createAuthInstance(): Auth {
  const authInstance = new Auth();

  authInstance.authenticate(async (request: Request) => {
    // Extract the Authorization header from the request (Headers instance)
    let authorization: string | undefined = undefined;
    let appdataHeader: string | undefined = undefined;

    if (request.headers && typeof request.headers.get === "function") {
      authorization =
        request.headers.get("authorization") ||
        request.headers.get("Authorization") ||
        undefined;
      appdataHeader =
        request.headers.get("x-appdata") ||
        request.headers.get("X-Appdata") ||
        undefined;
    } else if (request.headers) {
      // fallback for plain object
      authorization =
        (request.headers as any).authorization ||
        (request.headers as any).Authorization;
      appdataHeader =
        (request.headers as any)["x-appdata"] ||
        (request.headers as any)["X-Appdata"];
    }

    if (!authorization || typeof authorization !== "string") {
      throw new HTTPException(401, { message: "Missing Authorization header" });
    }

    // At this point, authorization is a string
    const authHeader: string = authorization;
    let token = "";
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      token = authHeader.slice(7).trim();
    } else {
      token = authHeader.trim();
    }
    if (!token) {
      throw new HTTPException(401, {
        message: "Invalid Authorization header format",
      });
    }

    // Use shared utilities
    let user = await fetchUserDataFromBackend(token);

    // Handle X-Appdata header for impersonation
    if (appdataHeader) {
      try {
        const viewAsData = await decryptAppdataHeader(appdataHeader);
        user = applyImpersonationContext(user, viewAsData);
        logger.info(
          "✅ Rita Graph Auth - Applied impersonation context from X-Appdata",
          {
            operation: "authenticate",
            hasImpersonation: true,
            targetRole: viewAsData.role,
            targetCompanyId: viewAsData.companyId,
          },
        );
      } catch (error) {
        logger.error(
          "❌ Rita Graph Auth - Failed to decrypt appdata header",
          error,
          {
            operation: "decryptAppdata",
            errorType:
              error instanceof Error ? error.constructor.name : "UnknownError",
            errorMessage:
              error instanceof Error ? error.message : String(error),
          },
        );
        // Continue without impersonation if decryption fails
        logger.warn(
          "⚠️ Rita Graph Auth - Continuing without impersonation due to decryption failure",
        );
      }
    } else {
      logger.info(
        "ℹ️ Rita Graph Auth - No impersonation context found, using original user",
        {
          operation: "authenticate",
          hasImpersonation: false,
        },
      );
    }

    // Return standardized auth data
    return {
      identity: "Project-B Backend",
      role: "authenticated-user",
      token, // Pass the token so it is available in config.user.token
      appdataHeader, // Pass the appdata header for impersonation context
      permissions: [], // Required by BaseAuthReturn
      user: user.data.me,
    };
  });

  return authInstance;
}

export async function fetchUserDataFromBackend(token: string) {
  const query = `
query Me {
  me {
    ...MeFieldsEmployee
    ...MeFieldsHr
    ...MeFieldsBpo
    ...MeFieldsAdmin
    __typename
  }
}

fragment ViewAs on ViewAsInfo {
  enabled
  impersonates {
    client
    role
    __typename
  }
  identity {
    company {
      name
      avatarUrl
      companyId
      __typename
    }
    user {
      userId
      firstName
      lastName
      email
      role
      avatarUrl
      __typename
    }
    __typename
  }
  original {
    company {
      name
      companyId
      avatarUrl
      __typename
    }
    user {
      userId
      firstName
      lastName
      role
      avatarUrl
      __typename
    }
    __typename
  }
  __typename
}

fragment MeFieldsEmployee on OnboardingEmployee {
  id
  email
  role
  firstName
  lastName
  preferredLanguage
  avatarUrl
  status
  childRole
  company {
    bpoCompany {
      id
      name
      __typename
    }
    inferredPayrollEngine {
      id
      identifier
      __typename
    }
    avatarUrl
    id
    name
    features
    isDemo
    __typename
  }
  viewAs {
    ...ViewAs
    __typename
  }
  employeeSpace {
    id
    status
    __typename
  }
  __typename
}

fragment MeFieldsHr on OnboardingHrManager {
  id
  email
  role
  firstName
  lastName
  preferredLanguage
  avatarUrl
  status
  childRole
  company {
    bpoCompany {
      id
      name
      __typename
    }
    inferredPayrollEngine {
      id
      identifier
      __typename
    }
    avatarUrl
    id
    name
    features
    forwardingEmail
    isDemo
    __typename
  }
  viewAs {
    ...ViewAs
    __typename
  }
  __typename
}

fragment MeFieldsBpo on OnboardingBpo {
  id
  email
  role
  firstName
  lastName
  preferredLanguage
  avatarUrl
  status
  childRole
  company {
    id
    name
    avatarUrl
    features
    forwardingEmail
    inferredPayrollEngine {
      id
      identifier
      __typename
    }
    isDemo
    __typename
  }
  viewAs {
    ...ViewAs
    __typename
  }
  __typename
}

fragment MeFieldsAdmin on OnboardingAdmin {
  id
  email
  role
  firstName
  lastName
  preferredLanguage
  avatarUrl
  status
  childRole
  company {
    id
    name
    avatarUrl
    features
    forwardingEmail
    isDemo
    __typename
  }
  viewAs {
    ...ViewAs
    __typename
  }
  __typename
}
`;

  const response = await fetch(
    `${process.env.PROJECTB_GRAPHQL_ENDPOINT}/graphqlapi`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      method: "POST",
      body: JSON.stringify({ query }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `GraphQL request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  return data;
}

export function applyImpersonationContext(
  userData: any,
  viewAsData: ViewAsValue,
) {
  const transformedData = JSON.parse(JSON.stringify(userData));

  transformedData.data.me = {
    ...transformedData.data.me,
    role: viewAsData.role, // This comes as UserRole enum
    company: {
      ...transformedData.data.me.company,
      id: viewAsData.companyId,
    },
  };

  if (viewAsData.viewAs?.wanted) {
    const wanted = viewAsData.viewAs.wanted;

    transformedData.data.me = {
      ...transformedData.data.me,
      id: wanted.userId,
      role: wanted.role,
      company: {
        ...transformedData.data.me.company,
        id: wanted.companyId,
      },
    };
  }

  return transformedData;
}
