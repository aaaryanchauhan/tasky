import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { Card } from "@/components/ui/card";
import { getAdminOrNull } from "@/server/auth";
import { logoutAction } from "@/app/actions/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const who = await getAdminOrNull();
  if (who.state === "admin") redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <BrandMark size={56} />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Tiger Fitness</h1>
          <p className="text-sm text-ink-soft">Admin sign in</p>
        </div>
      </div>
      <Card>
        {who.state === "not_admin" || error === "forbidden" ? (
          <div className="space-y-4">
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
              This account doesn&apos;t have access to Tiger Fitness Admin. Ask the owner to add you as an admin.
            </p>
            <form action={logoutAction}>
              <button className="min-h-11 w-full rounded-xl border border-line font-semibold hover:bg-stone-50">Sign out</button>
            </form>
          </div>
        ) : (
          <LoginForm />
        )}
      </Card>
    </main>
  );
}
