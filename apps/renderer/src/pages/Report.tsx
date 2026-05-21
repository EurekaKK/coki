import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { api } from "../lib/api";
import { CostPanel } from "../components/CostPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, List } from "lucide-react";
import { cn } from "@/lib/utils";

interface TocItem {
  text: string;
  level: number;
}

function escapeTildesInMarkdown(text: string): string {
  let inCodeBlock = false;
  return text
    .split("\n")
    .map((line) => {
      if (line.trim().startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        return line;
      }
      if (inCodeBlock) return line;
      return line.replace(/(?<!~)~(?!~)/g, "\\~");
    })
    .join("\n");
}

function getHastText(node: any): string {
  if (!node) return "";
  if (node.type === "text") return node.value || "";
  if (Array.isArray(node.children)) {
    return node.children.map(getHastText).join("");
  }
  return "";
}

// rehype-katex crashes on elements without `properties` (e.g. <sup> from remark-gfm footnotes).
// This plugin ensures every element node has a properties object before katex sees it.
const ensureProperties = () => (tree: any) => {
  const walk = (node: any) => {
    if (node && node.type === "element" && !node.properties) {
      node.properties = {};
    }
    if (node && Array.isArray(node.children)) {
      node.children.forEach(walk);
    }
  };
  walk(tree);
};

const components = {
  h2: ({ node, children, ...props }: any) => {
    const text = getHastText(node).trim();
    const isFootnotes = props.id === "footnote-label" || text === "Footnotes";
    if (isFootnotes) {
      // Suppress remark-gfm's auto-generated "Footnotes" heading.
      // The backend already injects a "## References" heading.
      return null;
    }
    return <h2 {...props}>{children}</h2>;
  },
  h3: ({ node, children, ...props }: any) => {
    return <h3 {...props}>{children}</h3>;
  },
  a: ({ href, children, ...props }: any) => {
    if (href?.startsWith("#")) {
      return (
        <a
          {...props}
          href={href}
          onClick={(e: React.MouseEvent) => {
            e.preventDefault();
            const target = document.getElementById(
              decodeURIComponent(href.slice(1)),
            );
            target?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }}
        >
          {children}
        </a>
      );
    }
    // Synthetic document URL — open local file via main process
    if (href?.startsWith("https://doc.coki/")) {
      const docId = href.slice("https://doc.coki/".length);
      return (
        <a
          {...props}
          href={href}
          title="点击打开本地文档"
          className="text-primary underline cursor-pointer"
          onClick={async (e: React.MouseEvent) => {
            e.preventDefault();
            try {
              await api.documents.openDocument(docId);
            } catch (err) {
              console.error("Failed to open document:", err);
            }
          }}
        >
          {children}
        </a>
      );
    }
    return (
      <a {...props} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
  td: ({ children, isHeader: _isHeader, ...props }: any) => (
    <td {...props}>{children}</td>
  ),
  th: ({ children, isHeader: _isHeader, ...props }: any) => (
    <th {...props}>{children}</th>
  ),
};

export function Report() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [tocOpen, setTocOpen] = useState(true);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mainRef.current = document.querySelector("main");
  }, []);

  useEffect(() => {
    if (!runId) return;
    api.research.report(runId).then((data: unknown) => {
      const run = data as { cited_report?: string; citedReport?: string };
      const content = run.cited_report ?? run.citedReport ?? null;
      setReport(content);
      setLoading(false);
    });
  }, [runId]);

  // Read actual DOM headings after ReactMarkdown renders
  useEffect(() => {
    if (!report) {
      setHeadings([]);
      return;
    }
    const timer = requestAnimationFrame(() => {
      const elements = document.querySelectorAll(
        ".markdown-report h2, .markdown-report h3",
      );
      const items: TocItem[] = [];
      elements.forEach((el) => {
        const level = el.tagName === "H2" ? 2 : 3;
        let text = el.textContent || "";
        if (text === "Footnotes") text = "References";
        items.push({ text, level });
      });
      setHeadings(items);
    });
    return () => cancelAnimationFrame(timer);
  }, [report]);

  // Track active heading on scroll
  useEffect(() => {
    const main = mainRef.current;
    if (!main || headings.length === 0) return;

    const handleScroll = () => {
      const elements = document.querySelectorAll(
        ".markdown-report h2, .markdown-report h3",
      );
      let current = -1;
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        const rect = el.getBoundingClientRect();
        if (rect.top <= 220) {
          current = i;
          break;
        }
      }
      setActiveIndex(current);
    };

    main.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => main.removeEventListener("scroll", handleScroll);
  }, [headings]);

  const title = useMemo(() => {
    const m = report?.match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : "深度研究报告";
  }, [report]);

  const cleanedReport = useMemo(() => {
    if (!report) return "";
    return escapeTildesInMarkdown(
      report.replace(/^#\s+.+$/m, "").trimStart(),
    );
  }, [report]);

  const scrollToHeading = useCallback((index: number) => {
    const main = mainRef.current;
    const elements = document.querySelectorAll(
      ".markdown-report h2, .markdown-report h3",
    );
    const el = elements[index];
    if (el && main) {
      const top =
        el.getBoundingClientRect().top +
        main.scrollTop -
        main.getBoundingClientRect().top -
        20;
      main.scrollTo({ top, behavior: "smooth" });
    }
  }, []);

  const handleExport = async () => {
    if (!report || !runId) return;
    const slug = runId.slice(0, 8);
    await api.research.exportMarkdown(`report-${slug}.md`, report);
  };

  if (loading) {
    return (
      <div className="max-w-[800px] mx-auto px-8 py-12">
        <Skeleton className="h-4 w-48 mb-4" />
        <Skeleton className="h-8 w-full mb-8" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-[800px] mx-auto px-8 py-12 text-center">
        <p className="text-muted-foreground">未找到报告</p>
      </div>
    );
  }

  return (
    <div className="flex max-w-[1100px] mx-auto px-8 py-12 gap-10">
      {/* Table of Contents */}
      {headings.length > 0 && (
        <aside
          className={cn(
            "hidden lg:block shrink-0 transition-all duration-200",
            tocOpen ? "w-[220px]" : "w-11",
          )}
        >
          <div className="sticky top-8 flex flex-col max-h-[calc(100vh-4rem)]">
            {tocOpen ? (
              <>
                <div className="flex items-center justify-between mb-4 px-3 shrink-0">
                  <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
                    目录
                  </h3>
                  <button
                    onClick={() => setTocOpen(false)}
                    className="p-1 rounded-md hover:bg-secondary text-muted-foreground transition-colors"
                    title="收起目录"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
                <nav className="space-y-0.5 overflow-y-auto">
                  {headings.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => scrollToHeading(i)}
                      className={cn(
                        "block w-full text-left rounded-lg transition-all duration-150",
                        h.level === 2
                          ? "text-[14px] font-medium px-3 py-1.5"
                          : "text-[12px] font-semibold px-3 py-1 pl-6",
                        activeIndex === i
                          ? "text-primary bg-primary/10"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                      )}
                    >
                      {h.text}
                    </button>
                  ))}
                </nav>
              </>
            ) : (
              <button
                onClick={() => setTocOpen(true)}
                className="w-full flex justify-center p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                title="展开目录"
              >
                <List className="w-4 h-4" />
              </button>
            )}
          </div>
        </aside>
      )}

      {/* Report content */}
      <div className="flex-1 min-w-0">
        {/* Report header */}
        <div className="mb-8">
          <h1 className="text-[28px] font-bold tracking-tight text-foreground leading-tight">
            {title}
          </h1>
        </div>

        <article className="markdown-report">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
            rehypePlugins={[
              ensureProperties,
              rehypeKatex,
              [rehypeHighlight, { detect: true, ignoreMissing: true }],
            ]}
            components={components}
          >
            {cleanedReport}
          </ReactMarkdown>
        </article>

        {/* Action bar */}
        <div className="flex gap-3 items-center justify-center mt-12 pt-8 border-t border-border">
          <Button variant="secondary" size="sm" onClick={handleExport}>
            保存为 .md
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/timeline/${runId}`)}
          >
            查看时间线
          </Button>
        </div>

        {/* Cost panel */}
        <div className="mt-6">
          <CostPanel runId={runId!} />
        </div>
      </div>
    </div>
  );
}
