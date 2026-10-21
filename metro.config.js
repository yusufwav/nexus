const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

/*
 * WASM ASSET SUPPORT.
 *
 * `expo-sqlite` runs on the web through a WebAssembly build of SQLite, and
 * its worker imports that `.wasm` file directly. Metro does not treat `.wasm`
 * as an asset by default, so the web bundle fails to resolve it and the whole
 * app comes up blank.
 */
config.resolver.assetExts.push("wasm");

/*
 * SHARED ARRAY BUFFER.
 *
 * The web build of SQLite uses `SharedArrayBuffer`, which a browser only
 * exposes to a cross-origin-isolated document. That means the two headers
 * below, which are what "cross-origin isolated" means in practice.
 *
 * These are DEVELOPMENT headers. A deployed web build needs the same two
 * headers set by whatever serves it, and `app.json` carries them for EAS
 * Hosting.
 */
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    middleware(req, res, next);
  };
};

module.exports = config;
