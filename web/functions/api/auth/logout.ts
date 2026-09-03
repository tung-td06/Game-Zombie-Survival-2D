export async function onRequestPost() {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Set-Cookie": "session_user=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
  });
  return new Response(JSON.stringify({ success: true }), { headers });
}
