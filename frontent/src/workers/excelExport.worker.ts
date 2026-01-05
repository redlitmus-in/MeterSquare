/**
 * Excel Export Web Worker
 *
 * Offloads heavy Excel generation to a background thread to prevent UI blocking.
 * This improves user experience during large data exports.
 *
 * Usage in main thread:
 *   const worker = new Worker(new URL('./workers/excelExport.worker.ts', import.meta.url), { type: 'module' });
 *   worker.postMessage({ type: 'export', data: tableData });
 *   worker.onmessage = (e) => {
 *     if (e.data.type === 'success') {
 *       const excelBlob = e.data.blob;
 *       // Download Excel file
 *     }
 *   };
 */

self.onmessage = async (e: MessageEvent) => {
  const { type, data } = e.data;

  switch (type) {
    case 'export':
      try {
        // Send progress update
        self.postMessage({ type: 'progress', progress: 0, message: 'Starting Excel export...' });

        // TODO: Implement actual Excel generation logic here
        // This is a placeholder - you'll need to move your xlsx logic here
        // Example structure:
        //
        // const XLSX = await import('xlsx');
        // const worksheet = XLSX.utils.json_to_sheet(data);
        // const workbook = XLSX.utils.book_new();
        // XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
        //
        // // Convert to array buffer
        // const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        // const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        self.postMessage({ type: 'progress', progress: 50, message: 'Processing data...' });

        // Simulate Excel generation (replace with actual logic)
        await new Promise(resolve => setTimeout(resolve, 100));

        self.postMessage({ type: 'progress', progress: 100, message: 'Excel export complete!' });

        // Send success response
        self.postMessage({
          type: 'success',
          blob: null, // Replace with actual excelBlob
          message: 'Excel generated successfully'
        });
      } catch (error) {
        self.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error during Excel export'
        });
      }
      break;

    case 'cancel':
      // Handle cancellation if needed
      self.postMessage({ type: 'cancelled' });
      break;

    default:
      self.postMessage({
        type: 'error',
        error: `Unknown message type: ${type}`
      });
  }
};

export {};
