import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleWake, unwrapWebhookEnvelope } from "./handle-wake.js";
import { identityFromTokenInfo, type Identity } from "./identity.js";

const BOT_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const CHAT_ID = "cccccccccccccccccccccccccccccccccccc";

const org: Identity = {
  kind: "org",
  botId: BOT_ID,
  botName: "OrgBot",
  ownerId: null,
  ownerName: null,
  ownerEmail: null,
  scopes: ["chat:write"],
};

const pat: Identity = {
  kind: "pat",
  botId: BOT_ID,
  botName: "PersonalBot",
  ownerId: OWNER_ID,
  ownerName: "Rob",
  ownerEmail: "rob@ro.am",
  scopes: ["chat:write"],
};

function msg(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    chatId: CHAT_ID,
    userId: OTHER_ID,
    timestamp: 1_700_000_000_000_000,
    chatType: "dm",
    text: "hello",
    version: 1,
    contentType: "text",
    ...over,
  };
}

function envelope(data: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "chat.message",
    eventId: "evt-1",
    timestamp: "2026-07-07T12:00:00Z",
    apiVersion: "2026-07-07",
    data,
  };
}

describe("unwrapWebhookEnvelope", () => {
  it("unwraps the 2026-07-07 envelope and restores type=message", () => {
    const data = msg();
    const out = unwrapWebhookEnvelope(envelope(data));
    assert.equal(out.type, "message");
    assert.equal(out.chatId, CHAT_ID);
  });

  it("passes a bare payload through", () => {
    const data = msg({ type: "message" });
    assert.deepEqual(unwrapWebhookEnvelope(data), data);
  });
});

describe("identityFromTokenInfo", () => {
  it("treats bot+user as a PAT", () => {
    const id = identityFromTokenInfo({
      user: { id: OWNER_ID, name: "Rob", email: "rob@ro.am" },
      bot: { id: BOT_ID, name: "PersonalBot" },
      scopes: ["chat:write"],
    });
    assert.equal(id.kind, "pat");
    assert.equal(id.botId, BOT_ID);
    assert.equal(id.ownerId, OWNER_ID);
  });

  it("treats user-only as an org token", () => {
    const id = identityFromTokenInfo({
      user: { id: BOT_ID, name: "OrgBot" },
      scopes: ["chat:write"],
    });
    assert.equal(id.kind, "org");
    assert.equal(id.botId, BOT_ID);
    assert.equal(id.ownerId, null);
  });
});

describe("handleWake", () => {
  it("silences self-echo", () => {
    const r = handleWake(msg({ userId: BOT_ID }), org);
    assert.deepEqual(r, { action: "silence", reason: "self-echo" });
  });

  it("silences edits (version > 1)", () => {
    const r = handleWake(msg({ version: 2 }), org);
    assert.deepEqual(r, { action: "silence", reason: "edit" });
  });

  it("silences deletes", () => {
    const r = handleWake(msg({ contentType: "deleted", version: 3 }), org);
    assert.deepEqual(r, { action: "silence", reason: "deleted" });
  });

  it("PAT: silences non-owner senders", () => {
    const r = handleWake(msg({ userId: OTHER_ID }), pat);
    assert.deepEqual(r, { action: "silence", reason: "not_owner" });
  });

  it("PAT: owner DMs get a reply without starting a thread", () => {
    const r = handleWake(
      msg({ userId: OWNER_ID, chatType: "dm", timestamp: 42, text: "hi" }),
      pat,
    );
    assert.equal(r.action, "reply");
    if (r.action !== "reply") {
      return;
    }
    assert.equal(r.chatId, CHAT_ID);
    assert.equal(r.replyTo, 42);
    assert.equal(r.threadTimestamp, undefined);
    assert.equal(r.textHint, "hi");
  });

  it("mention gate: silences a group message without <@botUuid>", () => {
    const r = handleWake(
      msg({ chatType: "group", text: "hello everyone", userId: OTHER_ID }),
      org,
      { requireMention: true },
    );
    assert.deepEqual(r, { action: "silence", reason: "mention_required" });
  });

  it("mention gate: replies when the group message @mentions the bot", () => {
    const r = handleWake(
      msg({
        chatType: "group",
        text: `<@${BOT_ID}> hello`,
        userId: OTHER_ID,
        timestamp: 99,
      }),
      org,
      { requireMention: true },
    );
    assert.equal(r.action, "reply");
    if (r.action !== "reply") {
      return;
    }
    assert.equal(r.textHint, "hello");
    assert.equal(r.threadTimestamp, 99);
    assert.equal(r.replyTo, 99);
  });

  it("thread anchoring: group without threadTimestamp uses inbound timestamp", () => {
    const r = handleWake(
      msg({ chatType: "group", timestamp: 100, threadTimestamp: undefined, userId: OTHER_ID }),
      org,
    );
    assert.equal(r.action, "reply");
    if (r.action !== "reply") {
      return;
    }
    assert.equal(r.threadTimestamp, 100);
    assert.equal(r.replyTo, 100);
  });

  it("thread anchoring: inbound threadTimestamp is preserved", () => {
    const r = handleWake(
      msg({
        chatType: "group",
        timestamp: 200,
        threadTimestamp: 100,
        userId: OTHER_ID,
      }),
      org,
    );
    assert.equal(r.action, "reply");
    if (r.action !== "reply") {
      return;
    }
    assert.equal(r.threadTimestamp, 100);
    assert.equal(r.replyTo, 200);
  });

  it("never threads DMs even if threadTimestamp is present", () => {
    const r = handleWake(
      msg({
        chatType: "dm",
        timestamp: 200,
        threadTimestamp: 100,
        userId: OWNER_ID,
      }),
      pat,
    );
    assert.equal(r.action, "reply");
    if (r.action !== "reply") {
      return;
    }
    assert.equal(r.threadTimestamp, undefined);
  });

  it("surfaces photo and blob items on the reply action", () => {
    const items = [
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        type: "photo",
        name: "shot.png",
        mime: "image/png",
        url: "https://cdn.example/shot.png",
        thumbnail: "https://cdn.example/shot-thumb.png",
        size: 1234,
      },
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        type: "blob",
        name: "notes.pdf",
        mime: "application/octet-stream",
        url: "https://cdn.example/notes.pdf",
        size: 999,
      },
    ];
    const r = handleWake(
      msg({ userId: OWNER_ID, chatType: "dm", text: "see these", items }),
      pat,
    );
    assert.equal(r.action, "reply");
    if (r.action !== "reply") {
      return;
    }
    assert.equal(r.textHint, "see these");
    assert.equal(r.items?.length, 2);
    assert.equal(r.items?.[0]?.type, "photo");
    assert.equal(r.items?.[1]?.name, "notes.pdf");
  });

  it("wakes on an image-only message", () => {
    const r = handleWake(
      msg({
        userId: OWNER_ID,
        chatType: "dm",
        text: "",
        items: [
          {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            type: "photo",
            name: "shot.png",
            url: "https://cdn.example/shot.png",
          },
        ],
      }),
      pat,
    );
    assert.equal(r.action, "reply");
    if (r.action !== "reply") {
      return;
    }
    assert.equal(r.textHint, "");
    assert.equal(r.items?.[0]?.name, "shot.png");
  });

  it("PAT without ownerId fails closed", () => {
    const r = handleWake(msg({ userId: OWNER_ID, chatType: "dm" }), {
      ...pat,
      ownerId: null,
    });
    assert.deepEqual(r, { action: "silence", reason: "not_owner" });
  });

  it("PAT owner group messages require a mention", () => {
    const r = handleWake(
      msg({ chatType: "group", userId: OWNER_ID, text: "hello everyone" }),
      pat,
    );
    assert.deepEqual(r, { action: "silence", reason: "mention_required" });
  });

  it("silences bot senders", () => {
    const r = handleWake(msg({ userId: OTHER_ID, userType: "bot", chatType: "dm" }), org);
    assert.deepEqual(r, { action: "silence", reason: "bot_sender" });
  });

  it("silences missing chatType", () => {
    const r = handleWake(msg({ userId: OWNER_ID, chatType: "" }), pat);
    assert.deepEqual(r, { action: "silence", reason: "unknown_chat_type" });
  });

  it("silences envelopes with missing type", () => {
    const r = handleWake(
      { apiVersion: "2026-07-07", data: msg({ userId: OWNER_ID, chatType: "dm" }) },
      pat,
    );
    assert.deepEqual(r, { action: "silence", reason: "ignored_envelope:missing" });
  });

  it("silences non-chat.message envelopes", () => {
    const r = handleWake(
      { type: "meeting.ended", apiVersion: "2026-07-07", data: msg({ userId: OWNER_ID }) },
      pat,
    );
    assert.deepEqual(r, { action: "silence", reason: "ignored_envelope:meeting.ended" });
  });

  it("does not treat a bare payload with apiVersion as an envelope", () => {
    const r = handleWake(
      msg({ userId: OWNER_ID, chatType: "dm", text: "yo", apiVersion: "2026-07-07", type: "message" }),
      pat,
    );
    assert.equal(r.action, "reply");
  });

  it("accepts the v1 envelope", () => {
    const r = handleWake(
      envelope(msg({ userId: OWNER_ID, chatType: "dm", text: "yo" })),
      pat,
    );
    assert.equal(r.action, "reply");
    if (r.action !== "reply") {
      return;
    }
    assert.equal(r.textHint, "yo");
  });
});
