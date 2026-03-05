export const RANKS = [
  {
    name: 'Coach',
    slug: 'coach',
    minGQV: 0,
    maxGQV: 1199,
    minOrderingEntities: 0,
    color: '#6B7280',
    emoji: '🌱',
  },
  {
    name: 'Senior Coach',
    slug: 'senior_coach',
    minGQV: 1200,
    minOrderingEntities: 5,
    color: '#2563EB',
    emoji: '⭐',
  },
  {
    name: 'Manager',
    slug: 'manager',
    minGQV: 1200,
    minOrderingEntities: 5,
    minQualifyingPoints: 2,
    color: '#7C3AED',
    emoji: '🌟',
  },
  {
    name: 'Associate Director',
    slug: 'associate_director',
    minGQV: 1200,
    minOrderingEntities: 5,
    minQualifyingPoints: 3,
    color: '#D97706',
    emoji: '💫',
  },
  {
    name: 'Director',
    slug: 'director',
    minGQV: 1200,
    minOrderingEntities: 5,
    minQualifyingPoints: 4,
    color: '#E8735A',
    emoji: '🔥',
  },
  {
    name: 'Executive Director',
    slug: 'executive_director',
    minGQV: 1200,
    minOrderingEntities: 5,
    minQualifyingPoints: 5,
    color: '#16A34A',
    emoji: '👑',
  },
  {
    name: 'FIBC',
    slug: 'fibc',
    minGQV: 15000,
    minFQV: 6000,
    minOrderingEntities: 5,
    minQualifyingPoints: 5,
    color: '#0F172A',
    emoji: '🏆',
  },
]

// Given a coach's current stats, return their current rank and next rank
export function calculateRank({ gqv = 0, orderingEntities = 0, qualifyingPoints = 0, fqv = 0 }) {
  let current = RANKS[0]
  for (const rank of RANKS) {
    const meetsGQV = gqv >= rank.minGQV
    const meetsEntities = orderingEntities >= (rank.minOrderingEntities || 0)
    const meetsQP = qualifyingPoints >= (rank.minQualifyingPoints || 0)
    const meetsFQV = fqv >= (rank.minFQV || 0)
    if (meetsGQV && meetsEntities && meetsQP && meetsFQV) {
      current = rank
    }
  }
  const currentIndex = RANKS.findIndex(r => r.slug === current.slug)
  const next = RANKS[currentIndex + 1] || null
  return { current, next, currentIndex }
}

// How close (0-100%) is the coach to the next rank, based on GQV gap
export function progressToNextRank({ gqv = 0, qualifyingPoints = 0, orderingEntities = 0, fqv = 0 }) {
  const { current, next } = calculateRank({ gqv, qualifyingPoints, orderingEntities, fqv })
  if (!next) return { percent: 100, gqvNeeded: 0, qpNeeded: 0, entitiesNeeded: 0, next: null, current }

  const gqvNeeded = Math.max(0, (next.minGQV || 0) - gqv)
  const qpNeeded = Math.max(0, (next.minQualifyingPoints || 0) - qualifyingPoints)
  const entitiesNeeded = Math.max(0, (next.minOrderingEntities || 0) - orderingEntities)

  // Progress % based on GQV as the primary metric
  const fromGQV = current.minGQV || 0
  const toGQV = next.minGQV || fromGQV
  const percent = toGQV === fromGQV
    ? (gqvNeeded === 0 ? 100 : 50)
    : Math.min(100, Math.round(((gqv - fromGQV) / (toGQV - fromGQV)) * 100))

  return { percent, gqvNeeded, qpNeeded, entitiesNeeded, next, current }
}
