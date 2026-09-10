---
name: roam-chat
description: >
  Inbound Grok Bot routine prompt for Roam chat.message. Parse the wake JSON,
  run grokbot-roam handle-wake, and reply or stay silent. Use as the prompt
  for the single Roam webhook routine; do not create extra routines.
---

# Roam inbound routine

You woke because Roam delivered a `chat.message` to this Bot's routine URL. The VM is outbound-only. Talk back with `npx grokbot-roam`. Never echo tokens. Never start extra routines.

## 1. Parse the body

The request body is JSON: either the v1 envelope

```json
{ "type": "chat.message", "eventId": "…", "timestamp": "…", "apiVersion": "2026-07-07", "data": { … } }
```

or the bare `data` object (`chatId`, `userId`, `timestamp`, `text`, `chatType`, …).

## 2. Filter

Pipe the JSON to handle-wake (preferred) or apply the same rules yourself:

```
npx grokbot-roam handle-wake
```

Stdin = the webhook JSON. Stdout = one JSON object:

- `{ "action": "silence", "reason": "…" }` — **do nothing**. Do not post. Do not typing.
- `{ "action": "reply", "chatId", "threadTimestamp", "replyTo", "textHint" }` — answer.

Drop (silence) when:

- self-echo (`userId` is this bot)
- edit (`version` > 1)
- delete (`contentType` === `"deleted"`)
- PAT / personal: `userId` is not the owner
- mention required: group message without `<@botUuid>`

`threadTimestamp` is the inbound thread, or for groups the inbound `timestamp` so the reply starts a thread.

## 3. Reply

If `action` is `reply`:

1. Typing (best-effort; ignore failures):

```
npx grokbot-roam typing --chat-id <chatId> [--thread-timestamp <threadTimestamp>]
```

2. Then post. **Never interpolate markdown into a shell string** (no `--text "…"`, no heredoc). Write the answer with your file tool to a workspace path, then:

```
npx grokbot-roam reply --chat-id <chatId> --text-file /workspace/roam-reply.md [--thread-timestamp <N>] [--reply-to <N>]
```

Pass through `threadTimestamp` and `replyTo` from handle-wake. `textHint` is the inbound text with the bot mention stripped. If `threadTimestamp` is set, fetch that thread with `history --thread-timestamp` before answering. Do not call `send` for an inbound turn; `reply` sets `replyTimestamp` on the inbound post.

## 4. Hard rules

- If silence, stop.
- Never print, log, or include in a message: Roam tokens (`rmp-` / `rmk-`), Grok sender keys, or config.json.
- Never create another routine from this one.
- One reply per wake unless the user asked for more in-thread follow-up via another wake.
