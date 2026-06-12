"use client";

import { useState, useEffect, useRef } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { supabase } from "../../supabaseClient"; 

import { API_BASE } from "../lib/api";

type OrderArchive = { name: string; address?: string; date: string; status: string; };
type GalleryImage = { name: string; url: string; type: 'image' | 'video'; raw?: string; edited?: string; approved?: boolean; };

export default function OrdersPage() {
  const { user } = useUser();
  const { getToken } = useAuth(); // VIP Passet hentes inn!
  const isAdmin = user?.primaryEmailAddress?.emailAddress === "petter.kilaas@diakrit.com"; 
  const [viewMode, setViewMode] = useState<'mine' | 'all'>('mine');

  const [archiveOrders, setArchiveOrders] = useState<OrderArchive[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [generatedCopy, setGeneratedCopy] = useState<string>(""); 
  const [isLoadingGallery, setIsLoadingGallery] = useState(false);

  const [isRendering, setIsRendering] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressStatus, setProgressStatus] = useState("Venter på systemet..."); // Live tekst

  const [activeModal, setActiveModal] = useState<'none' | 'compare' | 'retouch' | 'rerender' | 'video'>('none');
  const [currentCanvasImgId, setCurrentCanvasImgId] = useState("");
  const [compareData, setCompareData] = useState({ raw: "", edited: "" });
  
  const [brushSize, setBrushSize] = useState(50);
  const [retouchPrompt, setRetouchPrompt] = useState("");
  const [saveAsNew, setSaveAsNew] = useState(true);
  const [rerenderData, setRerenderData] = useState({ type: "exterior", style: "dusk_blue_hour", prompt: "" });
  const [videoPrompt, setVideoPrompt] = useState("Cinematic slow pan, highly detailed architectural video, 8k resolution");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenMaskCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const bgImg = useRef<HTMLImageElement | null>(null);
  const undoStack = useRef<ImageData[]>([]);

  // --- FETCH ORDERS ---
  const fetchMyProjects = async () => {
      if (!user) return;
      let query = supabase.from('projects').select('name, address, created_at, status').order('created_at', { ascending: false });
      if (viewMode === 'mine') query = query.eq('user_id', user.id);

      const { data, error } = await query;
      if (!error && data) {
        setArchiveOrders(data.map(p => ({ 
          name: p.name, address: p.address, date: new Date(p.created_at).toLocaleDateString('no-NO'), status: p.status || 'processing' 
        })));
      }
  };

  useEffect(() => {
    fetchMyProjects();
  }, [user, viewMode]);

  // --- VIEW ORDER ---
  const viewOrder = async (name: string) => { 
      setSelectedOrder(name); 
      setIsLoadingGallery(true); 
      setGalleryImages([]);
      setGeneratedCopy(""); 
      
      const { data } = await supabase.from('projects').select('generated_copy, status').eq('name', name).single();
      if (data) {
          if (data.generated_copy) setGeneratedCopy(data.generated_copy);
          if (data.status === 'processing') {
              setIsRendering(true);
          }
      }

      await loadGallery(name);
      setIsLoadingGallery(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadGallery = async (name: string) => { 
      try { 
          const res = await fetch(`${API_BASE}/list-finished/?job_name=${encodeURIComponent(name)}&t=${Date.now()}`, { cache: 'no-store' }); 
          const data = await res.json(); 
          setGalleryImages(data.images || []); 
      } catch (e) { console.error(e); } 
  };

  // ==========================================
  // PROGRESS BAR & POLLING FOR VERKTØYENE
  // ==========================================
  useEffect(() => {
    let pctInterval: NodeJS.Timeout;

    if (isRendering) {
        setProgressPct(0);
        pctInterval = setInterval(() => {
            setProgressPct(prev => {
                const step = Math.max(0.1, (95 - prev) * 0.05);
                return prev >= 95 ? 95 : prev + step;
            });
        }, 300);
    }
    return () => clearInterval(pctInterval);
  }, [isRendering]);

  useEffect(() => {
    if (!isRendering || !selectedOrder) return;

    const interval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('projects')
          .select('status, progress_message')
          .eq('name', selectedOrder)
          .single();

        if (data) {
          if (data.progress_message) setProgressStatus(data.progress_message);
          
          if (data.status === 'completed' || data.status === 'finished') {
            clearInterval(interval);
            setProgressPct(100);
            setProgressStatus("Oppdatering ferdig! Laster inn på nytt...");
            setTimeout(() => {
                setIsRendering(false);
                loadGallery(selectedOrder);
                fetchMyProjects(); // Oppdater liste-status
            }, 800);
          }
        }
      } catch (err) { console.error("Polling feil:", err); }
    }, 2000);

    return () => clearInterval(interval);
  }, [isRendering, selectedOrder]);


  // --- MANAGE ORDERS ---
  const deleteOrder = async (e: React.MouseEvent, orderName: string) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to permanently delete this project?`)) return;
    setArchiveOrders(prev => prev.filter(o => o.name !== orderName));
    if (selectedOrder === orderName) setSelectedOrder(null);
    if (user) await supabase.from('projects').delete().eq('name', orderName);
    
    try {
        const token = await getToken();
        const fd = new FormData(); fd.append('job_name', orderName); fd.append('image_name', ''); 
        fetch(`${API_BASE}/delete-image/`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd }).catch(console.error);
    } catch(e) {}
  };

  const renameOrder = async (e: React.MouseEvent, oldName: string) => {
    e.stopPropagation();
    const newNameRaw = window.prompt("Enter new project ID:", oldName);
    if (!newNameRaw || newNameRaw === oldName) return;
    const newName = newNameRaw.replace(/ /g, "_");
    setArchiveOrders(prev => prev.map(o => o.name === oldName ? { ...o, name: newName } : o));
    if (selectedOrder === oldName) setSelectedOrder(newName);
    if (user) await supabase.from('projects').update({ name: newName }).eq('name', oldName);
    // Backend kall (krever muligens ikke token avhengig av backend-oppsett, men greit å ha)
    const fd = new FormData(); fd.append('old_name', oldName); fd.append('new_name', newName);
    fetch(`${API_BASE}/rename-order/`, { method: 'POST', body: fd }).catch(console.error);
  };

  // --- VERKTØYKASSE MED CLERK AUTH ---
  const deleteSingleImage = async (imgName: string) => {
      if (!selectedOrder) return;
      if (!window.confirm("Are you sure you want to permanently delete this image?")) return;
      
      try {
          const token = await getToken();
          const fd = new FormData(); fd.append('job_name', selectedOrder); fd.append('image_name', imgName);
          await fetch(`${API_BASE}/delete-image/`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
          setGalleryImages(prev => prev.filter(img => img.name !== imgName));
      } catch (e) { console.error(e); }
  };

  const approveImage = async (imgName: string) => { 
      if(!selectedOrder) return;
      try {
          const token = await getToken();
          const fd = new FormData(); fd.append('job_name', selectedOrder); fd.append('image_name', imgName); 
          await fetch(`${API_BASE}/approve-image/`, { method:'POST', headers: { 'Authorization': `Bearer ${token}` }, body:fd }); 
          loadGallery(selectedOrder); 
      } catch(e) { console.error(e); }
  };

  const submitRetouch = async () => {
      if(!retouchPrompt || !selectedOrder) return;
      setActiveModal('none'); 
      if (user) await supabase.from('projects').update({ status: 'processing', progress_message: 'Klargjør Retouch...' }).eq('name', selectedOrder);
      setIsRendering(true);
      
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
          try { 
              const token = await getToken();
              await fetch(`${API_BASE}/execute-retouch/`, { method:'POST', headers: { 'Authorization': `Bearer ${token}` }, body:fd }); 
          } catch(e) { console.error(e); setIsRendering(false); }
      }, 'image/png');
  };

  const submitRerender = async () => {
      if(!selectedOrder) return;
      setActiveModal('none');
      if (user) await supabase.from('projects').update({ status: 'processing', progress_message: 'Klargjør Re-render...' }).eq('name', selectedOrder);
      setIsRendering(true);
      
      const fd = new FormData(); fd.append('job_name', selectedOrder); fd.append('image_name', currentCanvasImgId); fd.append('image_type', rerenderData.type); fd.append('style', rerenderData.style); fd.append('prompt', rerenderData.prompt);
      try { 
          const token = await getToken();
          await fetch(`${API_BASE}/re-render-single/`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd }); 
      } catch(e) { console.error(e); setIsRendering(false); }
  };

  const submitVideo = async () => {
      if(!selectedOrder) return;
      setActiveModal('none');
      if (user) await supabase.from('projects').update({ status: 'processing', progress_message: 'Sender til Veo AI...' }).eq('name', selectedOrder);
      setIsRendering(true); 
      
      const fd = new FormData(); fd.append('job_name', selectedOrder); fd.append('image_name', currentCanvasImgId); fd.append('prompt', videoPrompt);
      try { 
          const token = await getToken();
          await fetch(`${API_BASE}/generate-video/`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd }); 
      } catch(e) { console.error(e); setIsRendering(false); }
  };

  // --- CANVAS HELPERE ---
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

  const handleDownloadSingle = async (url: string, filename: string) => {
      try {
          const response = await fetch(url); const blob = await response.blob(); const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a'); link.href = blobUrl; link.download = filename || 'file';
          document.body.appendChild(link); link.click(); document.body.removeChild(link); setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      } catch (error) { window.open(url, '_blank'); }
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
        {!selectedOrder ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-white uppercase tracking-widest mb-2">My Orders</h1>
                        <p className="text-slate-400 text-sm">View, manage, and retouch your processed projects.</p>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        {isAdmin && (
                            <div className="flex bg-[#0f172a] rounded-xl p-1 border border-slate-700 shadow-lg">
                                <button onClick={() => setViewMode('mine')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${viewMode === 'mine' ? 'bg-[#009183] text-white' : 'text-slate-500 hover:text-white'}`}>My Orders</button>
                                <button onClick={() => setViewMode('all')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${viewMode === 'all' ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-white'}`}>All Users</button>
                            </div>
                        )}
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
                                filteredOrders.map(order => (
                                    <tr key={order.name} onClick={() => viewOrder(order.name)} className="border-b border-slate-800/50 hover:bg-[#1e293b]/50 cursor-pointer transition-colors group">
                                        <td className="p-5 font-bold text-white flex flex-col justify-center">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl group-hover:scale-110 transition-transform">{order.name.includes('FILM') || order.name.includes('video') ? '🎬' : order.name.includes('STAGING') ? '🛋️' : order.name.includes('CPY') ? '✍️' : '⚡'}</span>
                                                <span>{order.name}</span>
                                            </div>
                                            {order.address && <span className="text-[10px] text-slate-400 mt-1 ml-9 uppercase tracking-widest font-normal">{order.address}</span>}
                                        </td>
                                        <td className="p-5 text-slate-400 text-sm">{order.date}</td>
                                        <td className="p-5">{order.status === 'completed' || order.status === 'finished' ? (<span className="bg-green-900/30 text-green-400 border border-green-500/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Completed</span>) : (<span className="bg-yellow-900/30 text-yellow-400 border border-yellow-500/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse">Processing</span>)}</td>
                                        <td className="p-5 text-right flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={(e) => renameOrder(e, order.name)} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 text-slate-300 transition-colors" title="Rename">✏️</button>
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
            <div className="animate-in fade-in duration-500 pb-20">
                <div className="flex justify-between items-end border-b border-white/10 pb-6 mb-10">
                    <div>
                        <button onClick={() => { setSelectedOrder(null); setGeneratedCopy(""); setIsRendering(false); }} className="text-[#009183] hover:text-white text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2 transition-colors"><span>←</span> Back to List</button>
                        <p className="text-[#009183] font-bold text-sm tracking-widest mb-1">{selectedOrder}</p>
                        <h3 className="text-3xl font-black text-white uppercase">{archiveOrders.find(o => o.name === selectedOrder)?.address || "Project Gallery"}</h3>
                    </div>
                    {galleryImages.length > 0 && (
                        <button onClick={() => window.location.href = `${API_BASE}/download-zip/${encodeURIComponent(selectedOrder)}`} className="px-6 py-3 bg-white text-[#0B1120] rounded-full font-black uppercase tracking-widest text-[10px] hover:bg-[#009183] hover:text-white transition-all shadow-lg">Download ZIP</button>
                    )}
                </div>

                {/* --- RENDERING LOADER --- */}
                {isRendering && activeModal === 'none' && (
                  <div className="glass p-16 text-center space-y-8 animate-in fade-in duration-500 mb-8 rounded-3xl bg-[#0f172a]/50 border border-[#009183]/30 shadow-2xl">
                      <p className="font-black uppercase tracking-[0.3em] text-sm text-[#009183] transition-all">{progressStatus}</p>
                      <div className="w-full max-w-2xl mx-auto bg-[#0B1120] h-4 rounded-full overflow-hidden p-1 border border-white/10">
                        <div className="bg-gradient-to-r from-[#009183] to-[#00b09f] h-full rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(0,145,131,0.8)]" style={{ width: `${progressPct}%` }}></div>
                      </div>
                  </div>
                )}

                {generatedCopy && !isRendering && (
                    <div className="bg-[#0f172a] rounded-3xl p-10 border border-[#009183]/30 shadow-2xl relative mb-10">
                        <button onClick={() => navigator.clipboard.writeText(generatedCopy)} className="absolute top-8 right-8 px-6 py-3 bg-[#009183] hover:bg-[#00b09f] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-lg">
                            Kopier Tekst
                        </button>
                        <h4 className="text-xs font-black text-[#009183] uppercase tracking-widest mb-6">Generert Prospekt</h4>
                        <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed whitespace-pre-wrap text-lg">
                            {generatedCopy}
                        </div>
                    </div>
                )}

                {isLoadingGallery ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-8 h-8 border-4 border-[#009183]/30 border-t-[#009183] rounded-full animate-spin"></div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Loading Media...</p>
                    </div>
                ) : galleryImages.length === 0 && !generatedCopy && !isRendering ? (
                    <div className="text-center py-20 text-slate-500">No images or text found for this project.</div>
                ) : galleryImages.length > 0 && !isRendering ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        {galleryImages.map((item) => (
                            <div key={item.name} className="group flex flex-col bg-[#0f172a] rounded-[2rem] p-4 border border-white/5 shadow-xl">
                                <div className="relative aspect-[3/2] rounded-[1.5rem] overflow-hidden bg-black mb-4 cursor-pointer" onClick={() => { if(item.type !== 'video') { setCompareData({raw: item.raw || item.url, edited: item.url}); setActiveModal('compare'); }}}>
                                    <button onClick={(e) => { e.stopPropagation(); deleteSingleImage(item.name); }} className="absolute top-4 right-4 bg-red-950/80 text-red-400 hover:text-white rounded-full w-8 h-8 flex items-center justify-center text-xs font-black z-30 opacity-0 group-hover:opacity-100 transition-all shadow-lg border border-red-900/50">🗑️</button>
                                    {item.type === 'video' ? (
                                        <>
                                            <video src={item.url} autoPlay loop muted playsInline controls className="absolute inset-0 w-full h-full object-cover z-10" />
                                            <div className="absolute top-4 left-4 bg-purple-600 text-white text-[9px] font-black px-3 py-1.5 rounded-full shadow-lg z-30 uppercase tracking-widest pointer-events-none">🎬 Cinematic Video</div>
                                        </>
                                    ) : (
                                        <>
                                            <img src={item.url} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" alt="Result" />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center z-20 pointer-events-none"><span className="opacity-0 group-hover:opacity-100 text-white font-bold bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm transition-opacity">Click to Compare</span></div>
                                        </>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                    {item.type === 'image' && (
                                        <>
                                            {item.approved ? (
                                                <span className="px-4 py-1.5 bg-[#009183]/10 text-[#00ff83] border border-[#009183]/30 text-[9px] font-bold uppercase tracking-widest rounded-full">✅ Approved</span>
                                            ) : (
                                                <button onClick={() => approveImage(item.name)} className="px-4 py-1.5 bg-[#009183] text-white text-[9px] font-bold uppercase tracking-widest rounded-full hover:bg-[#00b09f] shadow-[0_0_10px_rgba(0,145,131,0.2)] transition-all">Approve</button>
                                            )}
                                            {!item.approved && (
                                                <button onClick={() => openCanvasStudio(item.name, item.url)} className="px-4 py-1.5 bg-transparent border border-slate-700 text-slate-300 text-[9px] font-bold uppercase tracking-widest rounded-full hover:bg-slate-800 hover:text-white transition-colors">✏️ Retouch</button>
                                            )}
                                            <button onClick={() => { setCurrentCanvasImgId(item.name); setActiveModal('rerender'); }} className="px-4 py-1.5 bg-transparent border border-slate-700 text-slate-300 text-[9px] font-bold uppercase tracking-widest rounded-full hover:bg-slate-800 hover:text-white transition-colors">🔄 Re-Render</button>
                                        </>
                                    )}
                                    <button onClick={() => handleDownloadSingle(item.url, item.name)} className="px-4 py-1.5 bg-transparent border border-slate-700 text-slate-300 text-[9px] font-bold uppercase tracking-widest rounded-full hover:bg-slate-800 hover:text-white transition-colors ml-auto">⬇️ Download</button>
                                </div>
                                {item.type === 'image' && (
                                    <div className="mt-auto">
                                        <button onClick={() => { setCurrentCanvasImgId(item.name); setActiveModal('video'); }} className="w-full py-2 bg-gradient-to-r from-purple-900/10 to-transparent border border-purple-500/20 text-purple-400 text-[9px] font-bold uppercase tracking-widest rounded-xl hover:bg-purple-900/20 hover:border-purple-500/40 transition-all flex items-center justify-center gap-2">🎬 Animate with Veo AI</button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : null}
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