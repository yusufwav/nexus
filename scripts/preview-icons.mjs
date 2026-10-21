/**
 * Renders the app's icon registry to a standalone HTML page, so the shapes
 * can be LOOKED at before they ship.
 *
 *   node scripts/preview-icons.mjs
 *
 * It reads the registry out of `src/components/icons.tsx` — the source of
 * truth — and the geometry out of the lucide package, so the preview cannot
 * drift from what the app actually draws.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const iconsDir = join(root, "node_modules/lucide-react-native/dist/esm/icons");

/** `CircleUserRound` -> `circle-user-round`. */
function kebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/** The icon's geometry, read straight out of the package's ESM build. */
function geometry(component) {
  const file = join(iconsDir, `${kebab(component)}.mjs`);
  const source = readFileSync(file, "utf8");
  const start = source.indexOf("const __iconData = ");
  if (start === -1) return null;
  const open = source.indexOf("{", start);
  const end = source.indexOf("\n};", open);
  // eslint-disable-next-line no-new-func
  return new Function(`return ${source.slice(open, end + 2)};`)();
}

// The registry, read straight out of the source of truth.
const source = readFileSync(join(root, "src/components/icons.tsx"), "utf8");
const registryBlock = source.slice(
  source.indexOf("export const ICONS = {"),
  source.indexOf("} as const satisfies"),
);
const entries = [...registryBlock.matchAll(/(\w+):\s*(\w+),/g)].map((m) => ({
  name: m[1],
  component: m[2],
}));

const cells = entries
  .map(({ name, component }) => {
    const data = geometry(component);
    if (data === null) return `<div class="miss">MISSING ${component}</div>`;
    const body = data.node
      .map(([tag, attrs]) => {
        const a = Object.entries(attrs)
          .filter(([k]) => k !== "key")
          .map(([k, v]) => `${k}="${v}"`)
          .join(" ");
        return `<${tag} ${a} />`;
      })
      .join("");
    return `<figure><svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="#f2f4f7" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</svg>
      <figcaption>${name}<br /><small>${component}</small></figcaption></figure>`;
  })
  .join("\n");

const html = `<!doctype html><meta charset="utf-8" />
<style>
  body { background:#050608; color:#f2f4f7; font: 13px ui-monospace, monospace; padding:24px; }
  .grid { display:grid; grid-template-columns:repeat(6,1fr); gap:18px; }
  figure { margin:0; border:1px solid rgba(255,255,255,.08); padding:12px; text-align:center; }
  figcaption { margin-top:8px; font-size:11px; color:#a8b0bb; }
  small { color:#6b7280; }
  .miss { color:#ff7b72; }
</style>
<div class="grid">${cells}</div>`;

const out = join(root, ".expo-preview-icons.html");
writeFileSync(out, html, "utf8");
console.log(`wrote ${out} (${entries.length} icons)`);
