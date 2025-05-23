export default `# Examples of correct graphql mcp usage

## QUERY: Fetching current user information
{
  "query": "query {\n  me {\n    ... on OnboardingEmployee {\n      id\n      email\n      firstName\n      lastName\n      role\n      status\n      preferredLanguage\n      companyId\n      createdAt\n      updatedAt\n    }\n    ... on OnboardingHrManager {\n      id\n      email\n      firstName\n      lastName\n      role\n      status\n      preferredLanguage\n      companyId\n      createdAt\n      updatedAt\n    }\n    ... on OnboardingBpo {\n      id\n      email\n      firstName\n      lastName\n      role\n      status\n      preferredLanguage\n      companyId\n      createdAt\n      updatedAt\n    }\n    ... on OnboardingAdmin {\n      id\n      email\n      firstName\n      lastName\n      role\n      status\n      preferredLanguage\n      companyId\n      createdAt\n      updatedAt\n    }\n  }\n}"
}

### This worked because:
Used inline fragments (... on TypeName) for each possible concrete type in the union
Specified the fields to return for each specific type
The server returned data for the matching type (OnboardingBpo in your case)

## MUTATION: Updating salary of employee in the future
{
  "query": "mutation {\n  paymentBulkUpdate(data: {\n    payments: [{\n      id: \"cmagmsg0g002dpne03h0b2i2g\",\n      effectiveDate: \"2025-06-01\",\n      properties: {\n        amount: 8000\n      }\n    }]\n  }) {\n    id\n    typeSlug\n    status\n    startDate\n    endDate\n    properties {\n      amount\n    }\n    userFirstName\n    userLastName\n  }\n}"
}

### This worked because:
Correct endpoint: The paymentBulkUpdate mutation is specifically designed to handle effective date changes, while the paymentUpdate endpoint may not handle future-dated changes properly.
Data structure: The bulk update expects an array of payments, which provides the proper context for the system to process the change. Even though we were only updating one payment, using the bulk operation gives the API more context about what we're trying to accomplish.
Transaction handling: Bulk operations typically have better transaction handling for changes that need to be scheduled for the future. The bulk operation likely has special logic to properly process and schedule the future-dated change.
Implementation difference: The single paymentUpdate mutation might be intended for immediate changes only, while paymentBulkUpdate has the necessary implementation to handle effective dates.
Data validation: The bulk operation probably has additional validation logic that ensures all required fields for a future-dated change are present.`;
