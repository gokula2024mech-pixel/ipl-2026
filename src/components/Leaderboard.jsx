import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Building, Cpu, Loader2, AlertCircle, Users, LayoutDashboard, Compass, Layers, Award } from 'lucide-react'
import SectionReveal from './SectionReveal'
import { supabase } from '../supabaseClient'

export default function Leaderboard() {
  const [activeTab, setActiveTab] = useState('overall')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

  // Department-Wise States
  const [deptRankings, setDeptRankings] = useState([])
  const [deptHighlights, setDeptHighlights] = useState({
    topTeamsDept: null,
    topIdeasDept: null
  })

  // Domain-Wise States
  const [domainRankings, setDomainRankings] = useState([])
  const [domainHighlights, setDomainHighlights] = useState({
    popularDomain: null,
    highestIdeasDomain: null
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

      const { kpis: fetchedKpis, team_rankings, dept_rankings, domain_rankings } = rpcData

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
      const top5Teams = teamList.slice(0, 5)

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
        allTeams: teamList
      })

      // 3. Set Department Standings
      const rankedDepts = dept_rankings || []
      setDeptRankings(rankedDepts)

      // Find department highlights
      let maxTeamsDept = null
      let maxIdeasDept = null
      let maxT = -1
      let maxI = -1
      rankedDepts.forEach(d => {
        if (d.teams > maxT) {
          maxT = d.teams
          maxTeamsDept = d
        }
        if (d.ideas > maxI) {
          maxI = d.ideas
          maxIdeasDept = d
        }
      })
      setDeptHighlights({
        topTeamsDept: maxTeamsDept,
        topIdeasDept: maxIdeasDept
      })

      // 4. Set Domain Standings
      const rankedDomains = domain_rankings || []
      setDomainRankings(rankedDomains)

      // Find domain highlights
      let popularDom = null
      let highestIdeasDom = null
      let maxDomTeams = -1
      let maxDomIdeas = -1

      rankedDomains.forEach(d => {
        if (d.teams > maxDomTeams) {
          maxDomTeams = d.teams
          popularDom = d
        }
        if (d.ideas > maxDomIdeas) {
          maxDomIdeas = d.ideas
          highestIdeasDom = d
        }
      })

      setDomainHighlights({
        popularDomain: popularDom,
        highestIdeasDomain: highestIdeasDom
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
    const maxTeamsInDist = Math.max(...overallStats.ideaDistribution.map(d => d.teams), 1)
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
          <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-6 flex items-center gap-1.5">
              <Layers size={14} className="text-primary" /> Team Activity
            </h3>
            <div className="flex justify-around items-end h-28 px-2 border-b border-slate-100 pb-1">
              {overallStats.ideaDistribution.map(dist => (
                <div key={dist.ideas} className="flex flex-col items-center gap-1.5 w-full max-w-[80px]">
                  <span className="text-[10px] font-extrabold text-primary">{dist.teams}</span>
                  <div
                    className="w-full bg-accent/90 rounded-t-md hover:bg-accent transition-all duration-300 relative group cursor-help"
                    style={{ height: `${(dist.teams / maxTeamsInDist) * 60 + 6}px` }}
                  >
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-30 pointer-events-none shadow">
                      {dist.teams} Teams have {dist.ideas} {dist.ideas === 1 ? 'idea' : 'ideas'}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 whitespace-nowrap">{dist.ideas} {dist.ideas === 1 ? 'Idea' : 'Ideas'}</span>
                </div>
              ))}
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
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm text-slate-600">
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
    const maxDeptIdeas = Math.max(...deptRankings.map(d => d.ideas), 1)

    return (
      <div className="space-y-8 mt-8">
        {/* Department Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-blue-50 text-primary flex items-center justify-center shrink-0">
              <Building size={24} />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Top Department by Teams</span>
              <h4 className="text-base font-extrabold text-slate-900 mt-0.5">{deptHighlights.topTeamsDept?.department || 'N/A'}</h4>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{deptHighlights.topTeamsDept?.teams || 0} Teams represented</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-amber-50 text-accent flex items-center justify-center shrink-0">
              <Trophy size={24} />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Top Department by Ideas</span>
              <h4 className="text-base font-extrabold text-slate-900 mt-0.5">{deptHighlights.topIdeasDept?.department || 'N/A'}</h4>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{deptHighlights.topIdeasDept?.ideas || 0} Ideas submitted</p>
            </div>
          </div>
        </div>

        {/* Comparison grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Visual Comparison bars */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm lg:col-span-1 space-y-6">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Layers size={16} className="text-primary" /> Ideas Share by Dept
            </h3>
            <div className="space-y-4">
              {deptRankings.map(d => (
                <div key={d.department} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="truncate max-w-[180px]">{d.department}</span>
                    <span className="shrink-0">{d.ideas} Ideas</span>
                  </div>
                  <div className="relative h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="absolute top-0 left-0 h-full rounded-full bg-primary"
                      style={{ width: `${(d.ideas / maxDeptIdeas) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed rankings table */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm lg:col-span-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Building size={16} className="text-primary" /> Department Performance
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-[10px] font-bold text-slate-700 uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 w-16">Rank</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3 text-right">Teams</th>
                    <th className="px-4 py-3 text-right">Ideas</th>
                    <th className="px-4 py-3 text-right">Students</th>
                    <th className="px-4 py-3 text-right w-44">Submission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {deptRankings.map((row) => (
                    <tr key={row.department} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-bold text-[10px] ${
                          row.rank === 1 ? 'bg-amber-100 text-amber-700' :
                          row.rank === 2 ? 'bg-slate-100 text-slate-700' :
                          row.rank === 3 ? 'bg-orange-100 text-orange-700' :
                          'bg-slate-50 text-slate-500'
                        }`}>
                          {row.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900 truncate max-w-[200px]">{row.department}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-600">{row.teams}</td>
                      <td className="px-4 py-3 text-right font-extrabold text-slate-900">{row.ideas}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-600">{row.students}</td>
                      <td className="px-4 py-3 text-right text-xs font-medium text-slate-600 whitespace-nowrap">{formatTimestamp(row.earliestTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Domain-Wise Render View
  const renderDomainView = () => {
    const maxDomIdeas = Math.max(...domainRankings.map(d => d.ideas), 1)

    return (
      <div className="space-y-8 mt-8">
        {/* Domain Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Most Active Domain by Ideas Count */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-blue-50 text-primary flex items-center justify-center shrink-0">
              <Compass size={24} />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Most Active Domain by Ideas</span>
              <h4 className="text-base font-extrabold text-slate-900 mt-0.5 truncate max-w-[220px]" title={domainHighlights.highestIdeasDomain?.domain}>{domainHighlights.highestIdeasDomain?.domain || 'N/A'}</h4>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{domainHighlights.highestIdeasDomain?.ideas || 0} Ideas submitted</p>
            </div>
          </div>

          {/* Popular Domain by Team Participation */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Users size={24} />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Most Popular Domain by Teams</span>
              <h4 className="text-base font-extrabold text-slate-900 mt-0.5 truncate max-w-[220px]" title={domainHighlights.popularDomain?.domain}>{domainHighlights.popularDomain?.domain || 'N/A'}</h4>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{domainHighlights.popularDomain?.teams || 0} Teams participating</p>
            </div>
          </div>
        </div>

        {/* Comparison grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Visual Comparison bars */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm lg:col-span-1 space-y-6">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Compass size={16} className="text-primary" /> Ideas Share by Domain
            </h3>
            <div className="space-y-4">
              {domainRankings.map(d => (
                <div key={d.domain} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="truncate max-w-[180px]">{d.domain}</span>
                    <span className="shrink-0">{d.ideas} Ideas</span>
                  </div>
                  <div className="relative h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="absolute top-0 left-0 h-full rounded-full bg-primary"
                      style={{ width: `${(d.ideas / maxDomIdeas) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed rankings table */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm lg:col-span-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Compass size={16} className="text-primary" /> Innovation Domains
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-[10px] font-bold text-slate-700 uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 w-16">Rank</th>
                    <th className="px-4 py-3">Innovation Domain</th>
                    <th className="px-4 py-3 text-right">Teams</th>
                    <th className="px-4 py-3 text-right">Students</th>
                    <th className="px-4 py-3 text-right">Ideas</th>
                    <th className="px-4 py-3 text-right w-44">Submission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {domainRankings.map((row) => (
                    <tr key={row.domain} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-bold text-[10px] ${
                          row.rank === 1 ? 'bg-amber-100 text-amber-700' :
                          row.rank === 2 ? 'bg-slate-100 text-slate-700' :
                          row.rank === 3 ? 'bg-orange-100 text-orange-700' :
                          'bg-slate-50 text-slate-500'
                        }`}>
                          {row.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900 truncate max-w-[200px]">{row.domain}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-600">{row.teams}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-600">{row.students}</td>
                      <td className="px-4 py-3 text-right font-extrabold text-slate-900">{row.ideas}</td>
                      <td className="px-4 py-3 text-right text-xs font-medium text-slate-600 whitespace-nowrap">{formatTimestamp(row.earliestTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
          <div className="inline-flex rounded-2xl bg-white p-1 shadow-lg border border-slate-200/80 ring-1 ring-slate-100/50">
            <button
              onClick={() => { setActiveTab('overall'); setTeamsPage(1); }}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
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
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
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
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
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
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:shadow-md transition">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Teams Registered</span>
              <div className="p-1.5 rounded-lg bg-blue-50 text-primary"><Users size={16} /></div>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 tracking-tight">{kpis.totalTeams}</span>
              <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase">Unique teams</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:shadow-md transition">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Students Participating</span>
              <div className="p-1.5 rounded-lg bg-amber-50 text-accent"><Award size={16} /></div>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 tracking-tight">{kpis.totalStudents}</span>
              <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase">Unique students</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:shadow-md transition">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Ideas Submitted</span>
              <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600"><Layers size={16} /></div>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 tracking-tight">{kpis.totalIdeas}</span>
              <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase">Ideas submitted</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:shadow-md transition">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Departments</span>
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600"><Building size={16} /></div>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 tracking-tight">{kpis.totalDepartments}</span>
              <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase">Active departments</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:shadow-md transition">
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
