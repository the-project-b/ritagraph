import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const initSseClient = async (sseEndpoint: string) => {
  const sseClientName = 'sse-client';
  const sseClient = new Client({
    name: sseClientName,
    version: '1.0.0'
  });

  try {
    const transport = new SSEClientTransport(new URL(sseEndpoint));
    await sseClient.connect(transport);
    return sseClient;
  } catch (error) {
    console.error(
      'Error while building SSE client',
      {
        sseClient: {
          name: sseClientName,
          endpoint: sseEndpoint,
        },
        error: error.message,
      },
      error.stack
    );
    throw error;
  }
};

export { initSseClient };
