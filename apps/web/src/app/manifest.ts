import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nexus",
    short_name: "Nexus",
    description: "Computer Science notes for NMU students",
    start_url: "/",
    display: "standalone",
    // These were #ffffff / #000000, which fought each other on a
    // dark-only site. Both now match the dark palette, which is what
    // an installed app launches into.
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: "/favicon/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/favicon/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
