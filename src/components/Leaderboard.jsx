import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Building, Cpu, AlertCircle, Users, LayoutDashboard, Compass, Layers, Award } from 'lucide-react'
import SectionReveal from './SectionReveal'
import MechanicalLoader from './MechanicalLoader'
import { supabase } from '../supabaseClient'

// Reusable SVG Mechanical Gear Helper
function Gear({ size = 30, rotation = 0, className = "", color = "currentColor" }) {
  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
  const transitionStyle = prefersReducedMotion ? 'none' : 'transform 0.6s cubic-bezier(0.15, 0.85, 0.3, 1)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={{
        transform: `rotate(${rotation}deg)`,
        transformOrigin: '50% 50%',
        transition: transitionStyle
      }}
    >
      <circle cx="50" cy="50" r="15" fill="none" stroke={color} strokeWidth="6" />
      {/* Outer ring */}
      <circle cx="50" cy="50" r="35" fill="none" stroke={color} strokeWidth="8" />
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
      <div className="relative flex items-center justify-center mx-auto" style={{ width: size, height: size }}>
        <Gear size={size} rotation={0} color="#FFB000" className="animate-[spin_20s_linear_infinite]" />
        <span className="absolute font-extrabold text-xs text-slate-900 z-10">1</span>
      </div>
    )
  }
  if (rank === 2) {
    return (
      <div className="relative flex items-center justify-center mx-auto" style={{ width: size, height: size }}>
        <Gear size={size} rotation={15} color="#94a3b8" className="animate-[spin_25s_linear_infinite_reverse]" />
        <span className="absolute font-extrabold text-xs text-slate-950 z-10">2</span>
      </div>
    )
  }
  if (rank === 3) {
    return (
      <div className="relative flex items-center justify-center mx-auto" style={{ width: size, height: size }}>
        <Gear size={size} rotation={30} color="#cd7f32" className="animate-[spin_30s_linear_infinite]" />
        <span className="absolute font-extrabold text-xs text-slate-955 z-10">3</span>
      </div>
    )
  }
  return (
    <div
      className="relative flex items-center justify-center rounded-full bg-slate-100 border border-slate-350 shadow-inner font-bold text-xs text-slate-600 mx-auto"
      style={{ width: size - 4, height: size - 4 }}
    >
      <div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 rounded-full bg-slate-400" />
      <div className="absolute bottom-0.5 right-0.5 w-0.5 h-0.5 rounded-full bg-slate-400" />
      {rank}
    </div>
  )
}

// Reusable Mini Interlocking Mechanical Gears Indicator
function MechanicalGearsMini({ scrollProgress }) {
  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  const rotClockwise = prefersReducedMotion ? 0 : (scrollProgress * 720);
  const rotCounterClockwise = prefersReducedMotion ? 0 : (-scrollProgress * 720);

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded-full shadow-inner select-none pointer-events-none shrink-0" title="Transmission telemetry linked to scroll">
      {/* Gear 1: Clockwise */}
      <Gear size={12} rotation={rotClockwise} color="#24449A" />
      {/* Gear 2: Counter-Clockwise */}
      <Gear size={10} rotation={rotCounterClockwise} color="#FFA500" />
      {/* Gear 3: Clockwise */}
      <Gear size={12} rotation={rotClockwise} color="#24449A" />
    </div>
  );
}

export default function Leaderboard() {
  const [activeTab, setActiveTab] = useState('overall')
  const [scrollProgress, setScrollProgress] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedDepartment, setSelectedDepartment] = useState("")
  const [selectedDeptFilter, setSelectedDeptFilter] = useState("")
  const [selectedDomFilter, setSelectedDomFilter] = useState("")

  // Overall States
  const [kpis, setKpis] = useState({
    totalTeams: 0,
    totalStudents: 0,
    totalIdeas: 0,
    totalDepartments: 0,
    totalDomains: 0
  })
  const [overallStats, setOverallStats] = useState({
    top5Teams: [],
    ideaDistribution: [],
    allTeams: []
  })

  // Pagination for Top Teams Table
  const [teamsPage, setTeamsPage] = useState(1)
  const teamsPerPage = 10

  // Date Formatter helper: DD MMM YYYY · hh:mm AM/PM
  const formatTimestamp = (dateStr) => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return 'N/A'

    const day = String(date.getDate()).padStart(2, '0')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const month = months[date.getMonth()]
    const year = date.getFullYear()

    let hours = date.getHours()
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12
    hours = hours ? hours : 12 // the hour '0' should be '12'
    const formattedHours = String(hours).padStart(2, '0')

    return `${day} ${month} ${year} · ${formattedHours}:${minutes} ${ampm}`
  }

  const fetchRankings = async () => {
    try {
      setLoading(true)
      setError(null)

      // Call the secure aggregate RPC function
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_leaderboard_v2')
      if (rpcErr) throw rpcErr

      if (!rpcData) {
        throw new Error('Leaderboard RPC returned empty payload.')
      }

      // Fetch active products through secure backend API proxy to bypass client-side RLS
      const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')
      const response = await fetch(`${rawApiUrl}/api/leaderboard-domains`)
      if (!response.ok) {
        throw new Error(`Failed to fetch active products metadata from server. Code: ${response.status}`)
      }
      const resJson = await response.json()
      const productsData = resJson.data

      const { kpis: fetchedKpis, team_rankings } = rpcData

      // 1. Set KPIs
      setKpis({
        totalTeams: Number(fetchedKpis.totalTeams || 0),
        totalStudents: Number(fetchedKpis.totalStudents || 0),
        totalIdeas: Number(fetchedKpis.totalIdeas || 0),
        totalDepartments: Number(fetchedKpis.totalDepartments || 0),
        totalDomains: Number(fetchedKpis.totalDomains || 0)
      })

      // 2. Set Overall Stats / Team Rankings
      const teamList = team_rankings || []
      const resolvedTeams = teamList.map(t => {
        const teamProducts = (productsData || []).filter(p => p.team_id === t.id);
        const sortedProds = [...teamProducts].sort((a, b) => {
          const trlA = a.trl_level || 0;
          const trlB = b.trl_level || 0;
          if (trlB !== trlA) return trlB - trlA;

          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          if (timeA !== timeB) return timeA - timeB;

          return String(a.id).localeCompare(String(b.id));
        });
        const leadingProduct = sortedProds[0];
        const innovationDomain = leadingProduct
          ? (leadingProduct.innovation_domain?.trim() || 'Open Innovation')
          : 'Open Innovation';

        return {
          ...t,
          innovationDomain
        };
      });
      const top5Teams = resolvedTeams.slice(0, 5)

      // Compute idea distribution from team rankings
      const distribution = {}
      teamList.forEach(t => {
        const count = t.ideas || 0
        distribution[count] = (distribution[count] || 0) + 1
      })
      const ideaDistribution = Object.keys(distribution).map(count => ({
        ideas: parseInt(count, 10),
        teams: distribution[count]
      }))
      ideaDistribution.sort((a, b) => a.ideas - b.ideas)

      setOverallStats({
        top5Teams,
        ideaDistribution,
        allTeams: resolvedTeams
      })



    } catch (err) {
      console.error('[Leaderboard] V2 calculation error:', err.message || err)
      setError(err.message || 'An error occurred while aggregating data from Supabase.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRankings()

    const handleRefresh = () => {
      console.log('[Leaderboard] Refreshing data via custom event');
      fetchRankings();
    }
    window.addEventListener('refresh-leaderboard', handleRefresh);

    const handleScroll = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      if (docHeight > 0) {
        setScrollProgress(window.scrollY / docHeight)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()

    return () => {
      window.removeEventListener('refresh-leaderboard', handleRefresh);
      window.removeEventListener('scroll', handleScroll);
    }
  }, [])

  // Overall Render View
  const renderOverallView = () => {
    // Calculate department options dynamically from the loaded teams
    const departments = Array.from(new Set(overallStats.allTeams.map(t => t.department).filter(Boolean))).sort();

    // Filter teams by department if selected
    const filteredTeamsForChart = selectedDepartment
      ? overallStats.allTeams.filter(t => t.department === selectedDepartment)
      : overallStats.allTeams;

    // 1. Total teams in chart
    const chartTotalTeams = filteredTeamsForChart.length;

    // 2. TRL distribution
    const trlDistribution = {};
    for (let i = 1; i <= 9; i++) {
      trlDistribution[i] = 0;
    }
    filteredTeamsForChart.forEach(t => {
      const trl = t.highestTrl;
      if (trl && trl >= 1 && trl <= 9) {
        trlDistribution[trl]++;
      }
    });

    const maxTeamsInTrlDist = Math.max(...Object.values(trlDistribution), 1);

    // 3. Average TRL: Avg TRL should be calculated from each team's highest TRL
    const teamsWithTrl = filteredTeamsForChart.filter(t => t.highestTrl !== null && t.highestTrl !== undefined);
    const _avgTrl = teamsWithTrl.length > 0
      ? Number((teamsWithTrl.reduce((sum, t) => sum + Number(t.highestTrl), 0) / teamsWithTrl.length).toFixed(1))
      : 0;

    // 4. Highest TRL: maximum team TRL
    const highestTrl = teamsWithTrl.length > 0
      ? Math.max(...teamsWithTrl.map(t => t.highestTrl))
      : 0;

    // 5. Top TRL Range: identify the TRL range containing the largest concentration of teams.
    let topRange = "N/A";
    let maxConc = -1;
    for (let i = 1; i <= 8; i++) {
      const sum = trlDistribution[i] + trlDistribution[i+1];
      if (sum > maxConc) {
        maxConc = sum;
        topRange = `TRL ${i} – ${i+1}`;
      }
    }

    const trlConfigs = [
      { level: 1, label: "TRL 1", desc: "(Basic)", colorClass: "bg-blue-500/20 text-blue-600 border border-blue-400/50 hover:bg-blue-500/30" },
      { level: 2, label: "TRL 2", desc: "(Formulated)", colorClass: "bg-blue-500/20 text-blue-600 border border-blue-400/50 hover:bg-blue-500/30" },
      { level: 3, label: "TRL 3", desc: "(Proof of Concept)", colorClass: "bg-blue-500/25 text-blue-700 border border-blue-450/50 hover:bg-blue-500/35" },
      { level: 4, label: "TRL 4", desc: "(Validated)", colorClass: "bg-emerald-500/20 text-emerald-600 border border-emerald-400/50 hover:bg-emerald-500/30" },
      { level: 5, label: "TRL 5", desc: "(Prototype)", colorClass: "bg-emerald-500/20 text-emerald-600 border border-emerald-400/50 hover:bg-emerald-500/30" },
      { level: 6, label: "TRL 6", desc: "(System)", colorClass: "bg-emerald-500/25 text-emerald-700 border border-emerald-450/50 hover:bg-emerald-500/35" },
      { level: 7, label: "TRL 7", desc: "(Demonstration)", colorClass: "bg-amber-500/20 text-amber-600 border border-amber-400/50 hover:bg-amber-500/30" },
      { level: 8, label: "TRL 8", desc: "(Pre-Production)", colorClass: "bg-amber-500/25 text-amber-700 border border-amber-450/50 hover:bg-amber-500/35" },
      { level: 9, label: "TRL 9", desc: "(Market Ready)", colorClass: "bg-orange-500/35 text-orange-700 border border-orange-400/50 hover:bg-orange-500/45" }
    ];

    const paginatedTeams = overallStats.allTeams.slice((teamsPage - 1) * teamsPerPage, teamsPage * teamsPerPage)
    const totalTeamsPages = Math.ceil(overallStats.allTeams.length / teamsPerPage)
    const hasTrlData = overallStats.allTeams.length > 0 && overallStats.allTeams.some(t => t.highestTrl !== undefined && t.highestTrl !== null);

    return (
      <div className="space-y-8 mt-8 relative overflow-hidden">
        {/* Subtle radial/technical background details */}
        <div className="absolute inset-0 opacity-[0.02] select-none pointer-events-none z-0">
          <svg className="w-full h-full text-slate-800" viewBox="0 0 800 800" fill="none" stroke="currentColor">
            <circle cx="400" cy="400" r="320" strokeWidth="1" strokeDasharray="4 4" />
            <circle cx="400" cy="400" r="240" strokeWidth="0.5" />
            <circle cx="400" cy="400" r="120" strokeWidth="0.75" strokeDasharray="2 2" />
            <line x1="80" y1="400" x2="720" y2="400" strokeWidth="0.5" />
            <line x1="400" y1="80" x2="400" y2="720" strokeWidth="0.5" />
          </svg>
        </div>

        {/* Faint scroll-driven rotating background gears */}
        <div className="absolute -top-12 -right-12 opacity-[0.02] text-slate-800 pointer-events-none select-none z-0">
          <Gear size={280} rotation={scrollProgress * 90} />
        </div>
        <div className="absolute -bottom-16 -left-16 opacity-[0.02] text-slate-800 pointer-events-none select-none z-0">
          <Gear size={320} rotation={-scrollProgress * 75} />
        </div>

        {/* Submission Overview & Distribution Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 relative z-10">
          {/* Submission Overview Card */}
          <div className="relative bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between overflow-hidden md:col-span-1">
            {/* Extremely faint slow watermark gear */}
            <div className="absolute -right-4 -bottom-4 opacity-[0.03] text-slate-900 pointer-events-none select-none">
              <Gear size={80} rotation={scrollProgress * 60} />
            </div>

            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-5 flex items-center gap-2 border-b border-slate-100 pb-2.5 font-heading">
                <Trophy size={14} className="text-primary" /> Submission Overview
              </h3>
              <div className="space-y-4 mt-2">
                <div className="flex items-center justify-between text-sm py-2 px-3 border border-slate-150 bg-slate-50/50 rounded-xl">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Teams Registered</span>
                  <span className="font-black text-slate-800 text-base">{kpis.totalTeams}</span>
                </div>
                <div className="flex items-center justify-between text-sm py-2 px-3 border border-slate-150 bg-slate-50/50 rounded-xl">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Ideas Submitted</span>
                  <span className="font-black text-slate-800 text-base">{kpis.totalIdeas}</span>
                </div>
              </div>
            </div>
            <div className="mt-6 pt-3 border-t border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Live updates of submission metrics across all registered teams.
            </div>
          </div>

          {/* Team Activity Distribution Chart */}
          <div className="relative md:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between overflow-hidden">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-6">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 font-heading">
                  <Layers size={14} className="text-primary" /> TEAM ACTIVITY
                </h3>
                <div className="flex items-center gap-2">
                  <label htmlFor="dept-filter-chart" className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Dept Selector:</label>
                  <select
                    id="dept-filter-chart"
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-primary text-slate-700 font-bold cursor-pointer transition hover:border-slate-350 shadow-sm"
                  >
                    <option value="">All Departments</option>
                    {departments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Chart Grid */}
              <div className="space-y-2">
                <div className="block sm:hidden text-right">
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-455 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-md">
                    ← Scroll Chart →
                  </span>
                </div>
                <div className="overflow-x-auto w-full scrollbar-thin">
                  <div className="flex justify-between items-end h-48 min-w-[640px] px-2 pb-2 relative">
                    {/* Grid Lines */}
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-12 pt-6">
                      <div className="border-t border-slate-100 w-full" />
                      <div className="border-t border-slate-100 w-full" />
                      <div className="border-t border-slate-100 w-full" />
                      <div className="border-t border-slate-100 w-full" />
                    </div>

                    {trlConfigs.map(cfg => {
                      const count = trlDistribution[cfg.level];
                      const pct = (count / maxTeamsInTrlDist) * 100;
                      return (
                        <div key={cfg.level} className="flex flex-col items-center gap-2 w-full relative z-10">
                          <span className="text-[10px] font-black text-slate-700 font-mono">{count}</span>

                          {/* Simple clean rounded pillars */}
                          <div className="w-12 h-28 flex items-end justify-center bg-slate-50/50 rounded-t-lg border border-slate-100 relative overflow-hidden">
                            <div
                              className={`w-full rounded-t-lg transition-all duration-500 relative group cursor-help ${cfg.colorClass} shadow-sm`}
                              style={{ height: `${Math.max(pct, 4)}%` }}
                            >
                              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-30 pointer-events-none shadow-md">
                                {count} {count === 1 ? 'Team' : 'Teams'} at {cfg.label}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-center text-center">
                            <span className="text-[10px] font-black text-slate-800 whitespace-nowrap tracking-wider">{cfg.label}</span>
                            <span className="text-[8px] font-bold text-slate-400 whitespace-nowrap mt-0.5 uppercase tracking-wider">{cfg.desc}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Metrics Strip */}
            <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 min-[400px]:grid-cols-3 gap-4">
              <div className="flex flex-col bg-slate-50 p-3 rounded-xl border border-slate-150">
                <span className="text-[9px] font-black text-slate-450 uppercase tracking-wider">Total Teams</span>
                <span className="text-xl font-black text-slate-800 mt-1">{chartTotalTeams}</span>
              </div>
              <div className="flex flex-col bg-slate-50 p-3 rounded-xl border border-slate-150">
                <span className="text-[9px] font-black text-slate-450 uppercase tracking-wider">Highest TRL</span>
                <span className="text-xl font-black text-slate-800 mt-1">{highestTrl > 0 ? `TRL ${highestTrl}` : 'N/A'}</span>
              </div>
              <div className="flex flex-col bg-amber-500/5 p-3 rounded-xl border border-amber-200">
                <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider">Top TRL Range</span>
                <span className="text-xl font-black text-slate-800 mt-1">{topRange}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Podium for Top 3 and table of Top Teams */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 relative z-10">
          {/* Top Teams (Podium Card) */}
          <div className="relative bg-white border border-slate-200 rounded-3xl p-6 shadow-sm overflow-hidden lg:col-span-1">
            <h3 className="text-xs font-black text-slate-808 uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-slate-100 pb-2.5 font-heading">
              <Trophy size={16} className="text-primary" /> Top Performers
            </h3>
            <div className="space-y-4 relative z-10">
              {overallStats.top5Teams.slice(0, 3).map((t, idx) => (
                <div key={t.teamName} className="flex items-center gap-4 p-3 rounded-2xl border border-slate-150 bg-white hover:bg-slate-50 hover:-translate-y-0.5 transition-all duration-205 shadow-sm">
                  <div className="shrink-0">
                    <RankBadge rank={idx + 1} size={30} />
                  </div>
                  <div className="grow min-w-0">
                    <h4 className="font-extrabold text-sm text-slate-808 truncate">{t.teamName}</h4>
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase truncate tracking-wider mt-0.5">{t.department}</p>
                    {t.leadingProductTitle && (
                      <p className="text-[11px] text-slate-500 italic truncate mt-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-100" title={t.leadingProductTitle}>
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
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">Status</p>
                      </>
                    ) : (
                      <>
                        <span className="text-base font-black text-slate-808">{t.ideas}</span>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Ideas</p>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Team Rankings Table Card */}
          <div className="relative bg-white border border-slate-200 rounded-3xl p-6 shadow-sm overflow-hidden lg:col-span-2">
            <h3 className="text-xs font-black text-slate-808 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-100 pb-2.5 font-heading">
              <Users size={16} className="text-primary" /> Master Telemetry Board
            </h3>
            <div className="space-y-2">
              <div className="block sm:hidden text-right">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-450 uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded-md">
                  ← Scroll Horizontally →
                </span>
              </div>
              <div className="overflow-x-auto border border-slate-150 rounded-2xl scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <table className="w-full border-collapse text-left text-sm text-slate-650 min-w-[700px]">
                  <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 tracking-wider">
                    <tr>
                      <th className="px-4 py-3 w-20 text-center">Rank</th>
                      <th className="px-4 py-3">{hasTrlData ? 'Team & Product Assembly' : 'Team'}</th>
                      <th className="px-4 py-3">Department</th>
                      <th className={`px-4 py-3 text-right ${hasTrlData ? 'w-32' : 'w-24'}`}>{hasTrlData ? 'Highest TRL' : 'Ideas'}</th>
                      <th className="px-4 py-3 text-right w-48">Submission Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {paginatedTeams.map((row, idx) => {
                      const globalRank = (teamsPage - 1) * teamsPerPage + idx + 1
                      return (
                        <tr key={row.teamName} className="hover:translate-x-1.5 hover:bg-slate-50/60 transition-all duration-200 group">
                          <td className="px-4 py-3 text-center relative">
                            {/* Hover indicator dot */}
                            <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                            <RankBadge rank={globalRank} size={30} />
                          </td>
                          <td className="px-4 py-3 max-w-[200px]">
                            <div className="font-extrabold text-slate-808 truncate">{row.teamName}</div>
                            {row.leadingProductTitle && (
                              <div className="text-[11px] text-slate-500 italic truncate mt-0.5" title={row.leadingProductTitle}>
                                {row.leadingProductTitle}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs font-bold text-slate-450 truncate max-w-[180px] uppercase tracking-wider">{row.department}</td>
                          <td className="px-4 py-3 text-right font-extrabold">
                            {row.highestTrl !== undefined && row.highestTrl !== null ? (
                              <span className="inline-flex items-center justify-center bg-primary/10 text-primary font-mono font-black text-xs px-2.5 py-0.5 rounded border border-primary/20 shadow-sm">
                                TRL {row.highestTrl}
                              </span>
                            ) : (
                              <span className="font-black text-slate-808 text-base">{row.ideas}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-bold text-slate-455 whitespace-nowrap font-mono">{formatTimestamp(row.earliestTime)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination Controls */}
            {totalTeamsPages > 1 && (
              <div className="relative flex items-center justify-between mt-6 p-1">
                {/* Horizontal guide rail background */}
                <div className="absolute inset-x-12 top-1/2 -translate-y-1/2 h-0.5 bg-slate-100 border-b border-slate-200/60" />

                <button
                  onClick={() => setTeamsPage(p => Math.max(p - 1, 1))}
                  disabled={teamsPage === 1}
                  className="relative z-10 px-3 py-1 text-xs font-black uppercase text-slate-650 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-sm"
                >
                  ◀ Prev
                </button>

                {/* Centered progress indicator */}
                <div className="relative z-10 bg-white px-4 py-1.5 border border-slate-200 rounded-full shadow-sm flex items-center gap-3">
                  <div className="flex items-center gap-1 select-none">
                    {[...Array(Math.min(totalTeamsPages, 5))].map((_, idx) => {
                      const isActive = idx + 1 === teamsPage;
                      return (
                        <div
                          key={idx}
                          className={`w-1.5 h-1.5 rounded-full transition-all duration-350 ${
                            isActive ? 'bg-primary scale-125 ring-2 ring-primary/10' : 'bg-slate-200'
                          }`}
                        />
                      );
                    })}
                  </div>

                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                    Page {teamsPage} of {totalTeamsPages}
                  </span>

                  <div className="flex items-center shrink-0">
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-slate-400 transition-transform duration-350" style={{ transform: `rotate(${teamsPage * 45}deg)` }}>
                      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
                      <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
                      <line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </div>

                  <MechanicalGearsMini scrollProgress={scrollProgress} />
                </div>

                <button
                  onClick={() => setTeamsPage(p => Math.min(p + 1, totalTeamsPages))}
                  disabled={teamsPage === totalTeamsPages}
                  className="relative z-10 px-3 py-1 text-xs font-black uppercase text-slate-650 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-sm"
                >
                  Next ▶
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Department-Wise Render View
  const renderDepartmentView = () => {
    // 1. Group resolved teams by department
    const deptGroups = {};
    overallStats.allTeams.forEach(t => {
      const dept = t.department || 'Unknown Department';
      if (!deptGroups[dept]) {
        deptGroups[dept] = {
          department: dept,
          teamsList: [],
          ideasCount: 0,
          earliestTime: null
        };
      }
      deptGroups[dept].teamsList.push(t);
      deptGroups[dept].ideasCount += (t.ideas || 0);

      const tTime = t.earliestTime ? new Date(t.earliestTime).getTime() : null;
      if (tTime) {
        if (!deptGroups[dept].earliestTime || tTime < deptGroups[dept].earliestTime) {
          deptGroups[dept].earliestTime = tTime;
        }
      }
    });

    // Compute metrics for each department
    const deptList = Object.values(deptGroups).map(d => {
      const teamsWithTrl = d.teamsList.filter(t => t.highestTrl !== null && t.highestTrl !== undefined);
      const highestTrl = teamsWithTrl.length > 0
        ? Math.max(...teamsWithTrl.map(t => t.highestTrl))
        : 0;
      const avgHighestTrl = teamsWithTrl.length > 0
        ? Number((teamsWithTrl.reduce((sum, t) => sum + Number(t.highestTrl), 0) / teamsWithTrl.length).toFixed(1))
        : 0.0;

      // Build TRL distribution for this department
      const trlDist = {};
      for (let i = 1; i <= 9; i++) {
        trlDist[i] = 0;
      }
      d.teamsList.forEach(t => {
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
        earliestTime: d.earliestTime ? new Date(d.earliestTime).toISOString() : null
      };
    });

    // Sort departments by our ranking rules:
    // 1. Highest TRL (desc)
    // 2. Average Highest TRL (desc)
    // 3. Earliest submission time (asc)
    // 4. Department name alphabetical (fallback)
    const allRankedDepts = [...deptList].sort((a, b) => {
      if (b.highestTrl !== a.highestTrl) return b.highestTrl - a.highestTrl;
      if (b.avgHighestTrl !== a.avgHighestTrl) return b.avgHighestTrl - a.avgHighestTrl;

      const timeA = a.earliestTime ? new Date(a.earliestTime).getTime() : Infinity;
      const timeB = b.earliestTime ? new Date(b.earliestTime).getTime() : Infinity;
      if (timeA !== timeB) return timeA - timeB;

      return a.department.localeCompare(b.department);
    }).map((d, index) => ({
      ...d,
      rank: index + 1
    }));

    // Departments select option list
    const departmentsOptions = Array.from(new Set(overallStats.allTeams.map(t => t.department).filter(Boolean))).sort();

    // Filter by selected department if active
    const filteredRankedDepts = selectedDeptFilter
      ? allRankedDepts.filter(d => d.department === selectedDeptFilter)
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
      9: "bg-orange-500 hover:bg-orange-600"
    };

    const maxTeamsInTrlDist = Math.max(...filteredRankedDepts.map(d => d.teamsCount), 1);

    return (
      <div className="space-y-8 mt-8 relative overflow-hidden">
        {/* Subtle radial/technical background details */}
        <div className="absolute inset-0 opacity-[0.02] select-none pointer-events-none z-0">
          <svg className="w-full h-full text-slate-800" viewBox="0 0 800 800" fill="none" stroke="currentColor">
            <circle cx="400" cy="400" r="320" strokeWidth="1" strokeDasharray="4 4" />
            <circle cx="400" cy="400" r="240" strokeWidth="0.5" />
            <circle cx="400" cy="400" r="120" strokeWidth="0.75" strokeDasharray="2 2" />
            <line x1="80" y1="400" x2="720" y2="400" strokeWidth="0.5" />
            <line x1="400" y1="80" x2="400" y2="720" strokeWidth="0.5" />
          </svg>
        </div>

        {/* Faint scroll-driven rotating background gear */}
        <div className="absolute -top-12 -right-12 opacity-[0.02] text-slate-800 pointer-events-none select-none z-0">
          <Gear size={280} rotation={scrollProgress * 90} />
        </div>

        {/* Main Leaderboard Card */}
        <div className="relative bg-white border border-slate-200 rounded-3xl p-6 shadow-sm overflow-hidden z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-6 gap-4 relative z-10">
            <div>
              <h2 className="text-lg font-black text-slate-808 font-heading tracking-widest uppercase">DEPARTMENT LEADERBOARD</h2>
              <p className="text-xs text-slate-500 mt-0.5 font-bold uppercase tracking-wider">Rankings and analytics based on highest TRL achieved by teams</p>
            </div>

            {/* Filter Dropdown */}
            <div className="flex items-center gap-3 shrink-0">
              <MechanicalGearsMini scrollProgress={scrollProgress} />
              <label htmlFor="dept-tab-filter" className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Department:</label>
              <select
                id="dept-tab-filter"
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-primary text-slate-700 font-bold cursor-pointer transition hover:border-slate-355 shadow-sm"
              >
                <option value="">All Departments</option>
                {departmentsOptions.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
            {/* LEFT SIDE — RANKING TABLE */}
            <div className="space-y-4">
              <h3 className="text-xs font-black text-slate-808 uppercase tracking-widest flex items-center gap-2 font-heading">
                <Building size={14} className="text-primary" /> Department Rankings
              </h3>

              <div className="space-y-2">
                <div className="block sm:hidden text-right">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-455 uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded-md">
                    ← Scroll Horizontally →
                  </span>
                </div>
                <div className="overflow-x-auto border border-slate-150 rounded-2xl scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  <table className="w-full border-collapse text-left text-sm text-slate-650 min-w-[600px]">
                    <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 tracking-wider">
                      <tr>
                        <th className="px-4 py-3 w-20 text-center">Rank</th>
                        <th className="px-4 py-3">Department</th>
                        <th className="px-4 py-3 text-right">Teams</th>
                        <th className="px-4 py-3 text-right w-28">Highest TRL</th>
                        <th className="px-4 py-3 text-right">Ideas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredRankedDepts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-xs italic text-slate-455 bg-slate-50">
                            No departments match the criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredRankedDepts.map((row) => (
                          <tr key={row.department} className="hover:translate-x-1.5 hover:bg-slate-50/60 transition-all duration-200 group">
                            <td className="px-4 py-3 text-center relative">
                              {/* Hover indicator dot */}
                              <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                              <RankBadge rank={row.rank} size={30} />
                            </td>
                            <td className="px-4 py-3 font-extrabold text-slate-808 truncate max-w-[200px]" title={row.department}>
                              {row.department}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-600">{row.teamsCount}</td>
                            <td className="px-4 py-3 text-right">
                              <span className="inline-flex items-center justify-center bg-primary/10 text-primary font-mono font-black text-xs px-2.5 py-0.5 rounded border border-primary/20 shadow-sm">
                                TRL {row.highestTrl}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-600">{row.ideasCount}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* RIGHT SIDE — TRL DISTRIBUTION CHART */}
            <div className="space-y-4 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-808 uppercase tracking-widest mb-1 flex items-center gap-2 font-heading">
                  <Layers size={14} className="text-primary" /> TEAMS DISTRIBUTION BY HIGHEST TRL
                </h3>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-6">Department-wise team distribution across TRL levels</p>

                {/* Stacked Chart Area */}
                <div className="space-y-2">
                  <div className="block sm:hidden text-right">
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-455 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-md">
                      ← Scroll Chart →
                    </span>
                  </div>
                  <div className="overflow-x-auto w-full scrollbar-thin">
                    <div className="flex justify-between items-end h-64 min-w-[400px] px-2 pb-2 relative gap-4">
                      {/* Grid Lines */}
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-12 pt-6">
                        <div className="border-t border-slate-100 w-full animate-pulse" />
                        <div className="border-t border-slate-100 w-full" />
                        <div className="border-t border-slate-100 w-full" />
                        <div className="border-t border-slate-100 w-full" />
                      </div>

                      {filteredRankedDepts.map(d => {
                        const totalTeams = d.teamsCount;
                        return (
                          <div key={d.department} className="flex flex-col items-center gap-2 w-full relative z-10">
                            <span className="text-[9px] font-black text-slate-700 font-mono">{totalTeams}</span>

                            {/* Clean rounded column chambers */}
                            <div
                              className="w-8 rounded-t-lg overflow-hidden border border-slate-100 bg-slate-50 flex flex-col-reverse justify-start shrink-0 h-40 relative"
                              style={{ height: `${Math.max((totalTeams / maxTeamsInTrlDist) * 160, 24)}px` }}
                            >
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => {
                                const count = d.trlDistribution[level];
                                if (!count || count === 0) return null;
                                const pct = (count / totalTeams) * 100;
                                return (
                                  <div
                                    key={level}
                                    className={`w-full ${trlColorMap[level]} transition-all duration-300 relative group cursor-help border-b border-slate-100/10`}
                                    style={{ height: `${pct}%` }}
                                  >
                                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-35 pointer-events-none shadow-md">
                                      TRL {level}: {count} {count === 1 ? 'team' : 'teams'}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <span className="text-[9px] font-black text-slate-808 text-center truncate w-full max-w-[64px] uppercase tracking-wider" title={d.department}>
                              {d.department}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 justify-center text-[9px] font-black uppercase tracking-wider text-slate-550 bg-slate-50 p-3 rounded-xl border border-slate-150">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-blue-550 shadow-sm" />
                  <span>TRL 1–3 (Early Stage)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-emerald-550 shadow-sm" />
                  <span>TRL 4–6 (Development)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-orange-555 shadow-sm" />
                  <span>TRL 7–9 (Advanced)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Domain-Wise Render View
  const renderDomainView = () => {
    // 1. Group resolved teams by domain
    const domainGroups = {};
    overallStats.allTeams.forEach(t => {
      const domain = t.innovationDomain || 'Open Innovation';
      if (!domainGroups[domain]) {
        domainGroups[domain] = {
          domain,
          teamsList: [],
          ideasCount: 0,
          earliestTime: null
        };
      }
      domainGroups[domain].teamsList.push(t);
      domainGroups[domain].ideasCount += (t.ideas || 0);

      const tTime = t.earliestTime ? new Date(t.earliestTime).getTime() : null;
      if (tTime) {
        if (!domainGroups[domain].earliestTime || tTime < domainGroups[domain].earliestTime) {
          domainGroups[domain].earliestTime = tTime;
        }
      }
    });

    // Compute metrics for each domain
    const domList = Object.values(domainGroups).map(d => {
      const teamsWithTrl = d.teamsList.filter(t => t.highestTrl !== null && t.highestTrl !== undefined);
      const highestTrl = teamsWithTrl.length > 0
        ? Math.max(...teamsWithTrl.map(t => t.highestTrl))
        : 0;
      const avgHighestTrl = teamsWithTrl.length > 0
        ? Number((teamsWithTrl.reduce((sum, t) => sum + Number(t.highestTrl), 0) / teamsWithTrl.length).toFixed(1))
        : 0.0;

      // Build TRL distribution for this domain
      const trlDist = {};
      for (let i = 1; i <= 9; i++) {
        trlDist[i] = 0;
      }
      d.teamsList.forEach(t => {
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
        earliestTime: d.earliestTime ? new Date(d.earliestTime).toISOString() : null
      };
    });

    // Sort domains by our ranking rules:
    // 1. Highest TRL (desc)
    // 2. Average Highest TRL (desc)
    // 3. Earliest submission time (asc)
    // 4. Domain name alphabetical (fallback)
    const allRankedDoms = [...domList].sort((a, b) => {
      if (b.highestTrl !== a.highestTrl) return b.highestTrl - a.highestTrl;
      if (b.avgHighestTrl !== a.avgHighestTrl) return b.avgHighestTrl - a.avgHighestTrl;

      const timeA = a.earliestTime ? new Date(a.earliestTime).getTime() : Infinity;
      const timeB = b.earliestTime ? new Date(b.earliestTime).getTime() : Infinity;
      if (timeA !== timeB) return timeA - timeB;

      return a.domain.localeCompare(b.domain);
    }).map((d, index) => ({
      ...d,
      rank: index + 1
    }));

    // Domains select option list
    const domainsOptions = Array.from(new Set(overallStats.allTeams.map(t => t.innovationDomain).filter(Boolean))).sort();

    // Filter by selected domain if active
    const filteredRankedDoms = selectedDomFilter
      ? allRankedDoms.filter(d => d.domain === selectedDomFilter)
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
      9: "bg-orange-500 hover:bg-orange-600"
    };

    const maxTeamsInTrlDist = Math.max(...filteredRankedDoms.map(d => d.teamsCount), 1);

    return (
      <div className="space-y-8 mt-8 relative overflow-hidden">
        {/* Subtle radial/technical background details */}
        <div className="absolute inset-0 opacity-[0.02] select-none pointer-events-none z-0">
          <svg className="w-full h-full text-slate-800" viewBox="0 0 800 800" fill="none" stroke="currentColor">
            <circle cx="400" cy="400" r="320" strokeWidth="1" strokeDasharray="4 4" />
            <circle cx="400" cy="400" r="240" strokeWidth="0.5" />
            <circle cx="400" cy="400" r="120" strokeWidth="0.75" strokeDasharray="2 2" />
            <line x1="80" y1="400" x2="720" y2="400" strokeWidth="0.5" />
            <line x1="400" y1="80" x2="400" y2="720" strokeWidth="0.5" />
          </svg>
        </div>

        {/* Faint scroll-driven rotating background gear */}
        <div className="absolute -top-12 -right-12 opacity-[0.02] text-slate-800 pointer-events-none select-none z-0">
          <Gear size={280} rotation={scrollProgress * 90} />
        </div>

        {/* Main Leaderboard Card */}
        <div className="relative bg-white border border-slate-200 rounded-3xl p-6 shadow-sm overflow-hidden z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-6 gap-4 relative z-10">
            <div>
              <h2 className="text-lg font-black text-slate-808 font-heading tracking-widest uppercase">DOMAIN LEADERBOARD</h2>
              <p className="text-xs text-slate-500 mt-0.5 font-bold uppercase tracking-wider">Rankings and analytics based on highest TRL achieved by teams</p>
            </div>

            {/* Filter Dropdown */}
            <div className="flex items-center gap-3 shrink-0">
              <MechanicalGearsMini scrollProgress={scrollProgress} />
              <label htmlFor="dom-tab-filter" className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Domain:</label>
              <select
                id="dom-tab-filter"
                value={selectedDomFilter}
                onChange={(e) => setSelectedDomFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-primary text-slate-700 font-bold cursor-pointer transition hover:border-slate-350 shadow-sm"
              >
                <option value="">All Domains</option>
                {domainsOptions.map(domain => (
                  <option key={domain} value={domain}>{domain}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
            {/* LEFT SIDE — RANKING TABLE */}
            <div className="space-y-4">
              <h3 className="text-xs font-black text-slate-808 uppercase tracking-widest flex items-center gap-2 font-heading">
                <Compass size={14} className="text-primary" /> Domain Rankings
              </h3>

              <div className="space-y-2">
                <div className="block sm:hidden text-right">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-455 uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded-md">
                    ← Scroll Horizontally →
                  </span>
                </div>
                <div className="overflow-x-auto border border-slate-150 rounded-2xl scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  <table className="w-full border-collapse text-left text-sm text-slate-650 min-w-[650px]">
                    <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 tracking-wider">
                      <tr>
                        <th className="px-4 py-3 w-20 text-center">Rank</th>
                        <th className="px-4 py-3">Innovation Domain</th>
                        <th className="px-4 py-3 text-right">Teams</th>
                        <th className="px-4 py-3 text-right w-28">Highest TRL</th>
                        <th className="px-4 py-3 text-right">Ideas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredRankedDoms.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-xs italic text-slate-455 bg-slate-50">
                            No domains match the criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredRankedDoms.map((row) => (
                          <tr key={row.domain} className="hover:translate-x-1.5 hover:bg-slate-50/60 transition-all duration-200 group">
                            <td className="px-4 py-3 text-center relative">
                              {/* Hover indicator dot */}
                              <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                              <RankBadge rank={row.rank} size={30} />
                            </td>
                            <td className="px-4 py-3 font-extrabold text-slate-808 truncate max-w-[200px]" title={row.domain}>
                              {row.domain}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-600">{row.teamsCount}</td>
                            <td className="px-4 py-3 text-right">
                              <span className="inline-flex items-center justify-center bg-primary/10 text-primary font-mono font-black text-xs px-2.5 py-0.5 rounded border border-primary/20 shadow-sm">
                                TRL {row.highestTrl}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-600">{row.ideasCount}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* RIGHT SIDE — TRL DISTRIBUTION CHART */}
            <div className="space-y-4 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-808 uppercase tracking-widest mb-1 flex items-center gap-2 font-heading">
                  <Layers size={14} className="text-primary" /> TEAMS DISTRIBUTION BY HIGHEST TRL
                </h3>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-6">Domain-wise team distribution across TRL levels</p>

                {/* Stacked Chart Area */}
                <div className="space-y-2">
                  <div className="block sm:hidden text-right">
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-455 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-md">
                      ← Scroll Chart →
                    </span>
                  </div>
                  <div className="overflow-x-auto w-full scrollbar-thin">
                    <div className="flex justify-between items-end h-64 min-w-[400px] px-2 pb-2 relative gap-4">
                      {/* Grid Lines */}
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-12 pt-6">
                        <div className="border-t border-slate-100 w-full animate-pulse" />
                        <div className="border-t border-slate-100 w-full" />
                        <div className="border-t border-slate-100 w-full" />
                        <div className="border-t border-slate-100 w-full" />
                      </div>

                      {filteredRankedDoms.map(d => {
                        const totalTeams = d.teamsCount;
                        return (
                          <div key={d.domain} className="flex flex-col items-center gap-2 w-full relative z-10">
                            <span className="text-[9px] font-black text-slate-700 font-mono">{totalTeams}</span>

                            {/* Clean rounded column chambers */}
                            <div
                              className="w-8 rounded-t-lg overflow-hidden border border-slate-100 bg-slate-50 flex flex-col-reverse justify-start shrink-0 h-40 relative"
                              style={{ height: `${Math.max((totalTeams / maxTeamsInTrlDist) * 160, 24)}px` }}
                            >
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => {
                                const count = d.trlDistribution[level];
                                if (!count || count === 0) return null;
                                const pct = (count / totalTeams) * 100;
                                return (
                                  <div
                                    key={level}
                                    className={`w-full ${trlColorMap[level]} transition-all duration-300 relative group cursor-help border-b border-slate-100/10`}
                                    style={{ height: `${pct}%` }}
                                  >
                                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-35 pointer-events-none shadow-md">
                                      TRL {level}: {count} {count === 1 ? 'team' : 'teams'}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <span className="text-[9px] font-black text-slate-808 text-center truncate w-full max-w-[64px] uppercase tracking-wider" title={d.domain}>
                              {d.domain}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 justify-center text-[9px] font-black uppercase tracking-wider text-slate-550 bg-slate-50 p-3 rounded-xl border border-slate-150">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-blue-550 shadow-sm" />
                  <span>TRL 1–3 (Early Stage)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-emerald-550 shadow-sm" />
                  <span>TRL 4–6 (Development)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-orange-555 shadow-sm" />
                  <span>TRL 7–9 (Advanced)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 min-h-screen pb-20 pt-24 relative">
      <div className="bg-slate-900 text-white py-12 md:py-16 relative overflow-hidden rounded-b-3xl">
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-400 via-primary to-slate-900" />
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8 relative z-10 text-center">
          <h1 className="font-heading text-4xl font-extrabold tracking-tight md:text-5xl lg:text-6xl text-white animate-fade-in">
            IPL 2026 Leaderboard
          </h1>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8 -mt-6 relative z-20">
        <div className="flex justify-center">
          <div className="inline-flex rounded-2xl bg-white p-1.5 shadow-md border border-slate-200 max-w-full overflow-x-auto whitespace-nowrap scrollbar-none relative">
            <button
              onClick={() => { setActiveTab('overall'); setTeamsPage(1); }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer border ${
                activeTab === 'overall'
                  ? 'bg-primary text-white border-primary-dark shadow-[0_2px_8px_rgba(36,68,154,0.25)]'
                  : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100 hover:text-slate-705'
              }`}
            >
              <LayoutDashboard size={14} />
              Overall
            </button>
            <button
              onClick={() => { setActiveTab('department'); setTeamsPage(1); }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer border ml-1 ${
                activeTab === 'department'
                  ? 'bg-primary text-white border-primary-dark shadow-[0_2px_8px_rgba(36,68,154,0.25)]'
                  : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100 hover:text-slate-705'
              }`}
            >
              <Building size={14} />
              Department-wise
            </button>
            <button
              onClick={() => { setActiveTab('domain'); setTeamsPage(1); }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer border ml-1 ${
                activeTab === 'domain'
                  ? 'bg-primary text-white border-primary-dark shadow-[0_2px_8px_rgba(36,68,154,0.25)]'
                  : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100 hover:text-slate-705'
              }`}
            >
              <Compass size={14} />
              Domain-wise
            </button>
          </div>
        </div>
      </div>

      {/* Event KPI Summary Block */}
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8 mt-10">
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5 mb-8">

          {/* Card 1: Teams Registered */}
          <div className="relative bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md hover:border-slate-300 transition overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity select-none pointer-events-none">
              <Gear size={80} rotation={scrollProgress * 180} color="#475569" />
            </div>
            <div className="flex items-center justify-between mb-3 relative z-10">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Teams Registered</span>
              <div className="p-1.5 rounded-lg bg-blue-550/10 text-primary border border-blue-200/50 shadow-sm"><Users size={16} /></div>
            </div>
            <div className="relative z-10">
              <span className="text-2xl font-black text-slate-805 tracking-tight">{kpis.totalTeams}</span>
              <p className="text-[10px] text-slate-450 mt-1 font-bold uppercase">Unique teams</p>
            </div>
          </div>

          {/* Card 2: Students Participating */}
          <div className="relative bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md hover:border-slate-300 transition overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity select-none pointer-events-none">
              <Gear size={80} rotation={-scrollProgress * 180} color="#475569" />
            </div>
            <div className="flex items-center justify-between mb-3 relative z-10">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Students Participating</span>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-accent border border-amber-200/50 shadow-sm"><Award size={16} /></div>
            </div>
            <div className="relative z-10">
              <span className="text-2xl font-black text-slate-805 tracking-tight">{kpis.totalStudents}</span>
              <p className="text-[10px] text-slate-455 mt-1 font-bold uppercase">Unique students</p>
            </div>
          </div>

          {/* Card 3: Ideas Submitted */}
          <div className="relative bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md hover:border-slate-300 transition overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity select-none pointer-events-none">
              <Gear size={80} rotation={scrollProgress * 180} color="#475569" />
            </div>
            <div className="flex items-center justify-between mb-3 relative z-10">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ideas Submitted</span>
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 border border-purple-200/50 shadow-sm"><Layers size={16} /></div>
            </div>
            <div className="relative z-10">
              <span className="text-2xl font-black text-slate-805 tracking-tight">{kpis.totalIdeas}</span>
              <p className="text-[10px] text-slate-455 mt-1 font-bold uppercase">Ideas submitted</p>
            </div>
          </div>

          {/* Card 4: Departments */}
          <div className="relative bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md hover:border-slate-300 transition overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity select-none pointer-events-none">
              <Gear size={80} rotation={-scrollProgress * 180} color="#475569" />
            </div>
            <div className="flex items-center justify-between mb-3 relative z-10">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Departments</span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-200/50 shadow-sm"><Building size={16} /></div>
            </div>
            <div className="relative z-10">
              <span className="text-2xl font-black text-slate-805 tracking-tight">{kpis.totalDepartments}</span>
              <p className="text-[10px] text-slate-455 mt-1 font-bold uppercase">Active departments</p>
            </div>
          </div>

          {/* Card 5: Innovation Domains */}
          <div className="relative bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md hover:border-slate-300 transition overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity select-none pointer-events-none">
              <Gear size={80} rotation={scrollProgress * 180} color="#475569" />
            </div>
            <div className="flex items-center justify-between mb-3 relative z-10">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Innovation Domains</span>
              <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-600 border border-orange-200/50 shadow-sm"><Cpu size={16} /></div>
            </div>
            <div className="relative z-10">
              <span className="text-2xl font-black text-slate-805 tracking-tight">{kpis.totalDomains}</span>
              <p className="text-[10px] text-slate-455 mt-1 font-bold uppercase">Innovation domains</p>
            </div>
        </div>
      </div>

        {/* Content Tabs Area */}
        <SectionReveal>
          {loading ? (
            <div className="flex h-96 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white shadow-sm">
              <div className="text-center">
                <MechanicalLoader size={44} className="text-accent mx-auto" />
                <p className="mt-3 text-sm text-slate-500 font-bold uppercase tracking-wider">Aggregating live metrics...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex h-96 items-center justify-center rounded-2xl border border-dashed border-red-200 bg-red-50 p-6">
              <div className="text-center text-red-700">
                <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
                <p className="mt-3 text-sm font-extrabold uppercase tracking-wider">Failed to aggregate statistics</p>
                <p className="mt-1 text-xs text-red-500">{error}</p>
              </div>
            </div>
          ) : kpis.totalTeams === 0 ? (
            <div className="flex h-96 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white shadow-sm">
              <div className="text-center text-slate-500">
                <Trophy className="mx-auto h-10 w-10 text-slate-350" />
                <p className="mt-3 text-sm font-extrabold uppercase tracking-wider">No Submissions Recorded Yet</p>
                <p className="mt-1 text-xs text-slate-400">Leaderboard statistics will show here once teams submit ideas.</p>
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
              >
                {activeTab === 'overall' && renderOverallView()}
                {activeTab === 'department' && renderDepartmentView()}
                {activeTab === 'domain' && renderDomainView()}
              </motion.div>
            </AnimatePresence>
          )}
        </SectionReveal>
      </div>
    </div>
  )
}
