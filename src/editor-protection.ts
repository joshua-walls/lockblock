import { EditorState } from "@codemirror/state";
import type { Extension, Transaction } from "@codemirror/state";
import { findEncryptedBlocks } from "./blocks";
import type LockblockPlugin from "./main";

export function createLockblockEditProtection(plugin: LockblockPlugin): Extension {
  return EditorState.changeFilter.of((transaction: Transaction) => {
    if (!transaction.docChanged || plugin.isVaultUnlocked()) {
      return true;
    }

    const protectedBlocks = findEncryptedBlocks(transaction.startState.doc.toString()).filter((block) => block.header !== null);
    if (protectedBlocks.length === 0) {
      return true;
    }

    let blocked = false;
    transaction.changes.iterChanges((fromA, toA) => {
      if (blocked) {
        return;
      }

      blocked = protectedBlocks.some((block) => rangesTouchOrOverlap(fromA, toA, block.from, block.to));
    });

    if (blocked) {
      window.setTimeout(() => plugin.notifyLockedEditBlocked(), 0);
      return false;
    }

    return true;
  });
}

function rangesTouchOrOverlap(changeFrom: number, changeTo: number, blockFrom: number, blockTo: number): boolean {
  if (changeFrom === changeTo) {
    return changeFrom >= blockFrom && changeFrom <= blockTo;
  }

  return changeFrom < blockTo && changeTo > blockFrom;
}
