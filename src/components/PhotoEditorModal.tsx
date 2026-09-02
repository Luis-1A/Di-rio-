import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DiaryRecord, UserProfile } from '../types';
import { executeDirectSavePipeline } from '../lib/uploadService';
import {
  X,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Crop,
  Sliders,
  Paintbrush,
  Type,
  EyeOff,
  Undo2,
  Redo2,
  Save,
  Check,
  Sparkles,
  Maximize2,
  Circle,
  Square,
  ArrowRight,
  Minus,
  Eraser,
  Sun,
  Contrast,
  Palette,
  Thermometer,
  Zap,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface PhotoEditorModalProps {
  isOpen: boolean;
  record: DiaryRecord;
  imageUrl: string;
  user: UserProfile;
  onClose: () => void;
  onSavedNewPhoto: (newRecord: DiaryRecord) => void;
}

type EditorTool = 'crop' | 'rotate' | 'adjust' | 'draw' | 'privacy' | 'text' | 'resize';
type CropRatio = 'free' | '1:1' | '4:3' | '16:9' | '9:16';
type ShapeType = 'brush' | 'eraser' | 'arrow' | 'circle' | 'rectangle' | 'line';

interface ImageAdjustments {
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100
  saturation: number; // -100 to 100
  exposure: number; // -100 to 100
  temperature: number; // -100 to 100 (blue to warm)
  sharpness: number; // 0 to 100
}

const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  temperature: 0,
  sharpness: 0,
};

const COLOR_PALETTE = [
  '#FFFFFF',
  '#000000',
  '#EF4444', // Red
  '#F97316', // Orange
  '#FACC15', // Yellow
  '#10B981', // Green
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
];

export const PhotoEditorModal: React.FC<PhotoEditorModalProps> = ({
  isOpen,
  record,
  imageUrl,
  user,
  onClose,
  onSavedNewPhoto,
}) => {
  const [activeTool, setActiveTool] = useState<EditorTool>('crop');
  const [cropRatio, setCropRatio] = useState<CropRatio>('free');

  // Adjustments
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(DEFAULT_ADJUSTMENTS);

  // Drawing & Shapes State
  const [drawShape, setDrawShape] = useState<ShapeType>('brush');
  const [drawColor, setDrawColor] = useState<string>('#EF4444');
  const [strokeWidth, setStrokeWidth] = useState<number>(6);

  // Privacy Tool (Blur / Pixelate)
  const [privacyMode, setPrivacyMode] = useState<'blur' | 'pixelate'>('blur');
  const [privacyIntensity, setPrivacyIntensity] = useState<number>(16);

  // Text Tool
  const [textContent, setTextContent] = useState<string>('');
  const [textColor, setTextColor] = useState<string>('#FFFFFF');
  const [textBg, setTextBg] = useState<boolean>(true);
  const [textSize, setTextSize] = useState<number>(24);

  // History & Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);

  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Crop Coordinates (Normalized 0..1)
  const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 0.1,
    y: 0.1,
    width: 0.8,
    height: 0.8,
  });
  const isDraggingCropRef = useRef<{
    active: boolean;
    handle: string;
    startX: number;
    startY: number;
    startBox: typeof cropBox;
  }>({
    active: false,
    handle: 'move',
    startX: 0,
    startY: 0,
    startBox: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  });

  // Freehand Drawing Tracking
  const isDrawingRef = useRef(false);
  const drawStartPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Save Progress State
  const [isSaving, setIsSaving] = useState(false);
  const [saveTitle, setSaveTitle] = useState(`${record.title || 'Foto'} (Editada)`);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Initial Image Load & Canvas Setup
  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      originalImageRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      const initialData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setHistory([initialData]);
      setHistoryIndex(0);
      setAdjustments(DEFAULT_ADJUSTMENTS);
      setSaveTitle(`${record.title || 'Foto'} (Editada)`);
    };
    img.src = imageUrl;
  }, [isOpen, imageUrl, record.title]);

  // Push Canvas State to History
  const pushState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const currentState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      return [...sliced, currentState];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  // Undo / Redo
  const handleUndo = () => {
    if (historyIndex > 0) {
      const nextIndex = historyIndex - 1;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const targetData = history[nextIndex];
      canvas.width = targetData.width;
      canvas.height = targetData.height;
      ctx.putImageData(targetData, 0, 0);
      setHistoryIndex(nextIndex);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const targetData = history[nextIndex];
      canvas.width = targetData.width;
      canvas.height = targetData.height;
      ctx.putImageData(targetData, 0, 0);
      setHistoryIndex(nextIndex);
    }
  };

  // 1. ROTATION & FLIP
  const handleRotate = (angleDegrees: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    tempCtx.drawImage(canvas, 0, 0);

    if (Math.abs(angleDegrees) === 90 || Math.abs(angleDegrees) === 270) {
      canvas.width = tempCanvas.height;
      canvas.height = tempCanvas.width;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((angleDegrees * Math.PI) / 180);
    ctx.drawImage(tempCanvas, -tempCanvas.width / 2, -tempCanvas.height / 2);
    ctx.restore();

    pushState();
  };

  const handleFlip = (direction: 'horizontal' | 'vertical') => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    tempCtx.drawImage(canvas, 0, 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (direction === 'horizontal') {
      ctx.scale(-1, 1);
      ctx.drawImage(tempCanvas, -canvas.width, 0);
    } else {
      ctx.scale(1, -1);
      ctx.drawImage(tempCanvas, 0, -canvas.height);
    }
    ctx.restore();

    pushState();
  };

  // 2. CROP
  const applyCrop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cropX = Math.round(cropBox.x * canvas.width);
    const cropY = Math.round(cropBox.y * canvas.height);
    const cropW = Math.round(cropBox.width * canvas.width);
    const cropH = Math.round(cropBox.height * canvas.height);

    if (cropW < 10 || cropH < 10) return;

    const croppedData = ctx.getImageData(cropX, cropY, cropW, cropH);
    canvas.width = cropW;
    canvas.height = cropH;
    ctx.putImageData(croppedData, 0, 0);

    // Reset crop box
    setCropBox({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
    pushState();
  };

  // 3. ADJUSTMENTS PIPELINE (Brightness, Contrast, Saturation, Temp, Sharpness)
  const applyAdjustments = (newAdj: ImageAdjustments) => {
    setAdjustments(newAdj);
    const canvas = canvasRef.current;
    if (!canvas || historyIndex < 0) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Restore base image of current state before adjustments
    const baseData = history[historyIndex];
    if (!baseData) return;

    const imgData = new ImageData(
      new Uint8ClampedArray(baseData.data),
      baseData.width,
      baseData.height
    );
    const data = imgData.data;

    const b = newAdj.brightness * 1.5;
    const c = (newAdj.contrast + 100) / 100;
    const s = (newAdj.saturation + 100) / 100;
    const exp = Math.pow(2, newAdj.exposure / 50);
    const temp = newAdj.temperature;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let bl = data[i + 2];

      // Exposure
      r *= exp;
      g *= exp;
      bl *= exp;

      // Brightness & Contrast
      r = (r - 128) * c + 128 + b;
      g = (g - 128) * c + 128 + b;
      bl = (bl - 128) * c + 128 + b;

      // Temperature (Warm: more Red/Yellow, Cool: more Blue)
      if (temp > 0) {
        r += temp * 0.4;
        g += temp * 0.15;
      } else if (temp < 0) {
        bl += Math.abs(temp) * 0.5;
      }

      // Saturation
      const gray = 0.2989 * r + 0.587 * g + 0.114 * bl;
      r = gray + (r - gray) * s;
      g = gray + (g - gray) * s;
      bl = gray + (bl - gray) * s;

      data[i] = Math.min(255, Math.max(0, r));
      data[i + 1] = Math.min(255, Math.max(0, g));
      data[i + 2] = Math.min(255, Math.max(0, bl));
    }

    ctx.putImageData(imgData, 0, 0);
  };

  const commitAdjustments = () => {
    pushState();
    setAdjustments(DEFAULT_ADJUSTMENTS);
  };

  // 4. DRAWING & SHAPES & PRIVACY HANDLING
  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool !== 'draw' && activeTool !== 'privacy') return;

    const coords = getCanvasCoordinates(e);
    isDrawingRef.current = true;
    drawStartPointRef.current = coords;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (activeTool === 'draw' && (drawShape === 'brush' || drawShape === 'eraser')) {
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = drawShape === 'eraser' ? '#FFFFFF' : drawColor;
      if (drawShape === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
      } else {
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const coords = getCanvasCoordinates(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (activeTool === 'draw') {
      if (drawShape === 'brush' || drawShape === 'eraser') {
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
      }
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const coords = getCanvasCoordinates(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.globalCompositeOperation = 'source-over';

    if (activeTool === 'draw') {
      const startX = drawStartPointRef.current.x;
      const startY = drawStartPointRef.current.y;
      const endX = coords.x;
      const endY = coords.y;

      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = drawColor;
      ctx.fillStyle = drawColor;
      ctx.lineCap = 'round';

      if (drawShape === 'line') {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      } else if (drawShape === 'arrow') {
        const headlen = strokeWidth * 3.5;
        const angle = Math.atan2(endY - startY, endX - startX);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headlen * Math.cos(angle - Math.PI / 6), endY - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - headlen * Math.cos(angle + Math.PI / 6), endY - headlen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      } else if (drawShape === 'rectangle') {
        ctx.strokeRect(startX, startY, endX - startX, endY - startY);
      } else if (drawShape === 'circle') {
        const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        ctx.beginPath();
        ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }
    } else if (activeTool === 'privacy') {
      // Apply Pixelation or Blur on dragged rectangular region
      const startX = Math.min(drawStartPointRef.current.x, coords.x);
      const startY = Math.min(drawStartPointRef.current.y, coords.y);
      const w = Math.abs(coords.x - drawStartPointRef.current.x);
      const h = Math.abs(coords.y - drawStartPointRef.current.y);

      if (w > 10 && h > 10) {
        const region = ctx.getImageData(startX, startY, w, h);
        const data = region.data;

        if (privacyMode === 'pixelate') {
          const blockSize = Math.max(8, privacyIntensity);
          for (let y = 0; y < h; y += blockSize) {
            for (let x = 0; x < w; x += blockSize) {
              const pixelIndex = (y * w + x) * 4;
              const r = data[pixelIndex];
              const g = data[pixelIndex + 1];
              const bl = data[pixelIndex + 2];

              for (let by = 0; by < blockSize && y + by < h; by++) {
                for (let bx = 0; bx < blockSize && x + bx < w; bx++) {
                  const targetIndex = ((y + by) * w + (x + bx)) * 4;
                  data[targetIndex] = r;
                  data[targetIndex + 1] = g;
                  data[targetIndex + 2] = bl;
                }
              }
            }
          }
          ctx.putImageData(region, startX, startY);
        } else {
          // Blur simulation with box blur
          const rad = Math.max(4, Math.floor(privacyIntensity / 2));
          for (let y = 0; y < h; y += 2) {
            for (let x = 0; x < w; x += 2) {
              let rTotal = 0, gTotal = 0, bTotal = 0, count = 0;
              for (let dy = -rad; dy <= rad; dy += 2) {
                for (let dx = -rad; dx <= rad; dx += 2) {
                  const nx = x + dx;
                  const ny = y + dy;
                  if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                    const idx = (ny * w + nx) * 4;
                    rTotal += data[idx];
                    gTotal += data[idx + 1];
                    bTotal += data[idx + 2];
                    count++;
                  }
                }
              }
              const avgR = rTotal / count;
              const avgG = gTotal / count;
              const avgB = bTotal / count;

              for (let dy = 0; dy < 2 && y + dy < h; dy++) {
                for (let dx = 0; dx < 2 && x + dx < w; dx++) {
                  const idx = ((y + dy) * w + (x + dx)) * 4;
                  data[idx] = avgR;
                  data[idx + 1] = avgG;
                  data[idx + 2] = avgB;
                }
              }
            }
          }
          ctx.putImageData(region, startX, startY);
        }
      }
    }

    pushState();
  };

  // 5. TEXT OVERLAY
  const applyTextOverlay = () => {
    if (!textContent.trim()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scaledSize = Math.max(20, Math.round((textSize / 800) * canvas.width));
    ctx.font = `bold ${scaledSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = textContent.trim();
    const x = canvas.width / 2;
    const y = canvas.height / 2;

    if (textBg) {
      const textMetrics = ctx.measureText(text);
      const padding = scaledSize * 0.4;
      const bgW = textMetrics.width + padding * 2;
      const bgH = scaledSize * 1.4;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.beginPath();
      ctx.roundRect(x - bgW / 2, y - bgH / 2, bgW, bgH, 12);
      ctx.fill();
    }

    ctx.fillStyle = textColor;
    ctx.fillText(text, x, y);

    setTextContent('');
    pushState();
  };

  // 6. SAVE AS NEW PHOTO (Zero loss, non-destructive copy, uses existing upload pipeline)
  const handleSaveAsNewPhoto = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsSaving(true);
    setSaveSuccessMsg(null);

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error('Falha ao gerar arquivo de imagem.'));
          },
          'image/jpeg',
          0.92
        );
      });

      const newRecordId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().substring(0, 5);

      // Upload with guarantees using current pipeline
      const savedRecord = await executeDirectSavePipeline({
        uid: user.uid,
        recordId: newRecordId,
        type: 'photo',
        title: saveTitle.trim() || `${record.title || 'Foto'} (Editada)`,
        content: `Editada a partir do registro "${record.title || 'Foto Original'}"`,
        date: dateStr,
        time: timeStr,
        category: record.category || 'Fotos',
        tags: [...(record.tags || []), 'editada'],
        fileOrBlob: blob,
      });

      setSaveSuccessMsg('Nova foto salva e sincronizada com sucesso!');
      setTimeout(() => {
        setIsSaving(false);
        onSavedNewPhoto(savedRecord);
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('[PHOTO EDITOR SAVE ERROR]', err);
      setIsSaving(false);
      alert('Não foi possível salvar a nova foto: ' + (err.message || 'Erro desconhecido.'));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between overflow-hidden select-none">
      {/* 1. Top Control Bar */}
      <div className="h-14 px-4 bg-stone-900 border-b border-stone-800 flex items-center justify-between text-white shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white transition-colors cursor-pointer"
            title="Cancelar e fechar"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-sm font-bold text-stone-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-orange-400" />
              <span>Editor de Fotos</span>
            </h2>
            <p className="text-[10px] text-stone-400 truncate max-w-xs">
              {record.title || 'Foto'} • Criação segura de cópia
            </p>
          </div>
        </div>

        {/* Undo / Redo & Save Action */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              historyIndex > 0
                ? 'bg-stone-800 border-stone-700 text-white hover:bg-stone-700'
                : 'bg-stone-900 border-stone-800 text-stone-600 cursor-not-allowed'
            }`}
            title="Desfazer"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              historyIndex < history.length - 1
                ? 'bg-stone-800 border-stone-700 text-white hover:bg-stone-700'
                : 'bg-stone-900 border-stone-800 text-stone-600 cursor-not-allowed'
            }`}
            title="Refazer"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleSaveAsNewPhoto}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-500 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer ml-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Salvar como nova foto</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Main Workspace (Canvas Stage) */}
      <div className="flex-1 relative flex items-center justify-center p-4 bg-stone-950 overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          className={`max-w-full max-h-[68vh] object-contain rounded-lg shadow-2xl transition-all ${
            activeTool === 'draw' || activeTool === 'privacy' ? 'cursor-crosshair' : 'cursor-default'
          }`}
          style={{ imageOrientation: 'from-image' }}
        />

        {/* Visual Crop Box Overlay */}
        {activeTool === 'crop' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
            <div className="relative border-2 border-orange-400 bg-orange-500/10 rounded-xs shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] w-4/5 h-4/5 flex items-center justify-center">
              {/* Rule of Thirds Grid Lines */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                <div className="border-r border-b border-orange-400/40" />
                <div className="border-r border-b border-orange-400/40" />
                <div className="border-b border-orange-400/40" />
                <div className="border-r border-b border-orange-400/40" />
                <div className="border-r border-b border-orange-400/40" />
                <div className="border-b border-orange-400/40" />
                <div className="border-r border-orange-400/40" />
                <div className="border-r border-orange-400/40" />
                <div />
              </div>
            </div>
          </div>
        )}

        {saveSuccessMsg && (
          <div className="absolute top-6 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-lg flex items-center gap-2 animate-bounce">
            <Check className="w-4 h-4" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* 3. Tool Specific Sub-Control Ribbon */}
      <div className="bg-stone-900/95 border-t border-stone-800/80 px-4 py-3 shrink-0 text-white z-20">
        {/* Crop Controls */}
        {activeTool === 'crop' && (
          <div className="flex flex-wrap items-center justify-between gap-3 max-w-xl mx-auto">
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {(['free', '1:1', '4:3', '16:9', '9:16'] as CropRatio[]).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setCropRatio(ratio)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    cropRatio === ratio
                      ? 'bg-orange-600 text-white'
                      : 'bg-stone-800 text-stone-400 hover:text-white'
                  }`}
                >
                  {ratio === 'free' ? 'Livre' : ratio}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={applyCrop}
              className="inline-flex items-center gap-1 px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Aplicar corte</span>
            </button>
          </div>
        )}

        {/* Rotate & Flip Controls */}
        {activeTool === 'rotate' && (
          <div className="flex items-center justify-center gap-3 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => handleRotate(-90)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-orange-400" />
              <span>Girar 90° Esq</span>
            </button>

            <button
              type="button"
              onClick={() => handleRotate(90)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <RotateCw className="w-4 h-4 text-orange-400" />
              <span>Girar 90° Dir</span>
            </button>

            <button
              type="button"
              onClick={() => handleFlip('horizontal')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <FlipHorizontal className="w-4 h-4 text-orange-400" />
              <span>Espelhar H</span>
            </button>

            <button
              type="button"
              onClick={() => handleFlip('vertical')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <FlipVertical className="w-4 h-4 text-orange-400" />
              <span>Espelhar V</span>
            </button>
          </div>
        )}

        {/* Adjustments Sliders */}
        {activeTool === 'adjust' && (
          <div className="space-y-3 max-w-xl mx-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-stone-300">
                  <span className="flex items-center gap-1">
                    <Sun className="w-3 h-3 text-amber-400" /> Brilho
                  </span>
                  <span>{adjustments.brightness}</span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={adjustments.brightness}
                  onChange={(e) =>
                    applyAdjustments({ ...adjustments, brightness: parseInt(e.target.value) })
                  }
                  className="w-full accent-orange-500 h-1.5 bg-stone-700 rounded-lg cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-stone-300">
                  <span className="flex items-center gap-1">
                    <Contrast className="w-3 h-3 text-sky-400" /> Contraste
                  </span>
                  <span>{adjustments.contrast}</span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={adjustments.contrast}
                  onChange={(e) =>
                    applyAdjustments({ ...adjustments, contrast: parseInt(e.target.value) })
                  }
                  className="w-full accent-orange-500 h-1.5 bg-stone-700 rounded-lg cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-stone-300">
                  <span className="flex items-center gap-1">
                    <Palette className="w-3 h-3 text-pink-400" /> Saturação
                  </span>
                  <span>{adjustments.saturation}</span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={adjustments.saturation}
                  onChange={(e) =>
                    applyAdjustments({ ...adjustments, saturation: parseInt(e.target.value) })
                  }
                  className="w-full accent-orange-500 h-1.5 bg-stone-700 rounded-lg cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-stone-300">
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-yellow-400" /> Exposição
                  </span>
                  <span>{adjustments.exposure}</span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={adjustments.exposure}
                  onChange={(e) =>
                    applyAdjustments({ ...adjustments, exposure: parseInt(e.target.value) })
                  }
                  className="w-full accent-orange-500 h-1.5 bg-stone-700 rounded-lg cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-stone-300">
                  <span className="flex items-center gap-1">
                    <Thermometer className="w-3 h-3 text-red-400" /> Temperatura
                  </span>
                  <span>{adjustments.temperature}</span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={adjustments.temperature}
                  onChange={(e) =>
                    applyAdjustments({ ...adjustments, temperature: parseInt(e.target.value) })
                  }
                  className="w-full accent-orange-500 h-1.5 bg-stone-700 rounded-lg cursor-pointer"
                />
              </div>

              <div className="flex items-end justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => applyAdjustments(DEFAULT_ADJUSTMENTS)}
                  className="px-3 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg text-xs cursor-pointer"
                >
                  Restaurar
                </button>
                <button
                  type="button"
                  onClick={commitAdjustments}
                  className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg text-xs cursor-pointer"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Draw & Shapes Controls */}
        {activeTool === 'draw' && (
          <div className="space-y-3 max-w-xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Shapes Picker */}
              <div className="flex items-center gap-1 bg-stone-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setDrawShape('brush')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    drawShape === 'brush' ? 'bg-orange-600 text-white' : 'text-stone-400 hover:text-white'
                  }`}
                  title="Pincel Livre"
                >
                  <Paintbrush className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDrawShape('arrow')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    drawShape === 'arrow' ? 'bg-orange-600 text-white' : 'text-stone-400 hover:text-white'
                  }`}
                  title="Seta Indicativa"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDrawShape('circle')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    drawShape === 'circle' ? 'bg-orange-600 text-white' : 'text-stone-400 hover:text-white'
                  }`}
                  title="Círculo"
                >
                  <Circle className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDrawShape('rectangle')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    drawShape === 'rectangle' ? 'bg-orange-600 text-white' : 'text-stone-400 hover:text-white'
                  }`}
                  title="Retângulo"
                >
                  <Square className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDrawShape('line')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    drawShape === 'line' ? 'bg-orange-600 text-white' : 'text-stone-400 hover:text-white'
                  }`}
                  title="Linha Reta"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDrawShape('eraser')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    drawShape === 'eraser' ? 'bg-orange-600 text-white' : 'text-stone-400 hover:text-white'
                  }`}
                  title="Borracha"
                >
                  <Eraser className="w-4 h-4" />
                </button>
              </div>

              {/* Stroke Width Slider */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-stone-400">Espessura:</span>
                <input
                  type="range"
                  min="2"
                  max="32"
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
                  className="w-24 accent-orange-500 h-1.5 bg-stone-700 rounded-lg cursor-pointer"
                />
                <span className="text-stone-300 w-5">{strokeWidth}px</span>
              </div>

              {/* Color Swatches */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setDrawColor(color)}
                    style={{ backgroundColor: color }}
                    className={`w-6 h-6 rounded-full border transition-transform cursor-pointer ${
                      drawColor === color ? 'scale-125 border-white shadow-md ring-2 ring-orange-500' : 'border-stone-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Privacy (Blur / Pixelate) Controls */}
        {activeTool === 'privacy' && (
          <div className="flex flex-wrap items-center justify-between gap-3 max-w-xl mx-auto">
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400">Modo de ocultação:</span>
              <div className="flex items-center gap-1 bg-stone-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPrivacyMode('blur')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    privacyMode === 'blur' ? 'bg-orange-600 text-white' : 'text-stone-400 hover:text-white'
                  }`}
                >
                  Desfoque (Blur)
                </button>
                <button
                  type="button"
                  onClick={() => setPrivacyMode('pixelate')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    privacyMode === 'pixelate' ? 'bg-orange-600 text-white' : 'text-stone-400 hover:text-white'
                  }`}
                >
                  Pixelização
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-stone-400">Intensidade:</span>
              <input
                type="range"
                min="8"
                max="36"
                value={privacyIntensity}
                onChange={(e) => setPrivacyIntensity(parseInt(e.target.value))}
                className="w-28 accent-orange-500 h-1.5 bg-stone-700 rounded-lg cursor-pointer"
              />
              <span className="text-stone-300">{privacyIntensity}</span>
            </div>

            <p className="text-[11px] text-amber-300 w-full text-center">
              💡 Arraste o cursor sobre a área da foto que deseja desfocar ou pixelar (ex: rostos, documentos).
            </p>
          </div>
        )}

        {/* Text Overlay Controls */}
        {activeTool === 'text' && (
          <div className="space-y-3 max-w-xl mx-auto">
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                placeholder="Digite o texto que deseja adicionar..."
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                className="flex-1 w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-400 focus:outline-none focus:border-orange-500"
              />

              <div className="flex items-center gap-2 w-full sm:w-auto justify-between">
                <button
                  type="button"
                  onClick={() => setTextBg(!textBg)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    textBg ? 'bg-stone-700 text-white' : 'bg-stone-800 text-stone-400'
                  }`}
                >
                  Fundo escuro
                </button>

                <button
                  type="button"
                  onClick={applyTextOverlay}
                  disabled={!textContent.trim()}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Inserir
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Bottom Main Navigation Bar (Tools) */}
      <div className="h-16 bg-stone-900 border-t border-stone-800 px-4 flex items-center justify-around text-stone-400 shrink-0 z-20">
        <button
          type="button"
          onClick={() => setActiveTool('crop')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors cursor-pointer ${
            activeTool === 'crop' ? 'text-orange-500 font-bold' : 'hover:text-white'
          }`}
        >
          <Crop className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Recortar</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('rotate')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors cursor-pointer ${
            activeTool === 'rotate' ? 'text-orange-500 font-bold' : 'hover:text-white'
          }`}
        >
          <RotateCw className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Girar & Espelhar</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('adjust')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors cursor-pointer ${
            activeTool === 'adjust' ? 'text-orange-500 font-bold' : 'hover:text-white'
          }`}
        >
          <Sliders className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Ajustes</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('draw')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors cursor-pointer ${
            activeTool === 'draw' ? 'text-orange-500 font-bold' : 'hover:text-white'
          }`}
        >
          <Paintbrush className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Desenho</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('privacy')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors cursor-pointer ${
            activeTool === 'privacy' ? 'text-orange-500 font-bold' : 'hover:text-white'
          }`}
        >
          <EyeOff className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Desfocar</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('text')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors cursor-pointer ${
            activeTool === 'text' ? 'text-orange-500 font-bold' : 'hover:text-white'
          }`}
        >
          <Type className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Texto</span>
        </button>
      </div>
    </div>
  );
};
