import assert from "node:assert/strict";
import test from "node:test";
import {
  findEncryptedBlocks,
  formatPlaintextBlock,
  formatSealedBlock,
  parseSealedHeader,
  replaceBlockText,
  selectedBlock,
  selectionOverlapsSealedBlock,
  serializeSealedHeader,
} from "../src/blocks";
import type { SealedBlockHeader } from "../src/types";

const HEADER: SealedBlockHeader = {
  kid: "00000000-0000-4000-8000-000000000001",
  alg: "AES-GCM",
  iv: "AAECAwQFBgcICQoL",
  ct: "DA0ODxAREhMUFRYXGBkaGw",
};
const SEALED_LINE = "lockblock:v1:kid=00000000-0000-4000-8000-000000000001:alg=AES-GCM:iv=AAECAwQFBgcICQoL:ct=DA0ODxAREhMUFRYXGBkaGw";

test("version-1 sealed headers retain their exact serialized contract", () => {
  assert.equal(serializeSealedHeader(HEADER), SEALED_LINE);
  assert.deepEqual(parseSealedHeader(SEALED_LINE), HEADER);
});

test("malformed sealed headers are rejected", () => {
  const malformed = [
    "plain text",
    "lockblock:v1:",
    "lockblock:v1:kid=test:alg=AES-CBC:iv=iv:ct=ct",
    "lockblock:v1:kid=test:alg=AES-GCM:ct=ct",
    "lockblock:v1:kid=test:alg=AES-GCM:iv=iv",
    "lockblock:v1:kid=test:alg=AES-GCM:iv:ct=ct",
  ];

  for (const value of malformed) {
    assert.equal(parseSealedHeader(value), null, value);
  }
});

test("fence parsing supports backticks, tildes, metadata, and unclosed blocks", () => {
  const markdown = [
    "before",
    "```lockblock metadata",
    "synthetic plaintext",
    "```",
    "middle",
    "~~~~lockblock",
    SEALED_LINE,
    "~~~~",
    "after",
    "```lockblock",
    "unclosed plaintext",
  ].join("\n");
  const blocks = findEncryptedBlocks(markdown);

  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].sealed, false);
  assert.equal(blocks[0].body, "synthetic plaintext");
  assert.equal(blocks[1].sealed, true);
  assert.deepEqual(blocks[1].header, HEADER);
  assert.equal(blocks[2].closeFence, "");
  assert.equal(blocks[2].to, markdown.length);
});

test("formatting retains the fence style while normalizing the language", () => {
  const block = findEncryptedBlocks("~~~~lockblock metadata\nsynthetic plaintext\n~~~~")[0];

  assert.equal(formatSealedBlock(block, SEALED_LINE), `~~~~lockblock\n${SEALED_LINE}\n~~~~`);
  assert.equal(formatPlaintextBlock(block, "replacement"), "~~~~lockblock\nreplacement\n~~~~");
});

test("replacing a block preserves unrelated note content", () => {
  const markdown = `before\n\`\`\`lockblock\n${SEALED_LINE}\n\`\`\`\nafter`;
  const block = findEncryptedBlocks(markdown)[0];

  assert.equal(replaceBlockText(markdown, block, "replacement"), "before\nreplacement\nafter");
});

test("selection lookup requires containment and sealed-overlap detects partial intersections", () => {
  const markdown = `prefix\n\`\`\`lockblock\n${SEALED_LINE}\n\`\`\`\nsuffix`;
  const block = findEncryptedBlocks(markdown)[0];

  assert.deepEqual(selectedBlock(markdown, block.from + 1, block.to - 1), block);
  assert.equal(selectedBlock(markdown, block.from - 1, block.to - 1), null);

  assert.equal(selectionOverlapsSealedBlock(markdown, block.from, block.to), true);
  assert.equal(selectionOverlapsSealedBlock(markdown, block.from - 2, block.from + 1), true);
  assert.equal(selectionOverlapsSealedBlock(markdown, block.to - 1, block.to + 2), true);
  assert.equal(selectionOverlapsSealedBlock(markdown, block.from - 2, block.from), false);
  assert.equal(selectionOverlapsSealedBlock(markdown, block.to, block.to + 2), false);
});
