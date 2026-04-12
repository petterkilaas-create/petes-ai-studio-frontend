"use client";

import { useState, useEffect, useRef } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { supabase } from "../../supabaseClient"; 
import Autocomplete from "react-google-autocomplete";

const API = "https://petes-ai-studio-backend-v2-73jga2zlcq-lz.a.run.app";

type UploadedFile = { 
    id: string; 
    file: File; 
    url: string; 
    style: string; 
    room_category: string; 
    target_audience: string; 
    styling_density: string; 
    season: string; 
};

type GalleryImage = { name: string; url: string; type: 'image' | 'video'; };

const STATUS_MESSAGES = [
    "Analyzing spatial layout...",
    "Understanding room geometry...",
    "Selecting Nordic furniture...",
    "Calculating realistic light & shadows...",
    "Adding finishing touches..."
];

export default function StagingPage() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const [orderId, setOrderId] = useState("");
  const [orderAddress, setOrderAddress] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [activeTab, setActiveTab] = useState<'staging' | 'renovation' | 'staging_plus'>('staging');

  const [isRendering, setIsRendering] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressStatus, setProgressStatus] = useState("Processing...");
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOrderId(`ORD-${Math.random().toString(16).slice(2, 8).toUpperCase()}`);
  }, []);

  // Fake Progress Bar
  useEffect(() => {
    let pctInterval: NodeJS.Timeout;
    let msgInterval: NodeJS.Timeout;

    if (isRendering) {
        setProgressPct(0);
        setProgressStatus(STATUS_MESSAGES[0]);

        pctInterval = setInterval(() => {
            setProgressPct(prev => {
                const step = Math.max(0.1, (95 - prev) * 0.05);
                return prev >= 95 ? 95 : prev + step;
            });
        }, 300);

        msgInterval = setInterval(() => {
            setProgressStatus(prev => {
                const nextIdx = (STATUS_MESSAGES.indexOf(prev) + 1) % STATUS_MESSAGES.length;
                return STATUS_MESSAGES[nextIdx];
            });
        }, 4000);
    }
    return () => { clearInterval(pctInterval); clearInterval(msgInterval); };
  }, [isRendering]);

  // Database Polling
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase.channel(`staging_progress_${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `name=eq.${orderId}` },
        (payload) => {
          if ((payload.new as any).status === 'completed' || (payload.new as any).status === 'finished') {
            triggerFinish();
          }
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  const triggerFinish = () => {
      setProgressPct(100);
      setProgressStatus("Staging Complete! Loading gallery...");
      setTimeout(() => { setIsRendering(false); loadGallery(orderId); }, 800);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const newFiles: UploadedFile[] = Array.from(e.target.files).map(file => ({
        id: "img_" + Math.random().toString(36).substr(2, 9),
        file,
        url: URL.createObjectURL(file),
        style: "staging_nordic_minimalist",
        room_category: "Living Room",
        target_audience: "Families",
        styling_density: "Medium",
        season: "none"
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id: string) => {
      setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  const updateFileConfig = (id: string, field: keyof UploadedFile, value: string) => {
      setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
  };

  const startStagingRender = async () => {
    if (!orderId || uploadedFiles.length === 0) return;
    setIsRendering(true); 

    if (user) {
    await supabase.from('projects').upsert(
        { name: orderId, address: orderAddress, status: 'processing', user_id: user.id },
        { onConflict: 'name' }
    );
}

    const fd = new FormData(); 
    fd.append('job_name', orderId);
    fd.append('address', orderAddress);
    if (user) fd.append('user_id', user.id);

    const cfg: any = {};
    uploadedFiles.forEach(f => {
        fd.append('files', f.file); 
        cfg[f.file.name] = { 
            style: f.style,
            room_category: f.room_category,
            target_audience: f.target_audience,
            styling_density: f.styling_density,
            season: f.season
        }; 
    });
    fd.append('config', JSON.stringify(cfg));
    
    try { 
        const token = await getToken();
        await fetch(`${API}/start-staging-job/`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd }); 
    } catch (error) { console.error(error); }
  };

  const loadGallery = async (name: string) => { 
      try { 
          const res = await fetch(`${API}/list-finished/?job_name=${encodeURIComponent(name)}&t=${Date.now()}`, { cache: 'no-store' }); 
          const data = await res.json(); 
          setGalleryImages(data.images); 
      } catch (e) { console.error(e); } 
  };

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col font-sans">
      <main className="flex-1 max-w-5xl mx-auto w-full p-8">
        
        {/* HEADER */}
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
                <p className="text-slate-400 max-w-2xl">Fast and easy virtual staging. Upload images and set the style per photo.</p>
            </div>
            <div className="text-right border border-white/10 px-4 py-2 rounded-xl bg-white/5">
                <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Order ID</p>
                <p className="text-lg text-white font-black">{orderId}</p>
            </div>
        </div>

        {/* STAGING TAB */}
        {activeTab === 'staging' && (
          <>
            {/* UPLOAD & ADDRESS SECTION (Only shows if no files are uploaded) */}
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
                    </div>
                    <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                    <button onClick={() => fileInputRef.current?.click()} className="px-12 py-4 bg-[#009183] hover:bg-[#00b09f] text-white rounded-full font-black uppercase tracking-widest text-xs shadow-[0_0_20px_rgba(0,145,131,0.4)] transition-all">Select Images</button>
                </div>
            )}

            {/* PER-IMAGE CONFIGURATION LIST */}
            {uploadedFiles.length > 0 && !isRendering && galleryImages.length === 0 && (
                <div className="space-y-6 animate-in fade-in duration-500">
                    <div className="flex justify-between items-end border-b border-slate-800 pb-4">
                        <h3 className="text-xs font-black text-white uppercase tracking-widest">Configure Images</h3>
                        <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-bold text-[#009183] uppercase hover:text-white transition-colors">+ Add more images</button>
                    </div>
                    
                    <div className="space-y-4">
                        {uploadedFiles.map((file, index) => (
                            <div key={file.id} className="bg-[#0f172a] p-5 rounded-3xl border border-slate-800 flex gap-6 items-center shadow-lg transition-all hover:border-slate-600">
                                {/* Image Thumbnail */}
                                <div className="relative w-48 h-32 shrink-0 group">
                                    <img src={file.url} className="w-full h-full object-cover rounded-2xl border border-white/10" alt="Upload" />
                                    <button onClick={() => removeFile(file.id)} className="absolute -top-3 -right-3 bg-red-500/80 hover:bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-xs font-black shadow-lg transition-transform hover:scale-110">X</button>
                                </div>
                                
                                {/* Dropdown Grid med Labels */}
<div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-5">
    
    {/* Style Selection */}
    <div className="flex flex-col gap-1.5">
        <label className="text-[9px] font-black text-[#009183] uppercase tracking-widest pl-1">🎨 Design Style</label>
        <select value={file.style} onChange={(e) => updateFileConfig(file.id, 'style', e.target.value)} className="bg-[#0B1120] text-[10px] font-bold uppercase p-3 rounded-xl border border-slate-700 outline-none focus:border-[#009183] text-white shadow-inner">
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
    </div>

    {/* Room Category */}
    <div className="flex flex-col gap-1.5">
        <label className="text-[9px] font-black text-[#009183] uppercase tracking-widest pl-1">🛋️ Room Type</label>
        <select value={file.room_category} onChange={(e) => updateFileConfig(file.id, 'room_category', e.target.value)} className="bg-[#0B1120] text-[10px] font-bold uppercase p-3 rounded-xl border border-slate-700 outline-none focus:border-[#009183] text-white shadow-inner">
            <option value="Living Room">Living Room</option>
            <option value="Kitchen">Kitchen</option>
            <option value="Bedroom">Bedroom</option>
            <option value="Bathroom">Bathroom</option>
            <option value="Office">Office</option>
            <option value="Outdoor Patio">Outdoor Patio</option>
            <option value="Balcony">Balcony</option>
        </select>
    </div>

    {/* Target Audience */}
    <div className="flex flex-col gap-1.5">
        <label className="text-[9px] font-black text-[#009183] uppercase tracking-widest pl-1">👨‍👩‍👧‍👦 Target Audience</label>
        <select value={file.target_audience} onChange={(e) => updateFileConfig(file.id, 'target_audience', e.target.value)} className="bg-[#0B1120] text-[10px] font-bold uppercase p-3 rounded-xl border border-slate-700 outline-none focus:border-[#009183] text-white shadow-inner">
            <option value="Families">Families</option>
            <option value="Young Professionals">Young Professionals</option>
            <option value="High-Net-Worth Individuals">High-Net-Worth Individuals</option>
            <option value="Tech-Savvy Renters">Tech-Savvy Renters</option>
        </select>
    </div>

    {/* Styling Density */}
    <div className="flex flex-col gap-1.5">
        <label className="text-[9px] font-black text-[#009183] uppercase tracking-widest pl-1">📦 Furniture Density</label>
        <select value={file.styling_density} onChange={(e) => updateFileConfig(file.id, 'styling_density', e.target.value)} className="bg-[#0B1120] text-[10px] font-bold uppercase p-3 rounded-xl border border-slate-700 outline-none focus:border-[#009183] text-white shadow-inner">
            <option value="Medium">Medium Density</option>
            <option value="Low (Minimalist)">Low (Minimalist)</option>
            <option value="High (Hygge)">High (Lived-in)</option>
        </select>
    </div>

    {/* Season & Lighting */}
    <div className="flex flex-col gap-1.5 lg:col-span-2">
        <label className="text-[9px] font-black text-[#009183] uppercase tracking-widest pl-1">☀️ Season & Lighting</label>
        <select value={file.season} onChange={(e) => updateFileConfig(file.id, 'season', e.target.value)} className="bg-[#0B1120] text-[10px] font-bold uppercase p-3 rounded-xl border border-slate-700 outline-none focus:border-[#009183] text-white shadow-inner">
            <option value="none">Default Lighting</option>
            <option value="summer">Summer Light (Sharp/Cool)</option>
            <option value="spring">Spring Light (Bright/Fresh)</option>
            <option value="autumn_winter">Autumn/Winter Light (Warm/Cozy)</option>
        </select>
    </div>

</div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="flex justify-end pt-8">
                        <button onClick={startStagingRender} className="px-14 py-5 bg-gradient-to-r from-[#009183] to-[#00b09f] text-white font-black uppercase text-xs rounded-full shadow-[0_0_40px_rgba(0,145,131,0.4)] hover:scale-105 transition-transform">Start Virtual Staging</button>
                    </div>
                    <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                </div>
            )}
          </>
        )}

        {/* PLACEHOLDERS */}
        {activeTab === 'renovation' && <div className="glass p-16 border-2 border-dashed border-slate-700 flex flex-col items-center justify-center rounded-3xl bg-[#0f172a]/50 mt-8 min-h-[400px]"><div className="text-6xl mb-4">🔨</div><h2 className="text-white font-black text-xl uppercase tracking-widest">Renovation Studio</h2><p className="text-slate-400 mt-2">Coming soon: Clean up construction sites and remove clutter.</p></div>}
        {activeTab === 'staging_plus' && <div className="glass p-16 border-2 border-dashed border-slate-700 flex flex-col items-center justify-center rounded-3xl bg-[#0f172a]/50 mt-8 min-h-[400px]"><div className="text-6xl mb-4">✨</div><h2 className="text-white font-black text-xl uppercase tracking-widest">Staging+ (Pro)</h2><p className="text-slate-400 mt-2">Coming soon: Advanced styling with masking, multi-room consistency, and custom hero shots.</p></div>}

        {/* RENDERING SPINNER */}
        {isRendering && (
          <div className="glass p-16 text-center space-y-8 animate-in fade-in duration-500 rounded-3xl bg-[#0f172a]/50 border border-[#009183]/30 shadow-2xl mt-10">
              <div className="text-6xl animate-bounce mb-4">🛋️</div>
              <p className="font-black uppercase tracking-[0.3em] text-sm text-[#009183] transition-all">{progressStatus}</p>
              <div className="w-full max-w-2xl mx-auto bg-[#0B1120] h-4 rounded-full overflow-hidden p-1 border border-white/10">
                <div className="bg-gradient-to-r from-[#009183] to-[#00b09f] h-full rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(0,145,131,0.8)]" style={{ width: `${progressPct}%` }}></div>
              </div>
          </div>
        )}

        {/* RESULTS GALLERY */}
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
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate max-w-[200px]">{item.name}</span>
                                <button onClick={() => window.open(item.url)} className="px-4 py-2 bg-slate-800 text-white rounded-full text-[9px] font-black uppercase hover:bg-slate-700">Download</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
      </main>
    </div>
  );
}