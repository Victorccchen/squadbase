import { createClient } from "@/lib/supabase/server";
import type { Player, Task } from "@/lib/supabase/database.types";
import { inboxTasks, taskHref } from "@/lib/tasks/model";

export type TaskInboxItem = {
  task: Task;
  href: ReturnType<typeof taskHref>;
  /** The player the task is about, when the task points at one. */
  player: Player | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** Open (and woken snoozed) tasks for the admin home page. Admin-only via RLS. */
export async function listInboxTasks(now = new Date()): Promise<TaskInboxItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .in("status", ["open", "snoozed"])
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("listInboxTasks", error.message);
    return [];
  }

  const tasks = inboxTasks((data ?? []) as Task[], now);
  const idsFor = (entityType: string) =>
    tasks.filter((task) => task.entity_type === entityType && task.entity_id).map((task) => task.entity_id as string);

  const claimIds = idsFor("payment_claim");
  const linkIds = idsFor("guardian_link");
  const [claims, links] = await Promise.all([
    claimIds.length
      ? supabase.from("payment_claims").select("id, players(*)").in("id", claimIds)
      : Promise.resolve({ data: [], error: null }),
    linkIds.length
      ? supabase.from("guardian_player_links").select("id, players(*)").in("id", linkIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const playerBySubject = new Map<string, Player | null>();
  for (const row of [...(claims.data ?? []), ...(links.data ?? [])] as { id: string; players: unknown }[]) {
    playerBySubject.set(row.id, one(row.players as Player | Player[] | null));
  }

  return tasks.map((task) => ({
    task,
    href: taskHref(task.kind),
    player: task.entity_id ? playerBySubject.get(task.entity_id) ?? null : null,
  }));
}
