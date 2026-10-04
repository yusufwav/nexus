import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const withVarlock = varlockNextConfigPlugin();
import type { NextConfig } from "next";

import { withPwa } from "./pwa.config";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Next blocks cross-origin requests to the dev server by default. Loading
  // the site from another device on the LAN (a phone hitting
  // http://<ip>:3001) left the client unhydrated: the HTML arrived but the
  // reveal stayed hidden and the canvas never started. These are the
  // private ranges a home network hands out.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "10.*.*.*",
    "192.168.*.*",
    "169.254.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.2*.*.*",
    "172.30.*.*",
    "172.31.*.*",
  ],
  // React Compiler is disabled: its Babel worker pool fails to spawn on
  // this machine, exiting 0xc0000142 (STATUS_DLL_INIT_FAILED) and taking
  // down every route's compilation. Output stays correct, just without
  // the compiler's automatic memoization.
  reactCompiler: false,
  transpilePackages: ["shiki"],
};

export default withVarlock(withPwa(nextConfig));
