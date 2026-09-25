"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, MotionConfig } from "motion/react";
import { LoginScreen } from "./login-screen";
import dynamic from "next/dynamic";

// Màn hình chính đọc localStorage ngay khi khởi tạo nên chỉ chạy trong trình duyệt.
const MeetingScreen = dynamic(() => import("./meeting-screen").then((m) => m.MeetingScreen), {
  ssr: false,
});
import { Splash } from "./splash";
import { ToastProvider } from "./toast";

export function AppRoot({ initialAuthed }: { initialAuthed: boolean }) {
  const [authed, setAuthed] = useState(initialAuthed);
  const [splash, setSplash] = useState(true);
  const endSplash = useCallback(() => setSplash(false), []);

  return (
    // Tôn trọng cài đặt "Giảm chuyển động" của máy.
    <MotionConfig reducedMotion="user">
      <ToastProvider>
      <AnimatePresence mode="wait">
        {splash ? (
          <Splash key="splash" onDone={endSplash} />
        ) : authed ? (
          <MeetingScreen key="app" />
        ) : (
          <LoginScreen key="login" onSuccess={() => setAuthed(true)} />
        )}
      </AnimatePresence>
      </ToastProvider>
    </MotionConfig>
  );
}
