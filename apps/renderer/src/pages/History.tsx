import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface RunSummary {
  id: string;
  user_query: string;
  depth: number;
  status: string;
  created_at: string;
}

export function History() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.research.history().then((data: unknown) => {
      setRuns(data as RunSummary[]);
    });
  }, []);

  const handleRerun = async (e: React.MouseEvent, runId: string) => {
    e.stopPropagation();
    try {
      const newRunId = await api.research.rerun(runId, "full");
      navigate(`/dashboard/${newRunId}`);
    } catch (err) {
      console.error("Re-run failed:", err);
    }
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Research History</h2>
      <div className="space-y-4">
        {runs.map((run) => (
          <div
            key={run.id}
            className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
            onClick={() => navigate(`/report/${run.id}`)}
          >
            <div className="flex justify-between items-start">
              <h3 className="font-medium">{run.user_query}</h3>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-1 rounded text-sm ${
                    run.status === "completed"
                      ? "bg-green-100 text-green-700"
                      : run.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100"
                  }`}
                >
                  {run.status}
                </span>
              </div>
            </div>
            <div className="text-sm text-gray-500 mt-1 flex items-center gap-3">
              <span>Depth {run.depth}</span>
              <span>{new Date(run.created_at).toLocaleDateString()}</span>
              {run.status === "completed" && (
                <>
                  <button
                    className="text-blue-500 hover:text-blue-700 text-xs underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/timeline/${run.id}`);
                    }}
                  >
                    Timeline
                  </button>
                  <button
                    className="text-blue-500 hover:text-blue-700 text-xs underline"
                    onClick={(e) => handleRerun(e, run.id)}
                  >
                    Re-run
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
