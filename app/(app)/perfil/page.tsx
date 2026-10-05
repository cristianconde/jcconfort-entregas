import type { Metadata } from "next";
import { ChangePasswordForm } from "./change-password-form";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Mi perfil" };

export default function ProfilePage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h1 className="page-title">Mi perfil</h1>
      <ProfileForm />
      <ChangePasswordForm />
    </div>
  );
}
