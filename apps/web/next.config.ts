import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const withVarlock = varlockNextConfigPlugin();
import type { NextConfig } from "next";

import { withPwa } from "./pwa.config";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // React Compiler is disabled: its Babel worker pool fails to spawn on
  // this machine, exiting 0xc0000142 (STATUS_DLL_INIT_FAILED) and taking
  // down every route's compilation. Output stays correct, just without
  // the compiler's automatic memoization.
  reactCompiler: false,
  transpilePackages: ["shiki"],
};

export default withVarlock(withPwa(nextConfig));
