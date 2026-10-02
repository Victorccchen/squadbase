import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { checkinUrl } from "@/lib/checkin/model";
import { publicAppOrigin } from "@/lib/credits/queries";
import type { Venue } from "@/lib/supabase/database.types";

/** Admin-only (RLS): venues with their secret check-in tokens. */
export async function listVenues(): Promise<Venue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("venues").select("*").order("name");
  if (error) {
    console.error("listVenues", error.message);
    return [];
  }
  return (data ?? []) as Venue[];
}

export async function getVenue(id: string): Promise<Venue | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("venues").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("getVenue", error.message);
    return null;
  }
  return (data as Venue | null) ?? null;
}

export type VenueQr = {
  url: string;
  svg: string;
  pngDataUrl: string;
  /** False when NEXT_PUBLIC_APP_URL is unset: the link then uses a per-deploy host and must not be printed. */
  stableOrigin: boolean;
};

/** QR for the counter: SVG for screen and print, PNG for download. */
export async function venueQr(venue: Pick<Venue, "checkin_token">): Promise<VenueQr> {
  const url = checkinUrl(publicAppOrigin() || "", venue.checkin_token);
  const [svg, pngDataUrl] = await Promise.all([
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
    QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M" }),
  ]);
  return { url, svg, pngDataUrl, stableOrigin: Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim()) };
}
