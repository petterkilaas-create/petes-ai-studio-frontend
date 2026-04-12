"use client";

import { useState, useRef, useEffect } from "react";
import { useUser, useAuth } from "@clerk/nextjs"; // <-- VIP Pass
import Autocomplete from "react-google-autocomplete";
import { supabase } from "../../supabaseClient"; 

const API = "https://petes-ai-studio-backend-v2-73jga2zlcq-lz.a.run.app";

type UploadedFile = { id: string; file: File; url: string; type: string; style: string; prompt: string; };
type GalleryImage = { name: string; url: string; type: 'image' | 'video'; };

const STATUS_MESSAGES = [
    "Directing the AI Cameras...",
    "Generating cinematic motion...",
    "Stitching scenes together...",
    "Adding transitions & text...",
    "Finalizing property film...",
    "Polishing frame rates..."
];

export default function VideoPage() {
  const { user } = useUser();
  const { getToken } = useAuth(); // <-- Henter ut det magiske passet!

  const [orderId, setOrderId] = useState("");
  const [orderAddress, setOrderAddress] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  
  useEffect(() => {
    setOrderId(`ORD-${Math.random().toString(16).slice(2, 8).toUpperCase()}`);
  }, []);

  const [videoTimeline, setVideoTimeline] = useState<string[]>([]);
  const [videoMeta, setVideoMeta] = useState({ address: "", price: "", realtorName: "", phone: "" });

  const [isRendering, setIsRendering] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressStatus, setProgressStatus] = useState("Processing...");
  const [statusMsgIndex, setStatusMsgIndex] = useState(0);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
                const step = Math.max(0.05, remaining * 0.02); 
                return prev >= 95 ? 95 : prev + step;
            });
        }, 500);

        msgInterval = setInterval(() => {
            setStatusMsgIndex(prev => {
                const next = (prev + 1) % STATUS_MESSAGES.length;
                setProgressStatus(STATUS_MESSAGES[next]);
                return next;
            });
        }, 6000);
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

    // 1. Radioen (Rask, men kan sovne)
    const channel = supabase
      .channel(`video_progress_${orderId}`)
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

    // 2. Sikkerhetsnettet (Spør Supabase forsiktig hvert 5. sekund KUN når vi rendrer)
    if (isRendering && orderId) {
        fallbackTimer = setInterval(async () => {
            try {
                const { data } = await supabase.from('projects').select('status').eq('name', orderId).single();
                if (data && (data.status === 'completed' || data.status === 'finished')) {
                    console.log("Sikkerhetsnett fanget opp at jobben er ferdig!");
                    triggerFinish();
                }
            } catch (e) {
                console.error("Poller error:", e);
            }
        }, 5000);
    }

    return () => { if (fallbackTimer) clearInterval(fallbackTimer); };
  }, [isRendering, orderId]);

  const triggerFinish = () => {
      setProgressPct(100);
      setProgressStatus("Film Ready! Loading preview...");
      setTimeout(() => {
          setIsRendering(false);
          loadGallery(orderId);
      }, 800);
  };


  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const newFiles: UploadedFile[] = [];
    for (let i = 0; i < e.target.files.length; i++) {
      if (e.target.files[i].type.startsWith("image/")) {
        newFiles.push({ id: "img_" + Math.random().toString(36).substr(2, 9), file: e.target.files[i], url: URL.createObjectURL(e.target.files[i]), type: "exterior", style: "", prompt: "" });
      }
    }
    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; };
  const handleDragEnd = (e: React.DragEvent) => {  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };

  const handleVideoDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const imgId = e.dataTransfer.getData("text/plain"); 
      if (!imgId) return;
      if (!videoTimeline.includes(imgId)) { 
          setVideoTimeline(prev => [...prev, imgId]); 
      }
  };

  const removeFromVideoTimeline = (imgId: string) => { setVideoTimeline(prev => prev.filter(id => id !== imgId)); };

  const startFullPropertyFilm = async () => {
      if (videoTimeline.length < 2) {
          alert("You need to add at least 2 scenes to the timeline to generate a film.");
          return;
      }
      
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

      const timelineFiles = videoTimeline.map(id => uploadedFiles.find(f => f.id === id)).filter(Boolean) as UploadedFile[];
      timelineFiles.forEach(f => { fd.append('files', f.file); });

      const cfg = {
          timeline: timelineFiles.map(f => f.file.name),
          meta: videoMeta
      };
      fd.append('config', JSON.stringify(cfg));

      try {
          const token = await getToken(); // <-- Henter VIP Passet!
          await fetch(`${API}/start-property-film/`, { 
              method: 'POST', 
              headers: { 'Authorization': `Bearer ${token}` }, // <-- Viser VIP passet til dørvakten
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

  const handleDownloadSingle = async (url: string, filename: string) => {
      try {
          const response = await fetch(url); const blob = await response.blob(); const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a'); link.href = blobUrl; link.download = filename || 'video.mp4';
          document.body.appendChild(link); link.click(); document.body.removeChild(link); setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      } catch (error) { window.open(url, '_blank'); }
  };

  const unassignedVideoFiles = uploadedFiles.filter(f => !videoTimeline.includes(f.id));
  const timelineFilesList = videoTimeline.map(id => uploadedFiles.find(f => f.id === id)).filter(Boolean) as UploadedFile[];

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col font-sans">
      <main className="flex-1 flex flex-col max-w-6xl mx-auto w-full p-8">
          
        <div className="mb-12 bg-[#0f172a] border border-slate-800 rounded-3xl p-8 shadow-xl flex justify-between items-start">
            <div>
                <h1 className="text-3xl font-black text-white uppercase tracking-widest mb-4 flex items-center gap-4">
                    <span className="text-4xl">🎬</span> Cinematic Video
                </h1>
                <p className="text-slate-400 mb-6 max-w-3xl">Turn your static property photos into a premium social media reel.</p>
            </div>
            <div className="text-right border border-white/10 px-4 py-2 rounded-xl bg-white/5">
                <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Order ID</p>
                <p className="text-lg text-white font-black">{orderId}</p>
            </div>
        </div>

        {uploadedFiles.length === 0 && galleryImages.length === 0 && !isRendering && (
          <div className="glass p-16 border-2 border-dashed border-[#9333ea]/40 flex flex-col items-center gap-8 rounded-3xl bg-[#0f172a]/50 shadow-[0_0_30px_rgba(147,51,234,0.05)]">
              <div className="w-full max-w-2xl mx-auto space-y-4">
                  <label className="text-[10px] font-bold text-purple-400 uppercase tracking-[0.2em] block text-center mb-6">
                      📍 Søk etter eiendommens adresse
                  </label>
                  <Autocomplete
                      apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
                      onPlaceSelected={(place) => { 
                          if (place && place.formatted_address) { 
                              setOrderAddress(place.formatted_address); 
                              setVideoMeta(prev => ({...prev, address: place.formatted_address || ""})); 
                          } 
                      }}
                      options={{ types: ["address"], componentRestrictions: { country: "no" } }}
                      placeholder="START Å SKRIVE ADRESSE..."
                      className="w-full bg-transparent border-b-2 border-slate-700 text-2xl font-black text-white outline-none focus:border-purple-500 uppercase pb-4 transition-colors text-center placeholder:text-slate-600"
                  />
                  {orderAddress && (
                      <div className="mt-8 p-6 bg-[#0B1120] rounded-2xl border border-purple-500/30 text-center animate-in fade-in duration-300">
                          <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-2">Prosjekt opprettet:</p>
                          <p className="text-xl text-purple-400 font-black uppercase tracking-wider">{orderAddress}</p>
                      </div>
                  )}
              </div>
              <input type="file" multiple className="hidden" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} />
              <button onClick={() => fileInputRef.current?.click()} className="px-12 py-4 bg-purple-600 text-white rounded-full font-black uppercase text-xs cursor-pointer hover:bg-purple-500 transition-all shadow-[0_0_20px_rgba(147,51,234,0.4)]">Upload Photos</button>
          </div>
        )}

        {uploadedFiles.length > 0 && !isRendering && galleryImages.length === 0 && (
          <div className="space-y-8 animate-in fade-in duration-500">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800 space-y-4">
                      <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">🎬 Intro Scene Text</h3>
                      <input type="text" placeholder="Address (e.g. Storgata 1)" value={videoMeta.address} onChange={(e) => setVideoMeta({...videoMeta, address: e.target.value})} className="w-full bg-[#0B1120] rounded-xl px-4 py-3 text-xs text-white outline-none border border-slate-700 focus:border-purple-500" />
                      <input type="text" placeholder="Price (e.g. Prisantydning 5.990.000,-)" value={videoMeta.price} onChange={(e) => setVideoMeta({...videoMeta, price: e.target.value})} className="w-full bg-[#0B1120] rounded-xl px-4 py-3 text-xs text-white outline-none border border-slate-700 focus:border-purple-500" />
                  </div>
                  <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800 space-y-4">
                      <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">📱 Outro Scene Text</h3>
                      <input type="text" placeholder="Realtor Name" value={videoMeta.realtorName} onChange={(e) => setVideoMeta({...videoMeta, realtorName: e.target.value})} className="w-full bg-[#0B1120] rounded-xl px-4 py-3 text-xs text-white outline-none border border-slate-700 focus:border-purple-500" />
                      <input type="text" placeholder="Phone / Agency" value={videoMeta.phone} onChange={(e) => setVideoMeta({...videoMeta, phone: e.target.value})} className="w-full bg-[#0B1120] rounded-xl px-4 py-3 text-xs text-white outline-none border border-slate-700 focus:border-purple-500" />
                  </div>
              </div>

              <div className="bg-[#0f172a] p-8 rounded-2xl border border-purple-500/40 shadow-lg" onDragOver={handleDragOver} onDrop={handleVideoDrop}>
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Timeline (Drag here to set order)</h3>
                      <span className="text-xs text-slate-400 font-bold">{timelineFilesList.length} / 12 Images Selected</span>
                  </div>
                  <div className="flex gap-4 p-6 min-h-[180px] overflow-x-auto bg-[#0B1120] rounded-xl border border-slate-800 items-center">
                      {timelineFilesList.length === 0 ? (
                          <div className="w-full text-center text-slate-600 text-xs font-bold uppercase tracking-widest">Drag images here from the pool below</div>
                      ) : (
                          timelineFilesList.map((file, index) => (
                              <div key={file.id + index} className="relative min-w-[120px] h-[120px] group flex-shrink-0">
                                  <div className="absolute -top-3 -left-3 w-6 h-6 bg-purple-600 rounded-full text-white flex items-center justify-center text-[10px] font-black border-2 border-[#0B1120] z-20">{index + 1}</div>
                                  <button onClick={() => removeFromVideoTimeline(file.id)} className="absolute top-2 right-2 bg-red-500/80 text-white rounded-full w-5 h-5 flex items-center justify-center text-[8px] font-black z-30 hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity">X</button>
                                  <img src={file.url} draggable onDragStart={(e) => handleDragStart(e, file.id)} onDragEnd={handleDragEnd} className="w-full h-full object-cover rounded-lg border-2 border-purple-500/50" alt="timeline frame" />
                              </div>
                          ))
                      )}
                  </div>
              </div>

              <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800" onDragOver={handleDragOver} onDrop={(e) => {
                  e.preventDefault(); 
                  const imgId = e.dataTransfer.getData("text/plain"); 
                  if (imgId) removeFromVideoTimeline(imgId);
              }}>
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Image Pool</h3>
                  <div className="flex flex-wrap gap-4">
                      {unassignedVideoFiles.map(file => (
                          <img key={file.id} src={file.url} draggable onDragStart={(e) => handleDragStart(e, file.id)} onDragEnd={handleDragEnd} className="w-20 h-20 object-cover rounded-xl border border-slate-700 opacity-80 hover:opacity-100 hover:scale-105 transition-all cursor-grab" alt="pool frame" />
                      ))}
                      {unassignedVideoFiles.length === 0 && <p className="text-xs text-slate-600 font-bold uppercase">All uploaded images are in the timeline.</p>}
                  </div>
              </div>

              <div className="flex justify-end pt-4">
                  <button onClick={startFullPropertyFilm} className="px-12 py-5 bg-gradient-to-r from-purple-600 to-purple-500 text-white font-black uppercase tracking-widest text-xs rounded-full shadow-[0_0_30px_rgba(147,51,234,0.4)] hover:scale-105 transition-transform">
                      Generate Property Film
                  </button>
              </div>
          </div>
        )}

        {/* --- RENDERING SPINNER --- */}
        {isRendering && (
          <div className="glass p-16 text-center space-y-8 animate-in fade-in duration-500 rounded-3xl bg-[#0f172a]/50 border border-purple-500/30 shadow-2xl mt-10">
              <div className="text-6xl animate-bounce mb-4">🎬</div>
              <p className="font-black uppercase tracking-[0.3em] text-sm text-purple-400 transition-all">{progressStatus}</p>
              <div className="w-full max-w-2xl mx-auto bg-[#0B1120] h-4 rounded-full overflow-hidden p-1 border border-white/10">
                <div className="bg-gradient-to-r from-purple-600 to-purple-500 h-full rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(147,51,234,0.8)]" style={{ width: `${progressPct}%` }}></div>
              </div>
          </div>
        )}

        {galleryImages.length > 0 && !isRendering && (
            <div className="animate-in fade-in slide-in-from-bottom-10 duration-500 max-w-3xl mx-auto mt-10">
                <div className="flex justify-between items-end border-b border-white/10 pb-6 mb-10">
                    <div>
                        <p className="text-purple-400 font-bold text-sm tracking-widest">{orderId}</p>
                        <h3 className="text-3xl font-black text-white uppercase">{orderAddress || "Unnamed Project"}</h3>
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-10 pb-20">
                    {galleryImages.map((item) => (
                        <div key={item.name} className="flex flex-col bg-[#0f172a] rounded-[2rem] p-4 border border-white/5 shadow-2xl">
                            <div className="relative aspect-video rounded-[1.5rem] overflow-hidden bg-black mb-4">
                                {item.type === 'video' ? (
                                    <video src={item.url} autoPlay loop muted playsInline controls className="absolute inset-0 w-full h-full object-cover z-10" />
                                ) : (
                                    <img src={item.url} className="w-full h-full object-cover" alt="Fallback" />
                                )}
                            </div>
                            <div className="flex justify-between items-center px-4 py-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-green-500"></span> Ready
                                </span>
                                <button onClick={() => handleDownloadSingle(item.url, item.name)} className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-colors shadow-lg">Download MP4</button>
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