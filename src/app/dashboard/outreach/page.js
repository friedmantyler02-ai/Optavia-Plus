"use client";

import { useState } from "react";
import { useCoach } from "../layout";
import PageHeader from "../components/PageHeader";
import EmailAutomationTab from "./EmailAutomationTab";
import TouchpointSequencesTab from "./TouchpointSequencesTab";

const TABS = [
  { key: "email", label: "Email Automation" },
  { key: "touchpoints", label: "Touchpoint Sequences" },
];

export default function OutreachPage() {
  useCoach();
  const [activeTab, setActiveTab] = useState("email");

  return (
    <div className="animate-fade-up">
      <PageHeader title="Outreach" />

      {/* Tab bar */}
      <div className="border-b-2 border-gray-100 mb-6">
        <div className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`font-body relative pb-3 text-sm font-semibold transition-colors duration-150 ${
                activeTab === tab.key
                  ? "text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#E8735A]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "email" && <EmailAutomationTab />}

      {activeTab === "touchpoints" && <TouchpointSequencesTab />}
    </div>
  );
}
