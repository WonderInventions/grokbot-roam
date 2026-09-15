# @roamhq/grokbot

Grok Bot **channel plugin** for [Roam HQ](https://ro.am) chat
([developer docs](https://developer.ro.am)). People DM or @mention the bot
inside Roam; the bot replies with the Roam API.

Published as [`@roamhq/grokbot`](https://www.npmjs.com/package/@roamhq/grokbot)
(bin: `grokbot-roam`).

This is **not** a public HTTP webhook server. Grok Bot's VM is outbound-only.
There is no ngrok.

## Two hops

```
Roam chat  --chat.message-->  appserver  --routine URL-->  Grok Bot
                                                         |
                                                         v
                                              npx @roamhq/grokbot handle-wake
                                              npx @roamhq/grokbot typing / reply
                                                         |
                                                         v
                                              POST https://api.ro.am/v1/chat.post
```

1. **Appserver** (separate change) delivers `chat.message` to a Grok Bot
   **routine URL**.
2. **This package** is hop 3: after Grok wakes, the Bot calls this CLI to
   filter the event and talk back to Roam.

## Install

In Grok Bot, one message:

```
Install this Roam plugin https://github.com/WonderInventions/grokbot-roam then connect Roam
```

That’s it. The **roam-channel** skill secret-requests a Roam token, creates one
webhook routine, and subscribes. You paste a PAT (`rmp-…`) or API key (`rmk-…`),
then the routine URL + sender key from the routine panel if the Bot cannot read
them.

Or dump the same playbook into the session:

```
npx @roamhq/grokbot@latest onboard
```

## Personal vs organization

`grokbot-roam status` calls `GET /v1/token.info`.

| Token | Prefix | `token.info` | Who may talk |
|-------|--------|--------------|--------------|
| **PAT** | `rmp-` | `bot` = persona (self-echo / @ id); `user` = owner | Owner only |
| **Org API key** | `rmk-` | no `bot`; `user` **is** the bot | Anyone in chats the bot is a member of. Add the bot under Group Settings. Org default: subscribe with `--mention`. |

## CLI

Config: `~/.grokbot-roam/config.json` (mode `0600`). Tokens are never logged.

```
npx @roamhq/grokbot configure --token rmp-…|rmk-… [--base-url https://api.ro.am/v1]
npx @roamhq/grokbot status
npx @roamhq/grokbot subscribe --url <grokRoutineUrl> --token <grokSenderKey>
                           [--event chat.message] [--mention] [--chat-type dm|group]
npx @roamhq/grokbot unsubscribe --id <uuid>
npx @roamhq/grokbot reply --chat-id <uuid> --text-file <path> [--thread-timestamp N] [--reply-to N]
npx @roamhq/grokbot send --chat-id <uuid> --text-file <path> [--thread-timestamp N]
npx @roamhq/grokbot typing --chat-id <uuid> [--thread-timestamp N]
npx @roamhq/grokbot history --chat-id <uuid> [--limit N] [--thread-timestamp N]
npx @roamhq/grokbot handle-wake    # webhook JSON on stdin → {action: reply|silence, …}
```

`subscribe` POSTs `/v1/webhook.subscribe` with `destination: { type: "grok_bot", token }`
so Roam can push to the routine instead of a public HTTPS URL.

`handle-wake` accepts the v1 envelope or bare `data`. It drops self-echo, edits,
deletes, PAT non-owners, and (when mention is required) group messages that do
not `<@botUuid>`. A reply action includes `threadTimestamp` (inbound thread, or
the inbound timestamp in groups so the bot starts a thread). The Bot calls
`history` when it needs prior messages that are not already in the Grok
session — the CLI does not track chats. Meetings and reactions go through
Roam MCP with the same token — not this CLI.

## Development

Node 20+. Zero runtime dependencies (`fetch`, `node:crypto` unused, `node:fs`).

```sh
npm install
npm test
npm run build
```

## Releasing

Publishes from GitHub Actions on `release: published` using npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC) with
provenance — no npm tokens in the repo.

1. Land the version bump on `master` (`package.json` / `plugin.json` `version`).
2. Create a GitHub Release whose tag is `v` + that version (e.g. `v0.1.0`).
3. The **release** workflow (environment `npm-publish`, `master` / `v*` only)
   re-runs tests, checks the tag matches, and runs
   `npm publish --provenance --access public`.
4. Confirm https://www.npmjs.com/package/@roamhq/grokbot shows provenance.

First publish also needs an npm trusted-publisher entry for this repo +
`release.yml` on the `@roamhq` org (same as `@roamhq/openclaw-roam`).

## License

MIT
