import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Vote,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  Users,
  Lightbulb,
  Building2,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Camera,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Check
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../supabaseClient';
import MechanicalLoader from './MechanicalLoader';

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

export default function VotingModal({
  isOpen,
  onClose,
  initialToken = '',
  user: propUser,
  session: propSession,
  profile: propProfile,
  onProfileUpdate
}) {
  // Navigation steps: 'DEPARTMENT' | 'SCANNER' | 'MANUAL_ENTRY' | 'TEAM_VIEW' | 'SUCCESS'
  const [step, setStep] = useState('SCANNER');

  // Resolved user & profile state (self-healing for seamless auth across components)
  const [activeUser, setActiveUser] = useState(propUser || null);
  const [activeProfile, setActiveProfile] = useState(propProfile || null);
  const [authChecking, setAuthChecking] = useState(true);
  
  // QR & Team lookup state
  const [teamIdentifier, setTeamIdentifier] = useState('');
  const [activeToken, setActiveToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [teamData, setTeamData] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null); // { code, title, message }

  // Ideas carousel index
  const [activeIdeaIndex, setActiveIdeaIndex] = useState(0);

  // Department setup state
  const [selectedDept, setSelectedDept] = useState(propProfile?.department || '');
  const [savingDept, setSavingDept] = useState(false);
  const [deptError, setDeptError] = useState('');

  // Scanner state
  const [scannerActive, setScannerActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const html5QrCodeRef = useRef(null);

  // Voting action state
  const [voting, setVoting] = useState(false);
  const [voteSuccess, setVoteSuccess] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').trim().replace(/\/+$/, '');
  const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl.slice(0, -4) : rawApiUrl;

  // Resolve active authentication and department authoritatively
  useEffect(() => {
    if (!isOpen) return;

    setErrorInfo(null);
    setVoteSuccess(null);
    setShowConfirm(false);
    setActiveIdeaIndex(0);

    let isMounted = true;

    async function checkAuthSession() {
      setAuthChecking(true);

      let resolvedUser = propUser || null;
      let resolvedProfile = propProfile || null;

      // 1. If user not passed, resolve directly from Supabase session
      if (!resolvedUser) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            resolvedUser = session.user;
          }
        } catch (e) {
          console.warn('[Voting Modal] Error resolving session:', e);
        }
      }

      // 2. If user is found, check if department is already stored
      if (resolvedUser) {
        if (!resolvedProfile?.department) {
          try {
            const { data: prof } = await supabase
              .from('profiles')
              .select('id, user_id, email, department, role')
              .eq('user_id', resolvedUser.id)
              .maybeSingle();

            if (prof) {
              resolvedProfile = prof;
            }
          } catch (e) {
            console.warn('[Voting Modal] Error resolving profile:', e);
          }
        }
      }

      if (!isMounted) return;

      setActiveUser(resolvedUser);
      setActiveProfile(resolvedProfile);
      setAuthChecking(false);

      const email = (resolvedUser?.email || '').trim().toLowerCase();
      const isSece = email.endsWith('@sece.ac.in');

      if (resolvedUser && isSece) {
        if (resolvedProfile?.department) {
          setSelectedDept(resolvedProfile.department);
          if (initialToken) {
            setActiveToken(initialToken);
            resolveTeamByIdentifier(initialToken, true);
          } else {
            setStep('SCANNER');
          }
        } else {
          setStep('DEPARTMENT');
        }
      }
    }

    checkAuthSession();

    return () => {
      isMounted = false;
    };
  }, [isOpen, propUser, propProfile, initialToken]);

  // Sync selectedDept if activeProfile changes
  useEffect(() => {
    if (activeProfile?.department) {
      setSelectedDept(activeProfile.department);
    }
  }, [activeProfile?.department]);

  // Helper to stop camera scanner
  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        await html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn('[Scanner] Error stopping camera:', err);
      } finally {
        html5QrCodeRef.current = null;
        setScannerActive(false);
      }
    }
  }, []);

  // Stop camera when modal closes or step changes away from SCANNER
  useEffect(() => {
    if (!isOpen || step !== 'SCANNER') {
      stopScanner();
    }
  }, [isOpen, step, stopScanner]);

  // Start camera scanner
  const startScanner = useCallback(async (cameraId = null) => {
    setCameraError('');
    await stopScanner();

    // Ensure DOM element is present
    const readerElem = document.getElementById('voting-qr-reader');
    if (!readerElem) return;

    try {
      const qrScanner = new Html5Qrcode('voting-qr-reader');
      html5QrCodeRef.current = qrScanner;

      const devices = await Html5Qrcode.getCameras().catch(() => []);
      if (devices && devices.length > 0) {
        setCameras(devices);
        if (!selectedCameraId) {
          // Prefer environment/back camera
          const backCam = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        }
      }

      const cameraConfig = cameraId
        ? { deviceId: { exact: cameraId } }
        : { facingMode: 'environment' };

      await qrScanner.start(
        cameraConfig,
        {
          fps: 12,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          // Successfully scanned a QR code!
          handleScanSuccess(decodedText);
        },
        () => {
          // ignore continuous scanning frame misses
        }
      );

      setScannerActive(true);
    } catch (err) {
      console.warn('[Scanner] Camera start error:', err);
      setCameraError('Camera access unavailable. You can search by Team ID below.');
      setScannerActive(false);
    }
  }, [selectedCameraId, stopScanner]);

  // Handle scanned QR text
  const handleScanSuccess = async (rawText) => {
    await stopScanner();
    let token = String(rawText).trim();

    // Extract token if decoded text is a URL
    if (token.includes('token=')) {
      try {
        const url = new URL(token);
        token = url.searchParams.get('token') || token;
      } catch (e) {
        const match = token.match(/token=([a-zA-Z0-9_-]+)/);
        if (match && match[1]) token = match[1];
      }
    } else if (token.includes('#vote?token=')) {
      token = token.split('#vote?token=')[1] || token;
    }

    setActiveToken(token);
    resolveTeamByIdentifier(token, true);
  };

  // Launch camera when entering SCANNER step
  useEffect(() => {
    if (isOpen && step === 'SCANNER') {
      const timer = setTimeout(() => {
        startScanner();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen, step, startScanner]);

  // Resolve team by QR token or Team ID
  const resolveTeamByIdentifier = async (identifier, isQr = false) => {
    if (!identifier || !identifier.trim()) return;
    setLoading(true);
    setErrorInfo(null);
    setTeamData(null);
    setShowConfirm(false);
    setActiveIdeaIndex(0);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const endpoint = isQr
        ? `${API_BASE_URL}/api/voting/qr/${encodeURIComponent(identifier.trim())}`
        : `${API_BASE_URL}/api/voting/team/resolve/${encodeURIComponent(identifier.trim())}`;

      const res = await fetch(endpoint, { headers });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorInfo({
          code: data.error_code || 'ERROR',
          title: data.error_code === 'TEAM_NOT_FOUND' ? 'TEAM NOT FOUND' : 'UNABLE TO RESOLVE',
          message: data.message || 'Please check the Team ID and try again.'
        });
        setStep('MANUAL_ENTRY');
      } else {
        setTeamData(data);
        setStep('TEAM_VIEW');
      }
    } catch (err) {
      setErrorInfo({
        code: 'NETWORK_ERROR',
        title: 'CONNECTION ERROR',
        message: 'Unable to connect to the voting server. Please verify your connection.'
      });
      setStep('MANUAL_ENTRY');
    } finally {
      setLoading(false);
    }
  };

  // Save voter department (Asked ONLY ONCE)
  const handleSaveDepartment = async () => {
    if (!selectedDept) {
      setDeptError('Please select your official college department.');
      return;
    }
    setSavingDept(true);
    setDeptError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setDeptError('Authentication required. Please sign in again.');
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/voting/profile/department`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ department: selectedDept })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setDeptError(json.message || 'Failed to save department.');
      } else {
        if (onProfileUpdate) await onProfileUpdate();
        setActiveProfile(prev => ({ ...(prev || {}), department: selectedDept }));
        // Advance to scanner or team view
        if (activeToken) {
          resolveTeamByIdentifier(activeToken, true);
        } else {
          setStep('SCANNER');
        }
      }
    } catch (err) {
      setDeptError('Network error saving department.');
    } finally {
      setSavingDept(false);
    }
  };

  // Cast official vote
  const handleCastVote = async () => {
    if (!teamData?.team?.id) return;
    setVoting(true);
    setErrorInfo(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setErrorInfo({
          code: 'AUTH_EXPIRED',
          title: 'SESSION EXPIRED',
          message: 'Your authentication session expired. Please sign in again.'
        });
        setVoting(false);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/voting/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          team_id: teamData.team.id,
          qr_token: activeToken || undefined
        })
      });

      const json = await res.json();

      if (res.status === 409 || json.error_code === 'ALREADY_VOTED') {
        setErrorInfo({
          code: 'ALREADY_VOTED',
          title: 'ALREADY VOTED',
          message: json.message || 'You have already voted for this team in this voting round.'
        });
        setShowConfirm(false);
      } else if (!res.ok || !json.success) {
        setErrorInfo({
          code: json.error_code || 'VOTE_FAILED',
          title: json.error_code === 'OWN_TEAM_VOTE_BLOCKED'
            ? "YOU CAN'T VOTE FOR YOUR OWN TEAM"
            : json.error_code === 'DEPARTMENT_INELIGIBLE'
            ? 'VOTING NOT ALLOWED'
            : 'VOTING RESTRICTION',
          message: json.message || 'Failed to record vote.'
        });
        setShowConfirm(false);
      } else {
        setVoteSuccess(json);
        setStep('SUCCESS');
        // Dispatch live leaderboard update event
        window.dispatchEvent(new CustomEvent('refresh-leaderboard'));
      }
    } catch (err) {
      setErrorInfo({
        code: 'NETWORK_ERROR',
        title: 'NETWORK ERROR',
        message: 'Connection error while recording vote. Please try again.'
      });
      setShowConfirm(false);
    } finally {
      setVoting(false);
    }
  };

  // Switch camera toggle (front / rear)
  const handleFlipCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamera = cameras[nextIndex];
    setSelectedCameraId(nextCamera.id);
    startScanner(nextCamera.id);
  };

  if (!isOpen) return null;

  const currentIdea = teamData?.products?.[activeIdeaIndex] || null;
  const eligibility = teamData?.eligibility || { can_vote: false, reason: 'Verifying eligibility...' };
  const isOfficialSeceUser = Boolean(
    activeUser && (activeUser.email || '').trim().toLowerCase().endsWith('@sece.ac.in')
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-[#0B1B3A]/85 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden z-10 my-auto text-slate-800 flex flex-col"
          style={{ maxHeight: '92vh' }}
        >
          {/* Header Banner */}
          <div className="relative bg-gradient-to-r from-[#0B1B3A] via-[#1E3A8A] to-[#0B1B3A] px-5 py-4 text-white shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-400/30 shadow-2xs">
                  <Vote size={22} />
                </div>
                <div>
                  <h2 className="font-heading text-lg sm:text-xl font-black tracking-tight">
                    {step === 'DEPARTMENT' ? 'Voter Setup' : 'IPL 2026 Live Voting'}
                  </h2>
                  <p className="text-[11px] sm:text-xs text-slate-300 font-medium">
                    {step === 'DEPARTMENT' ? 'One-time verification' : (activeProfile?.department ? `Voter: ${activeProfile.department}` : 'Live Voting')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white transition cursor-pointer"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Modal Body Container */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">

            {/* STATE 1: AUTH STILL INITIALIZING */}
            {authChecking && (
              <div className="py-12 text-center space-y-3">
                <MechanicalLoader size={36} className="text-primary mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Checking your sign-in...
                  </h3>
                  <p className="text-xs text-slate-500">
                    Verifying official college account credentials
                  </p>
                </div>
              </div>
            )}

            {/* STATE 4: AUTHENTICATED BUT NOT @sece.ac.in */}
            {!authChecking && activeUser && !isOfficialSeceUser && (
              <div className="py-8 text-center space-y-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 mx-auto">
                  <ShieldAlert size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-extrabold text-slate-900">
                    Official College Account Required
                  </h3>
                  <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                    You are signed in as <span className="font-semibold text-slate-800">{activeUser.email}</span>. Live voting is restricted to verified <strong>@sece.ac.in</strong> institutional accounts.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition shadow-sm cursor-pointer"
                >
                  Return to Home
                </button>
              </div>
            )}

            {/* STATE 3: NOT AUTHENTICATED */}
            {!authChecking && !activeUser && (
              <div className="py-8 text-center space-y-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 mx-auto">
                  <ShieldAlert size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-extrabold text-slate-900">
                    Authentication Required
                  </h3>
                  <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                    You must be signed in with your official <strong>@sece.ac.in</strong> college account to participate in live voting.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition shadow-sm cursor-pointer"
                >
                  Return to Home
                </button>
              </div>
            )}

            {/* STATE 2: AUTHENTICATED OFFICIAL USER (Renders Steps) */}

            {/* STEP 1: DEPARTMENT SELECTION (MINIMAL CLEAN UI) */}
            {isOfficialSeceUser && !authChecking && step === 'DEPARTMENT' && (
              <div className="space-y-5 animate-fade-in py-2">
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">
                    Which department are you from?
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    This will be saved for future voting.
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Select your department
                  </label>
                  <select
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-xs sm:text-sm font-semibold text-slate-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                    disabled={savingDept}
                  >
                    <option value="">Select your department</option>
                    {OFFICIAL_DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>

                  {deptError && (
                    <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2 border border-red-200">
                      <AlertTriangle size={15} className="text-red-500 shrink-0" />
                      <span>{deptError}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveDepartment}
                    disabled={!selectedDept || savingDept}
                    className="w-full py-3 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs sm:text-sm font-extrabold shadow-md transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                  >
                    {savingDept ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Continue</span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: CAMERA QR SCANNER */}
            {isOfficialSeceUser && !authChecking && step === 'SCANNER' && (
              <div className="space-y-4 animate-fade-in">
                {/* Viewfinder Frame */}
                <div className="relative w-full max-w-[280px] sm:max-w-[300px] aspect-square rounded-3xl overflow-hidden bg-slate-900 mx-auto border-2 border-slate-800 shadow-xl flex items-center justify-center">
                  <div id="voting-qr-reader" className="w-full h-full object-cover"></div>

                  {/* Clean Scanning Frame Overlay */}
                  <div className="absolute inset-6 pointer-events-none border-2 border-dashed border-amber-400/80 rounded-2xl flex flex-col justify-between p-2">
                    <div className="flex justify-between">
                      <div className="w-4 h-4 border-t-2 border-l-2 border-amber-400"></div>
                      <div className="w-4 h-4 border-t-2 border-r-2 border-amber-400"></div>
                    </div>
                    {/* Laser line moving pulse */}
                    <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_8px_rgba(245,158,11,0.8)] motion-safe:animate-pulse"></div>
                    <div className="flex justify-between">
                      <div className="w-4 h-4 border-b-2 border-l-2 border-amber-400"></div>
                      <div className="w-4 h-4 border-b-2 border-r-2 border-amber-400"></div>
                    </div>
                  </div>

                  {/* Loading spinner overlay if initializing */}
                  {!scannerActive && !cameraError && (
                    <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center gap-2 text-white text-xs">
                      <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                      <span className="font-semibold text-slate-300">Opening Camera...</span>
                    </div>
                  )}
                </div>

                {cameraError ? (
                  <div className="rounded-2xl bg-amber-50 p-3.5 border border-amber-200 text-center space-y-1">
                    <p className="text-xs font-bold text-amber-900">{cameraError}</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-2 text-xs text-slate-500">
                    <span className="font-medium">Point camera at team stall QR</span>
                    {cameras.length > 1 && (
                      <button
                        type="button"
                        onClick={handleFlipCamera}
                        className="inline-flex items-center gap-1 text-primary hover:text-primary/80 font-bold cursor-pointer"
                      >
                        <RefreshCw size={13} />
                        <span>Flip Camera</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Having trouble scanning? -> Team ID fallback */}
                <div className="pt-2 text-center border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      stopScanner();
                      setStep('MANUAL_ENTRY');
                    }}
                    className="text-xs font-bold text-primary hover:text-primary/80 transition cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span>Having trouble scanning?</span>
                    <span className="underline">Enter Team ID</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: MANUAL TEAM ID ENTRY (FALLBACK ROUTE) */}
            {isOfficialSeceUser && !authChecking && step === 'MANUAL_ENTRY' && (
              <div className="space-y-4 animate-fade-in">
                <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200 text-center space-y-1.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-primary border border-blue-200/60 mx-auto">
                    <Search size={20} />
                  </div>
                  <h3 className="font-bold text-sm text-slate-900">Enter Team ID</h3>
                  <p className="text-xs text-slate-600">
                    Enter the team’s registration code (e.g. <strong>IPL26-0439</strong>) or paste their QR token.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={teamIdentifier}
                      onChange={(e) => setTeamIdentifier(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && resolveTeamByIdentifier(teamIdentifier)}
                      placeholder="e.g. IPL26-0439"
                      className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm font-mono text-slate-900 uppercase focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      type="button"
                      onClick={() => resolveTeamByIdentifier(teamIdentifier)}
                      disabled={!teamIdentifier.trim() || loading}
                      className="rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-primary/90 disabled:opacity-50 cursor-pointer transition flex items-center justify-center gap-1.5"
                    >
                      {loading ? (
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <span>Find Team</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Error Banner if Team Not Found */}
                {errorInfo && (
                  <div className="rounded-2xl bg-red-50 p-4 border border-red-200 space-y-1 text-left">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-red-900">
                      <AlertTriangle size={15} className="text-red-600 shrink-0" />
                      <span>{errorInfo.title}</span>
                    </div>
                    <p className="text-xs text-red-700 leading-relaxed">
                      {errorInfo.message}
                    </p>
                  </div>
                )}

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorInfo(null);
                      setStep('SCANNER');
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-primary transition cursor-pointer inline-flex items-center gap-1"
                  >
                    <Camera size={14} />
                    <span>Return to Camera Scanner</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: TEAM SHOWCASE & PRODUCTS CAROUSEL & ELIGIBILITY */}
            {isOfficialSeceUser && !authChecking && step === 'TEAM_VIEW' && teamData && (
              <div className="space-y-4 animate-fade-in">
                {/* Team Card Header */}
                <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50/40 p-4 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100/80 px-2.5 py-0.5 text-[11px] font-black text-primary uppercase tracking-wider">
                      <Building2 size={12} />
                      {teamData.team.department}
                    </span>
                    <span className="font-mono text-xs font-black text-accent bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                      {teamData.team.registration_id}
                    </span>
                  </div>

                  <h3 className="font-heading text-lg sm:text-xl font-black text-[#0B1B3A] tracking-tight">
                    {teamData.team.team_name}
                  </h3>
                </div>

                {/* Multiple Ideas / Products Section (Requirement 15) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Lightbulb size={14} className="text-amber-500" />
                      {teamData.products.length > 1
                        ? `Idea ${activeIdeaIndex + 1} of ${teamData.products.length}`
                        : 'Team Innovation Project'}
                    </span>
                    {teamData.products.length > 1 && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setActiveIdeaIndex(prev => Math.max(0, prev - 1))}
                          disabled={activeIdeaIndex === 0}
                          className="h-6 w-6 rounded-md bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 disabled:opacity-30 cursor-pointer"
                          aria-label="Previous Idea"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveIdeaIndex(prev => Math.min(teamData.products.length - 1, prev + 1))}
                          disabled={activeIdeaIndex === teamData.products.length - 1}
                          className="h-6 w-6 rounded-md bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 disabled:opacity-30 cursor-pointer"
                          aria-label="Next Idea"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {currentIdea && (
                    <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-extrabold text-sm text-slate-900 leading-snug">
                          {currentIdea.product_title}
                        </h4>
                        {currentIdea.trl_level && (
                          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700 border border-amber-200 shrink-0">
                            TRL {currentIdea.trl_level}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-bold text-primary">
                        Domain: {currentIdea.innovation_domain || 'Open Innovation'}
                      </p>
                      {currentIdea.problem_area && (
                        <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                          {currentIdea.problem_area}
                        </p>
                      )}
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400 italic text-center">
                    Note: Voting is cast at the TEAM level. One vote per student per team.
                  </p>
                </div>

                {/* Team Members Roster */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <Users size={14} className="text-primary" />
                    <span>Team Members</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {teamData.members.map((m, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl bg-slate-50 p-2.5 border border-slate-200 text-center"
                      >
                        <p className="font-bold text-xs text-slate-900 truncate" title={m.name}>{m.name}</p>
                        <p className="text-[10px] text-primary font-semibold">{m.role}</p>
                        <p className="text-[10px] text-slate-500 truncate" title={m.department}>{m.department}</p>
                      </div>
                    ))}
                  </div>

                  <p className="text-[10px] text-slate-400 italic text-center">
                    Mentor department is completely ignored from voter eligibility.
                  </p>
                </div>

                {/* Ineligibility Banner or Confirm / Vote Action */}
                <div className="pt-2">
                  {!eligibility.can_vote ? (
                    <div className="rounded-2xl bg-amber-50 p-4 border border-amber-200 flex items-start gap-3">
                      <ShieldAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1 text-left">
                        <h4 className="font-bold text-xs text-amber-900 uppercase tracking-wider">
                          {eligibility.error_code || 'VOTING RESTRICTION'}
                        </h4>
                        <p className="text-xs text-amber-800 leading-relaxed font-medium">
                          {eligibility.reason}
                        </p>
                      </div>
                    </div>
                  ) : showConfirm ? (
                    /* Step 4B: Vote Confirmation (Requirement 16) */
                    <div className="rounded-2xl bg-slate-50 p-5 border border-slate-300 space-y-4 text-center animate-fade-in">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-white mx-auto shadow-md">
                        <Vote size={24} />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-heading text-base font-extrabold text-slate-900">
                          CAST YOUR VOTE?
                        </h4>
                        <p className="text-xs text-slate-600">
                          Team: <strong>{teamData.team.team_name}</strong> ({teamData.team.registration_id})
                        </p>
                        {currentIdea && (
                          <p className="text-[11px] text-slate-500">
                            Project: <em>{currentIdea.product_title}</em>
                          </p>
                        )}
                        <p className="text-[11px] text-amber-800 font-semibold pt-1">
                          This vote is final, permanent, and recorded on the live database ledger.
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowConfirm(false)}
                          disabled={voting}
                          className="w-1/2 rounded-xl border border-slate-300 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleCastVote}
                          disabled={voting}
                          className="w-1/2 rounded-xl bg-accent py-2.5 text-xs font-black text-white shadow-md hover:bg-amber-600 transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          {voting ? (
                            <>
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              <span>Recording...</span>
                            </>
                          ) : (
                            <span>Confirm Vote</span>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Step 4A: Cast Vote Trigger Button */
                    <div className="space-y-3">
                      <div className="rounded-2xl bg-emerald-50 p-3 border border-emerald-200 flex items-center gap-2">
                        <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
                        <span className="text-xs font-bold text-emerald-800">
                          You are eligible to vote for this team.
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowConfirm(true)}
                        className="w-full rounded-2xl bg-accent py-3.5 text-sm font-black text-white shadow-md hover:bg-amber-600 active:scale-[0.99] transition cursor-pointer flex items-center justify-center gap-2"
                      >
                        <Vote size={18} />
                        <span>Cast Official Vote for Team</span>
                      </button>
                    </div>
                  )}

                  {errorInfo && (
                    <div className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2 border border-red-200">
                      <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                      <span>{errorInfo.message}</span>
                    </div>
                  )}
                </div>

                {/* Reset / Change Team */}
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setTeamData(null);
                      setActiveToken('');
                      setTeamIdentifier('');
                      setErrorInfo(null);
                      setStep('SCANNER');
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-primary transition cursor-pointer"
                  >
                    ← Scan or Enter a Different Team
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: VOTE SUCCESS CONFIRMATION (Requirement 16 & 24) */}
            {isOfficialSeceUser && !authChecking && step === 'SUCCESS' && voteSuccess && (
              <div className="py-8 text-center space-y-4 animate-fade-in">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 text-white mx-auto shadow-lg">
                  <CheckCircle2 size={36} />
                </div>
                <div className="space-y-1">
                  <h3 className="font-heading text-lg sm:text-xl font-black text-emerald-950">
                    VOTE RECORDED ✓
                  </h3>
                  <p className="text-xs text-emerald-800 max-w-sm mx-auto leading-relaxed">
                    Your vote has been successfully recorded for <strong>{voteSuccess.team_name}</strong>.
                  </p>
                </div>

                <div className="pt-1">
                  <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-emerald-100 text-emerald-900 text-xs font-black">
                    <Sparkles size={14} className="text-amber-500" />
                    New Total: {voteSuccess.new_vote_count} votes
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4 max-w-xs mx-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setVoteSuccess(null);
                      setTeamData(null);
                      setActiveToken('');
                      setTeamIdentifier('');
                      setStep('SCANNER');
                    }}
                    className="py-2.5 px-3 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Vote for Another
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="py-2.5 px-3 rounded-xl bg-primary text-xs font-bold text-white hover:bg-primary/90 transition shadow-sm cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* Footer Bar */}
          <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
            <span>IPL 2026 Live Voting Engine</span>
            <span>SECE Official</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
