/**
 * CUSTOM PROVIDER ADDRESS VALIDATION
 * ------------------------------------------------------------
 * The property being tested is not "a good URL is accepted". It is:
 *
 *   **there is no string a reader can type that makes the server hold a
 *   request to an address it did not check.**
 *
 * The control is a list of refusals, so that is what the assertions are:
 * every range below has to be refused, and the one that matters most is
 * the last group, because those are the addresses that are reachable from
 * inside a server and are not obviously "private" by name.
 *
 * WHY 169.254.169.254 IS IN HERE, PROPERLY, AND WHY THE IPV6 FORM MATTERS
 * ------------------------------------------------------------
 * That is the cloud instance-metadata address. Reachable from a VM with
 * no credential on many clouds, and it hands back a short-lived token
 * for the machine it is running on. The IPv4 entry is the obvious half.
 * The half that is usually missed is `::ffff:169.254.169.254` — the same
 * address, written so it reads as an IPv6 range nobody recognises. A
 * prefix-only IPv6 check passes it and the connection goes to the
 * metadata service anyway, so both spellings are asserted here.
 *
 * EVERY ANSWER, NOT ONE OF THEM
 * ------------------------------------------------------------
 * A name that resolves to one public and one private address is refused
 * outright. If the check looked at `addresses[0]`, this test would pass
 * on the resolver's ordering and fail intermittently in production, which
 * is the worst possible failure mode for a security control.
 *
 * THE RESOLVER IS INJECTED
 * ------------------------------------------------------------
 * Every case below runs without touching DNS, because the cases worth
 * testing are names that must never be looked up. The module under test
 * imports `server-only`, which throws unless the `react-server`
 * condition is active, so this has to run as:
 *
 *   $env:NODE_OPTIONS = "--conditions react-server"
 *   ..\..\node_modules\.bin\tsx.cmd scripts\test-custom-provider-url.ts
 *
 * Static imports, no top-level await: apps/web is a CJS package and
 * esbuild will not emit either.
 */
import {
  assertPublicHost,
  blockedHostReason,
  isBlockedAddress,
  validateCustomProviderUrl,
  type Resolver,
} from "../src/lib/custom-provider-url";

const problems: string[] = [];
const pass = (m: string) => console.log(`  PASS  ${m}`);
const fail = (m: string) => {
  problems.push(m);
  console.log(`  FAIL  ${m}`);
};

/** A resolver that returns whatever the test asked it to. */
function resolverReturning(...addresses: string[]): Resolver {
  return async () => addresses.map((address) => ({ address }));
}

/** A resolver that always fails, standing in for "DNS is down". */
const resolverFails: Resolver = async () => {
  throw new Error("ENOTFOUND");
};

const PUBLIC: Resolver = resolverReturning("93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946");

async function refuses(input: string, why: string, resolve: Resolver = PUBLIC): Promise<void> {
  const r = await validateCustomProviderUrl(input, resolve);
  if (r.ok) {
    fail(`refuses ${why} — but accepted ${input} as ${r.baseUrl}`);
  } else {
    pass(`refuses ${why}`);
  }
}

async function accepts(input: string, expected: string, resolve: Resolver = PUBLIC): Promise<void> {
  const r = await validateCustomProviderUrl(input, resolve);
  if (!r.ok) {
    fail(`accepts ${input} — but refused it: ${r.problem}`);
  } else if (r.baseUrl !== expected) {
    fail(`normalises ${input} to ${expected} — but produced ${r.baseUrl}`);
  } else {
    pass(`accepts ${input} → ${r.baseUrl}`);
  }
}

async function main(): Promise<void> {
  /* -- 1. the shape rules, before any name is resolved ---------------- */
  console.log("\n=== 1. the shape of the address ===");

  await accepts("https://api.openai.com/v1", "https://api.openai.com/v1");
  await accepts("https://api.example.co/v1/", "https://api.example.co/v1");
  await accepts("  https://api.example.co/v1  ", "https://api.example.co/v1");
  await accepts("https://api.example.co", "https://api.example.co");
  await accepts("https://api.example.co:8443/v1", "https://api.example.co:8443/v1");

  // The trailing slash is removed rather than added. The SDK appends
  // /chat/completions to this, so a base ending in a slash produces a
  // double slash that several OpenAI-compatible servers read as a
  // different route.
  await accepts("https://api.example.co/v1//", "https://api.example.co/v1");

  await refuses("http://api.example.co/v1", "plain http");
  await refuses("ftp://api.example.co", "a non-http scheme");
  await refuses("https://user:pass@api.example.co/v1", "credentials in the URL");
  await refuses("https://api.example.co/v1?x=1", "a query string");
  await refuses("https://api.example.co/v1#frag", "a fragment");
  await refuses("not a url", "something that is not a URL");
  await refuses("https://", "a URL with no host");
  await refuses("", "an empty string");
  await refuses(`https://api.example.co/${"a".repeat(400)}`, "an absurdly long address");

  /*
    NOT REFUSED — NORMALISED, AND THAT IS THE POINT.

    `new URL` resolves `..` in the path itself, so what lands in the
    database is `/admin`, which is byte-for-byte what the SDK will call.
    A version that stored the reader's literal string and sent the
    parsed one would show them one path in Settings and use another;
    storing the parsed value means the two can never disagree.
  */
  await accepts("https://api.example.co/v1/../admin", "https://api.example.co/admin");

  /* -- 2. names that cannot name a public host ------------------------- */
  console.log("\n=== 2. names that cannot be a public host ===");

  await refuses("https://localhost/v1", "localhost", resolverReturning("93.184.216.34"));
  await refuses("https://mybox.local/v1", "a .local name", resolverReturning("93.184.216.34"));
  await refuses("https://api.internal/v1", "a .internal name", resolverReturning("93.184.216.34"));
  await refuses("https://wiki.intranet/v1", "a .intranet name", resolverReturning("93.184.216.34"));
  await refuses("https://thing.lan/v1", "a .lan name", resolverReturning("93.184.216.34"));
  await refuses("https://thing.home.arpa/v1", "the reverse-DNS space", resolverReturning("93.184.216.34"));
  await refuses("https://example.invalid/v1", "a reserved TLD", resolverReturning("93.184.216.34"));
  await refuses("https://printer/v1", "a bare single-label hostname", resolverReturning("93.184.216.34"));

  /* -- 3. address literals --------------------------------------------- */
  console.log("\n=== 3. address literals ===");

  // The interesting ones first, because they are the ones a reviewer
  // should be able to find in this file without reading the table.
  for (const ip of [
    "169.254.169.254", // cloud instance metadata
    "127.0.0.1",
    "10.0.0.5",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.255",
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "::1",
    "::",
    "::ffff:169.254.169.254", // the same metadata address, IPv6-spelled
    "::ffff:127.0.0.1",
    "64:ff9b::7f00:1", // IPv4-translated loopback
    "fc00::1", // unique-local
    "fd12:3456::1",
    "fe80::1", // link-local
    "ff02::1", // multicast
    "2001:db8::1", // documentation
    "224.0.0.1", // multicast
    "255.255.255.255", // broadcast
  ]) {
    // Written as an https URL so this exercises the same code path a
    // reader would reach, rather than the helper in isolation.
    await refuses(`https://${ip}/v1`, `the literal ${ip}`, resolverReturning("93.184.216.34"));
  }

  // IPv6 literals are bracketed in a URL; IPv4 literals are not. Getting
  // this wrong in the test would have looked like the validator refusing
  // public IPv4 addresses, which is exactly the confusion it caused.
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34"]) {
    const r = await validateCustomProviderUrl(`https://${ip}/v1`, resolverReturning(ip));
    if (!r.ok) fail(`accepts the public literal ${ip} — but refused it: ${r.problem}`);
    else pass(`accepts the public literal ${ip}`);
  }
  for (const ip of ["2606:2800:220:1:248:1893:25c8:1946", "2a00:1450:4001:82f::200e"]) {
    const r = await validateCustomProviderUrl(`https://[${ip}]/v1`, resolverReturning(ip));
    if (!r.ok) fail(`accepts the public literal [${ip}] — but refused it: ${r.problem}`);
    else pass(`accepts the public literal [${ip}]`);
  }

  /* -- 4. what a name RESOLVES to is the decision ---------------------- */
  console.log("\n=== 4. what the name resolves to ===");

  // A real TLD, not `.example`. The reserved suffixes are refused by
  // name and `.example` is one of them, so a test host using it would
  // be testing the suffix list twice and nothing else.
  await accepts("https://rebind.example.co/v1", "https://rebind.example.co/v1", PUBLIC);

  await refuses(
    "https://mixed.example.co/v1",
    "a name with one public and one loopback address",
    resolverReturning("93.184.216.34", "127.0.0.1"),
  );
  await refuses(
    "https://mixed6.example.co/v1",
    "a name whose only private answer is IPv6",
    resolverReturning("2606:2800:220:1:248:1893:25c8:1946", "::ffff:10.0.0.4"),
  );
  await refuses(
    "https://down.example.co/v1",
    "a name that does not resolve",
    resolverFails,
  );
  await refuses(
    "https://empty.example.co/v1",
    "a name that resolves to nothing",
    async () => [],
  );

  /* -- 5. the range table, directly ------------------------------------ */
  console.log("\n=== 5. the range table ===");

  const blocked = [
    "0.0.0.0",
    "0.1.2.3",
    "10.255.255.255",
    "100.64.0.0",
    "100.127.255.255",
    "127.255.255.255",
    "169.254.0.1",
    "169.254.169.254",
    "172.16.0.0",
    "172.31.255.255",
    "192.0.0.5",
    "192.0.2.1",
    "192.168.0.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "239.255.255.255",
    "240.0.0.1",
    "255.255.255.255",
  ];
  /*
    The boundary addresses, listed as ALLOWED, and each one is the
    address immediately below a blocked range. They are the cases an
    off-by-one in the comparisons above produces, and they are why this
    list is as long as it is: 172.15.255.255 and 172.16.0.0 are the two
    ends of the same private block.
  */
  const allowed = [
    "1.0.0.1",
    "8.8.8.8",
    "9.9.9.9",
    "100.63.255.255", // one below CGNAT
    "100.128.0.0", // one above CGNAT
    "126.255.255.255",
    "128.0.0.1",
    "169.253.255.255",
    "169.255.0.0",
    "172.15.255.255",
    "172.32.0.1",
    "192.0.1.1",
    "192.0.3.1",
    "192.167.255.255",
    "192.169.0.1",
    "198.17.255.255",
    "198.20.0.1",
    "198.51.99.255",
    "203.0.112.255",
    "203.0.114.1",
    "223.255.255.255",
  ];

  for (const ip of blocked) {
    if (isBlockedAddress(ip)) pass(`blocks ${ip}`);
    else fail(`blocks ${ip} — but allowed it`);
  }
  for (const ip of allowed) {
    if (!isBlockedAddress(ip)) pass(`allows the public ${ip}`);
    else fail(`allows the public ${ip} — but blocked it`);
  }

  /* -- 6. the helper the call path uses --------------------------------- */
  console.log("\n=== 6. assertPublicHost ===");

  await (async () => {
    try {
      await assertPublicHost("api.example.co", PUBLIC);
      pass("assertPublicHost accepts a public host");
    } catch (err) {
      fail(`assertPublicHost accepts a public host — it threw: ${String(err)}`);
    }
  })();

  for (const [host, why] of [
    ["localhost", "a loopback name"],
    ["box.local", "a .local name"],
    ["169.254.169.254", "the metadata address"],
    ["::1", "an IPv6 loopback"],
    ["[::1]", "a bracketed IPv6 loopback"],
    ["[fe80::1]", "a bracketed IPv6 link-local"],
  ] as const) {
    try {
      await assertPublicHost(host, PUBLIC);
      fail(`assertPublicHost refuses ${why} — it allowed ${host}`);
    } catch {
      pass(`assertPublicHost refuses ${why}`);
    }
  }

  try {
    await assertPublicHost("rebound.example", resolverReturning("93.184.216.34", "10.1.1.1"));
    fail("assertPublicHost refuses a host that now resolves privately — it allowed it");
  } catch {
    pass("assertPublicHost refuses a host that now resolves privately");
  }

  /* -- 7. blockedHostReason is honest about what it rejected ----------- */
  console.log("\n=== 7. the reason given back ===");

  for (const host of ["localhost", "box.local", "10.0.0.1"]) {
    const why = blockedHostReason(host);
    if (why !== null && why.length > 0) pass(`names a reason for ${host}: "${why}"`);
    else fail(`names a reason for ${host} — it returned ${String(why)}`);
  }
  if (blockedHostReason("api.example.co") === null) pass("offers no reason for a public host");
  else fail("offers no reason for a public host — it returned one");

  console.log("");
  if (problems.length > 0) {
    console.log(`${problems.length} FAILED`);
    process.exitCode = 1;
  } else {
    console.log("all passed.");
  }
}

void main();