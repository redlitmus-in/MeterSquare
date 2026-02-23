import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, FileText, Eye, ExternalLink } from 'lucide-react';

export interface EvidenceItem {
  url: string;
  file_name?: string;
  file_type?: string;
}

interface EvidenceLightboxProps {
  evidence: EvidenceItem[];
  isOpen: boolean;
  onClose: () => void;
  initialIndex?: number;
}

const EvidenceLightbox: React.FC<EvidenceLightboxProps> = ({
  evidence,
  isOpen,
  onClose,
  initialIndex = 0,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  if (!isOpen || evidence.length === 0) return null;

  const current = evidence[currentIndex];
  const fileUrl = current?.url || '';
  const fileName = current?.file_name || '';
  const fileType = current?.file_type || '';
  const isVideo = fileType.startsWith('video') || /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(fileName) || /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(fileUrl);
  const isPdf = fileType === 'application/pdf' || /\.pdf(\?|$)/i.test(fileName) || /\.pdf(\?|$)/i.test(fileUrl);
  // Default to image if not video or PDF (most inspection evidence is photos)
  const isImage = !isVideo && !isPdf;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="relative max-w-4xl max-h-[85vh] w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute -top-10 right-0 p-2 text-white hover:text-gray-300"
            aria-label="Close lightbox"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="flex items-center justify-center bg-black rounded-xl overflow-hidden">
            {isImage && (
              <img
                src={fileUrl}
                alt={fileName}
                className="max-h-[80vh] object-contain"
              />
            )}
            {isVideo && (
              <video
                src={fileUrl}
                controls
                className="max-h-[80vh]"
              />
            )}
            {isPdf && (
              <div className="p-12 text-center text-white">
                <FileText className="w-16 h-16 mx-auto mb-4 opacity-60" />
                <p className="text-lg">{fileName}</p>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 mt-2 inline-block"
                >
                  Open file
                </a>
              </div>
            )}
          </div>

          {evidence.length > 1 && (
            <div className="flex items-center justify-center gap-4 mt-4">
              <button
                onClick={() =>
                  setCurrentIndex((i) =>
                    i === 0 ? evidence.length - 1 : i - 1,
                  )
                }
                className="p-2 text-white hover:text-gray-300"
                aria-label="Previous"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <span className="text-white text-sm">
                {currentIndex + 1} / {evidence.length}
              </span>
              <button
                onClick={() =>
                  setCurrentIndex((i) =>
                    i === evidence.length - 1 ? 0 : i + 1,
                  )
                }
                className="p-2 text-white hover:text-gray-300"
                aria-label="Next"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default EvidenceLightbox;

// ── Shared Evidence Thumbnail Card ──────────────────────────────────────────
// Use this anywhere you need a clickable evidence thumbnail that actually loads
// the image (with per-item error state) and falls back gracefully for
// videos and PDFs.

export interface EvidenceThumbnailCardProps {
  ev: { url: string; file_name?: string; file_type?: string };
  index: number;
  label: string;
  onClick: () => void;
  size?: 'sm' | 'md';
}

export const EvidenceThumbnailCard: React.FC<EvidenceThumbnailCardProps> = ({
  ev,
  index,
  label,
  onClick,
  size = 'md',
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [ev.url]);

  const isPdf = ev.file_type === 'application/pdf' || /\.pdf(\?|$)/i.test(ev.file_name || '') || /\.pdf(\?|$)/i.test(ev.url || '');
  const isVideo = !isPdf && (ev.file_type?.startsWith('video') || /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(ev.file_name || ''));

  const dim = size === 'sm' ? 'w-20 h-20' : 'w-24 h-24';
  const iconSize = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';

  if (isPdf) {
    return (
      <a
        href={ev.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex-shrink-0 flex flex-col items-center justify-between ${dim} border border-red-200 rounded-xl bg-red-50 hover:border-red-400 hover:shadow-md transition-all group p-2 gap-1`}
        title={ev.file_name || `Evidence ${index + 1}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 flex items-center justify-center w-full rounded-lg bg-red-100">
          <FileText className={`${iconSize} text-red-500`} />
        </div>
        <div className="w-full flex items-center justify-between gap-1">
          <span className="text-[10px] text-red-600 font-medium truncate leading-tight">PDF</span>
          <ExternalLink className="w-3 h-3 text-red-400 group-hover:text-red-600 flex-shrink-0" />
        </div>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={`View ${ev.file_name || `Evidence ${index + 1}`}`}
      className={`flex-shrink-0 flex flex-col items-center justify-between ${dim} border border-gray-200 rounded-xl bg-white hover:border-blue-400 hover:shadow-md transition-all group p-2 gap-1`}
    >
      <div className={`flex-1 flex items-center justify-center w-full rounded-lg overflow-hidden ${isVideo ? 'bg-gray-900' : 'bg-blue-50'}`}>
        {isVideo ? (
          <svg className={`${iconSize} text-white`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z"/>
          </svg>
        ) : imgError ? (
          <svg className={`${iconSize} text-blue-500`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 12V6.75A2.25 2.25 0 015.25 4.5h13.5A2.25 2.25 0 0121 6.75V17.25A2.25 2.25 0 0118.75 19.5H5.25A2.25 2.25 0 013 17.25V12z"/>
          </svg>
        ) : (
          <img
            src={ev.url}
            alt={ev.file_name || `Evidence ${index + 1}`}
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
            onError={() => setImgError(true)}
          />
        )}
      </div>
      <div className="w-full flex items-center justify-between gap-1">
        <span className="text-[10px] text-gray-500 truncate leading-tight">{label}</span>
        <Eye className="w-3 h-3 text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
      </div>
    </button>
  );
};
