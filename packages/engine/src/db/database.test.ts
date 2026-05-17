import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CokiDatabase } from "./database";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("CokiDatabase", () => {
  let dbDir: string;
  let db: CokiDatabase;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "coki-db-test-"));
    db = new CokiDatabase(join(dbDir, "test.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("creates a run and retrieves it", () => {
    const id = db.createRun("What is quantum computing?", 2);
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");

    const run = db.getRun(id);
    expect(run).not.toBeNull();
    expect(run!.id).toBe(id);
    expect(run!.user_query).toBe("What is quantum computing?");
    expect(run!.depth).toBe(2);
    expect(run!.status).toBe("pending");
    expect(run!.research_plan).toBeNull();
    expect(run!.cited_report).toBeNull();
    expect(run!.completed_at).toBeNull();
    expect(run!.error).toBeNull();
    expect(run!.created_at).toBeTruthy();
  });

  it("updates run status: pending -> running -> completed with cited_report", () => {
    const id = db.createRun("test query", 1);

    // pending -> running
    db.updateRunStatus(id, "running");
    let run = db.getRun(id);
    expect(run!.status).toBe("running");
    expect(run!.completed_at).toBeNull();

    // running -> completed with report
    db.updateRunStatus(id, "completed", undefined, "# Report\nHello world");
    run = db.getRun(id);
    expect(run!.status).toBe("completed");
    expect(run!.cited_report).toBe("# Report\nHello world");
    expect(run!.completed_at).toBeTruthy();
  });

  it("updates run status to failed with error", () => {
    const id = db.createRun("fail query", 1);
    db.updateRunStatus(id, "running");
    db.updateRunStatus(id, "failed", "LLM timeout");

    const run = db.getRun(id);
    expect(run!.status).toBe("failed");
    expect(run!.error).toBe("LLM timeout");
    expect(run!.completed_at).toBeTruthy();
  });

  it("lists runs in reverse chronological order", () => {
    const id1 = db.createRun("first query", 1);
    const id2 = db.createRun("second query", 2);
    const id3 = db.createRun("third query", 3);

    const runs = db.listRuns();
    expect(runs.length).toBeGreaterThanOrEqual(3);
    // Most recent first
    expect(runs[0].id).toBe(id3);
    expect(runs[1].id).toBe(id2);
    expect(runs[2].id).toBe(id1);
  });

  it("inserts and retrieves sources", () => {
    const runId = db.createRun("test query", 1);

    db.insertSource({
      run_id: runId,
      source_type: "web",
      url: "https://example.com",
      title: "Example Page",
      snippet: "This is a snippet",
      canonical_url: "https://example.com/page",
      content_hash: "abc123",
    });

    db.insertSource({
      run_id: runId,
      source_type: "document",
      document_id: "doc-1",
      chunk_id: "chunk-1",
      title: "PDF Document",
      snippet: "From a PDF",
    });

    const sources = db.getSourcesByRun(runId);
    expect(sources).toHaveLength(2);

    const webSource = sources.find((s) => s.source_type === "web");
    expect(webSource).toBeDefined();
    expect(webSource!.url).toBe("https://example.com");
    expect(webSource!.title).toBe("Example Page");
    expect(webSource!.snippet).toBe("This is a snippet");
    expect(webSource!.canonical_url).toBe("https://example.com/page");
    expect(webSource!.content_hash).toBe("abc123");
    expect(webSource!.retrieved_at).toBeTruthy();
    expect(webSource!.fetch_status).toBe("ok");
    expect(webSource!.cited_in_report).toBe(0);

    const docSource = sources.find((s) => s.source_type === "document");
    expect(docSource).toBeDefined();
    expect(docSource!.document_id).toBe("doc-1");
    expect(docSource!.chunk_id).toBe("chunk-1");
  });

  it("inserts and retrieves llm_calls", () => {
    const runId = db.createRun("test query", 1);

    db.insertLLMCall({
      run_id: runId,
      role: "planner",
      model: "gpt-4o-mini",
      input_tokens: 500,
      output_tokens: 200,
      latency_ms: 1200,
    });

    db.insertLLMCall({
      run_id: runId,
      role: "synthesis",
      model: "gpt-4o",
      input_tokens: 2000,
      output_tokens: 800,
      latency_ms: 3500,
    });

    const calls = db.getLLMCallsByRun(runId);
    expect(calls).toHaveLength(2);

    expect(calls[0].role).toBe("planner");
    expect(calls[0].model).toBe("gpt-4o-mini");
    expect(calls[0].input_tokens).toBe(500);
    expect(calls[0].output_tokens).toBe(200);
    expect(calls[0].latency_ms).toBe(1200);
    expect(calls[0].created_at).toBeTruthy();

    expect(calls[1].role).toBe("synthesis");
    expect(calls[1].model).toBe("gpt-4o");
  });

  it("deletes a run and verifies cascade", () => {
    const runId = db.createRun("to delete", 1);

    // Add related data
    db.insertSource({
      run_id: runId,
      source_type: "web",
      url: "https://example.com",
      title: "Test",
    });
    db.insertLLMCall({
      run_id: runId,
      role: "planner",
      model: "gpt-4o-mini",
      input_tokens: 100,
      output_tokens: 50,
      latency_ms: 500,
    });

    // Verify data exists
    expect(db.getSourcesByRun(runId)).toHaveLength(1);
    expect(db.getLLMCallsByRun(runId)).toHaveLength(1);

    // Delete
    db.deleteRun(runId);

    // Verify cascade
    expect(db.getRun(runId)).toBeNull();
    expect(db.getSourcesByRun(runId)).toHaveLength(0);
    expect(db.getLLMCallsByRun(runId)).toHaveLength(0);
  });

  it("stores and retrieves research_plan", () => {
    const id = db.createRun("test query", 1);
    const plan = JSON.stringify({ questions: ["q1", "q2"], subagents: 2 });

    db.updateRunPlan(id, plan);
    const run = db.getRun(id);
    expect(run!.research_plan).toBe(plan);
  });

  it("returns null for non-existent run", () => {
    expect(db.getRun("non-existent-id")).toBeNull();
  });

  it("creates run with explicit id", () => {
    const explicitId = "custom-run-id-123";
    const id = db.createRun("test", 2, explicitId);
    expect(id).toBe(explicitId);
    const run = db.getRun(explicitId);
    expect(run).not.toBeNull();
    expect(run!.id).toBe(explicitId);
  });

  it("inserts and retrieves evidence spans", () => {
    const runId = db.createRun("test", 2);

    db.insertEvidenceSpan({
      id: "span-1",
      run_id: runId,
      source_id: null,
      subtask_id: "st-1",
      quote: "Quantum computing uses qubits",
      url: "https://example.com",
      page_title: "Example",
      start_offset: 0,
      end_offset: 30,
    });

    db.insertEvidenceSpan({
      id: "span-2",
      run_id: runId,
      source_id: null,
      subtask_id: "st-2",
      quote: "Machine learning requires data",
      url: "https://ml.com",
    });

    const spans = db.getEvidenceSpansByRun(runId);
    expect(spans).toHaveLength(2);
    expect(spans[0].quote).toBe("Quantum computing uses qubits");
    expect(spans[0].url).toBe("https://example.com");
    expect(spans[1].subtask_id).toBe("st-2");
  });

  it("inserts and retrieves claims", () => {
    const runId = db.createRun("test", 2);

    db.insertClaim({
      id: "claim-1",
      run_id: runId,
      claim_text: "Quantum computing can solve certain problems exponentially faster",
      section_heading: "Findings",
      claim_index: 0,
    });

    db.insertClaim({
      id: "claim-2",
      run_id: runId,
      claim_text: "Qubits can exist in superposition",
      section_heading: "Findings",
      claim_index: 1,
    });

    const claims = db.getClaimsByRun(runId);
    expect(claims).toHaveLength(2);
    expect(claims[0].claim_text).toBe("Quantum computing can solve certain problems exponentially faster");
    expect(claims[0].section_heading).toBe("Findings");
    expect(claims[0].claim_index).toBe(0);
    expect(claims[1].claim_index).toBe(1);
  });

  it("inserts and retrieves claim-evidence links", () => {
    const runId = db.createRun("test", 2);

    db.insertEvidenceSpan({
      id: "span-1",
      run_id: runId,
      subtask_id: "st-1",
      quote: "Qubits can be in superposition",
      url: "https://a.com",
    });

    db.insertClaim({
      id: "claim-1",
      run_id: runId,
      claim_text: "Qubits can exist in superposition",
      claim_index: 0,
    });

    db.insertClaimEvidence({
      id: "link-1",
      claim_id: "claim-1",
      evidence_span_id: "span-1",
      relevance_score: 0.85,
    });

    const links = db.getClaimEvidenceByRun(runId);
    expect(links).toHaveLength(1);
    expect(links[0].claim_id).toBe("claim-1");
    expect(links[0].evidence_span_id).toBe("span-1");
    expect(links[0].relevance_score).toBe(0.85);
  });

  it("cascades delete for evidence spans and claims", () => {
    const runId = db.createRun("test", 2);

    db.insertEvidenceSpan({
      id: "span-1",
      run_id: runId,
      subtask_id: "st-1",
      quote: "test evidence",
      url: "https://a.com",
    });

    db.insertClaim({
      id: "claim-1",
      run_id: runId,
      claim_text: "test claim",
      claim_index: 0,
    });

    db.insertClaimEvidence({
      id: "link-1",
      claim_id: "claim-1",
      evidence_span_id: "span-1",
      relevance_score: 0.5,
    });

    expect(db.getEvidenceSpansByRun(runId)).toHaveLength(1);
    expect(db.getClaimsByRun(runId)).toHaveLength(1);
    expect(db.getClaimEvidenceByRun(runId)).toHaveLength(1);

    db.deleteRun(runId);

    expect(db.getEvidenceSpansByRun(runId)).toHaveLength(0);
    expect(db.getClaimsByRun(runId)).toHaveLength(0);
    expect(db.getClaimEvidenceByRun(runId)).toHaveLength(0);
  });

  it("retrieves trace logs by run", () => {
    const runId = db.createRun("test", 2);

    // Trace logs are written by the pino logger, not directly by DB methods.
    // But we can verify getTraceLogsByRun returns empty for a fresh run.
    const logs = db.getTraceLogsByRun(runId);
    expect(logs).toEqual([]);
  });
});
