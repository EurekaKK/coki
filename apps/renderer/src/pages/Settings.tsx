import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function Settings() {
  const [config, setConfig] = useState<unknown>(null);
  const [llmKey, setLlmKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");

  useEffect(() => {
    api.config.get().then(setConfig);
  }, []);

  const handleSave = async () => {
    await api.config.update({
      ...(llmKey ? { llmApiKey: llmKey } : {}),
      ...(tavilyKey ? { tavilyApiKey: tavilyKey } : {}),
    });
    setLlmKey("");
    setTavilyKey("");
    api.config.get().then(setConfig);
  };

  const cfg = config as {
    llm?: { baseUrl?: string; model?: string; apiKeyConfigured?: boolean };
    tavily?: { apiKeyConfigured?: boolean };
  } | null;

  return (
    <div className="p-8 max-w-lg">
      <h2 className="text-2xl font-bold mb-6">Settings</h2>
      <div className="space-y-6">
        <div>
          <h3 className="font-medium mb-2">LLM Configuration</h3>
          <p className="text-sm text-gray-500 mb-2">
            Base URL: {cfg?.llm?.baseUrl ?? "Not set"} · Model: {cfg?.llm?.model ?? "Not set"}
          </p>
          <p className="text-sm mb-2">
            API Key: {cfg?.llm?.apiKeyConfigured ? "Configured" : "Not configured"}
          </p>
          <input
            type="password"
            className="w-full p-2 border rounded"
            placeholder="Enter LLM API key..."
            value={llmKey}
            onChange={(e) => setLlmKey(e.target.value)}
          />
        </div>
        <div>
          <h3 className="font-medium mb-2">Tavily API Key</h3>
          <p className="text-sm mb-2">
            {cfg?.tavily?.apiKeyConfigured ? "Configured" : "Not configured"}
          </p>
          <input
            type="password"
            className="w-full p-2 border rounded"
            placeholder="Enter Tavily API key..."
            value={tavilyKey}
            onChange={(e) => setTavilyKey(e.target.value)}
          />
        </div>
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={handleSave}
        >
          Save
        </button>
      </div>
    </div>
  );
}
