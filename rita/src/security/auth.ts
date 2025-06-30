import { Auth, HTTPException } from "@langchain/langgraph-sdk/auth";

export const auth: Auth = new Auth();

auth.authenticate(async (request: Request) => {
  // Extract the Authorization header from the request (Headers instance)
  let authorization: string | undefined = undefined;
  if (request.headers && typeof request.headers.get === "function") {
    // Log all headers as an object
    const allHeaders: Record<string, string> = {};
    for (const [key, value] of request.headers.entries()) {
      allHeaders[key] = value;
    }
    authorization =
      request.headers.get("authorization") ||
      request.headers.get("Authorization");
  } else if (request.headers) {
    // fallback for plain object
    authorization =
      (request.headers as any).authorization ||
      (request.headers as any).Authorization;
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

  const user = await fetchUserDataFromBackend(token);

  // No token validation for now (accept any token)
  return {
    identity: "Projectb BE ololo",
    name: "placeholderForName",
    token, // Pass the token so it is available in config.user.token
    permissions: [], // Required by BaseAuthReturn
    user: user.data.me,
  };
});

type AuthUser = {
  identity: string;
  role: string;
  token: string;
  permissions: string[];
  user: {
    id: string;
    role: string;
    firstName: string;
    lastName: string;
    preferredLanguage: "EN" | "DE";
    company: {
      id: string;
      name: string;
    };
  };
};

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
