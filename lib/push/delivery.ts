/**
 * Web Push delivery helpers. No automatic retries (no retry storms).
 * 410 / gone endpoints are disabled; other failures are counted once.
 */

export type PushDeliveryAttempt = {
  endpoint: string;
  userId: string;
  statusCode: number | null;
  ok: boolean;
};

export type PushDeliveryPlan = {
  sentUserIds: string[];
  failedUserIds: string[];
  goneEndpoints: string[];
  sent: number;
  failed: number;
};

const GONE_STATUS_CODES = new Set([404, 410]);

export function isGonePushStatus(statusCode: number | null | undefined): boolean {
  if (statusCode == null) {
    return false;
  }
  return GONE_STATUS_CODES.has(statusCode);
}

export function pushStatusCodeFromError(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const record = error as { statusCode?: unknown; status?: unknown };
  if (typeof record.statusCode === "number") {
    return record.statusCode;
  }
  if (typeof record.status === "number") {
    return record.status;
  }
  return null;
}

/**
 * One attempt per subscription. A user counts as sent if any endpoint
 * succeeded. Gone endpoints are listed for disable/delete, never retried.
 */
export function summarizePushDelivery(
  attempts: readonly PushDeliveryAttempt[],
  subscribedUserIds: readonly string[],
): PushDeliveryPlan {
  const sent = new Set<string>();
  const goneEndpoints: string[] = [];

  for (const attempt of attempts) {
    if (attempt.ok) {
      sent.add(attempt.userId);
    }
    if (isGonePushStatus(attempt.statusCode)) {
      goneEndpoints.push(attempt.endpoint);
    }
  }

  const failedUserIds = subscribedUserIds.filter((id) => !sent.has(id));
  return {
    sentUserIds: [...sent],
    failedUserIds,
    goneEndpoints: [...new Set(goneEndpoints)],
    sent: sent.size,
    failed: failedUserIds.length,
  };
}

export function shouldRetryPushAttempt(statusCode: number | null): boolean {
  void statusCode;
  return false;
}
