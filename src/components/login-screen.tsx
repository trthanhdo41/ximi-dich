"use client";

import { useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { BRAND } from "@/lib/brand";
import { CheckIcon, LockIcon } from "./icons";
import { Credit, Seal } from "./brand";
import { useToast } from "./toast";

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok">("idle");
  const shake = useAnimationControls();
  const seal = useAnimationControls();
  const { toast } = useToast();
  const fail = (message: string) => {
    setError(message);
    toast({ id: "login", kind: "error", message, duration: 4000 });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || status !== "idle") return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setStatus("ok");
        // Con dấu "đóng" một cái rồi mới vào app.
        void seal.start({ scale: [1, 1.25, 0.92, 1], rotate: [-3, 6, -6, 0], transition: { duration: 0.6 } });
        setTimeout(onSuccess, 750);
        return;
      }
      const data = await res.json().catch(() => ({}));
      fail(data.error ?? "Có lỗi, thử lại nhé.");
    } catch {
      fail("Không có mạng. Kiểm tra Wi-Fi hoặc 4G rồi thử lại.");
    }
    setStatus("idle");
    void shake.start({ x: [0, -14, 14, -9, 9, -4, 0], transition: { duration: 0.5 } });
  };

  return (
    <motion.main
      className="relative flex min-h-full flex-col items-center justify-center px-6 pt-16 pb-28"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -30, scale: 0.96 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative w-full max-w-sm">
        <motion.div
          className="mx-auto w-fit"
          initial={{ scale: 2, opacity: 0, rotate: -20 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.05 }}
        >
          <motion.div animate={seal} className="relative">
            <Seal size={84} />
          </motion.div>
        </motion.div>

        <motion.h1
          className="mt-8 text-center text-[32px] font-bold tracking-tight"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          {BRAND.appName}
        </motion.h1>
        <motion.p
          className="mt-2 text-center text-[15px] text-fg-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.32 }}
        >
          Nói chuyện với người nước ngoài — app dịch và đọc cho cả hai bên.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, type: "spring", stiffness: 240, damping: 24 }}
        >
          <motion.form onSubmit={submit} animate={shake} className="mt-10">
            <label className="group relative block">
              <span className="sr-only">Mật khẩu</span>
              <LockIcon className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-fg-3 transition-colors group-focus-within:text-accent" />
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                className={`h-14 w-full rounded-2xl bg-surface pr-4 pl-12 text-[17px] ring-1 transition-shadow outline-none placeholder:text-fg-3 focus:ring-2 ${
                  error ? "ring-danger/70" : "ring-line focus:ring-accent"
                }`}
              />
            </label>

            <motion.button
              type="submit"
              disabled={!password || status === "loading"}
              whileTap={{ scale: 0.97 }}
              animate={{ borderRadius: status === "ok" ? 28 : 16 }}
              className="relative mt-4 grid h-14 w-full place-items-center overflow-hidden btn-primary text-[17px] font-semibold text-on-accent transition-opacity disabled:opacity-40"
            >
              <AnimatePresence mode="wait" initial={false}>
                {status === "loading" ? (
                  <motion.span
                    key="spin"
                    className="block size-5 rounded-full border-2 border-on-accent/30 border-t-on-accent"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, rotate: 360 }}
                    exit={{ opacity: 0 }}
                    transition={{ rotate: { duration: 0.8, repeat: Infinity, ease: "linear" } }}
                  />
                ) : status === "ok" ? (
                  <motion.span
                    key="ok"
                    className="inline-flex items-center gap-2"
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                  >
                    <CheckIcon className="size-6" /> Chào em!
                  </motion.span>
                ) : (
                  <motion.span key="go" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                    Vào
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </motion.form>
        </motion.div>
      </div>

      <motion.div
        className="absolute inset-x-0 bottom-[max(2rem,env(safe-area-inset-bottom))]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        <Credit />
      </motion.div>
    </motion.main>
  );
}
