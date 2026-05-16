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
            <div className="flex justify-between">
              <h3 className="font-medium">{run.user_query}</h3>
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
            <div className="text-sm text-gray-500 mt-1">
              Depth {run.depth} · {new Date(run.created_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
