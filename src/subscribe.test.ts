import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSubscribeBody,
  RoamClient,
  ROAM_API_VERSION,
  type FetchLike,
} from "./client.js";

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
