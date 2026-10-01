/** Header / sticky-bar destination. Signed-in visitors enter the app. */
export function portalAccountHref(signedIn: boolean): "/app" | "/login" {
  return signedIn ? "/app" : "/login";
}

export function portalAccountLabelKey(signedIn: boolean): "nav.app" | "nav.login" {
  return signedIn ? "nav.app" : "nav.login";
}
