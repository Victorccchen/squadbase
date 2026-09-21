/** Convert a VAPID applicationServerKey (URL-safe base64) for PushManager.subscribe. */

export function vapidPublicKeyToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const trimmed = value.trim();
  const padded = trimmed.padEnd(trimmed.length + ((4 - (trimmed.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new ArrayBuffer(raw.length);
  const out = new Uint8Array(bytes);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

export function pushManagerSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}
