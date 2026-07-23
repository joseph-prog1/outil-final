const scoringConfig = require('./scoring-config.json');

class ScoringEngine {
  constructor(config = scoringConfig) {
    this.config = config;
  }

  normalizeText(text) {
    return text?.toLowerCase().trim() || '';
  }

  calculateKeywordScore(jobTitle) {
    const normalized = this.normalizeText(jobTitle);
    let score = 0;

    const { keywordBoosts } = this.config.scoring;

    // Check for keyword matches
    Object.entries(keywordBoosts).forEach(([keyword, boost]) => {
      if (normalized.includes(this.normalizeText(keyword))) {
        score += boost;
      }
    });

    return score;
  }

  calculateCompanySizeScore(companySize) {
    const boosts = this.config.scoring.companySizeBoosts;
    return boosts[companySize] || 0;
  }

  calculateCommentScore(commentCount) {
    const { commentCountBoost, maxCommentCountForBoost } = this.config.scoring;
    const capped = Math.min(commentCount, maxCommentCountForBoost);
    return (capped / maxCommentCountForBoost) * commentCountBoost * 10;
  }

  calculateTotalScore(profile) {
    const {
      jobTitle = '',
      company = '',
      companySize = '1-50',
      commentCount = 0,
    } = profile;

    let score = this.config.scoring.baseScore;
    score += this.calculateKeywordScore(jobTitle);
    score += this.calculateCompanySizeScore(companySize);
    score += this.calculateCommentScore(commentCount);

    // Clamp score between 0 and 100
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  getCategory(score, jobTitle, companySize) {
    const categories = this.config.categories;
    const normalized = this.normalizeText(jobTitle);

    // Ultra Boss : mot-clé dirigeant + entreprise d'au moins 10 employés.
    // '1-50' (ancien découpage, à cheval sur le seuil) et taille inconnue restent "boss".
    const ultraBossKeywords = categories.ultra_boss.keywords;
    const isUltraBossKeyword = ultraBossKeywords.some(kw => normalized.includes(this.normalizeText(kw)));
    if (isUltraBossKeyword && ['10-50', '50-100', '100-500', '500-1000', '1000-5000', '5000+'].includes(companySize)) {
      return 'ultra_boss';
    }

    // Boss : mot-clé dirigeant, quelle que soit la taille (moins de 10 employés inclus)
    const bossKeywords = categories.boss.keywords;
    const isBossKeyword = bossKeywords.some(kw => normalized.includes(this.normalizeText(kw)));
    if (isUltraBossKeyword || isBossKeyword) {
      return 'boss';
    }

    // Check for CGP conditions
    const cgpKeywords = categories.cgp.keywords;
    const isCgpKeyword = cgpKeywords.some(kw => normalized.includes(this.normalizeText(kw)));
    if (isCgpKeyword) {
      return 'cgp';
    }

    // Check for Out of Scope
    const outOfScopeKeywords = categories.out_of_scope.keywords;
    const isOutOfScope = outOfScopeKeywords.some(kw => normalized.includes(this.normalizeText(kw)));
    if (isOutOfScope) {
      return 'out_of_scope';
    }

    // Fallback to score-based categorization
    if (score >= 80) return 'ultra_boss';
    if (score >= 60) return 'boss';
    if (score >= 40) return 'cgp';
    return 'out_of_scope';
  }

  scoreProfile(profile) {
    const score = this.calculateTotalScore(profile);
    const category = this.getCategory(score, profile.jobTitle, profile.companySize);

    return {
      ...profile,
      score,
      category,
      scoredAt: new Date().toISOString(),
    };
  }

  scoreProfiles(profiles) {
    return profiles.map(profile => this.scoreProfile(profile));
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  getConfigSummary() {
    return {
      categories: Object.keys(this.config.categories),
      keywordCount: Object.keys(this.config.scoring.keywordBoosts).length,
      baseScore: this.config.scoring.baseScore,
    };
  }
}

module.exports = ScoringEngine;
