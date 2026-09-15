import type { Identity } from "./identity.js";
import { parseWakeItems, type WakeItem } from "./items.js";
import { stripBotMention, wasBotMentioned } from "./markdown.js";

export type SilenceAction = {
  action: "silence";
  reason: string;
};

export type ReplyAction = {
  action: "reply";
  chatId: string;
  threadTimestamp?: number;
  replyTo?: number;
  textHint: string;
  items?: WakeItem[];
  /** `chat.history` body for this DM, or this group thread. */
  history?: Record<string, unknown>;
  /** Set when history fetch failed; still reply. */
  historyError?: string;
};

export type WakeAction = SilenceAction | ReplyAction;

export type HandleWakeOptions = {
  /** In group chats, only reply when the bot is @-mentioned. */
  requireMention?: boolean;
};

/** Recent messages attached to every reply wake (API default is 10, max 200). */
export const WAKE_HISTORY_LIMIT = 50;

export type ChatHistoryFn = (
  chatId: string,
  opts: { limit?: number; threadTimestamp?: number; expand?: string },
) => Promise<Record<string, unknown>>;

/**
 * Fetch `chat.history` for a reply wake so the Bot sees this DM or thread,
 * not only the inbound message. Failures are recorded on the action; the
 * wake still replies.
 */
export async function attachChatHistory(
  action: WakeAction,
  chatHistory: ChatHistoryFn,
  opts: { limit?: number } = {},
): Promise<WakeAction> {
  if (action.action !== "reply") {
    return action;
  }
  try {
    const history = await chatHistory(action.chatId, {
      limit: opts.limit ?? WAKE_HISTORY_LIMIT,
      threadTimestamp: action.threadTimestamp,
      expand: "addresses",
    });
    return { ...action, history };
  } catch (err) {
    const historyError = err instanceof Error ? err.message : String(err);
    return { ...action, historyError };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asInt(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Return the event payload, unwrapping the 2026-07-07+ common envelope.
 *
 * Envelope shape (detect via `apiVersion` + object `data`):
 * `{ type, eventId, timestamp, apiVersion, data }`.
 * Bare baseline payloads pass through.
 */
export function unwrapWebhookEnvelope(payload: unknown): Record<string, unknown> {
  const root = asRecord(payload);
  if (!root) {
    return {};
  }
  const apiVersion = root.apiVersion;
  const data = root.data;
  if (typeof apiVersion !== "string" || !apiVersion) {
    return root;
  }
  if (!asRecord(data)) {
    return root;
  }
  const out = { ...(data as Record<string, unknown>) };
  if (root.type === "chat.message" && !("type" in out)) {
    out.type = "message";
  }
  return out;
}

function isGroup(chatType: string): boolean {
  return chatType === "group" || chatType === "channel";
}

function silence(reason: string): SilenceAction {
  return { action: "silence", reason };
}

/**
 * Decide whether a Grok Bot wake (chat.message webhook body) should reply.
 *
 * Drops: self-echo, edits (version > 1), deletes, PAT non-owner, and
 * (when requireMention) group messages that do not @ the bot.
 *
 * `threadTimestamp` is the inbound threadTimestamp, or for groups the
 * inbound timestamp so the reply starts a thread off the post.
 */
export function handleWake(
  payload: unknown,
  identity: Identity,
  opts: HandleWakeOptions = {},
): WakeAction {
  const root = asRecord(payload);
  if (!root) {
    return silence("invalid_payload");
  }

  if (root.type === "webhook.verification") {
    return silence("verification");
  }
  if (typeof root.apiVersion === "string" && root.apiVersion && asRecord(root.data)) {
    if (asString(root.type) !== "chat.message") {
      return silence(`ignored_envelope:${asString(root.type) || "missing"}`);
    }
  }

  const event = unwrapWebhookEnvelope(root);
  const eventType = asString(event.type);
  if (eventType && eventType !== "message" && eventType !== "chat.message") {
    return silence(`ignored_type:${eventType}`);
  }

  const contentType = asString(event.contentType);
  if (contentType === "deleted") {
    return silence("deleted");
  }

  const version = asInt(event.version);
  if (version !== undefined && version > 1) {
    return silence("edit");
  }

  const chatId = asString(event.chatId);
  const userId = asString(event.userId);
  const timestamp = asInt(event.timestamp);
  if (!chatId || !userId || timestamp === undefined) {
    return silence("malformed");
  }

  if (identity.botId && userId === identity.botId) {
    return silence("self-echo");
  }
  if (asString(event.userType) === "bot") {
    return silence("bot_sender");
  }

  if (identity.kind === "pat") {
    if (!identity.ownerId || userId !== identity.ownerId) {
      return silence("not_owner");
    }
  }

  const chatType = asString(event.chatType);
  if (chatType !== "dm" && chatType !== "group" && chatType !== "channel") {
    return silence("unknown_chat_type");
  }
  const text = asString(event.text);
  const requireMention = opts.requireMention === true;
  if (isGroup(chatType) && (requireMention || identity.kind === "pat")) {
    if (!identity.botId || !wasBotMentioned(text, identity.botId)) {
      return silence("mention_required");
    }
  }

  const inboundThread = asInt(event.threadTimestamp);
  const threadTimestamp = isGroup(chatType)
    ? inboundThread !== undefined
      ? inboundThread
      : timestamp
    : undefined;

  const reply: ReplyAction = {
    action: "reply",
    chatId,
    replyTo: timestamp,
    textHint: stripBotMention(text, identity.botId),
  };
  if (threadTimestamp !== undefined) {
    reply.threadTimestamp = threadTimestamp;
  }
  const items = parseWakeItems(event.items);
  if (items.length) {
    reply.items = items;
  }
  return reply;
}
