import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractImageLinks, extractVideoLinks } from "../src/sdk/markdown.ts";

describe("extractImageLinks", () => {
  it("keeps reading images without a title, as it always did", () => {
    assert.deepEqual(extractImageLinks("![Un haz](./attachments/01.jpg)"), [
      { alt: "Un haz", src: "./attachments/01.jpg" },
    ]);
  });

  it("reads the quoted title as a separate field", () => {
    // Antes el título se colaba dentro del src, la extensión dejaba de ser
    // .jpg y la imagen ni se subía: un pie de foto rompía el enlace.
    assert.deepEqual(
      extractImageLinks('![Un haz](./attachments/01.jpg "Amanecer, marzo")'),
      [{ alt: "Un haz", src: "./attachments/01.jpg", title: "Amanecer, marzo" }],
    );
  });

  it("tolerates padding inside the parentheses", () => {
    assert.deepEqual(extractImageLinks('![a]( ./b.png  "pie" )'), [
      { alt: "a", src: "./b.png", title: "pie" },
    ]);
  });

  it("keeps the order of the body, which is the hanging order", () => {
    const body = "![a](./1.png)\n\ntexto\n\n![b](./2.png \"dos\")";
    assert.deepEqual(
      extractImageLinks(body).map((i) => i.src),
      ["./1.png", "./2.png"],
    );
  });

  it("still tells videos apart from images", () => {
    const body = '![clip](./a.mp4 "pie")\n![foto](./b.png)';
    assert.deepEqual(
      extractImageLinks(body).map((i) => i.src),
      ["./b.png"],
    );
    assert.deepEqual(
      extractVideoLinks(body).map((v) => v.src),
      ["./a.mp4"],
    );
  });
});
