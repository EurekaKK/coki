import { marked } from "marked";
import pdfParse from "pdf-parse";

export interface ParsedDocument {
  text: string;
  format: string;
}

export async function parseDocument(buffer: Buffer, format: string): Promise<ParsedDocument> {
  const lower = format.toLowerCase();

  if (lower === "txt") {
    return { text: buffer.toString("utf-8"), format: lower };
  }

  if (lower === "md") {
    const html = await marked(buffer.toString("utf-8"));
    const text = htmlToPlainText(html);
    return { text, format: lower };
  }

  if (lower === "pdf") {
    const result = await pdfParse(buffer);
    return { text: result.text, format: lower };
  }

  throw new Error(`Unsupported document format: ${format}`);
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
