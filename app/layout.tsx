import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // A template rather than a fixed string, so the tab says which screen you
  // are on when six of them are open across the centre.
  title: { default: "FETS · Exam delivery", template: "%s · FETS" },
  description: "Exam delivery console for Forun Testing & Educational Services, Calicut.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The font variables live on <html> so the :root theme tokens can read them.
    <html lang="en" className={`${instrumentSans.variable} ${instrumentSerif.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
