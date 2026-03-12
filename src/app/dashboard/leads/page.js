"use client";

import { useState, useEffect, useRef, useCallback, useContext } from "react";
import { useCoach, ToastContext } from "../layout";
import { useRouter } from "next/navigation";
import PageHeader from "../components/PageHeader";
import LoadingSpinner from "../components/LoadingSpinner";
import EmptyState from "../components/EmptyState";
import ErrorBanner from "../components/ErrorBanner";
import ConfirmDialog from "../components/ConfirmDialog";
import LeadImporter from "../components/LeadImporter";

const STAGES = [
  { value: "prospect", label: "Prospect", color: "bg-gray-100 text-gray-700" },
  { value: "conversation", label: "Conversation", color: "bg-blue-100 text-blue-700" },
  { value: "ha_scheduled", label: "HA Scheduled", color: "bg-yellow-100 text-yellow-700" },
  { value: "ha_completed", label: "HA Completed", color: "bg-purple-100 text-purple-700" },
  { value: "client", label: "Client", color: "bg-green-100 text-green-700" },
  { value: "potential_coach", label: "Potential Coach", color: "bg-teal-100 text-teal-700" },
];

const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.value, s]));

const SOURCE_OPTIONS = [
  { value: "facebook_post", label: "Facebook Post" },
  { value: "facebook_group", label: "Facebook Group" },
  { value: "instagram", label: "Instagram" },
  { value: "referral", label: "Referral" },
  { value: "in_person", label: "In Person" },
  { value: "past_client", label: "Past Client" },
  { value: "other", label: "Other" },
];

const SOURCE_MAP = Object.fromEntries(SOURCE_OPTIONS.map((s) => [s.value, s.label]));

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "Newest first" },
  { value: "created_at:asc", label: "Oldest first" },
  { value: "last_contact_date:asc", label: "Least recently contacted" },
  { value: "next_followup_date:asc", label: "Next follow-up" },
  { value: "last_contact_date:desc", label: "Last contact" },
  { value: "full_name:asc", label: "Name A-Z" },
];

const CATEGORY_FILTERS = [
  { value: "", label: "All" },
  { value: "prospect", label: "Hundreds List" },
  { value: "conversation", label: "In Conversation" },
  { value: "ha_scheduled,ha_completed", label: "HA Pipeline" },
];

function StageBadge({ stage }) {
  const info = STAGE_MAP[stage];
  if (!info) return <span className="text-xs text-gray-400">{stage}</span>;
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${info.color}`}>
      {info.label}
    </span>
  );
}

function relativeTime(dateStr) {
  if (!dateStr) return "Never";
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function formatFollowup(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - now) / 86400000);

  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  let className = "text-gray-600";
  if (diffDays < 0) className = "text-red-600 font-semibold";
  else if (diffDays === 0) className = "text-orange-500 font-semibold";
  else if (diffDays <= 2) className = "text-yellow-600";

  let suffix = "";
  if (diffDays < 0) suffix = " (overdue)";
  else if (diffDays === 0) suffix = " (today)";

  return { label: label + suffix, className };
}

export default function LeadsPage() {
  const { coach } = useCoach();
  const router = useRouter();
  const showToast = useContext(ToastContext);

  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [sortValue, setSortValue] = useState("created_at:desc");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    facebook_url: "",
    source: "",
    originally_met_date: "",
    groups: "",
    notes: "",
    next_followup_date: "",
  });
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);

  const debounceRef = useRef(null);

  const handleSearchChange = useCallback((value) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [page, debouncedSearch, stageFilter, sourceFilter, sortValue]);

  const fetchLeads = async () => {
    setLoading(true);
    setError(null);

    const [sort, order] = sortValue.split(":");
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    params.set("sort", sort);
    params.set("order", order);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (stageFilter) params.set("stage", stageFilter);
    if (sourceFilter) params.set("source", sourceFilter);

    try {
      const res = await fetch(`/api/leads?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load leads");
        return;
      }

      setLeads(data.leads || []);
      setTotal(data.total ?? 0);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Stage counts from loaded data (only accurate for current page; show total per stage)
  const stageCounts = leads.reduce((acc, l) => {
    acc[l.stage] = (acc[l.stage] || 0) + 1;
    return acc;
  }, {});

  const totalPages = Math.ceil(total / limit);
  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, total);
  const hasFilters = debouncedSearch || stageFilter || sourceFilter;

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStageFilter("");
    setSourceFilter("");
    setPage(1);
  };

  const openModal = () => {
    setFormData({
      full_name: "",
      email: "",
      phone: "",
      facebook_url: "",
      source: "",
      originally_met_date: "",
      groups: "",
      notes: "",
      next_followup_date: "",
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleDelete = async (lead) => {
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete lead");
      }
      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
      setTotal((prev) => prev - 1);
      showToast({ message: "Lead deleted" });
    } catch (err) {
      showToast({ message: err.message, variant: "error" });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      setFormError("Name is required");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const body = { ...formData };
      // Clean empty strings to null
      Object.keys(body).forEach((k) => {
        if (body[k] === "") body[k] = null;
      });
      body.full_name = formData.full_name.trim();

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Failed to create lead");
        return;
      }

      setShowModal(false);
      setPage(1);
      setStageFilter("");
      fetchLeads();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div>
      <PageHeader
        title="My Leads"
        subtitle="Your hundreds list — supercharged"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="px-4 py-3 rounded-xl text-sm font-bold border-2 border-[#E8735A] text-[#E8735A] hover:bg-[#E8735A]/10 transition-all duration-150 active:scale-95 min-h-[44px] touch-manipulation"
            >
              Import Leads
            </button>
            <button
              onClick={openModal}
              className="bg-[#E8735A] hover:bg-[#d4634d] text-white px-6 py-3 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95 shadow-sm min-h-[44px] touch-manipulation"
            >
              Add Lead +
            </button>
          </div>
        }
      />

      {/* Category quick filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORY_FILTERS.map((cat) => (
          <button
            key={cat.value}
            onClick={() => { setStageFilter(cat.value); setPage(1); }}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all duration-150 min-h-[44px] touch-manipulation ${
              stageFilter === cat.value
                ? "bg-[#E8735A] text-white shadow-sm"
                : "bg-white text-gray-500 border-2 border-gray-200 hover:border-gray-300"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Stage summary cards */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STAGES.map((s) => (
          <button
            key={s.value}
            onClick={() => { setStageFilter(stageFilter === s.value ? "" : s.value); setPage(1); }}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all duration-150 min-h-[44px] touch-manipulation ${
              stageFilter === s.value
                ? "border-[#E8735A] bg-[#E8735A]/5 text-[#E8735A]"
                : "border-gray-100 bg-white text-gray-500 hover:border-gray-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by name..."
            className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-base focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150 min-h-[44px]"
          />

          <select
            value={sourceFilter}
            onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
            className="rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-base bg-white focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150 min-h-[44px]"
          >
            <option value="">All Sources</option>
            {SOURCE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <select
            value={sortValue}
            onChange={(e) => { setSortValue(e.target.value); setPage(1); }}
            className="rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-base bg-white focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150 min-h-[44px]"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-sm font-semibold text-[#E8735A] hover:text-[#d4644d] whitespace-nowrap transition-colors duration-150"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && <ErrorBanner message={error} onRetry={fetchLeads} />}

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-2xl border-2 border-gray-100">
          <LoadingSpinner message="Loading leads..." />
        </div>
      )}

      {/* Desktop table / Mobile cards */}
      {!loading && !error && leads.length > 0 && (
        <div className="bg-white rounded-2xl border-2 border-gray-100 overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-100">
                  <th className="text-left px-5 py-3 font-display text-xs font-bold text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="text-left px-5 py-3 font-display text-xs font-bold text-gray-400 uppercase tracking-wider">Stage</th>
                  <th className="text-left px-5 py-3 font-display text-xs font-bold text-gray-400 uppercase tracking-wider">Source</th>
                  <th className="text-left px-5 py-3 font-display text-xs font-bold text-gray-400 uppercase tracking-wider">Last Contact</th>
                  <th className="text-left px-5 py-3 font-display text-xs font-bold text-gray-400 uppercase tracking-wider">Next Follow-up</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const followup = formatFollowup(lead.next_followup_date);
                  return (
                    <tr
                      key={lead.id}
                      className="border-b border-gray-50 hover:bg-[#faf7f2] transition-colors duration-100 group"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                            className="font-body text-sm font-semibold text-gray-800 hover:text-[#E8735A] transition-colors duration-150 text-left"
                          >
                            {lead.full_name}
                          </button>
                          {lead.facebook_url && (
                            <a
                              href={lead.facebook_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-gray-400 hover:text-[#E8735A] transition-colors duration-150"
                              title="Open Facebook profile"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            </a>
                          )}
                        </div>
                        {lead.email && (
                          <p className="text-xs text-gray-400 mt-0.5">{lead.email}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <StageBadge stage={lead.stage} />
                      </td>
                      <td className="px-5 py-3 font-body text-sm text-gray-500">
                        {SOURCE_MAP[lead.source] || lead.source || "\u2014"}
                      </td>
                      <td className="px-5 py-3 font-body text-sm font-semibold text-gray-700">
                        {lead.last_contact_date
                          ? relativeTime(lead.last_contact_date)
                          : <span className="text-red-400 font-normal">Never</span>
                        }
                      </td>
                      <td className="px-5 py-3 font-body text-sm">
                        {followup ? (
                          <span className={followup.className}>{followup.label}</span>
                        ) : (
                          <span className="text-gray-400">{"\u2014"}</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(lead); }}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all duration-150 p-1 rounded-lg hover:bg-red-50"
                          title="Delete lead"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {leads.map((lead) => {
              const followup = formatFollowup(lead.next_followup_date);
              return (
                <div key={lead.id} className="relative">
                  <button
                    onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                    className="w-full text-left px-4 py-4 hover:bg-[#faf7f2] transition-colors duration-100 pr-10 min-h-[60px] touch-manipulation"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-body text-base font-semibold text-gray-800">
                          {lead.full_name}
                        </span>
                        {lead.facebook_url && (
                          <a
                            href={lead.facebook_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-gray-400 hover:text-[#E8735A] transition-colors duration-150"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          </a>
                        )}
                      </div>
                      <StageBadge stage={lead.stage} />
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {lead.source && <span className="text-gray-400">{SOURCE_MAP[lead.source] || lead.source}</span>}
                      <span className={`font-semibold ${lead.last_contact_date ? "text-gray-600" : "text-red-400"}`}>
                        {lead.last_contact_date ? relativeTime(lead.last_contact_date) : "Never contacted"}
                      </span>
                      {followup && (
                        <span className={followup.className}>{followup.label}</span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => setDeleteTarget(lead)}
                    className="absolute top-3 right-2 text-gray-300 hover:text-red-500 transition-colors duration-150 p-2 rounded-lg hover:bg-red-50 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
                    title="Delete lead"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="px-5 py-3 border-t-2 border-gray-100 flex items-center justify-between">
            <p className="font-body text-sm text-gray-500">
              Showing {rangeStart.toLocaleString()}&ndash;{rangeEnd.toLocaleString()} of {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-4 py-2 rounded-xl text-sm font-bold disabled:text-gray-300 disabled:cursor-not-allowed text-[#E8735A] hover:bg-[#E8735A]/10 transition-colors duration-150 min-h-[44px] touch-manipulation"
              >
                Previous
              </button>
              <span className="font-body text-sm text-gray-500">
                Page {page} of {totalPages || 1}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-4 py-2 rounded-xl text-sm font-bold disabled:text-gray-300 disabled:cursor-not-allowed text-[#E8735A] hover:bg-[#E8735A]/10 transition-colors duration-150 min-h-[44px] touch-manipulation"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && leads.length === 0 && (
        <EmptyState
          icon={hasFilters ? "\uD83D\uDD0D" : "\uD83C\uDFAF"}
          title={hasFilters ? "No leads match your filters" : "No leads yet \u2014 start building your hundreds list!"}
          subtitle={
            hasFilters
              ? "Try a different search term or clear your filters"
              : "Add your first lead to get started tracking your pipeline"
          }
          actionLabel={hasFilters ? "Clear filters" : "Add Lead +"}
          onAction={hasFilters ? clearFilters : openModal}
        />
      )}

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Lead"
        message={`Are you sure you want to delete ${deleteTarget?.full_name}? This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Import Leads Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowImportModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border-2 border-gray-100 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-display text-xl font-bold text-gray-900">Import Leads</h2>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-lg"
                >
                  &times;
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-5">
                Upload a CSV of your hundreds list to bulk-import leads.
              </p>
              <LeadImporter
                onImportComplete={() => {
                  fetchLeads();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Add Lead Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border-2 border-gray-100 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="font-display text-xl font-bold text-gray-900 mb-1">Add New Lead</h2>
              <p className="text-sm text-gray-500 mb-5">Add someone to your hundreds list</p>

              {formError && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl px-4 py-2.5 mb-4">
                  <p className="text-sm text-red-700">{formError}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => updateField("full_name", e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-base focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150 min-h-[44px]"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      placeholder="jane@example.com"
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-base focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150 min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      placeholder="(555) 123-4567"
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-base focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150 min-h-[44px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Facebook Profile URL</label>
                  <input
                    type="url"
                    value={formData.facebook_url}
                    onChange={(e) => updateField("facebook_url", e.target.value)}
                    placeholder="https://facebook.com/janesmith"
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-base focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150 min-h-[44px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Source</label>
                    <select
                      value={formData.source}
                      onChange={(e) => updateField("source", e.target.value)}
                      className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-base bg-white focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150 min-h-[44px]"
                    >
                      <option value="">Select source...</option>
                      {SOURCE_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Originally Met</label>
                    <input
                      type="date"
                      value={formData.originally_met_date}
                      onChange={(e) => updateField("originally_met_date", e.target.value)}
                      className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Next Follow-up</label>
                  <input
                    type="date"
                    value={formData.next_followup_date}
                    onChange={(e) => updateField("next_followup_date", e.target.value)}
                    className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Groups</label>
                  <input
                    type="text"
                    value={formData.groups}
                    onChange={(e) => updateField("groups", e.target.value)}
                    placeholder="e.g. Local running club, Mom's group on FB"
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-base focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150 min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => updateField("notes", e.target.value)}
                    placeholder="Any initial notes about this lead..."
                    rows={3}
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-base focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150 resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-[#E8735A] hover:bg-[#d4634d] disabled:bg-gray-300 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95"
                  >
                    {submitting ? "Adding..." : "Add Lead"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-gray-500 border-2 border-gray-200 hover:border-gray-300 transition-colors duration-150"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
