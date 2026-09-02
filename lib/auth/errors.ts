export type AuthErrorKey =
  | "notConfigured"
  | "invalidPhone"
  | "smsNotConfigured"
  | "rateLimit"
  | "invalidOtp"
  | "expiredOtp"
  | "generic";

type AuthLikeError = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
};

function haystack(error: AuthLikeError): string {
  return `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
}

export function classifyAuthError(error: AuthLikeError | null | undefined): AuthErrorKey {
  if (!error) {
    return "generic";
  }

  const code = (error.code ?? "").toLowerCase();
  const text = haystack(error);

  if (code === "otp_expired" || text.includes("expired")) {
    return "expiredOtp";
  }

  if (
    code === "otp_disabled" ||
    code === "invalid_grant" ||
    text.includes("token has expired or is invalid") ||
    text.includes("invalid otp") ||
    text.includes("invalid token")
  ) {
    return "invalidOtp";
  }

  if (
    code === "over_sms_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    text.includes("rate limit")
  ) {
    return "rateLimit";
  }

  if (
    code === "sms_send_failed" ||
    code === "phone_provider_disabled" ||
    text.includes("unsupported phone provider") ||
    text.includes("error sending confirmation sms") ||
    text.includes("unable to send sms") ||
    text.includes("sms provider") ||
    text.includes("twilio") ||
    ((error.status === 500 || error.status === 400) && text.includes("sms"))
  ) {
    return "smsNotConfigured";
  }

  if (
    code === "validation_failed" ||
    text.includes("invalid phone") ||
    text.includes("phone number")
  ) {
    return "invalidPhone";
  }

  return "generic";
}
