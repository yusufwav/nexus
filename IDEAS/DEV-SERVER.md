# Dev server crashes — fixes and known failure modes

Notes on the `0xc0000142` / `STATUS_DLL_INIT_FAILED` crashes that have taken
down `pnpm run dev` in this project, what actually fixed them, and how to
diagnose the next one.

## TL;DR — recovery order

1. Delete `apps/web/.next` and restart. A stale cache preserves the crash.
2. Check `apps/web/next.config.ts` — `reactCompiler` must be `false`.
3. Check free memory. Below ~1.5 GB the webpack worker pool cannot spawn.

## The error, decoded

```
Error: Reading source code for parsing failed
An unexpected error happened while trying to read the source code to parse: creating new process
Caused by:
- node process exited before we could connect to it with exit code: 0xc0000142
```

`0xc0000142` is the Windows status code `STATUS_DLL_INIT_FAILED`. It is **not**
a JavaScript error — it means a native `.node` binary (or a child process) died
during DLL initialisation, so whatever tried to spawn it got nothing back.

Two important consequences:

- The file named in the "Import traces" section is **not necessarily the
  culprit**. It is just the first module that happened to need the worker.
  When this appeared against `packages/ui/src/components/sonner.tsx`, removing
  the `<Toaster />` JSX did **not** help, because the `import` statement still
  pulled the file into the graph.
- The error is a **symptom**. Chasing the file in the trace wastes time; look
  at resources and config instead.

## Confirmed cause #1 — React Compiler

`reactCompiler: true` in `apps/web/next.config.ts` makes Next spin up a Babel
worker pool. On this machine that pool fails to spawn, and every route dies
compiling.

Proven by bisection: with `reactCompiler: true` the error appears 4+ times per
request; with it `false` the same server returns HTTP 200 and zero errors.

```ts
// apps/web/next.config.ts
reactCompiler: false, // Babel worker pool cannot spawn here — see IDEAS/DEV-SERVER.md
```

**Do not re-enable this** without testing. The tradeoff is that React
Compiler's automatic memoization is off, so output is correct but marginally
slower. `babel-plugin-react-compiler` remains a dependency.

## Confirmed cause #2 — stale `.next` cache

After a crash, the corrupted build state persists. `reactCompiler: false` alone
is not enough — the fix only took effect once the cache was also cleared.

```
rm -rf apps/web/.next      # Windows: rmdir /s /q apps\web\.next
pnpm run dev
```

This is why a fix can appear not to work: the config change is real, but the
cache replays the old failure.

## Ruled out — recorded so it is not re-tested

- **Missing `GOOGLE_GENERATIVE_AI_API_KEY`.** An empty value in `.env` makes
  varlock print a configuration error and exit. That produces a *different*
  failure — a `-1073740791` (`0xC0000409`) assertion from libuv during
  shutdown, not the parsing error above. Both can appear together; the
  assertion is the harmless aftermath, not the cause.
- **Poisoned cache as the sole cause.** A fresh `distDir` still failed, so the
  cache alone is not sufficient. It is a necessary partner to the config fix,
  not an independent root cause.
- **`sonner.tsx` itself.** The file is plain ASCII and valid. It only ever
  appeared as the first victim of the worker crash.

## Working diagnosis procedure

1. `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/`
2. Read `apps/web/.next/dev/logs/next-development.log` for the newest error.
3. Free memory first — it is the cheapest thing to check and the most common
   cause of process-spawn failures on Windows:

   ```powershell
   Get-CimInstance Win32_OperatingSystem | % { "FreeMB: " + [int]($_.FreePhysicalMemory/1KB) }
   (Get-Process node -ErrorAction SilentlyContinue | Measure-Object).Count
   ```

   Stale node processes accumulate. Do **not** blanket-kill them: another
   terminal may be running the server that backs an editor or agent session.
   Stop a specific PID only, and confirm what it is first:

   ```powershell
   $c = Get-NetTCPConnection -LocalPort 3001 -State Listen
   foreach ($x in $c) { (Get-CimInstance Win32_Process -Filter "ProcessId=$($x.OwningProcess)").CommandLine }
   ```

4. Clear the cache and restart.
5. If it still fails, bisect `next.config.ts` — that is what found cause #1.

## Running two dev servers

Next.js refuses two dev servers in the same directory (shared `.next` lock) and
the error is misleading:

```
⨯ Another next dev server is already running.
  PID: 22620
```

To run a second one without disturbing the first, give it a separate build
directory. This is opt-in and off by default so normal runs are unaffected:

```ts
// apps/web/next.config.ts
...(process.env.NEXUS_DIST_DIR ? { distDir: process.env.NEXUS_DIST_DIR } : {}),
```

```bash
NEXUS_DIST_DIR=.next-verify npx next dev --port 3005
```

Remember to delete the temporary `.next-*` directory afterwards, and to remove
any `.next-*` paths Next auto-adds to `tsconfig.json` `include`.