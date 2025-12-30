import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { BOQ, BOQUploadResponse } from '../types';
import { estimatorService } from '../services/estimatorService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Upload,
  FileText,
  X,
  CheckCircle,
  AlertCircle,
  FileUp,
  Info
} from 'lucide-react';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';

interface BOQUploadProps {
  onUploadSuccess: (boq: BOQ) => void;
  onCancel?: () => void;
}

const BOQUpload: React.FC<BOQUploadProps> = ({ onUploadSuccess, onCancel }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResponse, setUploadResponse] = useState<BOQUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const uploadedFile = acceptedFiles[0];
      if (uploadedFile.type === 'application/pdf') {
        setFile(uploadedFile);
        setError(null);
        setUploadResponse(null);
      } else {
        setError('Please upload a PDF file');
        showError('Invalid file type. Please upload a PDF file.');
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024 // 10MB
  });

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const response = await estimatorService.uploadBOQPDF(file);

      if (response.success && response.data) {
        setUploadResponse(response);
        showSuccess('PDF processed successfully!');
      } else {
        setError(response.message || 'Failed to process PDF');
        showError(response.message || 'Failed to process PDF');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('An error occurred while uploading the file');
      showError('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = () => {
    if (uploadResponse?.data?.extracted) {
      onUploadSuccess(uploadResponse.data.extracted);
      showSuccess('BOQ data confirmed and ready for submission');
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setUploadResponse(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload BOQ PDF
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!file ? (
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
                ${isDragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                }
              `}
            >
              <input {...getInputProps()} />
              <motion.div
                animate={{ y: isDragActive ? -5 : 0 }}
                className="flex flex-col items-center gap-4"
              >
                <div className="p-4 bg-blue-100 rounded-full">
                  <FileUp className="h-8 w-8 text-blue-600" />
                </div>
                <div>
                  <p className="text-lg font-medium text-gray-900">
                    {isDragActive ? 'Drop the PDF here' : 'Drag & drop your BOQ PDF'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    or click to browse (Max size: 10MB)
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Info className="h-3 w-3" />
                  <span>Supported format: PDF</span>
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <FileText className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveFile}
                  disabled={uploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {!uploadResponse && (
                <Button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="w-full"
                >
                  {uploading ? (
                    <>
                      <ModernLoadingSpinners size="xs" className="mr-2" />
                      Processing PDF...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Extract BOQ Data
                    </>
                  )}
                </Button>
              )}
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Processing Result */}
      <AnimatePresence>
        {uploadResponse?.success && uploadResponse.data && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="shadow-lg border-green-200">
              <CardHeader className="bg-green-50">
                <CardTitle className="flex items-center gap-2 text-green-800">
                  <CheckCircle className="h-5 w-5" />
                  BOQ Data Extracted Successfully
                </CardTitle>
              </CardHeader>
              <CardContent className="mt-4">
                <div className="space-y-4">
                  {/* Confidence Score */}
                  {uploadResponse.data.confidence && (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm font-medium text-gray-700">
                        Extraction Confidence
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full transition-all"
                            style={{ width: `${uploadResponse.data.confidence}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {uploadResponse.data.confidence}%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Extracted Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Project Name</p>
                      <p className="font-semibold text-gray-900">
                        {uploadResponse.data.extracted.project?.name || uploadResponse.data.extracted.title || 'N/A'}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Client</p>
                      <p className="font-semibold text-gray-900">
                        {uploadResponse.data.extracted.project?.client || 'N/A'}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Total Sections</p>
                      <p className="font-semibold text-gray-900">
                        {uploadResponse.data.extracted.sections?.length || 0}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Total Value</p>
                      <p className="font-semibold text-gray-900">
                        AED {(uploadResponse.data.extracted.summary?.grandTotal || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Warnings */}
                  {uploadResponse.data.warnings && uploadResponse.data.warnings.length > 0 && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <p className="font-medium mb-2">Extraction Warnings:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {uploadResponse.data.warnings.map((warning, index) => (
                            <li key={index} className="text-sm">{warning}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={handleRemoveFile}
                      className="flex-1"
                    >
                      Upload Different File
                    </Button>
                    <Button
                      onClick={handleConfirm}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Confirm & Preview
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cancel Button */}
      {onCancel && (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={onCancel}>
            Cancel Upload
          </Button>
        </div>
      )}
    </div>
  );
};

export default BOQUpload;