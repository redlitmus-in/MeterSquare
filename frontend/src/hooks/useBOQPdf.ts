/**
 * Custom Hook for BOQ PDF operations
 * Provides easy-to-use methods for downloading and sending BOQ PDFs
 */

import { useState } from 'react';
import { downloadInternalBOQPDF, downloadClientBOQPDF, sendBOQToClient } from '../services/boqPdfService';
import { message } from 'antd';

export const useBOQPdf = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Download internal BOQ PDF
   */
  const downloadInternal = async (boqId: number) => {
    setLoading(true);
    setError(null);

    try {
      await downloadInternalBOQPDF(boqId);
      message.success('Internal BOQ PDF downloaded successfully');
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to download internal PDF';
      setError(errorMsg);
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Download client BOQ PDF
   */
  const downloadClient = async (boqId: number) => {
    setLoading(true);
    setError(null);

    try {
      await downloadClientBOQPDF(boqId);
      message.success('Client BOQ PDF downloaded successfully');
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to download client PDF';
      setError(errorMsg);
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Send BOQ to client via email
   */
  const sendToClient = async (
    boqId: number,
    clientEmail: string,
    messageText: string,
    formats: string[] = ['excel', 'pdf']
  ) => {
    setLoading(true);
    setError(null);

    try {
      const result = await sendBOQToClient(boqId, clientEmail, messageText, formats);

      if (result.success) {
        message.success(result.message || 'BOQ sent to client successfully');
        return true;
      } else {
        throw new Error(result.message || 'Failed to send BOQ');
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to send BOQ to client';
      setError(errorMsg);
      message.error(errorMsg);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    downloadInternal,
    downloadClient,
    sendToClient,
  };
};

export default useBOQPdf;
