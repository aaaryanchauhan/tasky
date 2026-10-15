"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Accessible modal built on the native <dialog> (focus trap, Esc to close, backdrop). */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="modal-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-black/50"
    >
      {open ? (
        <div className="max-h-[85vh] overflow-y-auto p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 id="modal-title" className="text-lg font-bold">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="-mr-2 -mt-1 min-h-11 min-w-11 rounded-lg text-2xl leading-none text-ink-soft hover:bg-stone-100" aria-label="Close">
              ×
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
