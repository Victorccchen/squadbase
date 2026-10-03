import type { MetadataRoute } from "next";
import { buildRobots } from "@/lib/site/robots";

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
