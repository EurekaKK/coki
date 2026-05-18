export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  dimensions: number;
}

export interface ZhipuEmbeddingConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
}

export interface LocalEmbeddingConfig {
  dimensions: number;
  modelName?: string;
}

export class ZhipuEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: ZhipuEmbeddingConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.dimensions = config.dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Embedding API error: ${response.status} ${body}`);
    }

    const json = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return json.data.map((d) => d.embedding);
  }
}

let pipelineModule: typeof import("@xenova/transformers") | null = null;
let localPipeline: unknown | null = null;

async function getPipeline(modelName: string) {
  if (!pipelineModule) {
    pipelineModule = await import("@xenova/transformers");
  }
  if (!localPipeline) {
    const { pipeline } = pipelineModule;
    localPipeline = await pipeline("feature-extraction", modelName, {
      quantized: true,
    });
  }
  return localPipeline as (texts: string[], options: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array; dims: number[] }>;
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;
  private readonly modelName: string;

  constructor(config: LocalEmbeddingConfig) {
    this.dimensions = config.dimensions;
    this.modelName = config.modelName ?? "Xenova/bge-small-zh-v1.5";
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const pipe = await getPipeline(this.modelName);
    const results: number[][] = [];

    for (const text of texts) {
      const output = await pipe([text], { pooling: "mean", normalize: true });
      const arr = Array.from(output.data);
      results.push(arr);
    }

    return results;
  }
}
