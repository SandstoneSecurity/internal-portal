/**
 * Renders the first page of a PDF floor plan to a canvas. Architects' PDFs are
 * vector drawings, so rendering at high resolution gives clean, sharp lines
 * for tracing and wall detection. pdf.js loads only when a PDF is uploaded.
 *
 * The legacy build carries polyfills for browsers without the newest
 * JavaScript built-ins (Safari and older Chrome), which the modern build needs.
 */
export async function renderPdfPlan(file: File, longEdge: number): Promise<{ canvas: HTMLCanvasElement; pages: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Bundled as an ordinary .js worker, so no server needs to know the .mjs type.
  const { default: PdfWorker } = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker");
  if (!pdfjs.GlobalWorkerOptions.workerPort) pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = longEdge / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport, background: "#ffffff" }).promise;
    return { canvas, pages: doc.numPages };
  } finally {
    void task.destroy();
  }
}
