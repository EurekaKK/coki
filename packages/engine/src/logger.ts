/**
 * Coki Logger
 *
 * Structured logger for pipeline execution, LLM calls, and tool uses.
 * Uses pino under the hood.
 *
 * In Electron (bundled), logs are written to a file at:
 *   ~/Library/Logs/@coki/main/coki.log  (macOS)
 *
 * In Node.js (tests, CLI), logs go to stdout.
 *
 * For pretty-printed output:
 *   tail -f ~/Library/Logs/@coki/main/coki.log | npx pino-pretty
 */

import pino from "pino";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

function isElectron(): boolean {
  return typeof process.versions === "object" && !!process.versions.electron;
}

function createLogger(): pino.Logger {
  const level = process.env.LOG_LEVEL ?? "info";

  const timestampFn = () => {
    const now = new Date();
    const pad = (n: number, len = 2) => String(n).padStart(len, "0");
    return `,"time":"${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}"`;
  };

  if (isElectron()) {
    // In Electron, write to a log file so it's always captureable
    const logDir = join(
      process.env.HOME ?? "/tmp",
      "Library/Logs/@coki/main",
    );
    mkdirSync(logDir, { recursive: true });
    const logPath = join(logDir, "coki.log");
    return pino({ level, timestamp: timestampFn }, pino.destination(logPath));
  }

  // In Node.js (tests, CLI), write to stdout
  return pino({ level, timestamp: timestampFn });
}

export const logger = createLogger();

// ---------------------------------------------------------------------------
// Typed child loggers for different concerns
// ---------------------------------------------------------------------------

export function pipelineLogger(runId: string) {
  return logger.child({ runId, component: "pipeline" });
}

export function llmLogger(runId: string, phase: string) {
  return logger.child({ runId, phase, component: "llm" });
}

export function toolLogger(runId: string, phase: string) {
  return logger.child({ runId, phase, component: "tool" });
}
