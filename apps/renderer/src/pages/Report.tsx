import { useEffect, useState, useRef, useCallback, useMemo } from "react";
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

function getHastText(node: any): string {
  if (!node) return "";
  if (node.type === "text") return node.value || "";
  if (Array.isArray(node.children)) {
    return node.children.map(getHastText).join("");
  }
  return "";
}

const components = {
  h2: ({ node, children, ...props }: any) => {
    const text = getHastText(node).trim();
    const isFootnotes = props.id === "footnote-label" || text === "Footnotes";
    if (isFootnotes) {
      return (
        <h2 {...props} id="footnote-label">
          References
        </h2>
      );
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
    return (
      <a {...props} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
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
    return report.replace(/^#\s+.+$/m, "").trimStart();
  }, [report]);

  const scrollToHeading = useCallback((index: number) => {
    const elements = document.querySelectorAll(
      ".markdown-report h2, .markdown-report h3",
    );
    const el = elements[index];
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
        <aside
          className={cn(
            "hidden lg:block shrink-0 transition-all duration-200",
            tocOpen ? "w-[220px]" : "w-11",
          )}
        >
          <div className="sticky top-8">
            {tocOpen ? (
              <>
                <div className="flex items-center justify-between mb-4 px-3">
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
                <nav className="space-y-0.5">
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
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[
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
