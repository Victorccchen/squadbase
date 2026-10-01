import { Jost, Noto_Sans_JP, Noto_Sans_TC } from "next/font/google";

const jost = Jost({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  variable: "--font-jost",
  display: "swap",
});

const notoTc = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto-tc",
  display: "swap",
  preload: false,
});

const notoJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto-jp",
  display: "swap",
  preload: false,
});

export const portalFontClassName = `${jost.variable} ${notoTc.variable} ${notoJp.variable}`;
