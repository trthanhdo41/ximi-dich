// AudioWorklet: lấy mẫu micro (thường 44.1/48 kHz), hạ xuống 16 kHz mono PCM s16le
// và gửi về main thread mỗi ~100 ms. Hạ tần số bằng cách lấy trung bình theo từng ô
// (boxcar), đủ lọc chống răng cưa cho giọng nói.
const TARGET_RATE = 16000;
const CHUNK_SAMPLES = 1600; // 100 ms @ 16 kHz

class PcmDownsampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.nextBoundary = this.ratio;
    this.position = 0;
    this.sum = 0;
    this.count = 0;
    this.out = new Int16Array(CHUNK_SAMPLES);
    this.outIndex = 0;
    this.levelSum = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this.sum += channel[i];
      this.count++;
      this.position++;
      if (this.position >= this.nextBoundary) {
        const s = Math.max(-1, Math.min(1, this.sum / this.count));
        this.levelSum += s * s;
        this.out[this.outIndex++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        this.sum = 0;
        this.count = 0;
        this.nextBoundary += this.ratio;
        if (this.outIndex === CHUNK_SAMPLES) {
          const rms = Math.sqrt(this.levelSum / CHUNK_SAMPLES);
          const buffer = this.out.buffer;
          this.port.postMessage({ pcm: buffer, rms }, [buffer]);
          this.out = new Int16Array(CHUNK_SAMPLES);
          this.outIndex = 0;
          this.levelSum = 0;
        }
      }
    }
    // Tránh số thực trôi dần khi chạy hàng giờ.
    if (this.position > 1e7) {
      this.position -= 1e7;
      this.nextBoundary -= 1e7;
    }
    return true;
  }
}

registerProcessor("pcm-downsampler", PcmDownsampler);
