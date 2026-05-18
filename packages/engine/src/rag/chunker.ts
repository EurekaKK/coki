export interface TextChunk {
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface ChunkOptions {
  chunkSize: number;
  chunkOverlap: number;
}

export function chunkText(text: string, options: ChunkOptions): TextChunk[] {
  const { chunkSize, chunkOverlap } = options;
  if (text.length <= chunkSize) {
    return [{ text, startOffset: 0, endOffset: text.length }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const splitPoint = findSplitPoint(text, start, end, chunkSize);

    chunks.push({
      text: text.slice(start, splitPoint).trim(),
      startOffset: start,
      endOffset: splitPoint,
    });

    // Advance by chunkSize minus overlap, but don't go backwards
    const nextStart = splitPoint - chunkOverlap;
    start = nextStart > start ? nextStart : splitPoint;

    // Prevent infinite loop on zero progress
    if (start >= text.length) break;
    if (start <= chunks[chunks.length - 1].startOffset && splitPoint >= text.length) break;
  }

  return chunks;
}

function findSplitPoint(text: string, start: number, preferredEnd: number, _chunkSize: number): number {
  const searchWindow = text.slice(start, preferredEnd);

  // Look for sentence-ending punctuation followed by space or newline
  const sentenceMatch = searchWindow.match(/[.!?。！？]\s+/g);
  if (sentenceMatch) {
    // Take the last sentence break within the window
    const lastIndex = searchWindow.lastIndexOf(sentenceMatch[sentenceMatch.length - 1]);
    const absoluteEnd = start + lastIndex + sentenceMatch[sentenceMatch.length - 1].length;
    if (absoluteEnd > start) return absoluteEnd;
  }

  // Look for word boundary (space or newline)
  const lastSpace = searchWindow.lastIndexOf(" ");
  const lastNewline = searchWindow.lastIndexOf("\n");
  const boundary = Math.max(lastSpace, lastNewline);
  if (boundary > 0) {
    return start + boundary + 1;
  }

  return preferredEnd;
}
