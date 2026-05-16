import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../lib/api";

export function Report() {
  const { runId } = useParams<{ runId: string }>();
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) return;
    api.research.report(runId).then((data: unknown) => {
      const run = data as { citedReport?: string };
      setReport(run.citedReport ?? null);
      setLoading(false);
    });
  }, [runId]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!report) return <div className="p-8">No report found.</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="prose max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
      </div>
      <div className="mt-8 flex gap-4">
        <button
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          onClick={() => navigator.clipboard.writeText(report)}
        >
          Copy Markdown
        </button>
      </div>
    </div>
  );
}
