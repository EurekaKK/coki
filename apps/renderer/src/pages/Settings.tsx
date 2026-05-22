import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

interface ConfigData {
  llm: { baseUrl: string; model: string; apiKey: string; apiKeyConfigured: boolean; thinking: boolean };
  tavily: { apiKey: string; apiKeyConfigured: boolean };
  zhipu: { apiKey: string; apiKeyConfigured: boolean };
  roles: Record<string, { model: string }>;
}

const ROLE_NAMES = ["planner", "splitter", "subagent", "evaluator", "reflection", "synthesis"] as const;

const ROLE_LABELS: Record<string, string> = {
  planner: "Planner",
  splitter: "Splitter",
  subagent: "Sub-agent",
  evaluator: "Evaluator",
  reflection: "Reflection",
  synthesis: "Synthesis",
};

export function Settings() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [thinking, setThinking] = useState(false);
  const [roleModels, setRoleModels] = useState<Record<string, string>>({});
  const [llmKey, setLlmKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [zhipuKey, setZhipuKey] = useState("");
  const [llmKeyVisible, setLlmKeyVisible] = useState(false);
  const [tavilyKeyVisible, setTavilyKeyVisible] = useState(false);
  const [zhipuKeyVisible, setZhipuKeyVisible] = useState(false);

  useEffect(() => {
    api.config.get().then((data: ConfigData) => {
      setConfig(data);
      setBaseUrl(data.llm.baseUrl);
      setDefaultModel(data.llm.model);
      setThinking(data.llm.thinking ?? false);
      setLlmKey(data.llm.apiKey);
      setTavilyKey(data.tavily.apiKey);
      setZhipuKey(data.zhipu.apiKey);
      const models: Record<string, string> = {};
      for (const role of ROLE_NAMES) {
        models[role] = data.roles[role]?.model ?? "";
      }
      setRoleModels(models);
    });
  }, []);

  useEffect(() => {
    if (!config) return;
    const timer = setTimeout(async () => {
      const patch: Record<string, unknown> = {};
      if (baseUrl !== config.llm.baseUrl) patch.llmBaseUrl = baseUrl;
      if (defaultModel !== config.llm.model) patch.llmModel = defaultModel;
      if (thinking !== (config.llm.thinking ?? false)) patch.llmThinking = thinking;
      if (llmKey && llmKey !== config.llm.apiKey) patch.llmApiKey = llmKey;
      if (tavilyKey && tavilyKey !== config.tavily.apiKey) patch.tavilyApiKey = tavilyKey;
      if (zhipuKey && zhipuKey !== config.zhipu.apiKey) patch.zhipuApiKey = zhipuKey;

      for (const role of ROLE_NAMES) {
        const current = config.roles[role]?.model ?? "";
        if (roleModels[role] !== current) {
          patch[`role.${role}.model`] = roleModels[role];
        }
      }

      if (Object.keys(patch).length === 0) return;

      await api.config.update(patch);

      setLlmKey("");
      setTavilyKey("");
      setZhipuKey("");

      const data: ConfigData = await api.config.get();
      setConfig(data);
      setLlmKey(data.llm.apiKey);
      setTavilyKey(data.tavily.apiKey);
      setZhipuKey(data.zhipu.apiKey);
    }, 800);
    return () => clearTimeout(timer);
  }, [baseUrl, defaultModel, thinking, llmKey, tavilyKey, zhipuKey, roleModels, config]);

  return (
    <div className="max-w-[600px] mx-auto px-8 py-8">
      <h2 className="text-[22px] font-semibold tracking-tight mb-6">
        设置
      </h2>

      <div className="space-y-6">
        {/* LLM Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[17px]">LLM 配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className={cn(!baseUrl && "text-red-500")}>Base URL</Label>
              <Input
                placeholder="https://api.openai.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className={cn(!baseUrl && "border-red-500")}
              />
              <p className="text-[13px] text-muted-foreground">
                Anthropic 兼容格式，例如 https://api.anthropic.com/v1
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className={cn(!config?.llm.apiKeyConfigured && !llmKey && "text-red-500")}>API Key</Label>
              <div className="relative">
                <Input
                  type={llmKeyVisible ? "text" : "password"}
                  placeholder="输入 LLM API key..."
                  value={llmKey}
                  onChange={(e) => setLlmKey(e.target.value)}
                  className={cn("pr-10", !config?.llm.apiKeyConfigured && !llmKey && "border-red-500")}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-secondary text-muted-foreground transition-colors"
                  onMouseDown={(e) => { e.preventDefault(); setLlmKeyVisible((v) => !v); }}
                  tabIndex={-1}
                >
                  {llmKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className={cn(!defaultModel && "text-red-500")}>默认模型</Label>
              <Input
                placeholder="gpt-4o-mini"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className={cn(!defaultModel && "border-red-500")}
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
            <CardDescription>用于研究过程中的网络信息检索与网页内容提取</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Label className={cn(!config?.tavily.apiKeyConfigured && !tavilyKey && "text-red-500")}>API Key</Label>
            <div className="relative">
              <Input
                type={tavilyKeyVisible ? "text" : "password"}
                placeholder="输入 Tavily API key..."
                value={tavilyKey}
                onChange={(e) => setTavilyKey(e.target.value)}
                className={cn("pr-10", !config?.tavily.apiKeyConfigured && !tavilyKey && "border-red-500")}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-secondary text-muted-foreground transition-colors"
                onMouseDown={(e) => { e.preventDefault(); setTavilyKeyVisible((v) => !v); }}
                tabIndex={-1}
              >
                {tavilyKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Zhipu Embedding */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[17px]">智谱 Embedding</CardTitle>
            <CardDescription>用于知识库文档的向量嵌入，不填则使用本地 embedding 模型</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Label className={cn(!config?.zhipu.apiKeyConfigured && !zhipuKey && "text-red-500")}>API Key</Label>
            <div className="relative">
              <Input
                type={zhipuKeyVisible ? "text" : "password"}
                placeholder="输入智谱 API key..."
                value={zhipuKey}
                onChange={(e) => setZhipuKey(e.target.value)}
                className={cn("pr-10", !config?.zhipu.apiKeyConfigured && !zhipuKey && "border-red-500")}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-secondary text-muted-foreground transition-colors"
                onMouseDown={(e) => { e.preventDefault(); setZhipuKeyVisible((v) => !v); }}
                tabIndex={-1}
              >
                {zhipuKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
