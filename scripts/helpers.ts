export type Example = {
  id: string;
  dataset_id: string;
  inputs?: unknown;
  outputs?: unknown;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  modified_at?: string;
  split?: string | null;
};

export type ExampleUpdate = Partial<{
  inputs: unknown;
  outputs: unknown;
  metadata: Record<string, unknown> | null;
  split: string | null;
}>;

function getBaseUrl(): string {
  let baseUrl =
    process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";
  if (baseUrl.includes("eu.api.smith.langchain.com")) {
    baseUrl = "https://eu.api.smith.langchain.com";
  }
  return baseUrl.replace(/\/api\/v1\/?$/, "");
}
function getHeaders(): Record<string, string> {
  const apiKey = process.env.LANGSMITH_API_KEY ?? process.env.LANGCHAIN_API_KEY;
  if (!apiKey) {
    throw new Error("LANGSMITH_API_KEY or LANGCHAIN_API_KEY must be set");
  }
  return {
    "x-api-key": String(apiKey),
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export async function resolveDatasetIdByName(
  datasetName: string,
): Promise<string> {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();
  const url = new URL("/api/v1/datasets", baseUrl);
  url.searchParams.set("limit", "100");
  url.searchParams.set("offset", "0");
  url.searchParams.set("name", datasetName);
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    throw new Error(`Failed to list datasets: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  type DatasetRow = {
    id?: string;
    dataset_id?: string;
    name?: string;
    dataset_name?: string;
  };
  const rows: DatasetRow[] = Array.isArray(data)
    ? (data as DatasetRow[])
    : ((data as Record<string, unknown>)?.datasets as
        | DatasetRow[]
        | undefined) || [];
  const match = rows.find(
    (d) => d?.name === datasetName || d?.dataset_name === datasetName,
  );
  if (!match) {
    throw new Error(`Dataset not found: ${datasetName}`);
  }
  return (match.id || match.dataset_id) as string;
}

export async function listExamples(datasetId: string): Promise<Example[]> {
  return listExamplesByDatasetId(datasetId);
}

export async function listExampleIdsByDatasetName(
  datasetName: string,
): Promise<string[]> {
  const datasetId = await resolveDatasetIdByName(datasetName);
  const examples = await listExamples(datasetId);
  return examples.map((e) => e.id);
}

export async function listExamplesByDatasetId(
  datasetId: string,
): Promise<Example[]> {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();
  const pageSize = 100;
  let offset = 0;
  const results: Example[] = [];
  while (true) {
    const url = new URL(`/api/v1/examples`, baseUrl);
    url.searchParams.set("dataset", datasetId);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      throw new Error(
        `Failed to list examples: ${res.status} ${res.statusText}`,
      );
    }
    type RawExample = {
      id: string;
      dataset_id?: string;
      inputs?: unknown;
      outputs?: unknown;
      metadata?: Record<string, unknown> | null;
      extra?: Record<string, unknown> | null;
      created_at?: string;
      modified_at?: string;
      split?: string | null;
    };
    const batch = (await res.json()) as RawExample[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const item of batch) {
      results.push({
        id: item.id,
        dataset_id: item.dataset_id ?? datasetId,
        inputs: item.inputs,
        outputs: item.outputs,
        metadata: item.metadata ?? item.extra ?? null,
        created_at: item.created_at,
        modified_at: item.modified_at,
        split: item.split ?? null,
      });
    }
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return results;
}

export async function listExampleIdsByDatasetId(
  datasetId: string,
): Promise<string[]> {
  const examples = await listExamplesByDatasetId(datasetId);
  return examples.map((e) => e.id);
}

export async function getExample(exampleId: string): Promise<Example> {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();
  const url = new URL(`/api/v1/examples/${exampleId}`, baseUrl);
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    throw new Error(
      `Failed to get example ${exampleId}: ${res.status} ${res.statusText}`,
    );
  }
  type RawExample = {
    id: string;
    dataset_id: string;
    inputs?: unknown;
    outputs?: unknown;
    metadata?: Record<string, unknown> | null;
    extra?: Record<string, unknown> | null;
    created_at?: string;
    modified_at?: string;
    split?: string | null;
  };
  const item = (await res.json()) as RawExample;
  return item;
}

export async function updateExample(
  exampleId: string,
  update: ExampleUpdate,
): Promise<Example> {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();
  const url = new URL(`/api/v1/examples/${exampleId}`, baseUrl);
  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers,
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to update example ${exampleId}: ${res.status} ${res.statusText} - ${text}`,
    );
  }
  const item: Example = await res.json();
  return {
    id: item.id,
    dataset_id: item.dataset_id,
    inputs: item.inputs,
    outputs: item.outputs,
    metadata: item.metadata ?? null,
    created_at: item.created_at,
    modified_at: item.modified_at,
    split: item.split ?? null,
  };
}
