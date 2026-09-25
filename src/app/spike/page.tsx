import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import SpikeLoader from "./spike-loader";

// Trang kỹ thuật để đo độ chính xác & độ trễ (Phase 0). Cần đăng nhập như app chính.
export default async function SpikePage() {
  if (!(await isAuthed())) redirect("/");
  return <SpikeLoader />;
}
