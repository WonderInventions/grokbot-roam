import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSubscribeBody,
  RoamClient,
  ROAM_API_VERSION,
  type FetchLike,
} from "./client.js";
import { shouldRequireMention, type Config } from "./config.js";
import type { Identity } from "./identity.js";

describe("buildSubscribeBody", () => {
  it("posts grok_bot destination with apiVersion and mention filter", () => {
    assert.deepEqual(
      buildSubscribeBody({
        url: "https://grok.example/routine/abc",
        grokToken: "sender-key",
        mention: true,
      }),
      {
        url: "https://grok.example/routine/abc",
        event: "chat.message",
        apiVersion: "2026-07-07",
        destination: { type: "grok_bot", token: "sender-key" },
        filter: { mention: true },
      },
    );
  });

  it("omits filter when neither mention nor chat-type is set", () => {
    const body = buildSubscribeBody({
      url: "https://grok.example/routine/abc",
      grokToken: "sender-key",
    });
    assert.equal("filter" in body, false);
  });

  it("includes chatType in the filter", () => {
    const body = buildSubscribeBody({
      url: "https://grok.example/routine/abc",
      grokToken: "sender-key",
      chatType: "dm",
    });
    assert.deepEqual(body.filter, { chatType: "dm" });
  });

  it("includes self for the PAT bot DM", () => {
    const body = buildSubscribeBody({
      url: "https://grok.example/routine/abc",
      grokToken: "sender-key",
      chatType: "dm",
      self: true,
    });
    assert.deepEqual(body.filter, { chatType: "dm", self: true });
  });
});

describe("RoamClient.webhookSubscribe", () => {
  it("POSTs the grok_bot subscribe JSON to /webhook.subscribe", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const fetchMock: FetchLike = async (input, init) => {
      requests.push({ url: String(input), init: init ?? {} });
      return new Response(
        JSON.stringify({ id: "19c6401f-6d02-4d8c-87c5-9fc45f02f4b5", event: "chat.message" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const client = new RoamClient({
      token: "rmk-test",
      fetch: fetchMock,
      userAgent: "grokbot-roam/0.1.0",
    });
    const result = await client.webhookSubscribe({
      url: "https://grok.example/routine/abc",
      grokToken: "sender-key",
      mention: true,
      chatType: "group",
    });

    assert.equal(result.id, "19c6401f-6d02-4d8c-87c5-9fc45f02f4b5");
    assert.equal(requests.length, 1);
    const req = requests[0]!;
    assert.equal(req.url, "https://api.ro.am/v1/webhook.subscribe");
    assert.equal(req.init.method, "POST");
    const headers = new Headers(req.init.headers);
    assert.equal(headers.get("Authorization"), "Bearer rmk-test");
    assert.equal(headers.get("Roam-Version"), ROAM_API_VERSION);
    assert.equal(headers.get("User-Agent"), "grokbot-roam/0.1.0");
    assert.equal(headers.get("Content-Type"), "application/json");
    assert.deepEqual(JSON.parse(String(req.init.body)), {
      url: "https://grok.example/routine/abc",
      event: "chat.message",
      apiVersion: "2026-07-07",
      destination: { type: "grok_bot", token: "sender-key" },
      filter: { mention: true, chatType: "group" },
    });
  });
});

describe("shouldRequireMention", () => {
  const org: Identity = {
    kind: "org",
    botId: "b",
    botName: "Bot",
    ownerId: null,
    ownerName: null,
    ownerEmail: null,
    scopes: [],
  };
  const pat: Identity = { ...org, kind: "pat", ownerId: "o" };
  const base: Config = { token: "rmk-x", baseUrl: "https://api.ro.am/v1" };

  it("defaults org to true and PAT to false when unset", () => {
    assert.equal(shouldRequireMention(base, org), true);
    assert.equal(shouldRequireMention(base, pat), false);
  });

  it("honors an explicit config flag", () => {
    assert.equal(shouldRequireMention({ ...base, requireMention: false }, org), false);
    assert.equal(shouldRequireMention({ ...base, requireMention: true }, pat), true);
  });
});

describe("RoamClient.chatPost", () => {
  it("sends replyTimestamp not replyTo", async () => {
    const bodies: unknown[] = [];
    const fetchMock: FetchLike = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    };
    const client = new RoamClient({ token: "rmk-test", fetch: fetchMock });
    await client.chatPost({
      chatId: "c1",
      text: "hi",
      threadTimestamp: 10,
      replyTimestamp: 9,
    });
    assert.deepEqual(bodies[0], {
      chatId: "c1",
      text: "hi",
      markdown: true,
      sync: true,
      threadTimestamp: 10,
      replyTimestamp: 9,
    });
  });

  it("posts assetIds from asset.create", async () => {
    const bodies: unknown[] = [];
    const fetchMock: FetchLike = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    };
    const client = new RoamClient({ token: "rmk-test", fetch: fetchMock });
    await client.chatPost({
      chatId: "c1",
      text: "pic",
      assetIds: ["9b1c2d3e-4f50-6a7b-8c9d-0e1f2a3b4c5d"],
    });
    assert.deepEqual(bodies[0], {
      chatId: "c1",
      text: "pic",
      markdown: true,
      sync: true,
      assetIds: ["9b1c2d3e-4f50-6a7b-8c9d-0e1f2a3b4c5d"],
    });
  });

  it("allows assetIds without text", async () => {
    const bodies: unknown[] = [];
    const fetchMock: FetchLike = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    };
    const client = new RoamClient({ token: "rmk-test", fetch: fetchMock });
    await client.chatPost({
      chatId: "c1",
      assetIds: ["9b1c2d3e-4f50-6a7b-8c9d-0e1f2a3b4c5d"],
    });
    const body = bodies[0] as Record<string, unknown>;
    assert.equal("text" in body, false);
    assert.deepEqual(body.assetIds, ["9b1c2d3e-4f50-6a7b-8c9d-0e1f2a3b4c5d"]);
  });
});

describe("RoamClient.assetCreate", () => {
  it("POSTs JSON then uploads raw bytes with instruction headers", async () => {
    const calls: { url: string; method?: string; headers?: Headers; body?: unknown }[] = [];
    const fetchMock: FetchLike = async (input, init) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method,
        headers: new Headers(init?.headers),
        body: init?.body,
      });
      if (url.endsWith("/asset.create")) {
        return new Response(
          JSON.stringify({
            assetId: "asset-1",
            uploadUrl: "https://uploads.example/put",
            uploadMethod: "POST",
            uploadHeaders: { Authorization: "Bearer upload-tok", "Upload-Complete": "?1" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("", { status: 200 });
    };
    const client = new RoamClient({ token: "rmk-test", fetch: fetchMock });
    const inst = await client.assetCreate({ name: "shot.png", size: 4 });
    await client.uploadAssetBytes(inst, Buffer.from("abcd"));
    assert.equal(calls[0]?.url, "https://api.ro.am/v1/asset.create");
    assert.equal(JSON.parse(String(calls[0]?.body)).purpose, "file");
    assert.equal(calls[1]?.url, "https://uploads.example/put");
    assert.equal(calls[1]?.headers?.get("Authorization"), "Bearer upload-tok");
    assert.equal(calls[1]?.headers?.get("Upload-Complete"), "?1");
  });
});
