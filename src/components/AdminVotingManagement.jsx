import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Vote,
  Users,
  Radio,
  ShieldCheck,
  QrCode,
  Sparkles,
  Search,
  Filter,
  Download,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Clock,
  Building2,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Layers,
  FileSpreadsheet,
  HelpCircle,
  Eye,
  Check,
  Copy
} from 'lucide-react';

const DEPARTMENTS = [
  'All Departments',
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

const TABS = [
  { id: 'overview', label: 'Overview', mobileLabel: 'Overview', icon: Layers },
  { id: 'voter_reports', label: 'Voter Reports', mobileLabel: 'Voter Reports', icon: Users },
  { id: 'team_reports', label: 'Product / Team Reports', mobileLabel: 'Team Reports', icon: Building2 },
  { id: 'export_drive', label: 'Export & Drive', mobileLabel: 'Export & Drive', icon: FileSpreadsheet }
];

/**
 * Standards-compliant OOXML Excel workbook (.xlsx) download helper
 * Assembles all 5 authoritative worksheets into a genuine ZIP-based XLSX file
 */
function downloadRealExcelWorkbook(sheets, filename) {
  const wb = XLSX.utils.book_new();

  // 1. Voting Summary
  const wsSummary = XLSX.utils.aoa_to_sheet(sheets.summaryAoa || []);
  wsSummary['!cols'] = [{ wch: 34 }, { wch: 22 }, { wch: 56 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Voting Summary');

  // 2. Vote Records
  const vrHeaders = sheets.voteRecords?.headers || [];
  const vrRows = sheets.voteRecords?.rows || [];
  const wsVoteRecords = XLSX.utils.aoa_to_sheet([vrHeaders, ...vrRows]);
  wsVoteRecords['!cols'] = [
    { wch: 14 }, { wch: 24 }, { wch: 30 }, { wch: 34 },
    { wch: 16 }, { wch: 28 }, { wch: 34 }, { wch: 34 }, { wch: 22 }
  ];
  wsVoteRecords['!views'] = [{ state: 'frozen', ySplit: 1 }];
  if (vrRows.length > 0) {
    wsVoteRecords['!autofilter'] = { ref: `A1:I${vrRows.length + 1}` };
  }
  XLSX.utils.book_append_sheet(wb, wsVoteRecords, 'Vote Records');

  // 3. Team Results
  const trHeaders = sheets.teamResults?.headers || [];
  const trRows = sheets.teamResults?.rows || [];
  const wsTeamResults = XLSX.utils.aoa_to_sheet([trHeaders, ...trRows]);
  wsTeamResults['!cols'] = [
    { wch: 8 }, { wch: 16 }, { wch: 28 }, { wch: 34 }, { wch: 34 }, { wch: 14 }
  ];
  wsTeamResults['!views'] = [{ state: 'frozen', ySplit: 1 }];
  if (trRows.length > 0) {
    wsTeamResults['!autofilter'] = { ref: `A1:F${trRows.length + 1}` };
  }
  XLSX.utils.book_append_sheet(wb, wsTeamResults, 'Team Results');

  // 4. Voter History
  const vhHeaders = sheets.voterHistory?.headers || [];
  const vhRows = sheets.voterHistory?.rows || [];
  const wsVoterHistory = XLSX.utils.aoa_to_sheet([vhHeaders, ...vhRows]);
  wsVoterHistory['!cols'] = [
    { wch: 24 }, { wch: 30 }, { wch: 34 }, { wch: 16 },
    { wch: 28 }, { wch: 34 }, { wch: 34 }, { wch: 22 }
  ];
  wsVoterHistory['!views'] = [{ state: 'frozen', ySplit: 1 }];
  if (vhRows.length > 0) {
    wsVoterHistory['!autofilter'] = { ref: `A1:H${vhRows.length + 1}` };
  }
  XLSX.utils.book_append_sheet(wb, wsVoterHistory, 'Voter History');

  // 5. Department Summary
  const dsHeaders = sheets.departmentSummary?.headers || [];
  const dsRows = sheets.departmentSummary?.rows || [];
  const wsDeptSummary = XLSX.utils.aoa_to_sheet([dsHeaders, ...dsRows]);
  wsDeptSummary['!cols'] = [
    { wch: 44 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 18 }
  ];
  wsDeptSummary['!views'] = [{ state: 'frozen', ySplit: 1 }];
  if (dsRows.length > 0) {
    wsDeptSummary['!autofilter'] = { ref: `A1:E${dsRows.length + 1}` };
  }
  XLSX.utils.book_append_sheet(wb, wsDeptSummary, 'Department Summary');

  // Write out as real binary OOXML XLSX
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `IPL_2026_Voting_Report.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AdminVotingManagement({ token, user, profile, onShowToast }) {
  // Subpage Navigation State (Persisted in sessionStorage with safe fallback)
  const [subTab, setSubTab] = useState(() => {
    try {
      const cached = sessionStorage.getItem('admin_voting_subtab');
      if (cached && ['overview', 'voter_reports', 'team_reports', 'export_drive'].includes(cached)) {
        return cached;
      }
      return 'overview';
    } catch {
      return 'overview';
    }
  });

  const handleSelectSubTab = (tabId) => {
    setSubTab(tabId);
    try {
      sessionStorage.setItem('admin_voting_subtab', tabId);
    } catch {}
  };

  // Auth Header Helper
  const authHeaders = useMemo(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, [token]);

  // Overview Metrics State
  const [metrics, setMetrics] = useState({
    totalVotes: 0,
    activeVoters: 0,
    votesPerMinute: 0,
    duplicateAttemptsBlocked: 0,
    teamsWithVotes: 0,
    totalProducts: 292,
    totalEligibleTeams: 288,
    lastVoteAt: null,
    isVotingActive: false,
    isQrGenerationActive: false
  });
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [updatingControls, setUpdatingControls] = useState(false);

  // Voter Reports State
  const [voterSearchQuery, setVoterSearchQuery] = useState('');
  const [votersList, setVotersList] = useState([]);
  const [loadingVoters, setLoadingVoters] = useState(false);
  const [selectedVoter, setSelectedVoter] = useState(null);
  const [loadingVoterDetail, setLoadingVoterDetail] = useState(false);

  // Team Reports State
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [teamDeptFilter, setTeamDeptFilter] = useState('All Departments');
  const [teamsList, setTeamsList] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);

  // Export & Drive State
  const [exportingType, setExportingType] = useState(null);
  const [uploadingDriveType, setUploadingDriveType] = useState(null);
  const [reportHistory, setReportHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Toast feedback helper
  const notify = useCallback((type, title, message) => {
    if (onShowToast) {
      onShowToast({ type, title, message });
    }
  }, [onShowToast]);

  // 1. Fetch Overview Metrics
  const fetchMetrics = useCallback(async (silent = false) => {
    if (!silent) setLoadingMetrics(true);
    try {
      const res = await fetch('/api/voting/admin/metrics', { headers: authHeaders });
      const data = await res.json();
      if (data.success && data.metrics) {
        setMetrics(prev => ({
          ...prev,
          totalVotes: data.metrics.totalVotes || 0,
          activeVoters: data.metrics.activeVoters || 0,
          votesPerMinute: data.metrics.votesPerMinute || 0,
          duplicateAttemptsBlocked: data.metrics.duplicateAttemptsBlocked || 0,
          teamsWithVotes: data.metrics.teamsWithVotes || 0,
          totalProducts: data.metrics.totalProducts || 292,
          totalEligibleTeams: data.metrics.totalEligibleTeams || 288,
          lastVoteAt: data.metrics.lastVoteAt || null,
          isVotingActive: Boolean(data.metrics.isVotingActive),
          isQrGenerationActive: Boolean(data.metrics.isQrGenerationActive)
        }));
      }
    } catch (err) {
      console.warn('[AdminVotingManagement] Failed to fetch metrics:', err);
    } finally {
      if (!silent) setLoadingMetrics(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchMetrics();
    // Non-aggressive 20-second polling for live activity
    const timer = setInterval(() => fetchMetrics(true), 20000);
    return () => clearInterval(timer);
  }, [fetchMetrics]);

  // 2. Toggle Community Voting or QR Generation
  const handleToggleControl = async (type, nextVal) => {
    setUpdatingControls(true);
    try {
      const payload = type === 'voting'
        ? { is_voting_active: nextVal }
        : { is_qr_generation_active: nextVal };

      const res = await fetch('/api/voting/admin/controls', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setMetrics(prev => ({
          ...prev,
          isVotingActive: type === 'voting' ? nextVal : prev.isVotingActive,
          isQrGenerationActive: type === 'qr' ? nextVal : prev.isQrGenerationActive
        }));
        notify('success', 'Controls Saved', type === 'voting'
          ? `Community Voting is now ${nextVal ? 'OPEN' : 'CLOSED'}.`
          : `Team QR Generation is now ${nextVal ? 'ON' : 'OFF'}.`
        );
      } else {
        notify('error', 'Update Failed', data.message || 'Could not update control.');
      }
    } catch (err) {
      notify('error', 'Update Error', err.message);
    } finally {
      setUpdatingControls(false);
    }
  };

  // 3. Fetch Voter Reports
  const fetchVoters = useCallback(async (query = '') => {
    setLoadingVoters(true);
    try {
      const url = `/api/voting/admin/voter-reports?search=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: authHeaders });
      const data = await res.json();
      if (data.success) {
        setVotersList(data.voters || []);
      }
    } catch (err) {
      console.warn('[AdminVotingManagement] Failed to load voters:', err);
    } finally {
      setLoadingVoters(false);
    }
  }, [authHeaders]);

  const handleSelectVoter = async (voter) => {
    setSelectedVoter(voter);
    setLoadingVoterDetail(true);
    try {
      const res = await fetch(`/api/voting/admin/voter-reports?voter_id=${encodeURIComponent(voter.userId)}`, { headers: authHeaders });
      const data = await res.json();
      if (data.success && data.voter) {
        setSelectedVoter(data.voter);
      }
    } catch (err) {
      console.warn('[AdminVotingManagement] Failed to fetch voter detail:', err);
    } finally {
      setLoadingVoterDetail(false);
    }
  };

  // 4. Fetch Team Reports
  const fetchTeams = useCallback(async (query = '', dept = 'All Departments') => {
    setLoadingTeams(true);
    try {
      const deptParam = dept === 'All Departments' ? '' : dept;
      const url = `/api/voting/admin/team-reports?search=${encodeURIComponent(query)}&department=${encodeURIComponent(deptParam)}`;
      const res = await fetch(url, { headers: authHeaders });
      const data = await res.json();
      if (data.success) {
        setTeamsList(data.teams || []);
      }
    } catch (err) {
      console.warn('[AdminVotingManagement] Failed to load teams:', err);
    } finally {
      setLoadingTeams(false);
    }
  }, [authHeaders]);

  const handleSelectTeam = async (team) => {
    setSelectedTeam(team);
    try {
      const res = await fetch(`/api/voting/admin/team-reports?team_id=${encodeURIComponent(team.id)}`, { headers: authHeaders });
      const data = await res.json();
      if (data.success && data.team) {
        setSelectedTeam(data.team);
      }
    } catch (err) {
      console.warn('[AdminVotingManagement] Failed to fetch team detail:', err);
    }
  };

  // 5. Fetch Report History
  const fetchReportHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/voting/admin/report-history', { headers: authHeaders });
      const data = await res.json();
      if (data.success) {
        setReportHistory(data.reports || []);
      }
    } catch (err) {
      console.warn('[AdminVotingManagement] Failed to fetch report history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [authHeaders]);

  // Load sub-page data on tab change
  useEffect(() => {
    if (subTab === 'voter_reports') {
      fetchVoters(voterSearchQuery);
    } else if (subTab === 'team_reports') {
      fetchTeams(teamSearchQuery, teamDeptFilter);
    } else if (subTab === 'export_drive') {
      fetchReportHistory();
    }
  }, [subTab, fetchVoters, fetchTeams, fetchReportHistory, voterSearchQuery, teamSearchQuery, teamDeptFilter]);

  // 6. Handle Download Excel
  const handleDownloadExcel = async (type) => {
    setExportingType(type);
    try {
      const res = await fetch(`/api/voting/admin/export-data?type=${type}`, { headers: authHeaders });
      const data = await res.json();
      if (data.success && data.sheets) {
        downloadRealExcelWorkbook(data.sheets, data.filename);
        notify('success', 'Export Ready', `Downloaded genuine Excel workbook: ${data.filename}`);
      } else if (data.success && data.headers && data.rows) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([data.headers, ...data.rows]);
        XLSX.utils.book_append_sheet(wb, ws, 'Voting Report');
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename || `IPL_2026_Export_${Date.now()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify('success', 'Export Ready', `Downloaded ${data.filename} (${data.totalRows} records).`);
      } else {
        notify('error', 'Export Failed', data.message || 'Could not export records.');
      }
    } catch (err) {
      notify('error', 'Export Error', err.message);
    } finally {
      setExportingType(null);
    }
  };

  // 7. Handle Save to Google Drive
  const handleSaveToDrive = async (type) => {
    setUploadingDriveType(type);
    try {
      const res = await fetch('/api/voting/admin/export-upload-drive', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ type })
      });
      const data = await res.json();
      if (data.success) {
        notify('success', 'Saved to Google Drive', `${data.fileName} archived in 'IPL 2026 Voting Reports'.`);
        fetchReportHistory();
      } else {
        notify('error', 'Drive Upload Failed', data.message || 'Could not save to Google Drive.');
      }
    } catch (err) {
      notify('error', 'Drive Error', err.message);
    } finally {
      setUploadingDriveType(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in w-full max-w-7xl mx-auto">
      {/* 1. Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-[#0B1B3A] tracking-tight flex items-center gap-3">
            <Vote className="text-primary" size={28} /> Voting Management & Analytics
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Monitor, manage, and analyze community voting for IPL 2026
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchMetrics()}
            disabled={loadingMetrics}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white ring-1 ring-slate-200 hover:bg-slate-50 transition cursor-pointer flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={14} className={loadingMetrics ? 'animate-spin text-primary' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Internal Sub-page Navigation (Unified Segmented Tab Control) */}
      <div className="w-full border-b border-slate-200/80 pb-2">
        <nav
          className="inline-flex max-w-full p-1 bg-slate-100/90 backdrop-blur-sm rounded-xl border border-slate-200/90 gap-1 overflow-x-auto scrollbar-none shadow-inner"
          aria-label="Voting Management Tabs"
        >
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectSubTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm font-bold ring-1 ring-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={16} className={isActive ? 'text-primary' : 'text-slate-400'} />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="inline sm:hidden">{tab.mobileLabel}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ============================================================== */}
      {/* SUB-PAGE 1: OVERVIEW                                           */}
      {/* ============================================================== */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          {/* Live Monitoring 4 Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">Total Votes Cast</span>
                <Sparkles size={16} className="text-amber-500" />
              </div>
              <p className="font-heading text-2xl sm:text-3xl font-black text-[#0B1B3A]">
                {metrics.totalVotes.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500">Total recorded votes</p>
            </article>

            <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">Active Voters</span>
                <Users size={16} className="text-primary" />
              </div>
              <p className="font-heading text-2xl sm:text-3xl font-black text-[#0B1B3A]">
                {metrics.activeVoters.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500">Distinct student voters</p>
            </article>

            <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">Velocity</span>
                <Radio size={16} className="text-emerald-500 animate-pulse" />
              </div>
              <p className="font-heading text-2xl sm:text-3xl font-black text-emerald-700">
                {metrics.votesPerMinute} <span className="text-xs font-bold text-slate-400">/ min</span>
              </p>
              <p className="text-[10px] text-slate-500">Live voting rate</p>
            </article>

            <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">Duplicates Blocked</span>
                <ShieldCheck size={16} className="text-indigo-600" />
              </div>
              <p className="font-heading text-2xl sm:text-3xl font-black text-indigo-900">
                {metrics.duplicateAttemptsBlocked}
              </p>
              <p className="text-[10px] text-slate-500">Duplicate prevention</p>
            </article>
          </div>

          {/* Operational Controls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Control A: Community Voting */}
            <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm sm:text-base">
                    <Vote size={18} className="text-primary" /> Community Voting
                  </h4>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                    metrics.isVotingActive
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {metrics.isVotingActive ? 'OPEN' : 'CLOSED'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  When <strong>OPEN</strong>, authenticated students can scan QR codes and cast official votes. When <strong>CLOSED</strong>, voting submissions are paused.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={updatingControls}
                  onClick={() => handleToggleControl('voting', !metrics.isVotingActive)}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-2 shadow-sm ${
                    metrics.isVotingActive
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  } disabled:opacity-50`}
                >
                  <Vote size={15} />
                  <span>{metrics.isVotingActive ? 'Close Voting' : 'Open Voting'}</span>
                </button>
              </div>
            </article>

            {/* Control B: Team QR Generation */}
            <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm sm:text-base">
                    <QrCode size={18} className="text-primary" /> Team QR Generation
                  </h4>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                    metrics.isQrGenerationActive
                      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-600/20'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {metrics.isQrGenerationActive ? 'ON' : 'OFF'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  When <strong>ON</strong>, eligible teams can generate and view their permanent QR codes for their stall. Disabling QR generation does NOT delete stored permanent QR tokens.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={updatingControls}
                  onClick={() => handleToggleControl('qr', !metrics.isQrGenerationActive)}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-2 shadow-sm ${
                    metrics.isQrGenerationActive
                      ? 'bg-slate-700 hover:bg-slate-800 text-white'
                      : 'bg-primary hover:bg-primary/90 text-white'
                  } disabled:opacity-50`}
                >
                  <QrCode size={15} />
                  <span>{metrics.isQrGenerationActive ? 'Turn Off QR Generation' : 'Turn On QR Generation'}</span>
                </button>
              </div>
            </article>
          </div>

          {/* Quick Statistics Section */}
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 space-y-4">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock size={16} className="text-primary" /> Quick Statistics
            </h4>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Teams With Votes</span>
                <p className="text-xl sm:text-2xl font-black text-[#0B1B3A]">{metrics.teamsWithVotes}</p>
                <p className="text-[10px] text-slate-400">Teams received &ge; 1 vote</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Products</span>
                <p className="text-xl sm:text-2xl font-black text-[#0B1B3A]">{metrics.totalProducts}</p>
                <p className="text-[10px] text-slate-400">Active project submissions</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Eligible Teams</span>
                <p className="text-xl sm:text-2xl font-black text-[#0B1B3A]">{metrics.totalEligibleTeams}</p>
                <p className="text-[10px] text-slate-400">Verified participant teams</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Last Vote</span>
                <p className="text-sm font-bold text-slate-900 truncate">
                  {metrics.lastVoteAt ? new Date(metrics.lastVoteAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'No votes yet'}
                </p>
                <p className="text-[10px] text-slate-400">
                  {metrics.lastVoteAt ? new Date(metrics.lastVoteAt).toLocaleDateString() : 'Continuous Voting'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-PAGE 2: VOTER REPORTS                                      */}
      {/* ============================================================== */}
      {subTab === 'voter_reports' && (
        <div className="space-y-6">
          {/* Search Controls */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={voterSearchQuery}
                onChange={(e) => {
                  setVoterSearchQuery(e.target.value);
                  fetchVoters(e.target.value);
                }}
                placeholder="Search by student name, email, or user ID..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => fetchVoters(voterSearchQuery)}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2"
            >
              <Search size={14} /> Search
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Voters List Column */}
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                  Active Voters ({votersList.length})
                </h4>
                {loadingVoters && <RefreshCw size={12} className="animate-spin text-primary" />}
              </div>

              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {votersList.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    {loadingVoters ? 'Loading voter records...' : 'No voters found matching search.'}
                  </div>
                ) : (
                  votersList.map(v => (
                    <button
                      key={v.userId}
                      type="button"
                      onClick={() => handleSelectVoter(v)}
                      className={`w-full text-left p-3 rounded-xl transition cursor-pointer flex items-center justify-between border ${
                        selectedVoter?.userId === v.userId
                          ? 'bg-blue-50 border-primary text-primary shadow-xs'
                          : 'bg-white border-slate-100 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-extrabold truncate">{v.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{v.email}</p>
                        <p className="text-[10px] text-slate-400 truncate">{v.department}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 shrink-0">
                        {v.totalVotes} {v.totalVotes === 1 ? 'vote' : 'votes'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Voter Detail / Voting History Column */}
            <div className="lg:col-span-2 space-y-4">
              {selectedVoter ? (
                <div className="space-y-4">
                  {/* Voter Profile Banner */}
                  <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">{selectedVoter.name}</h3>
                        <p className="text-xs text-slate-500">{selectedVoter.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-50 text-blue-700 ring-1 ring-blue-600/20">
                          {selectedVoter.department}
                        </span>
                        <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20">
                          {selectedVoter.totalVotes} Total Votes
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                      Voter User ID: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">{selectedVoter.userId}</code>
                    </p>
                  </div>

                  {/* Voting History Table */}
                  <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 space-y-3">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Vote size={16} className="text-primary" /> Voting History
                    </h4>

                    {loadingVoterDetail ? (
                      <div className="py-8 text-center text-slate-400 text-xs">Loading detailed history...</div>
                    ) : selectedVoter.history?.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 text-xs">No votes recorded for this voter yet.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                              <th className="pb-2.5">Team ID</th>
                              <th className="pb-2.5">Team Name</th>
                              <th className="pb-2.5">Product / Idea</th>
                              <th className="pb-2.5">Team Department</th>
                              <th className="pb-2.5">Voted At</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {selectedVoter.history.map((h, i) => (
                              <tr key={h.voteId || i} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3 font-mono font-bold text-primary">{h.teamId}</td>
                                <td className="py-3 font-semibold text-slate-900">{h.teamName}</td>
                                <td className="py-3 max-w-[200px] truncate">{h.productTitle}</td>
                                <td className="py-3">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                                    {h.teamDepartment}
                                  </span>
                                </td>
                                <td className="py-3 text-slate-500 whitespace-nowrap">
                                  {new Date(h.votedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-white p-12 shadow-sm ring-1 ring-slate-200 text-center space-y-3">
                  <Users size={32} className="mx-auto text-slate-300" />
                  <h4 className="text-sm font-bold text-slate-700">No Voter Selected</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Select a student voter from the list or search by name/email to inspect all teams and products they have voted for.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-PAGE 3: PRODUCT / TEAM REPORTS                             */}
      {/* ============================================================== */}
      {subTab === 'team_reports' && (
        <div className="space-y-6">
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={teamSearchQuery}
                onChange={(e) => {
                  setTeamSearchQuery(e.target.value);
                  fetchTeams(e.target.value, teamDeptFilter);
                }}
                placeholder="Filter by team name, team ID, or product title..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div className="w-full sm:w-64">
              <select
                value={teamDeptFilter}
                onChange={(e) => {
                  setTeamDeptFilter(e.target.value);
                  fetchTeams(teamSearchQuery, e.target.value);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              >
                {DEPARTMENTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Teams List */}
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                  Participating Teams ({teamsList.length})
                </h4>
                {loadingTeams && <RefreshCw size={12} className="animate-spin text-primary" />}
              </div>

              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {teamsList.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    {loadingTeams ? 'Loading teams...' : 'No teams found matching search/filter.'}
                  </div>
                ) : (
                  teamsList.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTeam(t)}
                      className={`w-full text-left p-3 rounded-xl transition cursor-pointer flex items-center justify-between border ${
                        selectedTeam?.id === t.id
                          ? 'bg-blue-50 border-primary text-primary shadow-xs'
                          : 'bg-white border-slate-100 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-bold text-slate-400">{t.registrationId}</span>
                          <p className="text-xs font-extrabold truncate">{t.teamName}</p>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">{t.department}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                        t.totalVotes > 0 ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {t.totalVotes} {t.totalVotes === 1 ? 'vote' : 'votes'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Team Detail & Voters List */}
            <div className="lg:col-span-2 space-y-4">
              {selectedTeam ? (
                <div className="space-y-4">
                  {/* Team Profile Banner */}
                  <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {selectedTeam.registrationId}
                          </span>
                          <h3 className="text-lg font-bold text-slate-900">{selectedTeam.teamName}</h3>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{selectedTeam.department}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20">
                          {selectedTeam.totalVotes} Total Votes
                        </span>
                      </div>
                    </div>

                    {/* Products list under this team */}
                    {selectedTeam.products && selectedTeam.products.length > 0 && (
                      <div className="pt-3 space-y-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Products / Ideas ({selectedTeam.products.length})
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {selectedTeam.products.map((p, idx) => (
                            <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                              <p className="font-bold text-slate-900">{p.productTitle}</p>
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-white text-slate-600 border border-slate-200">
                                {p.innovationDomain}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Voters for this Team Table */}
                  <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 space-y-3">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Users size={16} className="text-primary" /> Voters For This Team ({selectedTeam.voters?.length || 0})
                    </h4>

                    {(!selectedTeam.voters || selectedTeam.voters.length === 0) ? (
                      <div className="py-8 text-center text-slate-400 text-xs">
                        No votes have been cast for this team yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                              <th className="pb-2.5 w-12">S.No</th>
                              <th className="pb-2.5">Voter Name</th>
                              <th className="pb-2.5">Voter Email</th>
                              <th className="pb-2.5">Voter Department</th>
                              <th className="pb-2.5">Vote Timestamp</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {selectedTeam.voters.map((v, i) => (
                              <tr key={v.voteId || i} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3 font-mono font-bold text-slate-400">{i + 1}</td>
                                <td className="py-3 font-semibold text-slate-900">{v.voterName}</td>
                                <td className="py-3 text-slate-600">{v.voterEmail}</td>
                                <td className="py-3">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                                    {v.voterDepartment}
                                  </span>
                                </td>
                                <td className="py-3 text-slate-500 whitespace-nowrap">
                                  {new Date(v.votedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-white p-12 shadow-sm ring-1 ring-slate-200 text-center space-y-3">
                  <Building2 size={32} className="mx-auto text-slate-300" />
                  <h4 className="text-sm font-bold text-slate-700">No Team Selected</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Select a team from the list to see total votes received, associated products, and the complete audit list of student voters.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-PAGE 4: EXPORT & DRIVE                                     */}
      {/* ============================================================== */}
      {subTab === 'export_drive' && (
        <div className="space-y-6">
          {/* Export Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Complete Voting Records */}
            <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="p-3 w-fit rounded-xl bg-blue-50 text-primary mb-1">
                  <FileSpreadsheet size={24} />
                </div>
                <h3 className="text-base font-bold text-slate-900">Complete Voting Records</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Full audit log of every individual vote cast, including Voter ID, Name, Email, Department, Team ID, Team Name, Product Title, and Timestamp.
                </p>
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={exportingType === 'complete'}
                  onClick={() => handleDownloadExcel('complete')}
                  className="w-full py-2.5 px-3.5 rounded-xl text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Download size={14} />
                  <span>{exportingType === 'complete' ? 'Generating...' : 'Download Excel (.xlsx)'}</span>
                </button>
                <button
                  type="button"
                  disabled={uploadingDriveType === 'complete'}
                  onClick={() => handleSaveToDrive('complete')}
                  className="w-full py-2.5 px-3.5 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary/90 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <HardDrive size={14} />
                  <span>{uploadingDriveType === 'complete' ? 'Uploading...' : 'Save to Google Drive'}</span>
                </button>
              </div>
            </article>

            {/* Card 2: Team / Product Voters */}
            <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="p-3 w-fit rounded-xl bg-emerald-50 text-emerald-600 mb-1">
                  <Building2 size={24} />
                </div>
                <h3 className="text-base font-bold text-slate-900">Team / Product Voters</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Team-centric report listing every team, department, and product along with the individual student voters who supported them.
                </p>
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={exportingType === 'team_voters'}
                  onClick={() => handleDownloadExcel('team_voters')}
                  className="w-full py-2.5 px-3.5 rounded-xl text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Download size={14} />
                  <span>{exportingType === 'team_voters' ? 'Generating...' : 'Download Excel (.xlsx)'}</span>
                </button>
                <button
                  type="button"
                  disabled={uploadingDriveType === 'team_voters'}
                  onClick={() => handleSaveToDrive('team_voters')}
                  className="w-full py-2.5 px-3.5 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary/90 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <HardDrive size={14} />
                  <span>{uploadingDriveType === 'team_voters' ? 'Uploading...' : 'Save to Google Drive'}</span>
                </button>
              </div>
            </article>

            {/* Card 3: Voter Summary */}
            <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="p-3 w-fit rounded-xl bg-indigo-50 text-indigo-600 mb-1">
                  <Users size={24} />
                </div>
                <h3 className="text-base font-bold text-slate-900">Voter Summary</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Student-centric summary aggregating each distinct student voter, their department, total votes cast, and list of teams voted for.
                </p>
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={exportingType === 'voter_summary'}
                  onClick={() => handleDownloadExcel('voter_summary')}
                  className="w-full py-2.5 px-3.5 rounded-xl text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Download size={14} />
                  <span>{exportingType === 'voter_summary' ? 'Generating...' : 'Download Excel (.xlsx)'}</span>
                </button>
                <button
                  type="button"
                  disabled={uploadingDriveType === 'voter_summary'}
                  onClick={() => handleSaveToDrive('voter_summary')}
                  className="w-full py-2.5 px-3.5 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary/90 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <HardDrive size={14} />
                  <span>{uploadingDriveType === 'voter_summary' ? 'Uploading...' : 'Save to Google Drive'}</span>
                </button>
              </div>
            </article>
          </div>

          {/* Drive Archiving Notice */}
          <div className="rounded-xl bg-blue-50 p-4 border border-blue-100 text-xs text-blue-800 flex items-start gap-3">
            <HardDrive className="text-primary shrink-0 mt-0.5" size={18} />
            <div>
              <p className="font-bold">Google Drive Storage Location</p>
              <p className="text-blue-700 mt-0.5">
                All exported reports are saved into the dedicated <code className="font-semibold bg-white/70 px-1 py-0.5 rounded">IPL 2026 Voting Reports</code> folder on Google Drive. Student submission documents in Phase 1, 2, and 3 folders remain untouched.
              </p>
            </div>
          </div>

          {/* Report History */}
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock size={16} className="text-primary" /> Report History ({reportHistory.length})
              </h4>
              <button
                type="button"
                onClick={() => fetchReportHistory()}
                disabled={loadingHistory}
                className="text-xs text-primary font-bold hover:underline cursor-pointer flex items-center gap-1"
              >
                <RefreshCw size={12} className={loadingHistory ? 'animate-spin' : ''} /> Refresh History
              </button>
            </div>

            {loadingHistory ? (
              <div className="py-8 text-center text-slate-400 text-xs">Loading report history...</div>
            ) : reportHistory.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No reports generated yet. Use the action cards above to generate and archive reports.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="pb-2.5">File Name</th>
                      <th className="pb-2.5">Generated At</th>
                      <th className="pb-2.5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {reportHistory.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 font-semibold text-slate-900 flex items-center gap-2">
                          <FileSpreadsheet size={14} className="text-emerald-600" />
                          <span>{r.name}</span>
                        </td>
                        <td className="py-3 text-slate-500 whitespace-nowrap">
                          {r.modifiedTime ? new Date(r.modifiedTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Recently'}
                        </td>
                        <td className="py-3 whitespace-nowrap">
                          {r.webViewLink ? (
                            <a
                              href={r.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-primary bg-blue-50 hover:bg-blue-100 transition"
                            >
                              <ExternalLink size={12} /> View on Drive
                            </a>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Archived</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
