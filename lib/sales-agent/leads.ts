export interface LeadFilters {
  country?: string;
  city?: string;
  companySize?: string;
  websiteExists?: boolean;
  emailFound?: boolean;
  phoneFound?: boolean;
  minScore?: number;
  maxScore?: number;
  minRating?: number;
  minReviews?: number;
  industry?: string;
  lastContactedBefore?: string;
  lastContactedAfter?: string;
  emailSent?: boolean;
  replyStatus?: string;
  replied?: boolean;
  ungrouped?: boolean;
  campaignId?: number;
  discoveryGroupId?: number;
  status?: string;
  search?: string;
  dateAddedFrom?: string;
  dateAddedTo?: string;
  source?: string;
}

export function buildLeadWhere(filters: LeadFilters): Record<string, any> {
  const where: Record<string, any> = {};

  if (filters.country) where.country = { contains: filters.country, mode: 'insensitive' };
  if (filters.city) where.city = { contains: filters.city, mode: 'insensitive' };
  if (filters.companySize) where.companySize = filters.companySize;
  if (filters.websiteExists === true) where.hasWebsite = true;
  if (filters.websiteExists === false) where.hasWebsite = false;
  if (filters.emailFound === true) where.hasEmail = true;
  if (filters.emailFound === false) where.hasEmail = false;
  if (filters.phoneFound === true) where.hasPhone = true;
  if (filters.phoneFound === false) where.hasPhone = false;
  if (filters.minScore != null || filters.maxScore != null) {
    where.leadScore = {};
    if (filters.minScore != null) where.leadScore.gte = filters.minScore;
    if (filters.maxScore != null) where.leadScore.lte = filters.maxScore;
  }
  if (filters.minRating != null) where.googleRating = { gte: filters.minRating };
  if (filters.minReviews != null) where.reviewCount = { gte: filters.minReviews };
  if (filters.industry) where.industry = { contains: filters.industry, mode: 'insensitive' };
  if (filters.replyStatus) where.replyStatus = filters.replyStatus;
  if (filters.campaignId) where.campaignId = filters.campaignId;
  if (filters.discoveryGroupId) {
    where.groupMembers = { some: { groupId: filters.discoveryGroupId } };
  }
  if (filters.ungrouped === true) {
    where.groupMembers = { none: {} };
  }
  if (filters.status) where.status = filters.status;
  if (filters.source) where.source = filters.source;
  if (filters.emailSent === true) where.emailSentCount = { gt: 0 };
  if (filters.emailSent === false) where.emailSentCount = 0;

  if (filters.lastContactedBefore || filters.lastContactedAfter) {
    where.lastContactedAt = {};
    if (filters.lastContactedAfter) where.lastContactedAt.gte = new Date(filters.lastContactedAfter);
    if (filters.lastContactedBefore) where.lastContactedAt.lte = new Date(filters.lastContactedBefore);
  }

  if (filters.dateAddedFrom || filters.dateAddedTo) {
    where.createdAt = {};
    if (filters.dateAddedFrom) where.createdAt.gte = new Date(filters.dateAddedFrom);
    if (filters.dateAddedTo) where.createdAt.lte = new Date(filters.dateAddedTo);
  }

  const and: any[] = [];
  if (filters.search) {
    and.push({
      OR: [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { website: { contains: filters.search, mode: 'insensitive' } },
        { city: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
      ],
    });
  }
  if (filters.replied === true) {
    and.push({
      OR: [
        { status: { in: ['REPLIED', 'CONVERTED'] } },
        { replyStatus: { not: null } },
        { replies: { some: {} } },
      ],
    });
  }
  if (and.length) where.AND = and;

  return where;
}

export function parseLeadFiltersFromSearchParams(sp: URLSearchParams): LeadFilters {
  const bool = (k: string) => {
    const v = sp.get(k);
    if (v === 'true') return true;
    if (v === 'false') return false;
    return undefined;
  };
  const num = (k: string) => {
    const v = sp.get(k);
    return v != null && v !== '' ? Number(v) : undefined;
  };

  return {
    country: sp.get('country') || undefined,
    city: sp.get('city') || undefined,
    companySize: sp.get('companySize') || undefined,
    websiteExists: bool('websiteExists'),
    emailFound: bool('emailFound'),
    phoneFound: bool('phoneFound'),
    minScore: num('minScore'),
    maxScore: num('maxScore'),
    minRating: num('minRating'),
    minReviews: num('minReviews'),
    industry: sp.get('industry') || undefined,
    lastContactedBefore: sp.get('lastContactedBefore') || undefined,
    lastContactedAfter: sp.get('lastContactedAfter') || undefined,
    emailSent: bool('emailSent'),
    replyStatus: sp.get('replyStatus') || undefined,
    replied: bool('replied'),
    ungrouped: bool('ungrouped'),
    campaignId: num('campaignId'),
    discoveryGroupId: num('discoveryGroupId'),
    status: sp.get('status') || undefined,
    search: sp.get('search') || undefined,
    dateAddedFrom: sp.get('dateAddedFrom') || undefined,
    dateAddedTo: sp.get('dateAddedTo') || undefined,
    source: sp.get('source') || undefined,
  };
}
