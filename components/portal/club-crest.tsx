import Image from "next/image";
import { siteConfig } from "@/lib/site/site-config";

type ClubCrestProps = {
  alt: string;
  className?: string;
  priority?: boolean;
};

export function ClubCrest({ alt, className, priority = false }: ClubCrestProps) {
  return (
    <Image
      src={siteConfig.crest.src}
      alt={alt}
      width={siteConfig.crest.width}
      height={siteConfig.crest.height}
      priority={priority}
      className={className}
    />
  );
}
