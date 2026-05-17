import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface ConfigData {
  llm: { baseUrl: string; model: string; apiKeyConfigured: boolean; thinking: boolean };
  tavily: { apiKeyConfigured: boolean };
  roles: Record<string, { model: string }>;
}

const ROLE_NAMES = ["planner", "splitter", "subagent", "evaluator", "reflection", "synthesis", "citation"] as const;

const ROLE_LABELS: Record<string, string> = {
  planner: "Planner",
  splitter: "Splitter",
  subagent: "Sub-agent",
  evaluator: "Evaluator",
  reflection: "Reflection",
  synthesis: "Synthesis",
  citation: "Citation",
};

export function Settings() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [thinking, setThinking] = useState(false);
  const [roleModels, setRoleModels] = useState<Record<string, string>>({});
  const [llmKey, setLlmKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [llmKeyFocused, setLlmKeyFocused] = useState(false);
  const [tavilyKeyFocused, setTavilyKeyFocused] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.config.get().then((data: ConfigData) => {
      setConfig(data);
      setBaseUrl(data.llm.baseUrl);
      setDefaultModel(data.llm.model);
      setThinking(data.llm.thinking ?? false);
      const models: Record<string, string> = {};
      for (const role of ROLE_NAMES) {
        models[role] = data.roles[role]?.model ?? "";
      }
      setRoleModels(models);
    });
  }, []);

  const handleSave = async () => {
    const patch: Record<string, unknown> = {};

    // LLM config
    if (baseUrl !== config?.llm.baseUrl) patch.llmBaseUrl = baseUrl;
    if (defaultModel !== config?.llm.model) patch.llmModel = defaultModel;
    if (thinking !== (config?.llm.thinking ?? false)) patch.llmThinking = thinking;

    // API keys
    if (llmKey) patch.llmApiKey = llmKey;
    if (tavilyKey) patch.tavilyApiKey = tavilyKey;

    // Per-role models
    for (const role of ROLE_NAMES) {
      const current = config?.roles[role]?.model ?? "";
      if (roleModels[role] !== current) {
        patch[`role.${role}.model`] = roleModels[role];
      }
    }

    await api.config.update(patch);
    setLlmKey("");
    setTavilyKey("");
    setLlmKeyFocused(false);
    setTavilyKeyFocused(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    // Refresh config
    const data: ConfigData = await api.config.get();
    setConfig(data);
  };

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Settings</h2>
      <div className="space-y-8">
        {/* LLM Configuration */}
        <section>
          <h3 className="text-lg font-semibold mb-4">LLM Configuration</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Base URL</label>
              <input
                type="text"
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://api.openai.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">API Key</label>
              <input
                type="password"
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={config?.llm.apiKeyConfigured && !llmKeyFocused ? "" : "Enter LLM API key..."}
                value={config?.llm.apiKeyConfigured && !llmKeyFocused && !llmKey ? "••••••••" : llmKey}
                onChange={(e) => setLlmKey(e.target.value)}
                onFocus={() => { setLlmKeyFocused(true); if (!llmKey) setLlmKey(""); }}
                onBlur={() => { if (!llmKey) setLlmKeyFocused(false); }}
              />
              {config?.llm.apiKeyConfigured && !llmKeyFocused && (
                <p className="text-xs text-green-600 mt-1">Configured</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Default Model</label>
              <input
                type="text"
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="gpt-4o-mini"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Fallback model for roles without a specific override
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={thinking}
                  onChange={(e) => setThinking(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm font-medium">Enable Thinking Mode</span>
              </label>
              <p className="text-xs text-gray-500">
                For models that support reasoning (e.g. MiMo, Claude with extended thinking)
              </p>
            </div>
          </div>
        </section>

        {/* Per-Role Model Configuration */}
        <section>
          <h3 className="text-lg font-semibold mb-4">Per-Role Models</h3>
          <p className="text-sm text-gray-500 mb-4">
            Override the model for each pipeline role. Leave blank to use the default model.
          </p>
          <div className="space-y-3">
            {ROLE_NAMES.map((role) => (
              <div key={role} className="flex items-center gap-3">
                <label className="w-28 text-sm font-medium shrink-0">
                  {ROLE_LABELS[role]}
                </label>
                <input
                  type="text"
                  className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={defaultModel || "gpt-4o-mini"}
                  value={roleModels[role] ?? ""}
                  onChange={(e) =>
                    setRoleModels((prev) => ({ ...prev, [role]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
        </section>

        {/* Tavily */}
        <section>
          <h3 className="text-lg font-semibold mb-4">Tavily Search</h3>
          <div>
            <input
              type="password"
              className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={config?.tavily.apiKeyConfigured && !tavilyKeyFocused ? "" : "Enter Tavily API key..."}
              value={config?.tavily.apiKeyConfigured && !tavilyKeyFocused && !tavilyKey ? "••••••••" : tavilyKey}
              onChange={(e) => setTavilyKey(e.target.value)}
              onFocus={() => { setTavilyKeyFocused(true); if (!tavilyKey) setTavilyKey(""); }}
              onBlur={() => { if (!tavilyKey) setTavilyKeyFocused(false); }}
            />
            {config?.tavily.apiKeyConfigured && !tavilyKeyFocused && (
              <p className="text-xs text-green-600 mt-1">Configured</p>
            )}
          </div>
        </section>

        {/* Save button */}
        <div className="flex items-center gap-3">
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={handleSave}
          >
            Save
          </button>
          {saved && (
            <span className="text-sm text-green-600">Saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
