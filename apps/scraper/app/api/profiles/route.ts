import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Module CJS partagé qui lit + score les profils réellement scrapés
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getScoredProfiles } = require('../../../lib/scraped-profiles.js');

export const dynamic = 'force-dynamic';

// Catégories forcées à la main (prioritaires sur le calcul auto)
function readCategoryOverrides(): Record<string, string> {
  try {
    const file = path.join(process.cwd(), 'data', 'category-overrides.json');
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch {
    return {};
  }
}

interface Profile {
  [key: string]: any;
  score: number;
  category: string;
  company: string;
  companySize: string;
  jobTitle: string;
  industry: string;
  location: string;
  firstName: string;
  lastName: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Profils réellement scrapés (data/scrape-results), transformés + scorés
    let profiles: Profile[] = getScoredProfiles();

    // Applique les catégories forcées à la main (avant filtrage/tri)
    const overrides = readCategoryOverrides();
    profiles = profiles.map((p) =>
      overrides[p.profileUrl] ? { ...p, category: overrides[p.profileUrl] } : p
    );

    // Apply filters
    const minScore = searchParams.get('minScore');
    const category = searchParams.get('category');
    const company = searchParams.get('company');
    const companySize = searchParams.get('companySize');
    const jobTitle = searchParams.get('jobTitle');
    const industry = searchParams.get('industry');
    const location = searchParams.get('location');
    const search = searchParams.get('search');
    const addedFrom = searchParams.get('addedFrom'); // YYYY-MM-DD (inclus)
    const addedTo = searchParams.get('addedTo');     // YYYY-MM-DD (inclus)

    if (minScore) {
      profiles = profiles.filter((p: Profile) => p.score >= parseInt(minScore));
    }

    if (category && category !== 'all') {
      profiles = profiles.filter((p: Profile) => p.category === category);
    }

    if (company) {
      profiles = profiles.filter((p: Profile) => p.company.toLowerCase().includes(company.toLowerCase()));
    }

    if (companySize && companySize !== 'all') {
      profiles = profiles.filter((p: Profile) => p.companySize === companySize);
    }

    if (jobTitle) {
      profiles = profiles.filter((p: Profile) => p.jobTitle.toLowerCase().includes(jobTitle.toLowerCase()));
    }

    if (industry) {
      profiles = profiles.filter((p: Profile) => p.industry.toLowerCase().includes(industry.toLowerCase()));
    }

    if (location) {
      profiles = profiles.filter((p: Profile) => p.location.toLowerCase().includes(location.toLowerCase()));
    }

    // Filtre par date d'ajout (bornes incluses). La comparaison se fait sur le
    // JOUR LOCAL du profil (même convention que la colonne « Ajouté le » qui
    // affiche la date locale) — un profil sans date est exclu si un filtre est actif.
    if (addedFrom || addedTo) {
      const localDay = (iso: string) => {
        const d = new Date(iso);
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA'); // YYYY-MM-DD
      };
      profiles = profiles.filter((p: Profile) => {
        const day = localDay(p.dateAdded);
        if (!day) return false;
        if (addedFrom && day < addedFrom) return false;
        if (addedTo && day > addedTo) return false;
        return true;
      });
    }

    if (search) {
      const searchLower = search.toLowerCase();
      profiles = profiles.filter((p: Profile) =>
        p.firstName.toLowerCase().includes(searchLower) ||
        p.lastName.toLowerCase().includes(searchLower) ||
        p.company.toLowerCase().includes(searchLower) ||
        p.jobTitle.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    const sortBy = searchParams.get('sortBy') || 'score';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const dir = sortOrder === 'asc' ? 1 : -1;
    profiles.sort((a: Profile, b: Profile) => {
      let valueA = a[sortBy];
      let valueB = b[sortBy];

      // Champs absents : on les envoie en fin de liste sans casser le tri
      if (valueA == null && valueB == null) return 0;
      if (valueA == null) return 1;
      if (valueB == null) return -1;

      if (typeof valueA === 'string' || typeof valueB === 'string') {
        valueA = String(valueA).toLowerCase();
        valueB = String(valueB).toLowerCase();
      }

      if (valueA < valueB) return -1 * dir;
      if (valueA > valueB) return 1 * dir;
      return 0;
    });

    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const start = (page - 1) * limit;
    const paginatedProfiles = profiles.slice(start, start + limit);

    return NextResponse.json({
      profiles: paginatedProfiles,
      total: profiles.length,
      page,
      limit,
      pages: Math.ceil(profiles.length / limit),
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
