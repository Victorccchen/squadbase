import { getPublicAppEnv, type PublicAppEnv } from "../env.ts";

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function getVapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
}

export function getVapidConfig(): VapidConfig | null {
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:staging-push@localhost";
  if (!publicKey || !privateKey) {
    return null;
  }
  return { publicKey, privateKey, subject };
}

/** Production send is out of scope until the owner confirms. */
export function canSendPushInAppEnv(env: PublicAppEnv = getPublicAppEnv()): boolean {
  return env === "local" || env === "staging";
}
