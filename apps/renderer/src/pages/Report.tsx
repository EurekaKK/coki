import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { api } from "../lib/api";
import { CostPanel } from "../components/CostPanel";

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

  if (loading) return <div className="p-8">Loading...</div>;
  if (!report) return <div className="p-8">No report found.</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <article className="markdown-report prose prose-slate max-w-none prose-headings:scroll-mt-20 prose-h1:text-3xl prose-h2:text-2xl prose-h2:border-b prose-h2:pb-2 prose-h3:text-xl prose-h4:text-lg prose-pre:bg-gray-50 prose-pre:text-gray-900 prose-pre:border prose-pre:border-gray-200 prose-table:my-4">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
          components={{
            // remark-gfm auto-generates an English "Footnotes" h2 at the end
            // of the document. Rename it to "References" for users.
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
            // The app uses HashRouter, so clicking href="#user-content-fn-1"
            // would let React Router intercept the hash change and render a
            // blank "no matching route" screen. Intercept all #hash links and
            // do a manual scrollIntoView instead.
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
              // External links — open in system browser, not inside Electron
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
      <div className="mt-8 flex gap-4 items-center flex-wrap">
        <button
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
          onClick={handleExport}
        >
          Save as .md
        </button>
        <button
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
          onClick={() => navigate(`/timeline/${runId}`)}
        >
          View Timeline
        </button>
      </div>
      <div className="mt-4">
        <CostPanel runId={runId!} />
      </div>
    </div>
  );
}
