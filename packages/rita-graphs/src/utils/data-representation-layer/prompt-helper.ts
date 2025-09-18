// Original hardcoded prompt - kept for reference
// export const dataRepresentationLayerPrompt = `
// Tags / placeholders
// <List id="..." /> or <Object id="..." /> are Tags that represent a data stored elsewhere.
// You can use them in your reponse and they will replaced with the actual data when presented to the user.
// Do not alter them. Only use them if they are relevant to the request of the user.
// Do not put them into markdown formats like ** or * or anything like that.
// `;

// Temporarily keeping the hardcoded version for backward compatibility
// This will need to be refactored in all consuming files to use async prompt fetching
export const dataRepresentationLayerPrompt = `
Tags / placeholders
<List id="..." /> or <Object id="..." /> are Tags that represent a data stored elsewhere.
You can use them in your reponse and they will replaced with the actual data when presented to the user.
Do not alter them. Only use them if they are relevant to the request of the user.
Do not put them into markdown formats like ** or * or anything like that.
`;
