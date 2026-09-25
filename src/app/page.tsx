import { isAuthed } from "@/lib/auth";
import { AppRoot } from "@/components/app-root";

export default async function Home() {
  return <AppRoot initialAuthed={await isAuthed()} />;
}
