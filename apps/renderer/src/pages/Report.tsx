import { useEffect, useState } from "react";
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

export function Report() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) return;
    api.research.report(runId).then((data: unknown) => {
      const run = data as { cited_report?: string; citedReport?: string };
      setReport(run.cited_report ?? run.citedReport ?? null);
      setLoading(false);
    });
  }, [runId]);

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
    <div className="max-w-[800px] mx-auto px-8 py-12">
      {/* Report header */}
      <div className="mb-8">
        <div className="text-[13px] font-medium text-muted-foreground mb-2">
          研究报告
        </div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">
          深度研究报告
        </h1>
      </div>

      {/* Report content */}
      <article className="markdown-report">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
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
                      target?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        <Button variant="secondary" size="sm" onClick={() => navigate(`/timeline/${runId}`)}>
          查看时间线
        </Button>
      </div>

      {/* Cost panel */}
      <div className="mt-6">
        <CostPanel runId={runId!} />
      </div>
    </div>
  );
}
