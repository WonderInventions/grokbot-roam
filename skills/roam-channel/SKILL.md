---
name: roam-channel
description: >
  Install and configure the Roam HQ channel for this Grok Bot so people can
  DM or @mention the bot inside Roam chat. Use when the user wants to connect
  Roam, set up a Roam webhook routine, subscribe chat.message, or run
  grokbot-roam configure/status/subscribe.
---

# Roam HQ channel (installer)

Two hops, no ngrok. Grok Bot's VM is outbound-only.

1. **Roam appserver** delivers `chat.message` to this Bot's **routine URL**.
2. The woken Bot calls `npx @roamhq/grokbot` to filter the event and reply via the Roam API.

Never start a public HTTP webhook server. Never echo tokens, PATs, API keys, or Grok sender keys.

## 1. Secret-request a Roam token

Ask the operator for **one** of:

| Token | Prefix | Kind |
|-------|--------|------|
| Personal access token | `rmp-` | PAT. Posts as a persona. Only the owner may talk to the bot. |
| Organization API key | `rmk-` | Org bot. Must be added as a group member to hear group chat. |

Request it as a secret. Do not print it back, do not put it in a routine prompt, do not write it anywhere except the configure command.

## 2. Configure

```
npx @roamhq/grokbot configure --token <token>
```

Optional: `--base-url https://api.ro.am/v1` (the default).

## 3. Status — PAT vs org

```
npx @roamhq/grokbot status
```

Report which kind came back:

- **PAT:** `bot` is the persona (self-echo / @mention id); `user` is the owner. Personal: only the owner may talk.
- **Org:** no `bot` field; `user` IS the bot.

## 4. Create ONE inbound webhook routine

Create **one** inbound webhook routine on this Bot. Do not create extra routines.

Set the routine prompt to the full contents of the sibling **roam-chat** skill (`skills/roam-chat/SKILL.md`).

## 5. Collect routine URL + sender key

Ask the operator to paste the **routine URL** and **sender key** from the routine panel (same pattern as WeChat). Treat the sender key as a secret.

## 6. Subscribe

```
npx @roamhq/grokbot subscribe --url <grokRoutineUrl> --token <grokSenderKey>
```

- **Org default:** add `--mention` so group traffic is @-only.
- Optional: `--chat-type dm` or `--chat-type group`.
- Optional: `--event chat.message` (the default).

Keep the printed subscription `id`. Unsubscribe later with `npx @roamhq/grokbot unsubscribe --id <uuid>`.

## 7. Org: add the bot to groups

If this is an **organization** token, tell the operator to add the bot under the group's **Group Settings → Add Members**. @-mentioning does not join. Personal bots cannot be added as group members; they hear chats the owner is in.

## 8. Verify

1. Pick a `chat-id` (a DM with the bot, or a group it belongs to).
2. `npx @roamhq/grokbot send --chat-id <uuid> --text "grokbot-roam is connected"`
3. Then a real DM (PAT) or @mention in the group (org). The routine should typing-then-reply.

If nothing comes back: re-run `status`, confirm the subscribe `id` exists, and for org confirm the bot is a group member plus `--mention` if that was set.
