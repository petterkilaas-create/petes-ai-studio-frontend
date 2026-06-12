"use client";

import { useEffect, useState, type ChangeEvent } from "react";

/**
 * Fil-valg + object-URL-preview med korrekt opprydding.
 *
 * Moenster trukket ut av scene-transform-debug (uendret referanse):
 * en object-URL opprettes naar `file` settes og revokeres i effektens
 * cleanup ved bytte/avmontering, slik at vi ikke lekker blob-URL-er.
 */
export interface UseImagePreviewResult {
  file: File | null;
  previewUrl: string | null;
  setFile: (file: File | null) => void;
  /** Bind direkte til <input type="file" onChange={...} />. */
  onInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  clear: () => void;
}

export function useImagePreview(): UseImagePreviewResult {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
  };

  const clear = () => setFile(null);

  return { file, previewUrl, setFile, onInputChange, clear };
}
