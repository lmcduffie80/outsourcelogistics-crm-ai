"use client";

import { useSyncExternalStore } from "react";

export type PendingReply = { inquiryId: string; body: string; nonce: number };

let pending: PendingReply | null = null;
const listeners = new Set<() => void>();

/** Hands an assistant draft to the reply composer of the matching inquiry, including after navigation. */
export function queueReply(inquiryId: string, body: string) {
  pending = { inquiryId, body, nonce: Date.now() };
  listeners.forEach((l) => l());
}

export function takeReply(nonce: number) {
  if (pending?.nonce === nonce) pending = null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePendingReply(inquiryId: string) {
  const reply = useSyncExternalStore(
    subscribe,
    () => pending,
    () => null,
  );
  return reply?.inquiryId === inquiryId ? reply : null;
}
