"use client";

import { useState, useRef, useEffect } from "react";
import { useUser, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { supabase } from "../../supabaseClient"; 
import Autocomplete from "react-google-autocomplete";

const API = "https://petes-ai-studio-backend-v2-73jga2zlcq-lz.a.run.app";

type UploadedFile = { id: string; file: File; url: string; type: string; style: string; prompt: string; maskBlob: Blob | null; };
type GalleryImage = { name: string; url: string; type: 'image' | 'video'; raw?: string; edited?: string; approved?: boolean; video?: string; };

const STYLE_CARDS = [
  { id: 'dusk_blue_hour', icon: '🌙', title: 'Blue Hour', desc: 'Deep indigo twilight sky with a warm, inviting interior glow.' },
  { id: 'sunny_midday', icon: '☀️', title: 'Sunny Midday', desc: 'Crisp, bright daylight with crystal clear blue skies.' },
  { id: 'weather_rain_to_sun', icon: '🌦️', title: 'Rain to Sun', desc: 'Magically dry up puddles and turn overcast skies sunny.' },
  { id: 'dusk_purple_orange', icon: '🌅', title: 'Purple Dusk', desc: 'Vibrant, luxurious sunset with an orange horizon.' },
  { id: 'early_morning', icon: '🌄', title: 'Early Morning', desc: 'Soft, pale Nordic morning light for a fresh aesthetic.' },
  { id: 'winter', icon: '❄️', title: 'Winter Wonderland', desc: 'Add crisp, realistic snow to the ground, roof, and trees.' },
  { id: 'autumn', icon: '🍂', title: 'Autumn Colors', desc: 'Turn green foliage into golden ochre and rust.' },
  { id: 'summer', icon: '🌳', title: 'Peak Summer', desc: 'Ensure lush, vibrant green lawns and dense tree canopies.' },
];

const STATUS_MESSAGES = [
    "Uploading to cloud...",
    "Analyzing architecture...",
    "Applying AI lighting...",
    "Rendering fine details...",
    "Almost there, finalizing..."
];

export default function ExpressPage() {
  const { user } = useUser();

  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [globalStyle, setGlobalStyle] = useState("dusk_blue_hour");
  
  const [orderId, setOrderId] = useState("");
  const [orderAddress, setOrderAddress] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  useEffect(() => {
    setOrderId(`ORD-${Math.random().toString(16).slice(2, 8).toUpperCase()}`);
  }, []);

  const [isRendering, setIsRendering] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressStatus, setProgressStatus] = useState("Processing...");
  const [statusMsgIndex, setStatusMsgIndex] = useState(0);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);

  const [activeModal, setActiveModal] = useState<'none' | 'retouch' | 'compare' | 'rerender'>('none');
  const [currentCanvasImgId, setCurrentCanvasImgId] = useState("");
  const [brushSize, setBrushSize] = useState(50);
  const [retouchPrompt, setRetouchPrompt] = useState("");
  const [saveAsNew, setSaveAsNew] = useState(true);
  const [rerenderData, setRerenderData] = useState({ type: "exterior", style: "dusk_blue_hour", prompt: "" });
  const [compareData, setCompareData] = useState({ raw: "", edited: "" });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenMaskCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const bgImg = useRef<HTMLImageElement | null>(null);
  const undoStack = useRef<ImageData[]>([]);

  // ==========================================
  // DEN MAGISKE UX-PROGRESJONEN (Fake progress)
  // ==========================================
  useEffect(() => {
    let pctInterval: NodeJS.Timeout;
    let msgInterval: NodeJS.Timeout;

    if (isRendering) {
        setProgressPct(0);
        setStatusMsgIndex(0);
        setProgressStatus(STATUS_MESSAGES[0]);

        pctInterval = setInterval(() => {
            setProgressPct(prev => {
                const remaining = 95 - prev;
                const step = Math.max(0.1, remaining * 0.05);
                return prev >= 95 ? 95 : prev + step;
            });
        }, 300);

        msgInterval = setInterval(() => {
            setStatusMsgIndex(prev => {
                const next = (prev + 1) % STATUS_MESSAGES.length;
                setProgressStatus(STATUS_MESSAGES[next]);
                return next;
            });
        }, 4000);
    }

    return () => {
        clearInterval(pctInterval);
        clearInterval(msgInterval);
    };
  }, [isRendering]);

  // ==========================================
  // SUPABASE REALTIME LISTENER (Radiomottakeren)
  // ==========================================
  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`express_progress_${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'projects',
          filter: `name=eq.${orderId}`
        },
        (payload) => {
          const newStatus = payload.new.status;
          
          if (newStatus === 'completed' || newStatus === 'finished') {
            setProgressPct(100);
            setProgressStatus("Complete! Loading gallery...");
            setTimeout(() => {
                setIsRendering(false);
                loadGallery(orderId);
            }, 600);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);


  const selectStyleAndProceed = (styleId: string) => { setGlobalStyle(styleId); setWizardStep(2); };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const newFiles: UploadedFile[] = [];
    for (let i = 0; i < e.target.files.length; i++) {
      if (e.target.files[i].type.startsWith("image/")) {
        newFiles.push({ id: "img_" + Math.random().toString(36).substr(2, 9), file: e.target.files[i], url: URL.createObjectURL(e.target.files[i]), type: "exterior", style: globalStyle, prompt: "", maskBlob: null });
      }
    }
    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const handleDropZone = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!e.dataTransfer.files?.length) return;
      const newFiles: UploadedFile[] = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
          if (e.dataTransfer.files[i].type.startsWith("image/")) {
              newFiles.push({ id: "img_" + Math.random().toString(36).substr(2, 9), file: e.dataTransfer.files[i], url: URL.createObjectURL(e.dataTransfer.files[i]), type: "exterior", style: globalStyle, prompt: "", maskBlob: null });
          }
      }
      setUploadedFiles(prev => [...prev, ...newFiles]);
  };
  
  const removeFile = (id: string) => setUploadedFiles(prev => prev.filter(f => f.id !== id));
  const updateFileField = (id: string, field: keyof UploadedFile, value: any) => setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
  
  const startExpressRender = async () => {
    if (!orderId || uploadedFiles.length === 0) return;
    
    setIsRendering(true);
    const fd = new FormData(); 
    fd.append('job_name', orderId);
    fd.append('address', orderAddress);
    if (user) fd.append('user_id', user.id); 
    
    const cfg: any = {}; 
    uploadedFiles.forEach(f => { fd.append('files', f.file); cfg[f.file.name] = { type: f.type, style: f.style, prompt: f.prompt }; });
    fd.append('config', JSON.stringify(cfg));
    
    try { 
        await fetch(`${API}/start-job/`, { method: 'POST', body: fd }); 
    } catch (error) { console.error(error); }
  };

  const loadGallery = async (name: string) => { 
      try { 
          const res = await fetch(`${API}/list-finished/?job_name=${encodeURIComponent(name)}&t=${Date.now()}`, { cache: 'no-store' }); 
          const data = await res.json(); 
          setGalleryImages(data.images); 
      } catch (e) { console.error(e); } 
  };

  // Canvas
  const openCanvasStudio = (imgIdOrName: string, customUrl: string | null = null) => { setCurrentCanvasImgId(imgIdOrName); setActiveModal('retouch'); setBrushSize(50); let targetUrl = customUrl; if (!targetUrl) { const fileObj = uploadedFiles.find(f => f.id === imgIdOrName); if (fileObj) targetUrl = fileObj.url; } if (targetUrl) { const image = new Image(); image.crossOrigin = "Anonymous"; image.onload = () => { bgImg.current = image; initCanvas(); }; image.src = targetUrl; } };
  const initCanvas = () => { const canvas = canvasRef.current; const hiddenCanvas = hiddenMaskCanvasRef.current; if (!canvas || !hiddenCanvas || !bgImg.current) return; canvas.width = hiddenCanvas.width = bgImg.current.width; canvas.height = hiddenCanvas.height = bgImg.current.height; const hiddenCtx = hiddenCanvas.getContext('2d'); if (hiddenCtx) hiddenCtx.clearRect(0, 0, hiddenCanvas.width, hiddenCanvas.height); undoStack.current = []; saveCanvasState(); renderCanvas(); };
  const saveCanvasState = () => { const hiddenCanvas = hiddenMaskCanvasRef.current; if (!hiddenCanvas) return; const ctx = hiddenCanvas.getContext('2d'); if (!ctx) return; if (undoStack.current.length > 50) undoStack.current.shift(); undoStack.current.push(ctx.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height)); };
  const undoCanvas = () => { const hiddenCanvas = hiddenMaskCanvasRef.current; if (!hiddenCanvas || undoStack.current.length <= 1) return; undoStack.current.pop(); const ctx = hiddenCanvas.getContext('2d'); if (ctx) { ctx.putImageData(undoStack.current[undoStack.current.length - 1], 0, 0); renderCanvas(); } };
  const clearCanvas = () => { const hiddenCanvas = hiddenMaskCanvasRef.current; if (!hiddenCanvas) return; const ctx = hiddenCanvas.getContext('2d'); if (ctx) ctx.clearRect(0, 0, hiddenCanvas.width, hiddenCanvas.height); undoStack.current = []; saveCanvasState(); renderCanvas(); };
  const renderCanvas = () => { const canvas = canvasRef.current; const hiddenCanvas = hiddenMaskCanvasRef.current; if (!canvas || !hiddenCanvas || !bgImg.current) return; const ctx = canvas.getContext('2d'); const hiddenCtx = hiddenCanvas.getContext('2d'); if (!ctx || !hiddenCtx) return; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bgImg.current, 0, 0, canvas.width, canvas.height); const tempCanvas = document.createElement('canvas'); tempCanvas.width = canvas.width; tempCanvas.height = canvas.height; const tCtx = tempCanvas.getContext('2d'); if (!tCtx) return; const imgData = hiddenCtx.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height); const overlayData = tCtx.createImageData(canvas.width, canvas.height); for (let i = 0; i < imgData.data.length; i += 4) { if (imgData.data[i + 3] > 10) { overlayData.data[i] = 239; overlayData.data[i + 1] = 68; overlayData.data[i + 2] = 68; overlayData.data[i + 3] = 120; } } tCtx.putImageData(overlayData, 0, 0); ctx.drawImage(tempCanvas, 0, 0); };
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => { isDrawing.current = true; const canvas = canvasRef.current; const hiddenCanvas = hiddenMaskCanvasRef.current; if (!canvas || !hiddenCanvas) return; const ctx = canvas.getContext('2d'); const hiddenCtx = hiddenCanvas.getContext('2d'); if (!ctx || !hiddenCtx) return; const rect = canvas.getBoundingClientRect(); const x = (e.clientX - rect.left) * (canvas.width / rect.width); const y = (e.clientY - rect.top) * (canvas.height / rect.height); ctx.beginPath(); ctx.moveTo(x, y); hiddenCtx.beginPath(); hiddenCtx.moveTo(x, y); };
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => { if (cursorRef.current) { cursorRef.current.style.left = `${e.clientX}px`; cursorRef.current.style.top = `${e.clientY}px`; } if (isDrawing.current) drawOnCanvas(e); };
  const handleCanvasMouseUp = () => { if (isDrawing.current) { saveCanvasState(); isDrawing.current = false; renderCanvas(); } };
  const drawOnCanvas = (e: React.MouseEvent<HTMLDivElement>) => { const canvas = canvasRef.current; const hiddenCanvas = hiddenMaskCanvasRef.current; if (!canvas || !hiddenCanvas || !isDrawing.current) return; const ctx = canvas.getContext('2d'); const hiddenCtx = hiddenCanvas.getContext('2d'); if (!ctx || !hiddenCtx) return; const rect = canvas.getBoundingClientRect(); const x = (e.clientX - rect.left) * (canvas.width / rect.width); const y = (e.clientY - rect.top) * (canvas.height / rect.height); hiddenCtx.lineWidth = brushSize; hiddenCtx.lineCap = 'round'; hiddenCtx.lineJoin = 'round'; hiddenCtx.strokeStyle = 'rgba(255, 255, 255, 1.0)'; hiddenCtx.lineTo(x, y); hiddenCtx.stroke(); ctx.lineWidth = brushSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; ctx.lineTo(x, y); ctx.stroke(); };

  const submitRetouch = async () => { if(!retouchPrompt) return; setActiveModal('none'); if (user) await supabase.from('projects').update({ status: 'processing' }).eq('name', orderId).eq('user_id', user.id); setIsRendering(true); const canvas = canvasRef.current; const hiddenCanvas = hiddenMaskCanvasRef.current; if (!canvas || !hiddenCanvas) return; const apiCanvas = document.createElement('canvas'); apiCanvas.width = canvas.width; apiCanvas.height = canvas.height; const aCtx = apiCanvas.getContext('2d'); if (!aCtx) return; aCtx.fillStyle = 'black'; aCtx.fillRect(0, 0, apiCanvas.width, apiCanvas.height); const hiddenCtx = hiddenCanvas.getContext('2d'); if(!hiddenCtx) return; const maskData = hiddenCtx.getImageData(0, 0, canvas.width, canvas.height); for (let i = 0; i < maskData.data.length; i += 4) { if (maskData.data[i + 3] > 10) { maskData.data[i] = 255; maskData.data[i + 1] = 255; maskData.data[i + 2] = 255; maskData.data[i + 3] = 255; } } aCtx.putImageData(maskData, 0, 0); apiCanvas.toBlob(async (b) => { if(!b) return; const fd = new FormData(); fd.append('job_name', orderId); fd.append('image_name', currentCanvasImgId); fd.append('prompt', retouchPrompt); fd.append('mask_file', b, 'mask.png'); fd.append('save_new', saveAsNew.toString()); try { await fetch(`${API}/execute-retouch/`, { method:'POST', body:fd }); } catch(e) { console.error(e); } }, 'image/png'); };
  const submitRerender = async () => { setActiveModal('none'); if (user) await supabase.from('projects').update({ status: 'processing' }).eq('name', orderId).eq('user_id', user.id); setIsRendering(true); const fd = new FormData(); fd.append('job_name', orderId); fd.append('image_name', currentCanvasImgId); fd.append('image_type', rerenderData.type); fd.append('style', rerenderData.style); fd.append('prompt', rerenderData.prompt); try { await fetch(`${API}/re-render-single/`, { method: 'POST', body: fd }); } catch(e) { console.error(e); } };
  const approveImage = async (imgName: string) => { const fd = new FormData(); fd.append('job_name', orderId); fd.append('image_name', imgName); await fetch(`${API}/approve-image/`, { method:'POST', body:fd }); loadGallery(orderId); };
  const deleteSingleImage = async (imgName: string) => { if (!window.confirm("Are you sure you want to permanently delete this image?")) return; const fd = new FormData(); fd.append('job_name', orderId); fd.append('image_name', imgName); try { await fetch(`${API}/delete-image/`, { method: 'POST', body: fd }); setGalleryImages(prev => prev.filter(img => img.name !== imgName)); } catch (e) { console.error("Failed to delete image:", e); } };
  const handleDownloadSingle = async (url: string, filename: string) => { try { const response = await fetch(url); const blob = await response.blob(); const blobUrl = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = blobUrl; link.download = filename || 'file'; document.body.appendChild(link); link.click(); document.body.removeChild(link); setTimeout(() => URL.revokeObjectURL(blobUrl), 100); } catch (error) { window.open(url, '_blank'); } };
  const handleSlider = (e: React.MouseEvent<HTMLDivElement>) => { const rect = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - rect.left) / rect.width) * 100; const percent = Math.max(0, Math.min(100, x)); const beforeImg = document.getElementById('modalBefore'); const handle = document.getElementById('modalHandle'); if (beforeImg && handle) { beforeImg.style.clipPath = `inset(0 ${100 - percent}% 0 0)`; handle.style.left = `${percent}%`; } };

  useEffect(() => { const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setActiveModal('none'); if ((e.metaKey || e.ctrlKey) && e.key === 'z') undoCanvas(); }; window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }, []);

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col font-sans">
      <div ref={cursorRef} style={{ display: activeModal === 'retouch' ? 'block' : 'none', width: brushSize, height: brushSize }} className="fixed border-2 border-[#ef4444]/80 rounded-full pointer-events-none z-[9999] -translate-x-1/2 -translate-y-1/2 bg-[#ef4444]/20 mix-blend-difference"></div>
      <canvas ref={hiddenMaskCanvasRef} style={{ display: 'none' }}></canvas>

      <main className="flex-1 flex flex-col max-w-6xl mx-auto w-full p-8">
          
        <div className="mb-12 flex justify-between items-start">
            <div>
                <h1 className="text-3xl font-black text-white uppercase tracking-widest mb-2 flex items-center gap-4">
                    <span className="text-4xl">⚡</span> Express Retouch
                </h1>
                <p className="text-slate-400 max-w-2xl">Enhance exteriors, fix blown-out windows, or magically alter the weather.</p>
            </div>
            <div className="text-right border border-white/10 px-4 py-2 rounded-xl bg-white/5">
                <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Order ID</p>
                <p className="text-lg text-white font-black">{orderId}</p>
            </div>
        </div>

        {/* --- WIZARD STEP 1: CHOOSE STYLE --- */}
        {wizardStep === 1 && uploadedFiles.length === 0 && galleryImages.length === 0 && !isRendering && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-xs font-black text-[#009183] uppercase tracking-widest mb-6">Step 1: Choose your magic</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {STYLE_CARDS.map(style => (
                        <div 
                            key={style.id} 
                            onClick={() => selectStyleAndProceed(style.id)}
                            className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 cursor-pointer hover:border-[#009183]/50 hover:bg-[#1e293b] transition-all group flex flex-col h-full shadow-lg hover:shadow-[0_10px_30px_-15px_rgba(0,145,131,0.3)] hover:-translate-y-1"
                        >
                            <div className="text-4xl mb-4 group-hover:scale-110 transition-transform origin-left">{style.icon}</div>
                            <h3 className="text-sm font-black text-white uppercase tracking-wider mb-2">{style.title}</h3>
                            <p className="text-slate-400 text-xs leading-relaxed flex-1">{style.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* --- WIZARD STEP 2: UPLOAD PHOTOS --- */}
        {wizardStep === 2 && uploadedFiles.length === 0 && galleryImages.length === 0 && !isRendering && (
          <div className="animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xs font-black text-[#009183] uppercase tracking-widest">Step 2: Upload Photos</h2>
                  <button onClick={() => setWizardStep(1)} className="text-slate-500 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-colors">Change Style</button>
              </div>
              
              <div 
                  onDragOver={(e) => e.preventDefault()} 
                  onDrop={handleDropZone}
                  className="glass p-16 border-2 border-dashed border-[#009183]/40 flex flex-col items-center gap-8 rounded-3xl bg-[#0f172a]/50 shadow-[0_0_30px_rgba(0,145,131,0.05)]"
              >
                  <div className="text-center">
                      <div className="text-5xl mb-4">{STYLE_CARDS.find(s => s.id === globalStyle)?.icon}</div>
                      <p className="text-white font-bold text-lg">Applying: <span className="text-[#009183] uppercase tracking-widest">{STYLE_CARDS.find(s => s.id === globalStyle)?.title}</span></p>
                  </div>
                  
                  <div className="w-full max-w-2xl mx-auto space-y-4">
                      <label className="text-[10px] font-bold text-[#009183] uppercase tracking-[0.2em] block text-center mb-6">
                          📍 Legg til adresse (Valgfritt)
                      </label>
                      <Autocomplete
                          apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
                          onPlaceSelected={(place) => {
                              if (place && place.formatted_address) {
                                  setOrderAddress(place.formatted_address);
                              }
                          }}
                          options={{ types: ["address"], componentRestrictions: { country: "no" } }}
                          placeholder="SØK ETTER ADRESSE..."
                          className="w-full bg-transparent border-b-2 border-slate-700 text-2xl font-black text-white outline-none focus:border-[#009183] uppercase pb-4 transition-colors text-center placeholder:text-slate-600"
                      />
                  </div>
                  
                  <input type="file" multiple className="hidden" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} />
                  <button onClick={() => fileInputRef.current?.click()} className="px-12 py-4 bg-[#009183] text-white rounded-full font-black uppercase tracking-widest text-xs cursor-pointer hover:bg-[#00b09f] transition-all shadow-[0_0_20px_rgba(0,145,131,0.4)]">
                      Select Images
                  </button>
              </div>
          </div>
        )}

        {/* --- WIZARD STEP 3: REVIEW & RENDER --- */}
        {uploadedFiles.length > 0 && !isRendering && galleryImages.length === 0 && (
          <div className="space-y-8 animate-in fade-in duration-500">
              <div className="flex justify-between items-center">
                  <h2 className="text-xs font-black text-[#009183] uppercase tracking-widest">Step 3: Review & Render</h2>
                  <button onClick={() => fileInputRef.current?.click()} className="text-white text-[10px] font-bold uppercase tracking-widest border border-slate-700 px-4 py-2 rounded-lg hover:bg-slate-800">Add More Photos</button>
                  <input type="file" multiple className="hidden" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {uploadedFiles.map((file) => (
                  <div key={file.id} className="bg-[#0f172a] rounded-2xl overflow-hidden border border-slate-800 relative flex flex-col shadow-lg">
                    <button onClick={() => removeFile(file.id)} className="absolute top-2 right-2 bg-red-500/80 text-white rounded-full w-6 h-6 flex items-center justify-center text-[10px] font-black z-10 hover:bg-red-600">X</button>
                    <img src={file.url} alt={`Upload`} className="aspect-[3/2] object-cover" />
                    <div className="p-4 flex flex-col gap-3">
                        <div className="flex gap-2">
                            <select value={file.type} onChange={(e) => updateFileField(file.id, 'type', e.target.value)} className="w-1/3 bg-[#0B1120] text-slate-300 rounded-lg px-2 py-2 text-[9px] font-bold uppercase border border-slate-700 outline-none"><option value="exterior">Exterior</option><option value="interior">Interior</option><option value="drone">Drone</option></select>
                            <select value={file.style} onChange={(e) => updateFileField(file.id, 'style', e.target.value)} className="w-2/3 bg-[#0B1120] text-slate-300 rounded-lg px-2 py-2 text-[9px] font-bold uppercase border border-slate-700 outline-none">
                                <optgroup label="Lighting"><option value="weather_rain_to_sun">Rain to Sun</option><option value="sunny_midday">Sunny Midday</option><option value="dusk_blue_hour">Blue Hour</option><option value="dusk_purple_orange">Purple Dusk</option><option value="early_morning">Early Morning</option></optgroup>
                                <optgroup label="Season"><option value="winter">Winter</option><option value="autumn">Autumn</option><option value="spring">Spring</option><option value="summer">Summer</option></optgroup>
                            </select>
                        </div>
                        <input type="text" placeholder="Custom instructions (optional)..." value={file.prompt} onChange={(e) => updateFileField(file.id, 'prompt', e.target.value)} className="w-full bg-[#0B1120] rounded-lg px-3 py-2 text-[10px] text-white outline-none border border-slate-700 focus:border-[#009183]" />
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-end pt-4 border-t border-slate-800">
                  <button onClick={startExpressRender} className="px-12 py-4 bg-gradient-to-r from-[#009183] to-[#00b09f] text-white font-black uppercase tracking-widest text-xs rounded-full shadow-[0_0_30px_rgba(0,145,131,0.4)] hover:scale-105 transition-transform">Start AI Render</button>
              </div>
          </div>
        )}

        {/* --- RENDERING SPINNER --- */}
        {isRendering && activeModal === 'none' && (
          <div className="glass p-16 text-center space-y-8 animate-in fade-in duration-500 rounded-3xl bg-[#0f172a]/50 border border-[#009183]/30 shadow-2xl mt-10">
              <div className="text-6xl animate-bounce mb-4">{STYLE_CARDS.find(s => s.id === globalStyle)?.icon || '⚡'}</div>
              <p className="font-black uppercase tracking-[0.3em] text-sm text-[#009183] transition-all">{progressStatus}</p>
              <div className="w-full max-w-2xl mx-auto bg-[#0B1120] h-4 rounded-full overflow-hidden p-1 border border-white/10">
                <div className="bg-gradient-to-r from-[#009183] to-[#00b09f] h-full rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(0,145,131,0.8)]" style={{ width: `${progressPct}%` }}></div>
              </div>
          </div>
        )}

        {/* --- RESULTS GALLERY --- */}
        {galleryImages.length > 0 && !isRendering && (
            <div className="animate-in fade-in slide-in-from-bottom-10 duration-500 mt-10">
                <div className="flex justify-between items-end border-b border-white/10 pb-6 mb-10">
                    <div>
                        <p className="text-[#009183] font-bold text-sm tracking-widest">{orderId}</p>
                        <h3 className="text-3xl font-black text-white uppercase">{orderAddress || "Unnamed Project"}</h3>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => window.location.href = `${API}/download-zip/${encodeURIComponent(orderId)}`} className="px-6 py-3 bg-white text-[#0B1120] rounded-full font-black uppercase tracking-widest text-[10px] hover:bg-[#009183] hover:text-white transition-all shadow-lg">Download ZIP</button>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pb-20">
                    {galleryImages.map((item) => (
                        <div key={item.name} className="group flex flex-col bg-[#0f172a] rounded-[2rem] p-4 border border-white/5 shadow-xl">
                            <div className="relative aspect-[3/2] rounded-[1.5rem] overflow-hidden bg-black mb-4 cursor-pointer" onClick={() => { setCompareData({raw: item.raw || item.url, edited: item.url}); setActiveModal('compare'); }}>
                                <img src={item.url} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" alt="Result" />
                                <button onClick={(e) => { e.stopPropagation(); deleteSingleImage(item.name); }} className="absolute top-4 right-4 bg-red-950/80 text-red-400 hover:text-white rounded-full w-8 h-8 flex items-center justify-center text-xs font-black z-30 opacity-0 group-hover:opacity-100 transition-all border border-red-900/50">🗑️</button>
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center z-20 pointer-events-none"><span className="opacity-0 group-hover:opacity-100 text-white font-bold bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm transition-opacity">Click to Compare</span></div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {item.approved ? (
                                    <span className="px-4 py-2 bg-[#009183]/10 text-[#00ff83] border border-[#009183]/30 text-[9px] font-bold uppercase tracking-widest rounded-full">✅ Approved</span>
                                ) : (
                                    <button onClick={() => approveImage(item.name)} className="px-4 py-2 bg-[#009183] text-white text-[9px] font-bold uppercase tracking-widest rounded-full hover:bg-[#00b09f] shadow-[0_0_10px_rgba(0,145,131,0.2)] transition-all">Approve</button>
                                )}
                                {!item.approved && (
                                    <button onClick={() => openCanvasStudio(item.name, item.url)} className="px-4 py-2 bg-transparent border border-slate-700 text-slate-300 text-[9px] font-bold uppercase tracking-widest rounded-full hover:bg-slate-800 hover:text-white transition-colors">✏️ Retouch</button>
                                )}
                                <button onClick={() => { setCurrentCanvasImgId(item.name); setActiveModal('rerender'); }} className="px-4 py-2 bg-transparent border border-slate-700 text-slate-300 text-[9px] font-bold uppercase tracking-widest rounded-full hover:bg-slate-800 hover:text-white transition-colors">🔄 Re-Render</button>
                                <button onClick={() => handleDownloadSingle(item.url, item.name)} className="px-4 py-2 bg-transparent border border-slate-700 text-slate-300 text-[9px] font-bold uppercase tracking-widest rounded-full hover:bg-slate-800 hover:text-white transition-colors ml-auto">⬇️ Save</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
      </main>

      {/* --- HER ER MODALENE (Vinduene) SOM JEG KUTTET I STYKKER SIST! --- */}
      {activeModal === 'retouch' && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center gap-6">
            <div className="flex justify-between items-center w-[85vw] max-w-[1100px]"><h2 className="text-2xl font-black text-[#009183] uppercase tracking-widest">Retouch Studio</h2><button onClick={() => setActiveModal('none')} className="text-slate-400 font-bold uppercase text-xs hover:text-white">Close</button></div>
            <div className="relative w-[85vw] max-w-[1100px] aspect-[3/2] bg-black border border-white/10 rounded-3xl overflow-hidden shadow-2xl" onMouseMove={handleCanvasMouseMove} onMouseDown={handleCanvasMouseDown} onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp}><canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-10 cursor-none"></canvas></div>
            <div className="w-[85vw] max-w-[1100px] flex gap-5 bg-[#0f172a] p-4 rounded-2xl items-center shadow-2xl border border-white/10">
                <div className="flex flex-col gap-1 w-40 pl-2"><label className="text-slate-400 text-[9px] font-bold uppercase tracking-widest">Brush: <span className="text-white">{brushSize}</span>px</label><input type="range" min="5" max="200" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="accent-[#009183] cursor-pointer" /></div>
                <div className="w-px h-8 bg-slate-700 mx-2"></div>
                <button onClick={undoCanvas} className="px-5 py-3 bg-[#0B1120] border border-slate-700 text-white font-bold text-xs rounded-xl">Undo</button>
                <button onClick={clearCanvas} className="px-5 py-3 bg-red-900/20 text-red-400 font-bold text-xs rounded-xl border border-red-900/50">Reset</button>
                <label className="flex items-center gap-2 text-slate-300 text-xs font-bold cursor-pointer ml-auto mr-4"><input type="checkbox" checked={saveAsNew} onChange={(e) => setSaveAsNew(e.target.checked)} className="w-4 h-4 accent-[#009183]" /> Save as new</label>
                <input type="text" value={retouchPrompt} onChange={(e) => setRetouchPrompt(e.target.value)} placeholder="Instruction (e.g. remove car)..." className="flex-1 max-w-sm bg-[#0B1120] rounded-xl p-3 text-sm text-white outline-none border border-slate-700 focus:border-[#009183]" />
                <button onClick={submitRetouch} className="px-8 py-3 bg-[#009183] text-white font-black uppercase text-xs rounded-xl">Execute</button>
            </div>
        </div>
      )}

      {activeModal === 'rerender' && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center gap-6">
            <div className="bg-[#0f172a] rounded-3xl p-8 shadow-2xl border border-white/10 w-[500px]">
                <div className="flex justify-between items-center mb-8"><h2 className="text-xl font-black text-white uppercase tracking-wider">Re-Render</h2><button onClick={() => setActiveModal('none')} className="text-slate-500 hover:text-white font-bold uppercase text-xs">Cancel</button></div>
                <div className="space-y-6">
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">Image Type</label><select value={rerenderData.type} onChange={(e) => setRerenderData({...rerenderData, type: e.target.value})} className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-4 text-white font-bold uppercase text-xs outline-none focus:border-[#009183]"><option value="exterior">Exterior</option><option value="interior">Interior</option><option value="drone">Drone</option></select></div>
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">New Style</label><select value={rerenderData.style} onChange={(e) => setRerenderData({...rerenderData, style: e.target.value})} className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-4 text-white font-bold uppercase text-xs outline-none focus:border-[#009183]"><optgroup label="Lighting"><option value="weather_rain_to_sun">Rain to Sun</option><option value="dusk_blue_hour">Blue Hour</option><option value="sunny_midday">Sunny Midday</option></optgroup></select></div>
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">Custom Prompt</label><input type="text" value={rerenderData.prompt} onChange={(e) => setRerenderData({...rerenderData, prompt: e.target.value})} className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-4 text-white text-sm outline-none focus:border-[#009183]" /></div>
                    <button onClick={submitRerender} className="w-full py-4 mt-4 bg-[#009183] text-white font-black uppercase text-xs rounded-xl shadow-[0_0_20px_rgba(0,145,131,0.2)]">Start Re-Render</button>
                </div>
            </div>
        </div>
      )}

      {activeModal === 'compare' && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center" onClick={() => setActiveModal('none')}>
            <div className="relative w-[90vw] max-w-[1100px] aspect-[3/2] rounded-[1.5rem] bg-black overflow-hidden shadow-2xl border border-white/10 cursor-col-resize" onMouseMove={handleSlider} onClick={(e) => e.stopPropagation()}>
                <img id="modalAfter" src={compareData.edited} className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10" alt="After" />
                <img id="modalBefore" src={compareData.raw} className="absolute inset-0 w-full h-full object-cover pointer-events-none z-20" alt="Before" style={{ clipPath: 'inset(0 50% 0 0)' }} />
                <div id="modalHandle" className="absolute top-0 bottom-0 w-[2px] bg-white/50 z-30 -translate-x-1/2 pointer-events-none" style={{ left: '50%' }}><div className="absolute top-1/2 left-1/2 w-10 h-10 bg-[#009183] border-[3px] border-[#0B1120] rounded-full -translate-x-1/2 -translate-y-1/2 flex items-center justify-center text-white font-bold shadow-xl">↔</div></div>
            </div>
        </div>
      )}
    </div>
  );
}