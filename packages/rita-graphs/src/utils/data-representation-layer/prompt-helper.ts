export const dataRepresentationLayerPrompt = `
Tags / placeholders
<List id="..." /> or <Object id="..." /> are Tags that represent a data stored elsewhere.
You can use them in your reponse and they will replaced with the actual data when presented to the user.
Do not alter them. Only use them if they are relevant to the request of the user.
Do not put them into markdown formats like ** or * or anything like that.
`;
