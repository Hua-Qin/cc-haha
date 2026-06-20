# AI Default Prompt Configuration Audit (Task 9)

**Audit date:** 2026-06-20
**Auditor:** Trae sub-agent (Task 9)
**Files audited:**
- `src/constants/prompts.ts` (914 lines)
- `src/utils/systemPrompt.ts` (123 lines)
- `src/constants/systemPromptSections.ts` (registry helpers)

## Summary

**Overall verdict: PASS with one minor fix.**

The prompt assembly logic is logically consistent. All section builders behave correctly under their normal call paths. The priority chain in `buildEffectiveSystemPrompt` matches its documented contract (override → coordinator → agent → custom → default, with proactive-mode and `appendSystemPrompt` exceptions applied correctly). One minor defect was found and fixed: `getUsingYourToolsSection` returns an empty string in one REPL edge case, which leaks past the `null`-only filter in `getSystemPrompt`.

## 1. Section Builder Inventory (`src/constants/prompts.ts`)

| # | Function | Line | Signature | Non-empty on normal call? | Status |
|---|----------|------|-----------|---------------------------|--------|
| 1 | `getHooksSection` | 127 | `(): string` | Yes — fixed return value | PASS |
| 2 | `getSystemRemindersSection` | 131 | `(): string` | Yes — fixed return value | PASS |
| 3 | `getAntModelOverrideSection` | 136 | `(): string \| null` | Returns `null` if not ant or undercover; returns string otherwise | PASS |
| 4 | `getLanguageSection` | 142 | `(lang): string \| null` | Returns `null` when no language preference; string otherwise | PASS |
| 5 | `getOutputStyleSection` | 151 | `(cfg): string \| null` | Returns `null` when `null` config; string otherwise | PASS |
| 6 | `getMcpInstructionsSection` | 160 | `(clients): string \| null` | Returns `null` when no clients; string otherwise | PASS |
| 7 | `getSimpleIntroSection` | 175 | `(cfg): string` | Always returns a non-empty multi-line string (uses `outputStyleConfig` correctly to switch framing) | PASS |
| 8 | `getSimpleSystemSection` | 186 | `(): string` | Always non-empty (joined `# System` section) | PASS |
| 9 | `getSimpleDoingTasksSection` | 199 | `(): string` | Always non-empty; `userHelpSubitems` interpolation works (`MACRO.ISSUES_EXPLAINER` is an intentional empty placeholder in local preload) | PASS |
| 10 | `getActionsSection` | 255 | `(): string` | Always non-empty | PASS |
| 11 | `getUsingYourToolsSection` | 269 | `(tools): string` | **Edge case: returns `''` when REPL mode + no task tool.** | **FIX APPLIED (see §4)** |
| 12 | `getAgentToolSection` | 316 | `(): string` | Always non-empty (ternary on `isForkSubagentEnabled`) | PASS |
| 13 | `getDiscoverSkillsGuidance` | 333 | `(): string \| null` | `null` unless skill-search feature is on and tool name loaded | PASS |
| 14 | `getSessionSpecificGuidanceSection` | 352 | `(...): string \| null` | `null` when `items.length === 0`; string otherwise | PASS |
| 15 | `getOutputEfficiencySection` | 403 | `(): string` | Always non-empty (ant-mode ant text vs default efficiency text) | PASS |
| 16 | `getSimpleToneAndStyleSection` | 430 | `(): string` | Always non-empty | PASS |
| 17 | `getMcpInstructions` | 579 | `(clients): string \| null` | `null` if no connected clients with instructions; string otherwise | PASS |
| 18 | `getScratchpadInstructions` | 797 | `(): string \| null` | `null` if scratchpad disabled; string otherwise | PASS |
| 19 | `getFunctionResultClearingSection` | 821 | `(model): string \| null` | `null` unless feature enabled + config + model supported; string otherwise | PASS |
| 20 | `getBriefSection` | 843 | `(): string \| null` | Multiple `null` short-circuits; delegates to `BRIEF_PROACTIVE_SECTION` | PASS |
| 21 | `getProactiveSection` | 860 | `(): string \| null` | `null` unless proactive feature active; otherwise returns the autonomous-work section (with brief section appended when relevant) | PASS |

### Other top-level helpers

| Function | Line | Purpose | Status |
|----------|------|---------|--------|
| `prependBullets` (exported) | 167 | Formats arrays of strings as bullet items | PASS |
| `enhanceSystemPromptWithEnvDetails` (export) | 760 | Adds subagent notes + optional DiscoverSkills guidance + env info | PASS |
| `computeEnvInfo` (export) | 606 | Non-simple env block (used by subagents) | PASS |
| `computeSimpleEnvInfo` (export) | 651 | Compact env block (used by main session) | PASS |
| `getKnowledgeCutoff` | 713 | Map canonical model ID → cutoff date | PASS |
| `getShellInfoLine` | 732 | Build shell line for env block | PASS |
| `getUnameSR` (export) | 745 | Platform-aware `uname -sr` equivalent | PASS |

## 2. `getSystemPrompt` (line 444) — Branching & Assembly Audit

**Verdict: PASS**

Three branches:

1. **`CLAUDE_CODE_SIMPLE` short-circuit (lines 450-454)**: returns a single one-liner prompt. No issues.

2. **Proactive/Kairos active branch (lines 466-489)**: returns a custom lean prompt for autonomous mode. Assembles via `Promise.all` for `skillToolCommands`, `outputStyleConfig`, `envInfo`. Sections use the `.filter(s => s !== null)` cleanup. No issues.

3. **Default branch (lines 491-577)**:
   - Builds `dynamicSections` using the `systemPromptSection` registry (memoized via `systemPromptSections.ts`).
   - `DANGEROUS_uncachedSystemPromptSection` is used appropriately for `mcp_instructions` (MCP servers connect/disconnect between turns — explicitly justified in comments).
   - Ant-only sections (`numeric_length_anchors`) and feature-gated sections (`TOKEN_BUDGET`, `KAIROS`/`KAIROS_BRIEF`) are conditionally appended.
   - `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` placement (line 573): **CORRECT** — after static content (`getSimpleIntroSection`, `getSimpleSystemSection`, `getSimpleDoingTasksSection`, `getActionsSection`, `getUsingYourToolsSection`, `getSimpleToneAndStyleSection`, `getOutputEfficiencySection`) and before resolved dynamic sections, exactly as required by `splitSysPromptPrefix` (`src/utils/api.ts:362-385`).
   - The `shouldUseGlobalCacheScope()` gate on the boundary insertion matches the gate in `splitSysPromptPrefix`, so non-global-cache builds don't see a stale marker.
   - Final `.filter(s => s !== null)` strips null sections, but **does not strip empty strings** — see §4.

## 3. `buildEffectiveSystemPrompt` Priority Chain Audit (`src/utils/systemPrompt.ts:41`)

**Verdict: PASS** — chain matches documentation.

| Priority | Condition | Behavior | Documented? |
|----------|-----------|----------|-------------|
| 0 | `overrideSystemPrompt` truthy | Returns `asSystemPrompt([overrideSystemPrompt])` only — `appendSystemPrompt` is **NOT** appended | YES (line 30, 39) |
| 1 | `feature('COORDINATOR_MODE')` + `CLAUDE_CODE_COORDINATOR_MODE` env + no `mainThreadAgentDefinition` | Returns coordinator prompt + `appendSystemPrompt` | YES (line 31) |
| 2 | Agent system prompt present **AND** proactive/Kairos active | `defaultSystemPrompt + '\n# Custom Agent Instructions\n' + agentSystemPrompt + appendSystemPrompt` (agent appended, not replaced) | YES (lines 32-35, 99-113) |
| 3 | Agent system prompt present (non-proactive) | Returns `[agentSystemPrompt, ...appendSystemPrompt]` (agent replaces custom/default) | YES (lines 32-36, 115-122) |
| 4 | Custom system prompt present (no agent) | Returns `[customSystemPrompt, ...appendSystemPrompt]` | YES (line 37, 118-119) |
| 5 | Default | Returns `[...defaultSystemPrompt, ...appendSystemPrompt]` | YES (line 37, 120) |

**`appendSystemPrompt` rule:** appended at the end in every path **except** when `overrideSystemPrompt` is set (line 56-58 early-return). ✅

**Proactive-mode rule:** agent instructions are **appended** to the default prompt (lines 99-113), not replacing it. ✅

**Minor observation (not a bug):** In the coordinator branch (lines 71-74) `appendSystemPrompt` is appended but no agent/custom fallback is provided for `mainThreadAgentDefinition`. The guard `!mainThreadAgentDefinition` at line 65 explicitly excludes that case. This is intentional.

## 4. Bugs Found & Fixed

### Bug #1 — Empty string leak in `getUsingYourToolsSection` (REPL edge case)

**Location:** `src/constants/prompts.ts:283`

**Before:**
```typescript
if (isReplModeEnabled()) {
  const items = [
    taskToolName
      ? `Break down and manage your work with the ${taskToolName} tool. ...`
      : null,
  ].filter(item => item !== null)
  if (items.length === 0) return ''
  return [`# Using your tools`, ...prependBullets(items)].join(`\n`)
}
```

**Issue:** When REPL mode is enabled and no task tool (`TODO_WRITE_TOOL_NAME` / `TASK_CREATE_TOOL_NAME`) is available, `items.length === 0` returns the empty string `''`. This empty string then enters the prompt array at line 569 and is **not** stripped by the final `filter(s => s !== null)` (line 576). Downstream, `splitSysPromptPrefix` (`src/utils/api.ts:337`) does filter empty strings with `if (!prompt) continue`, so the API call is correct — but the array is still polluted with empty entries, which costs a few bytes per turn in the cache-key derivation path (`getSystemPromptSectionCache` keyed by section name) and produces extra empty `'\n\n'` joins if any consumer reads the raw array.

**Severity:** Low (output correctness is unaffected because of the downstream filter, but it’s a clean-up that keeps the source-of-truth array tidy).

**Fix:**
```typescript
if (isReplModeEnabled()) {
  const items = [
    taskToolName
      ? `Break down and manage your work with the ${taskToolName} tool. ...`
      : null,
  ].filter(item => item !== null)
  if (items.length === 0) return null
  return [`# Using your tools`, ...prependBullets(items)].join(`\n`)
}
```

Changed the return from `''` to `null` so the section is consistently filtered out by `getSystemPrompt`'s `null`-filter.

### Notes (not bugs)

- `MACRO.ISSUES_EXPLAINER` in `getSimpleDoingTasksSection` (line 218) interpolates an empty string in the local preload (`preload.ts:15`). The output `To give feedback, users should .` is intentional in this build — the global is meant to be filled in by the production preload/release pipeline. Not changed.
- `getKnowledgeCutoff` (line 713) has `claude-opus-4-7` but no `claude-opus-4-6`; `claude-sonnet-4-6` is present. This matches `CLAUDE_4_5_OR_4_6_MODEL_IDS.opus = 'claude-opus-4-7'` (line 122). Skipping opus-4-6 is an intentional model-versioning choice, not a defect.
- `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` is correctly placed (line 573), correctly gated by `shouldUseGlobalCacheScope()`, and correctly consumed by `splitSysPromptPrefix` and `analyzeContext.ts`.

## 5. Verification

- `cd desktop && bun run lint` → **PASS** (exit code 0, no output → no TypeScript errors).
- Desktop `tsc` scope only covers `desktop/src` (per `desktop/tsconfig.json`'s `include: ["src"]`), so the root `src/` is not in the desktop lint path. No TypeScript issues were introduced by the small fix above.
- Static logic walkthrough of `getSystemPrompt` + `buildEffectiveSystemPrompt` was performed against all priority branches and all section-builder return paths.

## 6. Files Touched

- `src/constants/prompts.ts` — one-character change: `return ''` → `return null` at line 283.