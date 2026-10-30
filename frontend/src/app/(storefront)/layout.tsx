import SiteShell from "@/components/layout/site-shell";

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SiteShell>{children}</SiteShell>;
}
