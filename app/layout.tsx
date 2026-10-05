import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, Barlow_Semi_Condensed } from "next/font/google";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Providers } from "@/components/providers";
import { getToken } from "@/lib/auth-server";
import "./globals.css";

// One family, three widths: Barlow for reading, Semi Condensed for field
// labels, Condensed for figures, codes and estados (the "pass" voice).
const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlowSemiCondensed = Barlow_Semi_Condensed({
  variable: "--font-barlow-semi",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { appName } = await fetchQuery(api.settings.publicInfo, {});
  return {
    title: { default: appName, template: `%s · ${appName}` },
    description: "Gestión de tareas del equipo",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const token = await getToken();
  return (
    <html
      lang="es"
      className={`${barlow.variable} ${barlowSemiCondensed.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers initialToken={token}>{children}</Providers>
      </body>
    </html>
  );
}
