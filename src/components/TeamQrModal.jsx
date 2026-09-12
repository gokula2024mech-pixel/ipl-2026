import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, QrCode, Share2, Download, Check, ChevronRight } from 'lucide-react';
import QRCode from 'qrcode';

export default function TeamQrModal({ isOpen, onClose, team, showToast }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const teamName = team?.teamName || team?.team_name || 'Team';
  const regId = team?.registrationId || team?.registration_id || 'IPL26-TEAM';
  const qrToken = team?.qrToken || team?.qr_token || '';
  const products = team?.products || team?.ideas || [];

  const [selectedProduct, setSelectedProduct] = useState(() => {
    if (team?.productId || team?.product_id) {
      const targetId = team.productId || team.product_id;
      return products.find(p => (p.id || p.productId || p.product_id) === targetId) || null;
    }
    if (products.length === 1) {
      return products[0];
    }
    return null;
  });

  useEffect(() => {
    if (team?.productId || team?.product_id) {
      const targetId = team.productId || team.product_id;
      const match = products.find(p => (p.id || p.productId || p.product_id) === targetId);
      if (match) {
        setSelectedProduct(match);
      } else {
        setSelectedProduct({ id: targetId, product_title: team?.productTitle || team?.product_title || '' });
      }
    } else if (products.length === 1) {
      setSelectedProduct(products[0]);
    } else if (!team?.productId && products.length > 1) {
      setSelectedProduct(null);
    }
  }, [team, isOpen]);

  const activeProductId = selectedProduct?.id || selectedProduct?.productId || selectedProduct?.product_id || team?.productId || team?.product_id || '';
  const activeProductTitle = selectedProduct?.product_title || selectedProduct?.title || team?.productTitle || team?.product_title || '';
  const activeProductNumber = selectedProduct?.product_number || '';

  const votingUrl = typeof window !== 'undefined'
    ? (activeProductId 
        ? `${window.location.origin}/#idea?id=${activeProductId}`
        : `${window.location.origin}/?token=${qrToken}#vote`)
    : (activeProductId 
        ? `/#idea?id=${activeProductId}`
        : `/?token=${qrToken}#vote`);

  useEffect(() => {
    if (!isOpen || (!qrToken && !activeProductId)) {
      setQrDataUrl('');
      return;
    }

    let isMounted = true;
    setGenerating(true);

    QRCode.toDataURL(votingUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0B1B3A',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'H'
    })
      .then((url) => {
        if (isMounted) {
          setQrDataUrl(url);
          setGenerating(false);
        }
      })
      .catch((err) => {
        console.error('Error generating QR code:', err);
        if (isMounted) setGenerating(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, qrToken, activeProductId, votingUrl]);

  if (!isOpen) return null;

  const handleShare = async () => {
    const shareTitle = activeProductTitle
      ? `Vote for ${teamName} - ${activeProductTitle}`
      : `Vote for ${teamName} - IPL 2026`;
    const shareText = activeProductTitle
      ? `Scan or open this link to explore "${activeProductTitle}" by ${teamName} (${regId}) at IPL 2026!`
      : `Scan or open this link to vote for team ${teamName} (${regId}) at IPL 2026!`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: votingUrl,
        });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }

    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(votingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      if (showToast) {
        showToast({
          type: 'success',
          title: 'Link Copied',
          message: 'Voting URL copied to clipboard.'
        });
      }
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    const suffix = activeProductNumber ? `_Product_${activeProductNumber}` : (activeProductId ? `_Idea` : '');
    a.download = `IPL2026_${regId.replace(/[^a-zA-Z0-9_-]/g, '_')}${suffix}_QR.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (showToast) {
      showToast({
        type: 'success',
        title: 'QR Downloaded',
        message: 'High-resolution QR code image saved.'
      });
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-[#0B1B3A]/80 backdrop-blur-sm"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-sm rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden z-10 my-auto text-slate-800"
        >
          {/* Header */}
          <div className="relative bg-gradient-to-r from-[#0B1B3A] via-[#1E3A8A] to-[#0B1B3A] px-5 py-4 text-white text-center">
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3.5 right-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white transition cursor-pointer"
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-0.5 text-[11px] font-black text-amber-400 border border-amber-400/30 uppercase tracking-wider mb-1">
              <QrCode size={13} />
              Team QR Code
            </div>
            <p className="text-xs font-mono font-bold text-amber-300">
              {regId}
            </p>
            <h2 className="font-heading text-base sm:text-lg font-extrabold tracking-tight truncate mt-0.5" title={teamName}>
              {teamName}
            </h2>
          </div>

          {/* Product Selection Mode for Multi-Product Teams when not selected */}
          {!activeProductId && products.length > 1 ? (
            <div className="p-6 space-y-4">
              <div className="text-center">
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                  Select Idea to Generate QR
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  This team has multiple projects. Choose which innovation idea to view or generate a dedicated QR code for:
                </p>
              </div>

              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {products.map((prod, idx) => (
                  <button
                    key={prod.id || idx}
                    type="button"
                    onClick={() => setSelectedProduct(prod)}
                    className="w-full text-left p-3.5 rounded-2xl border border-slate-200 hover:border-primary hover:bg-slate-50/80 transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-bold text-accent uppercase tracking-wider bg-amber-100/70 px-1.5 py-0.5 rounded">
                          Product #{prod.product_number || idx + 1}
                        </span>
                        {prod.trl_level && (
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            TRL {prod.trl_level}
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-slate-900 group-hover:text-primary transition-colors line-clamp-2">
                        {prod.product_title || prod.title || 'Innovation Idea'}
                      </h4>
                      {prod.innovation_domain && (
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                          {prod.innovation_domain}
                        </p>
                      )}
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 group-hover:bg-primary group-hover:text-white transition shrink-0">
                      <ChevronRight size={14} />
                    </div>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            /* Standard QR Code Display */
            <div className="p-6 text-center space-y-4">
              {/* Switch Idea Bar for Multi-Product Teams */}
              {products.length > 1 && (
                <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600 truncate pr-2">
                    {activeProductNumber ? `Product #${activeProductNumber}` : 'Selected Idea'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(null)}
                    className="text-[11px] font-bold text-primary hover:underline cursor-pointer shrink-0"
                  >
                    Switch Idea
                  </button>
                </div>
              )}

              {/* QR Code Canvas / Image Display */}
              <div className="rounded-2xl bg-white p-3 border-2 border-slate-200 shadow-md inline-block mx-auto">
                {generating ? (
                  <div className="h-60 w-60 flex flex-col items-center justify-center gap-2 text-slate-400">
                    <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
                    <span className="text-xs font-semibold">Generating QR...</span>
                  </div>
                ) : qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR Code for ${activeProductTitle || teamName}`}
                    className="w-56 h-56 sm:w-64 sm:h-64 object-contain rounded-lg mx-auto select-none"
                  />
                ) : (
                  <div className="h-60 w-60 flex items-center justify-center text-xs text-slate-400">
                    Unable to load QR image
                  </div>
                )}
              </div>

              <div>
                {activeProductTitle ? (
                  <>
                    <p className="text-xs font-bold text-slate-900 line-clamp-1" title={activeProductTitle}>
                      QR for: <span className="text-primary">{activeProductTitle}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Scan to view this exact idea
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold text-slate-800">
                      Scan this QR to vote for this team.
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Displays team innovation showcase and records authoritative live votes.
                    </p>
                  </>
                )}
                {activeProductId && (
                  <p className="text-[10px] font-mono text-slate-400 mt-1 truncate">
                    /#idea?id={activeProductId}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleShare}
                  className="w-full py-2.5 px-3 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copied ? <Check size={14} /> : <Share2 size={14} />}
                  <span>{copied ? 'Copied!' : 'Share QR'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!qrDataUrl}
                  className="w-full py-2.5 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Download size={14} />
                  <span>Download</span>
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          )}

          {/* Footer Bar */}
          <div className="bg-slate-50 px-5 py-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
            <span>IPL 2026 Permanent Identity</span>
            <span>SECE Official</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

