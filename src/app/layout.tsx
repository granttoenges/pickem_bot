import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pickem Bot",
  description: "Private football pickem league app"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var preference = localStorage.getItem("pickem.theme") || "system";
                  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                  document.documentElement.classList.toggle("dark", preference === "dark" || (preference === "system" && prefersDark));
                } catch (_) {}
              })();
            `
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
