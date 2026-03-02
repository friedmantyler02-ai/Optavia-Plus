"use client";

import { useCoach } from "../layout";

export default function MarketingPage() {
  const { coach } = useCoach();

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-2xl md:text-3xl font-bold mb-6">Marketing Hub</h1>
      <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
        <div className="text-5xl mb-4">📣</div>
        <h2 className="text-xl font-bold mb-2">Coming in Phase 6</h2>
        <p className="text-gray-400 max-w-md mx-auto">
          Facebook/LinkedIn group suggestions, copy-paste post templates, DM prospecting scripts, and a content calendar with weekly posting ideas.
        </p>
      </div>
    </div>
  );
}
