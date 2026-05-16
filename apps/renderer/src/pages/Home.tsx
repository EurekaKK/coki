import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";

export function Home() {
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState(2);
  const navigate = useNavigate();
  const { setCurrentRunId, setIsRunning, reset } = useAppStore();

  const handleStart = async () => {
    if (!query.trim()) return;
    reset();
    setIsRunning(true);
    const runId = await api.research.start(query, { depth });
    setCurrentRunId(runId);
    navigate(`/dashboard/${runId}`);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Coki Deep Research</h1>
      <textarea
        className="w-full h-32 p-4 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Enter your research question..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="flex gap-4 mt-4">
        {[1, 2, 3].map((d) => (
          <button
            key={d}
            className={`px-4 py-2 rounded ${depth === d ? "bg-blue-500 text-white" : "bg-gray-200"}`}
            onClick={() => setDepth(d)}
          >
            {d === 1 ? "Quick" : d === 2 ? "Balanced" : "Deep"}
          </button>
        ))}
      </div>
      <button
        className="mt-6 px-8 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
        onClick={handleStart}
        disabled={!query.trim()}
      >
        Start Research
      </button>
    </div>
  );
}
