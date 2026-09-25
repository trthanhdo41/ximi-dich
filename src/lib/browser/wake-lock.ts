// Giữ màn hình luôn sáng trong lúc nghe (Screen Wake Lock API).
// Trình duyệt tự nhả khoá khi app bị ẩn, nên phải xin lại khi quay lại.

export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;

  private onVisible = () => {
    if (this.wanted && document.visibilityState === "visible") void this.acquire();
  };

  async enable() {
    this.wanted = true;
    document.addEventListener("visibilitychange", this.onVisible);
    await this.acquire();
  }

  private async acquire() {
    if (!("wakeLock" in navigator) || this.sentinel) return;
    try {
      this.sentinel = await navigator.wakeLock.request("screen");
      this.sentinel.addEventListener("release", () => {
        this.sentinel = null;
      });
    } catch {
      // Không hỗ trợ hoặc pin yếu: bỏ qua, app vẫn chạy.
    }
  }

  disable() {
    this.wanted = false;
    document.removeEventListener("visibilitychange", this.onVisible);
    void this.sentinel?.release();
    this.sentinel = null;
  }
}
