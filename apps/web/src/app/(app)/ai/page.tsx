import { requireSession } from "@/lib/session";

import AiTutor from "./ai-tutor";

/**
 * AI TUTOR — /ai
 * ------------------------------------------------------------
 * Auth required. This page was the only route in the app that never
 * called getSession()/requireSession(), so it rendered a full chat UI
 * to anyone who asked for it, and the API it talks to had no gate
 * either.
 *
 * The check lives here as well as in /api/ai on purpose. This one
 * stops an anonymous visitor seeing the page; the one in the route
 * stops a direct call to the endpoint. Either alone leaves a hole —
 * the UI's check is bypassable with curl, and the API's check alone
 * still ships a dead chat shell to logged-out visitors.
 *
 * The page itself is a thin server component so the redirect happens
 * before any of the chat UI is sent to the browser. The interactive
 * half lives in ./ai-tutor.
 */
export default async function AIPage(): Promise<React.JSX.Element> {
  const user = await requireSession("/ai");
  return <AiTutor name={user.name} />;
}