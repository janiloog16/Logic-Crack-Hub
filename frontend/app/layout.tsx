import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Logic Crack Hub",
  description: "The Ultimate Community Hub for Unity Developers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

