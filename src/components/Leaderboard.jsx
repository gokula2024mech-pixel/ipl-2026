import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Building,
  Cpu,
  AlertCircle,
  Users,
  LayoutDashboard,
  Compass,
  Layers,
  Award,
  Vote,
  Radio,
  CheckCircle,
  Search,
  Filter,
  Sparkles,
  RefreshCw,
  QrCode,
  ArrowRight,
} from "lucide-react";
import SectionReveal from "./SectionReveal";
import MechanicalLoader from "./MechanicalLoader";
import VotingModal from "./VotingModal";
import { supabase } from "../supabaseClient";

// Reusable SVG Mechanical Gear Helper
function Gear({
  size = 30,
  rotation = 0,
  className = "",
  color = "currentColor",
}) {
  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  const transitionStyle = prefersReducedMotion
    ? "none"
    : "transform 0.6s cubic-bezier(0.15, 0.85, 0.3, 1)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={{
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "50% 50%",
        transition: transitionStyle,
      }}
    >
      <circle
        cx="50"
        cy="50"
        r="15"
        fill="none"
        stroke={color}
        strokeWidth="6"
      />
      {/* Outer ring */}
      <circle
        cx="50"
        cy="50"
        r="35"
        fill="none"
        stroke={color}
        strokeWidth="8"
      />
      {/* Shaft keyway hole */}
      <circle cx="50" cy="50" r="8" fill={color} />
      {/* Gear teeth */}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
        <path
          key={deg}
          d="M 46,10 L 54,10 L 56,22 L 44,22 Z"
          fill={color}
          transform={`rotate(${deg} 50 50)`}
        />
      ))}
      {/* Spokes */}
      {[0, 60, 120].map((deg) => (
        <rect
          key={deg}
          x="46"
          y="15"
          width="8"
          height="70"
          fill={color}
          transform={`rotate(${deg} 50 50)`}
        />
      ))}
    </svg>
  );
}

// Reusable Mechanical Rank Badge Helper
function RankBadge({ rank, size = 36 }) {
  if (rank === 1) {
    return (
      <div
        className="relative flex items-center justify-center mx-auto shrink-0"
        style={{ width: size, height: size }}
      >
        <Gear
          size={size}
          rotation={0}
          color="#FFB000"
          className="animate-[spin_20s_linear_infinite]"
        />
        <span className="absolute font-black text-xs text-[#0B1B3A] z-10">
          1
        </span>
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div
        className="relative flex items-center justify-center mx-auto shrink-0"
        style={{ width: size, height: size }}
      >
        <Gear
          size={size}
          rotation={15}
          color="#94a3b8"
          className="animate-[spin_25s_linear_infinite_reverse]"
        />
        <span className="absolute font-black text-xs text-[#0B1B3A] z-10">
          2
        </span>
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div
        className="relative flex items-center justify-center mx-auto shrink-0"
        style={{ width: size, height: size }}
      >
        <Gear
          size={size}
          rotation={30}
          color="#cd7f32"
          className="animate-[spin_30s_linear_infinite]"
        />
        <span className="absolute font-black text-xs text-[#0B1B3A] z-10">
          3
        </span>
      </div>
    );
  }
  return (
    <div
      className="relative flex items-center justify-center rounded-full bg-slate-100 border border-slate-300 shadow-inner font-black text-xs text-[#0B1B3A] mx-auto shrink-0"
      style={{ width: size - 4, height: size - 4 }}
    >
      <div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 rounded-full bg-slate-400" />
      <div className="absolute bottom-0.5 right-0.5 w-0.5 h-0.5 rounded-full bg-slate-400" />
      {rank}
    </div>
  );
}

// Reusable Mini Interlocking Mechanical Gears Indicator
function MechanicalGearsMini({ scrollProgress }) {
  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const rotClockwise = prefersReducedMotion ? 0 : scrollProgress * 720;
  const rotCounterClockwise = prefersReducedMotion ? 0 : -scrollProgress * 720;

  return (
    <div
      className="flex items-center gap-0.5 px-2 py-1 bg-slate-100 border border-slate-300 rounded-full shadow-inner select-none pointer-events-none shrink-0"
      title="Transmission telemetry linked to scroll"
    >
      {/* Gear 1: Clockwise */}
      <Gear size={12} rotation={rotClockwise} color="#24449A" />
      {/* Gear 2: Counter-Clockwise */}
      <Gear size={10} rotation={rotCounterClockwise} color="#FFA500" />
      {/* Gear 3: Clockwise */}
      <Gear size={12} rotation={rotClockwise} color="#24449A" />
    </div>
  );
}

const OFFICIAL_DEPARTMENTS = [
  'Artificial Intelligence and Data Science',
  'Artificial Intelligence and Machine Learning',
  'Computer and Communication Engineering',
  'Computer Science and Business System',
  'Computer Science and Engineering',
  'Cyber Security',
  'Electrical and Electronics Engineering',
  'Electronics and Communication Engineering',
  'Information Technology',
  'Mechanical Engineering'
];

export default function Leaderboard({ user, session, profile, onProfileUpdate } = {}) {
  const [activeTab, setActiveTab] = useState("overall");
  const [leaderboardType, setLeaderboardType] = useState("TRL_BASED");
  const [scrollProgress, setScrollProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState("");
  const [selectedDomFilter, setSelectedDomFilter] = useState("");

  // Overall States
  const [kpis, setKpis] = useState({
    totalTeams: 0,
    totalStudents: 0,
    totalIdeas: 0,
    totalDepartments: 0,
    totalDomains: 0,
  });
  const [overallStats, setOverallStats] = useState({
    top5Teams: [],
    allTeams: [],
  });

  // Pagination for Top Teams Table
  const [teamsPage, setTeamsPage] = useState(1);
  const teamsPerPage = 10;

  // Live Voting States
  const [votingStats, setVotingStats] = useState({
    totalVotes: 0,
    totalTeams: 0,
    round: 1,
    teams: []
  });
  const [votingLoading, setVotingLoading] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState("syncing");
  const [recentlyVotedTeamId, setRecentlyVotedTeamId] = useState(null);
  const [votingSearch, setVotingSearch] = useState("");
  const [votingDeptFilter, setVotingDeptFilter] = useState("");
  const [votingPage, setVotingPage] = useState(1);
  const [votingModalOpen, setVotingModalOpen] = useState(false);
  const [selectedVotingToken, setSelectedVotingToken] = useState("");
  const fallbackIntervalRef = useRef(null);

  const fetchVotingRankings = async (silent = false) => {
    try {
      if (!silent) setVotingLoading(true);
      const rawApiUrl = (
        import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"
      ).trim().replace(/\/+$/, "");
      const API_BASE_URL = rawApiUrl.endsWith("/api") ? rawApiUrl.slice(0, -4) : rawApiUrl;

      const res = await fetch(`${API_BASE_URL}/api/voting/leaderboard?round=1`);
      const json = await res.json();

      if (json.success && json.data) {
        setVotingStats({
          totalVotes: json.data.total_votes || 0,
          totalTeams: json.data.total_teams || 0,
          round: json.data.voting_round || 1,
          teams: json.data.teams || []
        });
      }
    } catch (err) {
      console.warn("[Voting Leaderboard] Fetch error:", err.message);
    } finally {
      if (!silent) setVotingLoading(false);
    }
  };

  // Date Formatter helper: DD MMM YYYY · hh:mm AM/PM (preserved internally)
  const formatTimestamp = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "N/A";

    const day = String(date.getDate()).padStart(2, "0");
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
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const formattedHours = String(hours).padStart(2, "0");

    return `${day} ${month} ${year} · ${formattedHours}:${minutes} ${ampm}`;
  };

  const fetchRankings = async () => {
    try {
      setLoading(true);
      setError(null);

      const rawApiUrl = (
        import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"
      )
        .trim()
        .replace(/\/+$/, "");
      const cleanApiBase = rawApiUrl.endsWith("/api") ? rawApiUrl.slice(0, -4) : rawApiUrl;
      // 1. Fetch Leaderboard Configuration (TRL_BASED vs VOTING_BASED)
      try {
        const cfgRes = await fetch(`${cleanApiBase}/api/leaderboard-config`);
        const contentType = cfgRes.headers.get("content-type") || "";
        if (cfgRes.ok && contentType.includes("application/json")) {
          const cfgJson = await cfgRes.json();
          if (cfgJson.leaderboard_type) {
            setLeaderboardType(cfgJson.leaderboard_type);
          }
        }
      } catch (e) {
        console.warn(
          "[Leaderboard] Warning: Could not fetch leaderboard config:",
          e.message,
        );
      }

      // 2. Fetch Aggregated Metrics from Supabase RPC
      const { data: rpcData, error: rpcErr } =
        await supabase.rpc("get_leaderboard_v2");
      if (rpcErr) throw rpcErr;

      if (!rpcData) {
        throw new Error("Leaderboard RPC returned empty payload.");
      }

      // 3. Fetch active products metadata (Direct Supabase query with API fallback)
      let productsData = [];
      try {
        const { data: directProds, error: directProdsErr } = await supabase
          .from("products")
          .select(
            "team_id, product_title, innovation_domain, trl_level, created_at, id",
          )
          .eq("status", "active");
        if (
          !directProdsErr &&
          Array.isArray(directProds) &&
          directProds.length > 0
        ) {
          productsData = directProds;
        } else {
          const response = await fetch(`${cleanApiBase}/api/leaderboard-domains`);
          const contentType = response.headers.get("content-type") || "";
          if (response.ok && contentType.includes("application/json")) {
            const resJson = await response.json();
            productsData = Array.isArray(resJson.data) ? resJson.data : [];
          }
        }
      } catch (e) {
        console.warn(
          "[Leaderboard] Warning: Could not fetch active products metadata:",
          e.message,
        );
      }

      const { kpis: fetchedKpis, team_rankings } = rpcData || {};

      setKpis({
        totalTeams: Number(fetchedKpis?.totalTeams || 0),
        totalStudents: Number(fetchedKpis?.totalStudents || 0),
        totalIdeas: Number(fetchedKpis?.totalIdeas || 0),
        totalDepartments: Number(fetchedKpis?.totalDepartments || 0),
        totalDomains: Number(fetchedKpis?.totalDomains || 0),
      });

      const teamList = Array.isArray(team_rankings) ? team_rankings : [];
      const resolvedTeams = teamList
        .map((t) => {
          if (!t) return null;
          const teamProducts = (productsData || []).filter(
            (p) => p && p.team_id === t.id,
          );
          const resolvedDomain =
            teamProducts.length > 0 && teamProducts[0]?.innovation_domain
              ? teamProducts[0].innovation_domain
              : t.innovation_domain || "Open Innovation";

          let leadingTitle = null;
          let calculatedHighestTrl =
            t.highest_trl !== undefined && t.highest_trl !== null
              ? Number(t.highest_trl)
              : null;

          if (teamProducts.length > 0) {
            const sorted = [...teamProducts].sort((a, b) => {
              const trlA = a?.trl_level ?? a?.current_trl ?? 0;
              const trlB = b?.trl_level ?? b?.current_trl ?? 0;
              if (trlB !== trlA) return trlB - trlA;
              const tA = a?.created_at
                ? new Date(a.created_at).getTime()
                : Infinity;
              const tB = b?.created_at
                ? new Date(b.created_at).getTime()
                : Infinity;
              return tA - tB;
            });
            leadingTitle = sorted[0]?.product_title || sorted[0]?.title || null;

            const prodsWithTrl = teamProducts.filter(
              (p) =>
                (p.trl_level !== undefined && p.trl_level !== null) ||
                (p.current_trl !== undefined && p.current_trl !== null),
            );
            if (prodsWithTrl.length > 0) {
              const maxPTrl = Math.max(
                ...prodsWithTrl.map((p) =>
                  Number(p.trl_level ?? p.current_trl),
                ),
              );
              calculatedHighestTrl =
                calculatedHighestTrl !== null
                  ? Math.max(calculatedHighestTrl, maxPTrl)
                  : maxPTrl;
            }
          }

          return {
            id: t.id,
            teamName: t.team_name || t.name || t.teamName || "Unnamed Team",
            department:
              t.department || t.department_name || "Unknown Department",
            innovationDomain: resolvedDomain || "Open Innovation",
            ideas: t.ideas ?? t.ideas_count ?? 0,
            highestTrl: calculatedHighestTrl,
            earliestTime:
              t.earliest_time ||
              t.earliest_submission_time ||
              t.created_at ||
              null,
            leadingProductTitle:
              leadingTitle || t.leading_product_title || null,
          };
        })
        .filter(Boolean);

      resolvedTeams.sort((a, b) => {
        const trlA =
          a.highestTrl !== null && a.highestTrl !== undefined
            ? Number(a.highestTrl)
            : -1;
        const trlB =
          b.highestTrl !== null && b.highestTrl !== undefined
            ? Number(b.highestTrl)
            : -1;
        if (trlB !== trlA) {
          return trlB - trlA;
        }

        const ideasA = Number(a.ideas || 0);
        const ideasB = Number(b.ideas || 0);
        if (ideasB !== ideasA) {
          return ideasB - ideasA;
        }

        const timeA = a.earliestTime
          ? new Date(a.earliestTime).getTime()
          : Infinity;
        const timeB = b.earliestTime
          ? new Date(b.earliestTime).getTime()
          : Infinity;
        if (timeA !== timeB) {
          return timeA - timeB;
        }

        const nameA = String(a.teamName ?? "");
        const nameB = String(b.teamName ?? "");
        return nameA.localeCompare(nameB);
      });

      setOverallStats({
        top5Teams: resolvedTeams.slice(0, 5),
        allTeams: resolvedTeams,
      });
    } catch (err) {
      console.error("[Leaderboard] V2 calculation error:", err.message || err);
      setError(
        err.message || "Unable to compute mechanical leaderboard rankings.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRankings();

    const handleRefresh = () => {
      console.log("[Leaderboard] Refreshing data via custom event");
      fetchRankings();
    };

    window.addEventListener("refresh-leaderboard", handleRefresh);

    const handleScroll = () => {
      const scrollY = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        setScrollProgress(Math.min(Math.max(scrollY / docHeight, 0), 1));
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("refresh-leaderboard", handleRefresh);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Supabase Realtime & Fallback Polling for Live Voting
  useEffect(() => {
    if (leaderboardType !== "VOTING_BASED") return;

    fetchVotingRankings();

    const channel = supabase
      .channel("public-team_votes-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_votes" },
        (payload) => {
          const newVote = payload.new;
          if (newVote?.team_id) {
            setRecentlyVotedTeamId(newVote.team_id);
            setTimeout(() => setRecentlyVotedTeamId(null), 2500);

            setVotingStats((prev) => {
              const updatedTeams = [...prev.teams];
              const idx = updatedTeams.findIndex((t) => t.id === newVote.team_id);
              if (idx !== -1) {
                updatedTeams[idx] = {
                  ...updatedTeams[idx],
                  voteCount: newVote.vote_count,
                  lastVoteTime: newVote.updated_at
                };
              }
              // Authoritative sort: voteCount DESC, lastVoteTime ASC, id ASC
              updatedTeams.sort((a, b) => {
                if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
                const tA = new Date(a.lastVoteTime).getTime();
                const tB = new Date(b.lastVoteTime).getTime();
                if (tA !== tB) return tA - tB;
                return a.id.localeCompare(b.id);
              });
              const reRanked = updatedTeams.map((t, i) => ({ ...t, rank: i + 1 }));
              const newTotal = reRanked.reduce((sum, t) => sum + (t.voteCount || 0), 0);
              return {
                ...prev,
                totalVotes: newTotal,
                teams: reRanked
              };
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
          if (fallbackIntervalRef.current) {
            clearInterval(fallbackIntervalRef.current);
            fallbackIntervalRef.current = null;
          }
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setRealtimeStatus("fallback");
          if (!fallbackIntervalRef.current) {
            fallbackIntervalRef.current = setInterval(() => {
              fetchVotingRankings(true);
            }, 20000);
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
    };
  }, [leaderboardType]);

  // Overall View
  const renderOverallView = () => {
    const departments = Array.from(
      new Set(overallStats.allTeams.map((t) => t.department).filter(Boolean)),
    ).sort((a, b) => String(a ?? "").localeCompare(String(b ?? "")));

    const filteredTeams = selectedDepartment
      ? overallStats.allTeams.filter((t) => t.department === selectedDepartment)
      : overallStats.allTeams;

    const trlDistribution = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      7: 0,
      8: 0,
      9: 0,
    };

    filteredTeams.forEach((team) => {
      const trl = team.highestTrl;
      if (trl && trl >= 1 && trl <= 9) {
        trlDistribution[trl] = (trlDistribution[trl] || 0) + 1;
      }
    });

    const trlValues = Object.values(trlDistribution);
    const maxTeamsInTrlDist = Math.max(...trlValues, 1);
    const chartTotalTeams = filteredTeams.length;

    const activeTrls = Object.keys(trlDistribution)
      .filter((k) => trlDistribution[k] > 0)
      .map(Number);
    const highestTrl = activeTrls.length > 0 ? Math.max(...activeTrls) : 0;

    let topRange = "None";
    let maxConc = 0;
    for (let i = 1; i <= 8; i++) {
      const sum = (trlDistribution[i] || 0) + (trlDistribution[i + 1] || 0);
      if (sum > maxConc && sum > 0) {
        maxConc = sum;
        topRange = `TRL ${i} – ${i + 1}`;
      }
    }

    const trlConfigs = [
      {
        level: 1,
        label: "TRL 1",
        desc: "(Basic)",
        colorClass:
          "bg-blue-500/20 text-blue-700 border border-blue-400/50 hover:bg-blue-500/30",
      },
      {
        level: 2,
        label: "TRL 2",
        desc: "(Formulated)",
        colorClass:
          "bg-blue-500/20 text-blue-700 border border-blue-400/50 hover:bg-blue-500/30",
      },
      {
        level: 3,
        label: "TRL 3",
        desc: "(Proof of Concept)",
        colorClass:
          "bg-blue-500/25 text-blue-800 border border-blue-450/50 hover:bg-blue-500/35",
      },
      {
        level: 4,
        label: "TRL 4",
        desc: "(Validated)",
        colorClass:
          "bg-emerald-500/20 text-emerald-700 border border-emerald-400/50 hover:bg-emerald-500/30",
      },
      {
        level: 5,
        label: "TRL 5",
        desc: "(Prototype)",
        colorClass:
          "bg-emerald-500/20 text-emerald-700 border border-emerald-400/50 hover:bg-emerald-500/30",
      },
      {
        level: 6,
        label: "TRL 6",
        desc: "(System)",
        colorClass:
          "bg-emerald-500/25 text-emerald-800 border border-emerald-450/50 hover:bg-emerald-500/35",
      },
      {
        level: 7,
        label: "TRL 7",
        desc: "(Demonstration)",
        colorClass:
          "bg-amber-500/20 text-amber-700 border border-amber-400/50 hover:bg-amber-500/30",
      },
      {
        level: 8,
        label: "TRL 8",
        desc: "(Pre-Production)",
        colorClass:
          "bg-amber-500/25 text-amber-800 border border-amber-450/50 hover:bg-amber-500/35",
      },
      {
        level: 9,
        label: "TRL 9",
        desc: "(Market Ready)",
        colorClass:
          "bg-orange-500/35 text-orange-800 border border-orange-400/50 hover:bg-orange-500/45",
      },
    ];

    const paginatedTeams = overallStats.allTeams.slice(
      (teamsPage - 1) * teamsPerPage,
      teamsPage * teamsPerPage,
    );
    const totalTeamsPages = Math.ceil(
      overallStats.allTeams.length / teamsPerPage,
    );
    const hasTrlData =
      leaderboardType === "TRL_BASED" ||
      (overallStats.allTeams.length > 0 &&
        overallStats.allTeams.some(
          (t) => t.highestTrl !== undefined && t.highestTrl !== null,
        ));

    return (
      <div className="space-y-8 mt-8 relative">
        <div className="absolute inset-0 opacity-[0.02] select-none pointer-events-none z-0 overflow-hidden">
          <svg
            className="w-full h-full text-slate-800"
            viewBox="0 0 800 800"
            fill="none"
            stroke="currentColor"
          >
            <circle
              cx="400"
              cy="400"
              r="320"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <circle cx="400" cy="400" r="240" strokeWidth="0.5" />
            <circle
              cx="400"
              cy="400"
              r="120"
              strokeWidth="0.75"
              strokeDasharray="2 2"
            />
            <line x1="80" y1="400" x2="720" y2="400" strokeWidth="0.5" />
            <line x1="400" y1="80" x2="400" y2="720" strokeWidth="0.5" />
          </svg>
        </div>

        <div className="absolute -top-12 -right-12 opacity-[0.02] text-slate-800 pointer-events-none select-none z-0 overflow-hidden">
          <Gear size={280} rotation={scrollProgress * 90} />
        </div>
        <div className="absolute -bottom-16 -left-16 opacity-[0.02] text-slate-800 pointer-events-none select-none z-0 overflow-hidden">
          <Gear size={320} rotation={-scrollProgress * 75} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 relative z-10">
          <div className="relative bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col justify-between overflow-hidden lg:col-span-1 min-w-0">
            <div className="absolute -right-4 -bottom-4 opacity-[0.03] text-slate-900 pointer-events-none select-none">
              <Gear size={80} rotation={scrollProgress * 60} />
            </div>

            <div>
              <h3 className="text-xs font-black text-[#0B1B3A] uppercase tracking-widest mb-5 flex items-center gap-2 border-b border-slate-100 pb-2.5 font-heading">
                <Trophy size={14} className="text-primary" /> Submission
                Overview
              </h3>
              <div className="space-y-4 mt-2">
                <div className="flex items-center justify-between text-sm py-2.5 px-3.5 border border-slate-200 bg-slate-50 rounded-xl">
                  <span className="text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                    Teams Registered
                  </span>
                  <span className="font-black text-[#0B1B3A] text-base">
                    {kpis.totalTeams}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm py-2.5 px-3.5 border border-slate-200 bg-slate-50 rounded-xl">
                  <span className="text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                    Ideas Submitted
                  </span>
                  <span className="font-black text-[#0B1B3A] text-base">
                    {kpis.totalIdeas}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-6 pt-3 border-t border-slate-100 text-[11px] text-slate-600 font-bold uppercase tracking-wider">
              Live updates of submission metrics across all registered teams.
            </div>
          </div>

          <div className="relative lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col justify-between overflow-hidden min-w-0">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 mb-6 gap-3">
                <h3 className="text-xs font-black text-[#0B1B3A] uppercase tracking-widest flex items-center gap-2 font-heading">
                  <Layers size={14} className="text-primary" /> TEAM ACTIVITY
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <label
                    htmlFor="dept-filter-chart"
                    className="text-[11px] font-black text-slate-700 uppercase tracking-wider"
                  >
                    Dept Selector:
                  </label>
                  <select
                    id="dept-filter-chart"
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs outline-none focus:border-primary text-slate-800 font-black cursor-pointer transition hover:border-slate-400 shadow-sm max-w-full"
                  >
                    <option value="">All Departments</option>
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="w-full min-w-0">
                <div className="flex justify-between items-end h-44 sm:h-48 w-full px-1 pb-2 relative gap-1 sm:gap-2">
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-12 pt-6">
                    <div className="border-t border-slate-200 w-full" />
                    <div className="border-t border-slate-200 w-full" />
                    <div className="border-t border-slate-200 w-full" />
                    <div className="border-t border-slate-200 w-full" />
                  </div>

                  {trlConfigs.map((cfg) => {
                    const count = trlDistribution[cfg.level];
                    const pct = (count / maxTeamsInTrlDist) * 100;
                    return (
                      <div
                        key={cfg.level}
                        className="flex flex-col items-center gap-1.5 sm:gap-2 flex-1 min-w-0 relative z-10"
                      >
                        <span className="text-[9px] sm:text-[10px] font-black text-[#0B1B3A] font-mono">
                          {count}
                        </span>

                        <div className="w-full max-w-[36px] sm:max-w-[48px] h-24 sm:h-28 flex items-end justify-center bg-slate-100/70 rounded-t-lg border border-slate-200 relative overflow-hidden">
                          <div
                            className={`w-full rounded-t-lg transition-all duration-500 relative group cursor-help ${cfg.colorClass} shadow-sm`}
                            style={{ height: `${Math.max(pct, 4)}%` }}
                          >
                            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-30 pointer-events-none shadow-md">
                              {count} {count === 1 ? "Team" : "Teams"} at{" "}
                              {cfg.label}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-center text-center w-full px-0.5">
                          <span className="text-[8px] sm:text-[10px] font-black text-[#0B1B3A] tracking-wider truncate w-full">
                            {cfg.label}
                          </span>
                          <span className="hidden sm:block text-[7px] sm:text-[8px] font-bold text-slate-500 uppercase tracking-wider truncate w-full">
                            {cfg.desc}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 min-[440px]:grid-cols-3 gap-3 sm:gap-4">
              <div className="flex flex-col bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                  Total Teams
                </span>
                <span className="text-lg sm:text-xl font-black text-[#0B1B3A] mt-1">
                  {chartTotalTeams}
                </span>
              </div>
              <div className="flex flex-col bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                  Highest TRL
                </span>
                <span className="text-lg sm:text-xl font-black text-[#0B1B3A] mt-1">
                  {highestTrl > 0 ? `TRL ${highestTrl}` : "N/A"}
                </span>
              </div>
              <div className="flex flex-col bg-amber-500/10 p-3 rounded-xl border border-amber-300/70 col-span-2 min-[440px]:col-span-1">
                <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider">
                  Top TRL Range
                </span>
                <span className="text-lg sm:text-xl font-black text-[#0B1B3A] mt-1">
                  {topRange}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 relative z-10">
          <div className="relative bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm overflow-hidden lg:col-span-1 min-w-0">
            <h3 className="text-xs font-black text-[#0B1B3A] uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-slate-100 pb-2.5 font-heading">
              <Trophy size={16} className="text-primary" /> Top Performers
            </h3>
            <div className="space-y-4 relative z-10">
              {overallStats.top5Teams.slice(0, 3).map((t, idx) => (
                <div
                  key={t.teamName}
                  className="flex items-center gap-3 sm:gap-4 p-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 hover:-translate-y-0.5 transition-all duration-200 shadow-sm min-w-0"
                >
                  <div className="shrink-0">
                    <RankBadge rank={idx + 1} size={30} />
                  </div>
                  <div className="grow min-w-0">
                    <h4
                      className="font-black text-sm text-[#0B1B3A] truncate"
                      title={t.teamName}
                    >
                      {t.teamName}
                    </h4>
                    <p className="text-[11px] text-slate-600 font-extrabold uppercase truncate tracking-wider mt-0.5">
                      {t.department}
                    </p>
                    {t.leadingProductTitle && (
                      <p
                        className="text-xs text-slate-700 font-medium italic truncate mt-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-200"
                        title={t.leadingProductTitle}
                      >
                        {t.leadingProductTitle}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {t.highestTrl !== undefined && t.highestTrl !== null ? (
                      <>
                        <span className="inline-flex items-center justify-center bg-primary border-b border-blue-900 text-white font-mono font-black text-xs px-2.5 py-0.5 rounded shadow-sm">
                          TRL {t.highestTrl}
                        </span>
                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider mt-1">
                          Status
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="text-base font-black text-[#0B1B3A]">
                          {t.ideas}
                        </span>
                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">
                          Ideas
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm overflow-hidden lg:col-span-2 min-w-0">
            <h3 className="text-xs font-black text-[#0B1B3A] uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-100 pb-2.5 font-heading">
              <Users size={16} className="text-primary" /> Master Telemetry
              Board
            </h3>

            <div className="hidden md:block w-full min-w-0 border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full border-collapse text-left text-sm text-slate-700 table-fixed">
                <thead className="bg-slate-100 text-xs font-black text-slate-800 uppercase border-b border-slate-200 tracking-wider">
                  <tr>
                    <th className="px-4 py-3 w-16 text-center">Rank</th>
                    <th className="px-4 py-3 w-1/2">
                      {hasTrlData ? "Team & Product Assembly" : "Team"}
                    </th>
                    <th className="px-4 py-3 w-1/3">Department</th>
                    <th className="px-4 py-3 text-right w-28">
                      {hasTrlData ? "Highest TRL" : "Ideas"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 bg-white">
                  {paginatedTeams.map((row, idx) => {
                    const globalRank = (teamsPage - 1) * teamsPerPage + idx + 1;
                    return (
                      <tr
                        key={row.teamName}
                        className="hover:bg-slate-50 transition-all duration-200 group"
                      >
                        <td className="px-4 py-3 text-center">
                          <RankBadge rank={globalRank} size={28} />
                        </td>
                        <td className="px-4 py-3 min-w-0">
                          <div
                            className="font-black text-[#0B1B3A] truncate"
                            title={row.teamName}
                          >
                            {row.teamName}
                          </div>
                          {row.leadingProductTitle && (
                            <div
                              className="text-xs text-slate-700 font-medium italic truncate mt-0.5"
                              title={row.leadingProductTitle}
                            >
                              {row.leadingProductTitle}
                            </div>
                          )}
                        </td>
                        <td
                          className="px-4 py-3 text-xs font-bold text-slate-700 truncate uppercase tracking-wider"
                          title={row.department}
                        >
                          {row.department}
                        </td>
                        <td className="px-4 py-3 text-right font-black">
                          {row.highestTrl !== undefined &&
                          row.highestTrl !== null ? (
                            <span className="inline-flex items-center justify-center bg-primary/15 text-primary font-mono font-black text-xs px-2.5 py-0.5 rounded border border-primary/30 shadow-2xs">
                              TRL {row.highestTrl}
                            </span>
                          ) : (
                            <span className="font-black text-[#0B1B3A] text-base">
                              {row.ideas}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="block md:hidden space-y-3 w-full min-w-0">
              {paginatedTeams.map((row, idx) => {
                const globalRank = (teamsPage - 1) * teamsPerPage + idx + 1;
                return (
                  <div
                    key={row.teamName}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-all shadow-2xs space-y-2 min-w-0"
                  >
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <RankBadge rank={globalRank} size={30} />
                        <div className="min-w-0">
                          <h4 className="font-black text-sm text-[#0B1B3A] break-words">
                            {row.teamName}
                          </h4>
                          <p className="text-xs text-slate-600 font-bold uppercase tracking-wider mt-0.5 break-words">
                            {row.department}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {row.highestTrl !== undefined &&
                        row.highestTrl !== null ? (
                          <span className="inline-flex items-center justify-center bg-primary/15 text-primary font-mono font-black text-xs px-2.5 py-1 rounded border border-primary/30 shadow-2xs">
                            TRL {row.highestTrl}
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center bg-primary text-white font-black text-xs px-2.5 py-0.5 rounded">
                            {row.ideas} {row.ideas === 1 ? "Idea" : "Ideas"}
                          </span>
                        )}
                      </div>
                    </div>

                    {row.leadingProductTitle && (
                      <div className="text-xs text-slate-700 font-medium italic bg-white p-2.5 rounded-xl border border-slate-200 break-words">
                        {row.leadingProductTitle}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {totalTeamsPages > 1 && (
              <div className="relative flex items-center justify-between mt-6 p-1 flex-wrap gap-2">
                <button
                  onClick={() => setTeamsPage((p) => Math.max(p - 1, 1))}
                  disabled={teamsPage === 1}
                  className="px-3.5 py-1.5 text-xs font-black uppercase text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-sm"
                >
                  ◀ Prev
                </button>

                <div className="bg-white px-3 sm:px-4 py-1.5 border border-slate-200 rounded-full shadow-sm flex items-center gap-2 sm:gap-3">
                  <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest font-mono">
                    Page {teamsPage} of {totalTeamsPages}
                  </span>
                  <MechanicalGearsMini scrollProgress={scrollProgress} />
                </div>

                <button
                  onClick={() =>
                    setTeamsPage((p) => Math.min(p + 1, totalTeamsPages))
                  }
                  disabled={teamsPage === totalTeamsPages}
                  className="px-3.5 py-1.5 text-xs font-black uppercase text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-sm"
                >
                  Next ▶
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Department-Wise Render View
  const renderDepartmentView = () => {
    const deptGroups = {};
    overallStats.allTeams.forEach((t) => {
      const dept = t.department || "Unknown Department";
      if (!deptGroups[dept]) {
        deptGroups[dept] = {
          department: dept,
          teamsList: [],
          ideasCount: 0,
          earliestTime: null,
        };
      }
      deptGroups[dept].teamsList.push(t);
      deptGroups[dept].ideasCount += t.ideas || 0;

      const tTime = t.earliestTime ? new Date(t.earliestTime).getTime() : null;
      if (tTime) {
        if (
          !deptGroups[dept].earliestTime ||
          tTime < deptGroups[dept].earliestTime
        ) {
          deptGroups[dept].earliestTime = tTime;
        }
      }
    });

    const deptList = Object.values(deptGroups).map((d) => {
      const teamsWithTrl = d.teamsList.filter(
        (t) => t.highestTrl !== null && t.highestTrl !== undefined,
      );
      const highestTrl =
        teamsWithTrl.length > 0
          ? Math.max(...teamsWithTrl.map((t) => t.highestTrl))
          : 0;
      const avgHighestTrl =
        teamsWithTrl.length > 0
          ? Number(
              (
                teamsWithTrl.reduce((sum, t) => sum + Number(t.highestTrl), 0) /
                teamsWithTrl.length
              ).toFixed(1),
            )
          : 0.0;

      const trlDist = {};
      for (let i = 1; i <= 9; i++) {
        trlDist[i] = 0;
      }
      d.teamsList.forEach((t) => {
        const trl = t.highestTrl;
        if (trl && trl >= 1 && trl <= 9) {
          trlDist[trl]++;
        }
      });

      return {
        department: d.department,
        teamsCount: d.teamsList.length,
        ideasCount: d.ideasCount,
        highestTrl,
        avgHighestTrl,
        trlDistribution: trlDist,
        earliestTime: d.earliestTime
          ? new Date(d.earliestTime).toISOString()
          : null,
      };
    });

    const allRankedDepts = [...deptList]
      .sort((a, b) => {
        if (b.highestTrl !== a.highestTrl) return b.highestTrl - a.highestTrl;
        if (b.avgHighestTrl !== a.avgHighestTrl)
          return b.avgHighestTrl - a.avgHighestTrl;

        const timeA = a.earliestTime
          ? new Date(a.earliestTime).getTime()
          : Infinity;
        const timeB = b.earliestTime
          ? new Date(b.earliestTime).getTime()
          : Infinity;
        if (timeA !== timeB) return timeA - timeB;

        const deptA = String(a.department ?? "");
        const deptB = String(b.department ?? "");
        return deptA.localeCompare(deptB);
      })
      .map((d, index) => ({
        ...d,
        rank: index + 1,
      }));

    const departmentsOptions = Array.from(
      new Set(overallStats.allTeams.map((t) => t.department).filter(Boolean)),
    ).sort((a, b) => String(a ?? "").localeCompare(String(b ?? "")));

    const filteredRankedDepts = selectedDeptFilter
      ? allRankedDepts.filter((d) => d.department === selectedDeptFilter)
      : allRankedDepts;

    const trlColorMap = {
      1: "bg-blue-400 hover:bg-blue-500",
      2: "bg-blue-500 hover:bg-blue-600",
      3: "bg-cyan-400 hover:bg-cyan-500",
      4: "bg-emerald-400 hover:bg-emerald-500",
      5: "bg-emerald-500 hover:bg-emerald-600",
      6: "bg-green-500 hover:bg-green-600",
      7: "bg-amber-400 hover:bg-amber-500",
      8: "bg-amber-500 hover:bg-amber-600",
      9: "bg-orange-500 hover:bg-orange-600",
    };

    const maxTeamsInTrlDist = Math.max(
      ...filteredRankedDepts.map((d) => d.teamsCount),
      1,
    );

    return (
      <div className="space-y-8 mt-8 relative">
        <div className="absolute inset-0 opacity-[0.02] select-none pointer-events-none z-0 overflow-hidden">
          <svg
            className="w-full h-full text-slate-800"
            viewBox="0 0 800 800"
            fill="none"
            stroke="currentColor"
          >
            <circle
              cx="400"
              cy="400"
              r="320"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <circle cx="400" cy="400" r="240" strokeWidth="0.5" />
            <circle
              cx="400"
              cy="400"
              r="120"
              strokeWidth="0.75"
              strokeDasharray="2 2"
            />
            <line x1="80" y1="400" x2="720" y2="400" strokeWidth="0.5" />
            <line x1="400" y1="80" x2="400" y2="720" strokeWidth="0.5" />
          </svg>
        </div>

        <div className="absolute -top-12 -right-12 opacity-[0.02] text-slate-800 pointer-events-none select-none z-0 overflow-hidden">
          <Gear size={280} rotation={scrollProgress * 90} />
        </div>

        <div className="relative bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm overflow-hidden z-10 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-6 gap-4 relative z-10">
            <div>
              <h2 className="text-base sm:text-lg font-black text-[#0B1B3A] font-heading tracking-widest uppercase">
                DEPARTMENT LEADERBOARD
              </h2>
              <p className="text-xs text-slate-600 mt-0.5 font-bold uppercase tracking-wider">
                Rankings and analytics based on highest TRL achieved by teams
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0 flex-wrap">
              <MechanicalGearsMini scrollProgress={scrollProgress} />
              <label
                htmlFor="dept-tab-filter"
                className="text-[11px] font-black text-slate-700 uppercase tracking-wider"
              >
                Department:
              </label>
              <select
                id="dept-tab-filter"
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs outline-none focus:border-primary text-slate-800 font-black cursor-pointer transition hover:border-slate-400 shadow-sm max-w-full"
              >
                <option value="">All Departments</option>
                {departmentsOptions.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
            <div className="space-y-4 min-w-0">
              <h3 className="text-xs font-black text-[#0B1B3A] uppercase tracking-widest flex items-center gap-2 font-heading">
                <Building size={14} className="text-primary" /> Department
                Rankings
              </h3>

              <div className="hidden md:block w-full min-w-0 border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full border-collapse text-left text-sm text-slate-700 table-fixed">
                  <thead className="bg-slate-100/90 text-[11px] font-black text-slate-700 uppercase border-b border-slate-200 tracking-wider">
                    <tr>
                      <th className="px-3 py-3 w-16 text-center">Rank</th>
                      <th className="px-3 py-3 w-2/5">Department</th>
                      <th className="px-3 py-3 text-right w-16">Teams</th>
                      <th className="px-3 py-3 text-right w-24">Highest TRL</th>
                      <th className="px-3 py-3 text-right w-16">Ideas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 bg-white">
                    {filteredRankedDepts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-xs italic text-slate-600 bg-slate-50"
                        >
                          No departments match the criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredRankedDepts.map((row) => (
                        <tr
                          key={row.department}
                          className="hover:bg-slate-50 transition-all duration-200 group"
                        >
                          <td className="px-3 py-3 text-center">
                            <RankBadge rank={row.rank} size={28} />
                          </td>
                          <td
                            className="px-3 py-3 font-black text-[#0B1B3A] truncate"
                            title={row.department}
                          >
                            {row.department}
                          </td>
                          <td className="px-3 py-3 text-right font-black text-[#0B1B3A]">
                            {row.teamsCount}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="inline-flex items-center justify-center bg-primary/15 text-primary font-mono font-black text-xs px-2.5 py-0.5 rounded border border-primary/30 shadow-2xs">
                              TRL {row.highestTrl}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-black text-[#0B1B3A]">
                            {row.ideasCount}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="block md:hidden space-y-3 w-full min-w-0">
                {filteredRankedDepts.map((row) => (
                  <div
                    key={row.department}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2.5 shadow-2xs min-w-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <RankBadge rank={row.rank} size={30} />
                        <h4 className="font-black text-sm text-[#0B1B3A] break-words">
                          {row.department}
                        </h4>
                      </div>
                      <span className="shrink-0 inline-flex items-center justify-center bg-primary/15 text-primary font-mono font-black text-xs px-2.5 py-1 rounded border border-primary/30">
                        TRL {row.highestTrl}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-xs">
                      <div className="bg-white p-2 rounded-xl border border-slate-200 text-center">
                        <span className="text-[10px] font-bold text-slate-600 uppercase block">
                          Teams
                        </span>
                        <span className="font-black text-[#0B1B3A] text-sm">
                          {row.teamsCount}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-slate-200 text-center">
                        <span className="text-[10px] font-bold text-slate-600 uppercase block">
                          Ideas
                        </span>
                        <span className="font-black text-[#0B1B3A] text-sm">
                          {row.ideasCount}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 flex flex-col justify-between min-w-0">
              <div>
                <h3 className="text-xs font-black text-[#0B1B3A] uppercase tracking-widest mb-1 flex items-center gap-2 font-heading">
                  <Layers size={14} className="text-primary" /> TEAMS
                  DISTRIBUTION BY HIGHEST TRL
                </h3>
                <p className="text-xs text-slate-600 font-bold uppercase tracking-wider mb-6">
                  Department-wise team distribution across TRL levels
                </p>

                <div className="w-full min-w-0">
                  <div className="flex justify-between items-end h-56 sm:h-64 w-full px-1 pb-2 relative gap-1 sm:gap-2">
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-12 pt-6">
                      <div className="border-t border-slate-200 w-full" />
                      <div className="border-t border-slate-200 w-full" />
                      <div className="border-t border-slate-200 w-full" />
                      <div className="border-t border-slate-200 w-full" />
                    </div>

                    {filteredRankedDepts.map((d) => {
                      const totalTeams = d.teamsCount;
                      return (
                        <div
                          key={d.department}
                          className="flex flex-col items-center gap-1.5 flex-1 min-w-0 relative z-10"
                        >
                          <span className="text-[9px] font-black text-[#0B1B3A] font-mono">
                            {totalTeams}
                          </span>

                          <div
                            className="w-full max-w-[28px] sm:max-w-[36px] rounded-t-lg overflow-hidden border border-slate-200 bg-slate-100/70 flex flex-col-reverse justify-start shrink-0 h-36 sm:h-40 relative"
                            style={{
                              height: `${Math.max((totalTeams / maxTeamsInTrlDist) * 150, 20)}px`,
                            }}
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => {
                              const count = d.trlDistribution[level];
                              if (!count || count === 0) return null;
                              const pct = (count / totalTeams) * 100;
                              return (
                                <div
                                  key={level}
                                  className={`w-full ${trlColorMap[level]} transition-all duration-300 relative group cursor-help border-b border-slate-100/10`}
                                  style={{ height: `${pct}%` }}
                                >
                                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-35 pointer-events-none shadow-md">
                                    TRL {level}: {count}{" "}
                                    {count === 1 ? "team" : "teams"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <span
                            className="text-[7px] sm:text-[9px] font-black text-[#0B1B3A] text-center truncate w-full uppercase tracking-wider px-0.5"
                            title={d.department}
                          >
                            {d.department}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 justify-center text-[10px] font-black uppercase tracking-wider text-slate-700 bg-slate-100/80 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-blue-500 shadow-sm" />
                  <span>TRL 1–3 (Early Stage)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-emerald-500 shadow-sm" />
                  <span>TRL 4–6 (Development)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-orange-500 shadow-sm" />
                  <span>TRL 7–9 (Advanced)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Domain-Wise Render View
  const renderDomainView = () => {
    const domainGroups = {};

    overallStats.allTeams.forEach((t) => {
      const domain = t.innovationDomain;
      if (!domain) return;
      if (!domainGroups[domain]) {
        domainGroups[domain] = {
          domain,
          teamsList: [],
          ideasCount: 0,
          earliestTime: null,
        };
      }
      domainGroups[domain].teamsList.push(t);
      domainGroups[domain].ideasCount += t.ideas || 0;

      const tTime = t.earliestTime ? new Date(t.earliestTime).getTime() : null;
      if (tTime) {
        if (
          !domainGroups[domain].earliestTime ||
          tTime < domainGroups[domain].earliestTime
        ) {
          domainGroups[domain].earliestTime = tTime;
        }
      }
    });

    const domList = Object.values(domainGroups).map((d) => {
      const teamsWithTrl = d.teamsList.filter(
        (t) => t.highestTrl !== null && t.highestTrl !== undefined,
      );
      const highestTrl =
        teamsWithTrl.length > 0
          ? Math.max(...teamsWithTrl.map((t) => t.highestTrl))
          : 0;
      const avgHighestTrl =
        teamsWithTrl.length > 0
          ? Number(
              (
                teamsWithTrl.reduce((sum, t) => sum + Number(t.highestTrl), 0) /
                teamsWithTrl.length
              ).toFixed(1),
            )
          : 0.0;

      const trlDist = {};
      for (let i = 1; i <= 9; i++) {
        trlDist[i] = 0;
      }
      d.teamsList.forEach((t) => {
        const trl = t.highestTrl;
        if (trl && trl >= 1 && trl <= 9) {
          trlDist[trl]++;
        }
      });

      return {
        domain: d.domain,
        teamsCount: d.teamsList.length,
        ideasCount: d.ideasCount,
        highestTrl,
        avgHighestTrl,
        trlDistribution: trlDist,
        earliestTime: d.earliestTime
          ? new Date(d.earliestTime).toISOString()
          : null,
      };
    });

    const allRankedDoms = [...domList]
      .sort((a, b) => {
        if (b.highestTrl !== a.highestTrl) return b.highestTrl - a.highestTrl;
        if (b.avgHighestTrl !== a.avgHighestTrl)
          return b.avgHighestTrl - a.avgHighestTrl;

        const timeA = a.earliestTime
          ? new Date(a.earliestTime).getTime()
          : Infinity;
        const timeB = b.earliestTime
          ? new Date(b.earliestTime).getTime()
          : Infinity;
        if (timeA !== timeB) return timeA - timeB;

        const domA = String(a.domain ?? "");
        const domB = String(b.domain ?? "");
        return domA.localeCompare(domB);
      })
      .map((d, index) => ({
        ...d,
        rank: index + 1,
      }));

    const domainsOptions = Array.from(
      new Set(
        overallStats.allTeams.map((t) => t.innovationDomain).filter(Boolean),
      ),
    ).sort((a, b) => String(a ?? "").localeCompare(String(b ?? "")));

    const filteredRankedDoms = selectedDomFilter
      ? allRankedDoms.filter((d) => d.domain === selectedDomFilter)
      : allRankedDoms;

    const trlColorMap = {
      1: "bg-blue-400 hover:bg-blue-500",
      2: "bg-blue-500 hover:bg-blue-600",
      3: "bg-cyan-400 hover:bg-cyan-500",
      4: "bg-emerald-400 hover:bg-emerald-500",
      5: "bg-emerald-500 hover:bg-emerald-600",
      6: "bg-green-500 hover:bg-green-600",
      7: "bg-amber-400 hover:bg-amber-500",
      8: "bg-amber-500 hover:bg-amber-600",
      9: "bg-orange-500 hover:bg-orange-600",
    };

    const maxTeamsInTrlDist = Math.max(
      ...filteredRankedDoms.map((d) => d.teamsCount),
      1,
    );

    return (
      <div className="space-y-8 mt-8 relative">
        <div className="absolute inset-0 opacity-[0.02] select-none pointer-events-none z-0 overflow-hidden">
          <svg
            className="w-full h-full text-slate-800"
            viewBox="0 0 800 800"
            fill="none"
            stroke="currentColor"
          >
            <circle
              cx="400"
              cy="400"
              r="320"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <circle cx="400" cy="400" r="240" strokeWidth="0.5" />
            <circle
              cx="400"
              cy="400"
              r="120"
              strokeWidth="0.75"
              strokeDasharray="2 2"
            />
            <line x1="80" y1="400" x2="720" y2="400" strokeWidth="0.5" />
            <line x1="400" y1="80" x2="400" y2="720" strokeWidth="0.5" />
          </svg>
        </div>

        <div className="absolute -top-12 -right-12 opacity-[0.02] text-slate-800 pointer-events-none select-none z-0 overflow-hidden">
          <Gear size={280} rotation={scrollProgress * 90} />
        </div>

        <div className="relative bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm overflow-hidden z-10 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-6 gap-4 relative z-10">
            <div>
              <h2 className="text-base sm:text-lg font-black text-[#0B1B3A] font-heading tracking-widest uppercase">
                DOMAIN LEADERBOARD
              </h2>
              <p className="text-xs text-slate-600 mt-0.5 font-bold uppercase tracking-wider">
                Rankings and analytics based on highest TRL achieved by teams
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0 flex-wrap">
              <MechanicalGearsMini scrollProgress={scrollProgress} />
              <label
                htmlFor="dom-tab-filter"
                className="text-[11px] font-black text-slate-700 uppercase tracking-wider"
              >
                Domain:
              </label>
              <select
                id="dom-tab-filter"
                value={selectedDomFilter}
                onChange={(e) => setSelectedDomFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs outline-none focus:border-primary text-slate-800 font-black cursor-pointer transition hover:border-slate-400 shadow-sm max-w-full"
              >
                <option value="">All Domains</option>
                {domainsOptions.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
            <div className="space-y-4 min-w-0">
              <h3 className="text-xs font-black text-[#0B1B3A] uppercase tracking-widest flex items-center gap-2 font-heading">
                <Compass size={14} className="text-primary" /> Domain Rankings
              </h3>

              <div className="hidden md:block w-full min-w-0 border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full border-collapse text-left text-sm text-slate-700 table-fixed">
                  <thead className="bg-slate-100/90 text-[11px] font-black text-slate-700 uppercase border-b border-slate-200 tracking-wider">
                    <tr>
                      <th className="px-3 py-3 w-16 text-center">Rank</th>
                      <th className="px-3 py-3 w-2/5">Innovation Domain</th>
                      <th className="px-3 py-3 text-right w-16">Teams</th>
                      <th className="px-3 py-3 text-right w-24">Highest TRL</th>
                      <th className="px-3 py-3 text-right w-16">Ideas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 bg-white">
                    {filteredRankedDoms.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-xs italic text-slate-600 bg-slate-50"
                        >
                          No domains match the criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredRankedDoms.map((row) => (
                        <tr
                          key={row.domain}
                          className="hover:bg-slate-50 transition-all duration-200 group"
                        >
                          <td className="px-3 py-3 text-center">
                            <RankBadge rank={row.rank} size={28} />
                          </td>
                          <td
                            className="px-3 py-3 font-black text-[#0B1B3A] truncate"
                            title={row.domain}
                          >
                            {row.domain}
                          </td>
                          <td className="px-3 py-3 text-right font-black text-[#0B1B3A]">
                            {row.teamsCount}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="inline-flex items-center justify-center bg-primary/15 text-primary font-mono font-black text-xs px-2.5 py-0.5 rounded border border-primary/30 shadow-2xs">
                              TRL {row.highestTrl}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-black text-[#0B1B3A]">
                            {row.ideasCount}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="block md:hidden space-y-3 w-full min-w-0">
                {filteredRankedDoms.map((row) => (
                  <div
                    key={row.domain}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2.5 shadow-2xs min-w-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <RankBadge rank={row.rank} size={30} />
                        <h4 className="font-black text-sm text-[#0B1B3A] break-words">
                          {row.domain}
                        </h4>
                      </div>
                      <span className="shrink-0 inline-flex items-center justify-center bg-primary/15 text-primary font-mono font-black text-xs px-2.5 py-1 rounded border border-primary/30">
                        TRL {row.highestTrl}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-xs">
                      <div className="bg-white p-2 rounded-xl border border-slate-200 text-center">
                        <span className="text-[10px] font-bold text-slate-600 uppercase block">
                          Teams
                        </span>
                        <span className="font-black text-[#0B1B3A] text-sm">
                          {row.teamsCount}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-slate-200 text-center">
                        <span className="text-[10px] font-bold text-slate-600 uppercase block">
                          Ideas
                        </span>
                        <span className="font-black text-[#0B1B3A] text-sm">
                          {row.ideasCount}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 flex flex-col justify-between min-w-0">
              <div>
                <h3 className="text-xs font-black text-[#0B1B3A] uppercase tracking-widest mb-1 flex items-center gap-2 font-heading">
                  <Layers size={14} className="text-primary" /> TEAMS
                  DISTRIBUTION BY HIGHEST TRL
                </h3>
                <p className="text-xs text-slate-600 font-bold uppercase tracking-wider mb-6">
                  Domain-wise team distribution across TRL levels
                </p>

                <div className="w-full min-w-0">
                  <div className="flex justify-between items-end h-56 sm:h-64 w-full px-1 pb-2 relative gap-1 sm:gap-2">
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-12 pt-6">
                      <div className="border-t border-slate-200 w-full" />
                      <div className="border-t border-slate-200 w-full" />
                      <div className="border-t border-slate-200 w-full" />
                      <div className="border-t border-slate-200 w-full" />
                    </div>

                    {filteredRankedDoms.map((d) => {
                      const totalTeams = d.teamsCount;
                      return (
                        <div
                          key={d.domain}
                          className="flex flex-col items-center gap-1.5 flex-1 min-w-0 relative z-10"
                        >
                          <span className="text-[9px] font-black text-[#0B1B3A] font-mono">
                            {totalTeams}
                          </span>

                          <div
                            className="w-full max-w-[28px] sm:max-w-[36px] rounded-t-lg overflow-hidden border border-slate-200 bg-slate-100/70 flex flex-col-reverse justify-start shrink-0 h-36 sm:h-40 relative"
                            style={{
                              height: `${Math.max((totalTeams / maxTeamsInTrlDist) * 150, 20)}px`,
                            }}
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => {
                              const count = d.trlDistribution[level];
                              if (!count || count === 0) return null;
                              const pct = (count / totalTeams) * 100;
                              return (
                                <div
                                  key={level}
                                  className={`w-full ${trlColorMap[level]} transition-all duration-300 relative group cursor-help border-b border-slate-100/10`}
                                  style={{ height: `${pct}%` }}
                                >
                                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-35 pointer-events-none shadow-md">
                                    TRL {level}: {count}{" "}
                                    {count === 1 ? "team" : "teams"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <span
                            className="text-[7px] sm:text-[9px] font-black text-[#0B1B3A] text-center truncate w-full uppercase tracking-wider px-0.5"
                            title={d.domain}
                          >
                            {d.domain}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 justify-center text-[10px] font-black uppercase tracking-wider text-slate-700 bg-slate-100/80 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-blue-500 shadow-sm" />
                  <span>TRL 1–3 (Early Stage)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-emerald-500 shadow-sm" />
                  <span>TRL 4–6 (Development)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-orange-500 shadow-sm" />
                  <span>TRL 7–9 (Advanced)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Live Community Voting Leaderboard View
  const renderVotingLeaderboard = () => {
    // Filter teams by search and department
    const filtered = votingStats.teams.filter((t) => {
      const matchesSearch =
        !votingSearch.trim() ||
        (t.teamName && t.teamName.toLowerCase().includes(votingSearch.toLowerCase().trim())) ||
        (t.department && t.department.toLowerCase().includes(votingSearch.toLowerCase().trim())) ||
        (t.leadingProductTitle && t.leadingProductTitle.toLowerCase().includes(votingSearch.toLowerCase().trim()));

      const matchesDept =
        !votingDeptFilter || t.department === votingDeptFilter;

      return matchesSearch && matchesDept;
    });

    const totalPages = Math.ceil(filtered.length / teamsPerPage) || 1;
    const startIndex = (votingPage - 1) * teamsPerPage;
    const paginatedTeams = filtered.slice(startIndex, startIndex + teamsPerPage);

    // Calculate counts for all 10 official departments
    const votingDeptCounts = {};
    OFFICIAL_DEPARTMENTS.forEach((d) => { votingDeptCounts[d] = 0; });
    const deptVoteCounts = {};

    votingStats.teams.forEach((t) => {
      if (t.department) {
        if (votingDeptCounts[t.department] !== undefined) {
          votingDeptCounts[t.department]++;
        }
        deptVoteCounts[t.department] = (deptVoteCounts[t.department] || 0) + (t.voteCount || 0);
      }
    });

    let topDeptName = 'None';
    let topDeptVotes = 0;
    Object.entries(deptVoteCounts).forEach(([d, v]) => {
      if (v > topDeptVotes) {
        topDeptVotes = v;
        topDeptName = d;
      }
    });

    return (
      <div className="mx-auto w-full max-w-[1400px] px-3 sm:px-4 md:px-6 lg:px-8 mt-6 min-w-0 space-y-8">
        {/* Realtime Status Bar & Quick Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-3 w-3 items-center justify-center">
              {realtimeStatus === 'connected' ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500 animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <span className={realtimeStatus === 'connected' ? 'text-emerald-700' : 'text-amber-700'}>
                {realtimeStatus === 'connected' ? 'Live Realtime Updates Active' : 'Auto-Sync Active (20s)'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => fetchVotingRankings()}
              disabled={votingLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
              title="Manually synchronize leaderboard with server"
            >
              <RefreshCw size={13} className={votingLoading ? 'animate-spin text-primary' : 'text-slate-500'} />
              <span>{votingLoading ? 'Syncing...' : 'Sync'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedVotingToken('');
                setVotingModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-accent text-xs font-extrabold text-white shadow-sm hover:bg-amber-600 transition cursor-pointer"
            >
              <Vote size={14} />
              <span>Cast Vote</span>
            </button>
          </div>
        </div>

        {/* Voting KPI Grid (3 Columns, No Round Card) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {/* Card 1: Total Votes */}
          <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Community Votes</span>
              <Sparkles size={16} className="text-amber-500" />
            </div>
            <p className="font-heading text-2xl sm:text-3xl font-black text-[#0B1B3A]">
              {votingStats.totalVotes.toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-500 font-medium">Authoritative database verified</p>
          </div>

          {/* Card 2: Active Teams */}
          <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Eligible Teams</span>
              <Users size={16} className="text-primary" />
            </div>
            <p className="font-heading text-2xl sm:text-3xl font-black text-[#0B1B3A]">
              {votingStats.totalTeams || votingStats.teams.length}
            </p>
            <p className="text-[10px] text-slate-500 font-medium">Registered project teams</p>
          </div>

          {/* Card 3: Top Department */}
          <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Leading Dept</span>
              <Building size={16} className="text-indigo-600" />
            </div>
            <p className="font-heading text-base sm:text-lg font-black text-[#0B1B3A] truncate" title={topDeptName}>
              {topDeptName}
            </p>
            <p className="text-[10px] text-indigo-700 font-bold">
              {topDeptVotes} accumulated votes
            </p>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={votingSearch}
              onChange={(e) => {
                setVotingSearch(e.target.value);
                setVotingPage(1);
              }}
              placeholder="Search by team name or project..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:border-primary focus:outline-none transition"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={15} className="text-slate-400 shrink-0 hidden sm:inline" />
            <select
              value={votingDeptFilter}
              onChange={(e) => {
                setVotingDeptFilter(e.target.value);
                setVotingPage(1);
              }}
              className="w-full sm:w-64 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:bg-white focus:border-primary focus:outline-none transition"
            >
              <option value="">All Departments ({votingStats.teams.length})</option>
              {OFFICIAL_DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept} ({votingDeptCounts[dept] || 0})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Full Leaderboard Table / Cards */}
        <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-heading font-extrabold text-sm sm:text-base text-[#0B1B3A]">
              Live Standings ({filtered.length} Teams)
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">
              Page {votingPage} of {totalPages}
            </span>
          </div>

          {paginatedTeams.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <Trophy size={36} className="mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-700">No teams match your search or filter</p>
              <p className="text-xs text-slate-500">Try adjusting your filters or clearing search criteria.</p>
            </div>
          ) : (
            <>
              {/* Desktop / Tablet Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4 w-16 text-center">Rank</th>
                      <th className="py-3.5 px-4">Team & Innovation</th>
                      <th className="py-3.5 px-4">Department</th>
                      <th className="py-3.5 px-4 text-center">Votes</th>
                      <th className="py-3.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedTeams.map((team) => {
                      const isPulse = recentlyVotedTeamId === team.id;

                      return (
                        <tr
                          key={team.id}
                          className={`transition-colors duration-500 hover:bg-slate-50/80 ${
                            isPulse ? 'bg-amber-50/80 font-bold' : ''
                          }`}
                        >
                          <td className="py-3.5 px-4 text-center">
                            <RankBadge rank={team.rank} size={28} />
                          </td>
                          <td className="py-3.5 px-4 max-w-xs">
                            <div className="flex items-center gap-2">
                              <p className="font-extrabold text-slate-900 truncate" title={team.teamName}>
                                {team.teamName}
                              </p>
                              {isPulse && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-200 text-amber-900 animate-pulse">
                                  +1 NEW VOTE
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate" title={team.leadingProductTitle}>
                              {team.leadingProductTitle || 'Project Showcase'}
                            </p>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 truncate max-w-[200px]" title={team.department}>
                              {team.department}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="font-heading font-black text-sm sm:text-base text-[#0B1B3A]">
                              {team.voteCount}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedVotingToken(team.id);
                                setVotingModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1 text-xs font-bold text-primary hover:bg-primary hover:text-white transition cursor-pointer"
                            >
                              <Vote size={13} />
                              <span>Vote</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Sleek Cards (360px – 430px Friendly, NO Horizontal Scroll) */}
              <div className="sm:hidden divide-y divide-slate-100">
                {paginatedTeams.map((team) => {
                  const isPulse = recentlyVotedTeamId === team.id;

                  return (
                    <div
                      key={team.id}
                      className={`p-3.5 space-y-2 transition-all duration-500 ${
                        isPulse ? 'bg-amber-50/90 border-l-4 border-l-amber-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <RankBadge rank={team.rank} size={28} />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h4 className="font-heading font-extrabold text-xs text-slate-900 truncate max-w-[170px]" title={team.teamName}>
                                {team.teamName}
                              </h4>
                              {isPulse && (
                                <span className="inline-block px-1.5 py-0.2 rounded-full text-[8px] font-black bg-amber-200 text-amber-900">
                                  +1
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500 block truncate max-w-[190px]">
                              {team.department}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="font-heading font-black text-base text-[#0B1B3A]">
                            {team.voteCount}
                          </span>
                          <span className="block text-[9px] text-slate-400 font-bold uppercase">
                            Votes
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-50">
                        <p className="text-[10px] text-slate-600 truncate max-w-[210px]">
                          {team.leadingProductTitle || 'Project Showcase'}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedVotingToken(team.id);
                            setVotingModalOpen(true);
                          }}
                          className="rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary hover:text-white transition cursor-pointer"
                        >
                          Vote
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setVotingPage((p) => Math.max(1, p - 1))}
                disabled={votingPage === 1}
                className="rounded-xl border border-slate-200 px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition cursor-pointer"
              >
                Previous
              </button>
              <span className="font-bold text-slate-600">
                {votingPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setVotingPage((p) => Math.min(totalPages, p + 1))}
                disabled={votingPage === totalPages}
                className="rounded-xl border border-slate-200 px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-slate-50 min-h-screen pb-20 pt-24 relative overflow-x-hidden">
      <div className="bg-slate-900 text-white py-12 md:py-16 relative overflow-hidden rounded-b-3xl">
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-400 via-primary to-slate-900" />
        <div className="mx-auto w-full max-w-[1400px] px-4 md:px-6 lg:px-8 relative z-10 text-center">
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight md:text-5xl lg:text-6xl text-white animate-fade-in break-words">
            IPL 2026 Leaderboard
          </h1>
        </div>
      </div>

      {leaderboardType === "VOTING_BASED" ? (
        renderVotingLeaderboard()
      ) : (
        /* TRL Based Full Interactive Leaderboard */
        <>
          {/* Tabs Menu */}
          <div className="mx-auto w-full max-w-[1400px] px-3 sm:px-4 md:px-6 lg:px-8 -mt-6 relative z-20">
            <div className="flex justify-center">
              <div className="inline-flex flex-wrap justify-center rounded-2xl bg-white p-1.5 shadow-md border border-slate-250 max-w-full gap-1">
                <button
                  onClick={() => {
                    setActiveTab("overall");
                    setTeamsPage(1);
                  }}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer border ${
                    activeTab === "overall"
                      ? "bg-primary text-white border-primary-dark shadow-[0_2px_8px_rgba(36,68,154,0.25)]"
                      : "bg-slate-100/80 border-slate-200 text-slate-700 hover:bg-slate-200/70 hover:text-slate-900"
                  }`}
                >
                  <LayoutDashboard size={14} />
                  Overall
                </button>
                <button
                  onClick={() => {
                    setActiveTab("department");
                    setTeamsPage(1);
                  }}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer border ${
                    activeTab === "department"
                      ? "bg-primary text-white border-primary-dark shadow-[0_2px_8px_rgba(36,68,154,0.25)]"
                      : "bg-slate-100/80 border-slate-200 text-slate-700 hover:bg-slate-200/70 hover:text-slate-900"
                  }`}
                >
                  <Building size={14} />
                  Department-wise
                </button>
                <button
                  onClick={() => {
                    setActiveTab("domain");
                    setTeamsPage(1);
                  }}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer border ${
                    activeTab === "domain"
                      ? "bg-primary text-white border-primary-dark shadow-[0_2px_8px_rgba(36,68,154,0.25)]"
                      : "bg-slate-100/80 border-slate-200 text-slate-700 hover:bg-slate-200/70 hover:text-slate-900"
                  }`}
                >
                  <Compass size={14} />
                  Domain-wise
                </button>
              </div>
            </div>
          </div>

          {/* Event KPI Summary Block */}
          <div className="mx-auto w-full max-w-[1400px] px-3 sm:px-4 md:px-6 lg:px-8 mt-10">
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5 mb-8">
              {/* Card 1: Teams Registered */}
              <div className="relative bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md hover:border-slate-300 transition overflow-hidden group min-w-0">
                <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity select-none pointer-events-none">
                  <Gear
                    size={80}
                    rotation={scrollProgress * 180}
                    color="#475569"
                  />
                </div>
                <div className="flex items-center justify-between mb-3 relative z-10">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 truncate">
                    Teams Registered
                  </span>
                  <div className="p-1.5 rounded-lg bg-blue-500/10 text-primary border border-blue-200/50 shadow-sm shrink-0">
                    <Users size={16} />
                  </div>
                </div>
                <div className="relative z-10">
                  <span className="text-2xl font-black text-[#0B1B3A] tracking-tight">
                    {kpis.totalTeams}
                  </span>
                  <p className="text-[10px] text-slate-600 mt-1 font-bold uppercase">
                    Unique teams
                  </p>
                </div>
              </div>

              {/* Card 2: Students Participating */}
              <div className="relative bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md hover:border-slate-300 transition overflow-hidden group min-w-0">
                <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity select-none pointer-events-none">
                  <Gear
                    size={80}
                    rotation={-scrollProgress * 180}
                    color="#475569"
                  />
                </div>
                <div className="flex items-center justify-between mb-3 relative z-10">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 truncate">
                    Students Participating
                  </span>
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-accent border border-amber-200/50 shadow-sm shrink-0">
                    <Award size={16} />
                  </div>
                </div>
                <div className="relative z-10">
                  <span className="text-2xl font-black text-[#0B1B3A] tracking-tight">
                    {kpis.totalStudents}
                  </span>
                  <p className="text-[10px] text-slate-600 mt-1 font-bold uppercase">
                    Unique students
                  </p>
                </div>
              </div>

              {/* Card 3: Ideas Submitted */}
              <div className="relative bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md hover:border-slate-300 transition overflow-hidden group min-w-0">
                <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity select-none pointer-events-none">
                  <Gear
                    size={80}
                    rotation={scrollProgress * 180}
                    color="#475569"
                  />
                </div>
                <div className="flex items-center justify-between mb-3 relative z-10">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 truncate">
                    Ideas Submitted
                  </span>
                  <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 border border-purple-200/50 shadow-sm shrink-0">
                    <Layers size={16} />
                  </div>
                </div>
                <div className="relative z-10">
                  <span className="text-2xl font-black text-[#0B1B3A] tracking-tight">
                    {kpis.totalIdeas}
                  </span>
                  <p className="text-[10px] text-slate-600 mt-1 font-bold uppercase">
                    Ideas submitted
                  </p>
                </div>
              </div>

              {/* Card 4: Departments */}
              <div className="relative bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md hover:border-slate-300 transition overflow-hidden group min-w-0">
                <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity select-none pointer-events-none">
                  <Gear
                    size={80}
                    rotation={-scrollProgress * 180}
                    color="#475569"
                  />
                </div>
                <div className="flex items-center justify-between mb-3 relative z-10">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 truncate">
                    Departments
                  </span>
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-200/50 shadow-sm shrink-0">
                    <Building size={16} />
                  </div>
                </div>
                <div className="relative z-10">
                  <span className="text-2xl font-black text-[#0B1B3A] tracking-tight">
                    {kpis.totalDepartments}
                  </span>
                  <p className="text-[10px] text-slate-600 mt-1 font-bold uppercase">
                    Active departments
                  </p>
                </div>
              </div>

              {/* Card 5: Innovation Domains */}
              <div className="relative bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md hover:border-slate-300 transition overflow-hidden group min-w-0">
                <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity select-none pointer-events-none">
                  <Gear
                    size={80}
                    rotation={scrollProgress * 180}
                    color="#475569"
                  />
                </div>
                <div className="flex items-center justify-between mb-3 relative z-10">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 truncate">
                    Innovation Domains
                  </span>
                  <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-600 border border-orange-200/50 shadow-sm shrink-0">
                    <Cpu size={16} />
                  </div>
                </div>
                <div className="relative z-10">
                  <span className="text-2xl font-black text-[#0B1B3A] tracking-tight">
                    {kpis.totalDomains}
                  </span>
                  <p className="text-[10px] text-slate-600 mt-1 font-bold uppercase">
                    Innovation domains
                  </p>
                </div>
              </div>
            </div>

            {/* Content Tabs Area */}
            <SectionReveal>
              {loading ? (
                <div className="flex h-96 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white shadow-sm">
                  <div className="text-center">
                    <MechanicalLoader
                      size={44}
                      className="text-accent mx-auto"
                    />
                    <p className="mt-3 text-sm text-slate-600 font-bold uppercase tracking-wider">
                      Aggregating live metrics...
                    </p>
                  </div>
                </div>
              ) : error ? (
                <div className="flex h-96 items-center justify-center rounded-2xl border border-dashed border-red-200 bg-red-50 p-6">
                  <div className="text-center text-red-700">
                    <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
                    <p className="mt-3 text-sm font-extrabold uppercase tracking-wider">
                      Failed to aggregate statistics
                    </p>
                    <p className="mt-1 text-xs text-red-500">{error}</p>
                  </div>
                </div>
              ) : kpis.totalTeams === 0 ? (
                <div className="flex h-96 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white shadow-sm">
                  <div className="text-center text-slate-600">
                    <Trophy className="mx-auto h-10 w-10 text-slate-350" />
                    <p className="mt-3 text-sm font-extrabold uppercase tracking-wider">
                      No Submissions Recorded Yet
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Leaderboard statistics will show here once teams submit
                      ideas.
                    </p>
                  </div>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25 }}
                    className="w-full min-w-0"
                  >
                    {activeTab === "overall" && renderOverallView()}
                    {activeTab === "department" && renderDepartmentView()}
                    {activeTab === "domain" && renderDomainView()}
                  </motion.div>
                </AnimatePresence>
              )}
            </SectionReveal>
          </div>
        </>
      )}

      <VotingModal
        isOpen={votingModalOpen}
        onClose={() => setVotingModalOpen(false)}
        initialToken={selectedVotingToken}
        user={user}
        session={session}
        profile={profile}
        onProfileUpdate={onProfileUpdate}
      />
    </div>
  );
}
