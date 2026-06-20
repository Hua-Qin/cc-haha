# Task 10 — Audit & Enhance Thinking Process Visualization

**Spec:** `enhance-prompt-skill-command-providers`
**Date:** 2026-06-20
**Scope:** `desktop/src/components/chat/{ThinkingBlock,StreamingIndicator,MessageList}.tsx` plus all `{ type: 'thinking'; text }` streaming-event emission sites.

## TL;DR

- `ThinkingBlock` correctly accepts `content` / `isActive`, streams via `MarkdownRenderer` while active, and renders the blinking cursor + animated dots. No rendering issues.
- `StreamingIndicator` shows the "thinking" pill only when `chatState === 'thinking'` AND `!activeThinkingId`. The pill vanishes the moment the first thinking delta lands (which sets `activeThinkingId`). No issue with the pill lingering.
- `MessageList.tsx` correctly renders thinking messages via `<ThinkingBlock content={…} isActive={message.id === activeThinkingId} />` (line 2132) and the StreamingIndicator (line 2022–2024) is gated by the same `chatState`/`activeThinkingId` predicate.
- The thinking-event flow is driven by **one** live-streaming emission site (`chatStore.ts:1721–1748` handling `case 'thinking'`) and **one** history-loader emission site (`chatStore.ts:3176` for past turns). No stray or duplicated emitters were found.
- No code path silently drops or suppresses the `thinking` event. The only transitions that temporarily reset `activeThinkingId` to `null` while `chatState === 'thinking'` are `api_retry` (1641) and `streaming_fallback` (1658) — both are explicit and re-enter `thinking` once a delta arrives.
- **No code changes were required.** Lint check `cd desktop && bun run lint` was not run because no code changes were made; the task description says "If issues are found … fix them. After fixing, run `cd desktop && bun run lint`". Since no fixes were made, the conditional step is skipped.

---

## 1. `ThinkingBlock.tsx` audit

File: `desktop/src/components/chat/ThinkingBlock.tsx`

| Requirement | Status | Evidence |
|---|---|---|
| Accepts `content` prop | ✅ | `function ThinkingBlock({ content, isActive = false }: { content: string; isActive?: boolean })` (line 5) |
| Accepts `isActive` prop | ✅ | Same signature; `isActive` defaults to `false` |
| Streams content via `MarkdownRenderer` while active | ✅ | `streaming={isActive}` and `cache={!isActive}` passed to `<MarkdownRenderer />` (lines 41–47) |
| Blinking cursor present | ✅ | `<span className="thinking-cursor" />` rendered inside the expanded panel when `isActive` (line 48); CSS animation `thinking-cursor-blink` (line 56) |
| Animated dots present | ✅ | `<span className="thinking-dots" />` rendered next to the label when `isActive` (line 32); CSS animation `thinking-dots` (line 60) |
| Auto-scrolls while streaming | ✅ | `useEffect` (lines 12–16) calls `scrollTop = scrollHeight` whenever `displayContent`, `expanded`, or `isActive` change |
| Collapsed by default | ✅ | `useState(false)` (line 7) |

### Notes / minor observations

- The body is hidden until `expanded` is true *and* there is display content (`{expanded && hasDisplayContent && …}` on line 35). When `isActive` and the user has not clicked the header, the cursor + dots are not visible. This is **intentional** — the user opts into seeing the raw text — and matches the CLI's collapsible behavior. The header pill (with the dotted spinner) is always visible when `isActive`, so the user is never left without feedback.
- The collapse caret is `\u25BE` / `\u25B8` (down / right triangle). The expanded panel uses `max-h-[300px] overflow-y-auto` and auto-scrolls to the bottom while active. No layout issues observed.
- `displayContent` strips trailing whitespace so the cursor sits flush at the end. No rendering issues.

**Verdict:** `ThinkingBlock` is correct as-is. No changes needed.

---

## 2. `StreamingIndicator.tsx` audit

File: `desktop/src/components/chat/StreamingIndicator.tsx`

The component has three render branches:

1. `apiRetry` — amber retry banner (lines 56–90)
2. `streamingFallback` — neutral fallback pill (lines 92–116)
3. **Default pill** — the "thinking" pill (lines 118–146)

The default pill is what the task is asking about. It chooses a verb based on `statusVerb` (server-provided) and falls back to a state-derived verb:

```ts
// lines 119-129
let verb: string
if (statusVerb) {
  verb = translateServerVerb(t, statusVerb)
} else {
  verb = chatState === 'thinking'
    ? t('serverVerb.Thinking')
    : chatState === 'compacting'
      ? t('serverVerb.Compacting conversation')
      : chatState === 'tool_executing'
        ? t('serverVerb.Running')
        : t('serverVerb.Working')
}
```

| Requirement | Status | Evidence |
|---|---|---|
| Only shows the "thinking" pill when `chatState === 'thinking'` AND no `activeThinkingId` | ✅ (gating) | The pill render itself is **not** gated by state in this component — it is unconditionally rendered when neither `apiRetry` nor `streamingFallback` is active. The conditional gating lives in `MessageList.tsx` (line 2022): `(chatState === 'tool_executing' || (chatState === 'thinking' && !activeThinkingId))` |
| Transitions to ThinkingBlock once thinking deltas arrive | ✅ | The first `case 'thinking'` event in `chatStore.ts` (line 1743) sets `activeThinkingId` to the new thinking message's id, which causes the `MessageList` gate to drop the indicator. The existing `ThinkingBlock` then renders the streamed content. |

### Why the indicator can vanish at the right moment

The transition chain is:

1. User sends a message → `chatState = 'thinking'`, `activeThinkingId = null` (chatStore.ts:1055).
2. `MessageList` sees `chatState === 'thinking' && !activeThinkingId` → renders `<StreamingIndicator />` showing the "thinking" pill.
3. The CLI streams a `thinking` event. `chatStore.ts:1741` appends a new `{ type: 'thinking', content }` message and sets `activeThinkingId` to that message's id.
4. On the next render, `MessageList` sees `activeThinkingId != null` → the indicator gate (line 2022) returns false, **and** the new thinking message is rendered via `<ThinkingBlock content=… isActive={true} />` (line 2132).
5. The `useEffect` in `ThinkingBlock` (lines 12–16) auto-scrolls the panel to the bottom for each new delta, and the blinking cursor + dots render until the next state transition (e.g. `content_delta` or `tool_use_complete`).

**Verdict:** `StreamingIndicator` is correct. The "thinking" pill is suppressed as soon as the first delta lands. No change needed.

---

## 3. `MessageList.tsx` audit

File: `desktop/src/components/chat/MessageList.tsx`

### 3a. StreamingIndicator placement — line 2018–2024

```tsx
{/* Show StreamingIndicator when:
    - tool_executing: background work is running
    - thinking but no active ThinkingBlock yet: the gap between
      sending a message and receiving the first thinking delta */}
{(chatState === 'tool_executing' || (chatState === 'thinking' && !activeThinkingId)) && (
  <StreamingIndicator />
)}
```

The comment is accurate: the indicator is shown during the pre-delta gap (when `chatState` is already `thinking` but the first thinking message has not yet been appended) and during tool execution. As soon as `activeThinkingId` is set, the condition evaluates to false and the indicator is removed.

### 3b. ThinkingBlock placement — line 2131–2132

```tsx
case 'thinking':
  return <ThinkingBlock content={message.content} isActive={message.id === activeThinkingId} />
```

This is inside `MessageBlock` (memoized, line 2074), which receives `activeThinkingId` from the parent at line 1942. So as soon as the first thinking message is appended, the matching `ThinkingBlock` mounts with `isActive={true}` and starts streaming.

### 3c. Other related state — line 1353, 1364

`activeThinkingId` is read from the session state (line 1353). It is also used to decide whether the content-resize observer should keep the scroller pinned (line 1364), which is a sibling concern but confirms that the store field is the canonical signal for "thinking in progress".

### 3d. Virtualization considerations

The `ThinkingBlock` participates in the virtual render list via the same `RenderItem`/`MessageBlock` plumbing. The `estimateMessageHeight` switch (line 1119) reserves 88 px for `thinking` messages, which is consistent with the collapsed-block default. Virtualization is measured via `ResizeObserver` per item, so the expanding panel does not require layout-thrash handling here. No issues.

**Verdict:** The render logic in `MessageList.tsx` correctly handles the streaming→block transition.

---

## 4. Emission sites for `{ type: 'thinking'; text }` streaming events

Searched the entire `desktop/src` tree for `type: 'thinking'`, `case 'thinking'`, and related token forms. Excluding tests, fixtures, and the unrelated `TraceContentBlock` (which uses a different `thinking` namespace for Anthropic SSE content blocks), the **live-streaming** emission sites are:

### 4.1 `chatStore.ts:1721–1748` — live streaming event handler (the canonical path)

```ts
case 'thinking':
  update((s) => {
    const pendingText = `${s.streamingText}${consumePendingDelta(sessionId)}`
    const base = pendingText.trim()
      ? appendAssistantTextMessage(s.messages, pendingText, Date.now())
      : s.messages
    const last = base[base.length - 1]
    if (last && last.type === 'thinking') {
      const updated = [...base]
      updated[updated.length - 1] = { ...last, content: last.content + msg.text }
      return {
        messages: updated,
        chatState: 'thinking',
        activeThinkingId: last.id,
        streamingText: '',
        streamingResponseChars: s.streamingResponseChars + msg.text.length,
      }
    }
    const id = nextId()
    return {
      messages: [...base, { id, type: 'thinking', content: msg.text, timestamp: Date.now() }],
      chatState: 'thinking',
      activeThinkingId: id,
      streamingText: '',
      streamingResponseChars: s.streamingResponseChars + msg.text.length,
    }
  })
  break
```

Notes:
- If the last message is already a `thinking` block, the new delta is **appended to its `content`** — this is what makes the streaming/incremental rendering work; the same `message.id` stays as `activeThinkingId`, so the existing `ThinkingBlock` keeps streaming.
- If there is no tail thinking message, a new one is created with a fresh `id` and that id becomes `activeThinkingId`.
- `streamingText` is reset to `''` after a thinking block is opened so subsequent `content_delta` events start a fresh `AssistantMessage` rather than tainting the thinking content.

### 4.2 `chatStore.ts:3176` — history loader (replays past turns, not live)

```ts
if (block.type === 'thinking' && block.thinking) uiMessages.push({ id: nextId(), type: 'thinking', content: block.thinking, timestamp })
```

This is the only place where past turns (loaded from history/transcript) construct a `thinking` UI message. It does **not** set `activeThinkingId` — correctly so, because history is not live. The resulting message is rendered with `isActive={false}` (no `activeThinkingId` match), so the cursor/dots are absent and the label reads "Thought" (or `thinking.labelDone`).

### 4.3 Other `chatState: 'thinking'` setters (not thinking events, but related)

These do not emit `{ type: 'thinking'; text }` events, but they do drive `chatState` transitions that interact with the indicator:

- `chatStore.ts:1055` — `sendMessage` sets `chatState: 'thinking'` on initial send.
- `chatStore.ts:1641` — `api_retry` preserves the running chatState (sets to `'thinking'` if previously idle). Sets `activeThinkingId: null`. The indicator reappears briefly.
- `chatStore.ts:1658` — `streaming_fallback` same idea as `api_retry`. Sets `activeThinkingId: null`.
- `chatStore.ts:1733` — `case 'thinking'` itself sets `chatState: 'thinking'`.
- `chatStore.ts:1809` — `case 'tool_result'` sets `chatState: 'thinking'` (the post-tool "thinking about what to do next" phase). Sets `activeThinkingId: null` so the indicator reappears until the next thinking event arrives.
- `chatStore.ts:2054` — `compact_boundary` flips a `compacting` session back to `'thinking'`.

These are **state transitions**, not event emissions. They are all benign with respect to the `StreamingIndicator` gate.

### 4.4 Sibling `thinking` namespaces (not the same as the streaming event)

For completeness, the codebase has two other `type: 'thinking'` namespaces that should not be confused with the streaming event:

- `desktop/src/lib/trace/types.ts:3` — `TraceContentBlock` for the request-trace detail panel (Anthropic-style content blocks). This is purely a trace/inspection type, not rendered in the chat.
- `desktop/src/lib/trace/sse.ts:140, 250, 347, 349` — same trace namespace. Unrelated to the chat UI.

These do not affect `StreamingIndicator` or `ThinkingBlock`.

---

## 5. Issues found

**None.** The thinking-process visualization is wired correctly end-to-end:

1. `ThinkingBlock` renders properly with streaming cursor + animated dots.
2. `StreamingIndicator` is suppressed as soon as the first thinking delta lands and `activeThinkingId` is set.
3. `MessageList` routes thinking messages to `ThinkingBlock` and gates the indicator with the correct predicate.
4. All thinking-event emission paths were catalogued and behave as expected.

No code changes were made; the conditional lint step does not apply.

## 6. Lint check

N/A — no code changes made. If a follow-up task requires lint, run from the repo root:

```bash
cd desktop && bun run lint
```
