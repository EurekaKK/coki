/**
 * Section parsing for markdown reports.
 * Splits a report into sections by ## / ### headings.
 */

export interface Section {
  heading: string;
  level: number;
  text: string;
}

/**
 * Parse a markdown report into sections by # / ## / ### headings.
 * Content before the first heading falls under a synthetic "Introduction" section.
 */
export function parseSections(report: string): Section[] {
  const sections: Section[] = [];
  const lines = report.split("\n");
  let currentHeading = "Introduction";
  let currentLevel = 2;
  let currentText = "";

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      if (currentText.trim()) {
        sections.push({
          heading: currentHeading,
          level: currentLevel,
          text: currentText.trim(),
        });
      }
      currentLevel = headingMatch[1]!.length;
      currentHeading = headingMatch[2]!.trim();
      currentText = "";
    } else {
      currentText += line + "\n";
    }
  }
  if (currentText.trim()) {
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      text: currentText.trim(),
    });
  }
  return sections;
}

/**
 * Count inline [src: <url>] citations in a piece of text.
 */
export function countCitations(text: string): number {
  const matches = text.match(/\[src:\s*https?:[^\]]+\]/g);
  return matches?.length ?? 0;
}
