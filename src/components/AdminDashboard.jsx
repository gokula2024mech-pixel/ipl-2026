import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  Menu,
  LogOut,
  RefreshCw,
  Users,
  Layers,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  UserPlus,
  BookOpen,
  Download,
  ShieldAlert
} from "lucide-react";

const parseDurationToSeconds = (durationText) => {
  if (!durationText) return 7 * 24 * 3600; // default 7 days fallback
  const lower = durationText.toLowerCase();
  if (lower.includes("weeks 2-3") || lower.includes("2 weeks") || lower.includes("weeks")) {
    if (lower.includes("2-3")) return 14 * 24 * 3600; // 14 days
    const match = lower.match(/(\d+)\s*weeks?/);
    if (match) return parseInt(match[1], 10) * 7 * 24 * 3600;
    return 14 * 24 * 3600; // fallback for Weeks
  }
  if (lower.includes("week")) {
    const match = lower.match(/(\d+)\s*weeks?/);
    if (match) return parseInt(match[1], 10) * 7 * 24 * 3600;
    return 7 * 24 * 3600; // fallback for Week
  }
  if (lower.includes("day")) {
    const match = lower.match(/(\d+)\s*days?/);
    if (match) return parseInt(match[1], 10) * 24 * 3600;
    return 24 * 3600;
  }
  if (lower.includes("hour")) {
    const match = lower.match(/(\d+)\s*hours?/);
    if (match) return parseInt(match[1], 10) * 3600;
    return 3600;
  }
  return 7 * 24 * 3600; // default fallback 7 days
};

const splitIsoDateTime = (isoString) => {
  if (!isoString) return { date: "", time: "" };
  const dt = new Date(isoString);
  const date = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
  const time = String(dt.getHours()).padStart(2, "0") + ":" + String(dt.getMinutes()).padStart(2, "0");
  return { date, time };
};

const EXPORT_COLUMN_GROUPS = [
  {
    name: "REGISTRATION",
    columns: [
      { key: "registration_id", label: "Registration ID", isCenter: true, width: 100 },
      { key: "created_at", label: "Registration Date", isCenter: true, width: 200 },
      { key: "status", label: "Status", isCenter: true, width: 100 },
      { key: "product_number", label: "Product Number", isCenter: true, width: 110 }
    ]
  },
  {
    name: "TEAM",
    columns: [
      { key: "team_name", label: "Team Name", isCenter: false, width: 180 },
      { key: "leader_department", label: "Department", isCenter: false, width: 180 },
      { key: "innovation_domain", label: "Innovation Domain", isCenter: false, width: 220 },
      { key: "trl_level", label: "TRL Level", isCenter: true, width: 90 }
    ]
  },
  {
    name: "PROJECT / IDEA",
    columns: [
      { key: "project_title", label: "Project Title", isCenter: false, width: 250, wrap: true },
      { key: "problem_area", label: "Problem Statement", isCenter: false, width: 280, wrap: true, alignTop: true },
      { key: "proposed_solution", label: "Proposed Solution", isCenter: false, width: 280, wrap: true, alignTop: true },
      { key: "expected_impact", label: "Expected Impact", isCenter: false, width: 280, wrap: true, alignTop: true },
      { key: "sdg_goals", label: "SDG Goals", isCenter: false, width: 200 }
    ]
  },
  {
    name: "TEAM LEADER",
    columns: [
      { key: "leader_name", label: "Leader Name", isCenter: false, width: 180 },
      { key: "leader_email", label: "Leader Email", isCenter: false, width: 220 },
      { key: "leader_mobile", label: "Leader Mobile", isCenter: true, width: 130 },
      { key: "leader_department", label: "Leader Department", isCenter: false, width: 180 }
    ]
  },
  {
    name: "MEMBER 2",
    columns: [
      { key: "member2_name", label: "Member 2 Name", isCenter: false, width: 180 },
      { key: "member2_email", label: "Member 2 Email", isCenter: false, width: 220 },
      { key: "member2_mobile", label: "Member 2 Mobile", isCenter: true, width: 130 },
      { key: "member2_department", label: "Member 2 Department", isCenter: false, width: 180 }
    ]
  },
  {
    name: "MEMBER 3",
    columns: [
      { key: "member3_name", label: "Member 3 Name", isCenter: false, width: 180 },
      { key: "member3_email", label: "Member 3 Email", isCenter: false, width: 220 },
      { key: "member3_mobile", label: "Member 3 Mobile", isCenter: true, width: 130 },
      { key: "member3_department", label: "Member 3 Department", isCenter: false, width: 180 }
    ]
  },
  {
    name: "MENTOR",
    columns: [
      { key: "mentor_name", label: "Mentor Name", isCenter: false, width: 180 },
      { key: "mentor_department", label: "Mentor Department", isCenter: false, width: 180 }
    ]
  },
  {
    name: "EVALUATION / PROGRESS",
    columns: [
      { key: "evaluation_score", label: "Evaluation Score", isCenter: true, width: 120 },
      { key: "evaluation_comments", label: "Evaluation Comments", isCenter: false, width: 280, wrap: true, alignTop: true }
    ]
  }
];

export default function AdminDashboard({ user, profile, onViewPublicPortal }) {
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem('admin_active_tab') || 'overview';
    } catch (e) {
      return 'overview';
    }
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // DB Data States
  const [phases, setPhases] = useState([]);
  const [evaluators, setEvaluators] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [evaluations, setEvaluations] = useState([]);

  // Column Selection Export States
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState(new Set());

  // Form & Interaction States
  const [newEvaluatorEmail, setNewEvaluatorEmail] = useState("");
  const [submittingEvaluator, setSubmittingEvaluator] = useState(false);
  const [assigneeForPhase, setAssigneeForPhase] = useState({}); // { [phaseId]: evaluatorUserId }
  const [submittingAssignment, setSubmittingAssignment] = useState({}); // { [phaseId]: 'assigning' | 'removing' }
  const [confirmActivatePhase, setConfirmActivatePhase] = useState(null);
  const [updatingPhase, setUpdatingPhase] = useState(false);
  const [countdownStates, setCountdownStates] = useState({});
  const [registrationTimer, setRegistrationTimer] = useState(null);
  const [regCountdown, setRegCountdown] = useState(null);
  const [modifyTimerType, setModifyTimerType] = useState(""); // "phase" | "registration"
  const [extendTimerType, setExtendTimerType] = useState(""); // "phase" | "registration"

  // Modify & Extend overlay states
  const [modifyTimerPhase, setModifyTimerPhase] = useState(null);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");

  const [extendTimerPhase, setExtendTimerPhase] = useState(null);
  const [extDays, setExtDays] = useState(0);
  const [extHours, setExtHours] = useState(0);
  const [extMinutes, setExtMinutes] = useState(0);
  const [extSeconds, setExtSeconds] = useState(0);

  // Teams search filter & Pagination
  const [teamsSearch, setTeamsSearch] = useState(() => {
    try {
      return localStorage.getItem('admin_teams_search') || '';
    } catch (e) {
      return '';
    }
  });
  const [currentPage, setCurrentPage] = useState(() => {
    try {
      return Number(localStorage.getItem('admin_current_page')) || 1;
    } catch (e) {
      return 1;
    }
  });

  // Filter States
  const [filterDepartment, setFilterDepartment] = useState(() => {
    try {
      return localStorage.getItem('admin_filter_dept') || '';
    } catch (e) {
      return '';
    }
  });
  const [filterDomain, setFilterDomain] = useState(() => {
    try {
      return localStorage.getItem('admin_filter_domain') || '';
    } catch (e) {
      return '';
    }
  });
  const [filterTrl, setFilterTrl] = useState(() => {
    try {
      return localStorage.getItem('admin_filter_trl') || '';
    } catch (e) {
      return '';
    }
  });

  // Persist State Changes
  useEffect(() => {
    try {
      localStorage.setItem('admin_active_tab', activeTab);
    } catch (e) {}
  }, [activeTab]);

  useEffect(() => {
    try {
      localStorage.setItem('admin_teams_search', teamsSearch);
    } catch (e) {}
  }, [teamsSearch]);

  useEffect(() => {
    try {
      localStorage.setItem('admin_current_page', currentPage);
    } catch (e) {}
  }, [currentPage]);

  useEffect(() => {
    try {
      localStorage.setItem('admin_filter_dept', filterDepartment);
    } catch (e) {}
  }, [filterDepartment]);

  useEffect(() => {
    try {
      localStorage.setItem('admin_filter_domain', filterDomain);
    } catch (e) {}
  }, [filterDomain]);

  useEffect(() => {
    try {
      localStorage.setItem('admin_filter_trl', filterTrl);
    } catch (e) {}
  }, [filterTrl]);

  // Persist Scroll Position
  useEffect(() => {
    try {
      const savedScroll = localStorage.getItem('admin_scroll_position');
      if (savedScroll) {
        setTimeout(() => {
          window.scrollTo({
            top: Number(savedScroll),
            behavior: 'auto'
          });
        }, 150);
      }
    } catch (e) {}

    const handleScroll = () => {
      try {
        localStorage.setItem('admin_scroll_position', window.scrollY);
      } catch (e) {}
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeTab]);

  const [departmentsList, setDepartmentsList] = useState([]);

  // Statistics State
  const [stats, setStats] = useState({
    totalTeams: 0,
    totalStudents: 0,
    totalEvaluators: 0,
    activePhaseName: "None",
    totalEvaluations: 0
  });

  const fetchDashboardData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError("");

    try {
      // 1. Fetch phases
      const { data: phasesData, error: phasesError } = await supabase
        .from("phases")
        .select("*")
        .order("phase_number", { ascending: true });
      if (phasesError) throw phasesError;
      setPhases(phasesData || []);

      const activePhase = phasesData?.find(p => p.is_active);

      // Fetch registration timer
      const { data: regTimerData, error: regTimerError } = await supabase
        .from("registration_timer")
        .select("*")
        .maybeSingle();
      if (regTimerError) throw regTimerError;
      setRegistrationTimer(regTimerData);

      // 2. Fetch profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*");
      if (profilesError) throw profilesError;

      const students = profilesData?.filter(p => p.role === "student") || [];
      const evals = profilesData?.filter(p => p.role === "evaluator") || [];
      setEvaluators(evals);

      // 3. Fetch registrations, teams, products, product_members, departments, and evaluations
      const { data: registrationsData, error: registrationsError } = await supabase
        .from("registrations")
        .select("*")
        .order("created_at", { ascending: false });
      if (registrationsError) throw registrationsError;

      const { data: evaluationsData, error: evaluationsError } = await supabase
        .from("evaluations")
        .select("*")
        .order("submitted_at", { ascending: false });
      if (evaluationsError) throw evaluationsError;
      setEvaluations(evaluationsData || []);

      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("*");
      if (teamsError) throw teamsError;

      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("*");
      if (productsError) throw productsError;

      const { data: membersData, error: membersError } = await supabase
        .from("product_members")
        .select("*");
      if (membersError) throw membersError;

      const { data: departmentsData, error: departmentsError } = await supabase
        .from("departments")
        .select("*");
      if (departmentsError) throw departmentsError;

      setDepartmentsList(departmentsData || []);

      // Build mapping lookups
      const deptsMap = {};
      (departmentsData || []).forEach(d => {
        deptsMap[d.id] = d.name;
      });

      const regsMap = {};
      (registrationsData || []).forEach(r => {
        regsMap[r.registration_id] = r;
      });

      // Map each product to a virtual registration record
      const normalizedRecords = (productsData || []).map(prod => {
        const team = (teamsData || []).find(t => t.id === prod.team_id) || {};
        const prodMembers = (membersData || []).filter(m => m.product_id === prod.id) || [];

        const leader = prodMembers.find(m => m.is_team_leader || m.role === 'Team Leader') || {};
        const otherMembers = prodMembers.filter(m => !m.is_team_leader && m.role !== 'Team Leader');
        const m2 = otherMembers[0] || {};
        const m3 = otherMembers[1] || {};
        const m4 = otherMembers[2] || {};

        let mentorName = '';
        let mentorDept = '';
        let regDate = prod.created_at || new Date().toISOString();
        let displayRegId = prod.legacy_registration_id || '';

        if (prod.legacy_registration_id && regsMap[prod.legacy_registration_id]) {
          const origReg = regsMap[prod.legacy_registration_id];
          mentorName = origReg.mentor_name || '';
          mentorDept = origReg.mentor_department || '';
          regDate = origReg.created_at || regDate;
        } else {
          // Fallback to first product for existing-team new idea submissions
          const firstProd = (productsData || []).find(p => p.team_id === prod.team_id && p.product_number === 1);
          if (firstProd && firstProd.legacy_registration_id) {
            displayRegId = firstProd.legacy_registration_id;
            if (regsMap[firstProd.legacy_registration_id]) {
              const origReg = regsMap[firstProd.legacy_registration_id];
              mentorName = origReg.mentor_name || '';
              mentorDept = origReg.mentor_department || '';
            }
          }
        }

        const leaderDeptName = deptsMap[leader.department_id] || leader.department_id || '';
        const m2DeptName = deptsMap[m2.department_id] || m2.department_id || '';
        const m3DeptName = deptsMap[m3.department_id] || m3.department_id || '';
        const m4DeptName = deptsMap[m4.department_id] || m4.department_id || '';

        const prodEvals = (evaluationsData || []).filter(ev => ev.registration_id === displayRegId);
        const avgScore = prodEvals.length > 0
          ? Number((prodEvals.reduce((sum, ev) => sum + Number(ev.score), 0) / prodEvals.length).toFixed(2))
          : null;
        const evalComments = prodEvals.map(ev => ev.comments).filter(Boolean).join('; ');

        return {
          id: prod.id,
          registration_id: displayRegId,
          team_name: team.team_name || '',
          project_title: prod.product_title || '',
          innovation_domain: prod.innovation_domain || '',
          trl_level: prod.trl_level,
          sdg_goals: prod.sdg_goals || [],
          problem_area: prod.problem_area || '',
          proposed_solution: prod.proposed_solution || '',
          expected_impact: prod.expected_impact || '',
          product_number: prod.product_number || 1,
          status: prod.status || 'active',

          leader_name: leader.member_name || '',
          leader_email: leader.member_email || '',
          leader_mobile: leader.member_mobile || '',
          leader_department: leaderDeptName,

          member2_name: m2.member_name || '',
          member2_email: m2.member_email || '',
          member2_mobile: m2.member_mobile || '',
          member2_department: m2DeptName,

          member3_name: m3.member_name || '',
          member3_email: m3.member_email || '',
          member3_mobile: m3.member_mobile || '',
          member3_department: m3DeptName,

          member4_name: m4.member_name || '',
          member4_email: m4.member_email || '',
          member4_mobile: m4.member_mobile || '',
          member4_department: m4DeptName,

          mentor_name: mentorName,
          mentor_department: mentorDept,

          evaluation_score: avgScore,
          evaluation_comments: evalComments,

          created_at: regDate
        };
      });

      // Sort by created_at descending
      normalizedRecords.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setRegistrations(normalizedRecords);

      // 4. Fetch evaluator assignments
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from("evaluator_assignments")
        .select("*");
      if (assignmentsError) throw assignmentsError;
      setAssignments(assignmentsData || []);

      // Update statistics
      setStats({
        totalTeams: teamsData?.length || 0,
        totalStudents: students.length,
        totalEvaluators: evals.length,
        activePhaseName: activePhase ? `Phase ${activePhase.phase_number}: ${activePhase.name}` : "None",
        totalEvaluations: evaluationsData?.length || 0
      });
      window.dispatchEvent(new CustomEvent('refresh-leaderboard'));

    } catch (err) {
      console.error("Error loading dashboard data:", err);
      setError("Unable to load dashboard data. Please verify database RLS policies have been executed.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (profile?.role === "admin") {
      fetchDashboardData();
    }
  }, [profile]);

  useEffect(() => {
    const timer = setInterval(() => {
      const newStates = {};
      let needsRefresh = false;

      // 1. Phase Timers Countdowns
      phases.forEach(async (phase) => {
        if (phase.is_timer_running && phase.scheduled_end_at) {
          const end = new Date(phase.scheduled_end_at).getTime();
          let diff = end - Date.now();
          if (phase.is_timer_paused && phase.remaining_seconds) {
            diff = Number(phase.remaining_seconds) * 1000;
          }
          if (diff <= 0) {
            newStates[phase.id] = { days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true };
            if (phase.timer_status === "running") {
              needsRefresh = true;
              phase.timer_status = "completed";
              phase.is_timer_running = false;
              phase.is_timer_paused = false;
              try {
                await supabase
                  .from("phases")
                  .update({
                    timer_status: "completed",
                    is_timer_running: false,
                    is_timer_paused: false
                  })
                  .eq("id", phase.id);
              } catch (e) {
                console.error("Error updating completed timer status:", e);
              }
            }
          } else {
            const seconds = Math.floor((diff / 1000) % 60);
            const minutes = Math.floor((diff / 1000 / 60) % 60);
            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            newStates[phase.id] = { days, hours, minutes, seconds, isOver: false };
          }
        } else if (phase.timer_status === "paused" && phase.remaining_seconds) {
          const diff = Number(phase.remaining_seconds) * 1000;
          const seconds = Math.floor((diff / 1000) % 60);
          const minutes = Math.floor((diff / 1000 / 60) % 60);
          const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          newStates[phase.id] = { days, hours, minutes, seconds, isOver: false };
        } else {
          newStates[phase.id] = null;
        }
      });
      setCountdownStates(newStates);

      // 2. Registration Timer Countdown
      if (registrationTimer) {
        let regState = null;
        if (registrationTimer.is_timer_running && registrationTimer.scheduled_end_at) {
          const end = new Date(registrationTimer.scheduled_end_at).getTime();
          let diff = end - Date.now();
          if (registrationTimer.is_timer_paused && registrationTimer.remaining_seconds) {
            diff = Number(registrationTimer.remaining_seconds) * 1000;
          }
          if (diff <= 0) {
            regState = { days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true };
            if (registrationTimer.timer_status === "running") {
              needsRefresh = true;
              registrationTimer.timer_status = "completed";
              registrationTimer.is_timer_running = false;
              registrationTimer.is_timer_paused = false;
              const updateRegTimer = async () => {
                try {
                  await supabase
                    .from("registration_timer")
                    .update({
                      timer_status: "completed",
                      is_timer_running: false,
                      is_timer_paused: false,
                      remaining_seconds: 0
                    })
                    .eq("id", registrationTimer.id);
                } catch (e) {
                  console.error("Error updating completed registration timer status:", e);
                }
              };
              updateRegTimer();
            }
          } else {
            const seconds = Math.floor((diff / 1000) % 60);
            const minutes = Math.floor((diff / 1000 / 60) % 60);
            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            regState = { days, hours, minutes, seconds, isOver: false };
          }
        } else if (registrationTimer.timer_status === "paused" && registrationTimer.remaining_seconds) {
          const diff = Number(registrationTimer.remaining_seconds) * 1000;
          const seconds = Math.floor((diff / 1000) % 60);
          const minutes = Math.floor((diff / 1000 / 60) % 60);
          const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          regState = { days, hours, minutes, seconds, isOver: false };
        }
        setRegCountdown(regState);
      }

      if (needsRefresh) {
        fetchDashboardData(true);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [phases, registrationTimer]);

  const handleRefresh = () => {
    setRefreshing(true);
    setSuccess("");
    setCurrentPage(1);
    fetchDashboardData(true);
  };

  const handleLogout = async () => {
    try {
      const { error: logOutError } = await supabase.auth.signOut();
      if (logOutError) throw logOutError;
    } catch (err) {
      console.error("Logout exception:", err);
      setError("Unable to sign out. Please try again.");
    }
  };

  // Phase Operations
  const handleActivatePhase = async () => {
    if (!confirmActivatePhase) return;
    setUpdatingPhase(true);
    setError("");
    setSuccess("");
    const phaseToActivate = confirmActivatePhase;
    setConfirmActivatePhase(null);

    try {
      // Deactivate all phases
      const { error: deactivateError } = await supabase
        .from("phases")
        .update({ is_active: false })
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (deactivateError) throw deactivateError;

      // Activate selected phase
      const { error: activateError } = await supabase
        .from("phases")
        .update({ is_active: true })
        .eq("id", phaseToActivate.id);
      if (activateError) throw activateError;

      setSuccess(`Successfully activated Phase ${phaseToActivate.phase_number}: ${phaseToActivate.name}`);
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error activating phase:", err);
      setError(`Unable to activate Phase ${phaseToActivate.phase_number}.`);
    } finally {
      setUpdatingPhase(false);
    }
  };

  const handleDeactivatePhase = async (phase) => {
    setUpdatingPhase(true);
    setError("");
    setSuccess("");

    try {
      const { error: deactivateError } = await supabase
        .from("phases")
        .update({ is_active: false })
        .eq("id", phase.id);
      if (deactivateError) throw deactivateError;

      setSuccess(`Successfully deactivated Phase ${phase.phase_number}: ${phase.name}`);
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error deactivating phase:", err);
      setError(`Unable to deactivate Phase ${phase.phase_number}.`);
    } finally {
      setUpdatingPhase(false);
    }
  };
  const handleStartTimer = async (phase) => {
    setUpdatingPhase(true);
    setError("");
    setSuccess("");

    try {
      const now = new Date();
      const scheduledStart = phase.scheduled_start_at ? new Date(phase.scheduled_start_at) : now;
      let scheduledEnd = phase.scheduled_end_at ? new Date(phase.scheduled_end_at) : null;

      if (phase.timer_status === "completed" || phase.timer_status === "closed" || !scheduledEnd) {
        const durationSeconds = parseDurationToSeconds(phase.duration);
        scheduledEnd = new Date(now.getTime() + durationSeconds * 1000);
      }

      // Create history entry
      const { error: historyError } = await supabase
        .from("phase_timer_history")
        .insert({
          phase_id: phase.id,
          action: "START",
          old_start_at: phase.scheduled_start_at,
          old_end_at: phase.scheduled_end_at,
          new_start_at: scheduledStart.toISOString(),
          new_end_at: scheduledEnd.toISOString(),
          duration_added_seconds: null,
          performed_by: user.id
        });
      if (historyError) throw historyError;

      // Update phase timer status
      const { error: updateError } = await supabase
        .from("phases")
        .update({
          timer_status: "running",
          scheduled_start_at: scheduledStart.toISOString(),
          scheduled_end_at: scheduledEnd.toISOString(),
          is_timer_running: true,
          is_timer_paused: false,
          last_started_at: now.toISOString(),
          remaining_seconds: null
        })
        .eq("id", phase.id);
      if (updateError) throw updateError;

      setSuccess(`Timer started successfully for Phase ${phase.phase_number}.`);
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error starting phase timer:", err);
      setError(`Unable to start timer for Phase ${phase.phase_number}.`);
    } finally {
      setUpdatingPhase(false);
    }
  };

  const handlePauseTimer = async (phase) => {
    setUpdatingPhase(true);
    setError("");
    setSuccess("");

    try {
      const now = new Date();
      const end = new Date(phase.scheduled_end_at);
      const remaining = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));

      // Create history entry
      const { error: historyError } = await supabase
        .from("phase_timer_history")
        .insert({
          phase_id: phase.id,
          action: "PAUSE",
          old_start_at: phase.scheduled_start_at,
          old_end_at: phase.scheduled_end_at,
          new_start_at: phase.scheduled_start_at,
          new_end_at: phase.scheduled_end_at,
          duration_added_seconds: null,
          performed_by: user.id
        });
      if (historyError) throw historyError;

      // Update phase timer status
      const { error: updateError } = await supabase
        .from("phases")
        .update({
          timer_status: "paused",
          is_timer_running: false,
          is_timer_paused: true,
          paused_at: now.toISOString(),
          remaining_seconds: remaining
        })
        .eq("id", phase.id);
      if (updateError) throw updateError;

      setSuccess(`Timer paused successfully for Phase ${phase.phase_number}.`);
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error pausing phase timer:", err);
      setError(`Unable to pause timer for Phase ${phase.phase_number}.`);
    } finally {
      setUpdatingPhase(false);
    }
  };

  const handleResumeTimer = async (phase) => {
    setUpdatingPhase(true);
    setError("");
    setSuccess("");

    try {
      const now = new Date();
      const remaining = phase.remaining_seconds || 0;
      const newEnd = new Date(now.getTime() + remaining * 1000);

      // Create history entry
      const { error: historyError } = await supabase
        .from("phase_timer_history")
        .insert({
          phase_id: phase.id,
          action: "RESUME",
          old_start_at: phase.scheduled_start_at,
          old_end_at: phase.scheduled_end_at,
          new_start_at: phase.scheduled_start_at,
          new_end_at: newEnd.toISOString(),
          duration_added_seconds: null,
          performed_by: user.id
        });
      if (historyError) throw historyError;

      // Update phase timer status
      const { error: updateError } = await supabase
        .from("phases")
        .update({
          timer_status: "running",
          is_timer_running: true,
          is_timer_paused: false,
          scheduled_end_at: newEnd.toISOString(),
          last_started_at: now.toISOString(),
          remaining_seconds: null,
          paused_at: null
        })
        .eq("id", phase.id);
      if (updateError) throw updateError;

      setSuccess(`Timer resumed successfully for Phase ${phase.phase_number}.`);
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error resuming phase timer:", err);
      setError(`Unable to resume timer for Phase ${phase.phase_number}.`);
    } finally {
      setUpdatingPhase(false);
    }
  };

  const handleStopTimer = async (phase) => {
    setUpdatingPhase(true);
    setError("");
    setSuccess("");

    try {
      // Create history entry
      const { error: historyError } = await supabase
        .from("phase_timer_history")
        .insert({
          phase_id: phase.id,
          action: "STOP",
          old_start_at: phase.scheduled_start_at,
          old_end_at: phase.scheduled_end_at,
          new_start_at: phase.scheduled_start_at,
          new_end_at: phase.scheduled_end_at,
          duration_added_seconds: null,
          performed_by: user.id
        });
      if (historyError) throw historyError;

      // Update phase timer status
      const { error: updateError } = await supabase
        .from("phases")
        .update({
          timer_status: "closed",
          is_timer_running: false,
          is_timer_paused: false
        })
        .eq("id", phase.id);
      if (updateError) throw updateError;

      setSuccess(`Timer stopped successfully for Phase ${phase.phase_number}.`);
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error stopping phase timer:", err);
      setError(`Unable to stop timer for Phase ${phase.phase_number}.`);
    } finally {
      setUpdatingPhase(false);
    }
  };

  const handleExtendTimer = async (phase, durationAddedSeconds) => {
    setUpdatingPhase(true);
    setError("");
    setSuccess("");
    setExtendTimerPhase(null);

    try {
      const now = new Date();
      const currentEnd = phase.scheduled_end_at ? new Date(phase.scheduled_end_at) : now;
      const baseTime = currentEnd.getTime() > now.getTime() ? currentEnd : now;
      const newEnd = new Date(baseTime.getTime() + durationAddedSeconds * 1000);

      let updatePayload = {
        scheduled_end_at: newEnd.toISOString(),
        extended_at: now.toISOString()
      };

      if (phase.timer_status === "paused") {
        updatePayload.remaining_seconds = Number(phase.remaining_seconds || 0) + durationAddedSeconds;
      } else if (phase.timer_status === "completed" || phase.timer_status === "closed" || phase.timer_status === "upcoming") {
        if (newEnd.getTime() > now.getTime()) {
          updatePayload.timer_status = "running";
          updatePayload.is_timer_running = true;
          updatePayload.is_timer_paused = false;
          updatePayload.last_started_at = now.toISOString();
          updatePayload.remaining_seconds = null;
        }
      }

      // Create history entry
      const { error: historyError } = await supabase
        .from("phase_timer_history")
        .insert({
          phase_id: phase.id,
          action: "EXTEND",
          old_start_at: phase.scheduled_start_at,
          old_end_at: phase.scheduled_end_at,
          new_start_at: phase.scheduled_start_at,
          new_end_at: newEnd.toISOString(),
          duration_added_seconds: durationAddedSeconds,
          performed_by: user.id
        });
      if (historyError) throw historyError;

      // Update phase
      const { error: updateError } = await supabase
        .from("phases")
        .update(updatePayload)
        .eq("id", phase.id);
      if (updateError) throw updateError;

      setSuccess(`Timer extended successfully for Phase ${phase.phase_number}.`);
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error extending phase timer:", err);
      setError(`Unable to extend timer for Phase ${phase.phase_number}.`);
    } finally {
      setUpdatingPhase(false);
    }
  };

  const handleModifyTimer = async (phase) => {
    if (!startDate || !startTime || !endDate || !endTime) {
      setError("Please specify all start and end dates/times.");
      return;
    }
    setUpdatingPhase(true);
    setError("");
    setSuccess("");
    setModifyTimerPhase(null);

    try {
      const newStart = new Date(`${startDate}T${startTime}`).toISOString();
      const newEnd = new Date(`${endDate}T${endTime}`).toISOString();

      // Create history entry
      const { error: historyError } = await supabase
        .from("phase_timer_history")
        .insert({
          phase_id: phase.id,
          action: "MODIFY",
          old_start_at: phase.scheduled_start_at,
          old_end_at: phase.scheduled_end_at,
          new_start_at: newStart,
          new_end_at: newEnd,
          duration_added_seconds: null,
          performed_by: user.id
        });
      if (historyError) throw historyError;

      let updatePayload = {
        scheduled_start_at: newStart,
        scheduled_end_at: newEnd
      };

      if (phase.timer_status === "paused") {
        const now = new Date();
        const end = new Date(newEnd);
        updatePayload.remaining_seconds = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
      }

      const { error: updateError } = await supabase
        .from("phases")
        .update(updatePayload)
        .eq("id", phase.id);
      if (updateError) throw updateError;

      setSuccess(`Timer modified successfully for Phase ${phase.phase_number}.`);
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error modifying phase timer:", err);
      setError(`Unable to modify timer for Phase ${phase.phase_number}.`);
    } finally {
      setUpdatingPhase(false);
    }
  };

  const handleStartRegTimer = async () => {
    if (!registrationTimer) return;
    setUpdatingPhase(true);
    setError("");
    setSuccess("");

    try {
      const now = new Date();
      const scheduledStart = registrationTimer.scheduled_start_at ? new Date(registrationTimer.scheduled_start_at) : now;
      let scheduledEnd = registrationTimer.scheduled_end_at ? new Date(registrationTimer.scheduled_end_at) : null;

      if (registrationTimer.timer_status === "completed" || registrationTimer.timer_status === "closed" || !scheduledEnd) {
        scheduledEnd = new Date(now.getTime() + 7 * 24 * 3600 * 1000); // 7 days
      }

      // History entry
      const { error: historyError } = await supabase
        .from("registration_timer_history")
        .insert({
          registration_timer_id: registrationTimer.id,
          action: "START",
          old_start_at: registrationTimer.scheduled_start_at,
          old_end_at: registrationTimer.scheduled_end_at,
          new_start_at: scheduledStart.toISOString(),
          new_end_at: scheduledEnd.toISOString(),
          duration_added_seconds: null,
          performed_by: user.id
        });
      if (historyError) throw historyError;

      // Update state in DB
      const { error: updateError } = await supabase
        .from("registration_timer")
        .update({
          timer_status: "running",
          scheduled_start_at: scheduledStart.toISOString(),
          scheduled_end_at: scheduledEnd.toISOString(),
          is_timer_running: true,
          is_timer_paused: false,
          last_started_at: now.toISOString(),
          remaining_seconds: null
        })
        .eq("id", registrationTimer.id);
      if (updateError) throw updateError;

      setSuccess("Registration timer started successfully.");
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error starting registration timer:", err);
      setError("Unable to start registration timer.");
    } finally {
      setUpdatingPhase(false);
    }
  };

  const handlePauseRegTimer = async () => {
    if (!registrationTimer) return;
    setUpdatingPhase(true);
    setError("");
    setSuccess("");

    try {
      const now = new Date();
      const end = new Date(registrationTimer.scheduled_end_at);
      const remaining = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));

      const { error: historyError } = await supabase
        .from("registration_timer_history")
        .insert({
          registration_timer_id: registrationTimer.id,
          action: "PAUSE",
          old_start_at: registrationTimer.scheduled_start_at,
          old_end_at: registrationTimer.scheduled_end_at,
          new_start_at: registrationTimer.scheduled_start_at,
          new_end_at: registrationTimer.scheduled_end_at,
          duration_added_seconds: null,
          performed_by: user.id
        });
      if (historyError) throw historyError;

      const { error: updateError } = await supabase
        .from("registration_timer")
        .update({
          timer_status: "paused",
          is_timer_running: false,
          is_timer_paused: true,
          paused_at: now.toISOString(),
          remaining_seconds: remaining
        })
        .eq("id", registrationTimer.id);
      if (updateError) throw updateError;

      setSuccess("Registration timer paused successfully.");
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error pausing registration timer:", err);
      setError("Unable to pause registration timer.");
    } finally {
      setUpdatingPhase(false);
    }
  };

  const handleResumeRegTimer = async () => {
    if (!registrationTimer) return;
    setUpdatingPhase(true);
    setError("");
    setSuccess("");

    try {
      const now = new Date();
      const remaining = registrationTimer.remaining_seconds || 0;
      const newEnd = new Date(now.getTime() + remaining * 1000);

      const { error: historyError } = await supabase
        .from("registration_timer_history")
        .insert({
          registration_timer_id: registrationTimer.id,
          action: "RESUME",
          old_start_at: registrationTimer.scheduled_start_at,
          old_end_at: registrationTimer.scheduled_end_at,
          new_start_at: registrationTimer.scheduled_start_at,
          new_end_at: newEnd.toISOString(),
          duration_added_seconds: null,
          performed_by: user.id
        });
      if (historyError) throw historyError;

      const { error: updateError } = await supabase
        .from("registration_timer")
        .update({
          timer_status: "running",
          is_timer_running: true,
          is_timer_paused: false,
          scheduled_end_at: newEnd.toISOString(),
          last_started_at: now.toISOString(),
          remaining_seconds: null,
          paused_at: null
        })
        .eq("id", registrationTimer.id);
      if (updateError) throw updateError;

      setSuccess("Registration timer resumed successfully.");
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error resuming registration timer:", err);
      setError("Unable to resume registration timer.");
    } finally {
      setUpdatingPhase(false);
    }
  };

  const handleStopRegTimer = async () => {
    if (!registrationTimer) return;
    setUpdatingPhase(true);
    setError("");
    setSuccess("");

    try {
      const { error: historyError } = await supabase
        .from("registration_timer_history")
        .insert({
          registration_timer_id: registrationTimer.id,
          action: "STOP",
          old_start_at: registrationTimer.scheduled_start_at,
          old_end_at: registrationTimer.scheduled_end_at,
          new_start_at: registrationTimer.scheduled_start_at,
          new_end_at: registrationTimer.scheduled_end_at,
          duration_added_seconds: null,
          performed_by: user.id
        });
      if (historyError) throw historyError;

      const { error: updateError } = await supabase
        .from("registration_timer")
        .update({
          timer_status: "closed",
          is_timer_running: false,
          is_timer_paused: false
        })
        .eq("id", registrationTimer.id);
      if (updateError) throw updateError;

      setSuccess("Registration timer stopped successfully.");
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error stopping registration timer:", err);
      setError("Unable to stop registration timer.");
    } finally {
      setUpdatingPhase(false);
    }
  };

  const handleExtendRegTimer = async (durationAddedSeconds) => {
    if (!registrationTimer) return;
    setUpdatingPhase(true);
    setError("");
    setSuccess("");
    setExtendTimerPhase(null);

    try {
      const now = new Date();
      const currentEnd = registrationTimer.scheduled_end_at ? new Date(registrationTimer.scheduled_end_at) : now;
      const baseTime = currentEnd.getTime() > now.getTime() ? currentEnd : now;
      const newEnd = new Date(baseTime.getTime() + durationAddedSeconds * 1000);

      let updatePayload = {
        scheduled_end_at: newEnd.toISOString(),
        extended_at: now.toISOString()
      };

      if (registrationTimer.timer_status === "paused") {
        updatePayload.remaining_seconds = Number(registrationTimer.remaining_seconds || 0) + durationAddedSeconds;
      } else if (
        registrationTimer.timer_status === "completed" ||
        registrationTimer.timer_status === "closed" ||
        registrationTimer.timer_status === "upcoming"
      ) {
        if (newEnd.getTime() > now.getTime()) {
          updatePayload.timer_status = "running";
          updatePayload.is_timer_running = true;
          updatePayload.is_timer_paused = false;
          updatePayload.last_started_at = now.toISOString();
          updatePayload.remaining_seconds = null;
        }
      }

      // History
      const { error: historyError } = await supabase
        .from("registration_timer_history")
        .insert({
          registration_timer_id: registrationTimer.id,
          action: "EXTEND",
          old_start_at: registrationTimer.scheduled_start_at,
          old_end_at: registrationTimer.scheduled_end_at,
          new_start_at: registrationTimer.scheduled_start_at,
          new_end_at: newEnd.toISOString(),
          duration_added_seconds: durationAddedSeconds,
          performed_by: user.id
        });
      if (historyError) throw historyError;

      // Update timer config
      const { error: updateError } = await supabase
        .from("registration_timer")
        .update(updatePayload)
        .eq("id", registrationTimer.id);
      if (updateError) throw updateError;

      setSuccess("Registration timer extended successfully.");
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error extending registration timer:", err);
      setError("Unable to extend registration timer.");
    } finally {
      setUpdatingPhase(false);
    }
  };

  const handleModifyRegTimer = async () => {
    if (!registrationTimer) return;
    if (!startDate || !startTime || !endDate || !endTime) {
      setError("Please specify all start and end dates/times.");
      return;
    }
    setUpdatingPhase(true);
    setError("");
    setSuccess("");
    setModifyTimerPhase(null);

    try {
      const newStart = new Date(`${startDate}T${startTime}`).toISOString();
      const newEnd = new Date(`${endDate}T${endTime}`).toISOString();

      // History
      const { error: historyError } = await supabase
        .from("registration_timer_history")
        .insert({
          registration_timer_id: registrationTimer.id,
          action: "MODIFY",
          old_start_at: registrationTimer.scheduled_start_at,
          old_end_at: registrationTimer.scheduled_end_at,
          new_start_at: newStart,
          new_end_at: newEnd,
          duration_added_seconds: null,
          performed_by: user.id
        });
      if (historyError) throw historyError;

      let updatePayload = {
        scheduled_start_at: newStart,
        scheduled_end_at: newEnd
      };

      if (registrationTimer.timer_status === "paused") {
        const now = new Date();
        const end = new Date(newEnd);
        updatePayload.remaining_seconds = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
      }

      // Update timer config
      const { error: updateError } = await supabase
        .from("registration_timer")
        .update(updatePayload)
        .eq("id", registrationTimer.id);
      if (updateError) throw updateError;

      setSuccess("Registration timer modified successfully.");
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error modifying registration timer:", err);
      setError("Unable to modify registration timer.");
    } finally {
      setUpdatingPhase(false);
    }
  };

  // Evaluator Operations
  const handleAddEvaluator = async (e) => {
    e.preventDefault();
    if (!newEvaluatorEmail.trim()) return;
    setSubmittingEvaluator(true);
    setError("");
    setSuccess("");

    try {
      const { error: rpcError } = await supabase.rpc("promote_user_to_evaluator_by_email", {
        p_email: newEvaluatorEmail.trim()
      });

      if (rpcError) throw rpcError;

      setSuccess(`Successfully promoted ${newEvaluatorEmail.trim()} to Evaluator.`);
      setNewEvaluatorEmail("");
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error promoting user to evaluator:", err);
      setError(err.message || "Failed to add evaluator. Make sure the email exists in student profiles.");
    } finally {
      setSubmittingEvaluator(false);
    }
  };

  const handleAssignEvaluator = async (phaseId) => {
    const evaluatorUserId = assigneeForPhase[phaseId];
    if (!evaluatorUserId) return;

    setSubmittingAssignment(prev => ({ ...prev, [phaseId]: "assigning" }));
    setError("");
    setSuccess("");

    try {
      const { error: assignError } = await supabase
        .from("evaluator_assignments")
        .insert([{ phase_id: phaseId, evaluator_user_id: evaluatorUserId }]);

      if (assignError) {
        if (assignError.code === "23505") {
          setError("This evaluator is already assigned to this phase.");
          return;
        }
        throw assignError;
      }

      setSuccess("Evaluator assigned successfully.");
      setAssigneeForPhase(prev => ({ ...prev, [phaseId]: "" }));
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error assigning evaluator:", err);
      setError(err.message || "Unable to assign evaluator.");
    } finally {
      setSubmittingAssignment(prev => ({ ...prev, [phaseId]: null }));
    }
  };

  const handleRemoveEvaluator = async (assignmentId, phaseId) => {
    setSubmittingAssignment(prev => ({ ...prev, [phaseId]: "removing" }));
    setError("");
    setSuccess("");

    try {
      const { error: removeError } = await supabase
        .from("evaluator_assignments")
        .delete()
        .eq("id", assignmentId);

      if (removeError) throw removeError;

      setSuccess("Evaluator removed from phase successfully.");
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Error removing evaluator:", err);
      setError(err.message || "Unable to remove evaluator.");
    } finally {
      setSubmittingAssignment(prev => ({ ...prev, [phaseId]: null }));
    }
  };

  // Styled Excel Export Utility
  const downloadExcel = (headers, rows, filename, selectedCols) => {
    // 1. Column configuration: width mapping based on header name
    const colTags = headers.map((header, idx) => {
      let width = 140; // default
      if (selectedCols && selectedCols[idx]) {
        width = selectedCols[idx].width;
      } else {
        if (["Registration ID", "TRL Level", "Product Number", "Score", "Phase Number"].includes(header)) width = 90;
        else if (["Team Name", "Leader Name", "Member 2 Name", "Member 3 Name", "Mentor Name", "Evaluator Name", "Department", "Leader Department", "Member 2 Department", "Member 3 Department", "Mentor Department", "Phase Name"].includes(header)) width = 180;
        else if (["Project Title", "Innovation Domain", "SDG Goals", "Leader Email", "Member 2 Email", "Member 3 Email", "Evaluator Email", "Registration Date", "Submitted Date", "Comments"].includes(header)) width = 280;
      }
      return `<col width="${width}" />`;
    }).join('\n');

    // 2. Header cells
    const headerCells = headers.map(h =>
      `<th style="background-color: #0b1e36; color: #ffffff; font-family: Calibri, sans-serif; font-size: 11pt; font-weight: bold; border: 1px solid #cbd5e1; height: 35px; text-align: center; vertical-align: middle; white-space: normal;">${h}</th>`
    ).join('');

    // 3. Row mapping
    const rowLines = rows.map((row, rIdx) => {
      // Alternating row background shading
      const bg = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
      const cells = row.map((val, cIdx) => {
        let isCenter = false;
        let wrapText = true;
        let alignTop = false;

        const header = headers[cIdx];

        if (selectedCols && selectedCols[cIdx]) {
          isCenter = selectedCols[cIdx].isCenter;
          wrapText = selectedCols[cIdx].wrap !== false;
          alignTop = selectedCols[cIdx].alignTop === true;
        } else {
          isCenter = ["Registration ID", "TRL Level", "Product Number", "Score", "Phase Number", "Registration Date", "Submitted Date", "Leader Mobile", "Member 2 Mobile", "Member 3 Mobile"].includes(header);
        }

        const alignment = isCenter ? 'center' : 'left';
        const valign = alignTop ? 'top' : 'middle';
        const whiteSpace = wrapText ? 'normal' : 'nowrap';

        // Escape HTML special characters
        const escapedVal = String(val === null || val === undefined ? '' : val)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');

        return `<td style="background-color: ${bg}; color: #334155; font-family: Calibri, sans-serif; font-size: 10pt; border: 1px solid #e2e8f0; padding: 8px; text-align: ${alignment}; vertical-align: ${valign}; white-space: ${whiteSpace};">${escapedVal}</td>`;
      }).join('');
      return `<tr style="height: 26px;">${cells}</tr>`;
    }).join('\n');

    const xmlContent = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="content-type" content="text/html; charset=utf-8" />
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>Sheet 1</x:Name>
          <x:WorksheetOptions>
            <x:Selected/>
            <x:FreezePanes/>
            <x:FrozenNoSplit/>
            <x:SplitHorizontal>1</x:SplitHorizontal>
            <x:TopRowBottomPane>1</x:TopRowBottomPane>
            <x:ActivePane>2</x:ActivePane>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
</head>
<body>
  <table border="1" style="border-collapse: collapse; border: 1px solid #cbd5e1;">
    ${colTags}
    <thead>
      <tr style="height: 35px;">
        ${headerCells}
      </tr>
    </thead>
    <tbody>
      ${rowLines}
    </tbody>
  </table>
</body>
</html>
    `.trim();

    const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const allColumnKeys = EXPORT_COLUMN_GROUPS.flatMap(group => group.columns.map(col => col.key));
  const isAllColumnsSelected = allColumnKeys.every(key => selectedColumns.has(key));

  const handleToggleColumn = (key) => {
    setSelectedColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedColumns(new Set(allColumnKeys));
  };

  const handleClearAll = () => {
    setSelectedColumns(new Set());
  };

  const handleToggleAllColumnsCheckbox = (checked) => {
    if (checked) {
      handleSelectAll();
    } else {
      handleClearAll();
    }
  };

  const handleExportTeams = () => {
    // Select all columns by default
    const allKeys = EXPORT_COLUMN_GROUPS.flatMap(group => group.columns.map(col => col.key));
    setSelectedColumns(new Set(allKeys));
    setIsExportModalOpen(true);
  };

  const handleDownloadExport = () => {
    // 1. Gather all selected column objects in the correct order
    const selectedCols = [];
    EXPORT_COLUMN_GROUPS.forEach(group => {
      group.columns.forEach(col => {
        if (selectedColumns.has(col.key)) {
          selectedCols.push(col);
        }
      });
    });

    if (selectedCols.length === 0) return;

    // 2. Build headers list
    const headers = selectedCols.map(col => col.label);

    // 3. Build data rows matching the column order
    const rows = filteredRegistrations.map(t => {
      return selectedCols.map(col => {
        const val = t[col.key];

        // Custom formatting for specific columns
        if (col.key === 'trl_level') {
          return val !== null && val !== undefined ? val : 'N/A';
        }
        if (col.key === 'sdg_goals') {
          return val && Array.isArray(val) ? val.join('; ') : 'N/A';
        }
        if (col.key === 'created_at') {
          return formatDate(val);
        }

        // Return empty string for null/undefined/blank values
        return val === null || val === undefined ? '' : val;
      });
    });

    // 4. Download XLSX
    downloadExcel(headers, rows, "IPL_2026_Team_Registrations.xlsx", selectedCols);
    setIsExportModalOpen(false);
  };

  const handleExportEvaluations = () => {
    const headers = [
      "Phase Number",
      "Phase Name",
      "Registration ID",
      "Team Name",
      "Project Title",
      "Evaluator Name",
      "Evaluator Email",
      "Score",
      "Comments",
      "Submitted Date"
    ];

    const rows = evaluations.map(evalItem => {
      const phase = phases.find(p => p.id === evalItem.phase_id);
      const evaluator = evaluators.find(e => e.user_id === evalItem.evaluator_user_id);
      const registration = registrations.find(r => r.registration_id === evalItem.registration_id);

      return [
        phase ? phase.phase_number : 'Unknown',
        phase ? phase.name : 'Unknown',
        evalItem.registration_id,
        registration ? registration.team_name : 'Unknown',
        registration ? registration.project_title : 'Unknown',
        evaluator ? evaluator.name : 'Unknown',
        evaluator ? evaluator.email : 'Unknown',
        evalItem.score,
        evalItem.comments || '',
        formatDate(evalItem.submitted_at)
      ];
    });

    downloadExcel(headers, rows, "IPL_2026_Evaluations.xlsx");
    setSuccess("Evaluations history exported successfully to IPL_2026_Evaluations.xlsx");
  };

  // Helper formatting dates
  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // Render Access Denied if user role check fails
  if (profile?.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
          <ShieldAlert className="mx-auto h-16 w-16 text-red-500" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Access Denied</h1>
          <p className="mt-2 text-slate-600">
            You do not have administrator access.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-blue-900 cursor-pointer"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>
    );
  }

  // Filtered registrations based on search and filters
  const filteredRegistrations = registrations.filter(r => {
    // 1. Search Bar Match
    if (teamsSearch) {
      const searchLower = teamsSearch.toLowerCase().trim();
      const isNumeric = /^\d+$/.test(searchLower);
      const queryNum = isNumeric ? parseInt(searchLower, 10) : null;
      const isSingleDigit = searchLower.length === 1 && isNumeric;

      const includesQuery = (val) => {
        if (!val) return false;
        return String(val).toLowerCase().includes(searchLower);
      };

      const matchesTrlOrProductNumber = queryNum !== null && (r.trl_level === queryNum || r.product_number === queryNum);

      const matchesText =
        includesQuery(r.team_name) ||
        includesQuery(r.project_title) ||
        includesQuery(r.innovation_domain) ||
        includesQuery(r.problem_area) ||
        includesQuery(r.proposed_solution) ||
        includesQuery(r.expected_impact) ||

        // Leader info
        includesQuery(r.leader_name) ||
        includesQuery(r.leader_email) ||
        (!isSingleDigit && includesQuery(r.leader_mobile)) ||
        includesQuery(r.leader_department) ||

        // Member 2 info
        includesQuery(r.member2_name) ||
        includesQuery(r.member2_email) ||
        (!isSingleDigit && includesQuery(r.member2_mobile)) ||
        includesQuery(r.member2_department) ||

        // Member 3 info
        includesQuery(r.member3_name) ||
        includesQuery(r.member3_email) ||
        (!isSingleDigit && includesQuery(r.member3_mobile)) ||
        includesQuery(r.member3_department) ||

        // Mentor info
        includesQuery(r.mentor_name) ||
        includesQuery(r.mentor_department);

      const matchesRegId = isSingleDigit ? false : includesQuery(r.registration_id);

      if (!matchesTrlOrProductNumber && !matchesText && !matchesRegId) {
        return false;
      }
    }

    // 2. Department Filter
    if (filterDepartment) {
      const matchesLeaderDept = r.leader_department === filterDepartment;
      const matchesM2Dept = r.member2_department === filterDepartment;
      const matchesM3Dept = r.member3_department === filterDepartment;
      const matchesM4Dept = r.member4_department === filterDepartment;
      if (!matchesLeaderDept && !matchesM2Dept && !matchesM3Dept && !matchesM4Dept) {
        return false;
      }
    }

    // 3. Domain Filter
    if (filterDomain && r.innovation_domain !== filterDomain) {
      return false;
    }

    // 4. TRL Filter
    if (filterTrl && String(r.trl_level) !== String(filterTrl)) {
      return false;
    }

    return true;
  });

  // Pagination calculation
  const totalPages = Math.ceil(filteredRegistrations.length / 10);
  const activePage = Math.max(1, Math.min(currentPage, totalPages || 1));
  const startIndex = (activePage - 1) * 10;
  const endIndex = startIndex + 10;
  const paginatedRegistrations = filteredRegistrations.slice(startIndex, endIndex);

  // Pagination page numbers generator helper
  const getPageNumbers = (total, current) => {
    const pages = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      if (current <= 4) {
        pages.push(1, 2, 3, 4, 5, "...", total);
      } else if (current >= total - 3) {
        pages.push(1, "...", total - 4, total - 3, total - 2, total - 1, total);
      } else {
        pages.push(1, "...", current - 1, current, current + 1, "...", total);
      }
    }
    return pages;
  };

  return (
    <div className="min-h-screen bg-slate-50 font-body pt-20">
      {/* Fixed Compact Header - Redesigned to match White Public Navbar Style */}
      <header className="fixed top-0 left-0 right-0 z-40 border-b border-slate-200/80 bg-white/95 shadow-lg backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6 lg:px-8 w-full">
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-lg p-2 text-slate-800 transition-colors hover:bg-slate-100 md:hidden cursor-pointer"
              aria-label="Toggle menu"
            >
              <Menu size={20} />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className="flex shrink-0 items-center border-none bg-transparent p-0 cursor-pointer focus:outline-none"
              aria-label="Admin home"
            >
              <img
                src="/logo.png"
                alt="IPL Logo"
                className="h-10 w-auto object-contain md:h-12"
              />
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs md:text-sm">
            <div className="hidden text-right md:block">
              <p className="text-sm font-bold text-slate-800 uppercase tracking-wider leading-tight">
                ADMIN
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar Backdrop for Mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar Layout */}
      <aside
        className={`fixed bottom-0 top-20 left-0 z-30 w-64 border-r border-slate-200 bg-white transition-transform md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col justify-between py-6">
          <nav className="space-y-1 px-4" aria-label="Sidebar sections">
            {[
              { id: "overview", label: "Overview", icon: Users },
              { id: "phases", label: "Phases", icon: Layers },
              { id: "evaluators", label: "Evaluators", icon: UserPlus },
              { id: "teams", label: "Teams", icon: BookOpen },
              { id: "evaluations", label: "Evaluations", icon: ClipboardList },
              { id: "reports", label: "Reports", icon: Download }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSuccess("");
                    setSidebarOpen(false); // Close mobile menu drawer
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors cursor-pointer ${
                    isActive
                      ? "bg-blue-50 text-primary"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                  }`}
                >
                  <Icon size={18} />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="border-t border-slate-100 px-4 pt-4">
            <button
              type="button"
              onClick={() => {
                setSidebarOpen(false);
                onViewPublicPortal();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950 transition-colors cursor-pointer"
            >
              <LogOut size={18} className="rotate-180" />
              View Public Portal
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area (offset by sidebar width on desktop) */}
      <main className="md:pl-64 min-h-[calc(100vh-4rem)]">
        <div className={`mx-auto px-4 py-8 md:px-8 ${activeTab === "teams" ? "w-full max-w-none" : "max-w-7xl"}`}>

          {/* Alerts Block */}
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm" role="alert">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
              <div>
                <span className="font-bold">Error:</span> {error}
              </div>
            </div>
          )}

          {success && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700 shadow-sm" role="alert">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
              <div>
                <span className="font-bold">Success:</span> {success}
              </div>
            </div>
          )}

          {/* Loading state spinner */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
              <p className="mt-4 text-sm font-medium text-slate-500">Loading data...</p>
            </div>
          ) : (
            <>
              {/* Context header */}
              <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 capitalize md:text-2xl">
                    {activeTab === "reports" ? "Export Center" : activeTab === "teams" ? "Team Registrations" : activeTab === "evaluations" ? "Evaluations History" : activeTab}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {activeTab === "overview" && "High-level summary of program metrics."}
                    {activeTab === "phases" && "Configure evaluation windows. Only one phase can be active at a time."}
                    {activeTab === "evaluators" && "Add new evaluators and assign them to specific phases."}
                    {activeTab === "teams" && "Overview of all registered student teams."}
                    {activeTab === "evaluations" && "Review details and scores submitted by evaluators."}
                    {activeTab === "reports" && "Download reports and data in Excel-compatible format."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                  {refreshing ? "Refreshing..." : "Refresh Data"}
                </button>
              </div>

              {/* PANEL RENDERS */}

              {/* 1. OVERVIEW TAB */}
              {activeTab === "overview" && (
                <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Total Teams Card */}
                  <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-500 uppercase">Total Teams</span>
                      <span className="rounded-xl bg-blue-50 p-2 text-primary">
                        <BookOpen size={20} />
                      </span>
                    </div>
                    <p className="mt-4 text-3xl font-bold text-slate-900">{stats.totalTeams}</p>
                    <p className="mt-2 text-xs text-slate-500">Registered in public.teams</p>
                  </div>

                  {/* Total Students Card */}
                  <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-500 uppercase">Students</span>
                      <span className="rounded-xl bg-orange-50 p-2 text-accent">
                        <Users size={20} />
                      </span>
                    </div>
                    <p className="mt-4 text-3xl font-bold text-slate-900">{stats.totalStudents}</p>
                    <p className="mt-2 text-xs text-slate-500">Profiles with role student</p>
                  </div>

                  {/* Total Evaluators Card */}
                  <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-500 uppercase">Evaluators</span>
                      <span className="rounded-xl bg-green-50 p-2 text-green-600">
                        <UserPlus size={20} />
                      </span>
                    </div>
                    <p className="mt-4 text-3xl font-bold text-slate-900">{stats.totalEvaluators}</p>
                    <p className="mt-2 text-xs text-slate-500">Profiles with role evaluator</p>
                  </div>

                  {/* Active Phase Card */}
                  <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-500 uppercase">Active Phase</span>
                      <span className="rounded-xl bg-purple-50 p-2 text-purple-600">
                        <Layers size={20} />
                      </span>
                    </div>
                    <p className="mt-4 text-lg font-bold text-slate-900 truncate">
                      {stats.activePhaseName}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">Currently active evaluation round</p>
                  </div>

                  {/* Evaluations Stats Card */}
                  <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:col-span-2 lg:col-span-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-500 uppercase">Evaluations</span>
                      <span className="rounded-xl bg-purple-50 p-2 text-purple-600">
                        <ClipboardList size={20} />
                      </span>
                    </div>
                    <p className="mt-4 text-3xl font-bold text-slate-900">{stats.totalEvaluations}</p>
                    <p className="mt-2 text-xs text-slate-500">Total submitted grades</p>
                  </div>
                </section>
              )}

              {/* 2. PHASES TAB */}
              {activeTab === "phases" && (
                <div className="space-y-8">
                  {/* Registration Timer Card */}
                  {registrationTimer && (
                    <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 max-w-xl">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">Registration Timer</h3>
                          <p className="text-xs text-slate-500">Configure and manage the global student team registration window.</p>
                        </div>
                        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${
                          registrationTimer.timer_status === 'running' ? 'bg-green-50 text-green-700 ring-green-600/20 animate-pulse' :
                          registrationTimer.timer_status === 'paused' ? 'bg-amber-50 text-amber-700 ring-amber-600/20' :
                          registrationTimer.timer_status === 'closed' ? 'bg-slate-50 text-slate-600 ring-slate-500/10' :
                          registrationTimer.timer_status === 'completed' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' :
                          'bg-slate-50 text-slate-500 ring-slate-500/10'
                        }`}>
                          {registrationTimer.timer_status ? registrationTimer.timer_status.toUpperCase() : 'UPCOMING'}
                        </span>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        {/* Countdown */}
                        <div className="rounded-xl bg-slate-50 p-4 flex flex-col justify-center">
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Remaining Time</span>
                          <span className="font-mono text-xl font-bold text-slate-800 mt-1">
                            {regCountdown ? (
                              `${String(regCountdown.days).padStart(2, '0')}d : ` +
                              `${String(regCountdown.hours).padStart(2, '0')}h : ` +
                              `${String(regCountdown.minutes).padStart(2, '0')}m : ` +
                              `${String(regCountdown.seconds).padStart(2, '0')}s`
                            ) : registrationTimer.timer_status === 'closed' ? (
                              'Closed'
                            ) : registrationTimer.timer_status === 'completed' ? (
                              'Completed'
                            ) : (
                              '--d : --h : --m : --s'
                            )}
                          </span>
                        </div>

                        {/* Timing details */}
                        <div className="text-xs text-slate-600 flex flex-col justify-center space-y-1">
                          <div className="flex justify-between">
                            <span>Start:</span>
                            <span className="font-semibold text-slate-900">
                              {registrationTimer.scheduled_start_at ? new Date(registrationTimer.scheduled_start_at).toLocaleString() : 'Not scheduled'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>End:</span>
                            <span className="font-semibold text-slate-900">
                              {registrationTimer.scheduled_end_at ? new Date(registrationTimer.scheduled_end_at).toLocaleString() : 'Not scheduled'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Controls grid */}
                      <div className="mt-6 flex flex-wrap gap-2">
                        {registrationTimer.timer_status === 'upcoming' && (
                          <button
                            type="button"
                            disabled={updatingPhase}
                            onClick={handleStartRegTimer}
                            className="rounded-lg bg-primary hover:bg-blue-900 px-4 py-2 text-xs font-bold text-white transition cursor-pointer"
                          >
                            Start Timer
                          </button>
                        )}

                        {registrationTimer.timer_status === 'running' && (
                          <>
                            <button
                              type="button"
                              disabled={updatingPhase}
                              onClick={handlePauseRegTimer}
                              className="rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-xs font-bold text-white transition cursor-pointer"
                            >
                              Pause
                            </button>
                            <button
                              type="button"
                              disabled={updatingPhase}
                              onClick={handleStopRegTimer}
                              className="rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-bold text-white transition cursor-pointer"
                            >
                              Stop
                            </button>
                          </>
                        )}

                        {registrationTimer.timer_status === 'paused' && (
                          <>
                            <button
                              type="button"
                              disabled={updatingPhase}
                              onClick={handleResumeRegTimer}
                              className="rounded-lg bg-green-600 hover:bg-green-700 px-4 py-2 text-xs font-bold text-white transition cursor-pointer"
                            >
                              Resume
                            </button>
                            <button
                              type="button"
                              disabled={updatingPhase}
                              onClick={handleStopRegTimer}
                              className="rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-bold text-white transition cursor-pointer"
                            >
                              Stop
                            </button>
                          </>
                        )}

                        {(registrationTimer.timer_status === 'completed' || registrationTimer.timer_status === 'closed') && (
                          <button
                            type="button"
                            disabled={updatingPhase}
                            onClick={handleStartRegTimer}
                            className="rounded-lg bg-primary hover:bg-blue-900 px-4 py-2 text-xs font-bold text-white transition cursor-pointer"
                          >
                            Start Again
                          </button>
                        )}

                        {/* Modify and Extend */}
                        <button
                          type="button"
                          disabled={updatingPhase}
                          onClick={() => {
                            setModifyTimerType("registration");
                            setModifyTimerPhase(registrationTimer);
                            const start = splitIsoDateTime(registrationTimer.scheduled_start_at);
                            const end = splitIsoDateTime(registrationTimer.scheduled_end_at);
                            setStartDate(start.date);
                            setStartTime(start.time);
                            setEndDate(end.date);
                            setEndTime(end.time);
                          }}
                          className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 transition cursor-pointer"
                        >
                          Modify
                        </button>
                        <button
                          type="button"
                          disabled={updatingPhase}
                          onClick={() => {
                            setExtendTimerType("registration");
                            setExtendTimerPhase(registrationTimer);
                            setExtDays(0);
                            setExtHours(0);
                            setExtMinutes(0);
                            setExtSeconds(0);
                          }}
                          className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 transition cursor-pointer"
                        >
                          Extend
                        </button>
                      </div>
                    </article>
                  )}

                  {/* Phase Timer Cards */}
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 mb-4">Phase Timers</h3>
                    <section className="grid gap-6 md:grid-cols-3">
                      {phases.map((phase) => (
                        <article
                          key={phase.id}
                          className="flex flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
                        >
                      <div className="flex items-center justify-between">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-primary">
                          PHASE {phase.phase_number}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            phase.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {phase.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <h3 className="mt-4 text-lg font-bold text-slate-900">
                        {phase.name}
                      </h3>
                      <p className="mt-2 flex-grow text-sm leading-6 text-slate-600">
                        {phase.description}
                      </p>

                      <div className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-600">
                        <div className="flex justify-between">
                          <span>Duration:</span>
                          <span className="font-semibold text-slate-900">{phase.duration}</span>
                        </div>
                        <div className="mt-2 flex justify-between">
                          <span>Max Score:</span>
                          <span className="font-semibold text-slate-900">{phase.max_score} pts</span>
                        </div>
                      </div>

                      {/* Phase Timer controls section */}
                      <div className="mt-5 border-t border-slate-100 pt-4">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Phase Timer</h4>

                        {/* Status and Countdown */}
                        <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 mb-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500">Status:</span>
                            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-bold ring-1 ring-inset ${
                              phase.timer_status === 'running' ? 'bg-green-50 text-green-700 ring-green-600/20 animate-pulse' :
                              phase.timer_status === 'paused' ? 'bg-amber-50 text-amber-700 ring-amber-600/20' :
                              phase.timer_status === 'closed' ? 'bg-slate-50 text-slate-600 ring-slate-500/10' :
                              phase.timer_status === 'completed' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' :
                              'bg-slate-50 text-slate-500 ring-slate-500/10'
                            }`}>
                              {phase.timer_status ? phase.timer_status.toUpperCase() : 'UPCOMING'}
                            </span>
                          </div>

                          {/* Countdown display */}
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs font-medium text-slate-500">Remaining:</span>
                            <span className="font-mono text-sm font-bold text-slate-800">
                              {countdownStates[phase.id] ? (
                                `${String(countdownStates[phase.id].days).padStart(2, '0')}d : ` +
                                `${String(countdownStates[phase.id].hours).padStart(2, '0')}h : ` +
                                `${String(countdownStates[phase.id].minutes).padStart(2, '0')}m : ` +
                                `${String(countdownStates[phase.id].seconds).padStart(2, '0')}s`
                              ) : phase.timer_status === 'closed' ? (
                                'Closed'
                              ) : phase.timer_status === 'completed' ? (
                                'Completed'
                              ) : (
                                '--d : --h : --m : --s'
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons based on status */}
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          {phase.timer_status === 'upcoming' && (
                            <button
                              type="button"
                              disabled={updatingPhase || !phase.is_active}
                              onClick={() => handleStartTimer(phase)}
                              className="col-span-2 rounded-lg bg-primary hover:bg-blue-900 py-1.5 text-xs font-bold text-white transition disabled:opacity-40 disabled:hover:bg-primary cursor-pointer text-center"
                            >
                              {phase.is_active ? "Start" : "Start (Activate Phase first)"}
                            </button>
                          )}

                          {phase.timer_status === 'running' && (
                            <>
                              <button
                                type="button"
                                disabled={updatingPhase}
                                onClick={() => handlePauseTimer(phase)}
                                className="rounded-lg bg-amber-500 hover:bg-amber-600 py-1.5 text-xs font-bold text-white transition cursor-pointer text-center"
                              >
                                Pause
                              </button>
                              <button
                                type="button"
                                disabled={updatingPhase}
                                onClick={() => handleStopTimer(phase)}
                                className="rounded-lg bg-red-600 hover:bg-red-700 py-1.5 text-xs font-bold text-white transition cursor-pointer text-center"
                              >
                                Stop
                              </button>
                            </>
                          )}

                          {phase.timer_status === 'paused' && (
                            <>
                              <button
                                type="button"
                                disabled={updatingPhase}
                                onClick={() => handleResumeTimer(phase)}
                                className="rounded-lg bg-green-600 hover:bg-green-700 py-1.5 text-xs font-bold text-white transition cursor-pointer text-center"
                              >
                                Resume
                              </button>
                              <button
                                type="button"
                                disabled={updatingPhase}
                                onClick={() => handleStopTimer(phase)}
                                className="rounded-lg bg-red-600 hover:bg-red-700 py-1.5 text-xs font-bold text-white transition cursor-pointer text-center"
                              >
                                Stop
                              </button>
                            </>
                          )}

                          {(phase.timer_status === 'completed' || phase.timer_status === 'closed') && (
                            <button
                              type="button"
                              disabled={updatingPhase || !phase.is_active}
                              onClick={() => handleStartTimer(phase)}
                              className="col-span-2 rounded-lg bg-primary hover:bg-blue-900 py-1.5 text-xs font-bold text-white transition disabled:opacity-40 disabled:hover:bg-primary cursor-pointer text-center"
                            >
                              {phase.is_active ? "Start Again" : "Start Again (Activate Phase first)"}
                            </button>
                          )}
                        </div>

                        {/* Modify & Extend always visible for every phase */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={updatingPhase}
                            onClick={() => {
                              setModifyTimerType("phase");
                              setModifyTimerPhase(phase);
                              const start = splitIsoDateTime(phase.scheduled_start_at);
                              const end = splitIsoDateTime(phase.scheduled_end_at);
                              setStartDate(start.date);
                              setStartTime(start.time);
                              setEndDate(end.date);
                              setEndTime(end.time);
                            }}
                            className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 py-1.5 text-xs font-bold text-slate-700 transition cursor-pointer text-center"
                          >
                            Modify
                          </button>
                          <button
                            type="button"
                            disabled={updatingPhase}
                            onClick={() => {
                              setExtendTimerType("phase");
                              setExtendTimerPhase(phase);
                              setExtDays(0);
                              setExtHours(0);
                              setExtMinutes(0);
                              setExtSeconds(0);
                            }}
                            className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 py-1.5 text-xs font-bold text-slate-700 transition cursor-pointer text-center"
                          >
                            Extend
                          </button>
                        </div>
                      </div>

                      <div className="mt-6 pt-4">
                        {phase.is_active ? (
                          <button
                            type="button"
                            disabled={updatingPhase}
                            onClick={() => handleDeactivatePhase(phase)}
                            className="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                          >
                            Deactivate Phase
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={updatingPhase}
                            onClick={() => setConfirmActivatePhase(phase)}
                            className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition hover:bg-blue-900 disabled:opacity-50 cursor-pointer"
                          >
                            Activate Phase
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                    </section>
                  </div>
                </div>
              )}

              {/* 3. EVALUATORS TAB */}
              {activeTab === "evaluators" && (
                <section className="space-y-8">
                  {/* 3a. Add Evaluator form */}
                  <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                    <h3 className="text-lg font-bold text-slate-900">Add Evaluator Profile</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Promote a registered student account to the evaluator role. They must already have logged in at least once to create their profile.
                    </p>

                    <form onSubmit={handleAddEvaluator} className="mt-4 flex flex-col gap-3 sm:flex-row sm:max-w-xl">
                      <div className="grow">
                        <label htmlFor="evaluator-email" className="sr-only">Email address</label>
                        <input
                          id="evaluator-email"
                          type="email"
                          required
                          placeholder="e.g. professor@sece.ac.in"
                          value={newEvaluatorEmail}
                          onChange={(e) => setNewEvaluatorEmail(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none ring-primary transition focus:border-primary focus:ring-2"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={submittingEvaluator || !newEvaluatorEmail.trim()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-white shadow transition hover:bg-amber-600 disabled:opacity-50 cursor-pointer"
                      >
                        <UserPlus size={16} />
                        {submittingEvaluator ? "Adding..." : "Add Evaluator"}
                      </button>
                    </form>
                  </div>

                  {/* 3b. Evaluators list */}
                  <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                    <h3 className="text-lg font-bold text-slate-900">Evaluators Pool</h3>
                    {evaluators.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-500 italic">No evaluators have been added yet.</p>
                    ) : (
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full border-collapse text-left text-sm text-slate-600">
                          <thead className="bg-slate-50 text-xs font-bold text-slate-700 uppercase">
                            <tr>
                              <th className="px-6 py-3 border-b border-slate-200">Name</th>
                              <th className="px-6 py-3 border-b border-slate-200">Email</th>
                              <th className="px-6 py-3 border-b border-slate-200">Date Added</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {evaluators.map((evaluator) => (
                              <tr key={evaluator.user_id} className="hover:bg-slate-50/50">
                                <td className="px-6 py-4 font-semibold text-slate-900">{evaluator.name || "N/A"}</td>
                                <td className="px-6 py-4">{evaluator.email}</td>
                                <td className="px-6 py-4">{formatDate(evaluator.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* 3c. Phase Assignments */}
                  <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                    <h3 className="text-lg font-bold text-slate-900">Phase-wise Evaluator Assignments</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Assign the evaluators defined in the pool to active evaluation phases.
                    </p>

                    <div className="mt-6 grid gap-6 md:grid-cols-3">
                      {phases.map((phase) => {
                        // Get assignments for this phase
                        const phaseAssignments = assignments.filter(a => a.phase_id === phase.id);
                        // Map to evaluator profiles
                        const assignedEvaluators = phaseAssignments.map(a => {
                          const profileData = evaluators.find(e => e.user_id === a.evaluator_user_id);
                          return {
                            assignmentId: a.id,
                            userId: a.evaluator_user_id,
                            name: profileData?.name || "Unknown Name",
                            email: profileData?.email || "Unknown Email"
                          };
                        });

                        // Available to assign (in pool but not assigned to this phase)
                        const availableEvaluators = evaluators.filter(e =>
                          !assignedEvaluators.some(ae => ae.userId === e.user_id)
                        );

                        const selectedEvaluatorId = assigneeForPhase[phase.id] || "";
                        const isWorking = submittingAssignment[phase.id] !== null && submittingAssignment[phase.id] !== undefined;

                        return (
                          <div key={phase.id} className="rounded-xl border border-slate-150 bg-slate-50/50 p-5 shadow-sm ring-1 ring-slate-200/40">
                            <h4 className="font-heading text-sm font-bold text-slate-950">
                              Phase {phase.phase_number}: {phase.name}
                            </h4>

                            {/* List of assigned */}
                            <div className="mt-4 space-y-2">
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Assigned Evaluators</p>
                              {assignedEvaluators.length === 0 ? (
                                <p className="text-xs text-slate-500 italic py-2">No evaluators assigned.</p>
                              ) : (
                                <ul className="divide-y divide-slate-200/60">
                                  {assignedEvaluators.map((ae) => (
                                    <li key={ae.assignmentId} className="flex items-center justify-between py-2 text-xs">
                                      <div className="min-w-0 pr-2">
                                        <p className="font-semibold text-slate-900 truncate">{ae.name}</p>
                                        <p className="text-slate-500 truncate">{ae.email}</p>
                                      </div>
                                      <button
                                        type="button"
                                        disabled={isWorking}
                                        onClick={() => handleRemoveEvaluator(ae.assignmentId, phase.id)}
                                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition cursor-pointer"
                                        title="Remove from phase"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            {/* Assignment form */}
                            <div className="mt-5 border-t border-slate-200/60 pt-4">
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Assign New</p>
                              {availableEvaluators.length === 0 ? (
                                <p className="text-xs text-slate-500 italic">No pool evaluators available.</p>
                              ) : (
                                <div className="flex gap-2">
                                  <select
                                    value={selectedEvaluatorId}
                                    onChange={(e) => setAssigneeForPhase(prev => ({ ...prev, [phase.id]: e.target.value }))}
                                    disabled={isWorking}
                                    className="grow rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-primary"
                                  >
                                    <option value="">-- Choose Evaluator --</option>
                                    {availableEvaluators.map((e) => (
                                      <option key={e.user_id} value={e.user_id}>
                                        {e.name || e.email}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    disabled={isWorking || !selectedEvaluatorId}
                                    onClick={() => handleAssignEvaluator(phase.id)}
                                    className="inline-flex items-center justify-center rounded-lg bg-primary p-2 text-white hover:bg-blue-900 disabled:opacity-50 cursor-pointer"
                                    title="Assign to phase"
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}

              {/* 4. TEAMS TAB */}
              {activeTab === "teams" && (
                <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                  <div className="flex flex-col gap-4 mb-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="grow max-w-md">
                        <label htmlFor="search-teams" className="sr-only">Search teams</label>
                        <input
                          id="search-teams"
                          type="text"
                          placeholder="Search by ID, name, project, domain, or leader..."
                          value={teamsSearch}
                          onChange={(e) => {
                            setTeamsSearch(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none ring-primary focus:border-primary focus:ring-2"
                        />
                      </div>
                      <div className="flex items-center gap-3 justify-between sm:justify-end">
                        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full whitespace-nowrap">
                          {filteredRegistrations.length} of {registrations.length} Teams
                        </span>
                        <button
                          type="button"
                          onClick={handleExportTeams}
                          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white shadow hover:bg-amber-600 cursor-pointer whitespace-nowrap"
                        >
                          <Download size={14} />
                          Export Teams
                        </button>
                      </div>
                    </div>

                    {/* Filter controls row */}
                    <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center sm:gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/65">
                      <div className="flex flex-col grow min-w-[150px]">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Department</label>
                        <select
                          value={filterDepartment}
                          onChange={(e) => { setFilterDepartment(e.target.value); setCurrentPage(1); }}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-primary text-slate-700 font-medium"
                        >
                          <option value="">All Departments</option>
                          {departmentsList.map(dept => (
                            <option key={dept.id} value={dept.name}>{dept.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col grow min-w-[150px]">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Innovation Domain</label>
                        <select
                          value={filterDomain}
                          onChange={(e) => { setFilterDomain(e.target.value); setCurrentPage(1); }}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-primary text-slate-700 font-medium"
                        >
                          <option value="">All Domains</option>
                          {Array.from(new Set(registrations.map(r => r.innovation_domain).filter(Boolean))).sort().map(domain => (
                            <option key={domain} value={domain}>{domain}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col grow min-w-[90px] max-w-[150px]">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">TRL Level</label>
                        <select
                          value={filterTrl}
                          onChange={(e) => { setFilterTrl(e.target.value); setCurrentPage(1); }}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-primary text-slate-700 font-medium"
                        >
                          <option value="">All TRL</option>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                            <option key={num} value={String(num)}>TRL {num}</option>
                          ))}
                        </select>
                      </div>

                      {(filterDepartment || filterDomain || filterTrl || teamsSearch) && (
                        <div className="flex items-end col-span-2 sm:col-span-1">
                          <button
                            type="button"
                            onClick={() => {
                              setFilterDepartment("");
                              setFilterDomain("");
                              setFilterTrl("");
                              setTeamsSearch("");
                              setCurrentPage(1);
                            }}
                            className="w-full text-xs text-red-500 hover:text-red-700 font-semibold px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition cursor-pointer"
                          >
                            Clear Filters
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {filteredRegistrations.length === 0 ? (
                    <p className="text-sm text-slate-500 italic py-8 text-center bg-slate-50 rounded-xl">No matching teams found.</p>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-inner">
                      <table className="w-full border-collapse text-left text-sm text-slate-600 min-w-[1600px]">
                        <thead className="bg-slate-50 font-bold text-slate-700 uppercase border-b border-slate-200">
                          <tr>
                            <th className="px-5 py-4 w-32 min-w-[120px]">Reg ID</th>
                            <th className="px-5 py-4 w-64 min-w-[220px]">Team Name</th>
                            <th className="px-5 py-4 w-96 min-w-[360px]">Project Title</th>
                            <th className="px-5 py-4 w-52 min-w-[180px]">Domain</th>
                            <th className="px-5 py-4 w-28 min-w-[100px]">TRL</th>
                            <th className="px-5 py-4 w-64 min-w-[220px]">Team Leader</th>
                            <th className="px-5 py-4 w-72 min-w-[260px]">Members</th>
                            <th className="px-5 py-4 w-56 min-w-[200px]">Faculty Mentor</th>
                            <th className="px-5 py-4 w-36 min-w-[130px]">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {paginatedRegistrations.map((team) => (
                            <tr key={team.id} className="hover:bg-slate-50/50 align-top">
                              <td className="px-5 py-4 font-bold text-primary select-all">{team.registration_id}</td>
                              <td className="px-5 py-4 font-semibold text-slate-900 whitespace-pre-wrap">{team.team_name}</td>
                              <td className="px-5 py-4 whitespace-pre-wrap text-slate-800 leading-relaxed font-medium">
                                {team.project_title}
                              </td>
                              <td className="px-5 py-4 whitespace-pre-wrap text-xs font-semibold bg-slate-50/30">{team.innovation_domain}</td>
                              <td className="px-5 py-4 whitespace-nowrap">
                                {team.trl_level !== null && team.trl_level !== undefined ? (
                                  <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-600/20">
                                    TRL {team.trl_level}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic">N/A</span>
                                )}
                              </td>
                              <td className="px-5 py-4">
                                <div className="space-y-0.5">
                                  <p className="font-bold text-slate-900">{team.leader_name}</p>
                                  <p className="text-[11px] text-slate-500 select-all">{team.leader_email}</p>
                                  <p className="text-[11px] text-slate-500">{team.leader_mobile}</p>
                                  <p className="text-[10px] inline-block bg-blue-50 text-primary px-1.5 py-0.5 rounded font-bold uppercase">{team.leader_department}</p>
                                </div>
                              </td>
                              <td className="px-5 py-4">
                                <ul className="space-y-2">
                                  {team.member2_name && (
                                    <li className="text-xs">
                                      <p className="font-semibold text-slate-800">{team.member2_name}</p>
                                      <p className="text-[10px] text-slate-400 select-all">{team.member2_email}</p>
                                      <p className="text-[10px] text-slate-400">{team.member2_mobile} | {team.member2_department}</p>
                                    </li>
                                  )}
                                  {team.member3_name && (
                                    <li className="text-xs border-t border-slate-100 pt-1.5">
                                      <p className="font-semibold text-slate-800">{team.member3_name}</p>
                                      <p className="text-[10px] text-slate-400 select-all">{team.member3_email}</p>
                                      <p className="text-[10px] text-slate-400">{team.member3_mobile} | {team.member3_department}</p>
                                    </li>
                                  )}
                                  {team.member4_name && (
                                    <li className="text-xs border-t border-slate-100 pt-1.5">
                                      <p className="font-semibold text-slate-800">{team.member4_name}</p>
                                      <p className="text-[10px] text-slate-400 select-all">{team.member4_email}</p>
                                      <p className="text-[10px] text-slate-400">{team.member4_mobile} | {team.member4_department}</p>
                                    </li>
                                  )}
                                </ul>
                              </td>
                              <td className="px-5 py-4">
                                <div className="space-y-0.5">
                                  <p className="font-bold text-slate-900">{team.mentor_name}</p>
                                  <p className="text-[11px] text-slate-500">{team.mentor_department} Dept</p>
                                </div>
                              </td>
                              <td className="px-5 py-4 whitespace-nowrap text-slate-500">
                                {formatDate(team.created_at).split(",")[0]}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Client-side Pagination Controls */}
                  {filteredRegistrations.length > 0 && (
                    <div className="mt-6 flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-6 sm:flex-row">
                      <span className="text-xs text-slate-500 font-medium">
                        Showing <span className="font-bold text-slate-800">{startIndex + 1}</span> to{" "}
                        <span className="font-bold text-slate-800">
                          {Math.min(endIndex, filteredRegistrations.length)}
                        </span>{" "}
                        of <span className="font-bold text-slate-800">{filteredRegistrations.length}</span> teams
                      </span>

                      <div className="flex items-center gap-1.5" aria-label="Pagination navigation">
                        <button
                          type="button"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={activePage === 1}
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white cursor-pointer select-none"
                        >
                          &larr; Previous
                        </button>

                        <div className="hidden items-center gap-1 sm:flex">
                          {getPageNumbers(totalPages, activePage).map((page, index) => {
                            if (page === "...") {
                              return (
                                <span
                                  key={`ellipse-${index}`}
                                  className="inline-flex h-9 w-9 items-center justify-center text-xs font-semibold text-slate-400"
                                >
                                  ...
                                </span>
                              );
                            }
                            const isCurrent = page === activePage;
                            return (
                              <button
                                key={`page-${page}`}
                                type="button"
                                onClick={() => setCurrentPage(page)}
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold transition cursor-pointer ${
                                  isCurrent
                                    ? "bg-accent text-white shadow-sm hover:bg-amber-600"
                                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                }`}
                              >
                                {page}
                              </button>
                            );
                          })}
                        </div>

                        <span className="text-xs font-bold text-slate-700 sm:hidden px-2">
                          Page {activePage} of {totalPages}
                        </span>

                        <button
                          type="button"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={activePage === totalPages}
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white cursor-pointer select-none"
                        >
                          Next &rarr;
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* 5. EVALUATIONS TAB */}
              {activeTab === "evaluations" && (
                <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-900">Submitted Evaluations</h3>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                        {evaluations.length} Evaluations Record
                      </span>
                      <button
                        type="button"
                        onClick={handleExportEvaluations}
                        className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white shadow hover:bg-amber-600 cursor-pointer whitespace-nowrap"
                      >
                        <Download size={14} />
                        Export Evaluations
                      </button>
                    </div>
                  </div>

                  {evaluations.length === 0 ? (
                    <p className="text-sm text-slate-500 italic py-8 text-center bg-slate-50 rounded-xl">No evaluations have been submitted yet.</p>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full border-collapse text-left text-xs text-slate-600 min-w-[700px]">
                        <thead className="bg-slate-50 font-bold text-slate-700 uppercase border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3">Phase</th>
                            <th className="px-4 py-3">Reg ID</th>
                            <th className="px-4 py-3">Team / Project</th>
                            <th className="px-4 py-3">Evaluator</th>
                            <th className="px-4 py-3">Score</th>
                            <th className="px-4 py-3">Comments</th>
                            <th className="px-4 py-3">Submitted At</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {evaluations.map((evalItem) => {
                            const phase = phases.find(p => p.id === evalItem.phase_id);
                            const evaluator = evaluators.find(e => e.user_id === evalItem.evaluator_user_id);
                            const registration = registrations.find(r => r.registration_id === evalItem.registration_id);

                            return (
                              <tr key={evalItem.id} className="hover:bg-slate-50/50 align-top">
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="rounded bg-blue-50 px-2.5 py-1 font-bold text-primary">
                                    Phase {phase?.phase_number || "?"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-semibold text-primary">{evalItem.registration_id}</td>
                                <td className="px-4 py-3">
                                  <p className="font-bold text-slate-900">{registration?.team_name || "N/A"}</p>
                                  <p className="text-[10px] text-slate-500 truncate max-w-[180px]" title={registration?.project_title}>
                                    {registration?.project_title || "N/A"}
                                  </p>
                                </td>
                                <td className="px-4 py-3">
                                  <p className="font-semibold text-slate-800">{evaluator?.name || "N/A"}</p>
                                  <p className="text-[10px] text-slate-500">{evaluator?.email}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="font-heading text-sm font-bold text-slate-900">
                                    {Number(evalItem.score).toFixed(2)}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-semibold"> / {phase?.max_score || 100}</span>
                                </td>
                                <td className="px-4 py-3 max-w-[200px] whitespace-pre-wrap leading-relaxed">
                                  {evalItem.comments || <span className="text-slate-400 italic">No comments</span>}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                                  {formatDate(evalItem.submitted_at)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              {/* 6. REPORTS TAB */}
              {activeTab === "reports" && (
                <section className="grid gap-6 md:grid-cols-2">
                  {/* Export Teams Card */}
                  <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-primary">
                      <BookOpen size={24} />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-slate-900">Registered Teams Report</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Download the complete roster of registered teams, project titles, domains, leader contacts, full member listings, and mentor details in an Excel-compatible CSV format.
                    </p>
                    <button
                      type="button"
                      onClick={handleExportTeams}
                      className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-amber-600 cursor-pointer"
                    >
                      <Download size={16} />
                      Export Teams
                    </button>
                  </div>

                  {/* Export Evaluations Card */}
                  <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-600">
                      <ClipboardList size={24} />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-slate-900">Evaluations History Report</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Download all grading records submitted by evaluators, including phase numbers, target team IDs, evaluator names, scoring breakdowns, comments, and submission dates.
                    </p>
                    <button
                      type="button"
                      onClick={handleExportEvaluations}
                      className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-amber-600 cursor-pointer"
                    >
                      <Download size={16} />
                      Export Evaluations
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>

      {/* Export Registration Data Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsExportModalOpen(false)}></div>

          {/* Card */}
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-heading text-lg font-bold text-slate-900">
                  EXPORT REGISTRATION DATA
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Select the information groups and columns you want to download.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Selection Area (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Download All Columns Option */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <input
                  type="checkbox"
                  id="col-all-cols"
                  checked={isAllColumnsSelected}
                  onChange={(e) => handleToggleAllColumnsCheckbox(e.target.checked)}
                  className="h-4.5 w-4.5 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                />
                <label htmlFor="col-all-cols" className="text-sm font-bold text-slate-800 cursor-pointer select-none">
                  DOWNLOAD ALL COLUMNS
                </label>
              </div>

              {/* Select All / Clear All Links */}
              <div className="flex items-center gap-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-primary hover:underline cursor-pointer"
                >
                  SELECT ALL
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-slate-500 hover:underline cursor-pointer"
                >
                  CLEAR ALL
                </button>
              </div>

              {/* Grouped Grid checkboxes */}
              <div className="space-y-6">
                {EXPORT_COLUMN_GROUPS.map(group => (
                  <div key={group.name} className="space-y-2.5">
                    <h4 className="text-xs font-extrabold text-slate-400 tracking-wider uppercase border-b border-slate-100 pb-1.5">
                      {group.name}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {group.columns.map(col => {
                        const isChecked = selectedColumns.has(col.key);
                        return (
                          <div key={col.key} className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              id={`col-${col.key}`}
                              checked={isChecked}
                              onChange={() => handleToggleColumn(col.key)}
                              className="h-4.5 w-4.5 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer mt-0.5"
                            />
                            <label htmlFor={`col-${col.key}`} className="text-xs font-medium text-slate-700 cursor-pointer select-none leading-normal">
                              {col.label}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer Summary & Actions */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <span className="text-xs font-extrabold text-slate-700 block">
                  {selectedColumns.size} {selectedColumns.size === 1 ? 'column' : 'columns'} selected
                </span>
                <span className="text-[11px] font-medium text-slate-500 block mt-0.5">
                  {filteredRegistrations.length} {filteredRegistrations.length === 1 ? 'registration' : 'registrations'} to download
                </span>
              </div>

              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  className="flex-1 sm:flex-none rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedColumns.size === 0}
                  onClick={handleDownloadExport}
                  className={`flex-1 sm:flex-none rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all ${
                    selectedColumns.size === 0
                      ? 'bg-slate-300 cursor-not-allowed shadow-none'
                      : 'bg-primary hover:bg-blue-900 cursor-pointer'
                  }`}
                >
                  Download XLSX
                </button>
              </div>
            </div>
            {selectedColumns.size === 0 && (
              <div className="px-6 pb-4 bg-slate-50 rounded-b-2xl text-center">
                <span className="text-xs text-rose-500 font-bold">
                  Please select at least one column.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal for Phase Activation */}
      {confirmActivatePhase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setConfirmActivatePhase(null)}></div>

          {/* Card */}
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-center gap-3 text-amber-500">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="font-heading text-lg font-bold text-slate-900">
                Activate Phase {confirmActivatePhase.phase_number}?
              </h3>
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              You are about to activate <span className="font-bold text-slate-800">Phase {confirmActivatePhase.phase_number}: {confirmActivatePhase.name}</span>.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Only <span className="font-semibold text-slate-800">one phase</span> can be active at a time. All other phases will be set to inactive automatically.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmActivatePhase(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleActivatePhase}
                className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-blue-900 cursor-pointer"
              >
                Activate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modify Timer Modal */}
      {modifyTimerPhase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setModifyTimerPhase(null)}></div>
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <h3 className="font-heading text-lg font-bold text-slate-900 mb-4">
              Modify {modifyTimerType === "registration" ? "Registration" : `Phase ${modifyTimerPhase.phase_number}`} Timer
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Scheduled Start</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Scheduled End</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModifyTimerPhase(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => modifyTimerType === "registration" ? handleModifyRegTimer() : handleModifyTimer(modifyTimerPhase)}
                className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-blue-900 cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Timer Modal */}
      {extendTimerPhase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setExtendTimerPhase(null)}></div>
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <h3 className="font-heading text-lg font-bold text-slate-900 mb-4">
              Extend {extendTimerType === "registration" ? "Registration" : `Phase ${extendTimerPhase.phase_number}`} Timer
            </h3>

            {/* Quick Add Buttons */}
            <div className="mb-6">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Quick Extend Options</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => extendTimerType === "registration" ? handleExtendRegTimer(3600) : handleExtendTimer(extendTimerPhase, 3600)}
                  className="rounded-lg border border-slate-200 hover:bg-slate-50 py-2 text-xs font-bold text-slate-700 transition cursor-pointer text-center"
                >
                  +1 Hour
                </button>
                <button
                  type="button"
                  onClick={() => extendTimerType === "registration" ? handleExtendRegTimer(6 * 3600) : handleExtendTimer(extendTimerPhase, 6 * 3600)}
                  className="rounded-lg border border-slate-200 hover:bg-slate-50 py-2 text-xs font-bold text-slate-700 transition cursor-pointer text-center"
                >
                  +6 Hours
                </button>
                <button
                  type="button"
                  onClick={() => extendTimerType === "registration" ? handleExtendRegTimer(24 * 3600) : handleExtendTimer(extendTimerPhase, 24 * 3600)}
                  className="rounded-lg border border-slate-200 hover:bg-slate-50 py-2 text-xs font-bold text-slate-700 transition cursor-pointer text-center"
                >
                  +1 Day
                </button>
              </div>
            </div>

            {/* Custom Duration Form */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Custom Extension Duration</p>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 text-center">Days</label>
                  <input
                    type="number"
                    min="0"
                    value={extDays}
                    onChange={(e) => setExtDays(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full text-center rounded-lg border border-slate-300 py-1 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 text-center">Hours</label>
                  <input
                    type="number"
                    min="0"
                    value={extHours}
                    onChange={(e) => setExtHours(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full text-center rounded-lg border border-slate-300 py-1 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 text-center">Mins</label>
                  <input
                    type="number"
                    min="0"
                    value={extMinutes}
                    onChange={(e) => setExtMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full text-center rounded-lg border border-slate-300 py-1 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 text-center">Secs</label>
                  <input
                    type="number"
                    min="0"
                    value={extSeconds}
                    onChange={(e) => setExtSeconds(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full text-center rounded-lg border border-slate-300 py-1 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setExtendTimerPhase(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const totalSeconds = (extDays * 24 * 3600) + (extHours * 3600) + (extMinutes * 60) + extSeconds;
                  if (totalSeconds > 0) {
                    if (extendTimerType === "registration") {
                      handleExtendRegTimer(totalSeconds);
                    } else {
                      handleExtendTimer(extendTimerPhase, totalSeconds);
                    }
                  }
                }}
                className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-blue-900 cursor-pointer"
              >
                Apply Extension
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
