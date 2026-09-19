"use client";

import { useEffect } from "react";

/** Registers /sw.js so an already-opted-in parent can receive Web Push. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }, []);

  return null;
}
