import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Lightbulb,
  Users,
  AlertCircle,
  Download,
  Upload,
  FileText,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Edit3,
  X,
  CheckCircle2,
} from "lucide-react";
import MechanicalLoader from "./MechanicalLoader";
import IpTypeFinder from "./IpTypeFinder";
import { supabase } from "../supabaseClient";
import {
  getSessionState,
  saveSessionState,
} from "../utils/sessionNavigationState";

const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000")
  .trim()
  .replace(/\/+$/, "");
const API_BASE_URL = rawApiUrl.endsWith("/api")
  ? rawApiUrl.slice(0, -4)
  : rawApiUrl;

const TOAST_DURATION = 6500; // ~6.5 seconds centralized auto-dismiss (5-10s range)

const OFFICIAL_DOMAINS = [
  "Smart Manufacturing & Industry 4.0",
  "Robotics & Intelligent Automation",
  "AI & Machine Learning",
  "IoT & Smart Systems",
  "Electric Mobility & Energy",
  "Sustainable & Green Technology",
  "Healthcare & Medical Devices",
  "Agritech & Food Innovation",
  "Defence & Aerospace",
  "Smart Cities & Infrastructure",
];

const getStorageKey = (email, regId) => {
  const cleanEmail = (email || "anonymous").toLowerCase().trim();
  const cleanReg = (regId || "default").trim();
  return `ipl2026_submission_preferences_${cleanEmail}_${cleanReg}`;
};

const savePreferences = (email, regId, category, patentType) => {
  if (!regId) return;
  const key = getStorageKey(email, regId);
  try {
    localStorage.setItem(key, JSON.stringify({ category, patentType }));
  } catch (e) {
    console.warn(
      "[MySubmissions] Failed to save preferences to localStorage",
      e,
    );
  }
};

const loadPreferences = (email, regId) => {
  if (!regId) return null;
  const key = getStorageKey(email, regId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      category: ["Hardware", "Software"].includes(parsed?.category)
        ? parsed.category
        : "",
      patentType: ["Design Patent", "Utility Patent"].includes(
        parsed?.patentType,
      )
        ? parsed.patentType
        : "",
    };
  } catch (e) {
    return null;
  }
};

function normalizeMentorDepartment(val) {
  if (!val) return "";
  const s = val.trim().toLowerCase().replace(/\s+/g, " ");

  // 1. Check AIML
  if (
    s.includes("aiml") ||
    s.includes("machine learning") ||
    s.includes("machine language") ||
    s.includes("ai&ml") ||
    s.includes("ai & ml") ||
    s.includes("ai/ml") ||
    s.includes("ai and ml")
  ) {
    return "Artificial Intelligence and Machine Learning";
  }

  // 2. Check AIDS
  if (
    s.includes("aids") ||
    s.includes("data science") ||
    s.includes("ai&ds") ||
    s.includes("ai & ds") ||
    s.includes("ai/ds") ||
    s.includes("ai and ds")
  ) {
    return "Artificial Intelligence and Data Science";
  }

  // 3. Check CSBS
  if (s.includes("csbs") || s.includes("business system")) {
    return "Computer Science and Business System";
  }

  // 4. Check Cyber Security
  if (s.includes("cyber security") || s.includes("cybersecurity")) {
    return "Cyber Security";
  }

  // 5. Check CCE
  if (
    s.includes("cce") ||
    s.includes("computer and communication") ||
    s.includes("computer & communication")
  ) {
    return "Computer and Communication Engineering";
  }

  // 6. Check ECE
  if (
    s.includes("ece") ||
    s.includes("electronics and communication") ||
    s.includes("electronics & communication") ||
    s.includes("electrical and communication")
  ) {
    return "Electronics and Communication Engineering";
  }

  // 7. Check EEE
  if (
    s.includes("eee") ||
    s.includes("electrical and electronics") ||
    s.includes("electrical and electronic") ||
    s.includes("electrical & electronics") ||
    s.includes("electrical & electronic")
  ) {
    return "Electrical and Electronics Engineering";
  }

  // 8. Check CSE
  if (
    s.includes("cse") ||
    s.includes("computer science") ||
    s.includes("computer scinece") ||
    s.includes("computer and science")
  ) {
    return "Computer Science and Engineering";
  }

  // 9. Check IT
  if (s.includes("information technology") || /\bit\b/.test(s)) {
    return "Information Technology";
  }

  // 10. Check Mechanical
  if (s.includes("mech") || s.includes("mechanical")) {
    return "Mechanical Engineering";
  }

  return val;
}

export default function MySubmissionsPage({
  onBackToHome,
  selectedPhase = "my_submissions",
  setSelectedPhase,
  session: initialSession,
  user: initialUser,
}) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [phasesList, setPhasesList] = useState([]);

  const [phase1Active, setPhase1Active] = useState(false);
  const [phase1Deadline, setPhase1Deadline] = useState(null);
  const [activeTemplates, setActiveTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState(false);
  const [teamSubmissions, setTeamSubmissions] = useState([]);

  const [uploadingDocId, setUploadingDocId] = useState(null);
  const [uploadingFileInfo, setUploadingFileInfo] = useState(null);
  const fileInputRef = useRef(null);
  const uploadingTemplateRef = useRef(null);
  const [downloadingTemplateDocType, setDownloadingTemplateDocType] =
    useState(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(() => {
    try {
      const savedIndex = sessionStorage.getItem(
        "ipl2026_submissions_page_index",
      );
      return savedIndex !== null
        ? Number(savedIndex)
        : getSessionState()?.teamIndex || 0;
    } catch (e) {
      return 0;
    }
  });

  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedPatentType, setSelectedPatentType] = useState("");
  const [invalidFileModal, setInvalidFileModal] = useState(null);

  // Toast Notification State
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editProjectTitle, setEditProjectTitle] = useState("");
  const [editProblemArea, setEditProblemArea] = useState("");
  const [editProposedSolution, setEditProposedSolution] = useState("");
  const [editExpectedImpact, setEditExpectedImpact] = useState("");
  const [editInnovationDomain, setEditInnovationDomain] = useState("");
  const [editSdgGoals, setEditSdgGoals] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const showToast = useCallback((notification) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    const normalized =
      typeof notification === "string"
        ? { type: "error", title: "Error", message: notification }
        : {
            type: notification.type || "error",
            title:
              notification.title ||
              (notification.type === "success"
                ? "Success"
                : notification.type === "warning"
                ? "Notice"
                : "Error"),
            message: notification.message || "An unexpected error occurred.",
          };
    setToast({ ...normalized, id: Date.now() });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, TOAST_DURATION);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast(null);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  // Real-time listener for Admin Phase Timer updates
  useEffect(() => {
    const phasesChannel = supabase
      .channel("my-submissions-realtime-phases")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "phases" },
        async () => {
          try {
            const { data: phasesData, error: phasesErr } = await supabase
              .from("phases")
              .select("*")
              .order("phase_number", { ascending: true });
            if (!phasesErr && phasesData) {
              setPhasesList(phasesData);
              const p1 = phasesData.find((p) => p.phase_number === 1);
              setPhase1Active(p1?.timer_status === "running");
              setPhase1Deadline(p1?.scheduled_end_at || null);
            }
          } catch (e) {
            console.warn("[MySubmissions] Realtime phase update note:", e);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(phasesChannel);
    };
  }, []);

  const getToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || initialSession?.access_token || null;
  };

  const handleSignOutAndReload = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // ignore
    }
    window.location.reload();
  };

  useEffect(() => {
    setIsEditing(false);
    try {
      sessionStorage.setItem(
        "ipl2026_submissions_page_index",
        String(currentPageIndex),
      );
      saveSessionState({ teamIndex: currentPageIndex });
    } catch (e) {}
  }, [currentPageIndex]);

  const startEditing = () => {
    if (!currentPage) return;
    const team = currentPage.team;
    const idea = currentPage.idea;

    setEditProjectTitle(idea ? idea.product_title : team.projectTitle || "");
    setEditInnovationDomain(
      idea ? idea.innovation_domain : team.innovationDomain || "",
    );
    setEditProblemArea(idea ? idea.problem_area : team.problemArea || "");
    setEditProposedSolution(
      idea ? idea.proposed_solution : team.proposedSolution || "",
    );
    setEditExpectedImpact(
      idea ? idea.expected_impact : team.expectedImpact || "",
    );
    setEditSdgGoals(team.sdgGoals || []);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleToggleSdg = (sdgNum) => {
    setEditSdgGoals((prev) => {
      if (prev.includes(sdgNum)) {
        return prev.filter((n) => n !== sdgNum);
      } else {
        if (prev.length >= 3) return prev;
        return [...prev, sdgNum].sort((a, b) => a - b);
      }
    });
  };

  const saveProjectDetails = async () => {
    if (!editProjectTitle.trim()) {
      showToast({
        type: "error",
        title: "Validation Error",
        message: "Project title cannot be empty.",
      });
      return;
    }
    if (!editProblemArea.trim()) {
      showToast({
        type: "error",
        title: "Validation Error",
        message: "Problem area cannot be empty.",
      });
      return;
    }
    if (!editProposedSolution.trim()) {
      showToast({
        type: "error",
        title: "Validation Error",
        message: "Proposed solution cannot be empty.",
      });
      return;
    }

    setIsSaving(true);

    try {
      const token = await getToken();
      if (!token)
        throw new Error("Authentication session expired. Please log in again.");

      const regId = currentPage.team.registrationId;

      const response = await fetch(
        `${API_BASE_URL}/api/registrations/${regId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            projectTitle: editProjectTitle,
            problemArea: editProblemArea,
            proposedSolution: editProposedSolution,
            expectedImpact: editExpectedImpact,
            innovationDomain: editInnovationDomain,
            sdgGoals: editSdgGoals,
          }),
        },
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Unable to update team details. Please try again.",
        );
      }

      showToast({
        type: "success",
        title: "Changes Saved",
        message: "Team details updated successfully.",
      });
      setIsEditing(false);

      await fetchSubmissions();
    } catch (err) {
      showToast({
        type: "error",
        title: "Save Failed",
        message: err.message || "Unable to update team details. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveChanges = (e) => {
    if (e) e.preventDefault();
    saveProjectDetails();
  };

  useEffect(() => {
    fetchSubmissions(true);
  }, [initialUser?.id]);

  const fetchSubmissions = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setAuthExpired(false);
    try {
      const token = await getToken();
      if (!token) {
        showToast({
          type: "warning",
          title: "Authentication Required",
          message: "Authentication session not found. Please sign in.",
        });
        setAuthExpired(true);
        setSubmissions([]);
        setLoading(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUserEmail(session?.user?.email || initialUser?.email || "");

      const response = await fetch(`${API_BASE_URL}/api/my-submissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        showToast({
          type: "error",
          title: "Session Expired",
          message:
            "Invalid or expired authentication session. Please sign in again.",
        });
        setAuthExpired(true);
        setSubmissions([]);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(
          errJson.message ||
            `Unable to retrieve submissions (HTTP ${response.status}).`,
        );
      }

      const data = await response.json();
      if (data.success) {
        setSubmissions(data.submissions || []);
      } else {
        throw new Error(data.message || "Unable to retrieve submissions.");
      }

      // Fetch dynamic phase timers from the existing single source of truth
      try {
        const { data: phasesData, error: phasesErr } = await supabase
          .from("phases")
          .select("*")
          .order("phase_number", { ascending: true });
        if (phasesErr) throw phasesErr;
        setPhasesList(phasesData || []);

        const phase1Config = phasesData?.find((p) => p.phase_number === 1);
        setPhase1Active(phase1Config?.timer_status === "running");
        setPhase1Deadline(phase1Config?.scheduled_end_at || null);
      } catch (pErr) {
        console.warn("[MySubmissions] Could not load phase timer data:", pErr);
        showToast({
          type: "error",
          title: "Timer Notice",
          message: "Unable to load phase deadlines. Please refresh and try again.",
        });
      }
    } catch (err) {
      console.error("[MySubmissions] Error fetching submissions:", err);
      showToast({
        type: "error",
        title: "Error Loading Submissions",
        message: err.message || "Unable to load your submissions. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async (patentType = selectedPatentType) => {
    setTemplatesLoading(true);
    setTemplatesError(false);
    try {
      const param = patentType
        ? `?patentType=${encodeURIComponent(patentType)}`
        : "";
      const templatesRes = await fetch(
        `${API_BASE_URL}/api/patents/templates${param}`,
      );
      if (!templatesRes.ok) {
        throw new Error("Unable to load templates.");
      }
      const templatesData = await templatesRes.json();
      if (templatesData.success && Array.isArray(templatesData.templates)) {
        setActiveTemplates(templatesData.templates);
      } else {
        setActiveTemplates([]);
      }
    } catch (tmplErr) {
      console.warn("[MySubmissions] Failed to fetch templates:", tmplErr);
      setTemplatesError(true);
      showToast({
        type: "error",
        title: "Templates Error",
        message: "Unable to load required document templates. Please try again.",
      });
    } finally {
      setTemplatesLoading(false);
    }
  };

  const fetchTeamSubmissionsData = async (teamId, dept, cat, pt) => {
    if (!teamId) return;
    try {
      const url = `${API_BASE_URL}/api/patents/submissions?teamId=${encodeURIComponent(teamId)}&department=${encodeURIComponent(dept || "")}&category=${encodeURIComponent(cat)}&patentType=${encodeURIComponent(pt)}&phase=phase%201`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTeamSubmissions(data.submissions || []);
        }
      }
    } catch (e) {
      console.warn("[MySubmissions] Failed to fetch team submissions:", e);
    }
  };

  const pages = [];
  submissions.forEach((sub) => {
    if (!sub.ideas || sub.ideas.length === 0) {
      pages.push({ team: sub, idea: null });
    } else {
      sub.ideas.forEach((idea) => {
        pages.push({ team: sub, idea });
      });
    }
  });

  const totalPages = pages.length;
  const currentPage = totalPages > 0 ? pages[currentPageIndex] : null;
  const activeRegId = currentPage ? currentPage.team.registrationId : null;

  const rawDept =
    currentPage?.team?.members?.leader?.department ||
    currentPage?.team?.department ||
    currentPage?.team?.leaderDepartment ||
    "Mechanical Engineering";
  const activeDepartment = normalizeMentorDepartment(rawDept);

  // Restore user/team-specific preferences on mount or team switch
  useEffect(() => {
    if (!activeRegId) return;
    const saved = loadPreferences(userEmail, activeRegId);
    if (saved && (saved.category || saved.patentType)) {
      const cat = saved.category || "";
      let pt = saved.patentType || "";
      if (cat === "Software") {
        pt = "Utility Patent";
      }
      setSelectedCategory(cat);
      setSelectedPatentType(pt);
    } else {
      setSelectedCategory("");
      setSelectedPatentType("");
    }
  }, [activeRegId, userEmail]);

  const handleSelectCategory = (cat) => {
    if (selectedCategory === cat) {
      // Toggle off / Clear
      setSelectedCategory("");
      if (activeRegId) {
        savePreferences(userEmail, activeRegId, "", selectedPatentType);
      }
      return;
    }
    setSelectedCategory(cat);
    if (cat === "Software") {
      // Software submissions can ONLY use Utility Patent
      setSelectedPatentType("Utility Patent");
      if (activeRegId) {
        savePreferences(userEmail, activeRegId, "Software", "Utility Patent");
        fetchTemplates("Utility Patent");
        fetchTeamSubmissionsData(
          activeRegId,
          activeDepartment,
          "Software",
          "Utility Patent",
        );
      }
    } else {
      if (activeRegId) {
        savePreferences(userEmail, activeRegId, cat, selectedPatentType);
        if (selectedPatentType) {
          fetchTeamSubmissionsData(
            activeRegId,
            activeDepartment,
            cat,
            selectedPatentType,
          );
        }
      }
    }
  };

  const handleClearCategory = () => {
    setSelectedCategory("");
    if (activeRegId) {
      savePreferences(userEmail, activeRegId, "", selectedPatentType);
    }
  };

  const handleSelectPatentType = (pt) => {
    if (selectedPatentType === pt) {
      // Toggle off / Clear
      setSelectedPatentType("");
      setActiveTemplates([]);
      if (activeRegId) {
        savePreferences(userEmail, activeRegId, selectedCategory, "");
      }
      return;
    }
    // Prevent selecting Design Patent when Software is active
    if (selectedCategory === "Software" && pt === "Design Patent") {
      showToast({
        type: "warning",
        title: "Category Restriction",
        message: "Design Patent is available only for Hardware submissions.",
      });
      return;
    }
    setSelectedPatentType(pt);
    if (activeRegId) {
      savePreferences(userEmail, activeRegId, selectedCategory, pt);
      fetchTemplates(pt);
      fetchTeamSubmissionsData(
        activeRegId,
        activeDepartment,
        selectedCategory,
        pt,
      );
    }
  };

  const handleClearPatentType = () => {
    setSelectedPatentType("");
    setActiveTemplates([]);
    if (activeRegId) {
      savePreferences(userEmail, activeRegId, selectedCategory, "");
    }
  };

  useEffect(() => {
    if (selectedPatentType) {
      fetchTemplates(selectedPatentType);
    } else {
      setActiveTemplates([]);
    }
  }, [selectedPatentType]);

  useEffect(() => {
    if (activeRegId && (selectedCategory || selectedPatentType)) {
      fetchTeamSubmissionsData(
        activeRegId,
        activeDepartment,
        selectedCategory,
        selectedPatentType,
      );
    }
  }, [activeRegId, activeDepartment, selectedCategory, selectedPatentType]);

  const handleDownloadTemplate = async (templateId, filename) => {
    setDownloadingTemplateDocType(templateId);
    try {
      const token = await getToken();
      const response = await fetch(
        `${API_BASE_URL}/api/patents/templates/${templateId}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!response.ok) throw new Error("Unable to download template.");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "template.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showToast({
        type: "error",
        title: "Download Failed",
        message: err.message || "Failed to download template. Please try again.",
      });
    } finally {
      setDownloadingTemplateDocType(null);
    }
  };

  const handleUploadClick = (template) => {
    if (!selectedCategory || !selectedPatentType) {
      showToast({
        type: "warning",
        title: "Selection Required",
        message: "Please select both Category (Hardware/Software) and Patent Type (Utility/Design) before uploading.",
      });
      return;
    }

    if (!template) {
      showToast({
        type: "error",
        title: "Upload Blocked",
        message: "Template information is missing. Please try again.",
      });
      return;
    }

    uploadingTemplateRef.current = template;
    try {
      sessionStorage.setItem("ipl_uploading_template", JSON.stringify(template));
      if (activeRegId) {
        sessionStorage.setItem("ipl_uploading_teamId", activeRegId);
      }
    } catch (e) {}

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = (e) => {
    const files = e?.target?.files || (fileInputRef.current && fileInputRef.current.files);
    const file = files && files[0];

    if (!file) {
      return;
    }

    // Reset input value AFTER capturing file safely so choosing the same file next time triggers onChange
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    let template = uploadingTemplateRef.current;
    if (!template) {
      try {
        const saved = sessionStorage.getItem("ipl_uploading_template");
        if (saved) template = JSON.parse(saved);
      } catch (err) {}
    }
    if (!template && activeTemplates.length === 1) {
      template = activeTemplates[0];
    }

    if (!template) {
      showToast({
        type: "error",
        title: "Upload Blocked",
        message: "Template information unavailable. Please select a template and try again.",
      });
      return;
    }

    handleUploadFile(file, template);
  };

  const handleUploadFile = async (file, template) => {
    if (!file || !template) return;

    // Client-side Word format validation for instant feedback (.doc or .docx)
    const fileName = (file.name || "").trim();
    const isWordExt = /\.(docx?)$/i.test(fileName);
    const isWordMime =
      file.type === "application/msword" ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const isWordDoc = isWordExt || isWordMime;

    if (!isWordDoc) {
      // Primary UI feedback: Dedicated Invalid File Format modal (no duplicate toast)
      setInvalidFileModal({ fileName: fileName || "Selected file" });
      return;
    }

    const teamId = activeRegId || sessionStorage.getItem("ipl_uploading_teamId");
    if (!teamId) {
      showToast({
        type: "error",
        title: "Upload Blocked",
        message: "Team information unavailable. Please refresh and try again.",
      });
      return;
    }

    // Ensure Software strictly uses Utility Patent
    let finalPatentType = selectedPatentType;
    if (selectedCategory === "Software") {
      finalPatentType = "Utility Patent";
    }

    if (!selectedCategory || !finalPatentType) {
      showToast({
        type: "warning",
        title: "Selection Required",
        message: "Please select both Category and Patent Type before uploading.",
      });
      return;
    }

    setUploadingDocId(template.id);
    setUploadingFileInfo({
      templateId: template.id,
      name: fileName,
      size: file.size,
    });

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Your session has expired. Please sign in again to continue.");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("phase", "phase 1");
      formData.append("department", activeDepartment);
      formData.append("category", selectedCategory);
      formData.append("patentType", finalPatentType);
      formData.append("teamId", teamId);
      formData.append("templateId", template.id);

      const response = await fetch(`${API_BASE_URL}/api/patents/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const contentType = response.headers.get("content-type") || "";
      let result = null;
      if (contentType.includes("application/json")) {
        result = await response.json();
      } else {
        throw new Error(`Server returned unexpected response (status ${response.status})`);
      }

      if (!response.ok || !result.success) {
        if (result.code === "INVALID_FILE_FORMAT") {
          setInvalidFileModal({ fileName: file.name });
          return;
        }
        throw new Error(result.message || "File upload failed.");
      }

      const isReplacement = result.data?.isReplacement || false;
      showToast({
        type: "success",
        title: isReplacement ? "Document Updated" : "Document Uploaded",
        message: isReplacement
          ? `${file.name} replaced the previous version successfully.`
          : `${file.name} was uploaded and linked to ${teamId} successfully.`,
      });

      await fetchTeamSubmissionsData(
        teamId,
        activeDepartment,
        selectedCategory,
        finalPatentType,
      );
    } catch (err) {
      showToast({
        type: "error",
        title: "Upload Failed",
        message: err.message || "An unexpected error occurred while uploading. Please try again.",
      });
    } finally {
      setUploadingDocId(null);
      setUploadingFileInfo(null);
    }
  };

  useEffect(() => {
    const inputEl = fileInputRef.current;
    if (!inputEl) return;

    const onNativeChange = (e) => {
      handleFileInputChange(e);
    };

    inputEl.addEventListener("change", onNativeChange);
    inputEl.addEventListener("input", onNativeChange);

    return () => {
      inputEl.removeEventListener("change", onNativeChange);
      inputEl.removeEventListener("input", onNativeChange);
    };
  }, [activeTemplates, selectedCategory, selectedPatentType, activeRegId, activeDepartment]);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "Not Scheduled";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Not Scheduled";
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const pad = (n) => String(n).padStart(2, "0");
    const day = pad(d.getDate());
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = pad(d.getMinutes());
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${day} ${month} ${year} • ${pad(hours)}:${minutes} ${ampm}`;
  };

  const renderMemberRow = (label, member) => {
    if (!member || !member.name) return null;
    const isYou =
      member.email &&
      member.email.trim().toLowerCase() === userEmail.trim().toLowerCase();
    return (
      <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl flex flex-col gap-2.5 transition hover:border-slate-300 w-full min-w-0">
        <div className="flex justify-between items-center border-b border-slate-150 pb-1.5 gap-2">
          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest leading-none">
            {label}
          </span>
          {isYou && (
            <span className="bg-amber-50 text-accent text-[9px] font-black px-2 py-0.5 rounded border border-amber-200 uppercase select-none shrink-0 leading-none">
              You
            </span>
          )}
        </div>
        <div className="space-y-1">
          <span className="text-sm font-extrabold text-slate-900 block break-words select-text">
            {member.name}
          </span>
          <span className="text-xs text-slate-600 font-medium block break-all select-text">
            {member.email}
          </span>
        </div>
      </div>
    );
  };

  const phase1Config = phasesList.find((p) => p.phase_number === 1);
  const phase2Config = phasesList.find((p) => p.phase_number === 2);
  const phase3Config = phasesList.find((p) => p.phase_number === 3);

  return (
    <div className="min-h-screen bg-slate-50 pt-28 pb-10 px-4 md:px-6 lg:px-8 relative">
      {/* Temporary Toast Popup Notification (Auto-dismisses in 6.5s, portal directly onto document.body) */}
      {toast && createPortal(
        <aside
          role="alert"
          aria-live="assertive"
          className="fixed top-20 left-4 right-4 sm:left-auto sm:right-6 z-[99999] max-w-sm sm:max-w-md w-[calc(100vw-2rem)] sm:w-auto animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-auto shadow-2xl rounded-2xl bg-white border border-slate-200 overflow-hidden ring-1 ring-slate-900/10"
        >
          <div className="flex items-start gap-3 p-4">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${
                toast.type === "success"
                  ? "bg-emerald-50 text-emerald-600 border border-emerald-200/80"
                  : toast.type === "warning"
                  ? "bg-amber-50 text-amber-600 border border-amber-200/80"
                  : "bg-rose-50 text-rose-600 border border-rose-200/80"
              }`}
            >
              {toast.type === "success" ? (
                <CheckCircle2 size={18} />
              ) : toast.type === "warning" ? (
                <AlertTriangle size={18} />
              ) : (
                <AlertCircle size={18} />
              )}
            </div>

            <div className="min-w-0 flex-1 pr-1">
              <h4 className="text-xs font-black uppercase tracking-wider text-[#0B1B3A] font-heading">
                {toast.title}
              </h4>
              <p className="text-xs sm:text-sm font-semibold text-slate-700 leading-snug mt-0.5 break-words">
                {toast.message}
              </p>
            </div>

            <button
              type="button"
              onClick={dismissToast}
              aria-label="Close notification"
              className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0 mt-0.5"
            >
              <X size={14} />
            </button>
          </div>

          {/* Progress Bar indicating auto-dismiss timeline */}
          <div className="h-1 w-full bg-slate-100 overflow-hidden">
            <div
              key={toast.id}
              className={`h-full animate-toast-progress ${
                toast.type === "success"
                  ? "bg-emerald-500"
                  : toast.type === "warning"
                  ? "bg-amber-500"
                  : "bg-rose-500"
              }`}
              style={{ animationDuration: `${TOAST_DURATION}ms` }}
            />
          </div>
        </aside>,
        document.body
      )}

      {/* Permanent, never-unmounted hidden file input with Word doc preference */}
      <input
        ref={fileInputRef}
        type="file"
        tabIndex={-1}
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-9999px",
          left: "-9999px",
          width: "1px",
          height: "1px",
          opacity: 0.01,
          pointerEvents: "none",
        }}
        accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleFileInputChange}
        onInput={handleFileInputChange}
      />

      <div className="mx-auto max-w-7xl">
        {/* Header bar */}
        <div className="mb-6 flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">
            Submissions
          </h1>
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-xs"
          >
            ← Back to Home
          </button>
        </div>

        {/* Dedicated Team Selector Card */}
        {totalPages === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6 text-center text-slate-500">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Team
            </p>
            <p className="text-sm font-semibold text-slate-700 mt-1">
              No team enrolled
            </p>
          </div>
        ) : currentPage ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 mb-6">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                  Team
                </p>
                <h2 className="text-base sm:text-lg font-black text-slate-900 truncate mt-1">
                  {currentPage.team.teamName}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="font-mono text-xs font-bold text-accent bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded">
                    {activeRegId}
                  </span>
                  <span className="text-xs text-slate-500 font-semibold">
                    • {activeDepartment}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-100 px-1.5 py-0.5 rounded">
                    {currentPage.team.userRole}
                  </span>
                </div>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5 shrink-0 bg-slate-50 p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPageIndex((prev) =>
                        prev === 0 ? totalPages - 1 : prev - 1,
                      )
                    }
                    className="p-2 rounded-lg text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-xs transition cursor-pointer"
                    title="Previous Team"
                    aria-label="Previous Team"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <span className="text-[11px] font-mono font-bold text-slate-500 px-1.5 select-none">
                    {currentPageIndex + 1}/{totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPageIndex((prev) =>
                        prev === totalPages - 1 ? 0 : prev + 1,
                      )
                    }
                    className="p-2 rounded-lg text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-xs transition cursor-pointer"
                    title="Next Team"
                    aria-label="Next Team"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Desktop / Tablet Navigation (md+) - Clean Horizontal Bar with Active Underline */}
        <div className="hidden md:flex border-b border-slate-200 mb-6 gap-8 text-sm font-black tracking-wider">
          {[
            { id: "my_submissions", label: "MY SUBMISSIONS" },
            { id: "phase_1", label: "PHASE 1" },
            { id: "phase_2", label: "PHASE 2" },
            { id: "phase_3", label: "PHASE 3" },
          ].map((tab) => {
            const isActive = selectedPhase === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedPhase(tab.id)}
                className={`pb-3 border-b-2 transition-all cursor-pointer font-black text-xs sm:text-sm tracking-wider uppercase ${
                  isActive
                    ? "border-accent text-accent"
                    : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Mobile Navigation (< md) - Compact Dedicated Segmented Control */}
        <div className="flex md:hidden bg-slate-200/80 p-1 rounded-xl border border-slate-300/70 mb-5">
          <nav
            className="grid grid-cols-[1.35fr_1fr_1fr_1fr] sm:grid-cols-4 w-full gap-1"
            aria-label="Phase navigation"
          >
            {[
              {
                id: "my_submissions",
                label: "SUBMISSION",
                shortLabel: "SUBMISSION",
              },
              { id: "phase_1", label: "PHASE 1", shortLabel: "P1" },
              { id: "phase_2", label: "PHASE 2", shortLabel: "P2" },
              { id: "phase_3", label: "PHASE 3", shortLabel: "P3" },
            ].map((tab) => {
              const isActive = selectedPhase === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedPhase(tab.id)}
                  className={`py-2 px-1 rounded-lg text-center font-black transition-all cursor-pointer select-none text-[10px] xs:text-[11px] sm:text-xs tracking-tight truncate ${
                    isActive
                      ? "bg-accent text-white shadow-xs"
                      : "text-slate-700 hover:text-slate-900 hover:bg-white/50"
                  }`}
                >
                  <span>{tab.shortLabel}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Workspaces Wrapper */}
        <div>
          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-20 flex flex-col items-center justify-center gap-3 text-slate-500">
              <MechanicalLoader size={48} className="text-accent" />
              <p className="text-sm font-black uppercase tracking-wider">
                Loading details...
              </p>
            </div>
          ) : authExpired && totalPages === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 flex flex-col items-center text-center gap-3 text-slate-700">
              <AlertCircle size={36} className="text-amber-500" />
              <p className="text-base font-semibold">Authentication Session Expired</p>
              <button
                type="button"
                onClick={handleSignOutAndReload}
                className="mt-2 rounded-xl bg-accent px-5 py-2.5 text-xs font-bold text-white hover:bg-amber-600 transition cursor-pointer shadow-xs"
              >
                Sign In Again
              </button>
            </div>
          ) : selectedPhase === "my_submissions" ? (
            /* ==================== MY SUBMISSIONS PAGE ==================== */
            <div className="space-y-6">
              {totalPages === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 flex flex-col items-center text-center gap-4 text-slate-400">
                  <Users size={48} className="text-slate-300" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      No team submissions found.
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      You are not listed in any team registrations.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchSubmissions}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white transition cursor-pointer"
                  >
                    Refresh
                  </button>
                </div>
              ) : (
                currentPage && (
                  <div className="space-y-6">
                    <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 items-start">
                      <div className="lg:col-span-2 space-y-6 flex flex-col min-w-0">
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
                            <div className="min-w-0">
                              <h2 className="text-xl font-black text-slate-900 truncate">
                                {currentPage.team.teamName}
                              </h2>
                              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                                Registration ID:{" "}
                                <span className="font-mono text-accent font-bold">
                                  {currentPage.team.registrationId}
                                </span>
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <span className="bg-blue-50 text-blue-700 text-xs font-black px-3 py-1 rounded-full border border-blue-100 uppercase tracking-wide select-none">
                                {currentPage.team.userRole}
                              </span>
                              {currentPage.team.userRole === "Team Leader" &&
                                !isEditing && (
                                  <button
                                    type="button"
                                    onClick={startEditing}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                                  >
                                    <Edit3 size={12} /> Edit Details
                                  </button>
                                )}
                            </div>
                          </div>
                          {isEditing ? (
                            <form
                              onSubmit={handleSaveChanges}
                              className="space-y-4"
                            >
                              <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                  Project Title *
                                </label>
                                <input
                                  type="text"
                                  value={editProjectTitle}
                                  onChange={(e) =>
                                    setEditProjectTitle(e.target.value)
                                  }
                                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-semibold text-slate-900 focus:bg-white focus:border-accent focus:ring-1 focus:ring-accent outline-none transition"
                                  placeholder="Enter project title"
                                  maxLength={300}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                  Innovation Domain *
                                </label>
                                <select
                                  value={editInnovationDomain}
                                  onChange={(e) =>
                                    setEditInnovationDomain(e.target.value)
                                  }
                                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-semibold text-slate-900 focus:bg-white focus:border-accent focus:ring-1 focus:ring-accent outline-none transition cursor-pointer"
                                >
                                  <option value="">
                                    Select Innovation Domain
                                  </option>
                                  {OFFICIAL_DOMAINS.map((d) => (
                                    <option key={d} value={d}>
                                      {d}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                  Problem Area *
                                </label>
                                <textarea
                                  rows={4}
                                  value={editProblemArea}
                                  onChange={(e) =>
                                    setEditProblemArea(e.target.value)
                                  }
                                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-medium text-slate-900 focus:bg-white focus:border-accent focus:ring-1 focus:ring-accent outline-none transition resize-y"
                                  placeholder="Describe the real-world problem..."
                                  maxLength={5000}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                  Proposed Solution *
                                </label>
                                <textarea
                                  rows={4}
                                  value={editProposedSolution}
                                  onChange={(e) =>
                                    setEditProposedSolution(e.target.value)
                                  }
                                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-medium text-slate-900 focus:bg-white focus:border-accent focus:ring-1 focus:ring-accent outline-none transition resize-y"
                                  placeholder="Describe your proposed innovative solution..."
                                  maxLength={5000}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                  Expected Impact *
                                </label>
                                <textarea
                                  rows={4}
                                  value={editExpectedImpact}
                                  onChange={(e) =>
                                    setEditExpectedImpact(e.target.value)
                                  }
                                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-medium text-slate-900 focus:bg-white focus:border-accent focus:ring-1 focus:ring-accent outline-none transition resize-y"
                                  placeholder="Describe the expected impact and beneficiaries..."
                                  maxLength={5000}
                                />
                              </div>
                              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                                <button
                                  type="button"
                                  onClick={cancelEditing}
                                  disabled={isSaving}
                                  className="px-5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  disabled={isSaving}
                                  className="px-6 py-2.5 rounded-xl bg-accent text-xs font-bold text-white shadow-md hover:bg-amber-600 transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
                                >
                                  {isSaving ? (
                                    <>
                                      <MechanicalLoader
                                        size={14}
                                        className="text-white"
                                      />{" "}
                                      Saving...
                                    </>
                                  ) : (
                                    "Save Changes"
                                  )}
                                </button>
                              </div>
                            </form>
                          ) : (
                            <div className="space-y-5">
                              <div>
                                <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                  Project Title
                                </h3>
                                <p className="text-base font-extrabold text-slate-900 leading-snug">
                                  {currentPage.idea
                                    ? currentPage.idea.product_title
                                    : currentPage.team.projectTitle || "N/A"}
                                </p>
                              </div>
                              <div>
                                <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                  Innovation Domain
                                </h3>
                                <p className="text-xs sm:text-sm font-bold text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-200 inline-block">
                                  {currentPage.idea
                                    ? currentPage.idea.innovation_domain
                                    : currentPage.team.innovationDomain ||
                                      "N/A"}
                                </p>
                              </div>
                              <div>
                                <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                  Problem Area
                                </h3>
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 text-sm text-slate-800 leading-relaxed whitespace-pre-line font-normal">
                                  {currentPage.idea
                                    ? currentPage.idea.problem_area
                                    : currentPage.team.problemArea || "N/A"}
                                </div>
                              </div>
                              <div>
                                <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                  Proposed Solution
                                </h3>
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 text-sm text-slate-800 leading-relaxed whitespace-pre-line font-normal">
                                  {currentPage.idea
                                    ? currentPage.idea.proposed_solution
                                    : currentPage.team.proposedSolution ||
                                      "N/A"}
                                </div>
                              </div>
                              <div>
                                <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                                  Expected Impact
                                </h3>
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 text-sm text-slate-800 leading-relaxed whitespace-pre-line font-normal">
                                  {currentPage.idea
                                    ? currentPage.idea.expected_impact
                                    : currentPage.team.expectedImpact || "N/A"}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-6">
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                          <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-2">
                            Faculty Mentor
                          </h3>
                          {currentPage.team.mentor &&
                          currentPage.team.mentor.name ? (
                            <div className="p-3.5 bg-slate-50 border border-slate-200/60 rounded-xl">
                              <span className="text-sm font-extrabold text-slate-900 block">
                                {currentPage.team.mentor.name}
                              </span>
                              {currentPage.team.mentor.department && (
                                <span className="text-xs text-slate-600 block font-semibold leading-tight break-words mt-0.5">
                                  {normalizeMentorDepartment(
                                    currentPage.team.mentor.department,
                                  )}
                                </span>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 italic">
                              No mentor assigned.
                            </p>
                          )}
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                          <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-2">
                            Team Members
                          </h3>
                          <div className="space-y-3">
                            {renderMemberRow(
                              "Team Leader",
                              currentPage.team.members?.leader,
                            )}
                            {renderMemberRow(
                              "Team Member 2",
                              currentPage.team.members?.member2,
                            )}
                            {renderMemberRow(
                              "Team Member 3",
                              currentPage.team.members?.member3,
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          ) : selectedPhase === "phase_1" ? (
            /* ==================== PHASE 1 WORKSTATION ==================== */
            totalPages === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 flex flex-col items-center text-center gap-4 text-slate-400">
                <Users size={48} className="text-slate-300" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    No team submissions found.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    You are not listed in any team registrations.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Step 1: Patent Classification Card */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
                    <div>
                      <span className="text-[10px] font-black text-accent uppercase tracking-widest block">
                        Phase 1 · Step 1
                      </span>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                        Patent Classification
                      </h3>
                    </div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                        <Calendar size={13} className="text-slate-400" />
                        <span>
                          Deadline:{" "}
                          <strong className="text-slate-800">
                            {formatDateTime(
                              phase1Config?.scheduled_end_at || phase1Deadline,
                            )}
                          </strong>
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-md border ${
                          phase1Active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}
                      >
                        {phase1Active ? "Submissions Open" : "Submissions Closed"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Category */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
                          Category *
                        </label>
                        {selectedCategory && (
                          <button
                            type="button"
                            onClick={handleClearCategory}
                            className="text-[10px] font-black text-slate-400 hover:text-red-500 uppercase tracking-wider transition cursor-pointer px-1 py-0.5 rounded hover:bg-slate-100"
                            title="Clear category selection"
                          >
                            ✕ Clear
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                        {["Hardware", "Software"].map((cat) => {
                          const isSelected = selectedCategory === cat;
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => handleSelectCategory(cat)}
                              className={`py-2 px-2 rounded-lg text-xs font-black transition-all cursor-pointer select-none min-h-[38px] ${
                                isSelected
                                  ? "bg-accent text-white shadow-xs"
                                  : "text-slate-700 hover:text-slate-900 hover:bg-slate-200/50"
                              }`}
                            >
                              {cat}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Patent Type */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
                          Patent Type *
                        </label>
                        {selectedPatentType && (
                          <button
                            type="button"
                            onClick={handleClearPatentType}
                            className="text-[10px] font-black text-slate-400 hover:text-red-500 uppercase tracking-wider transition cursor-pointer px-1 py-0.5 rounded hover:bg-slate-100"
                            title="Clear patent type selection"
                          >
                            ✕ Clear
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                        {["Design Patent", "Utility Patent"].map((pt) => {
                          const isSelected = selectedPatentType === pt;
                          const isDisabled =
                            selectedCategory === "Software" &&
                            pt === "Design Patent";
                          return (
                            <button
                              key={pt}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => handleSelectPatentType(pt)}
                              title={
                                isDisabled
                                  ? "Design Patent is available only for Hardware submissions."
                                  : ""
                              }
                              className={`py-2 px-1 rounded-lg text-xs font-black transition-all select-none min-h-[38px] truncate ${
                                isDisabled
                                  ? "opacity-40 cursor-not-allowed bg-transparent text-slate-400 select-none"
                                  : isSelected
                                    ? "bg-accent text-white shadow-xs cursor-pointer"
                                    : "text-slate-700 hover:text-slate-900 hover:bg-slate-200/50 cursor-pointer"
                              }`}
                            >
                              {pt}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Department */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                        Department
                      </label>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 h-[42px] text-xs font-bold text-slate-800 truncate flex items-center justify-between">
                        <span className="truncate">{activeDepartment}</span>
                        <span
                          className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 ml-2"
                          title="Authoritative Team Department"
                        ></span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* IP Type Finder Section */}
                <IpTypeFinder
                  selectedPatentType={selectedPatentType}
                  selectedCategory={selectedCategory}
                  onSelectPatentType={handleSelectPatentType}
                  onSelectCategory={handleSelectCategory}
                />

                {/* Step 2 & 3: Official Templates & Connected Document Submission Cards */}
                <div id="official-templates-section" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-black text-accent uppercase tracking-widest block leading-none">
                        Official Templates
                      </span>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide mt-0.5">
                        {selectedPatentType
                          ? `${selectedPatentType} Submissions`
                          : "Document Submissions"}
                      </h3>
                    </div>
                    {selectedPatentType &&
                      !templatesLoading &&
                      !templatesError && (
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 shrink-0">
                          {activeTemplates.length}{" "}
                          {activeTemplates.length === 1
                            ? "Document"
                            : "Documents"}{" "}
                          Required
                        </span>
                      )}
                  </div>

                  {!selectedPatentType ? (
                    <div className="p-12 flex flex-col items-center justify-center text-center gap-3 text-slate-400">
                      <Lightbulb size={36} className="text-amber-500" />
                      <p className="text-sm font-bold text-slate-800">
                        Select a Patent Type
                      </p>
                      <p className="text-xs text-slate-500 max-w-md">
                        Please select <strong>Design Patent</strong> or{" "}
                        <strong>Utility Patent</strong> above to view the
                        required templates.
                      </p>
                    </div>
                  ) : templatesLoading ? (
                    <div className="p-16 flex flex-col items-center justify-center text-center gap-3">
                      <MechanicalLoader size={48} className="text-accent" />
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                        Loading templates...
                      </p>
                    </div>
                  ) : templatesError ? (
                    <div className="p-12 flex flex-col items-center justify-center text-center gap-3">
                      <AlertCircle size={32} className="text-rose-500" />
                      <p className="text-xs font-bold text-slate-700">
                        Unable to load templates.
                      </p>
                      <button
                        type="button"
                        onClick={() => fetchTemplates(selectedPatentType)}
                        className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white transition cursor-pointer shadow-xs"
                      >
                        Try Again
                      </button>
                    </div>
                  ) : activeTemplates.length === 0 ? (
                    <div className="p-16 flex flex-col items-center justify-center text-center gap-3 text-slate-400">
                      <FileText size={40} className="text-slate-300" />
                      <p className="text-xs font-bold text-slate-600">
                        No templates available.
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Templates for {selectedPatentType} will be available
                        soon.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {activeTemplates.map((tmpl, idx) => {
                        const isUploading = uploadingDocId === tmpl.id;
                        const isDownloading =
                          downloadingTemplateDocType === tmpl.id;
                        const cleanTmpl = tmpl.name
                          .replace(/\.docx?$/i, "")
                          .trim();
                        const rawTmpl = tmpl.rawName
                          ? tmpl.rawName.replace(/\.docx?$/i, "").trim()
                          : cleanTmpl;
                        const normTmpl = cleanTmpl
                          .toLowerCase()
                          .replace(/[^a-z0-9]/g, "");
                        const submittedFile = teamSubmissions.find((s) => {
                          const cleanSub = s.name.toLowerCase();
                          const rawTmplLower = rawTmpl.toLowerCase();
                          const normTmplLower = normTmpl.toLowerCase();
                          const altTmplLower = rawTmpl
                            .replace(/\s+/g, "-")
                            .toLowerCase();
                          return (
                            cleanSub.includes(normTmplLower) ||
                            cleanSub.includes(altTmplLower) ||
                            cleanSub.includes(rawTmplLower)
                          );
                        });

                        return (
                          <div
                            key={tmpl.id}
                            className="p-5 border border-slate-200 rounded-2xl bg-slate-50/50 hover:bg-white hover:border-slate-300 transition-all space-y-4 shadow-2xs"
                          >
                            {/* Top row: Number, Document Name, Status Badge */}
                            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="flex h-7 w-7 items-center justify-center font-mono text-xs font-black text-accent bg-amber-50 border border-amber-200/80 rounded-lg shrink-0">
                                  {String(idx + 1).padStart(2, "0")}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <h4 className="font-black text-slate-900 text-sm sm:text-base leading-snug break-words">
                                    {tmpl.name}
                                  </h4>
                                  <span className="text-[11px] text-slate-400 font-medium block mt-0.5 truncate">
                                    Official Document Template •{" "}
                                    {tmpl.size
                                      ? `${(tmpl.size / 1024).toFixed(1)} KB`
                                      : "Word Document"}
                                  </span>
                                </div>
                              </div>

                              <div className="shrink-0 flex items-center">
                                {isUploading ? (
                                  <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] sm:text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-2xs animate-pulse">
                                    <MechanicalLoader
                                      size={12}
                                      className="text-amber-600 shrink-0"
                                    />
                                    Uploading...
                                  </span>
                                ) : submittedFile ? (
                                  <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] sm:text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-2xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                    Submitted
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 border border-slate-200 text-[10px] sm:text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-2xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"></span>
                                    Pending
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Uploading File Feedback Banner */}
                            {isUploading && uploadingFileInfo?.name && (
                              <div className="flex items-center gap-2 p-2.5 bg-amber-50/90 border border-amber-200 rounded-xl text-xs text-amber-900 font-semibold animate-in fade-in">
                                <MechanicalLoader
                                  size={14}
                                  className="text-amber-600 shrink-0"
                                />
                                <span className="truncate">
                                  Uploading file:{" "}
                                  <strong className="font-mono text-amber-950 font-bold">
                                    {uploadingFileInfo.name}
                                  </strong>
                                </span>
                              </div>
                            )}

                            {/* Action row: Download Template & Upload/Edit File */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {/* 1. Download Official Template */}
                              <button
                                type="button"
                                disabled={isDownloading || isUploading}
                                onClick={() =>
                                  handleDownloadTemplate(tmpl.id, tmpl.name)
                                }
                                className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 text-xs font-bold text-slate-800 hover:border-slate-300 transition cursor-pointer disabled:opacity-50 shadow-2xs w-full"
                              >
                                {isDownloading ? (
                                  <MechanicalLoader
                                    size={14}
                                    className="text-current shrink-0"
                                  />
                                ) : (
                                  <Download
                                    size={15}
                                    className="text-accent shrink-0"
                                  />
                                )}
                                <span>Download Template</span>
                              </button>

                              {/* 2. Upload / Edit Completed Document */}
                              {phase1Active ? (
                                <button
                                  type="button"
                                  disabled={isUploading}
                                  onClick={() => handleUploadClick(tmpl)}
                                  className={`inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl text-xs font-bold text-white transition cursor-pointer select-none shadow-xs w-full ${
                                    isUploading
                                      ? "opacity-80 cursor-wait pointer-events-none"
                                      : submittedFile
                                      ? "bg-slate-800 hover:bg-slate-900 active:bg-slate-950"
                                      : "bg-accent hover:bg-amber-600 active:bg-amber-700"
                                  }`}
                                >
                                  {isUploading ? (
                                    <>
                                      <MechanicalLoader
                                        size={14}
                                        className="text-white shrink-0"
                                      />
                                      <span>Uploading...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Upload size={15} className="shrink-0" />
                                      <span>
                                        {submittedFile
                                          ? "Edit / Replace File"
                                          : "Upload Document"}
                                      </span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span className="inline-flex items-center justify-center gap-1.5 h-11 px-4 text-xs font-bold text-red-600 bg-red-50 rounded-xl border border-red-100 w-full">
                                  <AlertTriangle
                                    size={14}
                                    className="shrink-0"
                                  />
                                  <span>Submissions Closed</span>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          ) : selectedPhase === "phase_2" ? (
            /* ==================== PHASE 2 PAGE ==================== */
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-[10px] font-black text-primary uppercase tracking-widest block leading-none mb-1">
                      Phase 2
                    </span>
                    <h2 className="text-lg font-black text-slate-900">
                      Product Prototyping & Validation
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      Prototyping development guidelines and testing phase
                      workspace.
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-md border ${
                      phase2Config?.timer_status === "running"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : phase2Config?.timer_status === "paused"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {phase2Config?.timer_status
                      ? phase2Config.timer_status.toUpperCase()
                      : "UPCOMING"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600 font-semibold pt-1">
                  <Calendar size={14} className="text-slate-400" />
                  <span>
                    Deadline:{" "}
                    <strong className="text-slate-800">
                      {formatDateTime(phase2Config?.scheduled_end_at)}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* ==================== PHASE 3 PAGE ==================== */
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-[10px] font-black text-primary uppercase tracking-widest block leading-none mb-1">
                      Phase 3
                    </span>
                    <h2 className="text-lg font-black text-slate-900">
                      Business Planning & Pitching
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      Final pitch deck templates and presentation gateway.
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-md border ${
                      phase3Config?.timer_status === "running"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : phase3Config?.timer_status === "paused"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {phase3Config?.timer_status
                      ? phase3Config.timer_status.toUpperCase()
                      : "UPCOMING"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600 font-semibold pt-1">
                  <Calendar size={14} className="text-slate-400" />
                  <span>
                    Deadline:{" "}
                    <strong className="text-slate-800">
                      {formatDateTime(phase3Config?.scheduled_end_at)}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invalid File Format Custom Popup Modal - rendered via Portal directly into document.body */}
      {invalidFileModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 block">
                  INVALID FILE FORMAT
                </span>
                <h3 className="text-base font-black text-slate-900">
                  Please Upload a Word File
                </h3>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-200/70">
              <p className="font-semibold text-slate-800">
                This document must be uploaded in Microsoft Word format.
              </p>
              <p className="text-[11px] text-slate-500">
                <strong className="text-slate-700">Accepted formats:</strong>{" "}
                <span className="font-mono font-bold text-slate-800">.doc</span>{" "}
                or{" "}
                <span className="font-mono font-bold text-slate-800">
                  .docx
                </span>
              </p>
              {invalidFileModal.fileName && (
                <div className="pt-1.5 border-t border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Your selected file:
                  </span>
                  <span className="font-mono font-bold text-rose-600 text-xs break-all block mt-0.5">
                    {invalidFileModal.fileName}
                  </span>
                </div>
              )}
              <p className="text-[11px] text-slate-500 pt-1">
                Please choose a Word document and try again.
              </p>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setInvalidFileModal(null)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white transition cursor-pointer shadow-xs"
              >
                Choose Another File
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
