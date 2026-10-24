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
 * the import
 * ------------------------------------------------------------------ */
b = sub(
  b,
  L(
    "  readModelChoice,",
    "  writeModelChoice,",
  ),
  L(
    "  readModelChoice,",
    "  writeActiveProviderId,",
    "  writeModelChoice,",
  ),
  "writeActiveProviderId",
);

/* ------------------------------------------------------------------ *
 * the picker
 * ------------------------------------------------------------------ */
b = sub(
  b,
  L(
    "                <Select",
    "                  value={model.length > 0 ? model : null}",
    "                  options={modelOptions}",
    "                  onChange={chooseModel}",
    "                  placeholder=\"choose a model\"",
    "                  filter={{",
    "                    label: \"Free only\",",
    "                    active: freeOnly,",
    "                    onToggle: () => setFreeOnly((prev) => !prev),",
    "                    matches: (option) => {",
    "                      const found = models.find((m) => m.id === option.value);",
    "                      return found?.free === true;",
    "                    },",
    "                  }}",
    "                />",
  ),
  L(
    "                <Select",
    "                  value={",
    "                    provider !== null && model.length > 0",
    "                      ? modelValue(provider.id, model)",
    "                      : null",
    "                  }",
    "                  options={[]}",
    "                  onChange={chooseModel}",
    "                  triggerLabel=\"models\"",
    "                  chevron={false}",
    "                  groups={modelGroups}",
    "                  onGroupOpen={(group) => void loadProviderModels(group.id)}",
    "                  filter={{",
    "                    label: \"Free only\",",
    "                    active: freeOnly,",
    "                    onToggle: () => setFreeOnly((prev) => !prev),",
    "                    matches: (option) => freeValues.has(option.value),",
    "                  }}",
    "                />",
  ),
  "the picker",
);

fs.writeFileSync(f, b, "utf8");
console.log("tutor.tsx — the picker is written");
