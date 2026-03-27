// Shared segment config used by both the outreach page and campaign setup page

export const SEGMENTS = [
  {
    key: "warm",
    label: "Warm",
    range: "2–6 months",
    emoji: "🔥",
    description: "They remember you — just need a nudge",
    accent: "border-orange-300 bg-orange-50",
    badge: "bg-orange-500 text-white",
  },
  {
    key: "moderate",
    label: "Moderate",
    range: "6–12 months",
    emoji: "⏰",
    description: "A friendly reconnection works well here",
    accent: "border-amber-300 bg-amber-50",
    badge: "bg-amber-500 text-white",
  },
  {
    key: "cold",
    label: "Cold",
    range: "12–24 months",
    emoji: "❄️",
    description: "Reintroduce yourself gently",
    accent: "border-blue-300 bg-blue-50",
    badge: "bg-blue-500 text-white",
  },
  {
    key: "dormant",
    label: "Dormant",
    range: "24+ months",
    emoji: "💤",
    description: "May not know who you are — introduce yourself",
    accent: "border-purple-300 bg-purple-50",
    badge: "bg-purple-500 text-white",
  },
];
