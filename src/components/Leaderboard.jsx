import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Building, Cpu, Loader2, AlertCircle, Users, LayoutDashboard, Compass, Layers, Award } from 'lucide-react'
import SectionReveal from './SectionReveal'
import { supabase } from '../supabaseClient'

export default function Leaderboard() {
  const [activeTab, setActiveTab] = useState('overall')
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

      // Fetch all active products to resolve innovation domains for each team
      const { data: productsData, error: prodErr } = await supabase
        .from('products')
        .select('team_id, innovation_domain, trl_level, created_at, id')
        .eq('status', 'active');
      if (prodErr) throw prodErr;

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
    return () => {
      window.removeEventListener('refresh-leaderboard', handleRefresh);
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
    const avgTrl = teamsWithTrl.length > 0
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
      { level: 1, label: "TRL 1", desc: "(Basic)", colorClass: "bg-blue-500/10 text-blue-600 border border-blue-200/50 hover:bg-blue-500/20" },
      { level: 2, label: "TRL 2", desc: "(Formulated)", colorClass: "bg-blue-500/10 text-blue-600 border border-blue-200/50 hover:bg-blue-500/20" },
      { level: 3, label: "TRL 3", desc: "(Proof of Concept)", colorClass: "bg-blue-500/15 text-blue-700 border border-blue-300/50 hover:bg-blue-500/25" },
      { level: 4, label: "TRL 4", desc: "(Validated)", colorClass: "bg-emerald-500/10 text-emerald-600 border border-emerald-200/50 hover:bg-emerald-500/20" },
      { level: 5, label: "TRL 5", desc: "(Prototype)", colorClass: "bg-emerald-500/10 text-emerald-600 border border-emerald-200/50 hover:bg-emerald-500/20" },
      { level: 6, label: "TRL 6", desc: "(System)", colorClass: "bg-emerald-500/15 text-emerald-700 border border-emerald-300/50 hover:bg-emerald-500/25" },
      { level: 7, label: "TRL 7", desc: "(Demonstration)", colorClass: "bg-amber-500/10 text-amber-600 border border-amber-200/50 hover:bg-amber-500/20" },
      { level: 8, label: "TRL 8", desc: "(Pre-Production)", colorClass: "bg-amber-500/15 text-amber-700 border border-amber-300/50 hover:bg-amber-500/25" },
      { level: 9, label: "TRL 9", desc: "(Market Ready)", colorClass: "bg-orange-500/20 text-orange-700 border border-orange-300/50 hover:bg-orange-500/30" }
    ];

    const paginatedTeams = overallStats.allTeams.slice((teamsPage - 1) * teamsPerPage, teamsPage * teamsPerPage)
    const totalTeamsPages = Math.ceil(overallStats.allTeams.length / teamsPerPage)
    const hasTrlData = overallStats.allTeams.length > 0 && overallStats.allTeams.some(t => t.highestTrl !== undefined && t.highestTrl !== null)

    return (
      <div className="space-y-8 mt-8">
        {/* Submission Overview & Distribution Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Submission Overview Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between md:col-span-1">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <Trophy size={14} className="text-accent" /> Submission Overview
              </h3>
              <div className="space-y-4 mt-2">
                <div className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50">
                  <span className="text-slate-500 font-semibold">Teams Registered</span>
                  <span className="font-extrabold text-slate-900 text-base">{kpis.totalTeams}</span>
                </div>
                <div className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50">
                  <span className="text-slate-500 font-semibold">Ideas Submitted</span>
                  <span className="font-extrabold text-slate-900 text-base">{kpis.totalIdeas}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400 font-medium">
              Live updates of submission metrics across all registered teams.
            </div>
          </div>

          {/* Team Activity Distribution Chart */}
          <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-6">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers size={14} className="text-primary" /> TEAM ACTIVITY
                </h3>
                <div className="flex items-center gap-2">
                  <label htmlFor="dept-filter-chart" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dept:</label>
                  <select
                    id="dept-filter-chart"
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-primary text-slate-700 font-semibold cursor-pointer transition hover:border-slate-350"
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
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-md">
                    ← Scroll Chart →
                  </span>
                </div>
                <div className="overflow-x-auto w-full scrollbar-thin">
                <div className="flex justify-between items-end h-48 min-w-[640px] px-2 pb-2 relative">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-12 pt-6">
                    <div className="border-t border-slate-100/70 w-full" />
                    <div className="border-t border-slate-100/70 w-full" />
                    <div className="border-t border-slate-100/70 w-full" />
                    <div className="border-t border-slate-100/70 w-full" />
                  </div>

                  {trlConfigs.map(cfg => {
                    const count = trlDistribution[cfg.level];
                    const pct = (count / maxTeamsInTrlDist) * 100;
                    return (
                      <div key={cfg.level} className="flex flex-col items-center gap-2 w-full relative z-10">
                        <span className="text-[10px] font-extrabold text-primary">{count}</span>
                        <div className="w-12 h-28 flex items-end">
                          <div
                            className={`w-full rounded-t-md transition-all duration-500 relative group cursor-help ${cfg.colorClass}`}
                            style={{ height: `${Math.max(pct, 4)}%` }}
                          >
                            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-30 pointer-events-none shadow">
                              {count} {count === 1 ? 'Team' : 'Teams'} at {cfg.label}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-center text-center">
                          <span className="text-[10px] font-bold text-slate-800 whitespace-nowrap">{cfg.label}</span>
                          <span className="text-[8px] font-medium text-slate-400 whitespace-nowrap mt-0.5">{cfg.desc}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            </div>

            {/* Summary Metrics Strip */}
            <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="flex flex-col bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Total Teams</span>
                <span className="text-xl font-bold text-slate-900 mt-1">{chartTotalTeams}</span>
              </div>
              <div className="flex flex-col bg-[#0b1e36]/5 p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Avg TRL</span>
                <span className="text-xl font-bold text-slate-900 mt-1">{avgTrl}</span>
              </div>
              <div className="flex flex-col bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Highest TRL</span>
                <span className="text-xl font-bold text-slate-900 mt-1">{highestTrl > 0 ? `TRL ${highestTrl}` : 'N/A'}</span>
              </div>
              <div className="flex flex-col bg-[#F59E0B]/5 p-3 rounded-xl border border-[#F59E0B]/20">
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider text-[#F59E0B]">Top TRL Range</span>
                <span className="text-xl font-bold text-slate-900 mt-1">{topRange}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Podium for Top 3 and table of Top Teams */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Top Teams (Podium) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm lg:col-span-1">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-6 flex items-center gap-2">
              <Trophy size={16} className="text-accent" /> Top Teams
            </h3>
            <div className="space-y-4">
              {overallStats.top5Teams.slice(0, 3).map((t, idx) => (
                <div key={t.teamName} className="flex items-center gap-4 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition">
                  <div className={`h-9 w-9 rounded-full font-bold text-xs flex items-center justify-center ${
                    idx === 0 ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-500/20' :
                    idx === 1 ? 'bg-slate-200/60 text-slate-700 ring-2 ring-slate-300/30' :
                    'bg-orange-100 text-orange-700 ring-2 ring-orange-500/20'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="grow min-w-0">
                    <h4 className="font-bold text-sm text-slate-900 truncate">{t.teamName}</h4>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase truncate">{t.department}</p>
                    {t.leadingProductTitle && (
                      <p className="text-[11px] text-slate-500 italic truncate mt-0.5" title={t.leadingProductTitle}>
                        {t.leadingProductTitle}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {t.highestTrl !== undefined && t.highestTrl !== null ? (
                      <>
                        <span className="inline-flex items-center justify-center bg-primary text-white font-mono font-bold text-xs px-2.5 py-0.5 rounded">
                          TRL {t.highestTrl}
                        </span>
                        <p className="text-[9px] text-slate-400 font-medium mt-0.5">Ranked</p>
                      </>
                    ) : (
                      <>
                        <span className="text-base font-extrabold text-slate-900">{t.ideas}</span>
                        <p className="text-[9px] text-slate-400 font-medium">Ideas</p>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Team Rankings Table */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm lg:col-span-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Users size={16} className="text-primary" /> Team Rankings
            </h3>
            <div className="space-y-2">
              <div className="block sm:hidden text-right">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded-md">
                  ← Scroll Horizontally →
                </span>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-inner">
                <table className="w-full border-collapse text-left text-sm text-slate-600 min-w-[700px]">
                <thead className="bg-slate-50 text-[10px] font-bold text-slate-700 uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 w-16">Rank</th>
                    <th className="px-4 py-3">{hasTrlData ? 'Team & Leading Product' : 'Team'}</th>
                    <th className="px-4 py-3">Department</th>
                    <th className={`px-4 py-3 text-right ${hasTrlData ? 'w-28' : 'w-20'}`}>{hasTrlData ? 'Highest TRL' : 'Ideas'}</th>
                    <th className="px-4 py-3 text-right w-48">Submission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paginatedTeams.map((row, idx) => {
                    const globalRank = (teamsPage - 1) * teamsPerPage + idx + 1
                    return (
                      <tr key={row.teamName} className="hover:bg-slate-50/50 transition">
                        <td className="px-4 py-3">
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-bold text-[10px] ${
                            globalRank === 1 ? 'bg-amber-100 text-amber-700' :
                            globalRank === 2 ? 'bg-slate-100 text-slate-700' :
                            globalRank === 3 ? 'bg-orange-100 text-orange-700' :
                            'bg-slate-50 text-slate-500'
                          }`}>
                            {globalRank}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="font-bold text-slate-900 truncate">{row.teamName}</div>
                          {row.leadingProductTitle && (
                            <div className="text-[11px] text-slate-400 italic truncate" title={row.leadingProductTitle}>
                              {row.leadingProductTitle}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-500 truncate max-w-[180px]">{row.department}</td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {row.highestTrl !== undefined && row.highestTrl !== null ? (
                            <span className="inline-flex items-center justify-center bg-primary/10 text-primary font-mono font-extrabold text-xs px-2.5 py-0.5 rounded border border-primary/20">
                              TRL {row.highestTrl}
                            </span>
                          ) : (
                            <span className="font-extrabold text-slate-900">{row.ideas}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-medium text-slate-600 whitespace-nowrap">{formatTimestamp(row.earliestTime)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            </div>

            {/* Pagination Controls */}
            {totalTeamsPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-4">
                <button
                  onClick={() => setTeamsPage(p => Math.max(p - 1, 1))}
                  disabled={teamsPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-500 font-medium">Page {teamsPage} of {totalTeamsPages}</span>
                <button
                  onClick={() => setTeamsPage(p => Math.min(p + 1, totalTeamsPages))}
                  disabled={teamsPage === totalTeamsPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  Next
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
      <div className="space-y-8 mt-8">
        {/* Main Leaderboard Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-6 gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">DEPARTMENT LEADERBOARD</h2>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">Rankings and analytics based on highest TRL achieved by teams</p>
            </div>

            {/* Filter Dropdown */}
            <div className="flex items-center gap-2 shrink-0">
              <label htmlFor="dept-tab-filter" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Department:</label>
              <select
                id="dept-tab-filter"
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-primary text-slate-700 font-semibold cursor-pointer transition hover:border-slate-350"
              >
                <option value="">All Departments</option>
                {departmentsOptions.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* LEFT SIDE — RANKING TABLE */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Building size={14} className="text-primary" /> DEPARTMENT RANKINGS
              </h3>

              <div className="space-y-2">
                <div className="block sm:hidden text-right">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded-md">
                    ← Scroll Horizontally →
                  </span>
                </div>
                <div className="overflow-x-auto border border-slate-150 rounded-2xl shadow-inner">
                  <table className="w-full border-collapse text-left text-sm text-slate-600 min-w-[600px]">
                  <thead className="bg-slate-50 text-[10px] font-bold text-slate-700 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 w-16">Rank</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3 text-right">Teams</th>
                      <th className="px-4 py-3 text-right">Avg TRL</th>
                      <th className="px-4 py-3 text-right">Highest TRL</th>
                      <th className="px-4 py-3 text-right">Ideas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredRankedDepts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-xs italic text-slate-400 bg-slate-50">
                          No departments match the criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredRankedDepts.map((row) => (
                        <tr key={row.department} className="hover:bg-slate-50/50 transition">
                          <td className="px-4 py-3">
                            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-bold text-[10px] ${
                              row.rank === 1 ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-500/10' :
                              row.rank === 2 ? 'bg-slate-100 text-slate-700 ring-2 ring-slate-350/10' :
                              row.rank === 3 ? 'bg-orange-100 text-orange-700 ring-2 ring-orange-500/10' :
                              'bg-slate-50 text-slate-500'
                            }`}>
                              {row.rank}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-900 truncate max-w-[200px]" title={row.department}>
                            {row.department}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-600">{row.teamsCount}</td>
                          <td className="px-4 py-3 text-right font-extrabold text-slate-900">{row.avgHighestTrl.toFixed(1)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center justify-center bg-primary/10 text-primary font-mono font-extrabold text-xs px-2.5 py-0.5 rounded border border-primary/20">
                              TRL {row.highestTrl}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-600">{row.ideasCount}</td>
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
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Layers size={14} className="text-primary" /> TEAMS DISTRIBUTION BY HIGHEST TRL
                </h3>
                <p className="text-[11px] text-slate-400 font-medium mb-6">Department-wise team distribution across TRL levels</p>

                {/* Stacked Chart Area */}
                <div className="space-y-2">
                  <div className="block sm:hidden text-right">
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-md">
                      ← Scroll Chart →
                    </span>
                  </div>
                  <div className="overflow-x-auto w-full scrollbar-thin">
                  <div className="flex justify-between items-end h-64 min-w-[400px] px-2 pb-2 relative gap-4">
                    {/* Grid Lines */}
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-12 pt-6">
                      <div className="border-t border-slate-100/70 w-full" />
                      <div className="border-t border-slate-100/70 w-full" />
                      <div className="border-t border-slate-100/70 w-full" />
                      <div className="border-t border-slate-100/70 w-full" />
                    </div>

                    {filteredRankedDepts.map(d => {
                      const totalTeams = d.teamsCount;
                      return (
                        <div key={d.department} className="flex flex-col items-center gap-2 w-full relative z-10">
                          <span className="text-[9px] font-extrabold text-primary">{totalTeams}</span>
                          <div
                            className="w-8 rounded-md overflow-hidden border border-slate-200/50 bg-slate-50/50 flex flex-col-reverse justify-start shrink-0"
                            style={{ height: `${Math.max((totalTeams / maxTeamsInTrlDist) * 160, 16)}px` }}
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => {
                              const count = d.trlDistribution[level];
                              if (!count || count === 0) return null;
                              const pct = (count / totalTeams) * 100;
                              return (
                                <div
                                  key={level}
                                  className={`w-full ${trlColorMap[level]} transition-all duration-300 relative group cursor-help`}
                                  style={{ height: `${pct}%` }}
                                >
                                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-35 pointer-events-none shadow">
                                    TRL {level}: {count} {count === 1 ? 'team' : 'teams'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <span className="text-[9px] font-bold text-slate-800 text-center truncate w-full max-w-[64px]" title={d.department}>
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
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 justify-center text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-blue-500" />
                  <span>TRL 1–3 (Early Stage)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-emerald-500" />
                  <span>TRL 4–6 (Development)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-orange-500" />
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
      <div className="space-y-8 mt-8">
        {/* Main Leaderboard Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-6 gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-heading tracking-tight">DOMAIN LEADERBOARD</h2>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">Rankings and analytics based on highest TRL achieved by teams</p>
            </div>

            {/* Filter Dropdown */}
            <div className="flex items-center gap-2 shrink-0">
              <label htmlFor="dom-tab-filter" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Domain:</label>
              <select
                id="dom-tab-filter"
                value={selectedDomFilter}
                onChange={(e) => setSelectedDomFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-primary text-slate-700 font-semibold cursor-pointer transition hover:border-slate-350"
              >
                <option value="">All Domains</option>
                {domainsOptions.map(domain => (
                  <option key={domain} value={domain}>{domain}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* LEFT SIDE — RANKING TABLE */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Compass size={14} className="text-primary" /> DOMAIN RANKINGS
              </h3>

              <div className="space-y-2">
                <div className="block sm:hidden text-right">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded-md">
                    ← Scroll Horizontally →
                  </span>
                </div>
                <div className="overflow-x-auto border border-slate-150 rounded-2xl shadow-inner">
                  <table className="w-full border-collapse text-left text-sm text-slate-600 min-w-[650px]">
                  <thead className="bg-slate-50 text-[10px] font-bold text-slate-700 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 w-16">Rank</th>
                      <th className="px-4 py-3">Innovation Domain</th>
                      <th className="px-4 py-3 text-right">Teams</th>
                      <th className="px-4 py-3 text-right">Avg TRL</th>
                      <th className="px-4 py-3 text-right">Highest TRL</th>
                      <th className="px-4 py-3 text-right">Ideas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredRankedDoms.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-xs italic text-slate-400 bg-slate-50">
                          No domains match the criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredRankedDoms.map((row) => (
                        <tr key={row.domain} className="hover:bg-slate-50/50 transition">
                          <td className="px-4 py-3">
                            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-bold text-[10px] ${
                              row.rank === 1 ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-500/10' :
                              row.rank === 2 ? 'bg-slate-100 text-slate-700 ring-2 ring-slate-350/10' :
                              row.rank === 3 ? 'bg-orange-100 text-orange-700 ring-2 ring-orange-500/10' :
                              'bg-slate-50 text-slate-500'
                            }`}>
                              {row.rank}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-900 truncate max-w-[200px]" title={row.domain}>
                            {row.domain}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-600">{row.teamsCount}</td>
                          <td className="px-4 py-3 text-right font-extrabold text-slate-900">{row.avgHighestTrl.toFixed(1)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center justify-center bg-primary/10 text-primary font-mono font-extrabold text-xs px-2.5 py-0.5 rounded border border-primary/20">
                              TRL {row.highestTrl}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-600">{row.ideasCount}</td>
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
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Layers size={14} className="text-primary" /> TEAMS DISTRIBUTION BY HIGHEST TRL
                </h3>
                <p className="text-[11px] text-slate-400 font-medium mb-6">Domain-wise team distribution across TRL levels</p>

                {/* Stacked Chart Area */}
                <div className="space-y-2">
                  <div className="block sm:hidden text-right">
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-md">
                      ← Scroll Chart →
                    </span>
                  </div>
                  <div className="overflow-x-auto w-full scrollbar-thin">
                  <div className="flex justify-between items-end h-64 min-w-[400px] px-2 pb-2 relative gap-4">
                    {/* Grid Lines */}
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-12 pt-6">
                      <div className="border-t border-slate-100/70 w-full" />
                      <div className="border-t border-slate-100/70 w-full" />
                      <div className="border-t border-slate-100/70 w-full" />
                      <div className="border-t border-slate-100/70 w-full" />
                    </div>

                    {filteredRankedDoms.map(d => {
                      const totalTeams = d.teamsCount;
                      return (
                        <div key={d.domain} className="flex flex-col items-center gap-2 w-full relative z-10">
                          <span className="text-[9px] font-extrabold text-primary">{totalTeams}</span>
                          <div
                            className="w-8 rounded-md overflow-hidden border border-slate-200/50 bg-slate-50/50 flex flex-col-reverse justify-start shrink-0"
                            style={{ height: `${Math.max((totalTeams / maxTeamsInTrlDist) * 160, 16)}px` }}
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => {
                              const count = d.trlDistribution[level];
                              if (!count || count === 0) return null;
                              const pct = (count / totalTeams) * 100;
                              return (
                                <div
                                  key={level}
                                  className={`w-full ${trlColorMap[level]} transition-all duration-300 relative group cursor-help`}
                                  style={{ height: `${pct}%` }}
                                >
                                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-35 pointer-events-none shadow">
                                    TRL {level}: {count} {count === 1 ? 'team' : 'teams'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <span className="text-[9px] font-bold text-slate-800 text-center truncate w-full max-w-[64px]" title={d.domain}>
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
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 justify-center text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-blue-500" />
                  <span>TRL 1–3 (Early Stage)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-emerald-500" />
                  <span>TRL 4–6 (Development)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-orange-500" />
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
    <div className="bg-slate-50 min-h-screen pb-20 pt-24">
      {/* Event-focused Hero Header */}
      <div className="bg-slate-900 text-white py-12 md:py-16 relative overflow-hidden rounded-b-3xl">
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-400 via-primary to-slate-900" />
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8 relative z-10 text-center">
          <h1 className="font-heading text-4xl font-extrabold tracking-tight md:text-5xl lg:text-6xl text-white animate-fade-in">
            IPL 2026 Leaderboard
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-blue-100 max-w-2xl mx-auto md:text-base">
            Track teams, ideas, departments and innovation domains in real time.
          </p>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8 -mt-6 relative z-20">
        <div className="flex justify-center">
          <div className="inline-flex rounded-2xl bg-white p-1 shadow-lg border border-slate-200/80 ring-1 ring-slate-100/50 max-w-full overflow-x-auto whitespace-nowrap scrollbar-none">
            <button
              onClick={() => { setActiveTab('overall'); setTeamsPage(1); }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'overall'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <LayoutDashboard size={14} />
              Overall
            </button>
            <button
              onClick={() => { setActiveTab('department'); setTeamsPage(1); }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'department'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Building size={14} />
              Department-wise
            </button>
            <button
              onClick={() => { setActiveTab('domain'); setTeamsPage(1); }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'domain'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
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
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:shadow-md transition">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Teams Registered</span>
              <div className="p-1.5 rounded-lg bg-blue-50 text-primary"><Users size={16} /></div>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 tracking-tight">{kpis.totalTeams}</span>
              <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase">Unique teams</p>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:shadow-md transition">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Students Participating</span>
              <div className="p-1.5 rounded-lg bg-amber-50 text-accent"><Award size={16} /></div>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 tracking-tight">{kpis.totalStudents}</span>
              <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase">Unique students</p>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:shadow-md transition">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Ideas Submitted</span>
              <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600"><Layers size={16} /></div>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 tracking-tight">{kpis.totalIdeas}</span>
              <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase">Ideas submitted</p>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:shadow-md transition">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Departments</span>
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600"><Building size={16} /></div>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 tracking-tight">{kpis.totalDepartments}</span>
              <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase">Active departments</p>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:shadow-md transition">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Innovation Domains</span>
              <div className="p-1.5 rounded-lg bg-orange-50 text-orange-600"><Cpu size={16} /></div>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 tracking-tight">{kpis.totalDomains}</span>
              <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase">Innovation domains</p>
            </div>
          </div>
        </div>

        {/* Content Tabs Area */}
        <SectionReveal>
          {loading ? (
            <div className="flex h-96 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white shadow-sm">
              <div className="text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-accent" />
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
