import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '../components/Nav';

export const metadata: Metadata = {
  title: 'Charlie AI Analyzer',
  description: 'Qualification automatique des décideurs LinkedIn',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="bg-cream text-ink flex flex-col min-h-screen">
        {/* Header */}
        <header className="bg-forest text-cream">
          <div className="max-w-7xl mx-auto px-6 pt-6 pb-12">
            <div className="flex justify-between items-baseline border-b border-cream/15 pb-5">
              <span className="flex items-center gap-3">
                <img src="/scraper/charlie-logo.webp" alt="Logo Charlie" className="h-6 w-auto invert" />
                <span className="text-sm font-medium tracking-caps uppercase">Charlie</span>
              </span>
              <span className="text-xs text-cream/60 tracking-caps uppercase">
                Analyse des décideurs
              </span>
            </div>
            <h1 className="font-serif text-5xl md:text-6xl leading-[1.05] mt-10 max-w-4xl">
              Qualifiez les décideurs.
              <br />
              <span className="italic text-cream/80">Repérez les vrais boss.</span>
            </h1>
          </div>
        </header>

        {/* Navigation */}
        <Nav />

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-12 w-full flex-1">
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-forest text-cream/50 py-8 mt-16">
          <div className="max-w-7xl mx-auto px-6 flex justify-between items-center text-xs tracking-caps uppercase">
            <span>Charlie</span>
            <span>Paris — {new Date().getFullYear()}</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
