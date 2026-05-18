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

export function Report() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mainRef.current = document.querySelector("main");
  }, []);

  useEffect(() => {
    if (!runId) return;
    api.research.report(runId).then((data: unknown) => {
      const run = data as { cited_report?: string; citedReport?: string };
      setReport(run.cited_report ?? run.citedReport ?? null);
      setLoading(false);
    });
  }, [runId]);

  // Extract headings after ReactMarkdown renders
  useEffect(() => {
    if (!report) return;
    const timer = setTimeout(() => {
      const elements = document.querySelectorAll(
        ".markdown-report h2, .markdown-report h3",
      );
      const items = Array.from(elements).map((el) => ({
        id: el.id,
        text: el.textContent || "",
        level: el.tagName === "H2" ? 2 : 3,
      }));
      setHeadings(items);
    }, 100);
    return () => clearTimeout(timer);
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
      for (const el of Array.from(headingElements)) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= 140) {
          current = el.id;
        }
      }
      setActiveId(current);
    };

    main.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => main.removeEventListener("scroll", handleScroll);
  }, [headings]);

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
    <div className="flex max-w-[1100px] mx-auto px-8 py-12 gap-8">
      {/* Table of Contents */}
      {headings.length > 0 && (
        <aside className="hidden lg:block w-[200px] shrink-0">
          <div className="sticky top-8">
            <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              目录
            </h3>
            <nav className="space-y-1">
              {headings.map((h) => (
                <button
                  key={h.id}
                  onClick={() => scrollToHeading(h.id)}
                  className={cn(
                    "block w-full text-left text-[13px] leading-snug py-1.5 px-2 rounded-lg transition-all duration-150",
                    h.level === 3 && "pl-4",
                    activeId === h.id
                      ? "text-primary font-medium bg-primary/10"
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
                const isFootnotes =
                  props.id === "footnote-label" ||
                  (typeof children === "string" && children === "Footnotes");
                return (
                  <h2 {...props} id={props.id ?? undefined}>
                    {isFootnotes ? "References" : children}
                  </h2>
                );
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
                  <a
                    {...props}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                  >
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
