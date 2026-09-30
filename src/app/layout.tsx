import type { Metadata, Viewport } from "next";
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Minister appointments, SvS preparation",
  description: "Book your Vice President and Minister of Education time slot for the SvS preparation week.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="page">{children}</main>
        <footer className="footer">
          <p>Created by #1460 [PMA]Fullm3tal</p>
        </footer>
      </body>
    </html>
  );
}
