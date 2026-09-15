import React, { useState, useEffect, useCallback, useMemo,useRef } from 'react';
import { supabase } from '../supabaseClient';
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
  ChevronLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Layers,
  FileSpreadsheet,
  HelpCircle,
  Eye,
  Check,
  Copy,
  BarChart3,
  Activity,
  TrendingUp,
  Upload,
  X
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
  { id: 'analytics', label: 'Engagement Analytics', mobileLabel: 'Analytics', icon: BarChart3 },
  { id: 'voter_reports', label: 'Voter Reports', mobileLabel: 'Voter Reports', icon: Users },
  { id: 'team_reports', label: 'Product / Team Reports', mobileLabel: 'Team Reports', icon: Building2 }
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

/**
 * Safely executes a fetch request and parses JSON responses.
 * Prevents "Unexpected token" crashes when the server returns HTML/text error pages.
 * Distinguishes authentication, authorization, 404 route, server, network, and non-JSON errors.
 */
async function safeFetchJson(url, options = {}) {
  try {
    const res = await fetch(url, options);
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    let data = null;

    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (parseErr) {
        return {
          ok: false,
          status: res.status,
          errorType: 'JSON_PARSE_ERROR',
          message: `Received invalid JSON from server (HTTP ${res.status}).`,
          data: null
        };
      }
    } else {
      // Non-JSON response (e.g., HTML 404 / 500 error page from CDN / reverse proxy)
      let text = '';
      try {
        text = await res.text();
      } catch {}

      let friendlyMsg = `Server returned non-JSON response (HTTP ${res.status}).`;
      if (res.status === 404) {
        friendlyMsg = `Endpoint not found (HTTP 404). Please verify backend route configuration.`;
      } else if (res.status === 401) {
        friendlyMsg = `Authentication required (HTTP 401). Please re-login.`;
      } else if (res.status === 403) {
        friendlyMsg = `Access forbidden (HTTP 403). Admin authorization required.`;
      } else if (res.status >= 500) {
        friendlyMsg = `Server error (HTTP ${res.status}). Please check backend logs.`;
      }

      return {
        ok: false,
        status: res.status,
        errorType: res.status === 404 ? 'NOT_FOUND' : (res.status === 401 ? 'UNAUTHORIZED' : (res.status === 403 ? 'FORBIDDEN' : (res.status >= 500 ? 'SERVER_ERROR' : 'NON_JSON_RESPONSE'))),
        message: friendlyMsg,
        data: null
      };
    }

    if (!res.ok) {
      const errorType = res.status === 401 ? 'UNAUTHORIZED' : (res.status === 403 ? 'FORBIDDEN' : (res.status === 404 ? 'NOT_FOUND' : (res.status >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR')));
      const message = (data && (data.message || data.error)) || `Request failed with HTTP status ${res.status}.`;
      return {
        ok: false,
        status: res.status,
        errorType,
        message,
        data
      };
    }

    return {
      ok: true,
      status: res.status,
      errorType: null,
      message: null,
      data
    };
  } catch (netErr) {
    return {
      ok: false,
      status: 0,
      errorType: 'NETWORK_ERROR',
      message: `Network error: ${netErr.message || 'Unable to connect to backend server'}.`,
      data: null
    };
  }
}

/**
 * Intelligent pagination window generator matching AdminSubmissionsReviewCenter design
 */
function getVisiblePages(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = [];
  if (current <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push('...');
    pages.push(total);
  } else if (current >= total - 3) {
    pages.push(1);
    pages.push('...');
    for (let i = total - 4; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    pages.push('...');
    pages.push(current - 1);
    pages.push(current);
    pages.push(current + 1);
    pages.push('...');
    pages.push(total);
  }
  return pages;
}

// ==============================================================
// FIELD-SELECTIVE ADMIN EXCEL EXPORT CATALOGS & REAL XLSX GENERATOR
// ==============================================================

export const VOTER_EXPORT_FIELDS = [
  {
    group: 'VOTER PROFILE',
    fields: [
      { key: 'voterName', label: 'Voter Name', defaultChecked: true, width: 24 },
      { key: 'voterEmail', label: 'Voter Email', defaultChecked: true, width: 30 },
      { key: 'voterDepartment', label: 'Voter Department', defaultChecked: true, width: 34 },
      { key: 'voterUserId', label: 'Voter User ID', defaultChecked: false, width: 38 },
      { key: 'totalVotes', label: 'Total Votes Cast', defaultChecked: true, width: 16 }
    ]
  },
  {
    group: 'VOTE DETAILS',
    fields: [
      { key: 'voteId', label: 'Vote ID', defaultChecked: false, width: 38 },
      { key: 'teamId', label: 'Team Registration ID', defaultChecked: true, width: 22 },
      { key: 'teamName', label: 'Team Name', defaultChecked: true, width: 28 },
      { key: 'teamDepartment', label: 'Team Department', defaultChecked: true, width: 34 },
      { key: 'productTitle', label: 'Product / Idea Title', defaultChecked: true, width: 34 },
      { key: 'productId', label: 'Product ID', defaultChecked: false, width: 38 },
      { key: 'votedAt', label: 'Vote Timestamp (IST)', defaultChecked: true, width: 24 }
    ]
  }
];

export const TEAM_EXPORT_FIELDS = [
  {
    group: 'TEAM IDENTIFICATION',
    fields: [
      { key: 'registrationId', label: 'Registration ID', defaultChecked: true, width: 20 },
      { key: 'teamName', label: 'Team Name', defaultChecked: true, width: 28 },
      { key: 'department', label: 'Department', defaultChecked: true, width: 34 },
      { key: 'teamId', label: 'Team UUID', defaultChecked: false, width: 38 }
    ]
  },
  {
    group: 'PRODUCT & INNOVATION',
    fields: [
      { key: 'productTitle', label: 'Product Title', defaultChecked: true, width: 34 },
      { key: 'productType', label: 'Product Type', defaultChecked: true, width: 16 },
      { key: 'innovationDomain', label: 'Innovation Domain', defaultChecked: true, width: 26 },
      { key: 'productId', label: 'Product UUID', defaultChecked: false, width: 38 },
      { key: 'productVotes', label: 'Product Votes', defaultChecked: true, width: 16 },
      { key: 'productScore', label: 'Product Score', defaultChecked: true, width: 16 }
    ]
  },
  {
    group: 'VOTING TOTALS & SHORTLIST',
    fields: [
      { key: 'totalVotes', label: 'Total Team Votes', defaultChecked: true, width: 18 },
      { key: 'score', label: 'Total Team Score', defaultChecked: true, width: 18 },
      { key: 'isShortlisted', label: 'Shortlist Status', defaultChecked: true, width: 18 },
      { key: 'shortlistCategory', label: 'Shortlist Category', defaultChecked: true, width: 22 }
    ]
  }
];

/**
 * Genuine OOXML Excel generator (.xlsx) using bundled SheetJS
 */
function exportToRealXlsx({ filename, sheetName = 'Report', headers, rows, colWidths = [] }) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  if (colWidths.length > 0) {
    ws['!cols'] = colWidths.map(w => ({ wch: w || 20 }));
  }

  ws['!views'] = [{ state: 'frozen', ySplit: 1 }];

  if (rows.length > 0) {
    const lastColIndex = headers.length - 1;
    const lastColLetter = XLSX.utils.encode_col(lastColIndex);
    ws['!autofilter'] = { ref: `A1:${lastColLetter}${rows.length + 1}` };
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Reusable Field-Selection Export Modal
 */
function FieldSelectionExportModal({
  isOpen,
  onClose,
  title,
  subtitle,
  fieldGroups,
  selectedFields,
  onToggleField,
  onSelectAll,
  onClearAll,
  onDownload,
  totalRecordsCount,
  recordTypeName = 'records'
}) {
  if (!isOpen) return null;

  const totalFieldsCount = fieldGroups.reduce((acc, g) => acc + g.fields.length, 0);
  const selectedCount = selectedFields.size;
  const isAllSelected = selectedCount === totalFieldsCount;
  const isNoneSelected = selectedCount === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0"
        onClick={onClose}
      />

      <div className="relative w-full max-w-xl sm:max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between bg-white shrink-0">
          <div>
            <h3 className="font-heading text-lg font-black text-[#0B1B3A] tracking-tight">
              {title}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar: Select All / Clear All & Counter */}
        <div className="px-5 sm:px-6 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 text-xs font-bold">
            <button
              type="button"
              onClick={onSelectAll}
              className={`text-primary hover:underline cursor-pointer ${isAllSelected ? 'opacity-50 pointer-events-none' : ''}`}
            >
              Select All
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={onClearAll}
              className={`text-slate-500 hover:underline cursor-pointer ${isNoneSelected ? 'opacity-50 pointer-events-none' : ''}`}
            >
              Clear All
            </button>
          </div>

          <span className="text-xs font-semibold text-slate-600 bg-white px-2.5 py-1 rounded-full border border-slate-200">
            Selected: <span className="font-bold text-slate-900">{selectedCount}</span> / {totalFieldsCount} fields
          </span>
        </div>

        {/* Body (Scrollable field groups) */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {fieldGroups.map(group => (
            <div key={group.group} className="space-y-3">
              <h4 className="text-[11px] font-black text-slate-400 tracking-wider uppercase border-b border-slate-100 pb-1.5">
                {group.group}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {group.fields.map(f => {
                  const checked = selectedFields.has(f.key);
                  return (
                    <label
                      key={f.key}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer select-none ${
                        checked
                          ? 'bg-blue-50/40 border-primary/30 text-slate-900'
                          : 'bg-white border-slate-200/80 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleField(f.key)}
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer mt-0.5"
                      />
                      <span className="text-xs font-semibold leading-snug">
                        {f.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {totalRecordsCount === 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle size={16} className="text-amber-600 shrink-0" />
              <span>No matching records to export based on current search & filter criteria.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-center sm:text-left text-xs font-semibold text-slate-500">
            <span className="font-bold text-slate-900">{selectedCount}</span> fields selected •{' '}
            <span className="font-bold text-slate-900">{totalRecordsCount}</span> {recordTypeName} to export
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isNoneSelected || totalRecordsCount === 0}
              onClick={onDownload}
              className="flex-1 sm:flex-none px-5 py-2 rounded-xl text-xs font-bold text-white bg-primary hover:bg-blue-900 transition cursor-pointer shadow-sm disabled:bg-slate-300 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-1.5"
            >
              <Download size={13} />
              <span>Download Excel (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminVotingManagement({
  token,
  user,
  profile,
  onShowToast,
  apiBaseUrl,
  initialRegisteredTeams = 0,
  initialEligibleTeams = 0,
  initialProductsCount = 0
}) {
  // Centralized API Base URL resolution (local vs production)
  const rawApiUrl = (apiBaseUrl || import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').trim().replace(/\/+$/, '');
  const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl.slice(0, -4) : rawApiUrl;

  // Subpage Navigation State (Persisted in sessionStorage with safe fallback)
  const [subTab, setSubTab] = useState(() => {
    try {
      const cached = sessionStorage.getItem('admin_voting_subtab');
      if (cached && ['overview', 'analytics', 'voter_reports', 'team_reports'].includes(cached)) {
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

  // Auth Token Resolution & Fallback
  const [activeAuthToken, setActiveAuthToken] = useState(token || '');

  useEffect(() => {
    if (token) {
      setActiveAuthToken(token);
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.access_token) {
          setActiveAuthToken(session.access_token);
        }
      });
    }
  }, [token]);

  const effectiveToken = token || activeAuthToken;

  // Auth Header Helper
  const authHeaders = useMemo(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (effectiveToken) headers['Authorization'] = `Bearer ${effectiveToken}`;
    return headers;
  }, [effectiveToken]);

  // Overview Metrics State
  const [metrics, setMetrics] = useState({
    totalVotes: 0,
    activeVoters: 0,
    votesPerMinute: 0,
    duplicateAttemptsBlocked: 0,
    teamsWithVotes: 0,
    totalRegisteredTeams: initialRegisteredTeams,
    totalEligibleTeams: initialEligibleTeams,
    totalProducts: initialProductsCount,
    lastVoteAt: null,
    isVotingActive: false,
    isQrGenerationActive: false
  });

  // Sync props if parent provides initial/updated counts
  useEffect(() => {
    if (initialRegisteredTeams || initialEligibleTeams || initialProductsCount) {
      setMetrics(prev => ({
        ...prev,
        totalRegisteredTeams: initialRegisteredTeams || prev.totalRegisteredTeams,
        totalEligibleTeams: initialEligibleTeams || prev.totalEligibleTeams,
        totalProducts: initialProductsCount || prev.totalProducts,
      }));
    }
  }, [initialRegisteredTeams, initialEligibleTeams, initialProductsCount]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [updatingControls, setUpdatingControls] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // Engagement Analytics State
  const [analyticsMetrics, setAnalyticsMetrics] = useState(null);
  const [analyticsIdeas, setAnalyticsIdeas] = useState([]);
  const [dailyVisits, setDailyVisits] = useState([]);
  const [authenticatedVisitors, setAuthenticatedVisitors] = useState([]);
  const [analyticsDateRange, setAnalyticsDateRange] = useState('all');
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsSearchQuery, setAnalyticsSearchQuery] = useState('');
  const [exportingAnalytics, setExportingAnalytics] = useState(false);
  const [exportingAnalyticsXlsx, setExportingAnalyticsXlsx] = useState(false);

  // Voter Reports State (Admin Only Filter/Sort/Pagination)
  const [voterSearchQuery, setVoterSearchQuery] = useState('');
  const [voterDeptFilter, setVoterDeptFilter] = useState('All Departments');
  const [voterActivityFilter, setVoterActivityFilter] = useState('all'); // 'all' | 'multiple' | 'single'
  const [voterSortBy, setVoterSortBy] = useState('votes'); // 'votes' | 'name' | 'email' | 'date'
  const [voterSortOrder, setVoterSortOrder] = useState('desc'); // 'desc' | 'asc'
  const [voterCurrentPage, setVoterCurrentPage] = useState(1);
  const [votersList, setVotersList] = useState([]);
  const [loadingVoters, setLoadingVoters] = useState(false);
  const [selectedVoter, setSelectedVoter] = useState(null);
  const [loadingVoterDetail, setLoadingVoterDetail] = useState(false);

  // Team Reports State (Admin Only Filter/Sort/Pagination)
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [teamDeptFilter, setTeamDeptFilter] = useState('All Departments');
  const [teamProductTypeFilter, setTeamProductTypeFilter] = useState('all'); // 'all' | 'hardware' | 'software'
  const [teamShortlistFilter, setTeamShortlistFilter] = useState('all'); // 'all' | 'shortlisted' | 'non_shortlisted'
  const [teamVotingStatusFilter, setTeamVotingStatusFilter] = useState('all'); // 'all' | 'with_votes' | 'zero_votes'
  const [teamSortBy, setTeamSortBy] = useState('votes'); // 'votes' | 'score' | 'team_name' | 'product_title' | 'registration_id'
  const [teamSortOrder, setTeamSortOrder] = useState('desc'); // 'desc' | 'asc'
  const [teamCurrentPage, setTeamCurrentPage] = useState(1);
  const [teamsList, setTeamsList] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [loadingTeamDetail, setLoadingTeamDetail] = useState(false);
  const [selectedTeamVoterPage, setSelectedTeamVoterPage] = useState(1);


  // Phase 3 Shortlist Management State (STEP 10E)
  const [shortlistStatus, setShortlistStatus] = useState(null);
  const [loadingShortlistStatus, setLoadingShortlistStatus] = useState(false);
  const [shortlistSourceType, setShortlistSourceType] = useState('drive'); // 'drive' | 'manual'
  const [shortlistDriveFiles, setShortlistDriveFiles] = useState([]);
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);
  const [selectedDriveFileId, setSelectedDriveFileId] = useState('');
  const [selectedManualFile, setSelectedManualFile] = useState(null);
  const [shortlistSyncMode, setShortlistSyncMode] = useState('INCREMENTAL'); // 'INCREMENTAL' | 'FULL_REPLACEMENT'
  const [shortlistPreview, setShortlistPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [executingSync, setExecutingSync] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // Stable ref for onShowToast callback to prevent re-fetch loops on parent re-renders
  const onShowToastRef = useRef(onShowToast);
  useEffect(() => {
    onShowToastRef.current = onShowToast;
  }, [onShowToast]);

  // Toast feedback helper (stable reference)
  const notify = useCallback((type, title, message) => {
    if (onShowToastRef.current) {
      onShowToastRef.current({ type, title, message });
    }
  }, []);

  // 1. Fetch Overview Metrics & Controls
  const fetchMetrics = useCallback(async (silent = false) => {
    if (!silent) setLoadingMetrics(true);
    try {
      const [metricsRes, controlsRes] = await Promise.all([
        safeFetchJson(`${API_BASE_URL}/api/voting/admin/metrics`, { headers: authHeaders }),
        safeFetchJson(`${API_BASE_URL}/api/voting/admin/controls`, { headers: authHeaders })
      ]);

      if (!metricsRes.ok) {
        if (!silent) {
          setFetchError({ status: metricsRes.status, type: metricsRes.errorType, message: metricsRes.message });
          notify('error', 'Metrics Error', metricsRes.message);
        }
        return;
      }

      setFetchError(null);
      const data = metricsRes.data;
      const ctrlData = controlsRes.ok && controlsRes.data?.controls ? controlsRes.data.controls : null;

      if (data?.success && data?.metrics) {
        setMetrics(prev => ({
          ...prev,
          totalVotes: data.metrics.totalVotes || 0,
          activeVoters: data.metrics.activeVoters || 0,
          votesPerMinute: data.metrics.votesPerMinute || 0,
          duplicateAttemptsBlocked: data.metrics.duplicateAttemptsBlocked || 0,
          teamsWithVotes: data.metrics.teamsWithVotes || 0,
          totalRegisteredTeams: typeof data.metrics.totalRegisteredTeams === 'number' ? data.metrics.totalRegisteredTeams : prev.totalRegisteredTeams,
          totalEligibleTeams: typeof data.metrics.totalEligibleTeams === 'number' ? data.metrics.totalEligibleTeams : prev.totalEligibleTeams,
          totalProducts: typeof data.metrics.totalProducts === 'number' ? data.metrics.totalProducts : prev.totalProducts,
          lastVoteAt: data.metrics.lastVoteAt || null,
          isVotingActive: ctrlData ? Boolean(ctrlData.is_voting_active) : Boolean(data.metrics.isVotingActive),
          isQrGenerationActive: ctrlData ? Boolean(ctrlData.is_qr_generation_active) : Boolean(data.metrics.isQrGenerationActive)
        }));
      }
    } catch (err) {
      console.warn('[AdminVotingManagement] Failed to fetch metrics:', err);
      if (!silent) {
        setFetchError({ status: 0, type: 'UNEXPECTED_ERROR', message: err.message || 'Failed to fetch metrics.' });
      }
    } finally {
      if (!silent) setLoadingMetrics(false);
    }
  }, [API_BASE_URL, authHeaders, notify]);

  useEffect(() => {
    fetchMetrics();
    // Non-aggressive 30-second silent background polling for live activity without page refreshes
    const timer = setInterval(() => fetchMetrics(true), 30000);
    return () => clearInterval(timer);
  }, [fetchMetrics]);

  // 2. Toggle Community Voting or QR Generation
  const handleToggleControl = async (type, nextVal) => {
    setUpdatingControls(true);
    try {
      const payload = type === 'voting'
        ? { is_voting_active: nextVal }
        : { is_qr_generation_active: nextVal };

      const result = await safeFetchJson(`${API_BASE_URL}/api/voting/admin/controls`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload)
      });
      if (result.ok && result.data?.success) {
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
        notify('error', 'Update Failed', result.message || 'Could not update control.');
      }
    } catch (err) {
      notify('error', 'Update Error', err.message);
    } finally {
      setUpdatingControls(false);
    }
  };

  // Phase 3 Shortlist Handlers (STEP 10E)
  const fetchShortlistStatus = useCallback(async () => {
    setLoadingShortlistStatus(true);
    try {
      const res = await safeFetchJson(`${API_BASE_URL}/api/admin/shortlist`, { headers: authHeaders });
      if (res.ok && res.data?.success) {
        setShortlistStatus(res.data);
      }
    } catch (err) {
      console.warn('[AdminVotingManagement] Failed to fetch shortlist status:', err);
    } finally {
      setLoadingShortlistStatus(false);
    }
  }, [API_BASE_URL, authHeaders]);

  const fetchDriveShortlistFiles = useCallback(async () => {
    setLoadingDriveFiles(true);
    try {
      const res = await safeFetchJson(`${API_BASE_URL}/api/admin/shortlist/drive/files`, { headers: authHeaders });
      if (res.ok && res.data?.success) {
        const files = res.data.files || [];
        setShortlistDriveFiles(files);
        if (files.length > 0) {
          setSelectedDriveFileId(prev => prev || files[0].file_id);
        }
      }
    } catch (err) {
      console.warn('[AdminVotingManagement] Failed to fetch Drive shortlist files:', err);
    } finally {
      setLoadingDriveFiles(false);
    }
  }, [API_BASE_URL, authHeaders]);

  useEffect(() => {
    fetchShortlistStatus();
    fetchDriveShortlistFiles();
  }, [fetchShortlistStatus, fetchDriveShortlistFiles]);

  const handlePreviewShortlist = async () => {
    setShortlistPreview(null);
    setSyncResult(null);
    setLoadingPreview(true);

    try {
      if (shortlistSourceType === 'drive') {
        if (!selectedDriveFileId) {
          notify('error', 'Selection Required', 'Please select a Google Drive file to preview.');
          return;
        }
        const res = await safeFetchJson(`${API_BASE_URL}/api/admin/shortlist/drive/preview`, {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_id: selectedDriveFileId, mode: shortlistSyncMode })
        });
        if (res.ok && res.data?.success) {
          setShortlistPreview(res.data.preview);
          if (res.data.preview?.is_valid) {
            notify('success', 'Preview Ready', `Found ${res.data.preview.valid_registrations?.length || 0} valid registrations.`);
          } else {
            notify('warning', 'Validation Issues', 'The candidate file contains validation warnings or errors.');
          }
        } else {
          notify('error', 'Preview Failed', res.message || 'Could not generate shortlist preview.');
        }
      } else {
        // Manual file upload
        if (!selectedManualFile) {
          notify('error', 'File Required', 'Please select an Excel (.xlsx, .xls) or CSV file to upload.');
          return;
        }
        const formData = new FormData();
        formData.append('file', selectedManualFile);

        const token = authHeaders.Authorization;
        const res = await fetch(`${API_BASE_URL}/api/admin/shortlist/preview?mode=${shortlistSyncMode}`, {
          method: 'POST',
          headers: token ? { Authorization: token } : {},
          body: formData
        });
        const data = await res.json();
        if (res.ok && data?.success) {
          setShortlistPreview(data.preview);
          if (data.preview?.is_valid) {
            notify('success', 'Preview Ready', `Found ${data.preview.valid_registrations?.length || 0} valid registrations.`);
          } else {
            notify('warning', 'Validation Issues', 'The uploaded file contains validation warnings or errors.');
          }
        } else {
          notify('error', 'Preview Failed', data?.message || 'Could not generate shortlist preview.');
        }
      }
    } catch (err) {
      notify('error', 'Preview Error', err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleExecuteSync = async () => {
    if (!shortlistPreview || !shortlistPreview.is_valid) {
      notify('error', 'Preview Required', 'You must run a valid preview before synchronizing the shortlist.');
      return;
    }

    if (shortlistSyncMode === 'FULL_REPLACEMENT') {
      const confirmMsg = `Are you sure you want to perform a FULL REPLACEMENT?
This will replace the active shortlist with ${shortlistPreview.valid_registrations?.length || 0} teams and remove ${shortlistPreview.to_remove || 0} teams from the shortlist.
(Historical votes are safely preserved).`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    setExecutingSync(true);
    try {
      let resData;
      if (shortlistSourceType === 'drive') {
        const res = await safeFetchJson(`${API_BASE_URL}/api/admin/shortlist/drive/sync`, {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_id: selectedDriveFileId, mode: shortlistSyncMode })
        });
        resData = res.data;
        if (!res.ok || !resData?.success) {
          throw new Error(res.message || resData?.message || 'Sync failed.');
        }
      } else {
        const formData = new FormData();
        formData.append('file', selectedManualFile);

        const token = authHeaders.Authorization;
        const res = await fetch(`${API_BASE_URL}/api/admin/shortlist/sync?mode=${shortlistSyncMode}`, {
          method: 'POST',
          headers: token ? { Authorization: token } : {},
          body: formData
        });
        resData = await res.json();
        if (!res.ok || !resData?.success) {
          throw new Error(resData?.message || 'Sync failed.');
        }
      }

      setSyncResult(resData);
      notify('success', 'Shortlist Synchronized', `Synchronized successfully: ${resData.upserted_count ?? 0} upserted, ${resData.removed_count ?? 0} removed. Total: ${resData.total_shortlisted ?? 0}`);
      fetchShortlistStatus();
      fetchMetrics(true);
    } catch (err) {
      notify('error', 'Sync Error', err.message);
    } finally {
      setExecutingSync(false);
    }
  };

  // 3. Fetch Voter Reports
  const fetchVoters = useCallback(async (query = '') => {
    setLoadingVoters(true);
    try {
      const url = `${API_BASE_URL}/api/voting/admin/voter-reports?search=${encodeURIComponent(query)}`;
      const result = await safeFetchJson(url, { headers: authHeaders });
      if (result.ok && result.data?.success) {
        setVotersList(result.data.voters || []);
      } else if (!result.ok) {
        notify('error', 'Voter Reports Error', result.message);
      }
    } catch (err) {
      console.warn('[AdminVotingManagement] Failed to load voters:', err);
      notify('error', 'Voter Reports Error', err.message);
    } finally {
      setLoadingVoters(false);
    }
  }, [API_BASE_URL, authHeaders, notify]);

  const handleSelectVoter = async (voter) => {
    setSelectedVoter(voter);
    setLoadingVoterDetail(true);
    try {
      const result = await safeFetchJson(`${API_BASE_URL}/api/voting/admin/voter-reports?voter_id=${encodeURIComponent(voter.userId)}`, { headers: authHeaders });
      if (result.ok && result.data?.success && result.data?.voter) {
        setSelectedVoter(result.data.voter);
      } else if (!result.ok) {
        notify('error', 'Voter Detail Error', result.message);
      }
    } catch (err) {
      console.warn('[AdminVotingManagement] Failed to fetch voter detail:', err);
      notify('error', 'Voter Detail Error', err.message);
    } finally {
      setLoadingVoterDetail(false);
    }
  };

  // 4. Fetch Team Reports
  const fetchTeams = useCallback(async (query = '', dept = 'All Departments') => {
    setLoadingTeams(true);
    try {
      const deptParam = dept === 'All Departments' ? '' : dept;
      const url = `${API_BASE_URL}/api/voting/admin/team-reports?search=${encodeURIComponent(query)}&department=${encodeURIComponent(deptParam)}`;
      const result = await safeFetchJson(url, { headers: authHeaders });
      if (result.ok && result.data?.success) {
        setTeamsList(result.data.teams || []);
      } else if (!result.ok) {
        notify('error', 'Team Reports Error', result.message);
      }
    } catch (err) {
      console.warn('[AdminVotingManagement] Failed to load teams:', err);
      notify('error', 'Team Reports Error', err.message);
    } finally {
      setLoadingTeams(false);
    }
  }, [API_BASE_URL, authHeaders, notify]);

  const handleSelectTeam = async (team) => {
    setSelectedTeam(team);
    setSelectedTeamVoterPage(1);
    setLoadingTeamDetail(true);
    try {
      const result = await safeFetchJson(`${API_BASE_URL}/api/voting/admin/team-reports?team_id=${encodeURIComponent(team.id)}`, { headers: authHeaders });
      if (result.ok && result.data?.success && result.data?.team) {
        setSelectedTeam(result.data.team);
      } else if (!result.ok) {
        notify('error', 'Team Detail Error', result.message);
      }
    } catch (err) {
      console.warn('[AdminVotingManagement] Failed to fetch team detail:', err);
      notify('error', 'Team Detail Error', err.message);
    } finally {
      setLoadingTeamDetail(false);
    }
  };


  // 5b. Fetch Engagement Analytics
  const fetchAnalytics = useCallback(async (overrideRange) => {
    setLoadingAnalytics(true);
    const range = overrideRange || analyticsDateRange;
    try {
      const [ovResult, ideasResult] = await Promise.all([
        safeFetchJson(`${API_BASE_URL}/api/admin/analytics/overview?range=${range}`, { headers: authHeaders }),
        safeFetchJson(`${API_BASE_URL}/api/admin/analytics/ideas`, { headers: authHeaders })
      ]);
      if (ovResult.ok && ovResult.data?.metrics) {
        setAnalyticsMetrics(ovResult.data.metrics);
        setDailyVisits(ovResult.data.daily_visits || []);
        setAuthenticatedVisitors(ovResult.data.authenticated_visitors || []);
      }
      if (ideasResult.ok && ideasResult.data?.ideas) {
        setAnalyticsIdeas(ideasResult.data.ideas);
      }
    } catch (err) {
      console.warn('[AdminVotingManagement] Failed to fetch analytics:', err);
      notify('error', 'Analytics Load Error', err.message);
    } finally {
      setLoadingAnalytics(false);
    }
  }, [API_BASE_URL, authHeaders, notify, analyticsDateRange]);

  // Handle Export Analytics CSV
  const handleExportAnalyticsCsv = async () => {
    setExportingAnalytics(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/analytics/export?range=${analyticsDateRange}`, { headers: authHeaders });
      if (!res.ok) throw new Error(`Export failed with status ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ipl2026_engagement_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify('success', 'Export Ready', 'Downloaded engagement analytics CSV report.');
    } catch (err) {
      notify('error', 'Export Failed', err.message);
    } finally {
      setExportingAnalytics(false);
    }
  };

  // Handle Export Analytics XLSX
  const handleExportAnalyticsXlsx = async () => {
    setExportingAnalyticsXlsx(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/analytics/export.xlsx?range=${analyticsDateRange}`, { headers: authHeaders });
      if (!res.ok) throw new Error(`Excel export failed with status ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IPL_2026_Website_Analytics_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify('success', 'Excel Export Ready', 'Downloaded IPL_2026_Website_Analytics.xlsx');
    } catch (err) {
      notify('error', 'Excel Export Failed', err.message);
    } finally {
      setExportingAnalyticsXlsx(false);
    }
  };

  const filteredAnalyticsIdeas = useMemo(() => {
    if (!analyticsSearchQuery.trim()) return analyticsIdeas;
    const q = analyticsSearchQuery.toLowerCase();
    return analyticsIdeas.filter(i =>
      i.product_title?.toLowerCase().includes(q) ||
      i.team_name?.toLowerCase().includes(q) ||
      i.registration_id?.toLowerCase().includes(q)
    );
  }, [analyticsIdeas, analyticsSearchQuery]);

  // ==============================================================
  // VOTER REPORTS: FILTER, SORT & PAGINATION (ADMIN ONLY)
  // ==============================================================
  const VOTERS_PER_PAGE = 20;

  // Reset voter pagination when search, filter, or sort changes
  useEffect(() => {
    setVoterCurrentPage(1);
  }, [voterSearchQuery, voterDeptFilter, voterActivityFilter, voterSortBy, voterSortOrder]);

  const filteredAndSortedVoters = useMemo(() => {
    let list = [...votersList];

    // 1. Search filter
    if (voterSearchQuery && voterSearchQuery.trim()) {
      const q = voterSearchQuery.trim().toLowerCase();
      list = list.filter(v =>
        (v.name || '').toLowerCase().includes(q) ||
        (v.email || '').toLowerCase().includes(q) ||
        (v.department || '').toLowerCase().includes(q) ||
        (v.userId || '').toLowerCase().includes(q)
      );
    }

    // 2. Department filter
    if (voterDeptFilter && voterDeptFilter !== 'All Departments') {
      const dNorm = voterDeptFilter.trim().toLowerCase();
      list = list.filter(v => (v.department || '').toLowerCase().includes(dNorm));
    }

    // 3. Vote activity filter
    if (voterActivityFilter === 'multiple') {
      list = list.filter(v => (v.totalVotes || 0) > 1);
    } else if (voterActivityFilter === 'single') {
      list = list.filter(v => (v.totalVotes || 0) === 1);
    }

    // 4. Sorting (authoritative numeric / alphabetical comparison)
    list.sort((a, b) => {
      let diff = 0;
      if (voterSortBy === 'votes') {
        diff = (b.totalVotes || 0) - (a.totalVotes || 0);
      } else if (voterSortBy === 'name') {
        diff = (a.name || '').localeCompare(b.name || '');
      } else if (voterSortBy === 'email') {
        diff = (a.email || '').localeCompare(b.email || '');
      } else if (voterSortBy === 'date') {
        const dateA = a.latestVoteAt || a.history?.[0]?.votedAt || 0;
        const dateB = b.latestVoteAt || b.history?.[0]?.votedAt || 0;
        diff = new Date(dateB).getTime() - new Date(dateA).getTime();
      }
      return voterSortOrder === 'asc' ? -diff : diff;
    });

    return list;
  }, [votersList, voterSearchQuery, voterDeptFilter, voterActivityFilter, voterSortBy, voterSortOrder]);

  const totalVotersCount = filteredAndSortedVoters.length;
  const totalVoterPages = Math.max(1, Math.ceil(totalVotersCount / VOTERS_PER_PAGE));
  const safeVoterCurrentPage = Math.min(Math.max(1, voterCurrentPage), totalVoterPages);

  const paginatedVoters = useMemo(() => {
    const start = (safeVoterCurrentPage - 1) * VOTERS_PER_PAGE;
    return filteredAndSortedVoters.slice(start, start + VOTERS_PER_PAGE);
  }, [filteredAndSortedVoters, safeVoterCurrentPage]);

  const voterStartIndexDisplay = totalVotersCount === 0 ? 0 : (safeVoterCurrentPage - 1) * VOTERS_PER_PAGE + 1;
  const voterEndIndexDisplay = Math.min(safeVoterCurrentPage * VOTERS_PER_PAGE, totalVotersCount);

  // ==============================================================
  // PRODUCT / TEAM REPORTS: FILTER, SORT & PAGINATION (ADMIN ONLY)
  // ==============================================================
  const TEAMS_PER_PAGE = 20;

  // Reset team and voter pagination when search, filter, or sort changes
  useEffect(() => {
    setTeamCurrentPage(1);
    setSelectedTeamVoterPage(1);
  }, [teamSearchQuery, teamDeptFilter, teamProductTypeFilter, teamShortlistFilter, teamVotingStatusFilter, teamSortBy, teamSortOrder]);

  const filteredAndSortedTeams = useMemo(() => {
    let list = [...teamsList];

    // 1. Search
    if (teamSearchQuery && teamSearchQuery.trim()) {
      const q = teamSearchQuery.trim().toLowerCase();
      list = list.filter(t =>
        (t.teamName || '').toLowerCase().includes(q) ||
        (t.registrationId || '').toLowerCase().includes(q) ||
        (t.id || '').toLowerCase().includes(q) ||
        (t.department || '').toLowerCase().includes(q) ||
        (t.products || []).some(p =>
          (p.productTitle || '').toLowerCase().includes(q) ||
          (p.productId || '').toLowerCase().includes(q)
        )
      );
    }

    // 2. Department filter
    if (teamDeptFilter && teamDeptFilter !== 'All Departments') {
      const dNorm = teamDeptFilter.trim().toLowerCase();
      list = list.filter(t => (t.department || '').toLowerCase().includes(dNorm));
    }

    // 3. Product Type filter (Order: Search -> Department -> Product Type -> Team -> Voting -> Sort -> Pagination)
    if (teamProductTypeFilter === 'hardware') {
      list = list.map(t => {
        const matchingProds = (t.products || []).filter(p => {
          const type = (p.productType || '').trim().toLowerCase();
          const cat = (p.shortlistCategory || '').trim().toLowerCase();
          return type === 'hardware' || type === 'hw' || type.includes('hardware') || type.includes('hw & sw') ||
                 cat === 'hw' || cat.includes('hardware');
        });
        if (matchingProds.length === 0) return null;
        return { ...t, products: matchingProds };
      }).filter(Boolean);
    } else if (teamProductTypeFilter === 'software') {
      list = list.map(t => {
        const matchingProds = (t.products || []).filter(p => {
          const type = (p.productType || '').trim().toLowerCase();
          const cat = (p.shortlistCategory || '').trim().toLowerCase();
          return type === 'software' || type === 'sw' || type.includes('software') || type.includes('hw & sw') ||
                 cat === 'sw' || cat.includes('software');
        });
        if (matchingProds.length === 0) return null;
        return { ...t, products: matchingProds };
      }).filter(Boolean);
    }

    // 4. Shortlist filter
    if (teamShortlistFilter === 'shortlisted') {
      list = list.filter(t => t.isShortlisted);
    } else if (teamShortlistFilter === 'non_shortlisted') {
      list = list.filter(t => !t.isShortlisted);
    }

    // 5. Voting status filter
    if (teamVotingStatusFilter === 'with_votes') {
      list = list.filter(t => (t.totalVotes || 0) > 0);
    } else if (teamVotingStatusFilter === 'zero_votes') {
      list = list.filter(t => (t.totalVotes || 0) === 0);
    }

    // 6. Sorting (numeric for votes/score, alphabetical for names/titles)
    list.sort((a, b) => {
      let diff = 0;
      if (teamSortBy === 'votes') {
        diff = (b.totalVotes || 0) - (a.totalVotes || 0);
      } else if (teamSortBy === 'score') {
        diff = (b.score ?? (b.totalVotes || 0) * 2) - (a.score ?? (a.totalVotes || 0) * 2);
      } else if (teamSortBy === 'team_name') {
        diff = (a.teamName || '').localeCompare(b.teamName || '');
      } else if (teamSortBy === 'product_title') {
        const prodA = a.products?.[0]?.productTitle || '';
        const prodB = b.products?.[0]?.productTitle || '';
        diff = prodA.localeCompare(prodB);
      } else if (teamSortBy === 'registration_id') {
        diff = (a.registrationId || '').localeCompare(b.registrationId || '', undefined, { numeric: true });
      }
      return teamSortOrder === 'asc' ? -diff : diff;
    });

    return list;
  }, [teamsList, teamSearchQuery, teamDeptFilter, teamProductTypeFilter, teamShortlistFilter, teamVotingStatusFilter, teamSortBy, teamSortOrder]);

  const totalTeamsCount = filteredAndSortedTeams.length;
  const totalTeamPages = Math.max(1, Math.ceil(totalTeamsCount / TEAMS_PER_PAGE));
  const safeTeamCurrentPage = Math.min(Math.max(1, teamCurrentPage), totalTeamPages);

  const paginatedTeams = useMemo(() => {
    const start = (safeTeamCurrentPage - 1) * TEAMS_PER_PAGE;
    return filteredAndSortedTeams.slice(start, start + TEAMS_PER_PAGE);
  }, [filteredAndSortedTeams, safeTeamCurrentPage]);

  const teamStartIndexDisplay = totalTeamsCount === 0 ? 0 : (safeTeamCurrentPage - 1) * TEAMS_PER_PAGE + 1;
  const teamEndIndexDisplay = Math.min(safeTeamCurrentPage * TEAMS_PER_PAGE, totalTeamsCount);

  // ==============================================================
  // SELECTED TEAM: VOTER PAGINATION (ADMIN ONLY)
  // ==============================================================
  const TEAM_VOTERS_PER_PAGE = 20;

  const selectedTeamVoters = useMemo(() => {
    return selectedTeam?.voters || [];
  }, [selectedTeam]);

  const selectedTeamTotalVoters = selectedTeamVoters.length;
  const totalTeamVoterPages = Math.max(1, Math.ceil(selectedTeamTotalVoters / TEAM_VOTERS_PER_PAGE));
  const safeTeamVoterPage = Math.min(Math.max(1, selectedTeamVoterPage), totalTeamVoterPages);

  const paginatedTeamVoters = useMemo(() => {
    const start = (safeTeamVoterPage - 1) * TEAM_VOTERS_PER_PAGE;
    return selectedTeamVoters.slice(start, start + TEAM_VOTERS_PER_PAGE);
  }, [selectedTeamVoters, safeTeamVoterPage]);

  const teamVoterStartIndexDisplay = selectedTeamTotalVoters === 0 ? 0 : (safeTeamVoterPage - 1) * TEAM_VOTERS_PER_PAGE + 1;
  const teamVoterEndIndexDisplay = Math.min(safeTeamVoterPage * TEAM_VOTERS_PER_PAGE, selectedTeamTotalVoters);

  // Sync selectedTeam with filtered list; deselect if no longer present
  useEffect(() => {
    if (selectedTeam) {
      const match = filteredAndSortedTeams.find(t => t.id === selectedTeam.id);
      if (!match) {
        setSelectedTeam(null);
        setSelectedTeamVoterPage(1);
      }
    }
  }, [filteredAndSortedTeams, selectedTeam]);

  // ==============================================================
  // FIELD-SELECTIVE EXPORT STATE & HANDLERS (ADMIN ONLY)
  // ==============================================================
  const [isVoterExportModalOpen, setIsVoterExportModalOpen] = useState(false);
  const [selectedVoterExportFields, setSelectedVoterExportFields] = useState(() => {
    const s = new Set();
    VOTER_EXPORT_FIELDS.forEach(g => {
      g.fields.forEach(f => {
        if (f.defaultChecked) s.add(f.key);
      });
    });
    return s;
  });

  const [isTeamExportModalOpen, setIsTeamExportModalOpen] = useState(false);
  const [selectedTeamExportFields, setSelectedTeamExportFields] = useState(() => {
    const s = new Set();
    TEAM_EXPORT_FIELDS.forEach(g => {
      g.fields.forEach(f => {
        if (f.defaultChecked) s.add(f.key);
      });
    });
    return s;
  });

  // Calculate projected exported rows for Voter Reports
  const hasVoterDetailsSelected = useMemo(() => {
    const voteDetailKeys = new Set(VOTER_EXPORT_FIELDS[1].fields.map(f => f.key));
    return Array.from(selectedVoterExportFields).some(k => voteDetailKeys.has(k));
  }, [selectedVoterExportFields]);

  const totalVoterExportRowsCount = useMemo(() => {
    if (filteredAndSortedVoters.length === 0) return 0;
    if (!hasVoterDetailsSelected) return filteredAndSortedVoters.length;
    return filteredAndSortedVoters.reduce((sum, v) => {
      const histCount = v.history && v.history.length > 0 ? v.history.length : 1;
      return sum + histCount;
    }, 0);
  }, [filteredAndSortedVoters, hasVoterDetailsSelected]);

  // Calculate projected exported rows for Product/Team Reports
  const totalTeamExportRowsCount = useMemo(() => {
    if (filteredAndSortedTeams.length === 0) return 0;
    return filteredAndSortedTeams.reduce((sum, t) => {
      const prodCount = t.products && t.products.length > 0 ? t.products.length : 1;
      return sum + prodCount;
    }, 0);
  }, [filteredAndSortedTeams]);

  // Voter Export Handlers
  const handleOpenVoterExportModal = () => {
    setIsVoterExportModalOpen(true);
  };

  const handleToggleVoterField = (key) => {
    setSelectedVoterExportFields(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAllVoterFields = () => {
    const all = new Set();
    VOTER_EXPORT_FIELDS.forEach(g => g.fields.forEach(f => all.add(f.key)));
    setSelectedVoterExportFields(all);
  };

  const handleClearAllVoterFields = () => {
    setSelectedVoterExportFields(new Set());
  };

  const handleDownloadVoterExcel = () => {
    if (selectedVoterExportFields.size === 0 || filteredAndSortedVoters.length === 0) return;

    // Determine canonical selected fields in catalog order
    const orderedCols = [];
    VOTER_EXPORT_FIELDS.forEach(g => {
      g.fields.forEach(f => {
        if (selectedVoterExportFields.has(f.key)) orderedCols.push(f);
      });
    });
    if (orderedCols.length === 0) return;

    const headers = orderedCols.map(c => c.label);
    const colWidths = orderedCols.map(c => c.width || 20);

    const voteDetailKeys = new Set(VOTER_EXPORT_FIELDS[1].fields.map(f => f.key));
    const hasVoteDetails = orderedCols.some(c => voteDetailKeys.has(c.key));

    const rows = [];
    filteredAndSortedVoters.forEach(v => {
      if (hasVoteDetails) {
        if (v.history && v.history.length > 0) {
          v.history.forEach(h => {
            const row = orderedCols.map(col => {
              switch (col.key) {
                case 'voterName': return v.name || 'N/A';
                case 'voterEmail': return v.email || 'N/A';
                case 'voterDepartment': return v.department || 'N/A';
                case 'voterUserId': return v.userId || 'N/A';
                case 'totalVotes': return Number(v.totalVotes || 0);
                case 'voteId': return h.voteId || 'N/A';
                case 'teamId': return h.teamId || 'N/A';
                case 'teamName': return h.teamName || 'Unknown Team';
                case 'teamDepartment': return h.teamDepartment || 'N/A';
                case 'productTitle': return h.productTitle || 'Project Showcase';
                case 'productId': return h.productId || 'N/A';
                case 'votedAt': return h.votedAt ? new Date(h.votedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A';
                default: return '';
              }
            });
            rows.push(row);
          });
        } else {
          const row = orderedCols.map(col => {
            switch (col.key) {
              case 'voterName': return v.name || 'N/A';
              case 'voterEmail': return v.email || 'N/A';
              case 'voterDepartment': return v.department || 'N/A';
              case 'voterUserId': return v.userId || 'N/A';
              case 'totalVotes': return Number(v.totalVotes || 0);
              case 'voteId': return 'N/A';
              case 'teamId': return 'N/A';
              case 'teamName': return 'N/A';
              case 'teamDepartment': return 'N/A';
              case 'productTitle': return 'N/A';
              case 'productId': return 'N/A';
              case 'votedAt': return 'N/A';
              default: return '';
            }
          });
          rows.push(row);
        }
      } else {
        const row = orderedCols.map(col => {
          switch (col.key) {
            case 'voterName': return v.name || 'N/A';
            case 'voterEmail': return v.email || 'N/A';
            case 'voterDepartment': return v.department || 'N/A';
            case 'voterUserId': return v.userId || 'N/A';
            case 'totalVotes': return Number(v.totalVotes || 0);
            default: return '';
          }
        });
        rows.push(row);
      }
    });

    const isFiltered = !!(voterSearchQuery.trim() || (voterDeptFilter && voterDeptFilter !== 'All Departments') || voterActivityFilter !== 'all');
    const filename = isFiltered ? 'IPL_2026_Voter_Report_Filtered.xlsx' : 'IPL_2026_Voter_Report.xlsx';

    exportToRealXlsx({
      filename,
      sheetName: 'Voter Report',
      headers,
      rows,
      colWidths
    });

    setIsVoterExportModalOpen(false);
    notify('success', 'Excel Export Ready', `Downloaded ${filename} (${rows.length} rows, ${filteredAndSortedVoters.length} voters).`);
  };

  // Team Export Handlers
  const handleOpenTeamExportModal = () => {
    setIsTeamExportModalOpen(true);
  };

  const handleToggleTeamField = (key) => {
    setSelectedTeamExportFields(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAllTeamFields = () => {
    const all = new Set();
    TEAM_EXPORT_FIELDS.forEach(g => g.fields.forEach(f => all.add(f.key)));
    setSelectedTeamExportFields(all);
  };

  const handleClearAllTeamFields = () => {
    setSelectedTeamExportFields(new Set());
  };

  const handleDownloadTeamExcel = () => {
    if (selectedTeamExportFields.size === 0 || filteredAndSortedTeams.length === 0) return;

    const orderedCols = [];
    TEAM_EXPORT_FIELDS.forEach(g => {
      g.fields.forEach(f => {
        if (selectedTeamExportFields.has(f.key)) orderedCols.push(f);
      });
    });
    if (orderedCols.length === 0) return;

    const headers = orderedCols.map(c => c.label);
    const colWidths = orderedCols.map(c => c.width || 20);

    const rows = [];
    filteredAndSortedTeams.forEach(t => {
      const prods = (t.products && t.products.length > 0) ? t.products : [{
        productId: null,
        productTitle: 'Project Showcase',
        innovationDomain: 'Open Innovation',
        productVotes: t.totalVotes || 0,
        score: (t.totalVotes || 0) * 2
      }];

      prods.forEach(p => {
        const row = orderedCols.map(col => {
          switch (col.key) {
            case 'registrationId': return t.registrationId || 'N/A';
            case 'teamName': return t.teamName || 'N/A';
            case 'department': return t.department || 'N/A';
            case 'teamId': return t.id || 'N/A';
            case 'productTitle': return p.productTitle || 'Project Showcase';
            case 'productType': return p.productType || 'N/A';
            case 'innovationDomain': return p.innovationDomain || 'Open Innovation';
            case 'productId': return p.productId || 'N/A';
            case 'productVotes': return Number(p.productVotes || 0);
            case 'productScore': return Number(p.score ?? ((p.productVotes || 0) * 2));
            case 'totalVotes': return Number(t.totalVotes || 0);
            case 'score': return Number(t.score ?? ((t.totalVotes || 0) * 2));
            case 'isShortlisted': return t.isShortlisted ? 'Shortlisted' : 'Not Shortlisted';
            case 'shortlistCategory': return t.shortlistCategory || (t.isShortlisted ? 'Finalist' : 'N/A');
            default: return '';
          }
        });
        rows.push(row);
      });
    });

    const isFiltered = !!(teamSearchQuery.trim() || (teamDeptFilter && teamDeptFilter !== 'All Departments') || teamProductTypeFilter !== 'all' || teamShortlistFilter !== 'all' || teamVotingStatusFilter !== 'all');
    const filename = isFiltered ? 'IPL_2026_Product_Team_Report_Filtered.xlsx' : 'IPL_2026_Product_Team_Report.xlsx';

    exportToRealXlsx({
      filename,
      sheetName: 'Product Team Report',
      headers,
      rows,
      colWidths
    });

    setIsTeamExportModalOpen(false);
    notify('success', 'Excel Export Ready', `Downloaded ${filename} (${rows.length} product rows, ${filteredAndSortedTeams.length} teams).`);
  };

  // Load sub-page data on tab change
  useEffect(() => {
    if (subTab === 'analytics') {
      fetchAnalytics();
    } else if (subTab === 'voter_reports') {
      fetchVoters();
    } else if (subTab === 'team_reports') {
      fetchTeams();
    }
  }, [subTab, fetchAnalytics, fetchVoters, fetchTeams]);

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
          {/* Error Banner if API failed */}
          {fetchError && (
            <div className="rounded-2xl border border-red-200 bg-red-50/90 p-4 text-red-800 flex items-start justify-between gap-3 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
                <div className="text-xs sm:text-sm">
                  <p className="font-bold">Unable to load live voting metrics</p>
                  <p className="text-red-700 mt-0.5">{fetchError.message}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => fetchMetrics()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-900 transition shrink-0 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Live Monitoring 4 Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">Total Votes Recorded</span>
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
                  When <strong>OPEN</strong>, authenticated students can scan QR codes and submit votes. When <strong>CLOSED</strong>, voting submissions are paused.
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

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Registered</span>
                <p className="text-xl sm:text-2xl font-black text-[#0B1B3A]">{metrics.totalRegisteredTeams}</p>
                <p className="text-[10px] text-slate-400">Raw registration forms</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Eligible Teams</span>
                <p className="text-xl sm:text-2xl font-black text-[#0B1B3A]">{metrics.totalEligibleTeams}</p>
                <p className="text-[10px] text-slate-400">Distinct normalized teams</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Products / Ideas</span>
                <p className="text-xl sm:text-2xl font-black text-[#0B1B3A]">{metrics.totalProducts}</p>
                <p className="text-[10px] text-slate-400">Active project submissions</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Teams With Votes</span>
                <p className="text-xl sm:text-2xl font-black text-[#0B1B3A]">{metrics.teamsWithVotes}</p>
                <p className="text-[10px] text-slate-400">Teams received &ge; 1 vote</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1 col-span-2 sm:col-span-1">
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

          {/* Phase 3 Shortlist Management Card (STEP 10E) */}
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet size={18} className="text-primary" /> Phase 3 Shortlist Source
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Manage authoritative shortlist entries for Phase 3 public leaderboard and voting eligibility.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Authoritative Registry:</span>
                <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 ring-1 ring-blue-600/20 flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-blue-600" />
                  {loadingShortlistStatus ? (
                    <RefreshCw size={11} className="animate-spin" />
                  ) : (
                    `${shortlistStatus?.total_shortlisted ?? 0} Shortlisted`
                  )}
                  {shortlistStatus?.category_breakdown && (
                    <span className="font-semibold text-blue-600/80 text-[11px]">
                      (HW: {shortlistStatus.category_breakdown.hardware}, SW: {shortlistStatus.category_breakdown.software})
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={fetchShortlistStatus}
                  title="Refresh Shortlist Status"
                  disabled={loadingShortlistStatus}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  <RefreshCw size={13} className={loadingShortlistStatus ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Source Selection Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-fit">
                <button
                  type="button"
                  onClick={() => {
                    setShortlistSourceType('drive');
                    setShortlistPreview(null);
                    setSyncResult(null);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                    shortlistSourceType === 'drive'
                      ? 'bg-white text-primary shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <HardDrive size={14} />
                  <span>Google Drive</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShortlistSourceType('manual');
                    setShortlistPreview(null);
                    setSyncResult(null);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                    shortlistSourceType === 'manual'
                      ? 'bg-white text-primary shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Upload size={14} />
                  <span>Manual Upload</span>
                </button>
              </div>

              {/* Synchronization Mode Selector */}
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
                <span className="font-bold text-slate-700">Sync Mode:</span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                  <input
                    type="radio"
                    name="shortlistSyncMode"
                    value="INCREMENTAL"
                    checked={shortlistSyncMode === 'INCREMENTAL'}
                    onChange={(e) => {
                      setShortlistSyncMode(e.target.value);
                      setShortlistPreview(null);
                      setSyncResult(null);
                    }}
                    className="text-primary focus:ring-primary h-3.5 w-3.5"
                  />
                  <span>Incremental</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                  <input
                    type="radio"
                    name="shortlistSyncMode"
                    value="FULL_REPLACEMENT"
                    checked={shortlistSyncMode === 'FULL_REPLACEMENT'}
                    onChange={(e) => {
                      setShortlistSyncMode(e.target.value);
                      setShortlistPreview(null);
                      setSyncResult(null);
                    }}
                    className="text-primary focus:ring-primary h-3.5 w-3.5"
                  />
                  <span>Full Replacement</span>
                </label>
              </div>
            </div>

            {/* Source Input Area */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
              {shortlistSourceType === 'drive' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <HardDrive size={14} className="text-primary" /> Select Shortlist File from Google Drive:
                    </label>
                    <button
                      type="button"
                      onClick={fetchDriveShortlistFiles}
                      disabled={loadingDriveFiles}
                      className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={11} className={loadingDriveFiles ? 'animate-spin' : ''} />
                      <span>{loadingDriveFiles ? 'Scanning Drive...' : 'Refresh Drive Files'}</span>
                    </button>
                  </div>

                  {shortlistDriveFiles.length === 0 ? (
                    <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                      <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">No candidate shortlist spreadsheets found in Google Drive root folder.</p>
                        <p className="text-[11px] text-amber-700 mt-0.5">
                          Ensure an Excel (.xlsx, .xls) or Google Sheet is located in your configured IPL Drive root or subfolders, or switch to <strong>Manual Upload</strong> above.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <select
                        value={selectedDriveFileId}
                        onChange={(e) => {
                          setSelectedDriveFileId(e.target.value);
                          setShortlistPreview(null);
                          setSyncResult(null);
                        }}
                        className="w-full text-xs font-semibold p-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
                      >
                        {shortlistDriveFiles.map((file) => (
                          <option key={file.file_id} value={file.file_id}>
                            {file.name} {file.size ? `(${(file.size / 1024).toFixed(1)} KB)` : ''} {file.modified_time ? `— ${new Date(file.modified_time).toLocaleDateString()}` : ''}
                          </option>
                        ))}
                      </select>

                      {/* File Details Bar */}
                      {(() => {
                        const activeFile = shortlistDriveFiles.find(f => f.file_id === selectedDriveFileId);
                        if (!activeFile) return null;
                        return (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 px-1">
                            <span>
                              <strong>Modified:</strong> {activeFile.modified_time ? new Date(activeFile.modified_time).toLocaleString() : 'Unknown'}
                              {activeFile.size ? ` • Size: ${(activeFile.size / 1024).toFixed(1)} KB` : ''}
                            </span>
                            {activeFile.web_view_link && (
                              <a
                                href={activeFile.web_view_link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline flex items-center gap-1 font-semibold"
                              >
                                <span>Open in Google Drive</span>
                                <ExternalLink size={11} />
                              </a>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                /* Manual Upload Area */
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Upload size={14} className="text-primary" /> Select Shortlist Excel or CSV from Device:
                  </label>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setSelectedManualFile(file);
                      setShortlistPreview(null);
                      setSyncResult(null);
                    }}
                    className="w-full text-xs text-slate-700 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary file:text-white hover:file:bg-primary/90 cursor-pointer"
                  />
                  <p className="text-[11px] text-slate-400">
                    Supports .xlsx, .xls, and .csv files (up to 15MB). Dynamically resolves Registration ID columns across sheets.
                  </p>
                </div>
              )}

              {/* Mode Explanation Notice */}
              <div className="text-[11px] text-slate-600 bg-white p-3 rounded-lg border border-slate-200">
                {shortlistSyncMode === 'INCREMENTAL' ? (
                  <span>
                    <strong>Incremental Mode:</strong> Adds new shortlisted teams and updates existing mappings. Teams not in this file will <strong>remain</strong> in the shortlist.
                  </span>
                ) : (
                  <span className="text-amber-800">
                    <strong>Full Replacement Mode:</strong> Authoritatively replaces the shortlist. Only teams present in this file will remain shortlisted. Teams omitted will be removed from the shortlist. (Historical votes are safely preserved).
                  </span>
                )}
              </div>
            </div>

            {/* Action Bar: Preview & Sync Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handlePreviewShortlist}
                disabled={loadingPreview || executingSync || (shortlistSourceType === 'drive' ? !selectedDriveFileId : !selectedManualFile)}
                className="py-2.5 px-4 rounded-xl text-xs font-extrabold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition cursor-pointer flex items-center gap-2 shadow-xs disabled:opacity-50"
              >
                <Eye size={15} className="text-primary" />
                <span>{loadingPreview ? 'Generating Preview...' : 'Preview Shortlist'}</span>
              </button>

              <button
                type="button"
                onClick={handleExecuteSync}
                disabled={!shortlistPreview || !shortlistPreview.is_valid || executingSync || loadingPreview}
                className="py-2.5 px-5 rounded-xl text-xs font-extrabold text-white bg-primary hover:bg-primary/90 transition cursor-pointer flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                <CheckCircle2 size={15} />
                <span>
                  {executingSync
                    ? 'Synchronizing Shortlist...'
                    : shortlistSyncMode === 'FULL_REPLACEMENT'
                    ? 'Execute Full Replacement'
                    : 'Execute Incremental Sync'}
                </span>
              </button>
            </div>

            {/* Preview Results Display */}
            {shortlistPreview && (
              <div className="rounded-xl border p-4 space-y-3 bg-slate-50/50">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Preview Results:</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                      shortlistPreview.is_valid
                        ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-600/20'
                        : 'bg-rose-100 text-rose-800 ring-1 ring-rose-600/20'
                    }`}>
                      {shortlistPreview.is_valid ? 'Validation Passed — Ready to Sync' : 'Blocking Errors Detected'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-semibold">Mode: {shortlistPreview.mode}</span>
                </div>

                {/* Preview Metric Badges */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Rows Selected</span>
                    <p className="text-lg font-black text-slate-900">{shortlistPreview.rows_selected ?? shortlistPreview.total_rows_detected ?? 0}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
                    <span className="text-[10px] uppercase font-bold text-emerald-600">Valid Teams</span>
                    <p className="text-lg font-black text-emerald-700">{shortlistPreview.valid_registrations?.length ?? 0}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
                    <span className="text-[10px] uppercase font-bold text-blue-600">New Teams</span>
                    <p className="text-lg font-black text-blue-700">{shortlistPreview.new_teams ?? 0}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Already Shortlisted</span>
                    <p className="text-lg font-black text-slate-700">{shortlistPreview.existing_shortlisted_teams ?? 0}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
                    <span className="text-[10px] uppercase font-bold text-rose-500">Duplicates Blocked</span>
                    <p className="text-lg font-black text-rose-700">{shortlistPreview.duplicates?.length ?? 0}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
                    <span className="text-[10px] uppercase font-bold text-amber-600">To Remove</span>
                    <p className="text-lg font-black text-amber-700">{shortlistPreview.to_remove ?? 0}</p>
                  </div>
                </div>

                {/* Ignored Section Note Rows Banner */}
                {shortlistPreview.ignored_rows_count > 0 && (
                  <div className="text-[11px] text-slate-600 bg-slate-100/90 px-3 py-2 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-800">
                        {shortlistPreview.physical_rows_detected || (shortlistPreview.total_rows_detected + shortlistPreview.ignored_rows_count)} physical workbook rows detected:
                      </span>
                      <span>
                        {shortlistPreview.ignored_rows_count} section-note row ({shortlistPreview.ignored_note_rows?.[0]?.raw_id || '10 Teams from SIH'}) safely ignored before validation.
                      </span>
                    </div>
                    <span className="font-extrabold text-emerald-700 whitespace-nowrap">
                      {shortlistPreview.valid_registrations?.length ?? 90} Valid Finalist Teams
                    </span>
                  </div>
                )}

                {/* Validation Errors / Warnings List */}
                {!shortlistPreview.is_valid && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1.5 text-xs text-rose-800 max-h-48 overflow-y-auto">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertCircle size={14} className="text-rose-600 shrink-0" />
                      <span>The following blocking issues must be resolved before synchronizing:</span>
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-700 pl-1">
                      {shortlistPreview.duplicates?.map((dup, i) => (
                        <li key={`dup-${i}`}>
                          {dup.product_title ? (
                            <>Duplicate Product: <strong>{dup.product_title}</strong> ({dup.registration_id}) — sheet: {dup.sheet}, row: {dup.rowNumber || dup.row_number}</>
                          ) : (
                            <>Duplicate Entry: <strong>{dup.registration_id}</strong> (sheet: {dup.sheet}, row: {dup.rowNumber || dup.row_number})</>
                          )}
                        </li>
                      ))}
                      {shortlistPreview.missing_registration_ids?.map((m, i) => (
                        <li key={`m-${i}`}>Unregistered ID: <strong>{m.registration_id}</strong> (sheet: {m.sheet}, row: {m.rowNumber || m.row_number})</li>
                      ))}
                      {shortlistPreview.ambiguous_products?.map((a, i) => (
                        <li key={`a-${i}`}>Ambiguous Multi-Product: <strong>{a.registration_id}</strong> ({a.error || `Product #${a.product_number}: ${a.product_title}`})</li>
                      ))}
                      {shortlistPreview.invalid_format_ids?.map((inv, i) => (
                        <li key={`inv-${i}`}>Invalid Format: <strong>{inv.rawId || inv.raw_id}</strong> — {inv.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Sync Execution Result Banner */}
            {syncResult && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold">Phase 3 Shortlist Synchronized Successfully</p>
                  <p className="text-[11px] text-emerald-700">
                    Source: <strong>{syncResult.source === 'google_drive' ? 'Google Drive' : 'Manual Upload'}</strong> • Mode: <strong>{syncResult.mode}</strong> • Upserted: <strong>{syncResult.upserted_count ?? 0}</strong> • Removed: <strong>{syncResult.removed_count ?? 0}</strong> • Total Active Shortlist: <strong>{syncResult.total_shortlisted ?? 0}</strong>. Public leaderboard and voting authorization updated.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-PAGE: ENGAGEMENT ANALYTICS                                */}
      {/* ============================================================== */}
      {/* ============================================================== */}
      {/* SUB-PAGE: ENGAGEMENT & WEBSITE VISITOR ANALYTICS               */}
      {/* ============================================================== */}
      {subTab === 'analytics' && (
        <div className="space-y-6">
          {/* Top Control Bar: Date Range Filter + Action Buttons */}
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Filter size={14} className="text-primary" /> Range:
              </span>
              <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                {[
                  { id: 'all', label: 'All Time' },
                  { id: 'today', label: 'Today' },
                  { id: '7d', label: 'Last 7 Days' },
                  { id: '30d', label: 'Last 30 Days' }
                ].map((btn) => (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => {
                      setAnalyticsDateRange(btn.id);
                      fetchAnalytics(btn.id);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      analyticsDateRange === btn.id
                        ? 'bg-white text-primary shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => fetchAnalytics()}
                disabled={loadingAnalytics}
                className="py-2 px-3.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition cursor-pointer flex items-center gap-2 shadow-sm"
              >
                <RefreshCw size={14} className={loadingAnalytics ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                onClick={handleExportAnalyticsXlsx}
                disabled={exportingAnalyticsXlsx}
                className="py-2 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition cursor-pointer flex items-center gap-2 shadow-sm"
              >
                <FileSpreadsheet size={15} />
                <span>{exportingAnalyticsXlsx ? 'Generating Excel...' : 'Download Excel (.xlsx)'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportAnalyticsCsv}
                disabled={exportingAnalytics}
                className="py-2 px-3.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition cursor-pointer flex items-center gap-2 shadow-sm"
              >
                <Download size={14} />
                <span>{exportingAnalytics ? 'Exporting...' : 'Export CSV'}</span>
              </button>
            </div>
          </div>

          {/* SECTION 1: WEBSITE VISITOR ANALYTICS */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-blue-600" />
                <h3 className="font-heading font-black text-slate-900 text-base">Website Visitor Analytics</h3>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-200">
                Privacy-Preserving Telemetry
              </span>
            </div>

            {/* 6 Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
              <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Website Views (Total)</span>
                <p className="font-heading text-2xl font-black text-blue-600">
                  {(analyticsMetrics?.website_page_views || 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500">All website page visits</p>
              </article>

              <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Unique Sessions</span>
                <p className="font-heading text-2xl font-black text-indigo-600">
                  {(analyticsMetrics?.website_unique_sessions || 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500">Distinct browser sessions</p>
              </article>

              <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Authenticated</span>
                <p className="font-heading text-2xl font-black text-emerald-600">
                  {(analyticsMetrics?.authenticated_visitors || 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500">Logged-in @sece.ac.in users</p>
              </article>

              <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Anonymous</span>
                <p className="font-heading text-2xl font-black text-slate-600">
                  {(analyticsMetrics?.anonymous_visitors || 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500">Public anonymous sessions</p>
              </article>

              <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Today Visits</span>
                <p className="font-heading text-2xl font-black text-cyan-600">
                  {(analyticsMetrics?.website_views_today || 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500">Since 00:00 today</p>
              </article>

              <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Today Unique</span>
                <p className="font-heading text-2xl font-black text-purple-600">
                  {(analyticsMetrics?.today_unique_visitors || 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500">Distinct sessions today</p>
              </article>
            </div>

            {/* Daily Visits & Who Visited Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Table 1: Daily Visitor Traffic */}
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Activity size={16} className="text-blue-600" /> Daily Website Traffic
                  </h4>
                  <span className="text-xs text-slate-400 font-semibold">
                    {dailyVisits.length} days recorded
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                  {dailyVisits.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs">No daily visit records found.</div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-white shadow-xs">
                        <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="pb-2.5 pr-3">Date</th>
                          <th className="pb-2.5 pr-3 text-right">Total Visits</th>
                          <th className="pb-2.5 pr-3 text-right">Unique</th>
                          <th className="pb-2.5 pr-3 text-right">Auth</th>
                          <th className="pb-2.5 pl-3 text-right">Anon</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {dailyVisits.map((d) => (
                          <tr key={d.date} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 pr-3 font-semibold text-slate-900">{d.display_date || d.date}</td>
                            <td className="py-2.5 pr-3 text-right font-mono font-bold text-blue-600">{d.total_visits}</td>
                            <td className="py-2.5 pr-3 text-right font-mono font-bold text-indigo-600">{d.unique_visitors}</td>
                            <td className="py-2.5 pr-3 text-right font-mono font-semibold text-emerald-600">{d.authenticated_visitors}</td>
                            <td className="py-2.5 pl-3 text-right font-mono text-slate-500">{d.anonymous_visitors}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Table 2: Authenticated Visitors ("Who Visited") */}
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <ShieldCheck size={16} className="text-emerald-600" /> Authenticated Visitors
                    </h4>
                    <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md">
                      Admin Only
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-semibold">
                    {authenticatedVisitors.length} users
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                  {authenticatedVisitors.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs">No authenticated visitor sessions recorded yet.</div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-white shadow-xs">
                        <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="pb-2.5 pr-3">Visitor</th>
                          <th className="pb-2.5 pr-3">Department</th>
                          <th className="pb-2.5 pr-3 text-right">Visits</th>
                          <th className="pb-2.5 pl-3 text-right">Last Active</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {authenticatedVisitors.map((u) => (
                          <tr key={u.user_id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 pr-3 max-w-[160px]">
                              <p className="font-bold text-[#0B1B3A] truncate">{u.name}</p>
                              <p className="text-[10px] text-slate-400 font-mono truncate">{u.email}</p>
                            </td>
                            <td className="py-2.5 pr-3 text-slate-600 truncate max-w-[120px]">{u.department}</td>
                            <td className="py-2.5 pr-3 text-right">
                              <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                {u.total_visits}
                              </span>
                            </td>
                            <td className="py-2.5 pl-3 text-right text-slate-500 whitespace-nowrap text-[11px]">
                              {u.last_visit ? new Date(u.last_visit).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: IDEA ENGAGEMENT & SCORING */}
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-primary" />
                <h3 className="font-heading font-black text-slate-900 text-base">Idea Page Engagement & Public Scoring</h3>
              </div>
              <span className="text-xs text-slate-400 font-semibold">
                Score Formula: Votes × 2
              </span>
            </div>

            {/* Top Idea Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Idea Views</span>
                <p className="font-heading text-2xl font-black text-[#0B1B3A]">
                  {(analyticsMetrics?.idea_page_views || 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500">Total idea page views</p>
              </article>

              <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Idea Sessions</span>
                <p className="font-heading text-2xl font-black text-purple-600">
                  {(analyticsMetrics?.idea_unique_sessions || 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500">Distinct idea visitors</p>
              </article>

              <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Votes</span>
                <p className="font-heading text-2xl font-black text-emerald-600">
                  {(analyticsMetrics?.total_votes || 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500">+2 pts per student vote</p>
              </article>

              <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Score</span>
                <p className="font-heading text-2xl font-black text-primary">
                  {(analyticsMetrics?.total_score || 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500">Votes × 2</p>
              </article>
            </div>

            {/* Search Input for Idea Table */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={analyticsSearchQuery}
                onChange={(e) => setAnalyticsSearchQuery(e.target.value)}
                placeholder="Search ideas by title, team name, or registration ID..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            {/* Innovation Idea Engagement Table */}
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 size={16} className="text-primary" /> Innovation Idea Engagement Table
                </h4>
                <span className="text-xs text-slate-400 font-semibold">
                  Score Formula: Votes × 2
                </span>
              </div>

              {loadingAnalytics ? (
                <div className="py-12 text-center text-slate-400 text-xs">Loading engagement analytics...</div>
              ) : filteredAnalyticsIdeas.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">No matching innovation ideas found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="pb-2.5 pr-3">Rank</th>
                        <th className="pb-2.5 pr-4">Idea / Product Title</th>
                        <th className="pb-2.5 pr-4">Team Name</th>
                        <th className="pb-2.5 pr-3 text-right">Views</th>
                        <th className="pb-2.5 pr-3 text-right">Unique</th>
                        <th className="pb-2.5 pr-3 text-right">Votes</th>
                        <th className="pb-2.5 pr-3 text-right">Score</th>
                        <th className="pb-2.5 pl-3">Last Viewed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredAnalyticsIdeas.map((idea) => (
                        <tr key={idea.product_id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 pr-3 font-bold text-slate-900">#{idea.rank}</td>
                          <td className="py-3 pr-4 max-w-[240px]">
                            <p className="font-bold text-[#0B1B3A] truncate">{idea.product_title}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{idea.registration_id}</p>
                          </td>
                          <td className="py-3 pr-4 font-semibold text-slate-700 truncate max-w-[160px]">{idea.team_name}</td>
                          <td className="py-3 pr-3 text-right font-mono font-bold text-blue-600">{(idea.page_views || 0).toLocaleString()}</td>
                          <td className="py-3 pr-3 text-right font-mono font-bold text-indigo-600">{(idea.unique_sessions || 0).toLocaleString()}</td>
                          <td className="py-3 pr-3 text-right font-mono font-bold text-primary">{(idea.votes || 0).toLocaleString()}</td>
                          <td className="py-3 pr-3 text-right font-black text-emerald-700 font-mono text-sm">{(idea.score || 0).toLocaleString()}</td>
                          <td className="py-3 pl-3 text-slate-500 whitespace-nowrap text-[11px]">
                            {idea.last_viewed_at ? new Date(idea.last_viewed_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Never'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-PAGE 2: VOTER REPORTS                                      */}
      {/* ============================================================== */}
      {subTab === 'voter_reports' && (
        <div className="space-y-6">
          {/* Voter Reports Compact Toolbar */}
          <div className="flex flex-col lg:flex-row gap-2.5 items-stretch lg:items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            {/* Search input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                value={voterSearchQuery}
                onChange={(e) => setVoterSearchQuery(e.target.value)}
                placeholder="Search by student name, email, user ID, or dept..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
              />
            </div>

            {/* Department Filter */}
            <div className="w-full sm:w-44">
              <select
                value={voterDeptFilter}
                onChange={(e) => setVoterDeptFilter(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              >
                {DEPARTMENTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Vote Activity Filter */}
            <div className="w-full sm:w-36">
              <select
                value={voterActivityFilter}
                onChange={(e) => setVoterActivityFilter(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              >
                <option value="all">All Voters</option>
                <option value="multiple">Multiple Votes (&gt;1)</option>
                <option value="single">Single Vote (1)</option>
              </select>
            </div>

            {/* Sort By */}
            <div className="w-full sm:w-36">
              <select
                value={voterSortBy}
                onChange={(e) => setVoterSortBy(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              >
                <option value="votes">Sort: Total Votes</option>
                <option value="name">Sort: Voter Name</option>
                <option value="email">Sort: Email</option>
                <option value="date">Sort: Latest Vote</option>
              </select>
            </div>

            {/* Sort Direction Toggle */}
            <button
              type="button"
              onClick={() => setVoterSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              title={`Sort direction: ${voterSortOrder === 'asc' ? 'Ascending' : 'Descending'} (click to toggle)`}
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer flex items-center justify-center shrink-0 shadow-2xs"
            >
              {voterSortOrder === 'asc' ? <ArrowUp size={16} className="text-primary" /> : <ArrowDown size={16} className="text-primary" />}
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => fetchVoters()}
              disabled={loadingVoters}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-2xs disabled:opacity-50"
            >
              <RefreshCw size={13} className={loadingVoters ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            {/* Download Excel (.xlsx) Button */}
            <button
              type="button"
              onClick={handleOpenVoterExportModal}
              className="px-3 py-2 rounded-xl bg-primary hover:bg-blue-900 text-white text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-2xs"
            >
              <Download size={13} />
              <span>Download Excel (.xlsx)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Voters List Column */}
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                  Active Voters ({totalVotersCount})
                </h4>
                {loadingVoters && <RefreshCw size={12} className="animate-spin text-primary" />}
              </div>

              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {totalVotersCount === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    {loadingVoters ? 'Loading voter records...' : 'No voters found matching search/filter.'}
                  </div>
                ) : (
                  paginatedVoters.map(v => (
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

              {/* Voter Pagination Controls */}
              {totalVotersCount > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-slate-100">
                  <div className="text-[11px] font-semibold text-slate-500">
                    Showing <span className="font-mono text-slate-900 font-bold">{voterStartIndexDisplay}</span>–<span className="font-mono text-slate-900 font-bold">{voterEndIndexDisplay}</span> of <span className="font-mono text-slate-900 font-bold">{totalVotersCount}</span>
                  </div>

                  <div className="flex items-center gap-1 flex-wrap justify-center">
                    <button
                      type="button"
                      disabled={safeVoterCurrentPage <= 1}
                      onClick={() => setVoterCurrentPage(p => Math.max(1, p - 1))}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1 min-h-[28px] rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition shadow-2xs cursor-pointer"
                    >
                      <ChevronLeft size={12} />
                      <span>Prev</span>
                    </button>

                    {getVisiblePages(safeVoterCurrentPage, totalVoterPages).map((p, pIdx) => {
                      if (p === '...') {
                        return (
                          <span
                            key={`voter-dots-${pIdx}`}
                            className="inline-flex items-center justify-center min-w-[24px] min-h-[28px] px-0.5 text-xs font-bold text-slate-400 select-none"
                          >
                            ...
                          </span>
                        );
                      }
                      const isCurrent = p === safeVoterCurrentPage;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setVoterCurrentPage(p)}
                          className={`inline-flex items-center justify-center min-w-[28px] min-h-[28px] px-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                            isCurrent
                              ? 'bg-slate-900 text-white shadow-xs'
                              : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      disabled={safeVoterCurrentPage >= totalVoterPages}
                      onClick={() => setVoterCurrentPage(p => Math.min(totalVoterPages, p + 1))}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1 min-h-[28px] rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition shadow-2xs cursor-pointer"
                    >
                      <span>Next</span>
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              )}
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
          {/* Product / Team Reports Compact Toolbar */}
          <div className="flex flex-col lg:flex-row gap-2.5 items-stretch lg:items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            {/* Search input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                value={teamSearchQuery}
                onChange={(e) => setTeamSearchQuery(e.target.value)}
                placeholder="Search by team, reg ID, product title, or team ID..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
              />
            </div>

            {/* Filters and Sort */}
            <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
              {/* Department Filter */}
              <div className="w-full sm:w-40">
                <select
                  value={teamDeptFilter}
                  onChange={(e) => setTeamDeptFilter(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                >
                  {DEPARTMENTS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Product Type Filter */}
              <div className="w-full sm:w-36">
                <select
                  value={teamProductTypeFilter}
                  onChange={(e) => setTeamProductTypeFilter(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                >
                  <option value="all">All Products</option>
                  <option value="hardware">Hardware</option>
                  <option value="software">Software</option>
                </select>
              </div>

              {/* Shortlist Filter */}
              <div className="w-full sm:w-36">
                <select
                  value={teamShortlistFilter}
                  onChange={(e) => setTeamShortlistFilter(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                >
                  <option value="all">All Teams</option>
                  <option value="shortlisted">Finalists Only</option>
                  <option value="non_shortlisted">Non-Finalists</option>
                </select>
              </div>

              {/* Voting Status Filter */}
              <div className="w-full sm:w-32">
                <select
                  value={teamVotingStatusFilter}
                  onChange={(e) => setTeamVotingStatusFilter(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                >
                  <option value="all">Voting: All</option>
                  <option value="with_votes">With Votes (&gt;0)</option>
                  <option value="zero_votes">Zero Votes (0)</option>
                </select>
              </div>

              {/* Sort By */}
              <div className="w-full sm:w-36">
                <select
                  value={teamSortBy}
                  onChange={(e) => setTeamSortBy(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                >
                  <option value="votes">Sort: Total Votes</option>
                  <option value="score">Sort: Score</option>
                  <option value="team_name">Sort: Team Name</option>
                  <option value="product_title">Sort: Product Title</option>
                  <option value="registration_id">Sort: Reg ID</option>
                </select>
              </div>

              {/* Sort Direction Toggle */}
              <button
                type="button"
                onClick={() => setTeamSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                title={`Sort direction: ${teamSortOrder === 'asc' ? 'Ascending' : 'Descending'} (click to toggle)`}
                className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer flex items-center justify-center shrink-0 shadow-2xs"
              >
                {teamSortOrder === 'asc' ? <ArrowUp size={16} className="text-primary" /> : <ArrowDown size={16} className="text-primary" />}
              </button>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={() => fetchTeams()}
                disabled={loadingTeams}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-2xs disabled:opacity-50"
              >
                <RefreshCw size={13} className={loadingTeams ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>

              {/* Download Excel (.xlsx) Button */}
              <button
                type="button"
                onClick={handleOpenTeamExportModal}
                className="px-3 py-2 rounded-xl bg-primary hover:bg-blue-900 text-white text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-2xs"
              >
                <Download size={13} />
                <span>Download Excel (.xlsx)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch lg:h-[780px] xl:h-[820px]">
            {/* LEFT PANEL: PARTICIPATING TEAMS */}
            <div className="lg:col-span-4 flex flex-col h-full rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
              {/* Card Header (shrink-0) */}
              <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0 bg-white">
                <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                  Participating Teams ({totalTeamsCount})
                </h4>
                {loadingTeams && <RefreshCw size={12} className="animate-spin text-primary" />}
              </div>

              {/* Team list content (flex: 1, min-height: 0, scrollable) */}
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
                {totalTeamsCount === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    {loadingTeams ? 'Loading teams...' : 'No teams found matching search/filter.'}
                  </div>
                ) : (
                  paginatedTeams.map(t => (
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
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[10px] font-bold text-slate-400">{t.registrationId}</span>
                          <p className="text-xs font-extrabold truncate">{t.teamName}</p>
                          {t.isShortlisted && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200/80 shrink-0">
                              Finalist
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{t.department}</p>
                        {t.products?.[0]?.productTitle && (
                          <p className="text-[10px] text-slate-400 truncate italic">
                            {t.products[0].productTitle}
                            {t.products[0].productType ? ` • ${t.products[0].productType}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end shrink-0 pl-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          t.totalVotes > 0 ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {t.totalVotes} {t.totalVotes === 1 ? 'vote' : 'votes'}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 mt-0.5">
                          Score: {t.score ?? (t.totalVotes * 2)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Team Pagination Controls (shrink-0, pinned to bottom) */}
              <div className="p-3.5 border-t border-slate-100 shrink-0 bg-slate-50/50 min-h-[56px] flex items-center">
                {totalTeamsCount > 0 ? (
                  <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                      Showing <span className="font-mono text-slate-900 font-bold">{teamStartIndexDisplay}</span>–<span className="font-mono text-slate-900 font-bold">{teamEndIndexDisplay}</span> of <span className="font-mono text-slate-900 font-bold">{totalTeamsCount}</span> teams
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={safeTeamCurrentPage <= 1}
                        onClick={() => setTeamCurrentPage(p => Math.max(1, p - 1))}
                        className="inline-flex items-center justify-center gap-1 px-2.5 h-7 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition shadow-2xs cursor-pointer"
                      >
                        <ChevronLeft size={12} />
                        <span>Prev</span>
                      </button>

                      {getVisiblePages(safeTeamCurrentPage, totalTeamPages).map((p, pIdx) => {
                        if (p === '...') {
                          return (
                            <span
                              key={`team-dots-${pIdx}`}
                              className="inline-flex items-center justify-center min-w-[20px] h-7 text-xs font-bold text-slate-400 select-none"
                            >
                              ...
                            </span>
                          );
                        }
                        const isCurrent = p === safeTeamCurrentPage;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setTeamCurrentPage(p)}
                            className={`inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                              isCurrent
                                ? 'bg-slate-900 text-white shadow-xs'
                                : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs'
                            }`}
                          >
                            {p}
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        disabled={safeTeamCurrentPage >= totalTeamPages}
                        onClick={() => setTeamCurrentPage(p => Math.min(totalTeamPages, p + 1))}
                        className="inline-flex items-center justify-center gap-1 px-2.5 h-7 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition shadow-2xs cursor-pointer"
                      >
                        <span>Next</span>
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 italic">No teams to paginate</div>
                )}
              </div>
            </div>

            {/* RIGHT PANEL: SELECTED TEAM & VOTERS FOR THIS TEAM */}
            <div className="lg:col-span-8 flex flex-col h-full rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
              {selectedTeam ? (
                <>
                  {/* Selected Team Profile Header (shrink-0) */}
                  <div className="p-4 border-b border-slate-100 shrink-0 bg-white space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {selectedTeam.registrationId}
                          </span>
                          <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                            {selectedTeam.teamName}
                          </h3>
                          {selectedTeam.isShortlisted && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                              ★ Shortlisted Finalist {selectedTeam.shortlistCategory ? `(${selectedTeam.shortlistCategory})` : ''}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{selectedTeam.department}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20">
                          {selectedTeam.totalVotes} Total Votes
                        </span>
                        <span className="px-2.5 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 ring-1 ring-blue-600/20">
                          Score: {selectedTeam.score ?? (selectedTeam.totalVotes * 2)} pts
                        </span>
                      </div>
                    </div>

                    {/* Products list under this team (compact) */}
                    {(() => {
                      const allProds = selectedTeam.products || [];
                      const prodsToDisplay = teamProductTypeFilter === 'all'
                        ? allProds
                        : allProds.filter(p => {
                            const type = (p.productType || '').toLowerCase();
                            const cat = (p.shortlistCategory || '').toLowerCase();
                            if (teamProductTypeFilter === 'hardware') {
                              return type === 'hardware' || type === 'hw' || type.includes('hardware') || type.includes('hw & sw') ||
                                     cat === 'hw' || cat.includes('hardware');
                            }
                            if (teamProductTypeFilter === 'software') {
                              return type === 'software' || type === 'sw' || type.includes('software') || type.includes('hw & sw') ||
                                     cat === 'sw' || cat.includes('software');
                            }
                            return true;
                          });
                      if (prodsToDisplay.length === 0) return null;
                      return (
                        <div className="pt-2 border-t border-slate-100/70">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                            Products / Ideas ({prodsToDisplay.length})
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {prodsToDisplay.map((p, idx) => (
                              <div key={idx} className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-100 text-xs flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="font-bold text-slate-900 truncate text-xs">{p.productTitle}</p>
                                    {p.productType && (
                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                        p.productType === 'Hardware' || p.productType.toLowerCase().includes('hard') || p.productType === 'HW'
                                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                          : p.productType === 'Software' || p.productType.toLowerCase().includes('soft') || p.productType === 'SW'
                                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      }`}>
                                        {p.productType}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-500">{p.innovationDomain}</span>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 block">
                                    {p.productVotes || 0} votes
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-600">
                                    Score: {p.score ?? (p.productVotes || 0) * 2}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Voters Sub-header (shrink-0) */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/40 shrink-0">
                    <h4 className="text-xs font-bold uppercase text-slate-600 tracking-wider flex items-center gap-1.5">
                      <Users size={14} className="text-primary" />
                      <span>Voters For This Team ({selectedTeamTotalVoters})</span>
                    </h4>
                    {loadingTeamDetail && <RefreshCw size={12} className="animate-spin text-primary" />}
                  </div>

                  {/* Voter Table Content (flex: 1, min-height: 0, scrollable) */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-4">
                    {selectedTeamTotalVoters === 0 ? (
                      <div className="py-12 text-center text-slate-400 text-xs">
                        No votes have been recorded for this team yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider sticky top-0 bg-white">
                              <th className="pb-2.5 w-12">S.No</th>
                              <th className="pb-2.5">Voter Name</th>
                              <th className="pb-2.5">Voter Email</th>
                              <th className="pb-2.5">Product Voted For</th>
                              <th className="pb-2.5">Voter Department</th>
                              <th className="pb-2.5 whitespace-nowrap">Vote Timestamp</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {paginatedTeamVoters.map((v, i) => (
                              <tr key={v.voteId || i} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-2.5 font-mono font-bold text-slate-400">
                                  {(safeTeamVoterPage - 1) * TEAM_VOTERS_PER_PAGE + i + 1}
                                </td>
                                <td className="py-2.5 font-semibold text-slate-900 whitespace-nowrap">{v.voterName}</td>
                                <td className="py-2.5 text-slate-600">{v.voterEmail}</td>
                                <td className="py-2.5 text-slate-700 max-w-[180px] truncate">{v.productTitle || 'Product Showcase'}</td>
                                <td className="py-2.5">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 whitespace-nowrap">
                                    {v.voterDepartment}
                                  </span>
                                </td>
                                <td className="py-2.5 text-slate-500 whitespace-nowrap">
                                  {new Date(v.votedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Voter Pagination Controls (shrink-0, pinned to bottom, matches left baseline) */}
                  <div className="p-3.5 border-t border-slate-100 shrink-0 bg-slate-50/50 min-h-[56px] flex items-center">
                    {selectedTeamTotalVoters > 0 ? (
                      <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                          Showing <span className="font-mono text-slate-900 font-bold">{teamVoterStartIndexDisplay}</span>–<span className="font-mono text-slate-900 font-bold">{teamVoterEndIndexDisplay}</span> of <span className="font-mono text-slate-900 font-bold">{selectedTeamTotalVoters}</span> voters
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={safeTeamVoterPage <= 1}
                            onClick={() => setSelectedTeamVoterPage(p => Math.max(1, p - 1))}
                            className="inline-flex items-center justify-center gap-1 px-2.5 h-7 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition shadow-2xs cursor-pointer"
                          >
                            <ChevronLeft size={12} />
                            <span>Prev</span>
                          </button>

                          {getVisiblePages(safeTeamVoterPage, totalTeamVoterPages).map((p, pIdx) => {
                            if (p === '...') {
                              return (
                                <span
                                  key={`voter-dots-${pIdx}`}
                                  className="inline-flex items-center justify-center min-w-[20px] h-7 text-xs font-bold text-slate-400 select-none"
                                >
                                  ...
                                </span>
                              );
                            }
                            const isCurrent = p === safeTeamVoterPage;
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setSelectedTeamVoterPage(p)}
                                className={`inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                                  isCurrent
                                    ? 'bg-slate-900 text-white shadow-xs'
                                    : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs'
                                }`}
                              >
                                {p}
                              </button>
                            );
                          })}

                          <button
                            type="button"
                            disabled={safeTeamVoterPage >= totalTeamVoterPages}
                            onClick={() => setSelectedTeamVoterPage(p => Math.min(totalTeamVoterPages, p + 1))}
                            className="inline-flex items-center justify-center gap-1 px-2.5 h-7 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition shadow-2xs cursor-pointer"
                          >
                            <span>Next</span>
                            <ChevronRight size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic">No voters to paginate</div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Empty state when no team selected */}
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
                    <Building2 size={36} className="mx-auto text-slate-300" />
                    <h4 className="text-sm font-bold text-slate-700">No Team Selected</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Select a team from the participating teams list on the left to see total votes received, associated products, and the complete audit list of student voters.
                    </p>
                  </div>
                  <div className="p-3.5 border-t border-slate-100 shrink-0 bg-slate-50/50 min-h-[56px] flex items-center">
                    <div className="text-[11px] text-slate-400 italic">Select a team to view voters and pagination</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}



      {/* Field-Selective Export Modal for Voter Reports */}
      <FieldSelectionExportModal
        isOpen={isVoterExportModalOpen}
        onClose={() => setIsVoterExportModalOpen(false)}
        title="Export Voter Report (.xlsx)"
        subtitle="Select the fields to include in the exported Excel spreadsheet."
        fieldGroups={VOTER_EXPORT_FIELDS}
        selectedFields={selectedVoterExportFields}
        onToggleField={handleToggleVoterField}
        onSelectAll={handleSelectAllVoterFields}
        onClearAll={handleClearAllVoterFields}
        onDownload={handleDownloadVoterExcel}
        totalRecordsCount={totalVoterExportRowsCount}
        recordTypeName="records"
      />

      {/* Field-Selective Export Modal for Product / Team Reports */}
      <FieldSelectionExportModal
        isOpen={isTeamExportModalOpen}
        onClose={() => setIsTeamExportModalOpen(false)}
        title="Export Product / Team Report (.xlsx)"
        subtitle="Select the fields to include in the exported Excel spreadsheet."
        fieldGroups={TEAM_EXPORT_FIELDS}
        selectedFields={selectedTeamExportFields}
        onToggleField={handleToggleTeamField}
        onSelectAll={handleSelectAllTeamFields}
        onClearAll={handleClearAllTeamFields}
        onDownload={handleDownloadTeamExcel}
        totalRecordsCount={totalTeamExportRowsCount}
        recordTypeName="records"
      />
    </div>
  );
}
