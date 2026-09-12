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
  const [activeTab, setActiveTab] = useState('ID') // 'ID' | 'SCANNER'
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

  // Reset state on modal open
  useEffect(() => {
    if (isOpen) {
      setErrorMsg('')
      setMultiProducts(null)
      setResolvedTeamName('')
      setScannerActive(false)
      setActiveTab('ID')
      setCameraError('')
      if (initialIdentifier) {
        setIdentifier(initialIdentifier)
        resolveIdentifier(initialIdentifier)
      } else {
        setIdentifier('')
      }
    } else {
      stopScanner()
      setActiveTab('ID')
    }
  }, [isOpen, initialIdentifier])

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

  // Clean up camera on tab change or unmount
  useEffect(() => {
    if (activeTab !== 'SCANNER') {
      stopScanner()
    }
    return () => {
      stopScanner()
    }
  }, [activeTab, stopScanner])

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
    if (!elem) {
      setTimeout(() => startScanner(camId), 100)
      return
    }

    try {
      const qrScanner = new Html5Qrcode('public-idea-qr-reader')
      html5QrCodeRef.current = qrScanner

      let availableCameras = cameras
      if (availableCameras.length === 0) {
        try {
          const devices = await Html5Qrcode.getCameras()
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
  }, [cameras, selectedCameraId, stopScanner])

  const handleSelectProductChoice = (prodId) => {
    stopScanner()
    onSelectProduct(prodId)
    onClose()
  }

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
                IPL 2026 Voting Access
              </span>
              <h2 id="idea-resolver-title" className="text-lg font-black text-slate-900 font-heading">
                Vote for an Idea
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopScanner()
              setActiveTab('ID')
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
          /* SCANNER ACTIVE VIEW */
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  stopScanner()
                  setActiveTab('ID')
                }}
                className="text-xs font-bold text-accent hover:text-amber-700 transition flex items-center gap-1 cursor-pointer"
              >
                ← Enter ID instead
              </button>
              {cameras.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const nextCam = cameras.find(c => c.id !== selectedCameraId) || cameras[0]
                    setSelectedCameraId(nextCam.id)
                    startScanner(nextCam.id)
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1"
                >
                  <RefreshCw size={12} /> Switch Camera
                </button>
              )}
            </div>

            <div className="relative mx-auto w-full max-w-[280px] aspect-square rounded-2xl overflow-hidden bg-slate-950 border border-slate-200 flex items-center justify-center shadow-inner">
              <div id="public-idea-qr-reader" className="w-full h-full" />

              {!scannerActive && !cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-900 text-white">
                  <MechanicalLoader size={32} className="text-accent mb-3" />
                  <p className="text-xs font-semibold">Starting camera...</p>
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-900 text-white space-y-3">
                  <AlertTriangle size={32} className="text-amber-400" />
                  <p className="text-xs text-slate-300 leading-snug">{cameraError}</p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => startScanner()}
                      className="rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600 transition"
                    >
                      Retry Camera
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopScanner()
                        setActiveTab('ID')
                      }}
                      className="rounded-full bg-slate-700 px-4 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-600 transition"
                    >
                      Enter ID
                    </button>
                  </div>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500">
              Point your camera at an IPL 2026 Innovation Idea QR code.
            </p>

            {/* Error Message Display */}
            {errorMsg && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-start gap-2 animate-in fade-in duration-150 text-left">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-500" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        ) : (
          /* DEFAULT VIEW: SCAN QR (OR) ENTER IDEA ID */
          <div className="space-y-4">
            {/* Method 1: Scan QR */}
            <div>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('')
                  setActiveTab('SCANNER')
                  startScanner()
                }}
                className="w-full flex items-center justify-between rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/60 hover:bg-amber-50 hover:border-accent p-4 transition-all group cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white shadow-sm group-hover:scale-105 transition-transform shrink-0">
                    <Camera size={22} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                      Scan QR
                    </h4>
                    <p className="text-xs text-slate-500">
                      Scan the QR code of an idea
                    </p>
                  </div>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100/80 text-amber-700 group-hover:bg-accent group-hover:text-white transition shrink-0">
                  <ChevronRight size={16} />
                </div>
              </button>
            </div>

            {/* Visual Divider: OR */}
            <div className="relative flex items-center justify-center py-1">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 shrink-0">
                OR
              </span>
            </div>

            {/* Method 2: Enter Idea ID */}
            <div className="space-y-3">
              <div>
                <label htmlFor="resolver-identifier" className="block text-xs font-bold uppercase tracking-wider text-slate-500 font-heading mb-1.5">
                  Enter Idea ID
                </label>
                <div className="relative">
                  <input
                    id="resolver-identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') resolveIdentifier()
                    }}
                    placeholder="e.g. IPL26-0001 or Product UUID"
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-4 pr-10 text-sm text-slate-900 focus:border-accent focus:outline-none shadow-xs font-mono"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => resolveIdentifier()}
                    disabled={resolving || !identifier.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-accent p-2 text-white hover:bg-amber-600 disabled:opacity-40 transition cursor-pointer"
                    aria-label="Search Idea"
                  >
                    <ArrowRight size={14} />
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Enter Team Registration ID, Product ID, or QR Code.
                </p>
              </div>

              <button
                type="button"
                onClick={() => resolveIdentifier()}
                disabled={resolving || !identifier.trim()}
                className="w-full rounded-full bg-accent py-3 text-xs font-extrabold text-white shadow-md hover:bg-amber-600 transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {resolving ? (
                  <>
                    <MechanicalLoader size={16} className="text-white" />
                    <span>Resolving Idea...</span>
                  </>
                ) : (
                  <span>Open Idea</span>
                )}
              </button>
            </div>

            {/* Error Message Display */}
            {errorMsg && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-start gap-2 animate-in fade-in duration-150">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-500" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
