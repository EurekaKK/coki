import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
    if (baseUrl !== config?.llm.baseUrl) patch.llmBaseUrl = baseUrl;
    if (defaultModel !== config?.llm.model) patch.llmModel = defaultModel;
    if (thinking !== (config?.llm.thinking ?? false)) patch.llmThinking = thinking;
    if (llmKey) patch.llmApiKey = llmKey;
    if (tavilyKey) patch.tavilyApiKey = tavilyKey;

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

    const data: ConfigData = await api.config.get();
    setConfig(data);
  };

  return (
    <div className="max-w-[600px] mx-auto px-8 py-8">
      <h2 className="text-[22px] font-semibold tracking-tight mb-6">设置</h2>

      <div className="space-y-6">
        {/* LLM Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[17px]">LLM 配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Base URL</Label>
              <Input
                placeholder="https://api.openai.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input
                type="password"
                placeholder={config?.llm.apiKeyConfigured && !llmKeyFocused ? "" : "输入 LLM API key..."}
                value={config?.llm.apiKeyConfigured && !llmKeyFocused && !llmKey ? "••••••••" : llmKey}
                onChange={(e) => setLlmKey(e.target.value)}
                onFocus={() => { setLlmKeyFocused(true); if (!llmKey) setLlmKey(""); }}
                onBlur={() => { if (!llmKey) setLlmKeyFocused(false); }}
              />
              {config?.llm.apiKeyConfigured && !llmKeyFocused && (
                <p className="text-[13px] text-[#34c759] dark:text-[#30d158]">已配置</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>默认模型</Label>
              <Input
                placeholder="gpt-4o-mini"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
              />
              <p className="text-[13px] text-muted-foreground">
                未指定模型的角色将使用此默认值
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <div
                  className={cn(
                    "w-10 h-6 rounded-full transition-colors duration-200 relative",
                    thinking ? "bg-primary" : "bg-border",
                  )}
                  onClick={() => setThinking(!thinking)}
                >
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform duration-200",
                      thinking ? "translate-x-5" : "translate-x-0.5",
                    )}
                  />
                </div>
                <span className="text-sm font-medium">启用思考模式</span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Per-Role Models */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[17px]">角色模型覆盖</CardTitle>
            <CardDescription>为每个管道角色指定特定模型，留空则使用默认模型</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ROLE_NAMES.map((role) => (
                <div key={role} className="flex items-center gap-3">
                  <Label className="w-28 shrink-0 text-[13px]">{ROLE_LABELS[role]}</Label>
                  <Input
                    placeholder={defaultModel || "gpt-4o-mini"}
                    value={roleModels[role] ?? ""}
                    onChange={(e) =>
                      setRoleModels((prev) => ({ ...prev, [role]: e.target.value }))
                    }
                    className="flex-1"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tavily */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[17px]">Tavily 搜索</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Input
              type="password"
              placeholder={config?.tavily.apiKeyConfigured && !tavilyKeyFocused ? "" : "输入 Tavily API key..."}
              value={config?.tavily.apiKeyConfigured && !tavilyKeyFocused && !tavilyKey ? "••••••••" : tavilyKey}
              onChange={(e) => setTavilyKey(e.target.value)}
              onFocus={() => { setTavilyKeyFocused(true); if (!tavilyKey) setTavilyKey(""); }}
              onBlur={() => { if (!tavilyKey) setTavilyKeyFocused(false); }}
            />
            {config?.tavily.apiKeyConfigured && !tavilyKeyFocused && (
              <p className="text-[13px] text-[#34c759] dark:text-[#30d158]">已配置</p>
            )}
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            onClick={handleSave}
            className={cn(
              "transition-all duration-200",
              saved && "bg-[#34c759] hover:bg-[#34c759] dark:bg-[#30d158] dark:hover:bg-[#30d158]",
            )}
          >
            {saved ? (
              <>
                <Check className="w-4 h-4 mr-1" />
                已保存
              </>
            ) : (
              "保存"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
