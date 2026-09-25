"use client";

import dynamic from "next/dynamic";

// Chỉ render phía trình duyệt: trang dùng micro, Web Audio và localStorage.
const SpikeClient = dynamic(() => import("./spike-client"), { ssr: false });

export default function SpikeLoader() {
  return <SpikeClient />;
}
