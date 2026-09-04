"use client";

import { useState } from "react";
import { secondaryButtonClassName } from "@/lib/ui";

type CopyTextButtonProps = {
  text: string;
  label: string;
  copiedLabel: string;
};

export function CopyTextButton({ text, label, copiedLabel }: CopyTextButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("clipboard", error);
    }
  }

  return (
    <button type="button" onClick={() => void copy()} className={secondaryButtonClassName}>
      {copied ? copiedLabel : label}
    </button>
  );
}
