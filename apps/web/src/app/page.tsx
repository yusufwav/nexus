import type { Metadata } from "next";

import AiMarquee from "@/components/landing/ai-marquee";
import AsciiField from "@/components/landing/ascii-field";
import ChatPartner, { type ChatMessage } from "@/components/landing/chat-partner";
import LandingNav from "@/components/landing/landing-nav";
import MissionSection from "@/components/landing/mission-section";
import ModuleList, { type ModuleEntry } from "@/components/landing/module-list";
import MorphTitle from "@/components/landing/morph-title";
import PriceTable from "@/components/landing/price-table";
import ReviewsList, { type ReviewEntry } from "@/components/landing/reviews-list";
import ScrollReveal from "@/components/landing/scroll-reveal";
import TerminalHero from "@/components/landing/terminal-hero";

import "@/styles/landing.css";

export const metadata: Metadata = {
  title: "Nexus · Notes that learn you as you learn",
  description:
    "First-year Computer Science notes for Nelson Mandela University students, rebuilt from the ground up. Maths, C#, MATLAB, fundamentals and statistics.",
};

/* ---- Hero ---- */
const MORPH_PHRASES: ReadonlyArray<string> = ["Notes that learn you", "as you learn them"];

const HERO_SUBHEAD = "The notes we got were good enough. But I made them better.";

const HERO_CTA = { label: "open modules", href: "#modules" } as const;

/* ---- Terminal README ---- */
const README_TAGLINE: ReadonlyArray<string> = [
  "Nexus Tutoring is an AI-powered study platform leveraging RAG to improve student learning.",
  "Powered by an intelligent chatbot and shared study notes,",
  "it helps students master coursework with contextual AI support.",
];

/* ---- Mission ---- */
const MISSION_PARAGRAPHS: ReadonlyArray<string> = [
  "Nexus exists to bring Computer Science students at Nelson Mandela University up to the level the rest of the world is already working at, starting with the modules sitting in front of you right now.",
  "And the uncomfortable part nobody in academia wants to say out loud: most people no longer have the attention span to open a textbook. Courses are still built on the assumption that they do, and that assumption is exactly why capable students fall behind.",
];

const MISSION_POINTS = [
  {
    title: "The notes we get are sufficient.",
    body: "They really are. But sufficient is not the equivalent to being understood, so I took them apart and rebuilt them with clearer structure and worked examples, specifically to target building intuition as you go.",
  },
  {
    title: "AI fluency is quietly becoming a requirement",
    body: "that universities have not yet decided how to qualify. Learning these tools now, while you are still studying, is the difference between catching up and leading.",
  },
  {
    title: "Everything is aimed at one outcome:",
    body: "making you genuinely competitive with students anywhere in the world, at a price a student can actually afford.",
  },
  {
    title: "For some of us, learning just clicks.",
    body: "For the rest, it takes hearing the same idea a different way, in our own words, or at our own pace. That is what a study partner is for.",
  },
] as const;

const MISSION_SIGNATURE =
  "A quick word about me: I am a first year CS student at NMU building this in my own time, because I remember how disorienting that first semester was. If something here is wrong or unclear, tell me and I will fix it.";

/* ---- Modules ---- */
const MODULES: ReadonlyArray<ModuleEntry> = [
  { code: "MATT101", name: "Core Mathematics I", description: "Calculus foundations, limits, derivatives, and the algebra that holds it all up." },
  { code: "MATT102", name: "Core Mathematics II", description: "Integration, sequences, series, and the techniques that close out first year." },
  { code: "MAPV101", name: "Applied Mathematics I", description: "Vectors, mechanics, and the math that maps to real physical problems." },
  { code: "MAPV102", name: "Applied Mathematics II", description: "Dynamics, work, energy, and the differential models behind them." },
  { code: "MAPV111", name: "Applied Math (Ext) I", description: "Richer mechanics and proof-based methods for the extended stream." },
  { code: "MAPV112", name: "Applied Math (Ext) II", description: "Advanced modelling, multivariable problems, and the deeper toolkit." },
  { code: "WRAV101", name: "C# Programming I", description: "From your first console app to clean, typed, object-oriented code." },
  { code: "WRAV102", name: "C# Programming II", description: "Collections, generics, LINQ, and the patterns real software relies on." },
  { code: "WRSC111", name: "MATLAB Programming", description: "Scripting, matrices, and the numerical toolkit used across engineering." },
  { code: "WRFV101", name: "Computer Fundamentals I", description: "How a computer actually works, from bits and gates to operating systems." },
  { code: "WRFV102", name: "Computer Fundamentals II", description: "Networks, databases, and the layers between hardware and software." },
  { code: "STAS101", name: "Statistics I", description: "Descriptive statistics, probability, and the reasoning behind the numbers." },
  { code: "STAS102", name: "Statistics II", description: "Inference, regression, and the tests that turn data into decisions." },
];

const MODULES_TITLE = "13 modules total, for every semester I've done.";
const MODULES_LEAD =
  "Hover any line to see what it actually covers. The list grows as I finish each set of notes.";

/* ---- Marquee ---- */
const AI_TAGS: ReadonlyArray<string> = [
  "trading",
  "research",
  "medical study",
  "maths papers",
  "writing",
  "therapy",
  "coding",
  "law",
  "design",
  "music",
  "data analysis",
  "language",
  "finance",
  "education",
];

/* ---- Partner ---- */
const CHAT: ReadonlyArray<ChatMessage> = [
  { who: "student", text: "how does the chain rule work? explain like im 5" },
  {
    who: "partner",
    text: `The chain rule is an onion you peel one layer at a time.
If a function is inside another f(g(x)) pretend you only have f(x)
then differentiate it. now you have f'(g(x)) and once again,
differentiate g(x) on its own and multiply the two derivatives together,
and you'll get something that looks like this! f'(g(x)) × g'(x)`,
  },
  { who: "student", text: "ok but show me with numbers" },
  {
    who: "partner",
    text: `Let f(x) = 5 × g(x)² and g(x) = x³ Then f'(x) = f'(g(x)) × g'(x).
so substitute in the variables, (5 × 2(x³) ) × (3x²) and simplify,
(10x³)×(3x²) = 30x⁵ done! Want to try one on your own?`,
  },
];

const PARTNER_TITLE = "It learns you back";
const PARTNER_LEAD =
  "Not a search box returning a definition. A study partner that explains topics like it's the first time you're hearing it.";
const PARTNER_FOOTNOTE = "In development, launching with the notes.";

/* ---- Pricing ---- */
const PRICING_TITLE = "Unlock the whole semester";
const PRICES = [
  { label: "one module, one semester", amount: "R50" },
  {
    label: "all 7 modules, one semester",
    amount: "R250",
    badge: "SAVE R100",
    bundle: true,
  },
] as const;
const PRICING_FOOTNOTE = "Notes stay yours either way. Pick what you need, or take the lot.";

/* ---- Reviews ---- */
const REVIEWS: ReadonlyArray<ReviewEntry> = [
  {
    name: "Placeholder Student",
    module: "MATT101",
    rating: 5,
    summary: "derivatives finally clicked",
    body: "I had tried three YouTube videos before this and none of them stuck. The worked examples show the reasoning instead of skipping to the answer, which was the part I was missing.",
  },
  {
    name: "Placeholder Student",
    module: "WRAV101",
    rating: 5,
    summary: "my first real object-oriented code",
    body: "Coming into C# I could write code but not explain it. The notes made me stop and think about why each step was there, and suddenly the syntax stopped feeling arbitrary.",
  },
  {
    name: "Placeholder Student",
    module: "STAS102",
    rating: 4,
    summary: "inference finally makes sense",
    body: "Regression looked like memorised formulas until I saw why each one was derived. Still slow on the exam questions, but I understand what I am doing now.",
  },
  {
    name: "Placeholder Student",
    module: "MAPV101",
    rating: 5,
    summary: "vectors finally visual",
    body: "I could do the arithmetic but not picture the problem. Drawing the free body diagram alongside each worked solution fixed that. First time mechanics has felt reason-able.",
  },
  {
    name: "Placeholder Student",
    module: "MATT102",
    rating: 5,
    summary: "series stopped being scary",
    body: "I convinced myself for a whole semester that I was bad at second year maths. Turns out I just never had anyone explaining convergence in a way that landed.",
  },
];

const REVIEWS_TITLE = "What students are saying";
const REVIEWS_LEAD =
  "Placeholders for now. Replaced with real reviews as people work through the notes.";

export default function Landing(): React.JSX.Element {
  return (
    <div className="nt-root">
      {/* Fixed ASCII ambient layer, behind everything. */}
      <AsciiField variant="ambient" />
      <div className="nt-grid-bg" aria-hidden="true" />

      <LandingNav />
      <ScrollReveal />

      <main>
        {/* ---- LANDING: fullscreen, scrolls away to reveal the page ---- */}
        <section className="nt-landing" id="top">
          {/* Interactive fluid ASCII field. Canvas is z-index 0; the copy
              below is z-index 2 so it stays readable and clickable. */}
          <AsciiField variant="landing" />
          <div className="nt-landing__veil" aria-hidden="true" />

          <div className="nt-landing__inner">
            <span className="nt-landing__eyebrow">Computer Science · NMU</span>
            <MorphTitle phrases={MORPH_PHRASES} />
            <p className="nt-landing__sub">{HERO_SUBHEAD}</p>
            <div className="nt-landing__cta">
              <a className="nt-btn" href={HERO_CTA.href}>
                {HERO_CTA.label}
              </a>
              <a className="nt-btn nt-btn--ghost" href="#mission">
                why this exists
              </a>
            </div>
          </div>

          <a className="nt-landing__cue" href="#hero">
            scroll
          </a>
        </section>

        <TerminalHero tagline={README_TAGLINE} cta={HERO_CTA} />

        <MissionSection
          paragraphs={MISSION_PARAGRAPHS}
          points={MISSION_POINTS}
          signature={MISSION_SIGNATURE}
        />

        <ModuleList title={MODULES_TITLE} lead={MODULES_LEAD} modules={MODULES} />

        <AiMarquee tags={AI_TAGS} />

        <ChatPartner
          title={PARTNER_TITLE}
          lead={PARTNER_LEAD}
          messages={CHAT}
          footnote={PARTNER_FOOTNOTE}
        />

        <PriceTable
          title={PRICING_TITLE}
          rows={PRICES}
          footnote={PRICING_FOOTNOTE}
          cta={{ label: "get started", href: "/login" }}
        />

        <ReviewsList title={REVIEWS_TITLE} lead={REVIEWS_LEAD} reviews={REVIEWS} />
      </main>

      <footer className="nt-footer">
        built by a first year CS student at NMU · if something is wrong, tell me
      </footer>
    </div>
  );
}
