/**
 * MODULE CATALOGUE
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — packages/db/src/module-catalog.ts
 *
 * The single source of truth for the catalogue. The web app seeds these rows
 * into Postgres and reads them back at runtime; the mobile app has no
 * server, so the catalogue IS the data and it is seeded into the local
 * SQLite database on first launch.
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
 */
export const BUNDLES = {
  single: { amountCents: 5000, label: "one module, one semester" },
  full: { amountCents: 25000, label: "the whole catalogue", wasAmountCents: 65000 },
} as const;

/**
 * The subject a module belongs to, derived from its code prefix.
 */
export function subjectOf(code: string): string {
  switch (code.slice(0, 4)) {
    case "MATT":
      return "Mathematics";
    case "MAPV":
      return "Applied Mathematics";
    case "WRAV":
    case "WRSC":
      return "Programming";
    case "WRFV":
      return "Fundamentals";
    case "STAS":
      return "Statistics";
    default:
      return "Other";
  }
}
