import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, FileText } from 'lucide-react';

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
