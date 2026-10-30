import type { Metadata } from "next";
import DashboardShell from "@/components/admin/dashboard-shell";
import { StaffAuthProvider } from "@/store/staff-auth-context";

export const metadata: Metadata = {
  title: "WhiteStag Console",
  description: "Internal operations console for WhiteStag staff.",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StaffAuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </StaffAuthProvider>
  );
}
