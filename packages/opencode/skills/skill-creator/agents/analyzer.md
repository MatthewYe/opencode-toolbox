# Post-hoc Analyzer Agent

Analyze blind comparison results to understand WHY the winner won and generate improvement suggestions.

## Role

After the blind comparator determines a winner, the Post-hoc Analyzer "unblinds" the results by examining the skills and transcripts. The goal is to extract actionable insights: what made the winner better, and how can the loser be improved?

## Inputs

- **winner**: "A" or "B" (from blind comparison)
- **winner_skill_path**: Path to the winning skill
- **winner_transcript_path**: Path to the winner's transcript
- **loser_skill_path**: Path to the losing skill
- **loser_transcript_path**: Path to the loser's transcript
- **comparison_result_path**: Path to the comparator's output JSON
- **output_path**: Where to save the analysis results

## Process

### Step 1: Read Comparison Result
Note who won, the reasoning, and scores.

### Step 2: Read Both Skills
Identify structural differences: instructions clarity, script/tool usage, example coverage, edge case handling.

### Step 3: Read Both Transcripts
Compare execution patterns: how closely did each follow their skill's instructions? What tools were used differently? Where did the loser diverge?

### Step 4: Analyze Instruction Following
For each transcript, score instruction following 1-10. Did the agent follow explicit instructions? Use provided tools/scripts? Miss opportunities? Add unnecessary steps?

### Step 5: Identify Winner Strengths
Determine what made the winner better. Be specific. Quote from skills/transcripts.

### Step 6: Identify Loser Weaknesses
Determine what held the loser back. Ambiguous instructions? Missing tools? Edge case gaps?

### Step 7: Generate Improvement Suggestions
Produce actionable suggestions prioritized by impact. Categories: `instructions`, `tools`, `examples`, `error_handling`, `structure`, `references`. Priority levels: `high`, `medium`, `low`.

## Output Format

```json
{
  "comparison_summary": {
    "winner": "A",
    "winner_skill": "path/to/winner/skill",
    "loser_skill": "path/to/loser/skill",
    "comparator_reasoning": "Brief summary"
  },
  "winner_strengths": [
    "Clear step-by-step instructions for handling multi-page documents",
    "Included validation script that caught formatting errors"
  ],
  "loser_weaknesses": [
    "Vague instruction 'process the document appropriately' led to inconsistent behavior",
    "No script for validation, agent had to improvise"
  ],
  "instruction_following": {
    "winner": { "score": 9, "issues": ["Minor: skipped optional logging step"] },
    "loser": { "score": 6, "issues": ["Did not use the skill's formatting template"] }
  },
  "improvement_suggestions": [
    {
      "priority": "high",
      "category": "instructions",
      "suggestion": "Replace 'process the document appropriately' with explicit steps",
      "expected_impact": "Would eliminate ambiguity that caused inconsistent behavior"
    }
  ],
  "transcript_insights": {
    "winner_execution_pattern": "Read skill -> Followed 5-step process -> Used validation script",
    "loser_execution_pattern": "Read skill -> Unclear on approach -> Tried 3 different methods"
  }
}
```

---

# Analyzing Benchmark Results

## Role

Review all benchmark run results and generate freeform notes that help understand skill performance. Focus on patterns that wouldn't be visible from aggregate metrics alone.

## Process

### Step 1: Read Benchmark Data
Read benchmark.json containing all run results. Note configurations and aggregates.

### Step 2: Analyze Per-Assertion Patterns
For each expectation across all runs:
- Does it **always pass** in both configurations? (may not differentiate skill value)
- Does it **always fail** in both configurations? (may be broken)
- Does it **always pass with skill but fail without**? (skill adds value here)
- Does it **always fail with skill but pass without**? (skill may be hurting)
- Is it **highly variable**? (flaky or non-deterministic)

### Step 3: Analyze Cross-Eval Patterns
Are certain eval types consistently harder/easier? Any surprising results?

### Step 4: Analyze Metrics Patterns
Does the skill significantly increase execution time? High variance? Outlier runs?

### Step 5: Generate Notes
Write freeform observations as a JSON array of strings. Each note should be specific, grounded in data, and surface something aggregate metrics don't show.

## Output Format

```json
[
  "Assertion 'Output is a PDF file' passes 100% in both configurations - may not differentiate skill value",
  "Eval 3 shows high variance (50% ± 40%) - run 2 had an unusual failure",
  "Without-skill runs consistently fail on table extraction expectations (0% pass rate)",
  "Skill adds 13s average execution time but improves pass rate by 50%"
]
```

## Guidelines

**DO:**
- Report what you observe in the data
- Be specific about which evals, expectations, or runs
- Note patterns that aggregate metrics would hide

**DO NOT:**
- Suggest improvements to the skill (that's for the improvement step)
- Make subjective quality judgments
- Speculate about causes without evidence
- Repeat information already in the run_summary aggregates
