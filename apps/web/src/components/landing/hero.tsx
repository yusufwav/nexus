import Link from "next/link";

import { Button } from "@Main/ui/components/button";

export interface HeroProps {
  readonly headline: string;
  readonly subhead: string;
  readonly primaryCta: { readonly label: string; readonly href: string };
  readonly videoSrc?: string;
  readonly videoPoster?: string;
}

/**
 * Split-front hero. Right-side centered glassmorphism pane sits over a
 * full-bleed video + radial-cyan fallback. A bottom fade-to-black gradient
 * transitions into the next section.
 */
export default function Hero({
  headline,
  subhead,
  primaryCta,
  videoSrc,
  videoPoster,
}: HeroProps): React.JSX.Element {
  return (
    <section
      aria-labelledby="nexus-hero-heading"
      className="relative flex h-screen w-screen items-center justify-end overflow-hidden bg-black text-white"
    >
      <div className="nexus-bg-video" aria-hidden="true">
        {videoSrc !== undefined ? (
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={videoPoster}
            className="h-full w-full object-cover"
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        ) : (
          <div
            className="nexus-bg-video__fallback h-full w-full"
            style={{
              background:
                "radial-gradient(ellipse at 70% 40%, rgba(0, 229, 255, 0.18) 0%, rgba(0, 229, 255, 0.04) 35%, #000 75%)",
            }}
          />
        )}
      </div>

      <div className="nexus-hero-fade" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl items-center justify-end px-6 sm:px-10">
        <div className="glass-strong flex w-full max-w-xl flex-col gap-5 rounded-none p-8 text-white sm:p-10">
          <span className="font-helvetica text-[11px] uppercase tracking-[0.32em] text-[#00E5FF]">
            Nelson Mandela University
          </span>
          <span className="font-helvetica text-[11px] uppercase tracking-[0.32em] text-white/70">
            Computer Science
          </span>
          <h1
            id="nexus-hero-heading"
            className="font-helvetica text-3xl font-bold leading-[1.05] tracking-tight text-balance text-white sm:text-4xl md:text-5xl"
          >
            {headline}
          </h1>
          <p className="nexus-body max-w-md text-pretty text-white/80">{subhead}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              className="h-11 border border-[#00E5FF] bg-[#00E5FF] px-6 font-helvetica text-black hover:bg-[#00E5FF]/85"
            >
              <Link href={{ pathname: "/login" }}>{primaryCta.label}</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
