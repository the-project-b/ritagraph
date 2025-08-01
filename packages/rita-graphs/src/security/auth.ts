import { Auth, HTTPException } from "@langchain/langgraph-sdk/auth";
import { createDecipheriv, createHash } from 'crypto';
import { ViewAsValue, AuthUser } from "./types.js";

export const auth: Auth = new Auth();

auth.authenticate(async (request: Request) => {
  // Extract the Authorization header from the request (Headers instance)
  let authorization: string | undefined = undefined;
  let impersonationContext: string | undefined = undefined;
  
  if (request.headers && typeof request.headers.get === "function") {
    // Log all headers as an object
    const allHeaders: Record<string, string> = {};
    for (const [key, value] of request.headers.entries()) {
      allHeaders[key] = value;
    }

    authorization =
      request.headers.get("authorization") ||
      request.headers.get("Authorization");
    impersonationContext =
      request.headers.get("x-impersonation-context") ||
      request.headers.get("X-Impersonation-Context");
  } else if (request.headers) {
    // fallback for plain object
    authorization =
      (request.headers as any).authorization ||
      (request.headers as any).Authorization;
    impersonationContext =
      (request.headers as any)["x-impersonation-context"] ||
      (request.headers as any)["X-Impersonation-Context"];
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

  if (impersonationContext) {
    try {
      const viewAsData = await verifyEncryptedImpersonationContext(impersonationContext);
      user = applyImpersonationContext(user, viewAsData);
    } catch (error) {
      console.error("❌ Rita Graph Auth - Failed to decrypt impersonation context:", error);
      // Security: Reject requests with invalid impersonation tokens
      throw new HTTPException(401, { 
        message: "Invalid impersonation token" 
      });
    }
  } else {
    console.log("ℹ️ Rita Graph Auth - No impersonation context found, using original user");
  }

  // No token validation for now (accept any token)
  return {
    identity: "Project-B Backend",
    name: "authenticated-user",
    token, // Pass the token so it is available in config.user.token
    permissions: [], // Required by BaseAuthReturn
    user: user.data.me,
  };
});


/**
 * Decrypt and verify encrypted impersonation context
 * Uses the same encryption approach as the backend EncryptionService
 */
async function verifyEncryptedImpersonationContext(encryptedToken: string): Promise<ViewAsValue> {
  const appSecret = process.env.APP_SECRET;
  
  if (!appSecret) {
    throw new Error('APP_SECRET environment variable is required for impersonation token decryption');
  }

  try {
    // Decrypt the token using the same algorithm as backend EncryptionService
    const decryptedPayload = decryptJson<{
      originalUserId: string;
      viewAsData: ViewAsValue;
      type: string;
      issuedAt: string;
      expiresAt: string;
      tokenId: string;
    }>(encryptedToken, appSecret);

    // Validate payload structure
    if (!decryptedPayload.viewAsData || decryptedPayload.type !== 'impersonation_context') {
      throw new Error('Invalid impersonation token payload structure');
    }

    // Check expiration
    const expiresAt = new Date(decryptedPayload.expiresAt);
    if (expiresAt < new Date()) {
      throw new Error('Impersonation token has expired');
    }

    // Validate ViewAsValue structure
    validateViewAsData(decryptedPayload.viewAsData);

    return decryptedPayload.viewAsData;
  } catch (error) {
    const errorMessage = error?.message || String(error) || 'Unknown error';
    if (errorMessage.includes('expired')) {
      throw new Error('Impersonation token has expired');
    }
    if (errorMessage.includes('Decryption failed') || errorMessage.includes('decrypt')) {
      throw new Error('Invalid impersonation token');
    }
    throw error;
  }
}

/**
 * Decrypt JSON using AES-256-CBC (matches backend EncryptionService)
 */
function decryptJson<T>(encryptedData: string, appSecret: string): T {
  try {
    // Parse the encrypted payload (base64 -> JSON -> {encrypted, iv})
    const parsedEncrypted = JSON.parse(Buffer.from(encryptedData, 'base64').toString());
    
    // Get the secret key using the same method as backend
    const secretKey = getSecretKey(appSecret);
    
    // Decrypt using the same method as backend
    const decrypted = decrypt(
      Buffer.from(parsedEncrypted.encrypted, 'hex'),
      Buffer.from(parsedEncrypted.iv, 'hex'),
      secretKey
    );

    // Parse the decrypted JSON
    return JSON.parse(Buffer.from(decrypted, 'base64').toString());
  } catch (error) {
    const errorMessage = error?.message || String(error) || 'Unknown error';
    throw new Error(`Decryption failed: ${errorMessage}`);
  }
}

/**
 * Decrypt using AES-256-CBC (matches backend EncryptionService.decrypt)
 */
function decrypt(ciphertext: Buffer, iv: Buffer, key: string): string {
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = decipher.update(ciphertext);
  const final = decipher.final();
  return Buffer.concat([decrypted, final]).toString();
}

/**
 * Get secret key using the same method as backend EncryptionService.getSecretKey
 */
function getSecretKey(appSecret: string): string {
  const key = createHash('sha256').update(appSecret).digest('hex');
  
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
    throw new Error('Invalid ViewAsValue structure: missing required fields');
  }

  if (typeof viewAsData.userRoleId !== 'number') {
    throw new Error(
      'Invalid ViewAsValue structure: userRoleId must be a number'
    );
  }

  if (typeof viewAsData.clientImpersonated !== 'boolean') {
    throw new Error(
      'Invalid ViewAsValue structure: clientImpersonated must be a boolean'
    );
  }

  // Validate viewAs.wanted if present (ACL v2)
  if (viewAsData.viewAs?.wanted) {
    const wanted = viewAsData.viewAs.wanted;
    if (
      !wanted.userId ||
      !wanted.companyId ||
      !wanted.role ||
      typeof wanted.userRoleId !== 'number'
    ) {
      throw new Error(
        'Invalid ViewAsValue structure: viewAs.wanted has invalid structure'
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

  return { ...authUser, token: authUser.token || config.backupAccessToken };
}

async function fetchUserDataFromBackend(token: string) {
  const query = `query Me {
  me {
    ...MeFieldsHr
    __typename
  }
}

fragment MeFieldsHr on OnboardingHrManager {
  id
  role
  firstName
  lastName
  preferredLanguage
  company {
    id
    name
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
      },
      method: "POST",
      body: JSON.stringify({ query }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `GraphQL request failed: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  return data;
}

function applyImpersonationContext(userData: any, viewAsData: ViewAsValue) {
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
