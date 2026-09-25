import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// Cho phép mở dev server từ điện thoại trong cùng mạng Wi-Fi (http(s)://<IP máy>:3000).
const lanHosts = Object.values(networkInterfaces())
  .flat()
  .filter((net) => net && net.family === "IPv4" && !net.internal)
  .map((net) => net!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanHosts,
};

export default nextConfig;
