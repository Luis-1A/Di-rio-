import React, { useState } from 'react';
import {
  X,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from 'lucide-react';

interface PDFViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  pdfUrl: string;
  fileName?: string;
  fileSize?: number;
}

export const PDFViewerModal: React.FC<PDFViewerModalProps> = ({
  isOpen,
  onClose,
  title,
  pdfUrl,
  fileName,
  fileSize,
}) => {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (!isOpen || !pdfUrl) return null;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 20, 200));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 20, 60));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  const formattedSize = fileSize
    ? `${(fileSize / (1024 * 1024)).toFixed(2)} MB`
    : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-stone-900/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 border border-stone-200 ${
          isFullscreen
            ? 'w-full h-full rounded-none'
            : 'w-full max-w-5xl h-[90vh] max-h-[850px]'
        }`}
      >
        {/* Header Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 bg-stone-900 text-white border-b border-stone-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate leading-tight">
                {title || fileName || 'Documento PDF'}
              </h3>
              <p className="text-[11px] text-stone-400 truncate">
                {fileName || 'documento.pdf'} {formattedSize ? `• ${formattedSize}` : ''}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="hidden sm:flex items-center gap-1 bg-stone-800 rounded-lg p-0.5 mr-2">
              <button
                onClick={handleZoomOut}
                title="Diminuir zoom"
                className="p-1.5 rounded text-stone-300 hover:text-white hover:bg-stone-700 transition-colors cursor-pointer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono px-1.5 text-stone-300">
                {zoom}%
              </span>
              <button
                onClick={handleZoomIn}
                title="Aumentar zoom"
                className="p-1.5 rounded text-stone-300 hover:text-white hover:bg-stone-700 transition-colors cursor-pointer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleRotate}
                title="Girar visualização"
                className="p-1.5 rounded text-stone-300 hover:text-white hover:bg-stone-700 transition-colors cursor-pointer"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>

            <a
              href={pdfUrl}
              download={fileName || 'documento.pdf'}
              title="Baixar arquivo"
              className="p-2 rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </a>

            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir em nova aba"
              className="p-2 rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
            </a>

            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              className="hidden sm:block p-2 rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>

            <button
              onClick={onClose}
              title="Fechar visualizador"
              className="p-2 rounded-lg text-stone-400 hover:text-white hover:bg-red-600/80 transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PDF Viewer Body */}
        <div className="flex-1 bg-stone-100 overflow-auto flex items-center justify-center p-2 sm:p-4 relative">
          <div
            className="w-full h-full flex items-center justify-center origin-center transition-transform duration-150"
            style={{
              transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
            }}
          >
            <object
              data={`${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1`}
              type="application/pdf"
              className="w-full h-full rounded-lg shadow-md bg-white border border-stone-200"
            >
              {/* Fallback iframe */}
              <iframe
                src={`${pdfUrl}#toolbar=1`}
                title={title || 'Visualizador de PDF'}
                className="w-full h-full rounded-lg shadow-md bg-white border border-stone-200"
              >
                <div className="p-8 text-center bg-white rounded-xl max-w-md mx-auto my-12 border border-stone-200 shadow-sm">
                  <FileText className="w-12 h-12 text-orange-600 mx-auto mb-3" />
                  <h4 className="text-base font-semibold text-stone-800">
                    Pré-visualização do PDF
                  </h4>
                  <p className="text-xs text-stone-500 mt-1 mb-4">
                    Seu navegador não suporta visualização embutida de PDFs. Você pode abrir o arquivo diretamente ou baixá-lo.
                  </p>
                  <div className="flex justify-center gap-3">
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-orange-600 text-white rounded-xl text-xs font-semibold hover:bg-orange-700 transition-colors inline-flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir PDF</span>
                    </a>
                    <a
                      href={pdfUrl}
                      download={fileName || 'documento.pdf'}
                      className="px-4 py-2 bg-stone-100 text-stone-700 rounded-xl text-xs font-semibold hover:bg-stone-200 transition-colors inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar</span>
                    </a>
                  </div>
                </div>
              </iframe>
            </object>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-white border-t border-stone-200 flex items-center justify-between text-xs text-stone-500">
          <span>Visualizador Integrado de Documentos</span>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[11px] text-stone-600 font-medium">Documento Pronto</span>
          </div>
        </div>
      </div>
    </div>
  );
};
