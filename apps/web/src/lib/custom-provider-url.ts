import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * CUSTOM PROVIDER ENDPOINTS — the one place a reader-supplied string is
 * allowed to become a host the server will talk to.
 * ------------------------------------------------------------
 *
 * WHY THIS FILE EXISTS AT ALL, WHEN THERE IS ALREADY AN ALLOWLIST
 * ------------------------------------------------------------
 * `lib/providers.ts` is an allowlist, and it exists so a stored
 * `provider` slug cannot point the server at an arbitrary host. Custom
 * routing deliberately gives that up: the reader names their own
 * OpenAI-compatible endpoint and their own key goes to it. That is the
 * feature. What follows is the control that replaces the allowlist, and
 * it is worth being plain about which parts of it are strong and which
 * are best-effort.
 *
 * WHAT IS ENFORCED
 * ------------------------------------------------------------
 *   · https only. An http base URL puts the reader's API key on the
 *     wire in cleartext, and the whole point of the sealing at rest is
 *     that the credential is not casually exposed.
 *   · no credentials in the URL. `https://user:pass@host` would put the
 *     secret in a string that gets logged, serialised and echoed back
 *     in an error message.
 *   · no query, no fragment. Neither is meaningful in a base URL and
 *     both are a way to smuggle a second destination past a reader who
 *     is looking at the host.
 *   · the host is not a name that can only resolve inside a private
 *     network — `localhost`, `*.local`, `*.internal`, `*.lan`, the
 *     `.home.arpa` reverse-DNS space, and the reserved TLDs that by
 *     definition resolve nowhere public.
 *   · EVERY address the host resolves to is a global unicast address.
 *     Not "at least one": a name with one public A record and one
 *     `127.0.0.1` A record is refused outright, because which one the
 *     next connection picks is not ours to decide.
 *   · an IP literal is checked directly and does not get to skip the
 *     range checks by being written as a number instead of a name.
 *
 * WHAT IS NOT ENFORCED, AND WHY IT IS STILL WORTH HAVING
 * ------------------------------------------------------------
 * The DNS answer is a moment in time. Between the check here and the
 * provider call later, the name can be re-pointed at an address that
 * would have been refused — a DNS rebind. Closing that completely means
 * pinning the resolved address for the life of the connection and
 * refusing anything that is not the address we checked, which is real
 * work with its own failure modes, and which this file therefore does
 * not claim to have done.
 *
 * What is done instead is layered, and each layer holds independently:
 * the address set is re-checked on the call path (see
 * `assertPublicHost` in `tutor-model.ts`), redirects are refused rather
 * than followed, and the worst case of a rebind is bounded — a custom
 * provider can only ever carry its OWN reader's credential, so the
 * thing an attacker reaches is a server-side GET to a private address
 * made with a key that belonged to the same reader, rather than a
 * credential exfiltration. That is still a real weakness and it is
 * written down here rather than left for the next person to assume
 * away.
 *
 * IT IS ALSO WORTH REMEMBERING WHAT THE ALLOWLIST WAS ACTUALLY FOR.
 * It stopped a crafted `provider` value widening what the server will
 * call. That is still true for every built-in provider. A custom
 * provider is a row a reader created for themselves, scoped to their
 * own `user_id` at every query, so the thing the allowlist protected is
 * not gone — it is now behind a per-user boundary instead of a global
 * list.
 */

export type CustomUrlResult =
  | { readonly ok: true; readonly baseUrl: string; readonly host: string }
  | { readonly ok: false; readonly problem: string };

/**
 * The resolver, as a parameter.
 *
 * Present so this file can be tested without a network: the decision
 * "is every address this host resolves to globally routable" is the whole
 * of the control, and it cannot be exercised against the real resolver
 * because the interesting cases are names that must NOT be looked up.
 * Defaults to the real thing; the test passes a table.
 */
export type Resolver = (host: string) => Promise<ReadonlyArray<{ address: string }>>;

const defaultResolver: Resolver = async (host) =>
  lookup(host, { all: true, verbatim: true });

/**
 * Suffixes that cannot name a public host.
 *
 * `.test`, `.invalid`, `.example` and `.localhost` are reserved by
 * RFC 2606 / RFC 6761 precisely so they never resolve publicly, and
 * `.local` is mDNS. The rest are the suffixes an internal deployment
 * actually uses, and each of them is a way to say "this is on our
 * network" without writing an address that a range check would catch.
 */
const PRIVATE_SUFFIXES = [
  ".local",
  ".localhost",
  ".internal",
  ".intranet",
  ".private",
  ".corp",
  ".home",
  ".lan",
  ".home.arpa",
  ".in-addr.arpa",
  ".ip6.arpa",
  ".test",
  ".invalid",
  ".example",
  ".onion",
] as const;

/** Long enough for any real endpoint, short enough that it is obviously not one. */
const MAX_URL_CHARS = 300;

function fail(problem: string): CustomUrlResult {
  return { ok: false, problem };
}

/* ------------------------------------------------------------
   IP RANGE CHECKS
   ------------------------------------------------------------ */

/**
 * Is this IPv4 address one the server should never be asked to reach?
 *
 * Written as explicit CIDR comparisons rather than pulled from a
 * library because the list is short, the boundaries are the point, and
 * a reviewer should be able to read off exactly which ranges are
 * refused without trusting a regular expression somebody else wrote.
 *
 * The ranges, and why each is here:
 *
 *   0.0.0.0/8          "this network", and 0.0.0.0 itself
 *   10/8               private
 *   100.64/10          CGNAT — carrier-grade NAT, i.e. someone's LAN
 *   127/8              loopback
 *   169.254/16         link-local, and with it 169.254.169.254, the
 *                      cloud instance-metadata address. This is the
 *                      single most valuable entry on the list: it is
 *                      reachable from inside a VM with no
 *                      authentication on many clouds.
 *   172.16/12          private
 *   192.0.0/24         IETF protocol assignments
 *   192.0.2/24         TEST-NET-1
 *   192.168/16         private
 *   198.18/15          benchmarking
 *   198.51.100/24      TEST-NET-2
 *   203.0.113/24       TEST-NET-3
 *   224/4              multicast
 *   240/4              reserved, and with it 255.255.255.255
 */
function isBlockedIPv4(address: string): boolean {
  const parts = address.split(".");
  if (parts.length !== 4) return true;
  const octets = parts.map((p) => {
    if (!/^\d{1,3}$/.test(p)) return Number.NaN;
    return Number(p);
  });
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = octets as [number, number, number, number];

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 0 && octets[2] === 0) return true; // 192.0.0/24
  if (a === 192 && b === 0 && octets[2] === 2) return true; // TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15
  if (a === 198 && b === 51 && octets[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && octets[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

/**
 * Expand an IPv6 literal to its sixteen bytes.
 *
 * Hand-rolled rather than imported because the only consumer needs a
 * prefix test and `node:net` will not hand over the bytes of a string
 * address. Handles the embedded-IPv4 spellings (`::ffff:127.0.0.1`,
 * `64:ff9b::7f00:1`) because those are exactly the spellings that walk
 * past a prefix-only check: the address reads as a v6 range nobody
 * recognises, and the traffic goes to 127.0.0.1.
 */
function ipv6Bytes(address: string): Uint8Array | null {
  const zone = address.indexOf("%");
  const bare = zone === -1 ? address : address.slice(0, zone);
  if (bare.length === 0) return null;

  const halves = bare.split("::");
  if (halves.length > 2) return null;

  const toBytes = (chunk: string): number[] | null => {
    if (chunk === "") return [];
    const groups = chunk.split(":");
    const out: number[] = [];
    for (const [index, group] of groups.entries()) {
      // A trailing dotted-quad is the last group and stands for 32 bits.
      if (group.includes(".")) {
        if (index !== groups.length - 1) return null;
        const v4 = group.split(".");
        if (v4.length !== 4) return null;
        for (const p of v4) {
          if (!/^\d{1,3}$/.test(p)) return null;
          const n = Number(p);
          if (n > 255) return null;
          out.push(n);
        }
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      const n = parseInt(group, 16);
      out.push((n >> 8) & 0xff, n & 0xff);
    }
    return out;
  };

  const head = toBytes(halves[0]);
  const tail = halves.length === 2 ? toBytes(halves[1]) : [];
  if (head === null || tail === null) return null;

  if (halves.length === 2) {
    const fill = 16 - head.length - tail.length;
    if (fill < 0) return null;
    return new Uint8Array([...head, ...new Array<number>(fill).fill(0), ...tail]);
  }
  return head.length === 16 ? new Uint8Array(head) : null;
}

function isBlockedIPv6(address: string): boolean {
  const bytes = ipv6Bytes(address);
  if (bytes === null) return true;

  const allZeroFrom = (start: number): boolean => {
    for (let i = start; i < 16; i++) if (bytes[i] !== 0) return false;
    return true;
  };

  if (allZeroFrom(0)) return true; // ::  unspecified
  if (bytes.subarray(0, 15).every((b) => b === 0) && bytes[15] === 1) return true; // ::1 loopback

  // ::ffff:0:0/96 — IPv4-mapped. Check the four bytes at the end as IPv4,
  // which is the entire point: `::ffff:127.0.0.1` is loopback.
  const v4Mapped =
    bytes.subarray(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  // 64:ff9b::/96 — IPv4-translated (RFC 6052).
  const v4Translated =
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes.subarray(4, 12).every((b) => b === 0);
  if (v4Mapped || v4Translated) {
    const inner = `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
    return isBlockedIPv4(inner);
  }

  if (bytes[0] === 0x01 && bytes[1] === 0x00 && bytes.subarray(2, 8).every((b) => b === 0)) {
    return true; // 100::/64 discard-only
  }
  // 2001:db8::/32 documentation
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) {
    return true;
  }
  // fc00::/7 unique-local
  if ((bytes[0] & 0xfe) === 0xfc) return true;
  // fe80::/10 link-local
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true;
  // ff00::/8 multicast
  if (bytes[0] === 0xff) return true;

  return false;
}

/** Is this address literal one the server should never reach? */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIPv4(address);
  if (family === 6) return isBlockedIPv6(address);
  // Not an address at all. Reaching here means something upstream
  // handed us a hostname, and refusing is the safe reading of it.
  return true;
}

/** Why a host is unusable, or null when it looks public. Synchronous. */
export function blockedHostReason(rawHost: string): string | null {
  /*
    BRACKETS OFF FIRST.

    `new URL("https://[::1]/").hostname` is "[::1]", brackets included —
    they are part of the URL syntax, not of the host. `node:net`'s
    isIP does not accept them either, so without this strip an IPv6
    literal falls through every range check as a name, hits the bare
    single-label rule below, and is refused for the wrong reason. Worse,
    the same mistake in the allow direction would let a private v6
    address through as a name it could not parse.
  */
  const lower = rawHost
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");

  if (lower === "localhost" || lower.endsWith(".localhost")) {
    return "that is this machine";
  }
  for (const suffix of PRIVATE_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      return `a \`${suffix}\` address cannot be reached from the internet`;
    }
  }
  // A bare label with no dot is a machine on the local network by
  // convention, and is never a public host. Checked after the IP
  // branches below conceptually, but written here because an IPv6
  // literal also contains no dot — hence the isIP guard, which is the
  // difference between refusing `::1` and refusing it for the truth.
  const literal = isIP(lower);
  if (literal === 0) {
    if (!lower.includes(".")) {
      return "a bare hostname resolves inside a local network";
    }
    return null;
  }
  if (isBlockedAddress(lower)) {
    return "that address is private, reserved, or loopback";
  }
  return null;
}

/**
 * Normalise an accepted URL into the string that will be handed to the
 * AI SDK as its `baseURL`.
 *
 * Trailing slash removed rather than added: the SDK appends `/chat/completions`
 * to whatever it is given, and a base of `https://host/v1/` produces a
 * double slash in the path, which several OpenAI-compatible servers treat
 * as a different route. The reader is told the `…/v1` form in the field's
 * hint for the same reason.
 */
function normalise(url: URL): string {
  /*
    The PATH AS PARSED, not as typed.

    `new URL` resolves `..` itself, so `https://host/v1/../admin` arrives
    here as `/admin`. That is the right thing to store rather than a
    reason to refuse: the value written to the database is byte-for-byte
    the value the SDK will call, so a reader can never be shown one path
    in Settings and have a different one used.
  */
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

/**
 * Validate a reader-supplied provider address.
 *
 * Resolves DNS, so it is async and it can fail on a transient resolver
 * error. That failure is reported as a failure rather than treated as a
 * pass: "could not check" and "checked and fine" must never be the same
 * answer.
 */
export async function validateCustomProviderUrl(
  input: unknown,
  resolve: Resolver = defaultResolver,
): Promise<CustomUrlResult> {
  if (typeof input !== "string") {
    return fail("The provider address has to be text.");
  }
  const raw = input.trim();
  if (raw.length === 0) {
    return fail("Enter the provider address, for example https://api.example.com/v1");
  }
  if (raw.length > MAX_URL_CHARS) {
    return fail("That address is too long to be a provider endpoint.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail("That is not a URL. It needs to start with https://");
  }

  if (url.protocol !== "https:") {
    return fail("The address has to be https. An http endpoint would send your key in clear.");
  }
  if (url.username !== "" || url.password !== "") {
    return fail("Put the key in the key field, not in the address as user:password@.");
  }
  if (url.search !== "" || url.hash !== "") {
    return fail("The address cannot carry a ?query or a #fragment.");

  }

  const host = url.hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
  if (host === "") {
    return fail("That URL has no host in it.");
  }

  const literalReason = blockedHostReason(host);
  if (literalReason !== null) {
    return fail(`That address cannot be used: ${literalReason}.`);
  }

  /*
    RESOLVE, AND INSPECT EVERY ANSWER.

    `all: true` rather than a single lookup. A name with one public
    record and one loopback record is refused outright, because "which
    address did the connection get" is not a decision this server should
    be making on a reader's behalf.
  */
  let addresses: ReadonlyArray<{ address: string }>;
  try {
    addresses = await resolve(host);
  } catch (err) {
    const problem = err instanceof Error ? err.message : "unknown error";
    return fail(`That host could not be resolved (${problem}), so it cannot be checked.`);
  }

  if (addresses.length === 0) {
    return fail("That host does not resolve to any address.");
  }

  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      return fail(
        `That host resolves to ${address}, which is a private or reserved address. ` +
          "A provider on your own network cannot be reached from here.",
      );
    }
  }

  return { ok: true, baseUrl: normalise(url), host };
}

/**
 * Re-check a host at the moment it is about to be called.
 *
 * The second layer described at the top of this file. It is what makes
 * the gap between "validated at save time" and "called minutes later"
 * narrow rather than unbounded, and it is cheap: one resolver round trip
 * against a cache.
 */
export async function assertPublicHost(
  host: string,
  resolve: Resolver = defaultResolver,
): Promise<void> {
  const literalReason = blockedHostReason(host);
  if (literalReason !== null) {
    throw new Error(`Refusing to call a non-public host: ${literalReason}.`);
  }
  let addresses: ReadonlyArray<{ address: string }>;
  try {
    addresses = await resolve(host);
  } catch {
    throw new Error("The provider host could not be resolved.");
  }
  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      throw new Error("The provider host resolved to a private address.");
    }
  }
}