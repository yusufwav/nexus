/**
 * MODULE TOPICS
 * ------------------------------------------------------------
 * The per-topic breakdown of a module's notes. Each topic is one
 * PDF: a student downloads the one they are stuck on, not the whole
 * module, which is the entire point of splitting them up.
 *
 * ADDING A TOPIC is one entry here plus the PDF at `pdf`. Nothing
 * in the page or the route needs to change.
 *
 *   {
 *     slug: "matt101-limits",     // url-safe, stable, globally unique
 *     title: "Limits and continuity",
 *     description: "...",         // expands on hover, like the landing list
 *     pdf: "/topics/matt101-limits.pdf",  // lives in /public/topics/
 *     pages: 12,                  // shown as metadata, or null
 *   }
 *
 * REMOVING one is deleting the entry. `pdf: null` marks a topic
 * whose file has not been written yet — the row still renders, so
 * the structure is visible before the content exists.
 *
 * SLUGS MUST BE UNIQUE ACROSS EVERY MODULE, not just within one.
 * app/api/topics/[slug]/route.ts resolves a slug by scanning this
 * whole object, so two modules claiming "integration" would make the
 * download URL ambiguous and whichever module came second would win.
 * Every slug here is prefixed with its module code for that reason —
 * keep it that way when adding entries.
 *
 * The gate lives in app/api/topics/[slug]/route.ts, which decides
 * what a given viewer may fetch. A topic is never gated on its own;
 * it inherits its module's purchase, so paying for MATT101 unlocks
 * every topic on it. That is deliberate — one purchase, all of that
 * module's notes.
 *
 * Every `pdf` below is null and every `pages` count is invented: no
 * real topic PDF exists yet. See IDEAS/TODO.md.
 *
 * TODO: real topic PDFs. See IDEAS/TODO.md.
 */

/** One downloadable chunk of a module's notes. */
export interface ModuleTopic {
  /** URL-safe identifier. Used in download links, so keep it stable. */
  readonly slug: string;
  readonly title: string;
  /** One line. Shown when the row expands. */
  readonly description: string;
  /**
   * Where the file sits under /public. Null until the real PDF is
   * written, which keeps the row visible with its action disabled.
   */
  readonly pdf: string | null;
  /** Page count, shown as metadata. Null when unknown. */
  readonly pages: number | null;
}

/** Topics for every module, keyed by modules.code. */
export const MODULE_TOPICS: Readonly<Record<string, ReadonlyArray<ModuleTopic>>> = {
  MATT101: [
    {
      slug: "matt101-limits",
      title: "Limits and continuity",
      description:
        "Approach rather than substitution, one-sided limits, and why a limit can exist at a point the function is not defined at.",
      pdf: null,
      pages: 14,
    },
    {
      slug: "matt101-derivatives",
      title: "Derivatives as rates of change",
      description:
        "From the average rate to the instantaneous one, and why the formal definition is just bookkeeping once you read it that way.",
      pdf: null,
      pages: 11,
    },
    {
      slug: "matt101-rules",
      title: "Power, product and quotient rules",
      description:
        "Derived from the limit laws rather than memorised, so they can be reconstructed under exam pressure.",
      pdf: null,
      pages: 9,
    },
    {
      slug: "matt101-chain-rule",
      title: "The chain rule",
      description:
        "Nested functions, where most marks are lost. Differentiate the outside, leave the inside, multiply by its derivative.",
      pdf: null,
      pages: 8,
    },
    {
      slug: "matt101-curvature",
      title: "Higher derivatives and curvature",
      description:
        "Using the second derivative to tell a maximum from a minimum, and reading f'' = 0 as inconclusive rather than as an answer.",
      pdf: null,
      pages: 7,
    },
    {
      slug: "matt101-modelling",
      title: "Reading a derivative into words",
      description:
        "Turning a number with a sign and a unit back into a sentence about the underlying situation. The step that separates the marks.",
      pdf: null,
      pages: 10,
    },
  ],

  MATT102: [
    {
      slug: "matt102-antiderivatives",
      title: "Antiderivatives and the fundamental idea",
      description:
        "Reversing the derivative, why every continuous function has one, and what that tells you about area.",
      pdf: null,
      pages: 12,
    },
    {
      slug: "matt102-techniques",
      title: "Integration techniques",
      description:
        "Substitution, parts, and partial fractions — each one a substitution in disguise, chosen by reading the integrand.",
      pdf: null,
      pages: 16,
    },
    {
      slug: "matt102-improper",
      title: "Improper integrals",
      description:
        "When the interval is infinite or the function blows up. Convergence is a comparison, not a calculation.",
      pdf: null,
      pages: 9,
    },
    {
      slug: "matt102-sequences",
      title: "Sequences and their limits",
      description:
        "Monotone and bounded, the two conditions that guarantee a limit, and why most sequences are neither.",
      pdf: null,
      pages: 10,
    },
    {
      slug: "matt102-series",
      title: "Series and convergence tests",
      description:
        "Why a series diverges and an integral converges while both look like 'adding things up'. Ratio and root tests.",
      pdf: null,
      pages: 15,
    },
    {
      slug: "matt102-power-series",
      title: "Power series and Taylor",
      description:
        "Approximating a function by its polynomial, and knowing where the approximation stops being true.",
      pdf: null,
      pages: 13,
    },
  ],

  MAPV101: [
    {
      slug: "mapv101-vectors",
      title: "Vectors in two and three dimensions",
      description:
        "Components, dot and cross products, and the geometric meaning of each rather than the formula for it.",
      pdf: null,
      pages: 13,
    },
    {
      slug: "mapv101-lines-planes",
      title: "Lines and planes",
      description:
        "Parametric and vector forms, and finding where a line meets a plane. The part that quietly costs marks.",
      pdf: null,
      pages: 11,
    },
    {
      slug: "mapv101-statics",
      title: "Statics and equilibrium",
      description:
        "Free body diagrams as the one step that cannot be skipped, and solving the resulting equations for reactions.",
      pdf: null,
      pages: 12,
    },
    {
      slug: "mapv101-moments",
      title: "Moments and centres of gravity",
      description:
        "Turning a shape into a single equivalent point, and when you are allowed to pretend it is uniform.",
      pdf: null,
      pages: 10,
    },
    {
      slug: "mapv101-trig",
      title: "Trigonometry and the unit circle",
      description:
        "Radians, exact values, and why the identities are easier to use than to memorise.",
      pdf: null,
      pages: 12,
    },
    {
      slug: "mapv101-matrices",
      title: "Matrices and transformations",
      description:
        "Solving simultaneous equations, and reading a matrix as a transformation rather than a grid of numbers.",
      pdf: null,
      pages: 14,
    },
  ],

  MAPV102: [
    {
      slug: "mapv102-kinematics",
      title: "Kinematics in one dimension",
      description:
        "Position, velocity and acceleration as derivatives of each other, and solving the three forms.",
      pdf: null,
      pages: 13,
    },
    {
      slug: "mapv102-newton",
      title: "Newton's laws and free-body diagrams",
      description:
        "Building the diagram before writing anything, which is where most of the marks are actually earned.",
      pdf: null,
      pages: 11,
    },
    {
      slug: "mapv102-work-energy",
      title: "Work, energy and power",
      description:
        "The work-energy theorem as a shortcut that skips the integration, and when it is legitimate to use it.",
      pdf: null,
      pages: 12,
    },
    {
      slug: "mapv102-momentum",
      title: "Momentum and collisions",
      description:
        "Conservation in one and two dimensions, and what an inelastic collision costs you in kinetic energy.",
      pdf: null,
      pages: 12,
    },
    {
      slug: "mapv102-dynamics",
      title: "Rigid body dynamics",
      description:
        "Rotation, moments of inertia, and why a rolling wheel couples the two halves of the chapter.",
      pdf: null,
      pages: 15,
    },
    {
      slug: "mapv102-oscillations",
      title: "Oscillations and waves",
      description:
        "Simple harmonic motion as the response of a system near equilibrium, and what damping changes.",
      pdf: null,
      pages: 14,
    },
  ],

  MAPV111: [
    {
      slug: "mapv111-proofs",
      title: "Proof techniques",
      description:
        "Implication, contrapositive, contradiction and induction, and which one a given problem is asking for.",
      pdf: null,
      pages: 14,
    },
    {
      slug: "mapv111-matrices-eigen",
      title: "Matrices and eigenvalues",
      description:
        "Diagonalisation as the reason eigenvectors exist, and what a repeated eigenvalue tells you.",
      pdf: null,
      pages: 15,
    },
    {
      slug: "mapv111-vectors-3d",
      title: "Vector analysis",
      description:
        "Gradient, divergence and curl, with each one tied back to the physical question it answers.",
      pdf: null,
      pages: 13,
    },
    {
      slug: "mapv111-differential-eqs",
      title: "First and second order ODEs",
      description:
        "Separation and integrating factors, then linear second order and what the complementary solution represents.",
      pdf: null,
      pages: 17,
    },
    {
      slug: "mapv111-numerical",
      title: "Numerical methods",
      description:
        "Euler and RK4 as approximations with a known error, and picking a step size you can defend.",
      pdf: null,
      pages: 12,
    },
    {
      slug: "mapv111-modelling",
      title: "Modelling and dimensional analysis",
      description:
        "Turning a word problem into equations and checking the units before you trust the answer.",
      pdf: null,
      pages: 11,
    },
  ],

  MAPV112: [
    {
      slug: "mapv112-bisection-method",
      title: "The bisection method",
      description:
        "Halving an interval until it is small enough to call, and the one question the method keeps asking: is the answer above or below the midpoint?",
      // Lives in apps/web/private-assets/topics/, not /public. A file
      // under /public is served by URL with no auth in the request
      // path, which would make the purchase gate decorative.
      pdf: "/topics/Bisection_Method.pdf",
      // Counted from the file itself — 20 page objects in its object
      // streams — rather than guessed like the entries below.
      pages: 20,
    },
    {
      slug: "mapv112-multivariable",
      title: "Multivariable calculus",
      description:
        "Partial derivatives and the gradient as a direction of steepest ascent, not a number.",
      pdf: null,
      pages: 16,
    },
    {
      slug: "mapv112-double-integrals",
      title: "Double and triple integrals",
      description:
        "Changing the order of integration to make a region tractable, which is the whole skill.",
      pdf: null,
      pages: 15,
    },
    {
      slug: "mapv112-line-surface",
      title: "Line and surface integrals",
      description:
        "Work along a curve and flux through a surface, and why Green's theorem saves an afternoon.",
      pdf: null,
      pages: 14,
    },
    {
      slug: "mapv112-laplace",
      title: "Laplace transforms",
      description:
        "Converting a differential equation into algebra, and reading poles back as growth and oscillation.",
      pdf: null,
      pages: 13,
    },
    {
      slug: "mapv112-fourier",
      title: "Fourier series",
      description:
        "Any reasonable function as a sum of sines, and what the coefficients physically represent.",
      pdf: null,
      pages: 15,
    },
    {
      slug: "mapv112-pde",
      title: "Partial differential equations",
      description:
        "Heat, wave and Laplace equations, with the boundary conditions that decide the answer.",
      pdf: null,
      pages: 16,
    },
  ],

  WRAV101: [
    {
      slug: "wrav101-environment",
      title: "Setting up and the first program",
      description:
        "Compiling, running, and reading the error messages you will spend the first month ignoring.",
      pdf: null,
      pages: 9,
    },
    {
      slug: "wrav101-types",
      title: "Types, variables and conversion",
      description:
        "The type system as the thing that catches your mistakes for you, if you let it.",
      pdf: null,
      pages: 11,
    },
    {
      slug: "wrav101-control",
      title: "Decisions and loops",
      description:
        "Scope, the loop you will run off the end of by accident, and how to tell before you run it.",
      pdf: null,
      pages: 12,
    },
    {
      slug: "wrav101-methods",
      title: "Methods and parameters",
      description:
        "Pass by value versus pass by reference, and the bug that comes from confusing them.",
      pdf: null,
      pages: 12,
    },
    {
      slug: "wrav101-oop",
      title: "Classes and objects",
      description:
        "Encapsulation as the point rather than syntax, and designing a class you can change later.",
      pdf: null,
      pages: 15,
    },
    {
      slug: "wrav101-arrays",
      title: "Arrays and file handling",
      description:
        "One-dimensional arrays, and reading from a file without losing a day to it.",
      pdf: null,
      pages: 11,
    },
  ],

  WRAV102: [
    {
      slug: "wrav102-collections",
      title: "Collections and generics",
      description:
        "List, dictionary and the interface that lets you swap one for another without rewriting.",
      pdf: null,
      pages: 14,
    },
    {
      slug: "wrav102-linq",
      title: "LINQ",
      description:
        "Query syntax as a pipeline, and recognising when a loop was the clearer choice.",
      pdf: null,
      pages: 13,
    },
    {
      slug: "wrav102-exceptions",
      title: "Exceptions and error handling",
      description:
        "What to catch, what to rethrow, and why catching everything hides the bug rather than fixing it.",
      pdf: null,
      pages: 11,
    },
    {
      slug: "wrav102-structures",
      title: "Structs, records and equality",
      description:
        "Value versus reference types, and overloading equality so your collections behave.",
      pdf: null,
      pages: 12,
    },
    {
      slug: "wrav102-interfaces",
      title: "Interfaces and abstraction",
      description:
        "Programming against an interface rather than a class, which is what makes code testable.",
      pdf: null,
      pages: 13,
    },
    {
      slug: "wrav102-patterns",
      title: "Patterns real software uses",
      description:
        "Repository, factory and observer, read from the code you already maintain rather than invented.",
      pdf: null,
      pages: 16,
    },
  ],

  WRSC111: [
    {
      slug: "wrsc111-scripting",
      title: "Scripting and vectors",
      description:
        "The language, the semicolon, and why every expression returns a value you did not ask for.",
      pdf: null,
      pages: 10,
    },
    {
      slug: "wrsc111-matrices",
      title: "Matrices and indexing",
      description:
        "One-based indexing, colon operators, and the indexing mistake MATLAB forgives and C does not.",
      pdf: null,
      pages: 13,
    },
    {
      slug: "wrsc111-operations",
      title: "Element-wise versus matrix operations",
      description:
        "The dot that changes the meaning of everything. The single most common source of wrong answers.",
      pdf: null,
      pages: 11,
    },
    {
      slug: "wrsc111-control",
      title: "Control flow and functions",
      description:
        "Vectorising a loop away, and writing functions with outputs rather than side effects.",
      pdf: null,
      pages: 12,
    },
    {
      slug: "wrsc111-plotting",
      title: "Plotting and figures",
      description:
        "Labelling an axis properly, which is most of what a good plot is.",
      pdf: null,
      pages: 10,
    },
    {
      slug: "wrsc111-numerical",
      title: "Numerical methods in practice",
      description:
        "Roots, integration and fitting, using the built-ins and knowing what they assume.",
      pdf: null,
      pages: 14,
    },
  ],

  WRFV101: [
    {
      slug: "wrfv101-number-systems",
      title: "Number systems and representation",
      description:
        "Binary, hex, and overflow. Why 0.1 plus 0.2 is not 0.3 is not a floating point bug.",
      pdf: null,
      pages: 12,
    },
    {
      slug: "wrfv101-logic",
      title: "Boolean logic and gates",
      description:
        "Translating a truth table into hardware, and simplifying before you build anything.",
      pdf: null,
      pages: 13,
    },
    {
      slug: "wrfv101-boolean-algebra",
      title: "Boolean algebra",
      description:
        "The algebra that makes gate-level simplification possible, and the laws worth memorising.",
      pdf: null,
      pages: 11,
    },
    {
      slug: "wrfv101-organisation",
      title: "CPU organisation",
      description:
        "Fetch, decode, execute, and what a clock cycle actually buys you.",
      pdf: null,
      pages: 13,
    },
    {
      slug: "wrfv101-memory",
      title: "Memory hierarchy",
      description:
        "Registers, cache, RAM and disk, and why access pattern matters more than capacity.",
      pdf: null,
      pages: 12,
    },
    {
      slug: "wrfv101-os",
      title: "Operating systems",
      description:
        "Processes, scheduling, and virtual memory as the trick that lets you run more than you have.",
      pdf: null,
      pages: 15,
    },
  ],

  WRFV102: [
    {
      slug: "wrfv102-osi",
      title: "The OSI model",
      description:
        "Seven layers as a debugging tool: find the failing layer first, then look there.",
      pdf: null,
      pages: 12,
    },
    {
      slug: "wrfv102-physical",
      title: "Physical and data link layers",
      description:
        "Cabling, framing, error detection, and what a switch actually does with your frame.",
      pdf: null,
      pages: 14,
    },
    {
      slug: "wrfv102-network",
      title: "IP addressing and routing",
      description:
        "Subnets, masks, and finding your way through a routing table by hand.",
      pdf: null,
      pages: 16,
    },
    {
      slug: "wrfv102-transport",
      title: "TCP and UDP",
      description:
        "Handshake, retransmission, and choosing between reliability and latency.",
      pdf: null,
      pages: 13,
    },
    {
      slug: "wrfv102-databases",
      title: "Database fundamentals",
      description:
        "Relational model, normalisation, and why the third normal form exists.",
      pdf: null,
      pages: 15,
    },
    {
      slug: "wrfv102-web",
      title: "Application layer and the web",
      description:
        "HTTP, DNS and TLS, from typing a URL to the bytes arriving.",
      pdf: null,
      pages: 14,
    },
  ],

  STAS101: [
    {
      slug: "stas101-univariate",
      title: "Univariate data",
      description:
        "Centre, spread and shape, and why the mean alone can describe nothing at all.",
      pdf: null,
      pages: 12,
    },
    {
      slug: "stas101-display",
      title: "Displaying data honestly",
      description:
        "Histograms, boxplots and the bin-width decision that changes the story you appear to tell.",
      pdf: null,
      pages: 11,
    },
    {
      slug: "stas101-probability",
      title: "Probability foundations",
      description:
        "Sample spaces, conditional probability and independence, which are different questions.",
      pdf: null,
      pages: 14,
    },
    {
      slug: "stas101-distributions",
      title: "Discrete distributions",
      description:
        "Binomial and Poisson, and recognising which counting problem is really a binomial in disguise.",
      pdf: null,
      pages: 13,
    },
    {
      slug: "stas101-continuous",
      title: "Continuous distributions",
      description:
        "Normal, uniform and exponential, with the density read as a rate rather than a probability.",
      pdf: null,
      pages: 14,
    },
    {
      slug: "stas101-estimation",
      title: "Estimation and interval interpretation",
      description:
        "Point estimates versus intervals, and what a confidence level does and does not mean.",
      pdf: null,
      pages: 13,
    },
  ],

  STAS102: [
    {
      slug: "stas102-sampling",
      title: "Sampling distributions",
      description:
        "What the CLT actually says, and the standard error you get for free from it.",
      pdf: null,
      pages: 12,
    },
    {
      slug: "stas102-hypotheses",
      title: "Hypothesis testing and errors",
      description:
        "Type I and Type II, and choosing alpha before you look at the data.",
      pdf: null,
      pages: 14,
    },
    {
      slug: "stas102-ttest",
      title: "t-tests and their assumptions",
      description:
        "One-sample, paired and two-sample, plus the assumptions each quietly depends on.",
      pdf: null,
      pages: 14,
    },
    {
      slug: "stas102-chisquare",
      title: "Chi-square tests",
      description:
        "Goodness of fit and independence, both of which are really about comparing observed to expected.",
      pdf: null,
      pages: 12,
    },
    {
      slug: "stas102-regression",
      title: "Simple and multiple regression",
      description:
        "Deriving the least squares line rather than quoting it, and reading the coefficients.",
      pdf: null,
      pages: 16,
    },
    {
      slug: "stas102-anova",
      title: "ANOVA and non-parametrics",
      description:
        "Comparing more than two groups, and the rank-based alternatives when the assumptions fail.",
      pdf: null,
      pages: 15,
    },
  ],
};

/** The topics for a module code, or an empty list when it has none. */
export function topicsFor(code: string): ReadonlyArray<ModuleTopic> {
  return MODULE_TOPICS[code] ?? [];
}