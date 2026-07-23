const ExcelJS = require('exceljs');
const path = require('path');

const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Profils');

// Headers
worksheet.columns = [
  { header: 'Prénom', key: 'firstName', width: 15 },
  { header: 'Nom', key: 'lastName', width: 15 },
  { header: 'Poste', key: 'jobTitle', width: 30 },
  { header: 'Entreprise', key: 'company', width: 25 },
  { header: 'Taille Entreprise', key: 'companySize', width: 15 },
  { header: 'Secteur', key: 'industry', width: 20 },
  { header: 'Localisation', key: 'location', width: 20 },
  { header: 'URL LinkedIn', key: 'profileUrl', width: 40 },
  { header: 'Photo URL', key: 'photoUrl', width: 40 },
  { header: 'Nombre Commentaires', key: 'commentCount', width: 18 },
  { header: 'Dernière Interaction', key: 'lastCommentDate', width: 18 },
];

// Sample data
const firstNames = ['Jean', 'Marie', 'Pierre', 'Sophie', 'Luc', 'Claire', 'Marc', 'Anne', 'Paul', 'Isabelle', 'Thomas', 'Nathalie', 'David', 'Catherine', 'Laurent', 'Véronique', 'Philippe', 'Sylvie', 'Bernard', 'Francoise'];
const lastNames = ['Dupont', 'Martin', 'Bernard', 'Thomas', 'Robert', 'Petit', 'Durand', 'Lefevre', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'Bonnet', 'Fontaine', 'Chevalier', 'Legrand', 'Garnier', 'Faure'];
const companies = ['Google', 'Microsoft', 'Apple', 'Amazon', 'Meta', 'Tesla', 'LVMH', 'Total Energies', 'Airbus', 'EDF', 'BNP Paribas', 'Sanofi', 'L\'Oréal', 'Michelin', 'PSA', 'Accenture', 'Deloitte', 'McKinsey', 'Capgemini', 'Orange'];
const jobTitles = ['CEO', 'Founder', 'Co-Founder', 'President', 'Directeur Général', 'DG', 'VP', 'Head of', 'Director', 'Manager', 'Senior Manager', 'Consultant', 'Associate', 'Partner', 'Managing Partner', 'Chairman', 'Owner', 'Responsable', 'Coordonnateur', 'Analyste'];
const industries = ['Technologie', 'Finance', 'Santé', 'Énergie', 'Luxe', 'Conseil', 'Manufactre', 'Télécoms', 'Retail', 'Transport'];
const locations = ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg', 'Bordeaux', 'Lille', 'Rennes', 'New York', 'London', 'Singapore', 'Dubai', 'Hong Kong'];

const companySizes = ['1-50', '50-100', '100-500', '500-1000', '1000-5000', '5000+'];

function generateSampleData() {
  const profiles = [];

  for (let i = 0; i < 50; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const jobTitle = jobTitles[Math.floor(Math.random() * jobTitles.length)];
    const company = companies[Math.floor(Math.random() * companies.length)];
    const industry = industries[Math.floor(Math.random() * industries.length)];
    const location = locations[Math.floor(Math.random() * locations.length)];
    const companySize = companySizes[Math.floor(Math.random() * companySizes.length)];
    const commentCount = Math.floor(Math.random() * 20) + 1;

    // Random date in last 90 days
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * 90));

    profiles.push({
      firstName,
      lastName,
      jobTitle,
      company,
      companySize,
      industry,
      location,
      profileUrl: `https://www.linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}-${i}/`,
      photoUrl: `https://media.licdn.com/dms/image/fake-${i}.jpg`,
      commentCount,
      lastCommentDate: date.toISOString().split('T')[0],
    });
  }

  return profiles;
}

async function generateExcel() {
  const profiles = generateSampleData();

  profiles.forEach(profile => {
    worksheet.addRow(profile);
  });

  // Style header
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } };

  // Alternate row colors
  for (let i = 2; i <= profiles.length + 1; i++) {
    if (i % 2 === 0) {
      worksheet.getRow(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    }
  }

  const outputPath = path.join(__dirname, 'profils_linkedin.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  console.log(`✅ Fichier Excel créé: ${outputPath}`);
  console.log(`📊 ${profiles.length} profils générés`);
}

generateExcel().catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
