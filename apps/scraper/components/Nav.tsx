'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Dashboard' },
  { href: '/profiles', label: 'Profils' },
  { href: '/scraper-dashboard', label: 'Scraper' },
] as const;

// Liens vers les autres outils de la suite (hors basePath /scraper → balises <a>)
const SUITE = [
  { href: '/', label: 'Emailing' },
  { href: '/posts', label: 'Posts' },
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <div className="bg-cream border-b border-line sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 flex gap-10">
        {TABS.map((tab) => {
          const active =
            tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`py-4 text-xs uppercase tracking-caps border-b transition -mb-px font-medium ${
                active
                  ? 'border-forest text-forest'
                  : 'border-transparent text-forest/60 hover:text-forest'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
        <div className="ml-auto flex items-center gap-3">
          {SUITE.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="group flex items-center gap-2 border border-forest/30 bg-paper px-5 py-2.5 text-sm uppercase tracking-caps font-medium text-forest transition-all duration-300 hover:bg-forest hover:text-cream hover:border-forest hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_rgba(12,42,27,0.2)]"
            >
              <span>{item.label}</span>
              <span className="transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1">↗</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
