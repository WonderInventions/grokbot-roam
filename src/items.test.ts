import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  contentTypeForFilename,
  downloadWakeItems,
  parseWakeItems,
  safeFilename,
} from "./items.js";

describe("parseWakeItems", () => {
  it("keeps photo and blob fields and drops incomplete rows", () => {
    const items = parseWakeItems([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        type: "photo",
        name: "a.png",
        url: "https://cdn.example/a.png",
        mime: "image/png",
        size: 10,
      },
      { id: "no-url", name: "x" },
      "skip",
    ]);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.name, "a.png");
    assert.equal(items[0]?.type, "photo");
  });
});

describe("safeFilename", () => {
  it("strips path components", () => {
    assert.equal(safeFilename("../../etc/passwd", "x"), "passwd");
  });
});

describe("contentTypeForFilename", () => {
  it("maps images and defaults to octet-stream", () => {
    assert.equal(contentTypeForFilename("a.PNG"), "image/png");
    assert.equal(contentTypeForFilename("a.pdf"), "application/octet-stream");
  });
});

describe("downloadWakeItems", () => {
  it("writes bytes and sets localPath", async () => {
    const dir = mkdtempSync(join(tmpdir(), "grokbot-dl-"));
    const fetchMock: typeof fetch = async () =>
      new Response(Buffer.from("hello-image"), { status: 200 });
    const [got] = await downloadWakeItems(
      [
        {
          id: "id1",
          type: "photo",
          name: "shot.png",
          url: "https://cdn.example/shot.png",
        },
      ],
      dir,
      { token: "rmk-x", fetch: fetchMock },
    );
    assert.ok(got?.localPath);
    assert.equal(readFileSync(got!.localPath!, "utf8"), "hello-image");
  });

  it("records an error without throwing when download fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "grokbot-dl-"));
    const fetchMock: typeof fetch = async () => new Response("nope", { status: 403 });
    const [got] = await downloadWakeItems(
      [{ id: "id1", type: "blob", name: "x.bin", url: "https://cdn.example/x" }],
      dir,
      { token: "rmk-x", fetch: fetchMock },
    );
    assert.equal(got?.error, "http_403");
    assert.equal(got?.localPath, undefined);
  });
});
