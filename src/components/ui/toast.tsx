"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ActionState } from "@/app/actions/shared";

type Toast = { id: number; message: string; tone: "ok" | "error" };

const ToastContext = createContext<{ show: (message: string, tone?: "ok" | "error") => void }>({ show: () => {} });

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, tone: "ok" | "error" = "ok") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <Suspense fallback={null}>
        <FlashFromUrl />
      </Suspense>
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${t.tone === "ok" ? "bg-ink" : "bg-red-700"}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Shows `?flash=…` set by a redirecting server action, then cleans the URL. */
function FlashFromUrl() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { show } = useToast();
  const flash = params.get("flash");

  useEffect(() => {
    if (!flash) return;
    show(flash.slice(0, 200));
    const next = new URLSearchParams(params.toString());
    next.delete("flash");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [flash, params, pathname, router, show]);

  return null;
}

/**
 * Wrap a server action so its message is toasted the moment the server responds. This must not
 * live in a component effect: a successful action often re-renders the page so the form that
 * triggered it unmounts in the same commit, and the toast would never be shown.
 */
export function useToastingAction(
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>,
  opts: { errors?: boolean } = {},
) {
  const { show } = useToast();
  const errors = opts.errors ?? false;
  return useCallback(
    async (prev: ActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result?.message && (result.ok || errors)) show(result.message, result.ok ? "ok" : "error");
      return result;
    },
    [action, show, errors],
  );
}
