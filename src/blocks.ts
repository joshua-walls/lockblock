import { LOCKBLOCK_BLOCK_LANGUAGE, SEALED_PREFIX } from "./constants";
import type { EncryptedBlock, SealedBlockHeader } from "./types";

const FENCE_RE = /^(`{3,}|~{3,})([^\n]*)$/;

export function findEncryptedBlocks(markdown: string): EncryptedBlock[] {
  const lines = markdown.split("\n");
  const offsets = lineOffsets(lines);
  const blocks: EncryptedBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const match = line.match(FENCE_RE);

    if (!match || !isEncryptedFence(match[2])) {
      index += 1;
      continue;
    }

    const fenceMarker = match[1][0];
    const fenceLength = match[1].length;
    const bodyStartLine = index + 1;
    let search = bodyStartLine;
    let bodyEndLine = lines.length;
    let closeFence = "";

    while (search < lines.length) {
      const closeLine = lines[search];
      const closeMatch = closeLine.match(/^(`{3,}|~{3,})\s*$/);
      if (closeMatch && closeMatch[1][0] === fenceMarker && closeMatch[1].length >= fenceLength) {
        bodyEndLine = search;
        closeFence = closeLine;
        break;
      }
      search += 1;
    }

    const body = lines.slice(bodyStartLine, bodyEndLine).join("\n");
    const to = closeFence ? offsets[bodyEndLine] + closeFence.length : markdown.length;
    const header = parseSealedHeader(body.trim());

    blocks.push({
      from: offsets[index],
      to,
      openFence: line,
      closeFence,
      body,
      sealed: header !== null,
      header,
    });

    index = closeFence ? bodyEndLine + 1 : lines.length;
  }

  return blocks;
}

export function formatSealedBlock(block: EncryptedBlock, sealedLine: string): string {
  const closeFence = block.closeFence || block.openFence.match(/^(`{3,}|~{3,})/)?.[1] || "```";
  return `${formatLockblockOpenFence(block.openFence)}\n${sealedLine}\n${closeFence}`;
}

export function formatPlaintextBlock(block: EncryptedBlock, plaintext: string): string {
  const closeFence = block.closeFence || block.openFence.match(/^(`{3,}|~{3,})/)?.[1] || "```";
  return `${formatLockblockOpenFence(block.openFence)}\n${plaintext}\n${closeFence}`;
}

export function serializeSealedHeader(header: SealedBlockHeader): string {
  return `${SEALED_PREFIX}kid=${header.kid}:alg=${header.alg}:iv=${header.iv}:ct=${header.ct}`;
}

export function parseSealedHeader(value: string): SealedBlockHeader | null {
  if (!value.startsWith(SEALED_PREFIX)) {
    return null;
  }

  const pieces = value.slice(SEALED_PREFIX.length).split(":");
  const entries = new Map<string, string>();
  for (const piece of pieces) {
    const separator = piece.indexOf("=");
    if (separator <= 0) {
      return null;
    }
    entries.set(piece.slice(0, separator), piece.slice(separator + 1));
  }

  const kid = entries.get("kid");
  const alg = entries.get("alg");
  const iv = entries.get("iv");
  const ct = entries.get("ct");

  if (!kid || alg !== "AES-GCM" || !iv || !ct) {
    return null;
  }

  return { kid, alg, iv, ct };
}

export function selectedBlock(markdown: string, selectionStart: number, selectionEnd: number): EncryptedBlock | null {
  const selectionMin = Math.min(selectionStart, selectionEnd);
  const selectionMax = Math.max(selectionStart, selectionEnd);
  return findEncryptedBlocks(markdown).find((block) => selectionMin >= block.from && selectionMax <= block.to) ?? null;
}

function isEncryptedFence(info: string): boolean {
  const language = info.trim().split(/\s+/)[0];
  return language === LOCKBLOCK_BLOCK_LANGUAGE;
}

function formatLockblockOpenFence(openFence: string): string {
  const match = openFence.match(/^(`{3,}|~{3,})/);
  return `${match?.[1] ?? "```"}${LOCKBLOCK_BLOCK_LANGUAGE}`;
}

function lineOffsets(lines: string[]): number[] {
  const offsets: number[] = [];
  let offset = 0;

  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }

  return offsets;
}
