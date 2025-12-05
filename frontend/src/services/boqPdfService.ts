/**
 * BOQ PDF Service - Unified service for downloading BOQ PDFs
 * Uses backend API for consistent, accurate PDF generation
 */

import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/**
 * Download Internal BOQ PDF (with full breakdown)
 * For internal use - shows materials, labour, costs, profit calculations
 */
export const downloadInternalBOQPDF = async (boqId: number): Promise<void> => {
  try {
    const token = localStorage.getItem('access_token');

    const response = await axios.get(`${API_URL}/boq/download/internal/${boqId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      responseType: 'blob', // Important for file download
    });

    // Create download link
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Extract filename from Content-Disposition header or use default
    const contentDisposition = response.headers['content-disposition'];
    let filename = `BOQ_Internal_${new Date().toISOString().split('T')[0]}.pdf`;

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    link.download = filename;
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

  } catch (error: any) {
    console.error('Error downloading internal BOQ PDF:', error);
    throw new Error(
      error.response?.data?.error ||
      'Failed to download internal BOQ PDF. Please try again.'
    );
  }
};

/**
 * Download Client BOQ PDF (clean view)
 * For client presentation - shows only items, sub-items, and final prices
 * @param boqId - BOQ ID
 * @param termsText - Optional custom terms text
 * @param coverPage - Optional cover page data
 * @param includeSignature - Whether to include admin signature from settings
 */
export const downloadClientBOQPDF = async (boqId: number, termsText?: string, coverPage?: any, includeSignature?: boolean): Promise<void> => {
  try {
    const token = localStorage.getItem('access_token');

    let response;

    // If coverPage is provided or signature is requested, use POST request
    if (coverPage || includeSignature) {
      response = await axios.post(
        `${API_URL}/boq/download/client/${boqId}`,
        {
          cover_page: coverPage,
          terms_text: termsText,
          include_signature: includeSignature || false
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          responseType: 'blob',
        }
      );
    } else {
      // Build URL with optional terms_text query parameter
      let url = `${API_URL}/boq/download/client/${boqId}`;
      if (termsText) {
        url += `?terms_text=${encodeURIComponent(termsText)}`;
      }

      response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        responseType: 'blob',
      });
    }

    // Create download link
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;

    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    let filename = `BOQ_Client_${new Date().toISOString().split('T')[0]}.pdf`;

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    link.download = filename;
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);

  } catch (error: any) {
    console.error('Error downloading client BOQ PDF:', error);
    throw new Error(
      error.response?.data?.error ||
      'Failed to download client BOQ PDF. Please try again.'
    );
  }
};

/**
 * Preview Client BOQ PDF in modal/new tab (with custom terms)
 * Returns blob URL for display in iframe or new tab
 * @param boqId - BOQ ID
 * @param termsText - Optional custom terms text
 * @param coverPage - Optional cover page data
 * @param includeSignature - Whether to include admin signature from settings
 */
export const previewClientBOQPDF = async (boqId: number, termsText?: string, coverPage?: any, includeSignature?: boolean): Promise<string> => {
  try {
    const token = localStorage.getItem('access_token');

    // If coverPage is provided or signature is requested, use POST request
    if (coverPage || includeSignature) {
      const response = await axios.post(
        `${API_URL}/boq/preview/client/${boqId}`,
        {
          cover_page: coverPage,
          terms_text: termsText,
          include_signature: includeSignature || false
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          responseType: 'blob',
        }
      );

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const blobUrl = window.URL.createObjectURL(blob);
      return blobUrl;
    }

    // Build URL with optional terms_text query parameter
    let url = `${API_URL}/boq/download/client/${boqId}`;
    if (termsText) {
      url += `?terms_text=${encodeURIComponent(termsText)}`;
    }

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      responseType: 'blob',
    });

    // Create blob URL for preview
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const blobUrl = window.URL.createObjectURL(blob);

    return blobUrl; // Return URL for iframe/new tab

  } catch (error: any) {
    console.error('Error previewing client BOQ PDF:', error);
    throw new Error(
      error.response?.data?.error ||
      'Failed to preview client BOQ PDF. Please try again.'
    );
  }
};

/**
 * Send BOQ to client via email (with attachments)
 */
export const sendBOQToClient = async (
  boqId: number,
  clientEmail: string,
  message: string,
  formats: string[] = ['excel', 'pdf']
): Promise<{ success: boolean; message: string }> => {
  try {
    const token = localStorage.getItem('access_token');

    const response = await axios.post(
      `${API_URL}/send_boq_client`,
      {
        boq_id: boqId,
        client_email: clientEmail,
        message: message,
        formats: formats,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  } catch (error: any) {
    console.error('Error sending BOQ to client:', error);
    throw new Error(
      error.response?.data?.error ||
      'Failed to send BOQ to client. Please try again.'
    );
  }
};

export default {
  downloadInternalBOQPDF,
  downloadClientBOQPDF,
  previewClientBOQPDF,
  sendBOQToClient,
};
