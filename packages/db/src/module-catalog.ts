/**
 * THE 13 MODULES
 * ------------------------------------------------------------
 * The single source of truth for the catalogue. `pnpm db:seed`
 * writes these into the `modules` table; apps/web reads from
 * there at runtime and falls back to CATALOG when the database
 * is unreachable, so / still renders with Docker off.
 *
 * The landing page carries its own copy of this list as a plain
 * array because it is deliberately free of the database. The two
 * are kept in step by hand — apps/web/src/lib/modules.ts is where
 * that duplication is documented and the fallback happens.
 */

export type CatalogModule = {
  /** NMU course code. Doubles as the natural key and the URL segment. */
  readonly code: string;
  readonly name: string;
  readonly description: string;
  /** South African rand, in cents. R50 = 5000. */
  readonly priceCents: number;
  /** Only MATT101 has a sample written so far. */
  readonly hasTrialPdf: boolean;
  readonly status: "available" | "coming-soon";
};

export const CATALOG: ReadonlyArray<CatalogModule> = [
  {
    code: "MATT101",
    name: "Core Mathematics I",
    description:
      "Calculus foundations, limits, derivatives, and the algebra that holds it all up.",
    priceCents: 5000,
    hasTrialPdf: true,
    status: "available",
  },
  {
    code: "MATT102",
    name: "Core Mathematics II",
    description:
      "Integration, sequences, series, and the techniques that close out first year.",
    priceCents: 5000,
    hasTrialPdf: false,
    status: "coming-soon",
  },
  {
    code: "MAPV101",
    name: "Applied Mathematics I",
    description:
      "Vectors, mechanics, and the math that maps to real physical problems.",
    priceCents: 5000,
    hasTrialPdf: false,
    status: "coming-soon",
  },
  {
    code: "MAPV102",
    name: "Applied Mathematics II",
    description:
      "Dynamics, work, energy, and the differential models behind them.",
    priceCents: 5000,
    hasTrialPdf: false,
    status: "coming-soon",
  },
  {
    code: "MAPV111",
    name: "Applied Math (Ext) I",
    description:
      "Richer mechanics and proof-based methods for the extended stream.",
    priceCents: 5000,
    hasTrialPdf: false,
    status: "coming-soon",
  },
  {
    code: "MAPV112",
    name: "Applied Math (Ext) II",
    description:
      "Advanced modelling, multivariable problems, and the deeper toolkit.",
    priceCents: 5000,
    hasTrialPdf: false,
    status: "coming-soon",
  },
  {
    code: "WRAV101",
    name: "C# Programming I",
    description:
      "From your first console app to clean, typed, object-oriented code.",
    priceCents: 5000,
    hasTrialPdf: false,
    status: "coming-soon",
  },
  {
    code: "WRAV102",
    name: "C# Programming II",
    description:
      "Collections, generics, LINQ, and the patterns real software relies on.",
    priceCents: 5000,
    hasTrialPdf: false,
    status: "coming-soon",
  },
  {
    code: "WRSC111",
    name: "MATLAB Programming",
    description:
      "Scripting, matrices, and the numerical toolkit used across engineering.",
    priceCents: 5000,
    hasTrialPdf: false,
    status: "coming-soon",
  },
  {
    code: "WRFV101",
    name: "Computer Fundamentals I",
    description:
      "How a computer actually works, from bits and gates to operating systems.",
    priceCents: 5000,
    hasTrialPdf: false,
    status: "coming-soon",
  },
  {
    code: "WRFV102",
    name: "Computer Fundamentals II",
    description:
      "Networks, databases, and the layers between hardware and software.",
    priceCents: 5000,
    hasTrialPdf: false,
    status: "coming-soon",
  },
  {
    code: "STAS101",
    name: "Statistics I",
    description:
      "Descriptive statistics, probability, and the reasoning behind the numbers.",
    priceCents: 5000,
    hasTrialPdf: false,
    status: "coming-soon",
  },
  {
    code: "STAS102",
    name: "Statistics II",
    description:
      "Inference, regression, and the tests that turn data into decisions.",
    priceCents: 5000,
    hasTrialPdf: false,
    status: "coming-soon",
  },
];

/**
 * Bundle pricing, mirroring the landing page's two rows.
 *
 * TODO: the landing copy reads "all 7 modules" while the catalogue
 * lists 13. Tracked in IDEAS/TODO.md; BUNDLES.full is priced as if
 * it covered the whole catalogue (13 x R50 = R650, discounted to
 * R250) until the copy is corrected one way or the other.
 */
export const BUNDLES = {
  single: { amountCents: 5000, label: "one module, one semester" },
  full: { amountCents: 25000, label: "the whole catalogue", wasAmountCents: 65000 },
} as const;