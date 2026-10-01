export const PORTAL_NAV = [
  { href: "#about", key: "about" },
  { href: "#teams", key: "teams" },
  { href: "#matches", key: "matches" },
  { href: "#programs", key: "programs" },
  { href: "#news", key: "news" },
  { href: "#coaches", key: "coaches" },
  { href: "#contact", key: "contact" },
] as const;

export type PortalNavKey = (typeof PORTAL_NAV)[number]["key"];
