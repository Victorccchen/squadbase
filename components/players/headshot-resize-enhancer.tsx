"use client";

import { useEffect } from "react";
import { HEADSHOT_MAX_EDGE_PX } from "@/lib/org/player-photos";

async function maybeResizeImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= HEADSHOT_MAX_EDGE_PX) {
      bitmap.close();
      return file;
    }
    const scale = HEADSHOT_MAX_EDGE_PX / longest;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const outputType = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outputType, 0.85);
    });
    if (!blob) {
      return file;
    }
    const ext = outputType === "image/png" ? ".png" : outputType === "image/webp" ? ".webp" : ".jpg";
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}${ext}`, { type: outputType });
  } catch {
    return file;
  }
}

/** Optional: shrinks a chosen headshot. The file input is server-rendered and stays if this fails. */
export function HeadshotResizeEnhancer({ inputId }: { inputId: string }) {
  useEffect(() => {
    const node = document.getElementById(inputId);
    if (!(node instanceof HTMLInputElement)) {
      return;
    }
    const fileInput: HTMLInputElement = node;
    async function onChange() {
      const file = fileInput.files?.[0];
      if (!file) {
        return;
      }
      const resized = await maybeResizeImage(file);
      if (resized === file) {
        return;
      }
      const transfer = new DataTransfer();
      transfer.items.add(resized);
      fileInput.files = transfer.files;
    }
    fileInput.addEventListener("change", onChange);
    return () => fileInput.removeEventListener("change", onChange);
  }, [inputId]);
  return null;
}
