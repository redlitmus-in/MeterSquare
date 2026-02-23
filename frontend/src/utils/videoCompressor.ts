/**
 * Client-side video compression using Canvas + MediaRecorder API.
 * Reduces video file size before uploading to server.
 */

interface CompressOptions {
  maxSizeMB?: number;
  maxWidth?: number;
  maxHeight?: number;
  videoBitrate?: number;
}

const DEFAULT_OPTIONS: Required<CompressOptions> = {
  maxSizeMB: 50,
  maxWidth: 1280,
  maxHeight: 720,
  videoBitrate: 1_500_000, // 1.5 Mbps
};

/**
 * Compress a video file using Canvas re-encoding.
 * Returns the original file if compression isn't supported or file is already small enough.
 */
export async function compressVideo(
  file: File,
  options: CompressOptions = {},
  onProgress?: (progress: number) => void,
): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const maxSizeBytes = opts.maxSizeMB * 1024 * 1024;

  // Skip if already under the limit
  if (file.size <= maxSizeBytes) {
    return file;
  }

  // Check browser support
  if (typeof MediaRecorder === 'undefined' || typeof HTMLVideoElement === 'undefined') {
    console.warn('Video compression not supported in this browser');
    return file;
  }

  // Check if WebM encoding is supported
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : null;

  if (!mimeType) {
    console.warn('No supported video encoding format found');
    return file;
  }

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    video.onloadedmetadata = () => {
      // Calculate scaled dimensions
      let { videoWidth: w, videoHeight: h } = video;
      if (w > opts.maxWidth || h > opts.maxHeight) {
        const scale = Math.min(opts.maxWidth / w, opts.maxHeight / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;

      const stream = canvas.captureStream(30); // 30 fps
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: opts.videoBitrate,
      });

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        URL.revokeObjectURL(objectUrl);
        const blob = new Blob(chunks, { type: 'video/webm' });
        const compressedName = file.name.replace(/\.[^.]+$/, '.webm');
        const compressed = new File([blob], compressedName, { type: 'video/webm', lastModified: Date.now() });

        // Use compressed only if it's actually smaller
        if (compressed.size < file.size) {
          resolve(compressed);
        } else {
          resolve(file);
        }
      };

      recorder.start(100); // collect data every 100ms

      video.currentTime = 0;
      video.play();

      const duration = video.duration;
      const drawFrame = () => {
        if (video.ended || video.paused) {
          recorder.stop();
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        if (onProgress && duration > 0) {
          onProgress(Math.min(video.currentTime / duration, 1));
        }
        requestAnimationFrame(drawFrame);
      };

      video.onplay = () => requestAnimationFrame(drawFrame);
      video.onended = () => recorder.stop();

      // Safety timeout: if video is longer than 5 minutes, skip compression
      if (duration > 300) {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // Return original on error
    };
  });
}
