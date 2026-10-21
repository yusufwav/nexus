/**
 * Screenshots the running app, so the real thing can be LOOKED at.
 *
 *   node scripts/shoot.mjs <url> <out.png> [width] [height] [waitMs]
 *
 * It is a thin wrapper over headless Chrome, because the app's web target
 * is the same renderer the preview uses and the only way to see a DOM
 * component's WebGL field composited behind real React Native views.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const [, , url, out, w = "390", h = "844", wait = "6000"] = process.argv;

if (url === undefined || out === undefined) {
  console.error("usage: node scripts/shoot.mjs <url> <out.png> [w] [h] [waitMs]");
  process.exit(1);
}

const chromePaths = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const chrome = chromePaths.find((p) => existsSync(p));
if (chrome === undefined) {
  console.error("no Chrome or Edge found");
  process.exit(1);
}

const args = [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=2",
  `--window-size=${w},${h}`,
  `--virtual-time-budget=${wait}`,
  `--screenshot=${out}`,
  url,
];

try {
  execFileSync(chrome, args, { stdio: "pipe" });
  console.log(`wrote ${out}`);
} catch (err) {
  // Chrome writes its progress to stderr and exits non-zero on some setups;
  // the screenshot is usually still there.
  console.error(err.stderr?.toString() ?? err.message);
  if (existsSync(out)) {
    console.log(`wrote ${out}`);
  } else {
    process.exit(1);
  }
}
