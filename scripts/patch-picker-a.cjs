const fs = require("fs");

const L = (...lines) => lines.join("\n");

/** Replace `from` with `to`, whichever line endings the file has. */
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

/* ================================================================== *
 *  icons.tsx — a down chevron, for a thing that opens
 * ================================================================== */
{
  const f = "src/components/icons.tsx";
  let b = fs.readFileSync(f, "utf8");

  b = sub(
    b,
    L("  Check,", "  ChevronLeft,", "  ChevronRight,"),
    L("  Check,", "  ChevronDown,", "  ChevronLeft,", "  ChevronRight,"),
    "the lucide import",
  );

  b = sub(
    b,
    L(
      "  /** The chevron that says \"this row opens something\". */",
      "  chevronRight: ChevronRight,",
    ),
    L(
      "  /** The chevron that says \"this row opens something\". */",
      "  chevronRight: ChevronRight,",
      "  /** The chevron on a control that opens downwards. */",
      "  chevronDown: ChevronDown,",
    ),
    "the catalogue entry",
  );

  fs.writeFileSync(f, b, "utf8");
}

/* ================================================================== *
 *  modules.tsx — the filter chips need room between them
 * ================================================================== */
{
  const f = "src/app/(tabs)/modules.tsx";
  let b = fs.readFileSync(f, "utf8");

  b = sub(
    b,
    L(
      "  chips: {",
      "    flexDirection: \"row\",",
      "    flexWrap: \"wrap\",",
      "    marginTop: 18,",
      "  },",
    ),
    L(
      "  chips: {",
      "    flexDirection: \"row\",",
      "    flexWrap: \"wrap\",",
      "    // The chips are capsules with no margin of their own, so the row",
      "    // is what puts the space between them. Without this they touch.",
      "    gap: 8,",
      "    marginTop: 18,",
      "  },",
    ),
    "the chip gap",
  );

  fs.writeFileSync(f, b, "utf8");
}
