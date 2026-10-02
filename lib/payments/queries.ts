import { createClient } from "@/lib/supabase/server";
import type { Invoice, PaymentItem, Player } from "@/lib/supabase/database.types";

export const PAYMENT_PROOFS_BUCKET = "payment-proofs";

/** Active items for the parent form (RLS: active items, all for admins). */
export async function listPaymentItems(options: { includeInactive?: boolean } = {}): Promise<PaymentItem[]> {
  const supabase = await createClient();
  let query = supabase.from("payment_items").select("*").order("sort_order").order("created_at");
  if (!options.includeInactive) {
    query = query.eq("active", true);
  }
  const { data, error } = await query;
  if (error) {
    console.error("listPaymentItems", error.message);
    return [];
  }
  return (data ?? []) as PaymentItem[];
}

export type InvoiceWithPlayer = Invoice & { player: Player | null };

/** Admin: invoices still waiting for a number, oldest first. */
export async function listOpenInvoices(): Promise<InvoiceWithPlayer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .is("invoice_no", null)
    .order("created_at");
  if (error) {
    console.error("listOpenInvoices", error.message);
    return [];
  }
  const invoices = (data ?? []) as Invoice[];
  const playerIds = [...new Set(invoices.map((row) => row.player_id).filter((id): id is string => Boolean(id)))];
  const { data: players } = playerIds.length
    ? await supabase.from("players").select("*").in("id", playerIds)
    : { data: [] as Player[] };
  const byId = new Map((players ?? []).map((row) => [row.id, row as Player]));
  return invoices.map((row) => ({ ...row, player: row.player_id ? byId.get(row.player_id) ?? null : null }));
}

/** Short-lived links to proof screenshots (admin or the child's parent, by storage policy). */
export async function signProofPaths(paths: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const result = new Map<string, string>();
  if (wanted.length === 0) {
    return result;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(PAYMENT_PROOFS_BUCKET).createSignedUrls(wanted, 600);
  if (error) {
    console.error("signProofPaths", error.message);
    return result;
  }
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) {
      result.set(row.path, row.signedUrl);
    }
  }
  return result;
}
