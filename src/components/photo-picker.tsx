"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { buttonClass } from "@/components/ui/button";
import { resizeToSquareJpeg } from "@/lib/image-resize";
import { PHOTO_ACCEPT } from "@/lib/photo";

/**
 * File input named "photo" that shrinks whatever is chosen (camera or gallery) before the form is
 * submitted. Sends `removePhoto=on` when the existing photo should be deleted.
 */
export function PhotoPicker({ fullName, currentUrl }: { fullName: string; currentUrl?: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const chosen = useRef<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // React resets uncontrolled form fields after a server action; re-attach the chosen photo so a
  // failed validation elsewhere in the form doesn't silently drop it.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const restore = () =>
      setTimeout(() => {
        if (chosen.current && inputRef.current) {
          const dt = new DataTransfer();
          dt.items.add(chosen.current);
          inputRef.current.files = dt.files;
        }
      }, 0);
    form.addEventListener("reset", restore);
    return () => form.removeEventListener("reset", restore);
  }, []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const small = await resizeToSquareJpeg(file);
      const dt = new DataTransfer();
      dt.items.add(small);
      e.target.files = dt.files;
      chosen.current = small;
      setPreview(URL.createObjectURL(small));
      setRemoved(false);
    } catch {
      e.target.value = "";
      chosen.current = null;
      setError("Couldn't read that photo. Try a JPEG or PNG.");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    chosen.current = null;
    setPreview(null);
    setRemoved(Boolean(currentUrl));
  }

  const shown = preview ?? (removed ? null : (currentUrl ?? null));

  return (
    <div className="flex items-center gap-4">
      <Avatar name={fullName || "?"} url={shown} size="lg" />
      <div className="min-w-0 space-y-2">
        <input
          ref={inputRef}
          id="photo"
          name="photo"
          type="file"
          accept={PHOTO_ACCEPT}
          onChange={onPick}
          className="peer sr-only"
        />
        <label htmlFor="photo" className={`${buttonClass("secondary", "md")} cursor-pointer peer-focus-visible:outline-3 peer-focus-visible:outline-tiger-500`}>
          {busy ? "Preparing…" : shown ? "Change photo" : "Add photo"}
        </label>
        {shown ? (
          <button type="button" onClick={clear} className="block min-h-9 text-sm font-semibold text-red-700 hover:underline">
            Remove photo
          </button>
        ) : null}
        {removed ? <input type="hidden" name="removePhoto" value="on" /> : null}
        <p className="text-xs text-ink-soft">Take a photo or choose one. It&apos;s resized on your phone.</p>
        {error ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
