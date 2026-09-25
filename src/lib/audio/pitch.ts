// Đoán giọng nam / nữ theo cao độ (tần số cơ bản F0): giọng nam thường ~85–155 Hz, giọng nữ ~165–255 Hz.
// Chạy ngay trên máy, không gửi âm thanh đi đâu. Dùng để dịch đúng xưng hô (nam: "anh", nữ: "em")
// và chọn giọng đọc nam/nữ cho khớp.

export type Gender = "male" | "female";

/** Ranh giới nam / nữ (Hz). */
export const GENDER_SPLIT_HZ = 165;

/**
 * Cao độ trung vị (Hz) của một đoạn giọng nói PCM 16-bit, hoặc null nếu quá ít đoạn có tiếng rõ.
 * Tự tương quan trên từng khung ~64 ms (hạ xuống 8 kHz cho nhẹ), chỉ lấy khung có tiếng nói rõ.
 */
export function medianPitch(samples: Int16Array, sampleRate = 16000): number | null {
  const step = Math.max(1, Math.round(sampleRate / 8000));
  const rate = sampleRate / step;
  const n = Math.floor(samples.length / step);
  if (n < rate * 0.3) return null;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = samples[i * step] / 32768;

  const frame = 512;
  const hop = 256;
  const minLag = Math.floor(rate / 350);
  const maxLag = Math.ceil(rate / 70);
  const found: number[] = [];
  for (let start = 0; start + frame + maxLag < n; start += hop) {
    let energy = 0;
    for (let i = 0; i < frame; i++) energy += x[start + i] * x[start + i];
    if (Math.sqrt(energy / frame) < 0.02) continue;
    let bestLag = 0;
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      let e2 = 0;
      for (let i = 0; i < frame; i++) {
        const b = x[start + i + lag];
        sum += x[start + i] * b;
        e2 += b * b;
      }
      const r = sum / Math.sqrt(energy * e2 + 1e-9);
      if (r > best) {
        best = r;
        bestLag = lag;
      }
    }
    // Chỉ lấy khung "có thanh" rõ ràng (tương quan cao).
    if (best > 0.6 && bestLag) found.push(rate / bestLag);
  }
  if (found.length < 5) return null;
  found.sort((a, b) => a - b);
  return found[Math.floor(found.length / 2)];
}

export function genderOf(pitchHz: number): Gender {
  return pitchHz < GENDER_SPLIT_HZ ? "male" : "female";
}
