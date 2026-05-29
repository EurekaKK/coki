import type { DocumentManager } from "../rag/document-manager";
import type { ToolDef } from "../llm/client";

export const WEB_SEARCH_TOOL: ToolDef = {
  name: "tavily_search",
  description: "Search the web for information. Use specific, focused queries.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" },
    },
    required: ["query"],
  },
};

export const WEB_EXTRACT_TOOL: ToolDef = {
  name: "tavily_extract",
  description: "Extract full content from web URLs (http/https) found in previous search results. Document sources use extract_document instead.",
  input_schema: {
    type: "object",
    properties: {
      urls: {
        type: "array",
        items: { type: "string" },
        description: "Web URLs to extract content from",
      },
    },
    required: ["urls"],
  },
};

export function createDocumentSearchTool(collectionNames: string[]): ToolDef {
  const namesText = collectionNames.join('", "');
  return {
    name: "search_documents",
    description: `Search the local document collections ("${namesText}") for relevant passages. Returns chunks of text with relevance scores.`,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  };
}

export async function executeDocumentSearch(
  documentManager: DocumentManager,
  collectionId: string,
  query: string,
): Promise<string> {
  const results = await documentManager.search(collectionId, query);
  if (results.length === 0) return "No relevant documents found.";

  return results
    .map((r, i) => `Result ${i + 1} (score: ${(r.score * 100).toFixed(1)}%)\n${r.text}`)
    .join("\n\n---\n\n");
}
