/**
 * WHERE A KEY MAY BE SENT
 * ---------------------------------------------------------------------------
 * The tutor talks to whatever address the reader typed. That is the whole
 * point of bring-your-own-key, and it is also the one place where the app can
 * be talked into handing a secret to the wrong host: a reader who is sent a
 * "free model" address by somebody else is typing the address of the person
 * who sent it.
 *
 * So an address has to clear four bars before a key goes near it:
 *
 *   · it is HTTPS — an http address sends the key in clear;
 *   · it carries no username or password — `https://key@host/` would leak the
 *     key into every proxy log between here and there;
 *   · its host is not a loopback, link-local, private or carrier-grade-NAT
 *     address — a phone on a café network must not be pointed at the router,
 *     the device itself, or a cloud metadata endpoint;
 *   · it is not a name that only resolves on a local network (`.local`,
 *     `.internal`, `localhost`).
 *
 * WHAT THIS DOES NOT DO
 * ---------------------------------------------------------------------------
 * It does not stop DNS rebinding: a public name that resolves to a private
 * address at request time is indistinguishable from a public name until the
 * connection is made, and React Native's fetch does not expose the resolved
 * address. The reader is adding a provider they chose, not following a link,
 * so the remaining risk is a reader who was socially engineered — and the
 * screen says which host the key is about to go to.
 */
/**
 * Reduce an address to the base a request is built from.
 *
 * Kept here rather than in `storage/provider.ts` so the guard and the storage
 * layer can both use it without importing each other.
 */
export function normaliseBaseUrl(raw: string): string {
  let url = raw.trim();
  if (url.length === 0) return "";
  // A reader who pasted the whole endpoint gets the base back.
  url = url.replace(/\/+$/, "");
  url = url.replace(/\/chat\/completions$/i, "");
  url = url.replace(/\/completions$/i, "");
  return url.replace(/\/+$/, "");
}

export type ProviderUrlCheck =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: string };

/** A dotted quad, as four numbers. */
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isPrivateIpv4(host: string): boolean {
  const match = IPV4.exec(host);
  if (match === null) return false;
  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((n) => n > 255)) return true; // not an address at all
  const [a, b] = octets as [number, number, number, number];

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 192 && b === 0) return true; // 192.0.0/24 + 192.0.2/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "::" || h === "::1") return true;
  if (h.startsWith("fe80:")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local
  if (h.startsWith("::ffff:")) {
    // An IPv4-mapped address: judge the part after the prefix.
    return isPrivateIpv4(h.slice("::ffff:".length));
  }
  return false;
}

function isLocalName(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".home.arpa")
  );
}

/**
 * Check an address a key is about to be sent to.
 *
 * The returned `url` is the base the request should be built from — the same
 * shape `normaliseBaseUrl` produces, so the caller does not have to normalise
 * twice.
 */
export function checkProviderUrl(raw: string): ProviderUrlCheck {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "Give the address the text completions live at." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "That is not a web address. It should start with https://." };
  }

  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      reason: "The address has to be https. An http endpoint would send your key in clear.",
    };
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return {
      ok: false,
      reason: "Take the username and password out of the address. A key belongs in the key field, not in the URL.",
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (host.length === 0) {
    return { ok: false, reason: "That address has no host in it." };
  }
  if (isLocalName(host) || isPrivateIpv4(host) || isPrivateIpv6(host)) {
    return {
      ok: false,
      reason:
        "That address points at this device or a private network. A provider has to be reachable on the public internet.",
    };
  }

  /*
   * The base is origin plus path, and nothing else. A query string or a
   * fragment on a BASE address has no meaning — `/chat/completions` is
   * appended to it — so carrying one through would build a nonsense URL.
   */
  return { ok: true, url: normaliseBaseUrl(`${parsed.origin}${parsed.pathname}`) };
}
