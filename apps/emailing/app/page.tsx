'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { EVENT_LABELS, STATUS_LABELS } from '../lib/labels';

interface Stats {
  totalContacts: number;
  byStatus: Record<string, number>;
  totalSent: number;
  sentToday: number;
  contactsContacted: number;
  uniqueOpens: number;
  uniqueClicks: number;
  replies: number;
  rdv: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  byStep: Array<{ step: number; sent: number; opens: number; clicks: number }>;
  byPersona: Array<{ persona: string; total: number; replied: number; rdv: number }>;
  recentEvents: Array<{
    id: number; type: string; step: number; meta: string; created_at: string;
    email: string; first_name: string; last_name: string;
  }>;
}

const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats')
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center py-12 text-muted tracking-caps uppercase text-xs">Chargement…</div>;
  }

  if (!stats || stats.totalContacts === 0) {
    return (
      <div className="border border-line bg-paper px-6 py-12 text-center">
        <p className="font-serif text-2xl text-ink">Aucun contact pour l’instant</p>
        <p className="text-sm text-muted mt-2">
          Importez votre CSV depuis l’onglet Contacts pour démarrer.
        </p>
      </div>
    );
  }

  const stepData = stats.byStep.map((s) => ({
    name: `Email ${s.step}`,
    Envoyés: s.sent,
    Ouverts: s.opens,
    Clics: s.clicks,
  }));

  const personaData = stats.byPersona.map((p) => ({
    name: p.persona || 'Autre',
    Contacts: p.total,
    Réponses: p.replied,
    RDV: p.rdv,
  }));

  return (
    <div className="space-y-10 fade-in">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line">
        <MetricCard label="Contacts" value={stats.totalContacts} />
        <MetricCard label="Emails envoyés" value={stats.totalSent} />
        <MetricCard label="Réponses" value={stats.replies} accent="#B7791F" />
        <MetricCard label="RDV pris" value={stats.rdv} accent="#1A3D2A" />
      </div>

      {/* Rates */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px bg-line border border-line">
        <MetricCard label="Taux d'ouverture" value={pct(stats.openRate)} size="sm" />
        <MetricCard label="Taux de clic" value={pct(stats.clickRate)} size="sm" />
        <MetricCard label="Taux de réponse" value={pct(stats.replyRate)} size="sm" />
        <MetricCard label="Envoyés aujourd'hui" value={stats.sentToday} size="sm" />
        <MetricCard label="En séquence" value={stats.byStatus.active || 0} size="sm" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-paper border border-line p-6">
          <h3 className="font-serif text-2xl text-ink mb-6">Performance par email</h3>
          {stepData.length === 0 ? (
            <p className="text-sm text-muted">Aucun envoi pour l’instant.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stepData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DCD6C8" />
                <XAxis dataKey="name" stroke="#6F6A5C" fontSize={12} />
                <YAxis stroke="#6F6A5C" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#FBFAF5', border: '1px solid #DCD6C8' }} />
                <Legend />
                <Bar dataKey="Envoyés" fill="#0C2A1B" />
                <Bar dataKey="Ouverts" fill="#B7791F" />
                <Bar dataKey="Clics" fill="#9B2C2C" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-paper border border-line p-6">
          <h3 className="font-serif text-2xl text-ink mb-6">Résultats par persona</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={personaData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#DCD6C8" />
              <XAxis type="number" stroke="#6F6A5C" fontSize={12} allowDecimals={false} />
              <YAxis type="category" dataKey="name" stroke="#6F6A5C" fontSize={12} width={150} />
              <Tooltip contentStyle={{ background: '#FBFAF5', border: '1px solid #DCD6C8' }} />
              <Legend />
              <Bar dataKey="Contacts" fill="#6F6A5C" />
              <Bar dataKey="Réponses" fill="#B7791F" />
              <Bar dataKey="RDV" fill="#1A3D2A" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Statuts */}
      <div className="bg-paper border border-line p-6">
        <h3 className="font-serif text-2xl text-ink mb-6">Répartition des statuts</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(stats.byStatus).map(([status, n]) => (
            <span
              key={status}
              className="border border-line bg-cream px-4 py-2 text-xs uppercase tracking-caps text-forest"
            >
              {STATUS_LABELS[status] || status} — <strong>{n}</strong>
            </span>
          ))}
        </div>
      </div>

      {/* Activité récente */}
      <div className="bg-paper border border-line p-6">
        <h3 className="font-serif text-2xl text-ink mb-6">Activité récente</h3>
        {stats.recentEvents.length === 0 ? (
          <p className="text-sm text-muted">Aucun événement pour l’instant.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-caps text-muted border-b border-line">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Contact</th>
                <th className="py-2 pr-4">Événement</th>
                <th className="py-2">Email</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentEvents.map((e) => (
                <tr key={e.id} className="border-b border-line/60">
                  <td className="py-2 pr-4 text-muted whitespace-nowrap">
                    {new Date(e.created_at + 'Z').toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="py-2 pr-4">
                    {e.first_name || e.last_name ? `${e.first_name} ${e.last_name}` : e.email}
                  </td>
                  <td className="py-2 pr-4">{EVENT_LABELS[e.type] || e.type}</td>
                  <td className="py-2 text-muted">{e.step ? `Email ${e.step}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
  size,
}: {
  label: string;
  value: number | string;
  accent?: string;
  size?: 'sm';
}) {
  return (
    <div className="bg-paper px-6 py-5">
      <p className="text-xs uppercase tracking-caps text-muted">{label}</p>
      <p
        className={`font-serif mt-2 ${size === 'sm' ? 'text-3xl' : 'text-5xl'}`}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
    </div>
  );
}
