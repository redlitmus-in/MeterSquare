/**
 * PDFShift Service
 * Professional PDF generation service using PDFShift API
 * Supports headers, footers, and high-quality rendering
 */

import axios from 'axios';
import { showSuccess, showError, showWarning, showInfo, showLoading, dismissToast } from '@/utils/toastHelper';

// Get API key from environment variable
const PDFSHIFT_API_KEY = import.meta.env.VITE_PDFSHIFT_API_KEY || '';

interface PDFOptions {
  filename: string;
  landscape?: boolean;
  format?: 'A4' | 'Letter' | 'Legal';
  margin?: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
}

/**
 * Generate PDF using PDFShift with proper header/footer support
 */
export const generatePDF = async (
  htmlContent: string,
  options: PDFOptions
): Promise<boolean> => {
  try {
    // Validate API key
    if (!PDFSHIFT_API_KEY) {
      console.error('PDFShift API key is not configured');
      showError('PDF service not configured. Please contact administrator.');
      return false;
    }

    // Show loading toast
    const loadingToast = showLoading('Generating professional PDF...');

    // Call PDFShift API
    const response = await axios.post(
      'https://api.pdfshift.io/v3/convert/pdf',
      {
        source: htmlContent,
        landscape: options.landscape || false,
        format: options.format || 'A4',
        margin: options.margin || {
          top: '0mm',
          bottom: '0mm',
          left: '0mm',
          right: '0mm'
        },
        // Enable print CSS for better rendering
        use_print: true,
        // Wait for images to load
        wait_for: {
          delay: 1000  // Wait 1 second for Supabase images
        },
        // Enable JavaScript for dynamic content
        javascript: true,
        // High quality rendering
        rendering: {
          quality: 100
        }
      },
      {
        auth: {
          username: 'api',
          password: PDFSHIFT_API_KEY
        },
        responseType: 'blob',
        timeout: 30000  // 30 seconds timeout
      }
    );

    // Download PDF
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = options.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Success
    dismissToast(loadingToast);
    showSuccess('PDF generated successfully!');
    return true;

  } catch (error: any) {
    console.error('PDF generation failed:', error);

    // Show error message
    if (error.response?.status === 401) {
      showError('PDF service authentication failed. Invalid API key.');
    } else if (error.response?.status === 429) {
      showError('PDF generation limit reached. Please try again later.');
    } else if (error.code === 'ECONNABORTED') {
      showError('PDF generation timeout. Please try again.');
    } else {
      showError('Failed to generate PDF. Please try again.');
    }

    return false;
  }
};

/**
 * Generate PDF and return as blob (for email attachments)
 */
export const generatePDFBlob = async (
  htmlContent: string,
  options: Omit<PDFOptions, 'filename'>
): Promise<Blob | null> => {
  try {
    if (!PDFSHIFT_API_KEY) {
      console.error('PDFShift API key is not configured');
      return null;
    }

    const response = await axios.post(
      'https://api.pdfshift.io/v3/convert/pdf',
      {
        source: htmlContent,
        landscape: options.landscape || false,
        format: options.format || 'A4',
        margin: options.margin || {
          top: '0mm',
          bottom: '0mm',
          left: '0mm',
          right: '0mm'
        },
        use_print: true,
        wait_for: {
          delay: 1000
        },
        javascript: true,
        rendering: {
          quality: 100
        }
      },
      {
        auth: {
          username: 'api',
          password: PDFSHIFT_API_KEY
        },
        responseType: 'blob',
        timeout: 30000
      }
    );

    return new Blob([response.data], { type: 'application/pdf' });

  } catch (error) {
    console.error('PDF blob generation failed:', error);
    return null;
  }
};

/**
 * Validate PDFShift API key
 */
export const validatePDFShiftKey = async (): Promise<boolean> => {
  try {
    if (!PDFSHIFT_API_KEY) {
      return false;
    }

    // Test with minimal HTML
    const response = await axios.post(
      'https://api.pdfshift.io/v3/convert/pdf',
      {
        source: '<html><body><h1>Test</h1></body></html>',
        format: 'A4'
      },
      {
        auth: {
          username: 'api',
          password: PDFSHIFT_API_KEY
        },
        responseType: 'blob',
        timeout: 5000
      }
    );

    return response.status === 200;

  } catch (error) {
    return false;
  }
};

export default {
  generatePDF,
  generatePDFBlob,
  validatePDFShiftKey
};
