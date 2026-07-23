'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import Link from 'next/link';

interface Stats {
  totalProfiles: number;
  categoryCount: {
    ultra_boss: number;
    boss: number;
    cgp: number;
    out_of_scope: number;
  };
  averageScore: number;
  ceoCount: number;
  founderCount: number;
  presidentCount: number;
  directorCount: number;
  companySizeDistribution: Record<string, number>;
  topCompanies: Array<{ name: string; count: number }>;
  topJobTitles: Array<{ title: string; count: number }>;
}

const categoryColors = {
  ultra_boss: '#9B2C2C',
  boss: '#B7791F',
  cgp: '#1A3D2A',
  out_of_scope: '#6F6A5C',
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/scraper/api/stats')
      .then(res => res.json())
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching stats:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="text-center py-12 text-muted tracking-caps uppercase text-xs">Chargement…</div>;
  }

  if (!stats) {
    return (
      <div className="border border-line bg-paper px-6 py-12 text-center">
        <p className="font-serif text-2xl text-ink">Aucune donnée disponible</p>
        <p className="text-sm text-muted mt-2">Lancez un scrape depuis l’onglet Scraper pour alimenter l’analyse.</p>
      </div>
    );
  }

  const categoryData = [
    { name: 'Ultra Boss', value: stats.categoryCount.ultra_boss },
    { name: 'Boss', value: stats.categoryCount.boss },
    { name: 'CGP', value: stats.categoryCount.cgp },
    { name: 'Hors cadre', value: stats.categoryCount.out_of_scope },
  ];

  const sizeData = Object.entries(stats.companySizeDistribution).map(([size, count]) => ({
    name: size,
    value: count,
  }));

  return (
    <div className="space-y-10">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line">
        <MetricCard label="Total Profils" value={stats.totalProfiles} />
        <MetricCard label="Ultra Boss" value={stats.categoryCount.ultra_boss} accent="#9B2C2C" />
        <MetricCard label="Boss" value={stats.categoryCount.boss} accent="#B7791F" />
        <MetricCard label="CGP" value={stats.categoryCount.cgp} accent="#1A3D2A" />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px bg-line border border-line">
        <MetricCard label="CEO" value={stats.ceoCount} size="sm" />
        <MetricCard label="Founders" value={stats.founderCount} size="sm" />
        <MetricCard label="Présidents" value={stats.presidentCount} size="sm" />
        <MetricCard label="Directeurs" value={stats.directorCount} size="sm" />
        <MetricCard label="Score Moyen" value={stats.averageScore.toFixed(1)} size="sm" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Category Distribution */}
        <div className="bg-paper border border-line p-6">
          <h3 className="font-serif text-2xl text-ink mb-6">Répartition par catégorie</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                <Cell fill={categoryColors.ultra_boss} />
                <Cell fill={categoryColors.boss} />
                <Cell fill={categoryColors.cgp} />
                <Cell fill={categoryColors.out_of_scope} />
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#FBFAF5',
                  border: '1px solid #DCD6C8',
                  borderRadius: 0,
                  color: '#17150F',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Company Size Distribution */}
        <div className="bg-paper border border-line p-6">
          <h3 className="font-serif text-2xl text-ink mb-6">Répartition par taille d’entreprise</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sizeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DCD6C8" />
              <XAxis dataKey="name" stroke="#6F6A5C" tick={{ fontSize: 12, fill: '#6F6A5C' }} />
              <YAxis stroke="#6F6A5C" tick={{ fontSize: 12, fill: '#6F6A5C' }} />
              <Tooltip
                cursor={{ fill: 'rgba(12,42,27,0.06)' }}
                contentStyle={{
                  background: '#FBFAF5',
                  border: '1px solid #DCD6C8',
                  borderRadius: 0,
                  color: '#17150F',
                }}
              />
              <Bar dataKey="value" fill="#0C2A1B" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Companies and Titles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Companies */}
        <div className="bg-paper border border-line p-6">
          <h3 className="font-serif text-2xl text-ink mb-6">Top entreprises</h3>
          <div>
            {stats.topCompanies.map((company, idx) => (
              <div key={idx} className="flex justify-between items-center py-3 border-b border-line last:border-0">
                <span className="text-sm text-ink">{company.name}</span>
                <span className="text-xs text-muted tracking-caps uppercase">
                  {company.count} profils
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Job Titles */}
        <div className="bg-paper border border-line p-6">
          <h3 className="font-serif text-2xl text-ink mb-6">Top fonctions</h3>
          <div>
            {stats.topJobTitles.map((title, idx) => (
              <div key={idx} className="flex justify-between items-center py-3 border-b border-line last:border-0">
                <span className="text-sm text-ink">{title.title}</span>
                <span className="text-xs text-muted tracking-caps uppercase">
                  {title.count} personnes
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-forest text-cream p-10 text-center">
        <h3 className="font-serif text-3xl mb-3">Explorer tous les profils</h3>
        <p className="mb-6 text-cream/70 text-sm">Consultez la liste complète avec filtres et recherche avancée</p>
        <Link
          href="/profiles"
          className="inline-block border border-cream/40 text-cream text-xs tracking-caps uppercase px-6 py-3 hover:bg-cream hover:text-forest transition"
        >
          Voir les profils →
        </Link>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
  size = 'lg',
}: {
  label: string;
  value: string | number;
  accent?: string;
  size?: 'sm' | 'lg';
}) {
  return (
    <div className="bg-paper p-6">
      <div className="flex items-center gap-2">
        {accent && <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />}
        <p className="text-xs text-muted tracking-caps uppercase">{label}</p>
      </div>
      <p className={`font-serif text-ink mt-3 ${size === 'lg' ? 'text-5xl' : 'text-4xl'}`}>{value}</p>
    </div>
  );
}
