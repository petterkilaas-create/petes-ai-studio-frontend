"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { supabase } from "../../supabaseClient"; 
import Autocomplete from "react-google-autocomplete";

const API = "https://petes-ai-studio-backend-v2-32654019163.europe-north1.run.app";

type OrderArchive = { name: string; address?: string; date: string; status: string; };
type GalleryImage = { name: string; url: string; type: 'image' | 'video'; raw?: string; edited?: string; approved?: boolean; };
type UploadedFile = { id: string; file: File; url: string; type: string; style: string; prompt: string; maskBlob: Blob | null; };

export default function CopywriterPage() {
  const { user } = useUser();
  
  const isAdmin = user?.primaryEmailAddress?.emailAddress === "petter.kilaas@diakrit.com"; 
  const [viewMode, setViewMode] = useState<'mine' | 'all'>('mine');

  const [archiveOrders, setArchiveOrders] = useState<OrderArchive[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [isLoadingGallery, setIsLoadingGallery] = useState(false);

  const [orderId, setOrderId] = useState("");
  const [orderAddress, setOrderAddress] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [tone, setTone] = useState("Eksklusiv");
  const [length, setLength] = useState("Fyldig");
  const [generatedCopy, setGeneratedCopy] = useState("");

  useEffect(() => {
    setOrderId(`CPY-${Math.random().toString(16).slice(2, 8).toUpperCase()}`);
  }, []);

  const [isRendering, setIsRendering] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressStatus, setProgressStatus] = useState("Processing...");

  const [activeModal, setActiveModal] = useState<'none' | 'compare' | 'retouch' | 'rerender' | 'video'>('none');
  const [currentCanvasImgId, setCurrentCanvasImgId] = useState("");
  const [compareData, setCompareData] = useState({ raw: "", edited: "" });
  
  const [brushSize, setBrushSize] = useState(50);
  const [retouchPrompt, setRetouchPrompt] = useState("");
  const [saveAsNew, setSaveAsNew] = useState(true);
  const [rerenderData, setRerenderData] = useState({ type: "exterior", style: "dusk_blue_hour", prompt: "" });
  const [videoPrompt, setVideoPrompt] = useState("Cinematic slow pan, highly detailed architectural video, 8k resolution");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenMaskCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const pollTimer = useRef<NodeJS.Timeout | null>(null);
  const isDrawing = useRef(false);
  const bgImg = useRef<HTMLImageElement | null>(null);
  const undoStack = useRef<ImageData[]>([]);

  useEffect(() => {
    const fetchMyProjects = async () => {
      if (!user) return;
      
      let query = supabase
        .from('projects')
        .select('name, address, created_at, status')
        .order('created_at', { ascending: false });

      if (viewMode === 'mine') {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;
      if (!error && data) {
        setArchiveOrders(data.map(p => ({ 
          name: p.name, 
          address: p.address,
          date: new Date(p.created_at).toLocaleDateString('no-NO'), 
          status: p.status || 'processing' 
        })));
      }
    };
    
    fetchMyProjects();

    const channel = supabase.channel('realtime-projects-archive').on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => {
        fetchMyProjects(); 
    }).subscribe();

    return () => { supabase.removeChannel(channel); if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, [user, viewMode]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const newFiles: UploadedFile[] = [];
    for (let i = 0; i < e.target.files.length; i++) {
      if (e.target.files[i].type.startsWith("image/")) {
        newFiles.push({ id: "img_" + Math.random().toString(36).substr(2, 9), file: e.target.files[i], url: URL.createObjectURL(e.target.files[i]), type: "exterior", style: "", prompt: "", maskBlob: null });
      }
    }
    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id: string) => setUploadedFiles(prev => prev.filter(f => f.id !== id));

  const startCopyGeneration = async () => {
    if (!orderId || uploadedFiles.length === 0) return;
    setIsRendering(true); setProgressPct(50); setProgressStatus("Analyzing Photos & Maps...");
    
    const fd = new FormData();
    fd.append('job_name', orderId);
    fd.append('address', orderAddress);
    fd.append('tone', tone);
    fd.append('length', length);
    if (user) fd.append('user_id', user.id);
    
    uploadedFiles.forEach(f => { fd.append('files', f.file); });

    try {
        const res = await fetch(`${API}/generate-copy/`, { method: 'POST', body: fd });
        const data = await res.json();
        
        setIsRendering(false); setProgressPct(100);
        if (data.status === 'success') {
            setGeneratedCopy(data.copy);
            viewOrder(orderId); 
        } else {
            alert("Error generating copy: " + data.message);
        }
    } catch (error) { console.error(error); setIsRendering(false); }
  };

  const viewOrder = async (name: string) => { 
      if (pollTimer.current) clearTimeout(pollTimer.current);
      setSelectedOrder(name); setIsLoadingGallery(true); setGalleryImages([]);
      
      const { data, error } = await supabase.from('projects').select('generated_copy').eq('name', name).single();
      if (!error && data && data.generated_copy) {
          setGeneratedCopy(data.generated_copy);
      }

      await loadGallery(name);
      setIsLoadingGallery(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadGallery = async (name: string) => { 
      try { 
          // Cache buster included!
          const res = await fetch(`${API}/list-finished/?job_name=${encodeURIComponent(name)}&t=${Date.now()}`, { cache: 'no-store' }); 
          const data = await res.json(); 
          setGalleryImages(data.images); 
      } catch (e) { console.error(e); } 
  };

  const pollProgress = async (pollingJobName: string) => {
    try {
        // Cache buster included!
        const r = await fetch(`${API}/batch-progress/?job_name=${encodeURIComponent(pollingJobName)}&t=${Date.now()}`, { cache: 'no-store' }); 
        const s = await r.json();
        if (s.status === 'finished' || s.status === 'completed') { 
            setIsRendering(false); setProgressPct(100);
            if (pollTimer.current) clearTimeout(pollTimer.current);
            setTimeout(() => { loadGallery(pollingJobName); }, 1000);
            return; 
        }
        if (s.total > 0) { setProgressPct((s.completed / s.total) * 100); setProgressStatus(`Processing... ${s.completed} / ${s.total}`); }
    } catch (e) { console.error(e); }
    pollTimer.current = setTimeout(() => pollProgress(pollingJobName), 2000);
  };

  const deleteOrder = async (e: React.MouseEvent, orderName: string) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to permanently delete this project?`)) return;
    setArchiveOrders(prev => prev.filter(o => o.name !== orderName));
    if (selectedOrder === orderName) setSelectedOrder(null);
    if (user) await supabase.from('projects').delete().eq('name', orderName);
    const fd = new FormData(); fd.append('job_name', orderName); fd.append('image_name', ''); 
    fetch(`${API}/delete-image/`, { method: 'POST', body: fd }).catch(console.error);
  };

  const renameOrder = async (e: React.MouseEvent, oldName: string) => {
    e.stopPropagation();
    const newNameRaw = window.prompt("Enter new project ID:", oldName);
    if (!newNameRaw || newNameRaw === oldName) return;
    const newName = newNameRaw.replace(/ /g, "_");
    setArchiveOrders(prev => prev.map(o => o.name === oldName ? { ...o, name: newName } : o));
    if (selectedOrder === oldName) setSelectedOrder(newName);
    if (user) await supabase.from('projects').update({ name: newName }).eq('name', oldName);
    const fd = new FormData(); fd.append('old_name', oldName); fd.append('new_name', newName);
    fetch(`${API}/rename-order/`, { method: 'POST', body: fd }).catch(console.error);
  };

  const deleteSingleImage = async (imgName: string) => {
      if (!selectedOrder) return;
      if (!window.confirm("Are you sure you want to permanently delete this image?")) return;
      const fd = new FormData(); fd.append('job_name', selectedOrder); fd.append('image_name', imgName);
      try {
          await fetch(`${API}/delete-image/`, { method: 'POST', body: fd });
          setGalleryImages(prev => prev.filter(img => img.name !== imgName));
      } catch (e) { console.error(e); }
  };

  const approveImage = async (imgName: string) => { 
      if(!selectedOrder) return;
      const fd = new FormData(); fd.append('job_name', selectedOrder); fd.append('image_name', imgName); 
      await fetch(`${API}/approve-image/`, { method:'POST', body:fd }); 
      loadGallery(selectedOrder); 
  };

  const handleDownloadSingle = async (url: string, filename: string) => {
      try {
          const response = await fetch(url); const blob = await response.blob(); const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a'); link.href = blobUrl; link.download = filename || 'file';
          document.body.appendChild(link); link.click(); document.body.removeChild(link); setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      } catch (error) { window.open(url, '_blank'); }
  };

  // Canvas Studio Logic
  const openCanvasStudio = (imgName: string, customUrl: string) => { setCurrentCanvasImgId(imgName); setActiveModal('retouch'); setBrushSize(50); const image = new Image(); image.crossOrigin = "Anonymous"; image.onload = () => { bgImg.current = image; initCanvas(); }; image.src = customUrl; };
  const initCanvas = () => { const canvas = canvasRef.current; const hiddenCanvas = hiddenMaskCanvasRef.current; if (!canvas || !hiddenCanvas || !bgImg.current) return; canvas.width = hiddenCanvas.width = bgImg.current.width; canvas.height = hiddenCanvas.height = bgImg.current.height; const hiddenCtx = hiddenCanvas.getContext('2d'); if (hiddenCtx) hiddenCtx.clearRect(0, 0, hiddenCanvas.width, hiddenCanvas.height); undoStack.current = []; saveCanvasState(); renderCanvas(); };
  const saveCanvasState = () => { const hiddenCanvas = hiddenMaskCanvasRef.current; if (!hiddenCanvas) return; const ctx = hiddenCanvas.getContext('2d'); if (!ctx) return; if (undoStack.current.length > 50) undoStack.current.shift(); undoStack.current.push(ctx.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height)); };
  const undoCanvas = () => { const hiddenCanvas = hiddenMaskCanvasRef.current; if (!hiddenCanvas || undoStack.current.length <= 1) return; undoStack.current.pop(); const ctx = hiddenCanvas.getContext('2d'); if (ctx) { ctx.putImageData(undoStack.current[undoStack.current.length - 1], 0, 0); renderCanvas(); } };
  const clearCanvas = () => { const hiddenCanvas = hiddenMaskCanvasRef.current; if (!hiddenCanvas) return; const ctx = hiddenCanvas.getContext('2d'); if (ctx) ctx.clearRect(0, 0, hiddenCanvas.width, hiddenCanvas.height); undoStack.current = []; saveCanvasState(); renderCanvas(); };
  const renderCanvas = () => { const canvas = canvasRef.current; const hiddenCanvas = hiddenMaskCanvasRef.current; if (!canvas || !hiddenCanvas || !bgImg.current) return; const ctx = canvas.getContext('2d'); const hiddenCtx = hiddenCanvas.getContext('2d'); if (!ctx || !hiddenCtx) return; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bgImg.current, 0, 0, canvas.width, canvas.height); const tempCanvas = document.createElement('canvas'); tempCanvas.width = canvas.width; tempCanvas.height = canvas.height; const tCtx = tempCanvas.getContext('2d'); if (!tCtx) return; const imgData = hiddenCtx.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height); const overlayData = tCtx.createImageData(canvas.width, canvas.height); for (let i = 0; i < imgData.data.length; i += 4) { if (imgData.data[i + 3] > 10) { overlayData.data[i] = 239; overlayData.data[i + 1] = 68; overlayData.data[i + 2] = 68; overlayData.data[i + 3] = 120; } } tCtx.putImageData(overlayData, 0, 0); ctx.drawImage(tempCanvas, 0, 0); };
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => { isDrawing.current = true; const canvas = canvasRef.current; const hiddenCanvas = hiddenMaskCanvasRef.current; if (!canvas || !hiddenCanvas) return; const ctx = canvas.getContext('2d'); const hiddenCtx = hiddenCanvas.getContext('2d'); if (!ctx || !hiddenCtx) return; const rect = canvas.getBoundingClientRect(); const x = (e.clientX - rect.left) * (canvas.width / rect.width); const y = (e.clientY - rect.top) * (canvas.height / rect.height); ctx.beginPath(); ctx.moveTo(x, y); hiddenCtx.beginPath(); hiddenCtx.moveTo(x, y); };
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => { if (cursorRef.current) { cursorRef.current.style.left = `${e.clientX}px`; cursorRef.current.style.top = `${e.clientY}px`; } if (isDrawing.current) drawOnCanvas(e); };
  const handleCanvasMouseUp = () => { if (isDrawing.current) { saveCanvasState(); isDrawing.current = false; renderCanvas(); } };
  const drawOnCanvas = (e: React.MouseEvent<HTMLDivElement>) => { const canvas = canvasRef.current; const hiddenCanvas = hiddenMaskCanvasRef.current; if (!canvas || !hiddenCanvas || !isDrawing.current) return; const ctx = canvas.getContext('2d'); const hiddenCtx = hiddenCanvas.getContext('2d'); if (!ctx || !hiddenCtx) return; const rect = canvas.getBoundingClientRect(); const x = (e.clientX - rect.left) * (canvas.width / rect.width); const y = (e.clientY - rect.top) * (canvas.height / rect.height); hiddenCtx.lineWidth = brushSize; hiddenCtx.lineCap = 'round'; hiddenCtx.lineJoin = 'round'; hiddenCtx.strokeStyle = 'rgba(255, 255, 255, 1.0)'; hiddenCtx.lineTo(x, y); hiddenCtx.stroke(); ctx.lineWidth = brushSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; ctx.lineTo(x, y); ctx.stroke(); };

  const submitRetouch = async () => {
      if(!retouchPrompt || !selectedOrder) return;
      setActiveModal('none'); 
      if (user) await supabase.from('projects').update({ status: 'processing' }).eq('name', selectedOrder);
      setIsRendering(true); setProgressPct(0); setProgressStatus("Initializing Retouch...");
      const canvas = canvasRef.current; const hiddenCanvas = hiddenMaskCanvasRef.current;
      if (!canvas || !hiddenCanvas) return;
      const apiCanvas = document.createElement('canvas'); apiCanvas.width = canvas.width; apiCanvas.height = canvas.height;
      const aCtx = apiCanvas.getContext('2d'); if (!aCtx) return;
      aCtx.fillStyle = 'black'; aCtx.fillRect(0, 0, apiCanvas.width, apiCanvas.height);
      const hiddenCtx = hiddenCanvas.getContext('2d'); if(!hiddenCtx) return;
      const maskData = hiddenCtx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < maskData.data.length; i += 4) { if (maskData.data[i + 3] > 10) { maskData.data[i] = 255; maskData.data[i + 1] = 255; maskData.data[i + 2] = 255; maskData.data[i + 3] = 255; } }
      aCtx.putImageData(maskData, 0, 0);
      apiCanvas.toBlob(async (b) => {
          if(!b) return;
          const fd = new FormData(); fd.append('job_name', selectedOrder); fd.append('image_name', currentCanvasImgId); fd.append('prompt', retouchPrompt); fd.append('mask_file', b, 'mask.png'); fd.append('save_new', saveAsNew.toString()); 
          try { await fetch(`${API}/execute-retouch/`, { method:'POST', body:fd }); pollProgress(selectedOrder); } catch(e) { console.error(e); }
      }, 'image/png');
  };

  const submitRerender = async () => {
      if(!selectedOrder) return;
      setActiveModal('none');
      if (user) await supabase.from('projects').update({ status: 'processing' }).eq('name', selectedOrder);
      setIsRendering(true); setProgressPct(0); setProgressStatus("Initializing Re-Render...");
      const fd = new FormData(); fd.append('job_name', selectedOrder); fd.append('image_name', currentCanvasImgId); fd.append('image_type', rerenderData.type); fd.append('style', rerenderData.style); fd.append('prompt', rerenderData.prompt);
      try { await fetch(`${API}/re-render-single/`, { method: 'POST', body: fd }); pollProgress(selectedOrder); } catch(e) { console.error(e); }
  };

  const submitVideo = async () => {
      if(!selectedOrder) return;
      setActiveModal('none');
      if (user) await supabase.from('projects').update({ status: 'processing' }).eq('name', selectedOrder);
      setIsRendering(true); setProgressPct(0); setProgressStatus("Generating Veo Magic...");
      const fd = new FormData(); fd.append('job_name', selectedOrder); fd.append('image_name', currentCanvasImgId); fd.append('prompt', videoPrompt);
      try { await fetch(`${API}/generate-video/`, { method: 'POST', body: fd }); pollProgress(selectedOrder); } catch(e) { console.error(e); }
  };

  const handleSlider = (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const percent = Math.max(0, Math.min(100, x));
      const beforeImg = document.getElementById('modalBefore');
      const handle = document.getElementById('modalHandle');
      if (beforeImg && handle) { beforeImg.style.clipPath = `inset(0 ${100 - percent}% 0 0)`; handle.style.left = `${percent}%`; }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setActiveModal('none'); if ((e.metaKey || e.ctrlKey) && e.key === 'z') undoCanvas(); };
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredOrders = archiveOrders.filter(order => 
      order.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (order.address && order.address.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex flex-col bg-[#0B1120] text-white min-h-screen font-sans">
      <div ref={cursorRef} style={{ display: activeModal === 'retouch' ? 'block' : 'none', width: brushSize, height: brushSize }} className="fixed border-2 border-[#ef4444]/80 rounded-full pointer-events-none z-[9999] -translate-x-1/2 -translate-y-1/2 bg-[#ef4444]/20 mix-blend-difference"></div>
      <canvas ref={hiddenMaskCanvasRef} style={{ display: 'none' }}></canvas>

      <main className="max-w-6xl mx-auto w-full p-8 flex-1">
        
        {/* --- CREATION VIEW --- */}
        {!selectedOrder ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="mb-12 bg-[#0f172a] border border-slate-800 rounded-3xl p-8 shadow-xl flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-black text-white uppercase tracking-widest mb-4 flex items-center gap-4">
                            <span className="text-4xl">✍️</span> AI Copywriter
                        </h1>
                        <p className="text-slate-400 max-w-2xl">Upload photos and enter an address to generate a professional real estate listing text.</p>
                    </div>
                    <div className="text-right border border-white/10 px-4 py-2 rounded-xl bg-white/5">
                        <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Order ID</p>
                        <p className="text-lg text-white font-black">{orderId}</p>
                    </div>
                </div>

                <div className="glass p-16 border-2 border-dashed border-[#009183]/40 flex flex-col items-center gap-8 rounded-3xl bg-[#0f172a]/50 shadow-[0_0_30px_rgba(0,145,131,0.05)] mb-12">
                  <div className="w-full max-w-2xl mx-auto space-y-4">
                      <label className="text-[10px] font-bold text-[#009183] uppercase tracking-[0.2em] block text-center mb-6">
                          📍 Property Address
                      </label>
                      <Autocomplete
                          apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
                          onPlaceSelected={(place) => {
                              if (place && place.formatted_address) {
                                  setOrderAddress(place.formatted_address);
                              }
                          }}
                          options={{ types: ["address"], componentRestrictions: { country: "no" } }}
                          placeholder="SEARCH ADDRESS..."
                          className="w-full bg-transparent border-b-2 border-slate-700 text-2xl font-black text-white outline-none focus:border-[#009183] uppercase pb-4 transition-colors text-center placeholder:text-slate-600"
                      />
                  </div>
                  
                  <div className="flex gap-6 mt-4 w-full max-w-md">
                      <select value={tone} onChange={(e) => setTone(e.target.value)} className="flex-1 bg-[#0B1120] border border-slate-700 rounded-xl p-4 text-white font-bold uppercase text-xs outline-none focus:border-[#009183]">
                          <option value="Eksklusiv og luksuriøs">Exclusive</option>
                          <option value="Varm og innbydende">Warm & Inviting</option>
                          <option value="Moderne og minimalistisk">Modern</option>
                      </select>
                      <select value={length} onChange={(e) => setLength(e.target.value)} className="flex-1 bg-[#0B1120] border border-slate-700 rounded-xl p-4 text-white font-bold uppercase text-xs outline-none focus:border-[#009183]">
                          <option value="Fyldig og detaljert">Long</option>
                          <option value="Kort og presis">Short</option>
                      </select>
                  </div>

                  <input type="file" multiple className="hidden" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} />
                  <button onClick={() => fileInputRef.current?.click()} className="px-12 py-4 bg-slate-800 text-white rounded-full font-black uppercase tracking-widest text-xs hover:bg-slate-700 transition-colors">
                      {uploadedFiles.length > 0 ? `${uploadedFiles.length} Images Selected` : 'Select Images'}
                  </button>

                  {uploadedFiles.length > 0 && orderAddress && (
                      <button onClick={startCopyGeneration} className="mt-4 px-12 py-5 bg-gradient-to-r from-[#009183] to-[#00b09f] text-white rounded-full font-black uppercase tracking-widest text-xs hover:scale-105 transition-transform shadow-[0_0_20px_rgba(0,145,131,0.4)]">
                          Generate Prospekt
                      </button>
                  )}
              </div>

              {/* LISTE OVER TIDLIGERE TEKSTER */}
              <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4 mt-20">
                  <div>
                      <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-2">Previous Texts</h2>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto">
                      <input type="text" placeholder="Search ID or Address..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full md:w-64 bg-[#0f172a] rounded-xl px-4 py-3 text-xs text-white outline-none border border-slate-700 focus:border-[#009183]" />
                  </div>
              </div>

              <div className="bg-[#0f172a] border border-slate-800 rounded-3xl shadow-xl mb-20 overflow-hidden">
                  <table className="w-full text-left border-collapse">
                      <thead><tr className="bg-[#1e293b] border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-400 font-bold"><th className="p-5">Project</th><th className="p-5">Date</th><th className="p-5">Status</th><th className="p-5 text-right">Actions</th></tr></thead>
                      <tbody>
                          {filteredOrders.length === 0 ? (
                              <tr><td colSpan={4} className="p-8 text-center text-slate-500 text-sm">No projects found.</td></tr>
                          ) : (
                              filteredOrders.filter(o => o.name.startsWith('CPY')).map(order => ( 
                                  <tr key={order.name} onClick={() => viewOrder(order.name)} className="border-b border-slate-800/50 hover:bg-[#1e293b]/50 cursor-pointer transition-colors group">
                                      <td className="p-5 font-bold text-white flex flex-col justify-center">
                                          <div className="flex items-center gap-3">
                                              <span className="text-xl group-hover:scale-110 transition-transform">✍️</span>
                                              <span>{order.name}</span>
                                          </div>
                                          {order.address && <span className="text-[10px] text-slate-400 mt-1 ml-9 uppercase tracking-widest font-normal">{order.address}</span>}
                                      </td>
                                      <td className="p-5 text-slate-400 text-sm">{order.date}</td>
                                      <td className="p-5"><span className="bg-green-900/30 text-green-400 border border-green-500/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Completed</span></td>
                                      <td className="p-5 text-right flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button onClick={(e) => deleteOrder(e, order.name)} className="w-8 h-8 rounded-full bg-red-900/20 border border-red-900/50 flex items-center justify-center hover:bg-red-900/40 text-red-400 transition-colors" title="Delete">🗑️</button>
                                      </td>
                                  </tr>
                              ))
                          )}
                      </tbody>
                  </table>
              </div>
            </div>
        ) : (
            /* --- SINGLE ORDER VIEW --- */
            <div className="animate-in fade-in duration-500 pb-20">
                <div className="flex justify-between items-end border-b border-white/10 pb-6 mb-10">
                    <div>
                        <button onClick={() => { setSelectedOrder(null); setGeneratedCopy(""); }} className="text-[#009183] hover:text-white text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2 transition-colors"><span>←</span> Back to Editor</button>
                        <p className="text-[#009183] font-bold text-sm tracking-widest mb-1">{selectedOrder}</p>
                        <h3 className="text-3xl font-black text-white uppercase">{archiveOrders.find(o => o.name === selectedOrder)?.address || "Unnamed Project"}</h3>
                    </div>
                </div>

                {isRendering && activeModal === 'none' && (
                  <div className="glass p-16 text-center space-y-8 animate-in fade-in duration-500 mb-8 rounded-3xl bg-[#0f172a]/50 border border-[#009183]/30">
                      <p className="font-black uppercase tracking-[0.3em] text-sm text-[#009183] animate-pulse">{progressStatus}</p>
                      <div className="w-full max-w-2xl mx-auto bg-[#0B1120] h-4 rounded-full overflow-hidden p-1 border border-white/10"><div className="bg-gradient-to-r from-[#009183] to-[#00b09f] h-full rounded-full transition-all duration-700" style={{ width: `${progressPct}%` }}></div></div>
                  </div>
                )}

                {generatedCopy && !isRendering && (
                    <div className="bg-[#0f172a] rounded-3xl p-8 border border-[#009183]/30 shadow-2xl relative">
                        <button onClick={() => navigator.clipboard.writeText(generatedCopy)} className="absolute top-8 right-8 px-6 py-2 bg-[#1e293b] hover:bg-[#2dd4bf] hover:text-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">
                            Copy Text
                        </button>
                        <h4 className="text-xs font-black text-[#009183] uppercase tracking-widest mb-6">Generated Prospekt</h4>
                        <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {generatedCopy}
                        </div>
                    </div>
                )}
            </div>
        )}
      </main>

      {/* --- MODALS --- */}
      {activeModal === 'retouch' && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center gap-6">
            <div className="flex justify-between items-center w-[85vw] max-w-[1100px]"><h2 className="text-2xl font-black text-[#009183] uppercase tracking-widest">Retouch Studio</h2><button onClick={() => setActiveModal('none')} className="text-slate-400 font-bold uppercase text-xs hover:text-white transition-colors">Close</button></div>
            <div className="relative w-[85vw] max-w-[1100px] aspect-[3/2] bg-black border border-white/10 rounded-3xl overflow-hidden shadow-2xl" onMouseMove={handleCanvasMouseMove} onMouseDown={handleCanvasMouseDown} onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp}><canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-10 cursor-none"></canvas></div>
            <div className="w-[85vw] max-w-[1100px] flex gap-5 bg-[#0f172a] p-4 rounded-2xl items-center shadow-2xl border border-white/10">
                <div className="flex flex-col gap-1 w-40 pl-2"><label className="text-slate-400 text-[9px] font-bold uppercase tracking-widest">Brush: <span className="text-white">{brushSize}</span>px</label><input type="range" min="5" max="200" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="accent-[#009183] cursor-pointer" /></div>
                <div className="w-px h-8 bg-slate-700 mx-2"></div>
                <button onClick={undoCanvas} className="px-5 py-3 bg-[#0B1120] border border-slate-700 text-white font-bold text-xs rounded-xl">Undo</button>
                <button onClick={clearCanvas} className="px-5 py-3 bg-red-900/20 text-red-400 font-bold text-xs rounded-xl border border-red-900/50">Reset</button>
                <label className="flex items-center gap-2 text-slate-300 text-xs font-bold cursor-pointer ml-auto mr-4"><input type="checkbox" checked={saveAsNew} onChange={(e) => setSaveAsNew(e.target.checked)} className="w-4 h-4 accent-[#009183]" /> Save as new</label>
                <input type="text" value={retouchPrompt} onChange={(e) => setRetouchPrompt(e.target.value)} placeholder="Instruction..." className="flex-1 max-w-sm bg-[#0B1120] rounded-xl p-3 text-sm text-white outline-none border border-slate-700 focus:border-[#009183]" />
                <button onClick={submitRetouch} className="px-8 py-3 bg-[#009183] text-white font-black uppercase text-xs rounded-xl">Execute</button>
            </div>
        </div>
      )}

      {activeModal === 'video' && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center gap-6">
            <div className="bg-[#0f172a] rounded-3xl p-8 shadow-2xl border border-purple-500/30 w-[500px]">
                <div className="flex justify-between items-center mb-8"><h2 className="text-xl font-black text-white uppercase tracking-wider text-purple-400">🎬 Video Magic</h2><button onClick={() => setActiveModal('none')} className="text-slate-500 hover:text-white font-bold uppercase text-xs">Cancel</button></div>
                <div className="space-y-6">
                    <div><label className="text-[10px] font-bold text-purple-300 uppercase tracking-widest mb-3 block">Director's Prompt</label><textarea rows={3} value={videoPrompt} onChange={(e) => setVideoPrompt(e.target.value)} className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-4 text-white text-sm outline-none focus:border-purple-500 transition-colors resize-none" /></div>
                    <div className="text-xs text-slate-400 italic">Highly realistic 4-second cinematic camera movement.</div>
                    <button onClick={submitVideo} className="w-full py-4 mt-4 bg-purple-600 text-white font-black uppercase text-xs rounded-xl shadow-[0_0_20px_rgba(147,51,234,0.4)]">Action! 🎬</button>
                </div>
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
            <div className="relative w-[90vw] max-w-[1100px] aspect-[3/2] rounded-[1.5rem] bg-black overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.7)] border border-white/10 cursor-col-resize" onMouseMove={handleSlider} onClick={(e) => e.stopPropagation()}>
                <img id="modalAfter" src={compareData.edited} className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10" alt="After" />
                <img id="modalBefore" src={compareData.raw} className="absolute inset-0 w-full h-full object-cover pointer-events-none z-20" alt="Before" style={{ clipPath: 'inset(0 50% 0 0)' }} />
                <div id="modalHandle" className="absolute top-0 bottom-0 w-[2px] bg-white/50 z-30 -translate-x-1/2 pointer-events-none" style={{ left: '50%' }}><div className="absolute top-1/2 left-1/2 w-10 h-10 bg-[#009183] border-[3px] border-[#0B1120] rounded-full -translate-x-1/2 -translate-y-1/2 flex items-center justify-center text-white font-bold shadow-xl">↔</div></div>
            </div>
        </div>
      )}
    </div>
  );
}