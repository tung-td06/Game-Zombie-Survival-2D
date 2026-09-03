import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import GameCanvas from "@/components/GameCanvas";

interface PlayPageProps {
  searchParams: Promise<{
    mode?: string;
    room?: string;
    name?: string;
    continue?: string;
  }>;
}

export default async function PlayPage({ searchParams }: PlayPageProps) {
  const cookieStore = await cookies();
  const sessionUser = cookieStore.get("session_user")?.value;
  if (!sessionUser) {
    redirect("/");
  }

  const params = await searchParams;
  return (
    <main style={{ position: "fixed", inset: 0, background: "#10120E" }}>
      <GameCanvas
        mode={params.mode}
        room={params.room}
        name={params.name}
        shouldContinue={params.continue === "1"}
      />
    </main>
  );
}
