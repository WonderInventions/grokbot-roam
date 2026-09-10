import { parseArgs, type ParseArgsConfig } from "node:util";
import {
  DEFAULT_API_BASE_URL,
  RoamAPIError,
  RoamClient,
  type SubscribeOptions,
} from "./client.js";
import {
  loadConfig,
  saveConfig,
  shouldRequireMention,
  type Config,
} from "./config.js";
import { handleWake } from "./handle-wake.js";
import { identityFromTokenInfo, type Identity } from "./identity.js";
import { expandSoftBreaks } from "./markdown.js";
import { redact } from "./redact.js";
import { packageVersion, userAgent } from "./version.js";

const USAGE = `grokbot-roam ${packageVersion()} — Roam HQ channel for Grok Bot

Usage:
  grokbot-roam configure --token rmp-…|rmk-… [--base-url https://api.ro.am/v1]
  grokbot-roam status
  grokbot-roam subscribe --url <grokRoutineUrl> --token <grokSenderKey>
                         [--event chat.message] [--mention] [--chat-type dm|group]
  grokbot-roam unsubscribe --id <uuid>
  grokbot-roam reply --chat-id <uuid> --text <md> [--thread-timestamp N] [--reply-to N]
  grokbot-roam send --chat-id <uuid> --text <md> [--thread-timestamp N]
  grokbot-roam typing --chat-id <uuid> [--thread-timestamp N]
  grokbot-roam history --chat-id <uuid> [--limit N]
  grokbot-roam handle-wake

Config: ~/.grokbot-roam/config.json (mode 0600). Tokens are never logged.
`;

function fail(message: string, extra?: string): never {
  console.error(redact(message, extra));
  process.exitCode = 1;
  throw new CliError(message);
}

class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseFlags<T extends NonNullable<ParseArgsConfig["options"]>>(
  argv: string[],
  options: T,
) {
  return parseArgs({
    args: argv,
    options,
    allowPositionals: false,
    strict: true,
  }).values;
}

function intFlag(value: string | undefined, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    fail(`${name} must be an integer`);
  }
  return n;
}

function clientFromConfig(config: Config): RoamClient {
  return new RoamClient({
    token: config.token,
    baseUrl: config.baseUrl,
    userAgent: userAgent(),
  });
}

function formatStatus(identity: Identity): string {
  const lines: string[] = [];
  if (identity.kind === "pat") {
    lines.push("Token: PAT (personal)");
    lines.push(
      `Owner: ${identity.ownerName ?? "?"} (${identity.ownerId ?? "?"})`,
    );
    lines.push(
      `Bot persona: ${identity.botName ?? "?"} (${identity.botId ?? "?"})`,
    );
    lines.push("Personal: only the owner may talk to this bot.");
  } else {
    lines.push("Token: organization");
    lines.push(`Bot: ${identity.botName ?? "?"} (${identity.botId ?? "?"})`);
  }
  if (identity.scopes.length) {
    lines.push(`Scopes: ${identity.scopes.join(", ")}`);
  }
  return lines.join("\n");
}

async function cmdConfigure(argv: string[]): Promise<void> {
  const flags = parseFlags(argv, {
    token: { type: "string" },
    "base-url": { type: "string" },
  });
  const token = flags.token;
  if (!token) {
    fail("configure requires --token rmp-…|rmk-…");
  }
  const baseUrl = flags["base-url"] ?? DEFAULT_API_BASE_URL;
  const client = new RoamClient({ token, baseUrl, userAgent: userAgent() });
  let identity: Identity | undefined;
  try {
    identity = identityFromTokenInfo(await client.tokenInfo());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`token.info failed: ${msg}`, token);
  }
  saveConfig({ token, baseUrl, identity });
  process.stdout.write(`Saved config. ${formatStatus(identity)}\n`);
}

async function cmdStatus(): Promise<void> {
  const config = loadConfig();
  const client = clientFromConfig(config);
  let identity: Identity;
  try {
    identity = identityFromTokenInfo(await client.tokenInfo());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`token.info failed: ${msg}`, config.token);
  }
  saveConfig({ ...config, identity });
  process.stdout.write(`${formatStatus(identity)}\n`);
}

async function cmdSubscribe(argv: string[]): Promise<void> {
  const flags = parseFlags(argv, {
    url: { type: "string" },
    token: { type: "string" },
    event: { type: "string" },
    mention: { type: "boolean", default: false },
    "chat-type": { type: "string" },
  });
  if (!flags.url) {
    fail("subscribe requires --url <grokRoutineUrl>");
  }
  if (!flags.token) {
    fail("subscribe requires --token <grokSenderKey>");
  }
  const chatType = flags["chat-type"];
  if (chatType && chatType !== "dm" && chatType !== "group") {
    fail("--chat-type must be dm or group");
  }
  const config = loadConfig();
  const client = clientFromConfig(config);
  const opts: SubscribeOptions = {
    url: flags.url,
    grokToken: flags.token,
    event: flags.event ?? "chat.message",
    mention: flags.mention === true,
    chatType: chatType as "dm" | "group" | undefined,
  };
  let result: Record<string, unknown>;
  try {
    result = await client.webhookSubscribe(opts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`webhook.subscribe failed: ${msg}`, flags.token);
  }
  saveConfig({ ...config, requireMention: flags.mention === true });
  printJson(redactDestinationToken(result));
}

function redactDestinationToken(value: Record<string, unknown>): Record<string, unknown> {
  const dest = value.destination;
  if (!dest || typeof dest !== "object" || Array.isArray(dest)) {
    return value;
  }
  return {
    ...value,
    destination: { ...(dest as Record<string, unknown>), token: "[redacted]" },
  };
}

async function cmdUnsubscribe(argv: string[]): Promise<void> {
  const flags = parseFlags(argv, {
    id: { type: "string" },
  });
  if (!flags.id) {
    fail("unsubscribe requires --id <uuid>");
  }
  const config = loadConfig();
  const client = clientFromConfig(config);
  try {
    const result = await client.webhookUnsubscribe(flags.id);
    printJson(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`webhook.unsubscribe failed: ${msg}`, config.token);
  }
}

async function cmdReply(argv: string[], kind: "reply" | "send"): Promise<void> {
  const flags = parseFlags(argv, {
    "chat-id": { type: "string" },
    text: { type: "string" },
    "thread-timestamp": { type: "string" },
    "reply-to": { type: "string" },
  });
  if (!flags["chat-id"]) {
    fail(`${kind} requires --chat-id <uuid>`);
  }
  if (flags.text === undefined) {
    fail(`${kind} requires --text <md>`);
  }
  const config = loadConfig();
  const client = clientFromConfig(config);
  const text = expandSoftBreaks(flags.text);
  try {
    const result = await client.chatPost({
      chatId: flags["chat-id"],
      text,
      threadTimestamp: intFlag(flags["thread-timestamp"], "--thread-timestamp"),
      replyTo: kind === "reply" ? intFlag(flags["reply-to"], "--reply-to") : undefined,
    });
    printJson(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`chat.post failed: ${msg}`, config.token);
  }
}

async function cmdTyping(argv: string[]): Promise<void> {
  const flags = parseFlags(argv, {
    "chat-id": { type: "string" },
    "thread-timestamp": { type: "string" },
  });
  if (!flags["chat-id"]) {
    fail("typing requires --chat-id <uuid>");
  }
  const config = loadConfig();
  const client = clientFromConfig(config);
  try {
    const result = await client.chatTyping(flags["chat-id"], {
      threadTimestamp: intFlag(flags["thread-timestamp"], "--thread-timestamp"),
    });
    printJson(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`chat.typing failed: ${msg}`, config.token);
  }
}

async function cmdHistory(argv: string[]): Promise<void> {
  const flags = parseFlags(argv, {
    "chat-id": { type: "string" },
    limit: { type: "string" },
  });
  if (!flags["chat-id"]) {
    fail("history requires --chat-id <uuid>");
  }
  const config = loadConfig();
  const client = clientFromConfig(config);
  try {
    const result = await client.chatHistory(flags["chat-id"], {
      limit: intFlag(flags.limit, "--limit"),
    });
    printJson(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`chat.history failed: ${msg}`, config.token);
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function cmdHandleWake(): Promise<void> {
  const raw = await readStdin();
  if (!raw.trim()) {
    printJson({ action: "silence", reason: "empty_body" });
    return;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    printJson({ action: "silence", reason: "invalid_json" });
    return;
  }

  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(msg);
  }

  const client = clientFromConfig(config);
  let identity: Identity;
  try {
    identity = identityFromTokenInfo(await client.tokenInfo());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`token.info failed: ${msg}`, config.token);
  }
  saveConfig({ ...config, identity });

  const action = handleWake(payload, identity, {
    requireMention: shouldRequireMention(config, identity),
  });
  printJson(action);
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const cmd = argv[0];
  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    process.stdout.write(USAGE);
    return cmd ? 0 : 1;
  }
  if (cmd === "-v" || cmd === "--version" || cmd === "version") {
    process.stdout.write(`${packageVersion()}\n`);
    return 0;
  }

  try {
    switch (cmd) {
      case "configure":
        await cmdConfigure(argv.slice(1));
        return 0;
      case "status":
        await cmdStatus();
        return 0;
      case "subscribe":
        await cmdSubscribe(argv.slice(1));
        return 0;
      case "unsubscribe":
        await cmdUnsubscribe(argv.slice(1));
        return 0;
      case "reply":
        await cmdReply(argv.slice(1), "reply");
        return 0;
      case "send":
        await cmdReply(argv.slice(1), "send");
        return 0;
      case "typing":
        await cmdTyping(argv.slice(1));
        return 0;
      case "history":
        await cmdHistory(argv.slice(1));
        return 0;
      case "handle-wake":
        await cmdHandleWake();
        return 0;
      default:
        console.error(`unknown command: ${cmd}`);
        process.stdout.write(USAGE);
        return 1;
    }
  } catch (err) {
    if (err instanceof CliError) {
      return 1;
    }
    const msg = err instanceof RoamAPIError ? err.message : err instanceof Error ? err.message : String(err);
    console.error(redact(msg));
    return 1;
  }
}
