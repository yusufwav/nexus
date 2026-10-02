import Hero from "@/components/landing/hero";
import MatrixRain from "@/components/landing/matrix-rain";
import MissionBody from "@/components/landing/mission-body";
import ModulesContainer, { type ModuleCard } from "@/components/landing/modules-container";
import ReviewsSection, { type Review } from "@/components/landing/reviews-section";
import TickerMarquee from "@/components/landing/ticker-marquee";

const HERO_HEADLINE = "Learning with the notes that learn you, just as you learn it.";
const HERO_SUBHEAD =
  "A tutoring platform built for first-year Computer Science students at Nelson Mandela University. AI-assisted notes, structured modules, R50 per semester.";
const HERO_PRIMARY_CTA = { label: "Get started", href: "/login" };

const TICKER_ITEMS: ReadonlyArray<string> = [
  "Trading",
  "Research",
  "Medical Study",
  "Mathematics Papers",
  "Technical Writing",
  "Therapy",
  "Engineering",
  "Data Science",
  "Language Learning",
  "Code Review",
  "Past-Paper Drills",
  "Concept Maps",
  "Citation Help",
  "Lecture Summaries",
];

const MISSION_INTRO = "Why this exists.";
const MISSION_CONTEXT =
  "I grew up staring at the same 800-page textbooks you have been handed. They were written for someone with twice my attention span and half my distractions. If you have ever closed a chapter feeling like you understood the cover but not the content, this platform was built for you.";
const MISSION_POINTS: ReadonlyArray<{ readonly title: string; readonly body: string }> = [
  {
    title: "Where existing notes fall short",
    body: "Academic resources get you a pass. They do not get you fluent. Nexus was designed to close that gap with notes that adapt, examples that click, and an AI that walks a concept with you until it lands.",
  },
  {
    title: "AI is already a job requirement",
    body: "Industry expects AI fluency on day one. Universities are catching up, but the gap is already wide. Using these tools well, and using them honestly, is part of becoming a competitive graduate right now.",
  },
  {
    title: "Honest pricing, real notes",
    body: "Pick the modules you need at R50 each, or grab the full bundle at R250 for the semester. Every rand goes back into better notes, more past-paper coverage, and faster AI responses for the next student.",
  },
  {
    title: "Notes that learn you",
    body: "Some students absorb a concept the first time. Others need it broken into pieces that match how they think. The AI here adapts to you, the same way a great tutor would, so the material finally fits the way you learn it.",
  },
];
const MISSION_CLOSING =
  "Use the tools. Get fluent. Close the gap between where you are and where the rest of the world already is. That is the whole point.";

const MODULES: ReadonlyArray<ModuleCard> = [
  { code: "MATT101", name: "Core Mathematics I", description: "Calculus foundations, limits, derivatives, and the algebra that holds it all up." },
  { code: "MATT102", name: "Core Mathematics II", description: "Integration, sequences, series, and the techniques that close out first year." },
  { code: "MAPV101", name: "Applied Mathematics I", description: "Vectors, mechanics, and the math that maps to real physical problems." },
  { code: "MAPV102", name: "Applied Mathematics II", description: "Dynamics, work, energy, and the differential models behind them." },
  { code: "MAPV111", name: "Applied Mathematics (Extended) I", description: "Richer mechanics and proof-based methods for the extended stream." },
  { code: "MAPV112", name: "Applied Mathematics (Extended) II", description: "Advanced modelling, multivariable problems, and the deeper toolkit." },
  { code: "WRAV101", name: "C# Programming I", description: "From your first console app to clean, typed, object-oriented code." },
  { code: "WRAV102", name: "C# Programming II", description: "Collections, generics, LINQ, and the patterns real software relies on." },
  { code: "WRSC111", name: "MATLAB Programming", description: "Scripting, matrices, and the numerical toolkit used across engineering." },
  { code: "WRFV101", name: "Computer Fundamentals I", description: "How a computer actually works, from bits and gates to operating systems." },
  { code: "WRFV102", name: "Computer Fundamentals II", description: "Networks, databases, and the layers between hardware and software." },
  { code: "STAS101", name: "Statistics I", description: "Descriptive statistics, probability, and the reasoning behind the numbers." },
  { code: "STAS102", name: "Statistics II", description: "Inference, regression, and the tests that turn data into decisions." },
];

const REVIEWS: ReadonlyArray<Review> = [
  {
    id: "r1",
    avatarInitials: "TM",
    headline: "Saved my semester",
    body: "I was failing MATT102 until I started using the AI tutor at 11pm. It walked me through integration by parts three different ways until one finally clicked.",
    rating: 5,
  },
  {
    id: "r2",
    avatarInitials: "LS",
    headline: "Notes that actually explain",
    body: "The WRAV101 notes show why a snippet works, not just what it does. That made the difference between copying code and writing my own.",
    rating: 5,
  },
  {
    id: "r3",
    avatarInitials: "NK",
    headline: "Worth every rand",
    body: "R250 for the bundle is a joke compared to the textbook I never opened. The past-paper drills alone are worth more than the price.",
    rating: 5,
  },
  {
    id: "r4",
    avatarInitials: "AP",
    headline: "Patient AI, finally",
    body: "Other AI tools rush you. This one breaks the problem into smaller pieces when you stall. That is the feature I did not know I needed.",
    rating: 4,
  },
  {
    id: "r5",
    avatarInitials: "RD",
    headline: "MATLAB made simple",
    body: "WRSC111 used to terrify me. The MATLAB notes here are short, visual, and tied to actual scripts I can run. I actually enjoy it now.",
    rating: 5,
  },
];

export default function Landing(): React.JSX.Element {
  return (
    <div className="relative min-h-screen w-full bg-black text-white">
      <MatrixRain />

      <div className="nexus-scroll-hidden relative z-10 flex w-full flex-col">
        <Hero
          headline={HERO_HEADLINE}
          subhead={HERO_SUBHEAD}
          primaryCta={HERO_PRIMARY_CTA}
        />
        <TickerMarquee items={TICKER_ITEMS} duration={70} />
        <MissionBody
          introLine={MISSION_INTRO}
          contextParagraph={MISSION_CONTEXT}
          points={MISSION_POINTS}
          closingParagraph={MISSION_CLOSING}
        />
        <ModulesContainer
          heading="A library that grows with every module."
          pricingNotice="R50 per module per semester. R250 for the full bundle."
          modules={MODULES}
        />
        <ReviewsSection reviews={REVIEWS} />
      </div>
    </div>
  );
}
