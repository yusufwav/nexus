# PORTING NOTES — Nexus Web → Nexus Mobile

How the React Web app in `C:\Users\yusuf\orca\projects\nexus` became the
Expo app in this directory, and what to look at when something needs to
change.

---

## 1. The short version

| Web app | Mobile app |
| --- | --- |
| Next.js App Router, server components | Expo Router, file-based routes in `src/app/` |
| Postgres (Neon) via Drizzle | **local SQLite** via `expo-sqlite` for content, and **the server** for the account |
| `localStorage` (theme, model picker) | **AsyncStorage** for preferences, **expo-secure-store** for the session |
| better-auth session cookie | the same account, over a **bearer token** — see §3b |
| a public landing page | a **login screen** — nothing else is reachable without a session |
| `/api/ai` → LLM provider | the **same provider, called from the device** — the key in the keychain, the notes searched on the phone |
| `backdrop-filter` glass panels | a **liquid glass film** over a native blur |
| top nav bar + left tab strip | one **bottom tab bar** |
| `<div>` / `<span>` / `<p>` / `<button>` | `View` / `Text` / `Pressable` |
| CSS custom properties in a cascade | `src/theme/palettes.generated.ts` — plain data |

Everything runs with **no network** except signing in, signing up, and the
study partner — which is the one thing in the app that needs a model
provider, and the reader brings their own. There is no fetch for content, no
remote asset and no telemetry.

---

## 2. The four visual engines — three gone, and the fourth back

`gradient-ascii`, `pixel-blast`, `horizon-bloom` and `letter-glitch` were
**Expo DOM Component wrappers**: four WebGL2 fragment pipelines, each in a
WebView, each carrying the web app's landing backgrounds.

**Three of them are still gone.** Every screen's background is a **flat
colour from the theme** — `bg0`, which every one of the fifty-two palettes
already defines — and `pixel-blast`, `horizon-bloom`, `letter-glitch` and
the generator that copied them out of the web app have all been deleted.

**`gradient-ascii` is BACK**, as a DOM component, and it is back on every
screen except **You** and **Provider**. See §2a.

The reason the other three went is a native crash that came out of the
glassmorphism work, and it is worth writing down because the chain is not
obvious:

* the panels were `expo-blur`'s `BlurView`, which on **Android** blurs a
  named `BlurTargetView` rather than the backdrop;
* `expo-blur`'s `BlurTargetView` is a plain `View` on iOS and on the web,
  but on **Android** it is a native `ViewGroup` that **reparents** every
  child into an inner `BlurTarget`;
* the DOM component's `DomWebView` was inside that target, so the
  reparenting took it out of the hierarchy React Native tracks, and the
  native side could no longer resolve its tag:

  > Unable to find the class expo.modules.webview.DomWebView view with tag N

  which is a hard crash, and one that fired while scrolling a list,
  because that is when the view tree is re-laid out.

The blur was never going to be right on Android anyway: the Dimezis blur
samples the target's own render node, and a hardware-accelerated WebView
does not draw into a software canvas, so the panels were blurring an empty
surface. Removing the fields removes the whole problem rather than
papering over it.

**The engines are still in the web app.** `apps/web/src/components/landing/`
has all four, and they are what the web app's landing pages still use. Only
the mobile port gave three of them up.

### 2a. The gradient ASCII field, back

The one that came back is a **port**, not a rewrite:
`src/components/dom/GradientAscii.tsx` is
`apps/web/src/components/landing/gradient-ascii.tsx` with a handful of
changes.

| | the web app | here |
| --- | --- | --- |
| shape | `horizon` | **`rise`** — the field comes up from the bottom, out of a core below the frame |
| extent | the reference's own | the bottom **two thirds** of the screen, in proportion to the screen |
| colours | four stops of a fixed palette, read off `--bg-0` and `--accent-a` | **ONE colour** — the palette's own accent at its own saturation, at every stop |
| pointer | a live scramble and a click wave | **none** — it is a background, and there is nothing under the reader's thumb to disturb |
| grain | a film grain at 24Hz | **none** |
| motion | `flow 0.5`, `speed 1` | `flow 1`, `speed 1.4` — one colour means the characters are the only thing that moves, and they need more of it to read |
| font | the app's own mono token | the **platform's** monospace |
| where it lives | the landing page | **one WebView for the whole app**, above the navigator |

**THE FONT IS A REAL CONSTRAINT, NOT A PREFERENCE.** The app's JetBrains
Mono is a NATIVE font, registered with Expo. A native font is not a font
this WebView can rasterise — it is not installed in the WebView's own
environment, and there is no URL to load it from. The glyph ramp is
`' =+xX0S8#@'` and every one of those characters is in every monospace
face on both platforms, so the ramp is drawn in the platform's own.

**THE COLOURS CROSS THE BRIDGE AS TWO STRINGS.** There are no CSS custom
properties on a phone, so the ramp is derived from exactly the same maths
on two hex strings instead. The derivation is the same function.

**THE PROPS MUST NOT BE CAPTURED BY THE EFFECT THAT OWNS THE GL CONTEXT.**
The effect that creates the context, the four programs, the three render
targets and the glyph atlas must not re-run when the palette changes — a
second mount would be handed a context the first one's cleanup already
released. So the effect cannot close over the props it was mounted with:
it would repaint the palette it BOOTED with, forever, and the reader's
theme change would change the page and not the field. The props are kept
in a ref, written by an effect, and the repaint reads them from there.

**THE FADE IS IN THE WEBVIEW.** The tutor's field goes away slowly once the
reader has sent a message. That fade is the shader's own scale walking
down, not the opacity of the native view that holds the WebView: a
WebView is drawn into its own layer on Android, and a layer does not take
the alpha of the view it is in. A native-side fade is a fade that silently
does not happen. Only a boolean crosses the bridge.

**THE LIGHT PALETTE NEEDS INK, NOT WHITE.** The web app drew white glyphs
in both modes, which left the light palettes with a field that could not be
seen at all. Here the glyphs are the field's own colour composited over
white — ink on paper — and the composite blends normally rather than
additively, which is what the reference engine does.

**ONE WEBVIEW FOR THE WHOLE APP, NOT ONE PER SCREEN.** The field used to
be mounted as the first child of every screen's root, which is the
obvious way to put a background behind a screen and the wrong one: every
screen was its own WebView, so every screen paid for a WebView booting,
four shaders compiling and a 2.4 second intro wiping in, and the reader
saw the flat page colour for all of it. It is now mounted once, above the
navigator, and the screens are transparent so it shows through them. The
screens that are NOT transparent are **You** and **Provider**, which keep
their flat background and no field.

**A SCREEN ASKS FOR A STRENGTH, IT DOES NOT OWN A FIELD.** With one
field there is one strength, so the tutor claims ninety per cent while it
is the screen on top and gives it back when it is not. The claim is a
context, and the context's provider has to wrap the navigator as well as
the field — the screens are the field's SIBLINGS, and a sibling cannot
reach a provider that is inside the field.

**THE SCREENS ARE TRANSPARENT, WHICH MEANS THE NAVIGATOR IS TOO.** The
navigator paints its own background behind the screens, and the tab scene
paints one of its own. Both were `bg0`, and an opaque one is a lid
over the field. The navigation theme's `background` and the tabs'
`sceneStyle` are transparent for the same reason the screens' roots are.

---

## 3. The offline storage transition

The web app's state lived in two places. Both were replaced.

### Postgres → local SQLite (`src/storage/database.ts`)

The same tables, the same columns, the same queries — just on the device:

| Table | Holds |
| --- | --- |
| `modules`, `topics`, `lessons`, `questions` | the seeded content |
| `purchases` | which modules are unlocked |
| `attempts` | every graded answer, for the weakness profile |
| `read_positions` | where the reader got to, and what they finished |
| `threads`, `messages` | the tutor's conversation history |
| `profile`, `meta` | app bookkeeping |

`seedLibrary()` writes the bundled content into the database on first
launch, and again whenever `CONTENT_VERSION` moves.

**THE ACCOUNT IS LOCAL.** There is no server, so there is no OAuth session
and no signed cookie. The reader's name and email live in
`expo-secure-store` — the device keychain — and identify them inside this
app only. The screen says so plainly rather than implying otherwise.

### `localStorage` → AsyncStorage + expo-secure-store

* `src/storage/settings.ts` — AsyncStorage. The theme choice, the
  reduced-motion flag, favourite lessons. Unencrypted, which is right for a
  colour scheme.
* `src/storage/secure.ts` — expo-secure-store. The local account and any
  provider key. Encrypted, which is right for personal data.

---

## 3b. The gate, and the account

Nothing in the app is reachable without a session.

The gate lives in the **root layout**, not in each screen. A screen-level
check is a check that can be forgotten: one new route and the app has a hole
in it. The root layout knows the current route, so it knows the one route
that is allowed to be on screen without a session — `/login`.

### THE ACCOUNT IS A REAL ACCOUNT, ON THE REAL SERVER

The app does **not** talk to Neon, and never will. Neon is reached by the
server, and the server holds `DATABASE_URL`.

| | |
| --- | --- |
| App | `https://nexus-tutoring.vercel.app/api/auth/*` |
| Server | Neon, via `packages/db` |
| Secret | `DATABASE_URL` — server side, never in the bundle |

A React Native bundle ships inside the .ipa/.apk where anyone can read it, so
a connection string in the app would hand every user admin over the whole
database: every account, every password hash, every purchase, every chat
transcript, and the ability to write or delete. The server is the only place
that credential can live.

### TWO WAYS A SESSION CAN BE CARRIED

A browser carries a session in a cookie the browser manages. React
Native's `fetch` has no cookie jar, so the app holds the credential
itself and sends it in the request. There are two forms, and the app
carries **both**:

| Form | Sent as | Needs |
| --- | --- | --- |
| the bearer token | `Authorization: Bearer <token>` | the server's `bearer` plugin |
| the session cookie | `Cookie: __Secure-better-auth.session_token=<signed>` | nothing — it is what a browser sends |

The response body carries the raw token; the `Set-Cookie` header
carries the signed one. The app keeps both, so it signs in against the
server **as it is today** and keeps working when the plugin is
deployed — whichever one the server understands, it uses.

### THE ORIGIN HEADER

React Native's `fetch` sends `Origin: null` — it mirrors a browser's
cross-origin request shape, and a native client has no origin to offer.
Better Auth's CSRF check reads that as a MISSING origin and refuses the
request with `MISSING_OR_NULL_ORIGIN`.

So the app names the server it is talking to. The server's own origin is
already in its `trustedOrigins` — it is `BETTER_AUTH_URL` — so the check
passes, and the check is still doing its job: a third-party origin is
still refused.

This is not a way around the check. The check exists so that a page on
another site cannot make the reader's browser send an authenticated
request. A native app has no ambient cookies and no ambient session: it
sends only what this code tells it to send, and the token is in the
device keychain. A hostile website cannot make the app send anything at
all, so the header is an assertion about who the client is, and the
server checks that assertion against its allowlist.

Verified against the deployed server:

| `Origin` sent | Result |
| --- | --- |
| *(none)* | 200 |
| `null` | **403 `MISSING_OR_NULL_ORIGIN`** |
| the server's own | 200 |
| a third party | 403 `INVALID_ORIGIN` |
### THE BEARER TOKEN

The server's session is an `httpOnly` cookie, and a browser keeps cookies
in a jar it manages. React Native's `fetch` has no jar, so the app holds the
session token itself — in the device's **encrypted keychain** — and sends it
as a header:

```
Authorization: Bearer <session token>
```

The server's `bearer` plugin converts that back into a session cookie before
the session lookup, so **every code path downstream is the one the website
uses**: the session refresh window, the seven-day expiry, the rate limiter
and the `getSession` payload are unchanged. The plugin is a door, not a
second front door.

**This is a server-side change** — one line in `packages/auth/src/index.ts`:

```ts
plugins: [bearer(), nextCookies()],
```

and it needs a deploy. The app detects a server that has not got it: after
signing in it asks the server to confirm the session it was just given, and
if the answer is `null` it says so instead of pretending the reader is
signed in.

### THE WIRE

Read off the deployed server, not guessed:

| Call | Success | Failure |
| --- | --- | --- |
| `POST /api/auth/sign-in/email` | `{ redirect, token, url, user }` | `{ message, code }` |
| `POST /api/auth/sign-up/email` | `{ token, user }` | `{ message, code }` |
| `GET /api/auth/get-session` | `{ session, user }` or `null` | — |
| `POST /api/auth/sign-out` | `{ success: true }` | — |

The 4xx bodies are FLAT — `{ message, code }` at the top level. The server
authors those messages for the reader ("Invalid email or password",
"Password too short"), so the app shows them as they are.

The server's own rules are mirrored so the app can explain them rather than
discover them: **12 characters minimum** for a password (`minPasswordLength`
in `packages/auth`), and five sign-ins a minute / five sign-ups an hour
(the database-backed rate limiter).

### OFFLINE

There are three answers to "is this reader signed in?", and only one of them
is yes:

- the server says **yes** — signed in, and the cache is refreshed
- the server says **no** — signed out, and the cache is destroyed
- the server **cannot be asked** — the CACHE decides, because a reader on a
  plane must still be able to open the app and read their notes

The third case is why the app is offline-first rather than offline-only: the
notes, the practice bank and the study partner all work with no connection,
and only the ACCOUNT needs one.

### THE THREE PROVIDER BUTTONS

Placeholders, and they say so when tapped. There is no OAuth client, no
client id and no redirect URI, and there is not going to be one — the whole
product is offline apart from the account.

---

## 3c. The keyboard

**THE PROBLEM**

On Android the app draws edge to edge, which means the window is not
resized when the keyboard opens. React Native's `KeyboardAvoidingView`
works by making room for a keyboard the window has already been told
about — with no resize there is nothing to make room for, so the keyboard
simply covers the field being typed in.

It is worse than a fixed layout on a static screen, because it is
*sometimes* obstructed: the sign-up form is one field taller than the
sign-in form, so the same gesture lands differently depending on which
tab is open and where the caret is.

**THE FIX**

`react-native-keyboard-controller`, which is what Expo's own keyboard
guide recommends for forms with more than one input. It knows the
keyboard's real height on both platforms, and it scrolls the focused
field into view above it — with no per-platform configuration.

| Screen | What it uses |
| --- | --- |
| Login | `KeyboardAwareScrollView` — the form scrolls the focused field into view |
| Tutor | the screen's own keyboard-overlap measurement, because the composer is *pinned* to the bottom rather than scrolled |

Two supporting changes, both from the Expo guide:

  · `android.softwareKeyboardLayoutMode: "pan"` in `app.json`, so the
    system pans rather than resizes;
  · `tabBarHideOnKeyboard: true` on the tabs, so the bottom bar is not
    pushed up between the reader and the field they are typing in.

`KeyboardProvider` wraps the navigator in the root layout, so a screen
pushed while the keyboard is open knows about it too.

**THE COST**

`react-native-keyboard-controller` is a native module, so it needs a
development build. The app already needs one for `expo-sqlite`,
`expo-secure-store` and the DOM components' own native modules, so this
does not add a new constraint — but it does mean the app cannot be
fully exercised in Expo Go.

---
## 4. The tutor, with the reader's own provider

The web app's tutor was a language model behind `/api/ai`: the browser sent
a transcript, the server decrypted the reader's stored key, built an
OpenAI-compatible client and streamed an answer back.

The phone speaks the same dialect to the same kind of provider, but the
server is not in the middle of it, because the reader's key does not need to
be anywhere but the device:

* `src/storage/provider.ts` holds the providers — a name, an address, a
  model, and a key in the keychain. The name, the address and the model are
  not secret and live in AsyncStorage; the key is secret and lives in
  `expo-secure-store`, one entry per provider.
* `src/lib/llm.ts` is the client: `POST {base}/chat/completions`,
  `stream: true`, and the answer read a chunk at a time.
* `src/lib/tutor-prompt.ts` is the prompt, and the one tool the model may
  call: **`search_notes`**, which runs ON THE DEVICE over the notes the
  app already has.
* `src/lib/tutor-engine.ts` is no longer the answerer. It is the retrieval
  half — the same rarity-weighted term overlap, exposed as
  `searchPassages()` — and the model writes the answer from what it finds.

**The bargain is the web app's, kept.** The passages the search returns
are the only material the model is allowed to use, the prompt says so, and
"your notes don't cover that yet" is a correct answer. What is different is
where the search runs: on the phone, over the notes that are already here,
so the notes never leave the device and there is no embedding model to pay
for.

**The maths is plain text.** The web app's prompt asks for LaTeX, because
the web app renders it. This app writes its notes as `f'(x) = 2x + h` and
the passages the model reads are written that way, so the prompt asks for
that.

**The practice screen keeps the web app's rule.** The screen's state holds
either a `PublicQuestion` (options, no `correct` flag, no explanations) or
a `GradeResult` — never both. The graded answer only exists after
`gradeAnswer()` has run.

---

## 5. The layout decisions

The web app's layouts were wide. These are the calls that were made, and
why.

* **One bottom tab bar.** The web app had a fixed top nav on the public
  pages and a tab strip inside the dashboard console. Neither survives a
  phone: the top bar is out of thumb reach and the side strip costs a third
  of a narrow screen. The dashboard's five sub-pages became sections on the
  **You** tab.
* **There is no tab bar.** It was the web app's tab strip carried over, and
  then it was icons only, and then it was gone: the side menu is the app's
  navigation now. The five screens keep their own state and their own place
  in the back stack — the router still needs them to be a tab navigator for
  `router.navigate("/modules")` to have a route to go to — but the bar itself
  is not drawn.
* **The side menu opens on a swipe from the right edge**, and the drawer
  follows the finger while it happens. It is gesture-handler rather than a
  `PanResponder`, because a `PanResponder` can only have a gesture that
  nothing else wanted — and a screen is mostly buttons and list rows, which
  claim the touch first. Gesture-handler recognises in parallel with the
  app's own touch handling and only takes over once the swipe is certain.
* **Cards, not tables.** The catalogue was a table with a hover-revealed
  description. On a phone each module is a card, and the description is
  always visible — there is no hover, and a description that only exists on
  a desktop is a description most readers never see.
* **One question at a time.** Unchanged from the web app, and for the same
  reason: a reader who can see eight questions at once will pattern-match
  across them.
* **The theme picker shows accents, not previews.** The web app's swatch was
  a miniature of the theme — the palette's background, a little mark, three
  dots — which made the preview three times the size of the thing it was
  selling. On a phone the swatch is a bar of the palette's three accents,
  side by side, filling it, with the name underneath. The palettes are also
  filed under three headings rather than two: **LIGHT**, **DARK** and
  **COLOURFUL**, the last one holding the dark palettes whose background
  has become a colour — a blue that is not black, a teal, a violet — rather
  than staying black.
* **The composer clears the keyboard itself.** The composer is the bottom of
  the screen and the keyboard is the bottom of the screen too, so one of
  them has to move — and which one depends on the platform: iOS does not
  resize the window, Android usually does. So the composer is given the
  keyboard's actual OVERLAP (the window's height minus the keyboard's top
  edge) rather than a guess, which is right whether the window resized or
  not. A `KeyboardAvoidingView` cannot do that, because it has to commit to
  one behaviour per platform and the platforms disagree.
* **The horizon sat just above the composer.** The scene's limb was at 0.7
  of the frame — a long way above the input, with the bottom third of the
  screen empty. It was moved to 0.88, which puts the lit edge of the planet
  just above the text input, so the composer is standing on the sunrise
  rather than floating in the dark below it. That was the web app's constant
  and it came across with the engine; the engine is gone now, and so is the
  scene.
* **Three starters, not six.** The empty tutor screen offered six prompts,
  which on a phone is a menu rather than a set of suggestions. Three stayed:
  what a limit is, how a limit differs from the value at a point, and how
  bisection decides which half to keep.
* **No "back to modules" under the composer.** The tab bar has a Modules
  tab, so the button under the input was a second path to a place the app
  already has one button for.
* **A side menu, rebuilt from the staggered menu.** The reference is
  `IDEAS/components/staggered-menu` — a panel that slides in from the right
  behind two slabs of colour, with its items arriving one after another as
  it lands. It is a DOM component: GSAP timelines, `xPercent`, `em`-based
  padding and a `backdrop-filter`, none of which exist here, so the shape
  is ported and the machinery is rebuilt — the same layers, the same order,
  the same timings, the same easings, on Reanimated, which the app already
  ships and which runs the whole thing on the UI thread.
  What is the app's rather than the reference's: the slab colours are the
  palette's accents, the panel is the palette's own surface, the type is
  JetBrains Mono, and the toggle is a lucide icon. The drawer is mounted in
  the root layout so that it covers the tab bar — the bar is the thing it
  is on its way to replacing, and the tab bar is still here for now.
  `npm run preview-menu` draws the panel, in the dark and the light
  palette, so the layout can be looked at without a device.
* **A bar at the top of every screen, and it is the terminal's.** The web app
  had a fixed top nav on the public pages. On a phone that became the
  **screen header**: the README container's own bar — three dots, the first
  one in the accent colour, a raised surface, a hairline along the bottom —
  made bigger and moved to the top of the screen, with the screen's title
  centred in it. It reaches up into the status bar, so the status bar's
  background is the header's background and the reader sees no seam.
  The home screen's bar says **"Good morning"** rather than "Home", and
  tapping it puts the README container away — the container's height
  animates to zero and the content below moves up to take its place, because
  the thing that has to happen is the container *leaving the space it was
  in*, not sliding about in it. The content of that container is **absolutely
  positioned** inside the box that animates, because a child that is in the
  flow is sized by its parent on Android, and a parent whose height is
  animating to zero would measure it as zero — the container would never
  appear. See STYLING.md §1.4b.
* **48-point tap targets** on every control, with the card rows at 52.
* **Icons are lucide, on both platforms.** The web app draws its icons from
  lucide through shadcn's registry; this app draws them from
  `lucide-react-native` through one registry of its own,
  `src/components/icons.tsx`. The mobile app used to draw its icons as
  typographic characters (`⌂`, `▤`, `✓`, `✦`, `◉`, `›`, `‹`, `☰`, `↻`, `⌫`,
  `↑`) typed into `Text` nodes — a glyph inherits the font's metrics, so it
  sat differently on every platform that drew JetBrains Mono a slightly
  different way, and it could not be tinted per theme. The shapes are the
  same set the web app uses; the plumbing is one component. See STYLING.md
  §4.

---

## 6. Content fidelity

The editorial content is copied, never retyped:

```bash
node scripts/copy-content.mjs      # topics, lessons, practice questions
node scripts/extract-palettes.mjs  # the 52 palettes, out of the web CSS
```

`copy-content.mjs` lifts `module-topics.ts`, `module-content.ts` and the
practice catalogue straight out of the web app. `extract-palettes.mjs`
parses `palettes.generated.css` and `tokens.css` and emits
`src/theme/palettes.generated.ts`, so the 52 palettes are the web app's
exact colours rather than an approximation of them.

The practice schema was the one file that could not be copied: the web app
validates with zod, and a React Native bundle does not need a schema
library. `src/content/practice-schema.ts` enforces **the same invariants**
by hand — same rules, same messages, same failure points.

---

## 6b. The glass, and why it is gone

The web app's panels are `backdrop-filter` — a real blur of whatever is
behind them, in the browser. The phone has no CSS, so the blur became
`expo-blur`'s `BlurView`, with a translucent wash and a hairline edge over
it: the **glassmorphism recipe** from
https://mikael-ainalem.medium.com/react-native-glassmorphism-effect-deeb9951469c

**All of that is gone.** The panels are now `bg1` — the palette's own
raised surface — over a page that is `bg0`, and the blur is gone with the
fields.

The reason is the one in §2: the blur needed a named target on Android,
the target reparented the DOM component's WebView out of React Native's
hierarchy, and the native side could no longer resolve its tag. That was a
hard crash while scrolling the catalogue.

**The wash would not have been honest either.** A translucent panel over a
moving field is glass; a translucent panel over a flat colour is a smudge.
With the fields gone there is nothing to transmit, so the panels are
opaque — which is also faster, and one fewer native surface per panel in a
scrolling list.

**What was tried, and why it did not work.** For the record, because the
constraints are not obvious:

| | `@callstack/liquid-glass` | `expo-glass-effect` | `expo-blur` |
| --- | --- | --- | --- |
| iOS 26+ | yes | yes | yes |
| iOS < 26 | no | no | yes |
| Android | no | no | **crashes** with a DOM field |
| Web | no | no | yes |
| Expo Go | **no** | yes | yes |
| Needs Xcode 26 | **yes** | yes | no |
| Expo config plugin | **no** | yes (n/a) | yes |

`@callstack/liquid-glass` requires Xcode 26 and ships no Expo config plugin,
so it cannot be autolinked into a Continuous Native Generation build and it
cannot run in Expo Go — the two things this project's build depends on.
`expo-glass-effect` is Expo's own and is already in the dependency tree
through `expo-router`, but it still only covers iOS 26 and above.

So there was no native effect to fall back on, and the portable one had the
Android crash in it. The flat panel is what is left, and it is the right
answer for a page with no live background.

**The container is unchanged.** `GlassPanel` is still the app's one
treatment and every panel still goes through it.

---

## 6c. The web target, and `metro.config.js`

The app has a web target, and it needed one configuration file to work at
all. `expo-sqlite` runs on the web through a WebAssembly build of SQLite
whose worker imports a `.wasm` file directly, and Metro does not treat
`.wasm` as an asset by default — so without `metro.config.js` the web
bundle fails to resolve it and the whole app comes up blank.

`metro.config.js` therefore does two things, both of them from Expo's own
documentation for `expo-sqlite` on web:

1. adds `wasm` to `resolver.assetExts`;
2. sets `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` on
   the dev server, because the web build of SQLite uses `SharedArrayBuffer`
   and a browser only exposes that to a cross-origin-isolated document.

The same two headers have to be set by whatever serves a deployed web build.
`app.json` carries them for EAS Hosting, through the `expo-router` plugin's
`headers` option.

The web target is also how the glass can be **looked at** without a device:
`scripts/preview-readme.mjs` renders the README container to a PNG, and
`scripts/shoot.mjs` screenshots the running app.

---

## 6d. The maths, and why it is not KaTeX

The web app draws its maths with **KaTeX**, through Streamdown's math
plugin. The mobile app does not use KaTeX, and it does not use a
WebView either: the maths is parsed, laid out and drawn by the app.

| Web app | Mobile app |
| --- | --- |
| `streamdown` + `@streamdown/math` + `katex` | `src/lib/latex/` — a symbol table, a parser and a layout engine |
| KaTeX writes HTML and CSS | the engine writes a tree of positioned primitives |
| the browser draws it | `src/components/Math.tsx` draws it with `<Text>` and `<View>` |

**WHY.** React Native cannot lay maths out. There is no `View` inside a
`<Text>`, and in the New Architecture a nested `<Text>` is a span —
`TextProps` does not extend `ViewProps` — so it cannot be transformed or
repositioned. A superscript cannot be raised inside a paragraph, and a
fraction cannot be built out of one. Something has to do the layout, and
a WebView per equation in a scrolling chat is not the answer.

**WHAT DID NOT CHANGE.** The delimiters, the grammar, and the rules the
model is given: inline maths between dollar signs, a displayed equation
between pairs of them on its own lines, and never a price written with a
leading dollar sign. `STYLING.md` §1.6 has the rest.

**THE CURRENCY RULE IS ENFORCED IN CODE AS WELL.** The web app asks the
model not to write a price with a leading dollar sign. The splitter here
refuses a span that is closed but does not look like maths — a bare
number, a span with a space at either end, a span that is not closed —
so a price stays a price and nothing after it is swallowed.

## 7. Running it

```bash
npm install
npm run typecheck     # tsc --noEmit
npm start             # expo start
```

DOM components work in Expo Go, so no development build is needed for the
visual engines. `expo-sqlite` and `expo-secure-store` are native modules
with config plugins, and they need a development build:

```bash
npx expo run:ios      # or run:android
```

### 7a. Building for Android on Windows

**THE PROJECT PATH MUST NOT CONTAIN A SPACE.** This is not a style
preference — the Android build does not work otherwise, and it fails in a way
that looks like a compiler error rather than like a path problem:

```
ninja: error: mkdir(CMakeFiles/reanimated.dir/C_/Users/yusuf/orca/mobile_projects/Nexus/
node_modules/react-native-reanimated/Common/cpp/reanimated/CSS/common/transforms):
No such file or directory
```

CMake escapes a space as `$` when it writes the path into its build rules,
and the directory it then tries to create is not the directory it wrote. The
same thing happens with the path's LENGTH: Windows' own limit is 260
characters, and CMake's generated paths are long enough to cross it.

So the project has to live somewhere short and space-free — `C:\n` is
enough — and the copy has to be a real copy, not a junction: a junction
resolves back to the real path and the space comes back with it.

```bash
# from the real project
robocopy . C:\n /E /XD ".cxx" /NFL /NDL /NJH /NJS /NP /MT:24
cd /d C:\n
npx expo prebuild --platform android --no-install --clean
npx expo run:android
```

**`JAVA_HOME` HAS TO BE SET.** The Android SDK's `sdkmanager` and
`avdmanager` need a JDK, and the one that ships with Android Studio is
usually not on the PATH:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
```

## 8. The scripts

| Script | What it does |
| --- | --- |
| `scripts/copy-content.mjs` | copies the topics, lessons and practice questions out of the web app |
| `scripts/extract-palettes.mjs` | turns the web app's CSS palettes into TypeScript data |
| `scripts/generate-grain.mjs` | generates the fractal-noise grain tile |
| `scripts/preview-grain.mjs` | composites the grain over a panel colour so it can be looked at |
| `scripts/preview-login.ps1` | renders the login screen's composition to a PNG |
| `scripts/generate-font-metrics.mjs` | reads the font files for their metrics and their repertoire, and writes `src/theme/font-metrics.ts` |
| `scripts/preview-latex.mjs` | draws the maths to a PNG, so it can be looked at without a device |
| `scripts/test-latex.ts` | the maths engine's tests — run them with `npm run test:latex` |

They all read from `C:/Users/yusuf/orca/projects/nexus`. Their outputs are
committed, so the app builds without the web app present.
