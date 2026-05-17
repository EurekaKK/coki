import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../lib/api";
import { CostPanel } from "../components/CostPanel";

export function Report() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [rerunning, setRerunning] = useState(false);

  useEffect(() => {
    if (!runId) return;
    api.research.report(runId).then((data: unknown) => {
      const run = data as { cited_report?: string; citedReport?: string };
      setReport(run.cited_report ?? run.citedReport ?? null);
      setLoading(false);
    });
  }, [runId]);

  const handleRerun = async (mode: "full" | "reuse-sources" | "reuse-plan") => {
    if (!runId || rerunning) return;
    setRerunning(true);
    setRerunOpen(false);
    try {
      const newRunId = await api.research.rerun(runId, mode);
      navigate(`/dashboard/${newRunId}`);
    } catch (err) {
      console.error("Re-run failed:", err);
      setRerunning(false);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (!report) return <div className="p-8">No report found.</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="prose max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
      </div>
      <div className="mt-8 flex gap-4 items-center flex-wrap">
        <button
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
          onClick={() => navigator.clipboard.writeText(report)}
        >
          Copy Markdown
        </button>
        <button
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
          onClick={() => navigate(`/timeline/${runId}`)}
        >
          View Timeline
        </button>
        <div className="relative">
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm disabled:opacity-50"
            onClick={() => setRerunOpen(!rerunOpen)}
            disabled={rerunning}
          >
            {rerunning ? "Re-running..." : "Re-run ▾"}
          </button>
          {rerunOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-white border rounded shadow-lg z-10">
              <button
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                onClick={() => handleRerun("full")}
              >
                Full Re-run
              </button>
              <button
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                onClick={() => handleRerun("reuse-sources")}
              >
                Reuse Sources
              </button>
              <button
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                onClick={() => handleRerun("reuse-plan")}
              >
                Reuse Plan
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4">
        <CostPanel runId={runId!} />
      </div>
    </div>
  );
}
