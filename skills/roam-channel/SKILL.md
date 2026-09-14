---
name: roam-channel
description: >
  Connect this Grok Bot to Roam HQ chat. Trigger on install, "connect Roam",
  "set up Roam", or when the user pastes a Roam token / Grok routine URL.
  Run npx @roamhq/grokbot onboard if you need the full playbook in this session.
---

# Connect Roam HQ

Do this yourself. Ask the human only for **secrets**. No ngrok. No extra routines.

## You need two secrets from the human

1. **Roam token** — PAT `rmp-…` (personal, owner-only DMs) or API key `rmk-…` (org bot). Secret-request it. Never echo it.
2. **Routine URL + sender key** — after you create the webhook routine, the panel often does not give you the key. Ask them to paste both from that routine’s panel once. Never echo the key.

If they do not have a token yet: tell them **User Settings → Developer → Create Personal Access Token** (Chat Send + Chat Read), or an admin **API Key** with `chat:send_message`, `chat:read`, `chat:history`, `group:read`, `webhook:write`. Then secret-request it.

## Do this in order

```
npx @roamhq/grokbot@latest configure --token <secret>
npx @roamhq/grokbot status
```

- PAT: `bot` is the persona, `user` is the owner.
- Org: no `bot` field; `user` is the bot.

Create **one** inbound webhook routine. Prompt = the sibling **roam-chat** skill (`skills/roam-chat/SKILL.md`), verbatim. Do not create a second routine.

Then:

```
npx @roamhq/grokbot subscribe --url <routine-url> --token <sender-key>
```

Org: tell them to add the bot under **Group Settings**. Personal bots cannot join groups.

Verify: ask them to DM the bot in Roam (PAT) or @-mention it in a group it belongs to (org). You should wake, `handle-wake`, then `reply` with `--text-file` (never `--text "…"`).

If anything fails, re-run `status` and `subscribe`. Do not dump tokens into chat.
