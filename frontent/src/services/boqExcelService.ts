/**
 * BOQ Excel Service - Service for downloading BOQ Excel files
 * Uses backend API for consistent, accurate Excel generation
 */

import axios from 'axios';
import { API_BASE_URL } from '@/api/config';

// Use centralized API URL from config - no hardcoded fallbacks
const API_URL = API_BASE_URL;

/**
 * Download Internal BOQ Excel (with full breakdown)
 * For internal use - shows materials, labour, costs, profit calculations
 */
export const downloadInternalBOQExcel = async (boqId: number): Promise<void> => {
  try {
    const token = localStorage.getItem('access_token');

    const response = await axios.get(`${API_URL}/boq/download/internal-excel/${boqId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      responseType: 'blob', // Important for file download
    });

    // Create download link
    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Extract filename from Content-Disposition header or use default
    const contentDisposition = response.headers['content-disposition'];
    let filename = `BOQ_Internal_${new Date().toISOString().split('T')[0]}.xlsx`;

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
    console.error('Error downloading internal BOQ Excel:', error);
    throw new Error(
      error.response?.data?.error ||
      'Failed to download internal BOQ Excel. Please try again.'
    );
  }
};

/**
 * Download Client BOQ Excel (clean view)
 * For client presentation - shows only items, sub-items, and final prices
 */
export const downloadClientBOQExcel = async (boqId: number): Promise<void> => {
  try {
    const token = localStorage.getItem('access_token');

    const response = await axios.get(`${API_URL}/boq/download/client-excel/${boqId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      responseType: 'blob',
    });

    // Create download link
    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    let filename = `BOQ_Client_${new Date().toISOString().split('T')[0]}.xlsx`;

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
    console.error('Error downloading client BOQ Excel:', error);
    throw new Error(
      error.response?.data?.error ||
      'Failed to download client BOQ Excel. Please try again.'
    );
  }
};

export default {
  downloadInternalBOQExcel,
  downloadClientBOQExcel,
};
