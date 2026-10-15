import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tiger Fitness Admin",
    short_name: "Tiger Fitness",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf8f5",
    theme_color: "#1a1613",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
