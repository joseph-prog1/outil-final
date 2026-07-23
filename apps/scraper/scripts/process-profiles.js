const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const ScoringEngine = require('../lib/scoring-engine');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

async function readExcelProfiles(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet('Profils');

  const profiles = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header

    profiles.push({
      firstName: row.getCell('A').value || '',
      lastName: row.getCell('B').value || '',
      jobTitle: row.getCell('C').value || '',
      company: row.getCell('D').value || '',
      companySize: row.getCell('E').value || '1-50',
      industry: row.getCell('F').value || '',
      location: row.getCell('G').value || '',
      profileUrl: row.getCell('H').value || '',
      photoUrl: row.getCell('I').value || '',
      commentCount: parseInt(row.getCell('J').value) || 0,
      lastCommentDate: row.getCell('K').value || new Date().toISOString(),
    });
  });

  return profiles;
}

async function processProfiles() {
  const excelPath = path.join(__dirname, '../profils_linkedin.xlsx');

  if (!fs.existsSync(excelPath)) {
    console.error('❌ Fichier Excel non trouvé. Lancez: node generate-sample-data.js');
    process.exit(1);
  }

  console.log('📖 Lecture du fichier Excel...');
  const profiles = await readExcelProfiles(excelPath);
  console.log(`✅ ${profiles.length} profils lus`);

  console.log('🎯 Application du scoring...');
  const scoringEngine = new ScoringEngine();
  const scoredProfiles = scoringEngine.scoreProfiles(profiles);

  console.log('📊 Sauvegarde des données...');
  const outputPath = path.join(dataDir, 'profiles.json');
  fs.writeFileSync(outputPath, JSON.stringify(scoredProfiles, null, 2));
  console.log(`✅ Données sauvegardées: ${outputPath}`);

  // Generate statistics
  const stats = generateStatistics(scoredProfiles);
  const statsPath = path.join(dataDir, 'stats.json');
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  console.log(`✅ Statistiques: ${statsPath}`);

  // Console summary
  console.log('\n📈 RÉSUMÉ:');
  console.log(`   Total: ${stats.totalProfiles}`);
  console.log(`   Ultra Boss: ${stats.categoryCount.ultra_boss}`);
  console.log(`   Boss: ${stats.categoryCount.boss}`);
  console.log(`   CGP: ${stats.categoryCount.cgp}`);
  console.log(`   Hors cadre: ${stats.categoryCount.out_of_scope}`);
  console.log(`   Score moyen: ${stats.averageScore.toFixed(1)}/100`);
}

function generateStatistics(profiles) {
  const categoryCount = {
    ultra_boss: 0,
    boss: 0,
    cgp: 0,
    out_of_scope: 0,
  };

  let totalScore = 0;
  let ceoCount = 0;
  let founderCount = 0;
  let presidentCount = 0;
  let directorCount = 0;

  const companyMap = {};
  const jobTitleMap = {};
  const companySizeCount = {
    '1-50': 0,
    '50-100': 0,
    '100-500': 0,
    '500-1000': 0,
    '1000-5000': 0,
    '5000+': 0,
  };

  profiles.forEach(profile => {
    categoryCount[profile.category]++;
    totalScore += profile.score;

    // Count specific titles
    const normalizedTitle = profile.jobTitle.toLowerCase();
    if (normalizedTitle.includes('ceo')) ceoCount++;
    if (normalizedTitle.includes('founder')) founderCount++;
    if (normalizedTitle.includes('president')) presidentCount++;
    if (normalizedTitle.includes('directeur')) directorCount++;

    // Count by company
    if (profile.company) {
      companyMap[profile.company] = (companyMap[profile.company] || 0) + 1;
    }

    // Count by job title
    if (profile.jobTitle) {
      jobTitleMap[profile.jobTitle] = (jobTitleMap[profile.jobTitle] || 0) + 1;
    }

    // Count by size
    companySizeCount[profile.companySize]++;
  });

  const topCompanies = Object.entries(companyMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const topJobTitles = Object.entries(jobTitleMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([title, count]) => ({ title, count }));

  return {
    totalProfiles: profiles.length,
    categoryCount,
    averageScore: totalScore / profiles.length,
    ceoCount,
    founderCount,
    presidentCount,
    directorCount,
    companySizeDistribution: companySizeCount,
    topCompanies,
    topJobTitles,
    lastUpdated: new Date().toISOString(),
  };
}

processProfiles().catch(err => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});
