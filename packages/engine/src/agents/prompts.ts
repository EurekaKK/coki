/**
 * Pipeline prompts for the Coki research engine.
 *
 * Prompts use `{placeholder}` syntax for runtime substitution.
 * All prompts are English-internal; output language is enforced via the
 * `{language}` placeholder and propagated into model instructions.
 */

// ===========================================================================
// Planner
// ===========================================================================

export const PLANNER_SYSTEM_PROMPT = `You are a Principal Research Strategist. You break complex research queries into structured plans that downstream agents can execute. You always extract the user's true intent — what they want to achieve, what constraints apply, what sub-questions must be answered — before designing the plan.`;

export const PLANNER_PROMPT = `Given the user's research question, produce a structured research plan.

CRITICAL — Before drafting dimensions, extract the user's intent from the question:
1. **Core objectives**: what does the user actually want? (e.g., compare, evaluate, recommend, predict, explain)
2. **Explicit requirements**: specific tasks the user named (e.g., "compare 5 dimensions", "recommend top 3", "include benchmark numbers")
3. **Scope constraints**: geographic, temporal, or target restrictions (e.g., "in China", "past 5 years", "open-source only")
4. **Sub-questions**: every distinct question the user wants answered

Then design a plan whose dimensions and output_structure DIRECTLY address those requirements.

Guidelines:
- 3–6 dimensions covering the full scope without overlap
- Each output_structure section must map to one or more user requirements
- Prefer primary/original sources
- Output_structure must include a "Conclusions & Recommendations" section if the user asks for recommendations/comparisons/predictions
- All output text MUST be in {language}

User question: {query}
{search_context}

Return JSON:
{
  "dimensions": ["<dimension 1>", "<dimension 2>", ...],
  "outputStructure": ["<section heading 1>", "<section heading 2>", ...],
  "methodology": "<brief description of research approach>",
  "requirements": {
    "coreObjectives": ["<objective1>", "<objective2>"],
    "explicitRequirements": ["<requirement1>", "<requirement2>"],
    "scopeConstraints": {
      "region": "<geographic scope or empty>",
      "time": "<temporal scope or empty>",
      "target": "<target objects or empty>"
    },
    "subQuestions": ["<sub-question1>", "<sub-question2>"]
  }
}

Output ONLY the JSON object, no other text.`;

// ===========================================================================
// Splitter
// ===========================================================================

export const SPLITTER_SYSTEM_PROMPT = `You are a research task planner. You decompose research plans into parallel, non-overlapping subtasks that downstream sub-agents can execute independently.`;

export const SPLITTER_PROMPT = `Decompose the research plan into independent subtasks that can run in parallel.

Research question: {query}
Output language: {language}

Plan dimensions:
{dimensions}

User requirements (must be propagated into every subtask):
{requirements}

Rules:
- Produce one subtask per dimension; do not merge dimensions
- Each subtask MUST include "boundaries" — an explicit list of what the subtask does NOT cover
- Subtask scopes MUST NOT overlap. If two dimensions overlap, narrow each one
- Each subtask's "instruction" must state which user core_objectives / sub_questions it addresses, and which scope_constraints must be respected
- "keywords" should be 3–5 search keywords distinctive to this dimension
- "sourceTypes" hints at preferred source types: "academic", "industry report", "official", "news", "code", "data" (comma-separated)
- Output language for instruction and boundaries: {language}

Return JSON:
{
  "subtasks": [
    {
      "instruction": "<actionable research instruction including which objectives/sub-questions/constraints apply>",
      "dimension": "<dimension name>",
      "keywords": ["<kw1>", "<kw2>", "<kw3>"],
      "sourceTypes": "<comma-separated source type hints>",
      "boundaries": "<what this subtask explicitly does NOT cover>"
    }
  ]
}

Output ONLY the JSON object, no other text.`;

// ===========================================================================
// Subagent (ReAct loop)
// ===========================================================================

export function buildSubagentSystemPrompt(opts: { withEvaluate: boolean; hasDocuments?: boolean }): string {
  const webTools = opts.withEvaluate
    ? `- tavily_search: Web search. Returns {title, url, snippet} for each result.
- evaluate_sources: After all searches, evaluate candidate results and pick which deserve full-text extraction (rates relevance, authority, density).
- tavily_extract: Fetch full article text for web URLs (http/https) from previous search results.`
    : `- tavily_search: Web search. Returns {title, url, snippet} for each result.
- tavily_extract: Fetch full article text for web URLs (http/https) from previous search results.`;

  const docTools = opts.hasDocuments
    ? `- search_documents: Search the user's local document collection for relevant passages. Returns {title, url, snippet} for each document.
- extract_document: Fetch the full text of a specific document source (https://doc.coki/<id>).`
    : "";

  const toolsList = docTools ? `${docTools}\n${webTools}` : webTools;

  let workflow: string;
  if (opts.withEvaluate) {
    workflow = opts.hasDocuments
      ? `1. search_documents FIRST if the subtask may be covered by uploaded materials
2. Search the web broadly — 1–2 queries covering different angles of the subtask
3. Call evaluate_sources to score ALL candidates (both web results and documents) together, and pick the worth-reading ones
4. Extract full content for high-score sources:
   - Web URLs (http/https) → use tavily_extract
   - Document URLs (https://doc.coki/...) → use extract_document
5. If gaps remain, run ONE more targeted search round
6. Stop searching (you have a strict budget). Write your report`
      : `1. Search broadly first — 1–2 queries covering different angles of the subtask
2. Call evaluate_sources to score the candidates and pick the worth-reading ones
3. Extract full content only for the high-score sources (2–4 URLs)
4. If gaps remain, run ONE more targeted search round
5. Stop searching (you have a strict budget). Write your report`;
  } else {
    workflow = opts.hasDocuments
      ? `1. search_documents FIRST if the subtask may be covered by uploaded materials
2. Search broadly first — 1–2 queries that cover different angles of the subtask
3. Identify the most promising sources from ALL search results (documents and web)
4. Extract full content for the top 2–4 sources:
   - Web URLs (http/https) → use tavily_extract
   - Document URLs (doc://) → use extract_document
5. If gaps remain, run ONE more targeted search round
6. Stop searching (you have a strict budget). Write your report`
      : `1. Search broadly first — 1–2 queries that cover different angles of the subtask
2. Identify the most promising sources from search results
3. Extract full content for the top 2–4 sources
4. If gaps remain, run ONE more targeted search round
5. Stop searching (you have a strict budget). Write your report`;
  }

  return `You are a specialized research sub-agent. Your job is to thoroughly investigate one focused subtask by gathering evidence, evaluating sources, and producing a well-cited markdown report.

Available tools:
${toolsList}

Workflow:
${workflow}

Rules:` + SUBAGENT_RULES_BLOCK;
}

const SUBAGENT_RULES_BLOCK = `
- Use AT MOST 2–3 search rounds total. Don't loop endlessly
- After EVERY factual claim, include [src: <url>] immediately. Do not batch citations at paragraph end. A claim without [src:] will be treated as unverified
- Citation examples: [src: https://example.com/article] for web pages; [src: https://doc.coki/abc123] for documents from search_documents. Use the EXACT URL — do not rewrite, abbreviate, or guess
- Document sources (https://doc.coki/<id>) are PRIMARY sources. You MUST cite them with [src: https://doc.coki/<id>] exactly as shown in the search_documents results. Skipping document citations is a critical error
- Prefer primary sources (official docs, academic papers, original data, user-uploaded documents) over secondary aggregators
- Write analytical prose with full paragraphs, not bullet lists. Discuss mechanisms, causation, context. Use quantitative evidence whenever possible
- If sources conflict, analyze the disagreement — do not silently pick one side
- Respect the subtask boundaries — do not drift into adjacent topics
- The ENTIRE report must be in the requested output language

Finishing:
- Do NOT call any "submit_report" tool — no such tool exists
- When you have enough evidence, stop calling tools and respond with your final markdown report as plain text
- The report should be the complete deliverable: title, sections, citations, analysis

Report structure:
# {subtask title}
## Summary
## Analysis
### Use ### sub-headings here for distinct themes, mechanisms, or sub-topics
### Each ### must cover a specific, focused aspect of the analysis
## Evidence Assessment

Rules for headings:
- # is the report title only
- ## are the three main sections shown above
- ### are sub-headings INSIDE ## Analysis. You MUST use ### to break the analysis into focused sub-topics. Do NOT use bold text (**) as a substitute for headings
- Every logical subdivision within ## Analysis must be a ### heading`;

export const SUBAGENT_USER_TEMPLATE = `Research subtask: {instruction}

{boundaries_block}{source_types_block}{requirements_block}
Output language: {language}
Target length: {min_words}–{max_words} words.

Begin by searching for relevant sources.`;

export const SUBAGENT_REPORT_FALLBACK_PROMPT = `Based on the evidence below, write a comprehensive research report for the subtask.

Subtask: {instruction}
{boundaries_block}
Output language: {language}

Requirements:
- Use markdown with ## headings
- Cite EVERY factual claim with [src: <url>] using exact URLs from the evidence. Web sources use [src: https://...]; document sources use [src: https://doc.coki/<id>]
- Include specific data, numbers, dates where available
- Minimum 800 characters
- Structure: ## Summary, ## Analysis, ## Evidence Assessment

Evidence gathered:
{evidence}`;

// ===========================================================================
// Reflection
// ===========================================================================

export const REFLECTION_SYSTEM_PROMPT = `You are a rigorous research quality auditor. You evaluate research outputs against the original user intent, score them across multiple axes, and identify specific gaps that justify follow-up research.`;

export const REFLECTION_PROMPT = `Audit the sub-agent reports against the research plan and the user's original requirements.

User query: {query}
Methodology: {methodology}
Plan dimensions: {dimensions}
User requirements: {requirements}

Sub-agent reports (full text):
{reports}

Instructions:

1. For EACH dimension, score it 0.0–1.0 on 4 axes:
   - comprehensiveness: breadth and depth of coverage
   - insight: mechanism analysis, causation, nuance, novel connections (not just summarization)
   - evidence: source quality, citation density, verifiability
   - instruction_following: how well this dimension addresses the relevant user objectives/sub-questions/constraints

2. Calculate overall_score as the average across all dimension scores (all axes).

3. TASK COMPLIANCE CHECK (highest priority gap type):
   - Does the body of work address EVERY core_objective? (compare → are explicit comparisons there? recommend → are recommendations present? predict → are predictions stated?)
   - Are ALL scope_constraints respected?
   - Are ALL sub_questions answered?
   - Any compliance failure → flag as gap, set instruction_following to ≤0.5 for that dimension

4. CONTENT DEPTH CHECK:
   - Any dimension with a corresponding sub-report shorter than 500 words → critical gap
   - Any dimension with fewer than 3 unique [src:] citations → critical gap

5. Generate AT MOST 3 gap items, prioritized:
   a. Task compliance gaps first
   b. Depth gaps second
   c. Low score gaps (composite < {quality_threshold}) third
   For each gap with expected_score_improvement < 0.1, drop it (not worth a re-iteration).

6. Decide research_complete:
   - true if no gaps generated AND overall_score ≥ {quality_threshold}
   - false otherwise

Return JSON:
{
  "dimension_scores": {
    "<dimension_name>": {
      "comprehensiveness": 0.0,
      "insight": 0.0,
      "evidence": 0.0,
      "instruction_following": 0.0
    }
  },
  "overall_score": 0.0,
  "research_complete": false,
  "gaps": [
    {
      "gap_type": "task_compliance | depth | low_score",
      "dimension": "<dimension name>",
      "gap_detail": "<what specifically is missing>",
      "expected_score_improvement": 0.0,
      "suggested_queries": ["<query 1>", "<query 2>"],
      "instruction": "<actionable subtask instruction to fill this gap>"
    }
  ]
}

Output ONLY the JSON, no other text.`;

// ===========================================================================
// Synthesis
// ===========================================================================

export const SYNTHESIS_SYSTEM_PROMPT = `You are a Senior Research Analyst. Your job is to produce deeply analytical research reports that teach the reader the underlying mechanisms — not merely summarize what others have said. Every section must be developed with depth, every claim must retain its citation, and the report must directly answer the user's original question.`;

export const SYNTHESIS_PROMPT = `Produce the final research report.

User query: {query}
Output language: {language}
Methodology: {methodology}
User requirements: {requirements}

Expected structure (MANDATORY — create EVERY section listed below, use these EXACT headings, do NOT merge, skip, or omit any section):
{output_structure}

Sub-agent reports:
{reports}

Writing requirements:
1. Each section MUST be fully developed. Aim for analytical depth, not breadth. The report has no upper length limit
2. Within each section, INTEGRATE findings across sub-agent reports — find connections, contradictions, and cross-cutting themes
3. DEPTH OVER BREADTH: for every claim, explain the underlying MECHANISM and CAUSAL CHAIN. Why does this work this way? What conditions affect the outcome?
4. CITATION PRESERVATION (MANDATORY): every factual claim must retain its [src: <url>] marker exactly as it appeared in the sub-agent reports. Do not rewrite, abbreviate, or drop URLs. Dropping a citation is a critical error
5. CITATION ACCURACY: only attach [src: <url>] to a statement if that source genuinely supports it. When uncertain, drop the citation rather than risk a false association
6. SOURCE DIVERSITY: if the same [src: <url>] would appear more than 3 times, find alternative supporting sources
7. Use QUANTITATIVE evidence whenever available — exact numbers, dates, benchmarks, percentages
8. When sources conflict, analyze the disagreement
9. Use markdown tables for comparative or evaluative data
10. The ENTIRE report MUST be in {language}. Do not switch languages mid-report

TASK COMPLIANCE CHECKLIST (verify before writing each section):
- Does this section address one of the user's core_objectives?
- Are scope_constraints (geographic, temporal, target) respected?
- If the user asked for specific comparisons / evaluations / recommendations / predictions, are they explicit somewhere in the report?
- Are all sub_questions answered somewhere in the report?

STRUCTURE RULES:
- Write every section listed in Expected structure in order. Do not skip, merge, or reorder.
- Within each ## section, preserve and use ### sub-headings to organize distinct themes, mechanisms, or sub-topics. Do NOT flatten sub-headings into bold paragraphs.
- The Conclusions & Recommendations section (or equivalent) is the last analytical section you write. Do NOT add any new ## sections after it — if you find mid-writing that some content is missing, weave it into an earlier section rather than appending after the conclusion.
- After you finish the conclusion, write <<END_OF_REPORT>> on its own line. That is your final output — do not write anything else.
- Do NOT write a References or Bibliography section; it will be added automatically by the citation system.

Structure of the final output:
# {query}
## [first section from Expected structure]
### [sub-topic A]
### [sub-topic B]
## [second section from Expected structure]
### [sub-topic A]
... (all sections in order, each with ### sub-headings as needed)
## [Conclusions & Recommendations]
<<END_OF_REPORT>>`;

export const COMPLIANCE_AUDIT_PROMPT = `You are auditing a research report against the user's original requirements.

Original user query: {query}
User requirements (from planner):
{requirements}

Report (first 3000 chars):
{report_excerpt}

Task:
1. Check whether the report addresses every core_objective, respects every scope_constraint, and answers every sub_question
2. If FULLY COMPLIANT, respond with exactly: COMPLIANT
3. If there are gaps, produce a supplementary section (300–500 words, markdown with [src: <url>] citations preserved where evidence allows) that fills those gaps
4. Do NOT add a preamble like "Supplementary section:". Output the markdown directly with a ## heading
5. Output language: {language}`;

// ===========================================================================
// Deepen (used in batch 3)
// ===========================================================================

export const DEEPEN_SECTION_PROMPT = `Deepen this thin section of a research report.

Research topic: {query}
Section heading: {section_heading}

Current section content ({current_chars} chars):
{current_content}

Relevant evidence from sub-agent reports:
{evidence}

Requirements:
1. Expand to at least 800 words of analytical prose
2. Explain the underlying MECHANISMS — how does this actually work?
3. Establish CAUSAL CHAINS — why does it behave this way under different conditions?
4. Include QUANTITATIVE evidence — specific numbers, dates, benchmarks
5. Discuss LIMITATIONS and OPEN DEBATES — what do researchers disagree on?
6. Preserve ALL existing [src: <url>] citations; add more from the evidence as needed
7. Use ### sub-headings inside the section to organize distinct themes, mechanisms, or sub-topics. Do NOT flatten everything into a single block of text
8. Output language: {language}
9. Output ONLY the expanded section content INCLUDING its heading line. Do not add preamble or commentary

The heading must be exactly: ## {section_heading}`;

// ===========================================================================
// Extract claims
// ===========================================================================

export const EXTRACT_CLAIMS_SYSTEM_PROMPT = `You extract verifiable factual claims from research-report sections. You ignore opinions, transitions, and meta-commentary.`;

export const EXTRACT_CLAIMS_PROMPT = `Extract individual factual claims from the following text section.
A claim is a single, verifiable statement that could be checked against a source.
Return a JSON array of strings, each being one claim.
Do NOT extract opinions, transitions, or meta-commentary.
Return ONLY the JSON array, no other text.

Section: {section_heading}
Text: {section_text}`;

// ===========================================================================
// Source evaluation (used in batch 3)
// ===========================================================================

export const SOURCE_EVALUATE_PROMPT = `You are a Principal Research Evaluator. Rate each candidate source and decide whether it is worth fetching the full text.

Subtask context: {subtask_instruction}

Scoring (per source):
- relevance to subtask (0–5)
- authority (0–3): prefer .edu, .gov, official docs, academic papers, well-known publishers
- information density (0–2): avoid SEO farms, "Top 10" listicles, marketing/clickbait

For https://doc.coki/ sources (user-uploaded documents): treat as high-authority primary material. Base authority on content professionalism (medical papers, technical manuals, research reports = high; random notes = medium). Do not downgrade document sources merely because they lack a public domain.

Normalize the composite to 0.0–1.0. Set full_text=true ONLY when the snippet suggests deep, citation-worthy content.

Candidate sources:
{sources}

Return JSON. Each "reason" MUST be ≤ 50 characters (one short phrase, no full sentences) — keeping reasons short is REQUIRED to fit the response budget. Output language for reasons: same as the subtask language.

{
  "evaluations": [
    {
      "url": "<exact url>",
      "normalized_score": 0.0,
      "full_text": false,
      "reason": "<≤50 chars>"
    }
  ]
}

Select at most 4 sources for full_text=true. Output ONLY the JSON, no prose before or after.`;
