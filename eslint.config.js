// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      // The codebase says `ReadonlyArray<T>` everywhere, on purpose: a
      // collection that cannot be mutated is a collection nobody has to
      // think about mutating. This rule has no setting that permits that
      // spelling — the closest, `generic-simple`, still bans it for simple
      // types like `string` — so the rule is off rather than rewritten
      // across every file to say the same thing differently.
      '@typescript-eslint/array-type': 'off',
    },
  },
  {
    // THE GENERATED DOM COMPONENTS.
    //
    // These four files are produced by scripts/build-dom-components.mjs
    // from the web app's sources, and the unused imports they carry are
    // the web app's — the port does not use the tilt maths, and the
    // theme observer it replaced left a helper behind. Editing the
    // generated files is pointless: the next run of the script overwrites
    // them. So the rule is off for them, and the real check is that the
    // GENERATOR produces code that compiles and lints, which
    // `npm run typecheck` covers.
    files: ['src/components/dom/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
]);
