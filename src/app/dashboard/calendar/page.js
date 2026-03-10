"use client";

import { useCoach } from "../layout";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";

export default function CalendarPage() {
  const { coach } = useCoach();

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Your upcoming follow-ups and check-ins"
      />
      <EmptyState
        icon="📅"
        title="Calendar coming soon"
        subtitle="We're building a calendar to help you track follow-ups, check-ins, and scheduled calls."
      />
    </>
  );
}
