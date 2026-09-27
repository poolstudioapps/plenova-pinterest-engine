"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether Aragog is let out, per browser: a switch in the menu turns it off
 * and on, and the choice is remembered on this computer. On by default.
 */

const KEY = "plenova:aragog";
const EVENT = "plenova:aragog";

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    // Storage refused (private window...): the default.
    return true;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  // Another tab changed it.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useAragogEnabled(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}

export function setAragogEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Not kept, but still applied for this page.
  }
  window.dispatchEvent(new Event(EVENT));
}
