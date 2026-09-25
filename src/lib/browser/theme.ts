import { THEME_KEY, writeStorage } from "./storage";

export type Theme = "dark" | "light";

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function setTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
  writeStorage(THEME_KEY, theme);
}

/** Giao diện Sáng là mặc định; lựa chọn được lưu vào localStorage (khoá "theme"). */

/**
 * Đổi giao diện; nếu trình duyệt hỗ trợ, giao diện mới loang ra thành vòng tròn từ chỗ vừa chạm.
 * Tối là mặc định; lựa chọn được lưu để lần sau mở app không bị nháy màu (xem layout.tsx).
 */
export function applyTheme(theme: Theme, origin?: { x: number; y: number }) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!origin || reduce || !document.startViewTransition) return setTheme(theme);

  const transition = document.startViewTransition(() => setTheme(theme));
  const r = Math.hypot(
    Math.max(origin.x, innerWidth - origin.x),
    Math.max(origin.y, innerHeight - origin.y),
  );
  void transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${origin.x}px ${origin.y}px)`,
          `circle(${r}px at ${origin.x}px ${origin.y}px)`,
        ],
      },
      { duration: 650, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
    );
  });
}
