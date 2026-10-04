/**
 * Initials for the avatar fallback.
 *
 * Deliberately not in session.ts: that module imports the server-only
 * auth instance, so a client component importing from it drags `pg`
 * and the whole database driver into the browser bundle, which fails
 * to resolve Node's `dns`/`fs`/`net`/`tls` built-ins.
 */
export function initialsOf(name: string | null | undefined): string {
  if (!name) {
    return "?";
  }
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}