import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Search,
  QrCode,
  Lightbulb,
  ArrowRight,
  Camera,
  AlertTriangle,
  Sparkles,
  Users,
  ChevronRight,
  Layers,
  RefreshCw
} from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import MechanicalLoader from './MechanicalLoader'

export default function IdeaResolutionModal({
  isOpen,
  onClose,
  onSelectProduct,
  initialIdentifier = ''
}) {
  const [activeTab, setActiveTab] = useState('SCANNER') // 'SCANNER' | 'ID'
  const [identifier, setIdentifier] = useState('')
  const [resolving, setResolving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  
  // Multi-product selection state
  const [multiProducts, setMultiProducts] = useState(null)
  const [resolvedTeamName, setResolvedTeamName] = useState('')

  // QR Scanner state
  const [scannerActive, setScannerActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [cameras, setCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const html5QrCodeRef = useRef(null)

  const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')
  const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl.slice(0, -4) : rawApiUrl

  // Stop camera helper
  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop()
        }
        await html5QrCodeRef.current.clear()
      } catch (err) {
        console.warn('[IdeaScanner] Error stopping camera:', err)
      } finally {
        html5QrCodeRef.current = null
        setScannerActive(false)
      }
    }
  }, [])

  // Authoritative Resolver Function
  const resolveIdentifier = async (rawCode) => {
    const code = (rawCode || identifier || '').trim()
    if (!code) {
      setErrorMsg('Please enter a Team ID, Product ID, or QR code.')
      return
    }

    setResolving(true)
    setErrorMsg('')
    setMultiProducts(null)

    try {
      const res = await fetch(`${API_BASE_URL}/api/ideas/resolve/${encodeURIComponent(code)}`)
      const data = await res.json()

      if (!res.ok || !data.success) {
        const errorText = data?.error_code === 'QR_INACTIVE'
          ? 'This QR code is currently inactive.'
          : 'QR code not recognized. Please verify and try again.'
        setErrorMsg(errorText)
        return
      }

      // Check resolution type
      const type = data.resolution_type

      if (type === 'direct_product' || type === 'team_single' || type === 'qr_product' || type === 'qr_team_single') {
        const targetProductId = data.product_id || data.product?.product_id
        if (targetProductId) {
          stopScanner()
          onSelectProduct(targetProductId)
          onClose()
        } else {
          setErrorMsg('Unable to determine the product ID from resolution.')
        }
      } else if (type === 'team_multi' || type === 'qr_team_multi') {
        // Multiple products: Present choice list
        setResolvedTeamName(data.team_name || 'Innovation Team')
        setMultiProducts(data.products || [])
      } else {
        setErrorMsg('Unexpected resolution response. Please try again.')
      }
    } catch (err) {
      console.error('[IdeaResolutionModal] Resolution error:', err)
      setErrorMsg('Network error connecting to resolution server. Please check your connection.')
    } finally {
      setResolving(false)
    }
  }

  // Camera Scanner Launcher
  const startScanner = useCallback(async (camId = null) => {
    setCameraError('')
    await stopScanner()

    const elem = document.getElementById('public-idea-qr-reader')
    if (!elem) return

    try {
      const qrScanner = new Html5Qrcode('public-idea-qr-reader')
      html5QrCodeRef.current = qrScanner

      let availableCameras = cameras
      if (availableCameras.length === 0) {
        try {
          const devices = await Html5Qrcode.getCameras().catch(() => [])
          if (devices && devices.length > 0) {
            availableCameras = devices
            setCameras(devices)
          }
        } catch (e) {
          console.warn('[IdeaScanner] Error getting camera devices:', e)
        }
      }

      let chosenCameraId = camId || selectedCameraId
      if (!chosenCameraId && availableCameras.length > 0) {
        const backCam = availableCameras.find(
          c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('rear') || c.label.toLowerCase().includes('environment')
        )
        chosenCameraId = backCam ? backCam.id : availableCameras[0].id
        setSelectedCameraId(chosenCameraId)
      }

      const cameraConfig = chosenCameraId ? { deviceId: { exact: chosenCameraId } } : { facingMode: 'environment' }

      await qrScanner.start(
        cameraConfig,
        {
          fps: 10,
          qrbox: { width: 240, height: 240 },
          aspectRatio: 1.0
        },
        async (decodedText) => {
          // Scanned successfully!
          await stopScanner()
          resolveIdentifier(decodedText)
        },
        () => {}
      )

      setScannerActive(true)
    } catch (err) {
      console.error('[IdeaScanner] Camera start error:', err)
      setScannerActive(false)
      const errStr = (err?.message || String(err)).toLowerCase()
      if (errStr.includes('notallowederror') || errStr.includes('permission')) {
        setCameraError('Camera access denied. Please grant camera permission in your browser to scan QR codes.')
      } else if (errStr.includes('notfounderror') || errStr.includes('no camera')) {
        setCameraError('No camera found on your device. Please enter the code manually.')
      } else {
        setCameraError('Unable to access camera. Please enter your Team ID or code manually.')
      }
    }
  }, [selectedCameraId, stopScanner])

  const handleSelectProductChoice = (prodId) => {
    stopScanner()
    onSelectProduct(prodId)
    onClose()
  }

  // Reset state on modal open
  useEffect(() => {
    if (isOpen) {
      setErrorMsg('')
      setMultiProducts(null)
      setResolvedTeamName('')
      setScannerActive(false)
      setCameraError('')
      if (initialIdentifier) {
        setActiveTab('ID')
        setIdentifier(initialIdentifier)
        resolveIdentifier(initialIdentifier)
      } else {
        setActiveTab('SCANNER')
        setIdentifier('')
      }
    } else {
      stopScanner()
      setActiveTab('SCANNER')
    }
  }, [isOpen, initialIdentifier])

  // Clean up camera on tab change or unmount
  useEffect(() => {
    if (activeTab !== 'SCANNER' || !isOpen) {
      stopScanner()
    }
    return () => {
      stopScanner()
    }
  }, [isOpen, activeTab, stopScanner])

  // Launch camera when entering SCANNER tab
  useEffect(() => {
    if (isOpen && activeTab === 'SCANNER' && !multiProducts) {
      const timer = setTimeout(() => {
        startScanner().catch((e) => console.warn('[IdeaScanner] Camera start caught:', e))
      }, 250)
      return () => clearTimeout(timer)
    }
  }, [isOpen, activeTab, multiProducts, startScanner])

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="idea-resolver-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={() => {
          stopScanner()
          onClose()
        }}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl z-10 space-y-6 text-left transform animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-accent border border-amber-200/80 shadow-xs">
              <Lightbulb size={22} />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-accent font-heading block">
                IPL 2026 Voting
              </span>
              <h2 id="idea-resolver-title" className="text-lg font-black text-slate-900 font-heading">
                {multiProducts ? 'Select Idea' : activeTab === 'SCANNER' ? 'Scan Idea QR' : 'Enter Team ID'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopScanner()
              setActiveTab('SCANNER')
              onClose()
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* MULTI-PRODUCT SELECTION SCREEN (E.g. ChameleX) */}
        {multiProducts && multiProducts.length > 0 ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-amber-50/70 border border-amber-200/80 p-4">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-accent block font-heading">
                Multiple Projects Found
              </span>
              <p className="text-xs text-slate-700 mt-0.5">
                Team <strong>{resolvedTeamName}</strong> has submitted {multiProducts.length} innovation projects. Please select the idea you would like to view and support:
              </p>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {multiProducts.map((prod, idx) => (
                <button
                  key={prod.product_id || idx}
                  type="button"
                  onClick={() => handleSelectProductChoice(prod.product_id)}
                  className="w-full text-left rounded-2xl border border-slate-200 hover:border-accent hover:bg-amber-50/30 p-4 transition-all group flex items-center justify-between cursor-pointer shadow-xs"
                >
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-accent uppercase tracking-wider bg-amber-100/70 px-2 py-0.5 rounded">
                        Product #{prod.product_number || idx + 1}
                      </span>
                      {prod.trl_level && (
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          TRL {prod.trl_level}
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors line-clamp-1">
                      {prod.product_title}
                    </h4>
                    {prod.innovation_domain && (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Domain: {prod.innovation_domain}
                      </p>
                    )}
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 group-hover:bg-accent group-hover:text-white transition shrink-0">
                    <ChevronRight size={16} />
                  </div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setMultiProducts(null)}
              className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-700 transition cursor-pointer pt-2"
            >
              ← Search a different team
            </button>
          </div>
        ) : activeTab === 'SCANNER' ? (
          /* SCANNER ACTIVE VIEW (PRIMARY) */
          <div className="space-y-3.5 text-center animate-fade-in">
            {/* Primary Instruction */}
            <div className="text-center pt-1">
              <p className="text-xs sm:text-sm font-bold text-slate-800">
                Scan the Idea QR code
              </p>
            </div>

            {/* Viewfinder Frame */}
            <div className="relative mx-auto w-full max-w-[280px] sm:max-w-[300px] aspect-square rounded-3xl overflow-hidden bg-slate-900 border-2 border-slate-800 shadow-xl flex items-center justify-center">
              <div id="public-idea-qr-reader" className="w-full h-full object-cover" />

              {/* Scanning Frame Overlay */}
              <div className="absolute inset-6 pointer-events-none border-2 border-dashed border-amber-400/80 rounded-2xl flex flex-col justify-between p-2">
                <div className="flex justify-between">
                  <div className="w-4 h-4 border-t-2 border-l-2 border-amber-400"></div>
                  <div className="w-4 h-4 border-t-2 border-r-2 border-amber-400"></div>
                </div>
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_8px_rgba(245,158,11,0.8)] motion-safe:animate-pulse"></div>
                <div className="flex justify-between">
                  <div className="w-4 h-4 border-b-2 border-l-2 border-amber-400"></div>
                  <div className="w-4 h-4 border-b-2 border-r-2 border-amber-400"></div>
                </div>
              </div>

              {!scannerActive && !cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-900/90 text-white">
                  <MechanicalLoader size={32} className="text-amber-400 mb-2" />
                  <p className="text-xs font-semibold text-slate-300">Opening Camera...</p>
                </div>
              )}
            </div>

            {/* Camera Fallback OR Switch Camera */}
            {cameraError ? (
              <div className="rounded-2xl bg-amber-50 p-3.5 border border-amber-200 text-center space-y-2 max-w-[280px] sm:max-w-[300px] mx-auto">
                <p className="text-xs font-bold text-amber-900">
                  Can't scan the QR code?
                </p>
                <button
                  type="button"
                  onClick={() => {
                    stopScanner()
                    setActiveTab('ID')
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold shadow-xs hover:bg-amber-600 transition cursor-pointer"
                >
                  <Search size={13} />
                  <span>Enter Team ID</span>
                </button>
              </div>
            ) : (
              <>
                {cameras.length > 1 && (
                  <div className="flex justify-center text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        const nextCam = cameras.find(c => c.id !== selectedCameraId) || cameras[0]
                        setSelectedCameraId(nextCam.id)
                        startScanner(nextCam.id)
                      }}
                      className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 font-semibold cursor-pointer py-1 px-3 rounded-lg hover:bg-slate-100 transition"
                    >
                      <RefreshCw size={13} />
                      <span>Switch Camera</span>
                    </button>
                  </div>
                )}

                {/* Small secondary fallback link at bottom */}
                <div className="pt-2 text-center border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      stopScanner()
                      setActiveTab('ID')
                    }}
                    className="text-xs font-semibold text-slate-500 hover:text-accent transition cursor-pointer inline-flex items-center gap-1"
                  >
                    <span>Can't scan?</span>
                    <span className="font-bold underline text-accent">Enter Team ID</span>
                  </button>
                </div>
              </>
            )}

            {/* Error Message Display */}
            {errorMsg && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-start gap-2 animate-in fade-in duration-150 text-left">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-500" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        ) : (
          /* MANUAL TEAM ID ENTRY VIEW (FALLBACK) */
          <div className="space-y-4 animate-fade-in py-2">
            <div className="text-center space-y-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-accent border border-amber-200/60 mx-auto mb-2">
                <Search size={20} />
              </div>
              <h3 className="font-extrabold text-base text-slate-900">Enter Team ID</h3>
            </div>

            <div className="space-y-3 max-w-sm mx-auto">
              <div className="flex gap-2">
                <input
                  id="resolver-identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') resolveIdentifier()
                  }}
                  placeholder="IPL26-0439"
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-mono text-slate-900 uppercase focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => resolveIdentifier()}
                  disabled={resolving || !identifier.trim()}
                  className="rounded-xl bg-accent px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50 cursor-pointer transition flex items-center justify-center gap-1.5 shrink-0"
                >
                  {resolving ? (
                    <MechanicalLoader size={14} className="text-white" />
                  ) : (
                    <span>Find Team</span>
                  )}
                </button>
              </div>

              {/* Error Message Display */}
              {errorMsg && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-start gap-2 animate-in fade-in duration-150 text-left">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-500" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('')
                    setActiveTab('SCANNER')
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-accent transition cursor-pointer inline-flex items-center gap-1"
                >
                  <span>← Back to Scanner</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
