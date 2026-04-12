"use client";

import { useState, useRef, useEffect } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { supabase } from "../../supabaseClient"; 
import Autocomplete from "react-google-autocomplete";

const API = "https://petes-ai-studio-backend-v2-73jga2zlcq-lz.a.run.app";

type UploadedFile = { id: string; file: File; url: string; type: string; style: string; prompt: string; maskBlob: Blob | null; };
type StagingRoom = { id: string; style: string; hero_img_id: string | null; images: string[]; room_category?: string; target_audience?: string; styling_density?: string; season?: string; };
type GalleryImage = { name: string; url: string; type: 'image' | 'video'; raw?: string; edited?: string; approved?: boolean; };

const STATUS_MESSAGES = [
    "Analyzing Spatial Data...",
    "Understanding room geometry...",
    "Selecting furniture styles...",
    "Applying interior lighting...",
    "Adding finishing touches..."
];

export default function StagingPage() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const [orderId, setOrderId] = useState("");
  const [orderAddress, setOrderAddress] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [stagingRooms, setStagingRooms] = useState<StagingRoom[]>([]);
  const [roomCounter, setRoomCounter] = useState(0);

  useEffect(() => {
    setOrderId(`ORD-${Math.random().toString(16).slice(2, 8).toUpperCase()}`);
  }, []);

  const [isRendering, setIsRendering] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressStatus, setProgressStatus] = useState("Processing...");
  const [statusMsgIndex, setStatusMsgIndex] = useState(0);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);

  const [activeModal, setActiveModal] = useState<'none' | 'mask' | 'compare'>('none');
  const [currentCanvasImgId, setCurrentCanvasImgId] = useState("");
  const [brushSize, setBrushSize] = useState(50);
  const [activeTab, setActiveTab] = useState<'staging' | 'renovation' | 'staging_plus'>('staging');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenMaskCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const bgImg = useRef<HTMLImageElement | null>(null);

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
  // SIKKERHETSNETTET (Fallback Poller) + RADIO
  // ==========================================
  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`staging_progress_${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `name=eq.${orderId}` },
        (payload) => {
          if (!payload.new) return;
          const newStatus = (payload.new as any).status;
          if (newStatus === 'completed' || newStatus === 'finished') {
            triggerFinish();
          }
        }
      ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  useEffect(() => {
    let fallbackTimer: NodeJS.Timeout;
    if (isRendering && orderId) {
        fallbackTimer = setInterval(async () => {
            try {
                const { data } = await supabase.from('projects').select('status').eq('name', orderId).single();
                if (data && (data.status === 'completed' || data.status === 'finished')) {
                    triggerFinish();
                }
            } catch (e) { console.error("Poller error:", e); }
        }, 5000);
    }
    return () => { if (fallbackTimer) clearInterval(fallbackTimer); };
  }, [isRendering, orderId]);

  const triggerFinish = () => {
      setProgressPct(100);
      setProgressStatus("Staging Complete! Loading gallery...");
      setTimeout(() => {
          setIsRendering(false);
          loadGallery(orderId);
      }, 800);
  };

  const addRoom = () => {
    const newId = roomCounter + 1;
    setRoomCounter(newId);
    setStagingRooms(prev => [...prev, { 
        id: `room_${newId}`, 
        style: "staging_nordic_minimalist", 
        hero_img_id: null, 
        images: [],
        room_category: "Living Room",
        target_audience: "Families",
        styling_density: "Medium",
        season: "none"
    }]);
  };

  const updateRoomStyle = (roomId: string, newStyle: string) => {
    setStagingRooms(prev => prev.map(r => r.id === roomId ? { ...r, style: newStyle } : r));
  };

  const updateRoomMetadata = (roomId: string, field: keyof StagingRoom, value: string) => {
    setStagingRooms(prev => prev.map(r => r.id === roomId ? { ...r, [field]: value } : r));
  };

  const setHero = (roomId: string, imgId: string) => {
    setStagingRooms(prev => prev.map(r => r.id === roomId ? { ...r, hero_img_id: imgId } : r));
  };

  const handleDragStart = (e: React.DragEvent, id: string) => { e.dataTransfer.setData("text/plain", id); };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleStagingDrop = (e: React.DragEvent, targetRoomId: string) => {
    e.preventDefault();
    const imgId = e.dataTransfer.getData("text/plain");
    if (!imgId) return;

    setStagingRooms(prev => {
        let updated = prev.map(room => ({
            ...room,
            images: room.images.filter(id => id !== imgId),
            hero_img_id: room.hero_img_id === imgId ? (room.images.filter(id => id !== imgId)[0] || null) : room.hero_img_id
        }));

        if (targetRoomId !== 'unassigned') {
            updated = updated.map(room => {
                if (room.id === targetRoomId) {
                    return { ...room, images: [...room.images, imgId], hero_img_id: !room.hero_img_id ? imgId : room.hero_img_id };
                }
                return room;
            });
        }
        return updated;
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const newFiles: UploadedFile[] = [];
    for (let i = 0; i < e.target.files.length; i++) {
        newFiles.push({ id: "img_" + Math.random().toString(36).substr(2, 9), file: e.target.files[i], url: URL.createObjectURL(e.target.files[i]), type: "interior", style: "staging_scandi", prompt: "", maskBlob: null });
    }
    setUploadedFiles(prev => [...prev, ...newFiles]);
    if (stagingRooms.length === 0) addRoom();
  };

  const startStagingRender = async () => {
    if (!orderId) return;
    setIsRendering(true); 

    if (user) {
        await supabase.from('projects').insert([
            { name: orderId, address: orderAddress, status: 'processing', user_id: user.id }
        ]);
    }

    const fd = new FormData(); 
    fd.append('job_name', orderId);
    fd.append('address', orderAddress);
    if (user) fd.append('user_id', user.id);

    const cfg: any = {};
    stagingRooms.forEach(room => {
        room.images.forEach(imgId => {
            const f = uploadedFiles.find(x => x.id === imgId);
            if (f) { 
                fd.append('files', f.file); 
                if (f.maskBlob) fd.append('files', f.maskBlob, `MASK_${f.file.name}.png`); 
                cfg[f.file.name] = { 
                    room_id: room.id, 
                    is_hero: room.hero_img_id === imgId, 
                    style: room.style,
                    room_category: room.room_category || "Living Room",
                    target_audience: room.target_audience || "Families",
                    styling_density: room.styling_density || "Medium",
                    season: room.season || "none"
                }; 
            }
        });
    });
    fd.append('config', JSON.stringify(cfg));
    
    try { 
        const token = await getToken();
        await fetch(`${API}/start-staging-job/`, { 
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${token}` },
            body: fd 
        }); 
    } catch (error) { console.error(error); }
  };

  const loadGallery = async (name: string) => { 
      try { 
          const res = await fetch(`${API}/list-finished/?job_name=${encodeURIComponent(name)}&t=${Date.now()}`, { cache: 'no-store' }); 
          const data = await res.json(); 
          setGalleryImages(data.images); 
      } catch (e) { console.error(e); } 
  };

  const openCanvasStudio = (imgId: string) => {
    setCurrentCanvasImgId(imgId); setActiveModal('mask');
    const f = uploadedFiles.find(x => x.id === imgId);
    if (f) {
      const image = new Image(); image.crossOrigin = "Anonymous";
      image.onload = () => { bgImg.current = image; initCanvas(); };
      image.src = f.url;
    }
  };

  const initCanvas = () => {
    const canvas = canvasRef.current; const hidden = hiddenMaskCanvasRef.current;
    if (!canvas || !hidden || !bgImg.current) return;
    canvas.width = hidden.width = bgImg.current.width; canvas.height = hidden.height = bgImg.current.height;
    renderCanvas();
  };

  const renderCanvas = () => {
    const canvas = canvasRef.current; if (!canvas || !bgImg.current) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.drawImage(bgImg.current, 0, 0);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (cursorRef.current) { cursorRef.current.style.left = `${e.clientX}px`; cursorRef.current.style.top = `${e.clientY}px`; }
    if (isDrawing.current) drawOnCanvas(e);
  };

  const drawOnCanvas = (e: React.MouseEvent) => {
    const canvas = canvasRef.current; const hidden = hiddenMaskCanvasRef.current;
    if (!canvas || !hidden || !isDrawing.current) return;
    const ctx = canvas.getContext('2d'); const hCtx = hidden.getContext('2d');
    if (!ctx || !hCtx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    hCtx.lineWidth = brushSize; hCtx.lineCap = 'round'; hCtx.strokeStyle = 'white'; hCtx.lineTo(x, y); hCtx.stroke();
    ctx.lineWidth = brushSize; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(0, 255, 131, 0.4)'; ctx.lineTo(x, y); ctx.stroke();
  };

  const saveFloorMask = () => {
    const hidden = hiddenMaskCanvasRef.current; if (!hidden) return;
    hidden.toBlob((b) => {
        setUploadedFiles(prev => prev.map(f => f.id === currentCanvasImgId ? { ...f, maskBlob: b } : f));
        setActiveModal('none');
    }, 'image/png');
  };

  const assignedIds = stagingRooms.flatMap(r => r.images);
  const unassigned = uploadedFiles.filter(f => !assignedIds.includes(f.id));

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col font-sans">
      <div ref={cursorRef} style={{ display: activeModal === 'mask' ? 'block' : 'none', width: brushSize, height: brushSize }} className="fixed border-2 border-[#00ff83] rounded-full pointer-events-none z-[9999] -translate-x-1/2 -translate-y-1/2 bg-[#00ff83]/20"></div>
      <canvas ref={hiddenMaskCanvasRef} style={{ display: 'none' }}></canvas>

      <main className="flex-1 max-w-6xl mx-auto w-full p-8">
        <div className="mb-12 bg-[#0f172a] border border-slate-800 rounded-3xl p-8 shadow-xl flex justify-between items-start">
            <div className="flex-1">
                <h1 className="text-3xl font-black text-white uppercase tracking-widest mb-6">
                    {activeTab === 'staging' && '🛋️ Virtual Staging'}
                    {activeTab === 'renovation' && '🔨 Renovation'}
                    {activeTab === 'staging_plus' && '✨ Staging+'}
                </h1>
                <div className="flex gap-3 mb-4">
                    <button onClick={() => setActiveTab('staging')} className={`px-6 py-2 rounded-full font-black uppercase tracking-widest text-xs transition-all ${activeTab === 'staging' ? 'bg-[#009183] text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>🛋️ Staging</button>
                    <button onClick={() => setActiveTab('renovation')} className={`px-6 py-2 rounded-full font-black uppercase tracking-widest text-xs transition-all ${activeTab === 'renovation' ? 'bg-[#009183] text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>🔨 Renovation</button>
                    <button onClick={() => setActiveTab('staging_plus')} className={`px-6 py-2 rounded-full font-black uppercase tracking-widest text-xs transition-all ${activeTab === 'staging_plus' ? 'bg-[#009183] text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>✨ Staging+</button>
                </div>
                <p className="text-slate-400 max-w-2xl">Transform empty spaces into furnished, inviting homes. Group photos by room and set a &quot;Hero&quot; angle.</p>
            </div>
            <div className="text-right border border-white/10 px-4 py-2 rounded-xl bg-white/5">
                <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Order ID</p>
                <p className="text-lg text-white font-black">{orderId}</p>
            </div>
        </div>

        {activeTab === 'staging' && (
          <>
            {uploadedFiles.length === 0 && galleryImages.length === 0 && (
                <div className="glass p-16 border-2 border-dashed border-[#009183]/40 flex flex-col items-center gap-8 rounded-3xl bg-[#0f172a]/50 shadow-[0_0_30px_rgba(0,145,131,0.05)]">
                    <div className="w-full max-w-2xl mx-auto space-y-4">
                        <label className="text-[10px] font-bold text-[#009183] uppercase tracking-[0.2em] block text-center mb-6">
                            📍 Søk etter eiendommens adresse
                        </label>
                        <Autocomplete
                            apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
                            onPlaceSelected={(place) => { if (place && place.formatted_address) { setOrderAddress(place.formatted_address); } }}
                            options={{ types: ["address"], componentRestrictions: { country: "no" } }}
                            placeholder="START Å SKRIVE ADRESSE..."
                            className="w-full bg-transparent border-b-2 border-slate-700 text-2xl font-black text-white outline-none focus:border-[#009183] uppercase pb-4 transition-colors text-center placeholder:text-slate-600"
                        />
                        {orderAddress && (
                            <div className="mt-8 p-6 bg-[#0B1120] rounded-2xl border border-[#009183]/30 text-center animate-in fade-in duration-300">
                                <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-2">Prosjekt opprettet:</p>
                                <p className="text-xl text-[#00ff83] font-black uppercase tracking-wider">{orderAddress}</p>
                            </div>
                        )}
                    </div>
                    <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                    <button onClick={() => fileInputRef.current?.click()} className="px-12 py-4 bg-[#009183] hover:bg-[#00b09f] text-white rounded-full font-black uppercase tracking-widest text-xs shadow-[0_0_20px_rgba(0,145,131,0.4)] transition-all">Upload Images</button>
                </div>
            )}

            {uploadedFiles.length > 0 && !isRendering && galleryImages.length === 0 && (
                <div className="flex gap-8 animate-in fade-in duration-500">
                    {/* UNASSIGNED POOL */}
                    <div className="w-1/3 bg-[#0B1120] p-6 rounded-3xl border border-slate-800">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Unassigned Photos</h3>
                        <div className="flex flex-wrap gap-3 p-4 bg-[#0f172a] rounded-2xl min-h-[400px]" onDragOver={handleDragOver} onDrop={(e) => handleStagingDrop(e, 'unassigned')}>
                            {unassigned.map(f => (
                                <img key={f.id} src={f.url} draggable onDragStart={(e) => handleDragStart(e, f.id)} className="w-24 h-24 object-cover rounded-xl border border-white/5 cursor-grab" alt="Upload"/>
                            ))}
                        </div>
                    </div>

                    {/* ROOMS */}
                    <div className="flex-1 space-y-6">
                        <div className="flex justify-between items-center"><h3 className="text-xs font-black text-white uppercase tracking-widest">Room Layout</h3><button onClick={addRoom} className="px-4 py-2 border border-[#009183] text-[#009183] text-[10px] font-black uppercase rounded-xl hover:bg-[#009183]/10">Add Room</button></div>
                        {stagingRooms.map((room, i) => (
                            <div key={room.id} className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800" onDragOver={handleDragOver} onDrop={(e) => handleStagingDrop(e, room.id)}>
                                
                                {/* DET NYE KONTROLLPANELET STARTER HER */}
                                <div className="flex flex-col gap-3 mb-6 bg-[#0B1120] p-4 rounded-2xl border border-white/5">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ROOM {i+1} CONFIGURATION</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <select value={room.style} onChange={(e) => updateRoomMetadata(room.id, 'style', e.target.value)} className="bg-[#0f172a] text-[10px] font-bold uppercase p-3 rounded-xl border border-slate-700 outline-none focus:border-[#009183] text-white">
                                            <optgroup label="Interior Styles">
                                                <option value="staging_nordic_minimalist">Nordic Minimalist</option>
                                                <option value="staging_japandi">Japandi</option>
                                                <option value="staging_scandi_classic">Scandi Classic</option>
                                                <option value="staging_soft_industrial">Soft Industrial</option>
                                                <option value="staging_cozy_rustic_hygge">Cozy Rustic (Hygge)</option>
                                            </optgroup>
                                            <optgroup label="Exterior Styles">
                                                <option value="staging_nordic_modern_steel">Modern Steel (Outdoor)</option>
                                                <option value="staging_coastal_teak_luxury">Coastal Teak (Outdoor)</option>
                                                <option value="staging_urban_balcony_bistro">Urban Balcony (Outdoor)</option>
                                                <option value="staging_social_lounge_resort">Resort Lounge (Outdoor)</option>
                                                <option value="staging_winter_terrace_hygge">Winter Terrace (Outdoor)</option>
                                            </optgroup>
                                        </select>
                                        <select value={room.room_category} onChange={(e) => updateRoomMetadata(room.id, 'room_category', e.target.value)} className="bg-[#0f172a] text-[10px] font-bold uppercase p-3 rounded-xl border border-slate-700 outline-none focus:border-[#009183] text-white">
                                            <option value="Living Room">Living Room</option>
                                            <option value="Kitchen">Kitchen</option>
                                            <option value="Bedroom">Bedroom</option>
                                            <option value="Bathroom">Bathroom</option>
                                            <option value="Office">Office</option>
                                            <option value="Outdoor Patio">Outdoor Patio</option>
                                            <option value="Balcony">Balcony</option>
                                        </select>
                                        <select value={room.target_audience} onChange={(e) => updateRoomMetadata(room.id, 'target_audience', e.target.value)} className="bg-[#0f172a] text-[10px] font-bold uppercase p-3 rounded-xl border border-slate-700 outline-none focus:border-[#009183] text-white">
                                            <option value="Families">Families</option>
                                            <option value="Young Professionals">Young Professionals</option>
                                            <option value="High-Net-Worth Individuals">High-Net-Worth Individuals</option>
                                            <option value="Tech-Savvy Renters">Tech-Savvy Renters</option>
                                        </select>
                                        <select value={room.styling_density} onChange={(e) => updateRoomMetadata(room.id, 'styling_density', e.target.value)} className="bg-[#0f172a] text-[10px] font-bold uppercase p-3 rounded-xl border border-slate-700 outline-none focus:border-[#009183] text-white">
                                            <option value="Medium">Medium Density</option>
                                            <option value="Low (Minimalist)">Low (Minimalist)</option>
                                            <option value="High (Hygge)">High (Lived-in)</option>
                                        </select>
                                        <select value={room.season} onChange={(e) => updateRoomMetadata(room.id, 'season', e.target.value)} className="bg-[#0f172a] text-[10px] font-bold uppercase p-3 rounded-xl border border-slate-700 outline-none focus:border-[#009183] text-white col-span-2">
                                            <option value="none">Default Lighting</option>
                                            <option value="summer">Summer Light</option>
                                            <option value="spring">Spring Light</option>
                                            <option value="autumn_winter">Autumn/Winter Light</option>
                                        </select>
                                    </div>
                                </div>
                                {/* DET NYE KONTROLLPANELET SLUTTER HER */}

                                <div className="flex flex-wrap gap-4 min-h-[120px]">
                                    {room.images.map(imgId => {
                                        const f = uploadedFiles.find(x => x.id === imgId);
                                        if(!f) return null;
                                        const isHero = room.hero_img_id === imgId;
                                        return (
                                            <div key={f.id} className="relative w-28 h-28 group">
                                                <img src={f.url} className={`w-full h-full object-cover rounded-xl border-2 ${isHero ? 'border-[#00ff83]' : 'border-transparent'}`} alt="Room img" />
                                                <div onClick={() => openCanvasStudio(f.id)} className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-xl cursor-pointer text-[10px] text-white font-black uppercase text-center leading-tight px-2">🖌️ Mask Floor</div>
                                                <div onClick={() => setHero(room.id, f.id)} className={`absolute -top-2 -left-2 text-xl cursor-pointer ${isHero ? '' : 'grayscale'}`}>⭐</div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                        <div className="flex justify-end pt-6"><button onClick={startStagingRender} className="px-12 py-4 bg-gradient-to-r from-[#009183] to-[#00b09f] text-white font-black uppercase text-xs rounded-full shadow-[0_0_30px_rgba(0,145,131,0.4)] hover:scale-105 transition-transform">Generate Rooms</button></div>
                    </div>
                </div>
            )}
          </>
        )}

        {activeTab === 'renovation' && <div className="glass p-16 border-2 border-dashed border-slate-700 flex flex-col items-center justify-center rounded-3xl bg-[#0f172a]/50 mt-8 min-h-[400px]"><div className="text-6xl mb-4">🔨</div><h2 className="text-white font-black text-xl uppercase tracking-widest">Renovation Studio</h2><p className="text-slate-400 mt-2">Coming soon: Remove items and completely renovate spaces.</p></div>}

        {activeTab === 'staging_plus' && <div className="glass p-16 border-2 border-dashed border-slate-700 flex flex-col items-center justify-center rounded-3xl bg-[#0f172a]/50 mt-8 min-h-[400px]"><div className="text-6xl mb-4">✨</div><h2 className="text-white font-black text-xl uppercase tracking-widest">Staging+</h2><p className="text-slate-400 mt-2">Coming soon: Style multiple rooms with a persistent style seed.</p></div>}

        {/* --- RENDERING SPINNER --- */}
        {isRendering && activeModal === 'none' && (
          <div className="glass p-16 text-center space-y-8 animate-in fade-in duration-500 rounded-3xl bg-[#0f172a]/50 border border-[#009183]/30 shadow-2xl mt-10">
              <div className="text-6xl animate-bounce mb-4">🛋️</div>
              <p className="font-black uppercase tracking-[0.3em] text-sm text-[#009183] transition-all">{progressStatus}</p>
              <div className="w-full max-w-2xl mx-auto bg-[#0B1120] h-4 rounded-full overflow-hidden p-1 border border-white/10">
                <div className="bg-gradient-to-r from-[#009183] to-[#00b09f] h-full rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(0,145,131,0.8)]" style={{ width: `${progressPct}%` }}></div>
              </div>
          </div>
        )}

        {galleryImages.length > 0 && !isRendering && (
            <div className="animate-in fade-in slide-in-from-bottom-10 duration-500 mt-10">
                <div className="flex justify-between items-end border-b border-white/10 pb-6 mb-10">
                    <div>
                        <p className="text-[#009183] font-bold text-sm tracking-widest">{orderId}</p>
                        <h3 className="text-3xl font-black text-white uppercase">{orderAddress || "Unnamed Project"}</h3>
                    </div>
                    <button onClick={() => window.location.href = `${API}/download-zip/${encodeURIComponent(orderId)}`} className="px-6 py-3 bg-white text-[#0B1120] rounded-full font-black uppercase tracking-widest text-[10px] hover:bg-[#009183] hover:text-white transition-all shadow-lg">Download ZIP</button>
                </div>
                <div className="grid grid-cols-2 gap-10 pb-20">
                    {galleryImages.map(item => (
                        <div key={item.name} className="bg-[#0f172a] p-4 rounded-[2rem] border border-white/5">
                            <img src={item.url} className="w-full aspect-[3/2] object-cover rounded-[1.5rem] mb-4" alt="Result"/>
                            <div className="flex justify-between items-center px-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{item.name}</span>
                                <button onClick={() => window.open(item.url)} className="px-4 py-2 bg-slate-800 text-white rounded-full text-[9px] font-black uppercase">Download</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
      </main>

      {/* MASK MODAL */}
      {activeModal === 'mask' && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center gap-6">
            <h2 className="text-xl font-black text-white uppercase tracking-widest">Paint Staging Area (Floors)</h2>
            <div className="relative w-[80vw] max-w-[1000px] aspect-[3/2] bg-black rounded-3xl overflow-hidden border border-white/10" onMouseMove={handleCanvasMouseMove} onMouseDown={() => isDrawing.current = true} onMouseUp={() => { isDrawing.current = false; if(canvasRef.current) { const ctx = canvasRef.current.getContext('2d'); if(ctx) ctx.beginPath(); } if(hiddenMaskCanvasRef.current) { const hCtx = hiddenMaskCanvasRef.current.getContext('2d'); if(hCtx) hCtx.beginPath(); } }}>
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-10 cursor-none"></canvas>
            </div>
            <div className="flex gap-4 items-center bg-[#0f172a] p-4 rounded-2xl border border-white/10">
                <input type="range" min="10" max="200" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="accent-[#009183]" />
                <button onClick={() => setActiveModal('none')} className="px-6 py-2 text-slate-400 font-bold uppercase text-xs hover:text-white">Cancel</button>
                <button onClick={saveFloorMask} className="px-8 py-2 bg-[#009183] text-white font-black uppercase text-xs rounded-xl hover:bg-[#00b09f]">Save Mask</button>
            </div>
        </div>
      )}
    </div>
  );
}