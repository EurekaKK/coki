import { useEffect, useState, useRef, useCallback } from "react";
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
import { cn } from "@/lib/utils";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractHeadings(report: string): TocItem[] {
  const lines = report.split("\n");
  const items: TocItem[] = [];
  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim().replace(/\*\*/g, "");
      const id = slugify(text) || `heading-${items.length}`;
      items.push({ id, text, level });
    }
  }
  return items;
}

export function Report() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const mainRef = useRef<HTMLElement | null>(null);
  const headingMapRef = useRef<Map<string, string>>(new Map());
  const tocIndexRef = useRef(0);

  useEffect(() => {
    mainRef.current = document.querySelector("main");
  }, []);

  useEffect(() => {
    if (!runId) return;
    api.research.report(runId).then((data: unknown) => {
      const run = data as { cited_report?: string; citedReport?: string };
      const content = run.cited_report ?? run.citedReport ?? null;
      setReport(content);
      if (content) {
        setHeadings(extractHeadings(content));
      }
      setLoading(false);
    });
  }, [runId]);

  // Reset heading map whenever report changes
  useEffect(() => {
    headingMapRef.current = new Map();
    tocIndexRef.current = 0;
  }, [report]);

  // Track active heading on scroll
  useEffect(() => {
    const main = mainRef.current;
    if (!main || headings.length === 0) return;

    const handleScroll = () => {
      const headingElements = document.querySelectorAll(
        ".markdown-report h2, .markdown-report h3",
      );
      let current = "";
      // Search from bottom to top: find the last heading above the threshold
      for (let i = headingElements.length - 1; i >= 0; i--) {
        const el = headingElements[i];
        const rect = el.getBoundingClientRect();
        if (rect.top <= 220) {
          current = el.id;
          break;
        }
      }
      setActiveId(current);
    };

    main.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => main.removeEventListener("scroll", handleScroll);
  }, [headings]);

  const getHeadingId = useCallback((level: number, childrenText: string): string => {
    const items = extractHeadings(report || "");
    const idx = tocIndexRef.current;
    const item = items[idx];
    if (item && item.level === level) {
      tocIndexRef.current = idx + 1;
      headingMapRef.current.set(childrenText, item.id);
      return item.id;
    }
    // fallback
    const fallback = slugify(childrenText) || `heading-${idx}`;
    headingMapRef.current.set(childrenText, fallback);
    return fallback;
  }, [report]);

  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
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
        <aside className="hidden lg:block w-[220px] shrink-0">
          <div className="sticky top-8">
            <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-3">
              目录
            </h3>
            <nav className="space-y-0.5">
              {headings.map((h) => (
                <button
                  key={h.id}
                  onClick={() => scrollToHeading(h.id)}
                  className={cn(
                    "block w-full text-left rounded-lg transition-all duration-150",
                    h.level === 2
                      ? "text-[13px] font-medium px-3 py-1.5"
                      : "text-[12px] px-3 py-1 pl-6",
                    activeId === h.id
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                  )}
                >
                  {h.text}
                </button>
              ))}
            </nav>
          </div>
        </aside>
      )}

      {/* Report content */}
      <div className="flex-1 min-w-0">
        {/* Report header */}
        <div className="mb-8">
          <div className="text-[13px] font-medium text-muted-foreground mb-2">
            研究报告
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">
            深度研究报告
          </h1>
        </div>

        <article className="markdown-report">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[
              rehypeKatex,
              [rehypeHighlight, { detect: true, ignoreMissing: true }],
            ]}
            components={{
              h2: ({ node: _node, children, ...props }) => {
                const text =
                  typeof children === "string"
                    ? children
                    : Array.isArray(children)
                      ? children.join("")
                      : "";
                const id = getHeadingId(2, text);
                const isFootnotes =
                  props.id === "footnote-label" || text === "Footnotes";
                return (
                  <h2 {...props} id={id}>
                    {isFootnotes ? "References" : children}
                  </h2>
                );
              },
              h3: ({ node: _node, children, ...props }) => {
                const text =
                  typeof children === "string"
                    ? children
                    : Array.isArray(children)
                      ? children.join("")
                      : "";
                const id = getHeadingId(3, text);
                return <h3 {...props} id={id}>{children}</h3>;
              },
              a: ({ href, children, ...props }) => {
                if (href?.startsWith("#")) {
                  return (
                    <a
                      {...props}
                      href={href}
                      onClick={(e) => {
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
                return (
                  <a {...props} href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                );
              },
            }}
          >
            {report}
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
