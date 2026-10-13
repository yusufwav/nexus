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

  /*
   * Not advertising the framework.
   *
   * `X-Powered-By: Next.js` tells an attacker which advisories to read
   * before they probe anything else. It costs nothing to remove.
   */
  poweredByHeader: false,

  /*
   * SECURITY HEADERS
   * ------------------------------------------------------------
   * There were none at all: no CSP, no X-Frame-Options, no nosniff, no
   * HSTS, no Referrer-Policy. Each is a default a browser will otherwise
   * assume you made on its behalf.
   *
   * `nosniff` matters most here. Without it a browser may execute a
   * response based on its CONTENT-TYPE rather than the request path, and
   * this app serves user-authored text — chat transcripts, note passages —
   * through handlers that set the type themselves.
   *
   * NO Content-Security-Policy, AND THAT IS A DECISION
   * ------------------------------------------------------------
   * CSP is the stronger control and it is worth having eventually, but a
   * CSP that is subtly wrong breaks the app rather than hardening it, and
   * getting one right for a Next.js app with inline styles, the AI SDK's
   * streaming, KaTeX and a PWA is a project in its own right. X-Frame-Options
   * DENY covers clickjacking today and cannot be subtly wrong.
   *
   * So this is a staged fix rather than a finished one, and the gap is
   * named rather than left to look complete.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            // Everything this app does not use. The tutor renders markdown
            // and LaTeX, so there is no reason to grant camera,
            // microphone, geolocation or payment.
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          {
            key: "Strict-Transport-Security",
            // Two years, preload-eligible. Sent in dev too: inert over
            // plain http, and it avoids the header existing in only one
            // environment — the usual way a security header goes untested
            // until the day it is needed.
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default withVarlock(withPwa(nextConfig));
