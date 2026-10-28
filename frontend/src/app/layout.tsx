import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "WhiteStag | Automotive parts for Ghana",
    template: "%s | WhiteStag",
  },
  description:
    "Find trusted automotive spare parts and support for the road ahead with WhiteStag.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
