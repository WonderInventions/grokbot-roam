# grokbot-roam

Grok Bot **channel plugin** for [Roam HQ](https://ro.am) chat. People DM or
@mention the bot inside Roam; the bot replies with the Roam API.

This is **not** a public HTTP webhook server. Grok Bot's VM is outbound-only.
There is no ngrok.

## Two hops

```
Roam chat  --chat.message-->  appserver  --routine URL-->  Grok Bot
                                                         |
                                                         v
                                              npx grokbot-roam handle-wake
                                              npx grokbot-roam typing / reply
                                                         |
                                                         v
                                              POST https://api.ro.am/v1/chat.post
```

1. **Appserver** (separate change) delivers `chat.message` to a Grok Bot
   **routine URL**.
2. **This package** is hop 3: after Grok wakes, the Bot calls this CLI to
   filter the event and talk back to Roam.

## Install (Grok Bot)

In a Grok Bot conversation:

```
Install this Roam plugin https://github.com/WonderInventions/grokbot-roam
```

The **roam-channel** skill is the installer playbook (secret-request a token,
`configure`, `status`, one inbound routine, `subscribe`). The **roam-chat**
skill is the prompt for that routine.

## Personal vs organization

`grokbot-roam status` calls `GET /v1/token.info`.

| Token | Prefix | `token.info` | Who may talk |
|-------|--------|--------------|--------------|
| **PAT** | `rmp-` | `bot` = persona (self-echo / @ id); `user` = owner | Owner only |
| **Org API key** | `rmk-` | no `bot`; `user` **is** the bot | Anyone in chats the bot is a member of. Add the bot under Group Settings. Org default: subscribe with `--mention`. |

## CLI

Config: `~/.grokbot-roam/config.json` (mode `0600`). Tokens are never logged.

```
npx grokbot-roam configure --token rmp-…|rmk-… [--base-url https://api.ro.am/v1]
npx grokbot-roam status
npx grokbot-roam subscribe --url <grokRoutineUrl> --token <grokSenderKey>
                           [--event chat.message] [--mention] [--chat-type dm|group]
npx grokbot-roam unsubscribe --id <uuid>
npx grokbot-roam reply --chat-id <uuid> --text <md> [--thread-timestamp N] [--reply-to N]
npx grokbot-roam send --chat-id <uuid> --text <md> [--thread-timestamp N]
npx grokbot-roam typing --chat-id <uuid> [--thread-timestamp N]
npx grokbot-roam history --chat-id <uuid> [--limit N]
npx grokbot-roam handle-wake    # webhook JSON on stdin → {action: reply|silence, …}
```

`subscribe` POSTs `/v1/webhook.subscribe` with `destination: { type: "grok_bot", token }`
so Roam can push to the routine instead of a public HTTPS URL.

`handle-wake` accepts the v1 envelope or bare `data`. It drops self-echo, edits,
deletes, PAT non-owners, and (when mention is required) group messages that do
not `<@botUuid>`. A reply action includes `threadTimestamp` (inbound thread, or
the inbound timestamp in groups so the bot starts a thread).

## Development

Node 20+. Zero runtime dependencies (`fetch`, `node:crypto` unused, `node:fs`).

```sh
npm install
npm test
npm run build
```

## License

MIT
