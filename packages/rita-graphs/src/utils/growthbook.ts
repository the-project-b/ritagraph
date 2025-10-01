import { GrowthBookClient, configureCache } from "@growthbook/growthbook";

const client = new GrowthBookClient({
  apiHost: "https://cdn.growthbook.io",
  clientKey: process.env.GROWTHBOOK_CLIENT_KEY,
});

configureCache({
  staleTTL: 1000 * 60, // 1 minute
  maxAge: 1000 * 60 * 2, // 2 minute
});

await client.init({
  timeout: 1000,
});

export default client;
