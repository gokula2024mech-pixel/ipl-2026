import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Filter,
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FileText,
  Download,
  RotateCcw,
  Sparkles,
  ChevronRight,
  Calendar,
  Building,
  User,
  Mail,
  Phone,
  Layers,
  Award,
  Clock,
  Check,
  Eye,
  Settings,
  HelpCircle,
} from "lucide-react";
import MechanicalLoader from "./MechanicalLoader";

const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000")
  .trim()
  .replace(/\/+$/, "");
const API_BASE_URL = rawApiUrl.endsWith("/api")
  ? rawApiUrl.slice(0, -4)
  : rawApiUrl;

const CANONICAL_DEPARTMENTS = [
  "Artificial Intelligence and Machine Learning",
  "Artificial Intelligence and Data Science",
  "Computer Science and Business System",
  "Cyber Security",
  "Computer and Communication Engineering",
  "Electronics and Communication Engineering",
  "Electrical and Electronics Engineering",
  "Computer Science and Engineering",
  "Information Technology",
  "Mechanical Engineering",
];

const CANONICAL_DOMAINS = [
  "Smart Manufacturing & Industry 4.0",
  "Robotics & Intelligent Automation",
  "AI & Machine Learning",
  "IoT & Smart Systems",
  "Electric Mobility & Energy",
  "Sustainable & Green Technology",
  "Smart Agriculture & Rural Innovation",
  "Healthcare & Assistive Technology",
  "Smart Infrastructure & Public Safety",
  "Renewable Energy",
  "Defence & Safety",
  "Innovative Consumer Products",
  "Open Innovation",
];

export default function AdminSubmissionsReviewCenter({
  token,
  userEmail,
  onShowToast,
}) {
  // State: Data
  const [submissions, setSubmissions] = useState([]);
  const [counts, setCounts] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // State: Navigation & View
  const [activeStatusTab, setActiveStatusTab] = useState("PENDING");
  const [selectedSubmission, setSelectedSubmission] = useState(null);

  // State: Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [patentTypeFilter, setPatentTypeFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [domainFilter, setDomainFilter] = useState("ALL");
  const [mentorFilter, setMentorFilter] = useState("ALL");
  const [trlFilter, setTrlFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // State: Modals
  const [approveModalSub, setApproveModalSub] = useState(null);
  const [approveComment, setApproveComment] = useState("");
  const [isSubmittingApprove, setIsSubmittingApprove] = useState(false);

  const [rejectModalSub, setRejectModalSub] = useState(null);
  const [rejectComment, setRejectComment] = useState("");
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);

  const [changeDecisionModalSub, setChangeDecisionModalSub] = useState(null);
  const [returnToPendingModalSub, setReturnToPendingModalSub] = useState(null);
  const [pendingComment, setPendingComment] = useState("");
  const [isSubmittingPending, setIsSubmittingPending] = useState(false);
  const [errorModal, setErrorModal] = useState(null);

  const [openDocModal, setOpenDocModal] = useState(null); // { doc, sub }
  const [alwaysUsePreference, setAlwaysUsePreference] = useState(false);
  const [docOpenPreference, setDocOpenPreference] = useState(() => {
    try {
      return localStorage.getItem("admin_doc_open_pref") || null;
    } catch (e) {
      return null;
    }
  });

  // Fetch Submissions from Backend
  const fetchSubmissions = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        status: activeStatusTab,
        search: searchQuery,
        patentType: patentTypeFilter,
        department: departmentFilter,
        domain: domainFilter,
        mentor: mentorFilter,
        trl: trlFilter,
        dateFilter: dateFilter,
        startDate: startDate,
        endDate: endDate,
      });

      const res = await fetch(
        `${API_BASE_URL}/api/phase1/admin/submissions?${queryParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || "Failed to load submissions.");
      }

      setSubmissions(data.submissions || []);
      if (data.counts) {
        setCounts(data.counts);
      }

      // If viewing details, update current detail view data if it changed
      if (selectedSubmission) {
        const updated = (data.submissions || []).find(
          (s) => s.teamId === selectedSubmission.teamId
        );
        if (updated) {
          setSelectedSubmission(updated);
        }
      }
    } catch (err) {
      console.error("[Admin Review Center] Error fetching submissions:", err);
      setError("Unable to load submissions. Please check your network and try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Re-fetch when tab or filters change
  useEffect(() => {
    if (token) {
      fetchSubmissions();
    }
  }, [
    token,
    activeStatusTab,
    patentTypeFilter,
    departmentFilter,
    domainFilter,
    mentorFilter,
    trlFilter,
    dateFilter,
    startDate,
    endDate,
  ]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (token) {
        fetchSubmissions();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Extract unique mentors from submissions for filter dropdown
  const availableMentors = useMemo(() => {
    const set = new Set();
    submissions.forEach((s) => {
      if (s.mentor?.name && s.mentor.name !== "Unassigned") {
        set.add(s.mentor.name);
      }
    });
    return Array.from(set).sort();
  }, [submissions]);

  // Active filters helper
  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (patentTypeFilter !== "ALL") {
      chips.push({
        id: "patentType",
        label: `Patent: ${patentTypeFilter}`,
        onClear: () => setPatentTypeFilter("ALL"),
      });
    }
    if (departmentFilter !== "ALL") {
      chips.push({
        id: "dept",
        label: `Dept: ${departmentFilter}`,
        onClear: () => setDepartmentFilter("ALL"),
      });
    }
    if (domainFilter !== "ALL") {
      chips.push({
        id: "domain",
        label: `Domain: ${domainFilter}`,
        onClear: () => setDomainFilter("ALL"),
      });
    }
    if (mentorFilter !== "ALL") {
      chips.push({
        id: "mentor",
        label: `Mentor: ${mentorFilter}`,
        onClear: () => setMentorFilter("ALL"),
      });
    }
    if (trlFilter !== "ALL") {
      chips.push({
        id: "trl",
        label: `TRL ${trlFilter}`,
        onClear: () => setTrlFilter("ALL"),
      });
    }
    if (dateFilter !== "ALL") {
      chips.push({
        id: "date",
        label: `Date: ${dateFilter}`,
        onClear: () => {
          setDateFilter("ALL");
          setStartDate("");
          setEndDate("");
        },
      });
    }
    if (searchQuery.trim()) {
      chips.push({
        id: "search",
        label: `Search: "${searchQuery}"`,
        onClear: () => setSearchQuery(""),
      });
    }
    return chips;
  }, [
    patentTypeFilter,
    departmentFilter,
    domainFilter,
    mentorFilter,
    trlFilter,
    dateFilter,
    searchQuery,
  ]);

  const handleClearAllFilters = () => {
    setPatentTypeFilter("ALL");
    setDepartmentFilter("ALL");
    setDomainFilter("ALL");
    setMentorFilter("ALL");
    setTrlFilter("ALL");
    setDateFilter("ALL");
    setStartDate("");
    setEndDate("");
    setSearchQuery("");
  };

  // Open Document Logic
  const handleOpenFileClick = (doc, sub) => {
    if (!doc || !doc.fileId) return;

    // Check stored preference
    if (docOpenPreference === "browser") {
      openInBrowser(doc);
      return;
    }
    if (docOpenPreference === "word") {
      openInWord(doc);
      return;
    }

    // Otherwise show modal
    setAlwaysUsePreference(false);
    setOpenDocModal({ doc, sub });
  };

  const openInBrowser = (doc) => {
    const url =
      doc.webViewLink ||
      `https://drive.google.com/file/d/${doc.fileId}/view?usp=sharing`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openInWord = (doc) => {
    const downloadUrl = `${API_BASE_URL}/api/patents/file/${doc.fileId}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", doc.name || "document.docx");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConfirmOpenDoc = (choice) => {
    if (!openDocModal) return;
    const { doc } = openDocModal;

    if (alwaysUsePreference) {
      try {
        localStorage.setItem("admin_doc_open_pref", choice);
        setDocOpenPreference(choice);
      } catch (e) {}
    }

    if (choice === "browser") {
      openInBrowser(doc);
    } else {
      openInWord(doc);
    }

    setOpenDocModal(null);
  };

  const handleResetPreference = () => {
    try {
      localStorage.removeItem("admin_doc_open_pref");
      setDocOpenPreference(null);
      if (onShowToast) {
        onShowToast({
          type: "info",
          title: "Preference Reset",
          message: "Document open preference reset. You will be prompted on next open.",
        });
      }
    } catch (e) {}
  };

  // Decision Handlers: Approve & Reject
  const handleConfirmApprove = async () => {
    if (!approveModalSub) return;
    setIsSubmittingApprove(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/phase1/admin/review-team`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          registrationId: approveModalSub.teamId,
          status: "APPROVED",
          adminComment: approveComment.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to approve submission.");
      }

      if (onShowToast) {
        onShowToast({
          type: "success",
          title: "Submission Approved",
          message: `Team ${approveModalSub.teamId} (${approveModalSub.teamName}) approved successfully.`,
        });
      }

      setApproveModalSub(null);
      setApproveComment("");

      // Update local item if in details view
      if (selectedSubmission && selectedSubmission.teamId === approveModalSub.teamId) {
        setSelectedSubmission((prev) => ({
          ...prev,
          status: "APPROVED",
          adminComment: approveComment.trim() || null,
        }));
      }

      await fetchSubmissions(true);
    } catch (err) {
      const errMsg = err.message || "Failed to approve submission.";
      if (onShowToast) {
        onShowToast({
          type: "error",
          title: "APPROVAL FAILED",
          message: errMsg,
        });
      }
      setErrorModal({
        title: "APPROVAL FAILED",
        message: errMsg,
      });
    } finally {
      setIsSubmittingApprove(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectModalSub) return;
    setIsSubmittingReject(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/phase1/admin/review-team`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          registrationId: rejectModalSub.teamId,
          status: "REJECTED",
          adminComment: rejectComment.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to reject submission.");
      }

      if (onShowToast) {
        onShowToast({
          type: "info",
          title: "Submission Rejected",
          message: `Team ${rejectModalSub.teamId} (${rejectModalSub.teamName}) marked as rejected.`,
        });
      }

      setRejectModalSub(null);
      setRejectComment("");

      // Update local item if in details view
      if (selectedSubmission && selectedSubmission.teamId === rejectModalSub.teamId) {
        setSelectedSubmission((prev) => ({
          ...prev,
          status: "REJECTED",
          adminComment: rejectComment.trim() || null,
        }));
      }

      await fetchSubmissions(true);
    } catch (err) {
      const errMsg = err.message || "Failed to reject submission.";
      if (onShowToast) {
        onShowToast({
          type: "error",
          title: "REJECTION FAILED",
          message: errMsg,
        });
      }
      setErrorModal({
        title: "REJECTION FAILED",
        message: errMsg,
      });
    } finally {
      setIsSubmittingReject(false);
    }
  };

  const handleConfirmReturnToPending = async () => {
    if (!returnToPendingModalSub) return;
    setIsSubmittingPending(true);

    const targetRegId = (
      returnToPendingModalSub.registrationId ||
      returnToPendingModalSub.teamId ||
      returnToPendingModalSub.id ||
      ""
    ).trim();

    if (!targetRegId) {
      const errMsg = "Registration ID is missing for this team submission.";
      if (onShowToast) {
        onShowToast({
          type: "error",
          title: "RETURN TO PENDING FAILED",
          message: errMsg,
        });
      }
      setErrorModal({
        title: "RETURN TO PENDING FAILED",
        message: errMsg,
      });
      setIsSubmittingPending(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/phase1/admin/return-to-pending`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          registrationId: targetRegId,
          adminComment: pendingComment.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Unable to return this submission to Pending Review. Please try again.");
      }

      if (onShowToast) {
        onShowToast({
          type: "success",
          title: "SUBMISSION RETURNED TO PENDING",
          message: "This submission is now available for review again.",
        });
      }

      // Update local item if in details view
      if (
        selectedSubmission &&
        (selectedSubmission.teamId === targetRegId ||
          selectedSubmission.registrationId === targetRegId)
      ) {
        setSelectedSubmission((prev) => ({
          ...prev,
          status: "PENDING",
          adminComment: null,
          reviewedBy: null,
          reviewedAt: null,
        }));
      }

      setReturnToPendingModalSub(null);
      setPendingComment("");

      // Return to Pending queue tab
      setStatusTab("PENDING");

      await fetchSubmissions(true);
    } catch (err) {
      const errMsg = err.message || "Unable to return this submission to Pending Review. Please try again.";
      if (onShowToast) {
        onShowToast({
          type: "error",
          title: "RETURN TO PENDING FAILED",
          message: errMsg,
        });
      }
      setErrorModal({
        title: "RETURN TO PENDING FAILED",
        message: errMsg,
      });
    } finally {
      setIsSubmittingPending(false);
    }
  };

  // Status Badge Component
  const renderStatusBadge = (status, size = "normal") => {
    const isSmall = size === "small";
    if (status === "APPROVED") {
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-black uppercase rounded-full border transition-all ${
            isSmall ? "text-[9px] px-2 py-0.5" : "text-[11px] px-3 py-1"
          } bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-xs`}
        >
          <CheckCircle2 size={isSmall ? 10 : 13} className="text-emerald-600" />
          APPROVED
        </span>
      );
    }
    if (status === "REJECTED") {
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-black uppercase rounded-full border transition-all ${
            isSmall ? "text-[9px] px-2 py-0.5" : "text-[11px] px-3 py-1"
          } bg-rose-50 text-rose-700 border-rose-200/80 shadow-xs`}
        >
          <AlertTriangle size={isSmall ? 10 : 13} className="text-rose-600" />
          REJECTED
        </span>
      );
    }
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-black uppercase rounded-full border transition-all ${
          isSmall ? "text-[9px] px-2 py-0.5" : "text-[11px] px-3 py-1"
        } bg-amber-50 text-amber-800 border-amber-200/80 shadow-xs`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        PENDING REVIEW
      </span>
    );
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden text-slate-800 animate-fade-in">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & ACTIONS */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-accent bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-md">
              ADMIN CENTER
            </span>
            {docOpenPreference && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                <FileText size={10} /> Open Docs:{" "}
                <strong className="text-slate-800 capitalize">
                  {docOpenPreference}
                </strong>
                <button
                  type="button"
                  onClick={handleResetPreference}
                  className="ml-1 text-slate-400 hover:text-red-600 transition cursor-pointer"
                  title="Reset document open preference"
                >
                  ✕
                </button>
              </span>
            )}
          </div>
          <h1 className="font-heading text-xl sm:text-2xl font-black tracking-tight text-slate-900 truncate">
            SUBMISSIONS
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            Review, approve, and manage Phase 1 patent document submissions.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {docOpenPreference && (
            <button
              type="button"
              onClick={handleResetPreference}
              className="sm:hidden text-xs font-bold text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 transition cursor-pointer"
              title="Reset preference"
            >
              Reset Pref
            </button>
          )}

          <button
            type="button"
            onClick={() => fetchSubmissions(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer disabled:opacity-60"
          >
            <RotateCcw
              size={13}
              className={refreshing ? "animate-spin text-accent" : ""}
            />
            <span>{refreshing ? "Refreshing..." : "Refresh Data"}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. DEDICATED SUBMISSION DETAILS VIEW (WHEN SELECTED) */}
      {/* ========================================================================= */}
      {selectedSubmission ? (
        <div className="space-y-6 animate-slide-up">
          {/* Back Navigation Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
            <button
              type="button"
              onClick={() => setSelectedSubmission(null)}
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-black text-slate-600 hover:text-slate-900 transition cursor-pointer group"
            >
              <ArrowLeft
                size={16}
                className="group-hover:-translate-x-0.5 transition-transform"
              />
              <span>Back to Submissions</span>
            </button>

            <div className="flex flex-wrap items-center gap-2.5">
              {renderStatusBadge(selectedSubmission.status)}

              {selectedSubmission.status === "PENDING" ? (
                <div className="flex items-center gap-2 ml-2">
                  <button
                    type="button"
                    onClick={() => {
                      setApproveModalSub(selectedSubmission);
                      setApproveComment("");
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow transition cursor-pointer"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectModalSub(selectedSubmission);
                      setRejectComment("");
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-sm hover:shadow transition cursor-pointer"
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setChangeDecisionModalSub(selectedSubmission)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer border border-slate-200 shadow-xs ml-2"
                >
                  <RotateCcw size={13} className="text-slate-500" />
                  <span>Change Decision</span>
                </button>
              )}
            </div>
          </div>

          {/* Submission Details Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left Column: Team & Product Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Team Overview Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3 flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-accent">
                      TEAM SUBMISSION
                    </span>
                    <h2 className="text-xl font-black text-slate-900 mt-0.5">
                      {selectedSubmission.teamName}
                    </h2>
                  </div>
                  <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                    {selectedSubmission.teamId}
                  </span>
                </div>

                {/* Team Details */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                    TEAM DETAILS
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        Team Leader
                      </span>
                      <p className="font-black text-slate-900 mt-0.5">
                        {selectedSubmission.members?.leader?.name || "N/A"}
                      </p>
                      <div className="flex items-center gap-1 text-slate-500 mt-1 truncate">
                        <Mail size={11} className="shrink-0" />
                        <span className="truncate">
                          {selectedSubmission.members?.leader?.email || "N/A"}
                        </span>
                      </div>
                      {selectedSubmission.members?.leader?.phone && (
                        <div className="flex items-center gap-1 text-slate-500 mt-0.5">
                          <Phone size={11} className="shrink-0" />
                          <span>{selectedSubmission.members?.leader?.phone}</span>
                        </div>
                      )}
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        Faculty Mentor
                      </span>
                      <p className="font-black text-slate-900 mt-0.5">
                        {selectedSubmission.mentor?.name || "Unassigned"}
                      </p>
                      <span className="text-slate-500 block text-[11px] mt-1">
                        {selectedSubmission.mentor?.department || ""}
                      </span>
                    </div>
                  </div>

                  {/* Team Members List */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Team Members
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      {["member2", "member3", "member4"].map((mKey, idx) => {
                        const m = selectedSubmission.members?.[mKey];
                        if (!m || !m.name) return null;
                        return (
                          <div
                            key={mKey}
                            className="bg-white p-2.5 rounded-lg border border-slate-200/80"
                          >
                            <span className="text-[10px] font-bold text-slate-400 block">
                              Member {idx + 2}
                            </span>
                            <strong className="text-slate-900 block truncate">
                              {m.name}
                            </strong>
                            <span className="text-[11px] text-slate-500 block truncate">
                              {m.email}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Product / Idea Details Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
                <div className="border-b border-slate-100 pb-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-accent">
                    PRODUCT / IDEA DETAILS
                  </span>
                  <h3 className="text-lg font-black text-slate-900 mt-1">
                    {selectedSubmission.productTitle}
                  </h3>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Department
                    </span>
                    <strong className="text-slate-900 block truncate mt-0.5">
                      {selectedSubmission.department}
                    </strong>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Domain
                    </span>
                    <strong className="text-slate-900 block truncate mt-0.5">
                      {selectedSubmission.innovationDomain}
                    </strong>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Patent Type
                    </span>
                    <strong className="text-slate-900 block truncate mt-0.5">
                      {selectedSubmission.patentType}
                    </strong>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      TRL Level
                    </span>
                    <strong className="text-slate-900 block mt-0.5">
                      TRL {selectedSubmission.trl}
                    </strong>
                  </div>
                </div>

                {selectedSubmission.problemArea && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Problem Area
                    </span>
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                      {selectedSubmission.problemArea}
                    </div>
                  </div>
                )}

                {selectedSubmission.proposedSolution && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Proposed Solution
                    </span>
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                      {selectedSubmission.proposedSolution}
                    </div>
                  </div>
                )}

                {selectedSubmission.expectedImpact && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Expected Impact
                    </span>
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                      {selectedSubmission.expectedImpact}
                    </div>
                  </div>
                )}

                {/* Admin Decision & Status Details */}
                {selectedSubmission.status === "PENDING" ? (
                  <div className="p-4 bg-amber-50/50 border border-amber-200/60 rounded-xl flex items-center gap-3">
                    <Clock size={16} className="text-amber-600 shrink-0" />
                    <p className="text-xs font-semibold text-amber-900">
                      This submission is awaiting Admin review.
                    </p>
                  </div>
                ) : selectedSubmission.adminComment ? (
                  <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-black uppercase text-amber-800">
                      <Sparkles size={13} className="text-amber-600" />
                      Admin Comment
                    </div>
                    <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-line">
                      {selectedSubmission.adminComment}
                    </p>
                    {selectedSubmission.reviewedBy && (
                      <span className="text-[10px] text-slate-500 block pt-1">
                        Reviewed by {selectedSubmission.reviewedBy} on{" "}
                        {new Date(
                          selectedSubmission.reviewedAt || Date.now()
                        ).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Right Column: Submitted Documents Checklist */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-accent block">
                    PHASE 1 DOCUMENTS
                  </span>
                  <h3 className="text-base font-black text-slate-900 mt-0.5">
                    Document Checklist
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Review each document before making a decision.
                  </p>
                </div>

                <div className="space-y-3">
                  {(selectedSubmission.documents || []).map((doc, idx) => {
                    const isSubmitted = doc.status === "SUBMITTED";

                    return (
                      <div
                        key={doc.id || idx}
                        className={`p-3.5 rounded-xl border transition-all ${
                          isSubmitted
                            ? "bg-slate-50/80 border-slate-200 hover:border-slate-300"
                            : "bg-slate-50/30 border-slate-100 opacity-60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-mono text-[10px] font-bold text-slate-400 block">
                              {doc.slotNumber || String(idx + 1).padStart(2, "0")}
                            </span>
                            <h4 className="text-xs font-bold text-slate-900 truncate mt-0.5">
                              {doc.name}
                            </h4>
                          </div>

                          <span
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${
                              isSubmitted
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {isSubmitted ? "SUBMITTED" : "NOT SUBMITTED"}
                          </span>
                        </div>

                        {isSubmitted && (
                          <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-200/60">
                            <span className="text-[10px] text-slate-400">
                              {doc.uploadedAt
                                ? new Date(doc.uploadedAt).toLocaleDateString()
                                : ""}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenFileClick(doc, selectedSubmission)
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition cursor-pointer"
                            >
                              <FileText size={12} />
                              <span>Open File</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* 3. MAIN SUBMISSIONS REVIEW LIST VIEW */
        /* ========================================================================= */
        <div className="space-y-6">
          {/* Status Navigation Segmented Control */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              {[
                { id: "PENDING", label: "Pending", count: counts.pending },
                { id: "APPROVED", label: "Approved", count: counts.approved },
                { id: "REJECTED", label: "Rejected", count: counts.rejected },
              ].map((tab) => {
                const isActive = activeStatusTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveStatusTab(tab.id)}
                    className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                      isActive
                        ? "bg-slate-900 text-white shadow-md shadow-slate-900/10 scale-[1.02]"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-white text-slate-700 shadow-xs"
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Quick Filter Toggle Button on Mobile */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFilterPanelOpen((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  isFilterPanelOpen || activeFilterChips.length > 0
                    ? "bg-amber-50 text-accent border-amber-300"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <Filter size={13} />
                <span>Filters</span>
                {activeFilterChips.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-accent text-white text-[9px] font-black flex items-center justify-center">
                    {activeFilterChips.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Global Search Bar */}
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="flex items-center px-4 py-3.5 gap-3">
              <Search size={16} className="text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Team ID, Team Name, Email, Phone, Member Name, or Product Title..."
                className="w-full text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 bg-transparent outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-slate-400 hover:text-slate-600 transition cursor-pointer p-1"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Structured Filter Panel (Expandable) */}
          {isFilterPanelOpen && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 animate-slide-down">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Filter size={13} className="text-accent" />
                  Filter Submissions
                </h3>
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="text-xs font-bold text-accent hover:underline cursor-pointer"
                >
                  Reset All
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 text-xs">
                {/* 1. Patent Type */}
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                    Patent Type
                  </label>
                  <select
                    value={patentTypeFilter}
                    onChange={(e) => setPatentTypeFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-slate-800 outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="ALL">All Patent Types</option>
                    <option value="Utility Patent">Utility Patent</option>
                    <option value="Design Patent">Design Patent</option>
                  </select>
                </div>

                {/* 2. Department */}
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                    Department
                  </label>
                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-slate-800 outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="ALL">All Departments</option>
                    {CANONICAL_DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Innovation Domain */}
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                    Innovation Domain
                  </label>
                  <select
                    value={domainFilter}
                    onChange={(e) => setDomainFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-slate-800 outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="ALL">All Domains</option>
                    {CANONICAL_DOMAINS.map((dom) => (
                      <option key={dom} value={dom}>
                        {dom}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Mentor */}
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                    Mentor
                  </label>
                  <select
                    value={mentorFilter}
                    onChange={(e) => setMentorFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-slate-800 outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="ALL">All Mentors</option>
                    {availableMentors.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 5. TRL Level */}
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                    TRL Level
                  </label>
                  <select
                    value={trlFilter}
                    onChange={(e) => setTrlFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-slate-800 outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="ALL">All TRLs</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
                      <option key={lvl} value={lvl}>
                        TRL {lvl}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 6. Submission Date */}
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                    Submission Date
                  </label>
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold text-slate-800 outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="ALL">All Time</option>
                    <option value="today">Today</option>
                    <option value="7days">Last 7 Days</option>
                    <option value="30days">Last 30 Days</option>
                    <option value="custom">Custom Date Range</option>
                  </select>
                </div>
              </div>

              {/* Custom Date Range Picker */}
              {dateFilter === "custom" && (
                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-bold">From:</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-bold">To:</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Active Filter Chips Bar */}
          {activeFilterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Active Filters:
              </span>
              {activeFilterChips.map((chip) => (
                <span
                  key={chip.id}
                  className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 text-slate-800 font-bold px-2.5 py-1 rounded-lg text-xs"
                >
                  <span>{chip.label}</span>
                  <button
                    type="button"
                    onClick={chip.onClear}
                    className="text-slate-400 hover:text-slate-700 transition cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="text-xs font-black text-accent hover:underline cursor-pointer ml-1"
              >
                Clear All
              </button>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
              <div className="flex items-center gap-3">
                <AlertTriangle size={24} className="text-rose-600 shrink-0" />
                <div>
                  <h4 className="text-sm font-black text-rose-900">
                    Unable to load submissions
                  </h4>
                  <p className="text-xs text-rose-700 mt-0.5">{error}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => fetchSubmissions(true)}
                className="px-4 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading && !refreshing ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <MechanicalLoader size={36} className="text-accent" />
              <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                Loading submissions...
              </p>
            </div>
          ) : submissions.length === 0 ? (
            /* Empty State */
            <div className="py-20 flex flex-col items-center justify-center gap-3 bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-1">
                <FileText size={22} />
              </div>
              <h3 className="text-base font-black text-slate-800">
                {activeStatusTab === "PENDING"
                  ? "No pending submissions match your filters."
                  : activeStatusTab === "APPROVED"
                  ? "No approved submissions found."
                  : "No rejected submissions found."}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Try adjusting your search query, clearing filters, or checking another status view.
              </p>
              {activeFilterChips.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="mt-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            /* ========================================================================= */
            /* 4. RESPONSIVE SUBMISSION CARDS GRID (NO HORIZONTAL SCROLLING) */
            /* ========================================================================= */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {submissions.map((sub, index) => {
                const isPending = sub.status === "PENDING";
                const isApproved = sub.status === "APPROVED";
                const isRejected = sub.status === "REJECTED";

                return (
                  <div
                    key={sub.teamId}
                    style={{ animationDelay: `${index * 40}ms` }}
                    className="group bg-white rounded-2xl border border-slate-200 hover:border-slate-300 p-5 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      {/* Top Header Row */}
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="min-w-0">
                          <span className="font-mono text-[11px] font-black text-accent block">
                            {sub.teamId}
                          </span>
                          <h3 className="text-sm font-black text-slate-900 truncate">
                            {sub.teamName}
                          </h3>
                        </div>
                        {renderStatusBadge(sub.status, "small")}
                      </div>

                      {/* Product Title */}
                      <div>
                        <h4 className="text-xs sm:text-sm font-extrabold text-slate-800 leading-snug line-clamp-2">
                          {sub.productTitle}
                        </h4>
                      </div>

                      {/* Meta Information Tags */}
                      <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md truncate max-w-[180px]">
                          {sub.department}
                        </span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                          {sub.patentType}
                        </span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                          TRL {sub.trl}
                        </span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md truncate max-w-[180px]">
                          Mentor: {sub.mentor?.name}
                        </span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                          {sub.submissionDate
                            ? new Date(sub.submissionDate).toLocaleDateString()
                            : ""}
                        </span>
                      </div>

                      {/* Documents Submitted Summary */}
                      <div className="text-[11px] text-slate-500 font-semibold flex items-center justify-between pt-1">
                        <span>
                          Documents:{" "}
                          <strong className="text-slate-800">
                            {
                              (sub.documents || []).filter(
                                (d) => d.status === "SUBMITTED"
                              ).length
                            }
                          </strong>{" "}
                          / {sub.documents?.length || 0}
                        </span>
                        {sub.status !== "PENDING" && sub.adminComment && (
                          <span className="text-accent font-bold truncate max-w-[150px]">
                            Comment added
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons Footer */}
                    <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedSubmission(sub)}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-800 transition-colors cursor-pointer"
                      >
                        <span>View Submission</span>
                        <ChevronRight size={13} />
                      </button>

                      {isPending ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setApproveModalSub(sub);
                              setApproveComment("");
                            }}
                            className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition cursor-pointer"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectModalSub(sub);
                              setRejectComment("");
                            }}
                            className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <span className="text-[11px] font-black uppercase tracking-wide">
                            {isApproved ? (
                              <span className="text-emerald-700 inline-flex items-center gap-1">
                                <CheckCircle2 size={13} /> APPROVED
                              </span>
                            ) : (
                              <span className="text-rose-700 inline-flex items-center gap-1">
                                <AlertTriangle size={13} /> REJECTED
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => setChangeDecisionModalSub(sub)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer border border-slate-200/80 shadow-xs"
                          >
                            <RotateCcw size={12} className="text-slate-500" />
                            <span>Change Decision</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. OPEN DOCUMENT EXPERIENCE MODAL */}
      {/* ========================================================================= */}
      {openDocModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-5 animate-scale-up">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-accent block">
                  REVIEW DOCUMENT
                </span>
                <h3 className="text-base font-black text-slate-900 mt-0.5">
                  OPEN DOCUMENT
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setOpenDocModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-1">
              <p className="font-bold text-slate-800 truncate">
                {openDocModal.doc.name}
              </p>
              <p>How would you like to open this document?</p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => handleConfirmOpenDoc("browser")}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-white shadow-md transition cursor-pointer"
              >
                <span>🌐 Open in Browser</span>
              </button>

              <button
                type="button"
                onClick={() => handleConfirmOpenDoc("word")}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-black bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 transition cursor-pointer"
              >
                <span>📝 Open in Microsoft Word</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={alwaysUsePreference}
                  onChange={(e) => setAlwaysUsePreference(e.target.checked)}
                  className="rounded border-slate-300 text-accent focus:ring-accent w-4 h-4 cursor-pointer"
                />
                <span>Always use this option for Word documents</span>
              </label>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setOpenDocModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. APPROVE CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {approveModalSub && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-5 animate-scale-up">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    APPROVE SUBMISSION
                  </h3>
                  <span className="text-[11px] font-mono font-bold text-slate-500">
                    {approveModalSub.teamId} · {approveModalSub.teamName}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setApproveModalSub(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to approve this submission? The student team
              will be notified in their portal.
            </p>

            <div className="space-y-1.5">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                Comment
              </label>
              <textarea
                rows={3}
                value={approveComment}
                onChange={(e) => setApproveComment(e.target.value)}
                placeholder="Add a comment or guidance for the team..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:bg-white focus:border-emerald-500 outline-none transition"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setApproveModalSub(null)}
                disabled={isSubmittingApprove}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApprove}
                disabled={isSubmittingApprove}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmittingApprove ? "Approving..." : "Confirm Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. REJECT CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {rejectModalSub && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-5 animate-scale-up">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-700">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    REJECT SUBMISSION
                  </h3>
                  <span className="text-[11px] font-mono font-bold text-slate-500">
                    {rejectModalSub.teamId} · {rejectModalSub.teamName}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRejectModalSub(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to reject this submission? The team will see
              this status and any feedback in their portal.
            </p>

            <div className="space-y-1.5">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                Comment
              </label>
              <textarea
                rows={3}
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="Add a comment or guidance for the team..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:bg-white focus:border-rose-500 outline-none transition"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRejectModalSub(null)}
                disabled={isSubmittingReject}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isSubmittingReject}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-md hover:shadow transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmittingReject ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. CHANGE DECISION MODAL */}
      {/* ========================================================================= */}
      {changeDecisionModalSub && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-decision-title"
        >
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-5 animate-scale-up text-left">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                  <RotateCcw size={18} />
                </div>
                <div className="min-w-0">
                  <h3 id="change-decision-title" className="text-base font-black text-slate-900 uppercase tracking-wide truncate">
                    CHANGE SUBMISSION DECISION
                  </h3>
                  <span className="text-[11px] font-mono font-bold text-slate-500 truncate block">
                    {changeDecisionModalSub.teamId} · {changeDecisionModalSub.teamName}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChangeDecisionModalSub(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer shrink-0"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">
                This submission is currently{" "}
                <span
                  className={`font-black uppercase px-2 py-0.5 rounded-md ${
                    changeDecisionModalSub.status === "APPROVED"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {changeDecisionModalSub.status}
                </span>
                .
              </p>
              <p className="text-slate-600">
                What would you like to do?
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setChangeDecisionModalSub(null)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setReturnToPendingModalSub(changeDecisionModalSub);
                  setChangeDecisionModalSub(null);
                  setPendingComment("");
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-black bg-amber-600 hover:bg-amber-700 text-white shadow-md hover:shadow transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RotateCcw size={14} />
                <span>↩ Return to Pending Review</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. RETURN TO PENDING CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {returnToPendingModalSub && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="return-pending-title"
        >
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-5 animate-scale-up text-left">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                  <RotateCcw size={18} />
                </div>
                <div className="min-w-0">
                  <h3 id="return-pending-title" className="text-base font-black text-slate-900 uppercase tracking-wide truncate">
                    RETURN TO PENDING
                  </h3>
                  <span className="text-[11px] font-mono font-bold text-slate-500 truncate block">
                    {returnToPendingModalSub.teamId} · {returnToPendingModalSub.teamName}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReturnToPendingModalSub(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer shrink-0"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-1 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">
                Are you sure you want to return this submission to Pending Review?
              </p>
              <p className="text-slate-500">
                The submission will become available for review again.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                Comment
              </label>
              <textarea
                rows={3}
                value={pendingComment}
                onChange={(e) => setPendingComment(e.target.value)}
                placeholder="Add a comment or guidance for the team..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:bg-white focus:border-amber-500 outline-none transition"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReturnToPendingModalSub(null)}
                disabled={isSubmittingPending}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReturnToPending}
                disabled={isSubmittingPending}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-black bg-amber-600 hover:bg-amber-700 text-white shadow-md hover:shadow transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isSubmittingPending ? "Returning..." : "Return to Pending"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 10. ERROR NOTIFICATION MODAL (In-app replacement for browser alert) */}
      {/* ========================================================================= */}
      {errorModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4 text-left animate-scale-up">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-rose-600 block">
                  ACTION FAILED
                </span>
                <h3 className="text-base font-black text-slate-900">
                  {errorModal.title}
                </h3>
              </div>
            </div>
            <p className="text-xs text-slate-600 bg-rose-50/70 p-3.5 rounded-xl border border-rose-100 font-medium leading-relaxed whitespace-pre-line">
              {errorModal.message}
            </p>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setErrorModal(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
