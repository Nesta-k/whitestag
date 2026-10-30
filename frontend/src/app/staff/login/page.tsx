import type { Metadata } from "next";
import StaffLoginForm from "@/components/admin/staff-login-form";
import { StaffAuthProvider } from "@/store/staff-auth-context";

export const metadata: Metadata = {
  title: "Staff sign in | WhiteStag",
};

export default function StaffLoginPage() {
  return (
    <StaffAuthProvider>
      <StaffLoginForm />
    </StaffAuthProvider>
  );
}
