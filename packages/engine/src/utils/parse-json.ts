/**
 * Robust JSON extraction from LLM text output.
 *
 * Handles three common shapes:
 *   1. Raw JSON
 *   2. JSON wrapped in ```json ... ``` or ``` ... ``` code blocks
 *   3. JSON embedded in surrounding prose (extracts first {...} or [...] block)
 *
 * Throws if no valid JSON found or parsing fails.
 */
export function parseJsonFromText(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const objectMatch = text.match(/(\{[\s\S]*\})/);
  if (objectMatch?.[1]) {
    return JSON.parse(objectMatch[1]);
  }

  const arrayMatch = text.match(/(\[[\s\S]*\])/);
  if (arrayMatch?.[1]) {
    return JSON.parse(arrayMatch[1]);
  }

  return JSON.parse(text);
}
