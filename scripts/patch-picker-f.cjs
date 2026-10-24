const fs = require("fs");

const L = (...lines) => lines.join("\n");

function sub(text, from, to, label) {
  const a = text.includes(from) ? from : from.replace(/\n/g, "\r\n");
  const bb = text.includes(to) ? to : to.replace(/\n/g, "\r\n");
  if (!text.includes(a)) {
    console.log(`MISS: ${label}`);
    return text;
  }
  console.log(`ok: ${label}`);
  return text.replace(a, bb);
}

const f = "src/app/(tabs)/tutor.tsx";
let b = fs.readFileSync(f, "utf8");

/* ------------------------------------------------------------------ *
 * the free toggle moves up, so the groups can count with it
 * ------------------------------------------------------------------ */
const FREE_BLOCK = L(
  "  /**",
  "   * FREE ONLY, IN THE CHAT TOO.",
  "   *",
  "   * The same filter the settings screen offers, for the same reason: a",
  "   * provider that lists hundreds of models is a list nobody scrolls",
  "   * through, and the ones that cost nothing are usually the ones wanted.",
  "   */",
  "  const [freeOnly, setFreeOnly] = useState(true);",
  "",
);

b = sub(b, FREE_BLOCK, "", "the free toggle is lifted out");

b = sub(
  b,
  L(
    "  /** The providers whose models have already been asked for. */",
    "  const asked = useRef<ReadonlyArray<string>>([]);",
  ),
  L(
    "  /** The providers whose models have already been asked for. */",
    "  const asked = useRef<ReadonlyArray<string>>([]);",
    "",
    "  /**",
    "   * FREE ONLY, IN THE CHAT TOO.",
    "   *",
    "   * The same filter the settings screen offers, for the same reason: a",
    "   * provider that lists hundreds of models is a list nobody scrolls",
    "   * through, and the ones that cost nothing are usually the ones wanted.",
    "   */",
    "  const [freeOnly, setFreeOnly] = useState(true);",
  ),
  "the free toggle moves up",
);

/* ------------------------------------------------------------------ *
 * the group's count follows the filter
 * ------------------------------------------------------------------ */
b = sub(
  b,
  L(
    "          detail: loading",
    "            ? \"loading\u2026\"",
    "            : list === undefined",
    "              ? undefined",
    "              : `${list.length} models`,",
  ),
  L(
    "          detail: loading",
    "            ? \"loading\u2026\"",
    "            : list === undefined",
    "              ? undefined",
    "              : freeOnly",
    "                ? `${list.filter((m) => m.free === true).length} free`",
    "                : `${list.length} models`,",
  ),
  "the group's count",
);

b = sub(
  b,
  L("    [loadingProviders, modelsByProvider, providers],"),
  L("    [freeOnly, loadingProviders, modelsByProvider, providers],"),
  "the groups' dependencies",
);

fs.writeFileSync(f, b, "utf8");
console.log("tutor.tsx — the free toggle and the count are done");
