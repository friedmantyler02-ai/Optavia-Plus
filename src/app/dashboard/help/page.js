"use client";

import { useState } from "react";
import { useCoach } from "../layout";
import PageHeader from "../components/PageHeader";

const FAQ_SECTIONS = [
  {
    title: "Getting Started",
    icon: "\uD83C\uDF31",
    questions: [
      {
        q: "How do I upload my client list?",
        a: "Go to the Clients page and click \"Upload Orders\" at the top. You'll need to export your Frontline report from the Optavia back office \u2014 go to Client Report \u2192 Frontline \u2192 Export CSV. Then drag and drop the CSV file into the upload area. Upload both this month's and last month's reports so we can tell who's currently active.",
      },
      {
        q: "What's the difference between Active, At Risk, and Past clients?",
        a: "Active means they ordered this month or last month. At Risk means they haven't ordered in 2\u20133 months \u2014 these are people to check in on. Past means they haven't ordered in 3+ months.",
      },
      {
        q: "How do I add a client manually?",
        a: "Currently, clients are imported via CSV from your Optavia back office. This ensures we have accurate order history and status data for each client. Upload your Frontline and Orders reports to get started.",
      },
    ],
  },
  {
    title: "Managing Clients",
    icon: "\uD83D\uDC65",
    questions: [
      {
        q: "What does the checklist view do?",
        a: "It helps you track your weekly touchpoints for each client \u2014 whether you've done a check-in call, received a scale pic, and sent a value add. Toggle it on with the \"Checklist View\" button at the top of the Clients page.",
      },
      {
        q: "What do the order alerts mean?",
        a: "Alerts flag irregularities in a client's orders \u2014 like a cancellation, a changed order date, or their QV dropping below 350 (which means they lose their 15% discount). These help you catch problems early so you can reach out.",
      },
      {
        q: "What's QV and why does 350 matter?",
        a: "QV stands for Qualifying Volume \u2014 it's the value of a client's order. Orders over 350 QV qualify for a 15% discount (Premier+ pricing). If a client's QV drops below 350, they lose that benefit, so it's a great reason to reach out and help them adjust their order.",
      },
      {
        q: "How often should I re-upload my orders?",
        a: "At least once a month. Upload both this month's and last month's order reports to keep your Active, At Risk, and Past categories accurate. The more current your data, the better you can support your clients.",
      },
    ],
  },
  {
    title: "Managing Leads",
    icon: "\uD83C\uDFAF",
    questions: [
      {
        q: "How do I add a new lead?",
        a: "Go to the Leads page and click \"Add Lead +\" in the top right. Fill in their name and any contact info you have. You can also add their Facebook profile URL and how you originally met them.",
      },
      {
        q: "What are the lead stages?",
        a: "Leads progress through these stages: Prospect \u2192 Conversation \u2192 HA Scheduled \u2192 HA Completed \u2192 Client \u2192 Potential Coach. Move them forward as your relationship progresses by clicking the next stage on their detail page.",
      },
      {
        q: "What's the Hundreds List?",
        a: "These are people you've had some interaction with but haven't had a real conversation yet about the program. Filter for them using the \"Hundreds List\" pill at the top of the Leads page. It's your warm market!",
      },
      {
        q: "What are the Facebook tracking buttons for?",
        a: "They help you track your social media interactions \u2014 comments, friend requests, group invites, tags, and messages. This way you can see your engagement pipeline at a glance without needing to remember who you've interacted with on Facebook.",
      },
      {
        q: "How do I convert a lead to a client?",
        a: "Once a lead has become a client, go to their detail page (tap their name on the Leads page). You'll see a green \"Convert to Client Record\" button. This creates them in your client list so you can track their orders and progress.",
      },
    ],
  },
  {
    title: "Calendar",
    icon: "\uD83D\uDCC5",
    questions: [
      {
        q: "What shows up on my calendar?",
        a: "Three things: follow-up dates you've set for your leads, weekly check-in reminders for clients who want them, and any custom reminders you've created yourself.",
      },
      {
        q: "How do I add a reminder?",
        a: "Click any day on the calendar, then click \"Add Reminder.\" Fill in the title, pick a date and time, and optionally link it to one of your leads or clients so you have context when the reminder comes up.",
      },
      {
        q: "Can I sync with Google Calendar?",
        a: "Each event has an \"Add to Google Calendar\" link that opens Google Calendar with the event details pre-filled. Full two-way sync is coming in a future update!",
      },
    ],
  },
  {
    title: "Account & Settings",
    icon: "\u2699\uFE0F",
    questions: [
      {
        q: "How do I change my password?",
        a: "Go to Settings (the gear icon in the top right) \u2192 scroll down to the Password section \u2192 type your new password, confirm it, and click \"Update Password.\"",
      },
      {
        q: "Who can see my data?",
        a: "Only you! Your clients, leads, calendar, and all your data are completely private to your account. No other coach can see your information.",
      },
    ],
  },
];

function AccordionItem({ question, answer, isOpen, onToggle }) {
  return (
    <div className="border-b-2 border-gray-50 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-[#faf7f2]/50 transition-colors duration-150"
      >
        <span className="font-body text-base font-semibold text-gray-800">
          {question}
        </span>
        <span
          className={`text-gray-400 text-lg flex-shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          {"\u25BE"}
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-5 pb-4 pt-0">
          <p className="text-base text-gray-600 leading-relaxed">{answer}</p>
        </div>
      </div>
    </div>
  );
}

export default function HelpPage() {
  const { coach } = useCoach();
  const [search, setSearch] = useState("");
  const [openItem, setOpenItem] = useState(null); // "sectionIdx-questionIdx"

  const handleToggle = (key) => {
    setOpenItem((prev) => (prev === key ? null : key));
  };

  const normalizedSearch = search.trim().toLowerCase();

  const filteredSections = FAQ_SECTIONS.map((section) => ({
    ...section,
    questions: section.questions.filter(
      (q) =>
        !normalizedSearch ||
        q.q.toLowerCase().includes(normalizedSearch) ||
        q.a.toLowerCase().includes(normalizedSearch)
    ),
  })).filter((section) => section.questions.length > 0);

  const totalResults = filteredSections.reduce(
    (sum, s) => sum + s.questions.length,
    0
  );

  return (
    <>
      <PageHeader
        title="Help & FAQ"
        subtitle="Everything you need to know about OPTAVIA Plus"
      />

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpenItem(null);
          }}
          placeholder="Search questions..."
          className="w-full rounded-xl border-2 border-gray-200 bg-white px-5 py-3 font-body text-base focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150"
        />
        {normalizedSearch && (
          <p className="text-sm text-gray-400 mt-2 px-1">
            {totalResults === 0
              ? "No questions match your search."
              : `${totalResults} question${totalResults !== 1 ? "s" : ""} found`}
          </p>
        )}
      </div>

      {/* FAQ Sections */}
      <div className="space-y-4">
        {filteredSections.map((section, sIdx) => (
          <div
            key={section.title}
            className="rounded-2xl border-2 border-gray-100 bg-white overflow-hidden"
          >
            <div className="px-5 py-4 border-b-2 border-gray-100 bg-[#faf7f2]/50">
              <h2 className="font-display text-lg font-bold text-gray-900 flex items-center gap-2">
                <span className="text-xl">{section.icon}</span>
                {section.title}
              </h2>
            </div>
            {section.questions.map((item, qIdx) => {
              const key = `${sIdx}-${qIdx}`;
              return (
                <AccordionItem
                  key={key}
                  question={item.q}
                  answer={item.a}
                  isOpen={openItem === key}
                  onToggle={() => handleToggle(key)}
                />
              );
            })}
          </div>
        ))}

        {normalizedSearch && totalResults === 0 && (
          <div className="rounded-2xl border-2 border-gray-100 bg-white p-10 text-center">
            <div className="text-3xl mb-3">{"\uD83D\uDD0D"}</div>
            <p className="font-display text-lg font-bold text-gray-900 mb-1">
              No results found
            </p>
            <p className="text-base text-gray-500">
              Try a different search term or{" "}
              <button
                onClick={() => {
                  setSearch("");
                  setOpenItem(null);
                }}
                className="text-[#E8735A] font-bold hover:underline"
              >
                browse all questions
              </button>
            </p>
          </div>
        )}
      </div>

      {/* Footer help text */}
      <div className="mt-6 text-center">
        <p className="text-sm text-gray-400">
          Can't find what you're looking for? Reach out to support for help.
        </p>
      </div>
    </>
  );
}
