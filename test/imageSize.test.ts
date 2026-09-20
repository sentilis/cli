import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readImageSize } from "../src/sdk/imageSize.ts";

/** PNG mínimo: firma + un IHDR con las medidas en su sitio. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); // longitud del chunk
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function gif(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(13);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // "GIF89a"
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return bytes;
}

/** JPEG: dos segmentos antes del marco, para obligar a recorrerlos. */
function jpeg(width: number, height: number): Uint8Array {
  const head = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08];
  const bytes = new Uint8Array(head.length + sof.length + 4 + 8);
  bytes.set(head, 0);
  bytes.set(sof, head.length);
  const view = new DataView(bytes.buffer);
  view.setUint16(head.length + sof.length, height);
  view.setUint16(head.length + sof.length + 2, width);
  return bytes;
}

function webpLossy(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  const enc = new TextEncoder();
  bytes.set(enc.encode("RIFF"), 0);
  bytes.set(enc.encode("WEBP"), 8);
  bytes.set(enc.encode("VP8 "), 12);
  bytes.set([0x9d, 0x01, 0x2a], 23);
  const view = new DataView(bytes.buffer);
  view.setUint16(26, width, true);
  view.setUint16(28, height, true);
  return bytes;
}

function webpExtended(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  const enc = new TextEncoder();
  bytes.set(enc.encode("RIFF"), 0);
  bytes.set(enc.encode("WEBP"), 8);
  bytes.set(enc.encode("VP8X"), 12);
  const w = width - 1;
  const h = height - 1;
  bytes.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24);
  bytes.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27);
  return bytes;
}

describe("readImageSize", () => {
  it("reads a PNG header", () => {
    assert.deepEqual(readImageSize(png(1200, 800)), {
      width: 1200,
      height: 800,
    });
  });

  it("reads a GIF header, which stores its size little-endian", () => {
    assert.deepEqual(readImageSize(gif(640, 480)), { width: 640, height: 480 });
  });

  it("walks JPEG segments until it finds the frame", () => {
    assert.deepEqual(readImageSize(jpeg(1024, 768)), {
      width: 1024,
      height: 768,
    });
  });

  it("reads a lossy WebP", () => {
    assert.deepEqual(readImageSize(webpLossy(300, 200)), {
      width: 300,
      height: 200,
    });
  });

  it("reads an extended WebP, where the size is stored minus one", () => {
    assert.deepEqual(readImageSize(webpExtended(4000, 3000)), {
      width: 4000,
      height: 3000,
    });
  });

  it("is null for something it does not recognise, instead of guessing", () => {
    assert.equal(readImageSize(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), null);
  });

  it("is null for a truncated file", () => {
    assert.equal(readImageSize(png(10, 10).slice(0, 12)), null);
  });
});
