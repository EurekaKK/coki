/**
 * Robust JSON extraction from LLM text output.
 *
 * Handles three common shapes:
 *   1. Raw JSON
 *   2. JSON wrapped in ```json ... ``` or ``` ... ``` code blocks
 *   3. JSON embedded in surrounding prose (extracts first {...} or [...] block)
 *
 * Also attempts to repair truncated JSON (missing closing braces/brackets)
 * by appending the required closers.
 */
export function parseJsonFromText(text: string): unknown {
  // Try the full trimmed text first (with truncation repair) so that
  // mid-object braces don't cause the regex below to extract an overly
  // narrow subset and discard the rest of the truncated content.
  const fullResult = tryParseWithRepair(text.trim());
  if (fullResult !== undefined) {
    return fullResult;
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates: string[] = [];

  if (fenced?.[1]) {
    candidates.push(fenced[1].trim());
  }

  const objectMatch = text.match(/(\{[\s\S]*\})/);
  if (objectMatch?.[1]) {
    candidates.push(objectMatch[1]);
  }

  const arrayMatch = text.match(/(\[[\s\S]*\])/);
  if (arrayMatch?.[1]) {
    candidates.push(arrayMatch[1]);
  }

  for (const candidate of candidates) {
    const result = tryParseWithRepair(candidate);
    if (result !== undefined) {
      return result;
    }
  }

  throw new Error("No valid JSON found in text");
}

function tryParseWithRepair(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch (err) {
    const repair = repairTruncatedJson(text);
    if (repair && repair !== text) {
      try {
        return JSON.parse(repair);
      } catch {
        // fall through
      }
    }
  }
  return undefined;
}

function repairTruncatedJson(text: string): string | undefined {
  const stack: Array<"{" | "[" | '"'> = [];
  let escapeNext = false;

  for (const char of text) {
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      if (stack[stack.length - 1] === '"') {
        stack.pop();
      } else {
        stack.push('"');
      }
      continue;
    }
    if (stack[stack.length - 1] === '"') continue;

    if (char === "{" || char === "[") {
      stack.push(char);
    } else if (char === "}") {
      if (stack[stack.length - 1] === "{") {
        stack.pop();
      }
    } else if (char === "]") {
      if (stack[stack.length - 1] === "[") {
        stack.pop();
      }
    }
  }

  if (stack.length === 0) {
    return undefined;
  }

  let repaired = text;

  // Close unclosed string first
  if (stack[stack.length - 1] === '"') {
    repaired += '"';
    stack.pop();
  }

  // Close remaining brackets/braces in reverse order (LIFO)
  while (stack.length > 0) {
    const open = stack.pop();
    if (open === "{") repaired += "}";
    else if (open === "[") repaired += "]";
  }

  return repaired;
}
