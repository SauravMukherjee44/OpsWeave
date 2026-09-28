import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "OpsWeave — Workflow Intelligence",
  description: "Compile fragmented enterprise knowledge into governed, executable workflows.",
  openGraph: {
    title: "OpsWeave — Workflow Intelligence",
    description: "From fragmented knowledge to governed workflows.",
    images: [{ url: "/og.png", width: 2048, height: 1024, alt: "OpsWeave workflow intelligence" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "OpsWeave — Workflow Intelligence",
    description: "From fragmented knowledge to governed workflows.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><Providers>{children}</Providers></body>
    </html>
  );
}
