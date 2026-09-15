---
name: roam-chat
description: >
  Inbound Grok Bot routine prompt for Roam chat.message. Parse the wake JSON,
  run grokbot-roam handle-wake, and reply or stay silent. Use as the prompt
  for the single Roam webhook routine; do not create extra routines.
---

# Roam inbound routine

You woke because Roam delivered a `chat.message` to this Bot's routine URL. The VM is outbound-only. Talk back with `npx @roamhq/grokbot`. Never echo tokens. Never start extra routines.

## 1. Parse the body

The request body is JSON: either the v1 envelope

```json
{ "type": "chat.message", "eventId": "…", "timestamp": "…", "apiVersion": "2026-07-07", "data": { … } }
```

or the bare `data` object (`chatId`, `userId`, `timestamp`, `text`, `chatType`, …).

## 2. Filter

Pipe the JSON to handle-wake (preferred) or apply the same rules yourself:

```
npx @roamhq/grokbot handle-wake --download-dir /workspace/roam-in/<timestamp>
```

Stdin = the webhook JSON. Stdout = one JSON object:

- `{ "action": "silence", "reason": "…" }` — **do nothing**. Do not post. Do not typing.
- `{ "action": "reply", "chatId", "threadTimestamp", "replyTo", "textHint", "items?" }` — answer.

Drop (silence) when:

- self-echo (`userId` is this bot)
- edit (`version` > 1)
- delete (`contentType` === `"deleted"`)
- PAT / personal: `userId` is not the owner
- mention required: group message without `<@botUuid>`

`threadTimestamp` is the inbound thread, or for groups the inbound `timestamp` so the reply starts a thread.

The webhook body is the **new** message. This routine conversation may already contain earlier wakes for the same chat. Do **not** fetch `chat.history` on every back-and-forth — that pastes the same transcript again and grows as n^2.

- First wake for this `chatId` in this session (or you are not sure): fetch once

```
npx @roamhq/grokbot history --chat-id <chatId> [--thread-timestamp <threadTimestamp>]
```

- Later wakes for the same `chatId`: use the new message plus what you already have. Do not call `history` again.

## 3. Reply

If `action` is `reply`:

1. Typing (best-effort; ignore failures):

```
npx @roamhq/grokbot typing --chat-id <chatId> [--thread-timestamp <threadTimestamp>]
```

2. Then post. **Never interpolate markdown into a shell string** (no `--text "…"`, no heredoc). Write the answer with your file tool to a workspace path, then:

```
npx @roamhq/grokbot reply --chat-id <chatId> --text-file /workspace/roam-reply.md [--thread-timestamp <N>] [--reply-to <N>]
```

Pass through `threadTimestamp` and `replyTo` from handle-wake. `textHint` is the inbound text with the bot mention stripped — it may be empty if the user only sent a file. If `items` is present, open each `localPath` (look at photos; read blobs) before answering.

To send an image or file back: write it to disk, then:

```
npx @roamhq/grokbot upload --file /workspace/out.png
npx @roamhq/grokbot reply --chat-id <chatId> --text-file /workspace/roam-reply.md --asset-id <assetId> [--thread-timestamp <N>] [--reply-to <N>]
```

`upload` prints `{ "assetId": "…" }`. Repeat `--asset-id` for multiple files. Caption via `--text-file` may be omitted only when there is at least one `--asset-id`. Do not call `send` for an inbound turn; `reply` sets `replyTimestamp` on the inbound post.

## 4. Meetings and reactions (Roam MCP, not grokbot-roam)

The roam MCP server was added at connect (`https://api.ro.am/mcp`, same token). Use those tools from this routine. Do not curl the Roam API. Do not add meeting or reaction flags to grokbot-roam.

- Meetings / transcripts / "what did we decide": `meeting_search`, `meeting_info`, `meeting_transcript`, `meeting_prompt`.
- Add, list, or remove an emoji reaction: `reaction_add`, `reaction_list`, `reaction_remove`. Never post a reaction as a chat message.

If those tools are missing, add the custom MCP server again with header `Authorization: Bearer <token>` (the token already in grokbot-roam config — secret-request, never echo).

## 5. Hard rules

- If silence, stop.
- Never print, log, or include in a message: Roam tokens (`rmp-` / `rmk-`), Grok sender keys, or config.json.
- Never create another routine from this one.
- One reply per wake unless the user asked for more in-thread follow-up via another wake.
