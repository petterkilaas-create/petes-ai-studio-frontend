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

  // Nytt for Copywriter: Order ID og Address
  const [orderId, setOrderId] = useState("");
  const [orderAddress, setOrderAddress] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [tone, setTone] = useState("Eksklusiv");
  const [length, setLength] = useState("Fyldig");
  const [generatedCopy, setGeneratedCopy] = useState("");

  // Generer unik ID ved innlasting
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

  // HER MANGLER DEN I STAD:
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenMaskCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const pollTimer = useRef<NodeJS.Timeout | null>(null);
  const isDrawing = useRef(false);
  const bgImg = useRef<HTMLImageElement | null>(null);
  const undoStack = useRef<ImageData[]>([]);

  // --- FETCH ORDERS & REALTIME LISTENER ---
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

  // --- UPLOAD LOGIC ---
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

  // --- GENERATE COPY LOGIC ---
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

  // --- ACTIONS ---
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
          const res = await fetch(`${API}/list-finished/?job_name=${encodeURIComponent(name)}&t=${Date.now()}`, { cache: 'no-store' }); 
          const data = await res.json(); 
          setGalleryImages(data.images); 
      } catch (e) { console.error(e); } 
  };

  const pollProgress = async (pollingJobName: string) => {
    try {
        const r = await fetch(`${API}/batch-progress/?job_name=${encodeURIComponent(pollingJobName)}`, { cache: 'no-store' }); 
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

  const filteredOrders = archiveOrders.filter(order => 
      order.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (order.address && order.address.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex flex-col bg-[#0B1120] text-white min-h-screen font-sans">
      <div ref={cursorRef} style={{ display: activeModal === 'retouch' ? 'block' : 'none', width: brushSize, height: brushSize }} className="fixed border-2 border-[#ef4444]/80 rounded-full pointer-events-none z-[9999] -translate-x-1/2 -translate-y-1/2 bg-[#ef4444]/20 mix-blend-difference"></div>
      <canvas ref={hiddenMaskCanvasRef} style={{ display: 'none' }}></canvas>

      <main className="max-w-6xl mx-auto w-full p-8 flex-1">
        
        {/* --- CREATION VIEW (Hvis ingen ordre er valgt) --- */}
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
                              filteredOrders.filter(o => o.name.startsWith('CPY')).map(order => ( // Viser kun CPY-ordrer her
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
    </div>
  );
}