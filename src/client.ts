import { userAgent } from "./version.js";

export const DEFAULT_API_BASE_URL = "https://api.ro.am/v1";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_MESSAGE_TEXT_SIZE = 8000;
export const ROAM_API_VERSION = "2026-07-07";

const ERROR_CODE_RE = /^[a-z][a-z0-9_]*$/;

const TERMINAL_ERROR_CODES = new Set(["token_revoked", "invalid_token", "not_authed"]);
const RETRYABLE_ERROR_CODES = new Set([
  "ratelimited",
  "upstream_timeout",
  "transcript_pending",
  "request_timeout",
  "internal_error",
]);

export type FetchLike = typeof fetch;

export function parseApiErrorCode(body: string): string | undefined {
  if (!body) {
    return undefined;
  }
  try {
    const data = JSON.parse(body) as unknown;
    if (!data || typeof data !== "object") {
      return undefined;
    }
    const rec = data as Record<string, unknown>;
    const code = rec.code;
    if (typeof code === "string" && ERROR_CODE_RE.test(code)) {
      return code;
    }
    const err = rec.error;
    if (typeof err === "string" && ERROR_CODE_RE.test(err)) {
      return err;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export class RoamAPIError extends Error {
  readonly status: number;
  readonly body: string;
  readonly code: string | undefined;

  constructor(status: number, body: string, code?: string) {
    const resolved = code ?? parseApiErrorCode(body);
    const detail = resolved ? `${resolved}: ${body.slice(0, 200)}` : body.slice(0, 200);
    super(`Roam API ${status}: ${detail}`);
    this.name = "RoamAPIError";
    this.status = status;
    this.body = body;
    this.code = resolved;
  }

  get terminal(): boolean {
    return Boolean(this.code && TERMINAL_ERROR_CODES.has(this.code));
  }

  get retryable(): boolean {
    if (this.terminal) {
      return false;
    }
    if (this.code && RETRYABLE_ERROR_CODES.has(this.code)) {
      return true;
    }
    return this.status >= 500;
  }
}

export type ChatPostOptions = {
  chatId: string;
  text: string;
  threadTimestamp?: number;
  replyTimestamp?: number;
  /** @deprecated Use replyTimestamp. Mapped if replyTimestamp is omitted. */
  replyTo?: number;
  markdown?: boolean;
  sync?: boolean;
};

export type SubscribeOptions = {
  url: string;
  grokToken: string;
  event?: string;
  mention?: boolean;
  chatType?: "dm" | "group";
};

export function buildSubscribeBody(opts: SubscribeOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    url: opts.url,
    event: opts.event ?? "chat.message",
    apiVersion: ROAM_API_VERSION,
    destination: { type: "grok_bot", token: opts.grokToken },
  };
  const filter: Record<string, unknown> = {};
  if (opts.mention) {
    filter.mention = true;
  }
  if (opts.chatType) {
    filter.chatType = opts.chatType;
  }
  if (Object.keys(filter).length > 0) {
    body.filter = filter;
  }
  return body;
}

function assertTextSize(text: string): void {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > MAX_MESSAGE_TEXT_SIZE) {
    throw new Error(
      `Message text is ${bytes} bytes; Roam cap is ${MAX_MESSAGE_TEXT_SIZE}`,
    );
  }
}

export class RoamClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly ua: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: {
    token: string;
    baseUrl?: string;
    userAgent?: string;
    fetch?: FetchLike;
    timeoutMs?: number;
  }) {
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
    this.ua = options.userAgent ?? userAgent();
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private headers(json: boolean): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "User-Agent": this.ua,
      "Roam-Version": ROAM_API_VERSION,
    };
    if (json) {
      h["Content-Type"] = "application/json";
    }
    return h;
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string | number | undefined>,
  ): Promise<Record<string, unknown>> {
    const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== "") {
          url.searchParams.set(k, String(v));
        }
      }
    }
    const init: RequestInit = {
      method,
      headers: this.headers(method === "POST"),
      signal: AbortSignal.timeout(this.timeoutMs),
    };
    if (method === "POST") {
      init.body = JSON.stringify(body ?? {});
    }
    const resp = await this.fetchImpl(url, init);
    const text = await resp.text();
    if (resp.status >= 400) {
      throw new RoamAPIError(resp.status, text);
    }
    if (!text) {
      return {};
    }
    try {
      const data = JSON.parse(text) as unknown;
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const rec = data as Record<string, unknown>;
        if (rec.ok === false) {
          throw new RoamAPIError(resp.status, text);
        }
        return rec;
      }
      return {};
    } catch (err) {
      if (err instanceof RoamAPIError) {
        throw err;
      }
      return {};
    }
  }

  async tokenInfo(): Promise<Record<string, unknown>> {
    return this.request("GET", "/token.info");
  }

  async chatPost(opts: ChatPostOptions): Promise<Record<string, unknown>> {
    assertTextSize(opts.text);
    const body: Record<string, unknown> = {
      chatId: opts.chatId,
      text: opts.text,
      markdown: opts.markdown ?? true,
      sync: opts.sync ?? true,
    };
    if (opts.threadTimestamp !== undefined) {
      body.threadTimestamp = opts.threadTimestamp;
    }
    const replyTimestamp = opts.replyTimestamp ?? opts.replyTo;
    if (opts.replyTimestamp !== undefined && opts.replyTo !== undefined && opts.replyTimestamp !== opts.replyTo) {
      throw new Error("chatPost: replyTimestamp and replyTo disagree");
    }
    if (replyTimestamp !== undefined) {
      body.replyTimestamp = replyTimestamp;
    }
    return this.request("POST", "/chat.post", body);
  }

  async chatTyping(
    chatId: string,
    opts: { threadTimestamp?: number } = {},
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { chatId };
    if (opts.threadTimestamp !== undefined) {
      body.threadTimestamp = opts.threadTimestamp;
    }
    return this.request("POST", "/chat.typing", body);
  }

  async chatHistory(
    chatId: string,
    opts: { limit?: number; threadTimestamp?: number } = {},
  ): Promise<Record<string, unknown>> {
    return this.request("GET", "/chat.history", undefined, {
      chatId,
      limit: opts.limit,
      threadTimestamp: opts.threadTimestamp,
    });
  }

  async webhookSubscribe(opts: SubscribeOptions): Promise<Record<string, unknown>> {
    return this.request("POST", "/webhook.subscribe", buildSubscribeBody(opts));
  }

  async webhookUnsubscribe(id: string): Promise<Record<string, unknown>> {
    return this.request("POST", "/webhook.unsubscribe", { id });
  }

  async webhookList(): Promise<unknown[]> {
    const data = await this.request("GET", "/webhook.list");
    return Array.isArray(data.webhooks) ? data.webhooks : [];
  }
}
