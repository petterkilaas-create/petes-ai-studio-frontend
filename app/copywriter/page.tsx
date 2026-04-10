"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { supabase } from "../../supabaseClient"; 
import Autocomplete from "react-google-autocomplete";

const API = "https://petes-ai-studio-backend-v2-32654019163.europe-north1.run.app";

type OrderArchive = { name: string; address?: string; date: string; status: string; hasCopy: boolean; };
type UploadedFile = { id: string; file: File; url: string; type: string; style: string; prompt: string; maskBlob: Blob | null; };

export default function CopywriterPage() {
  const { user } = useUser();
  const isAdmin = user?.primaryEmailAddress?.emailAddress === "petter.kilaas@diakrit.com"; 
  const [viewMode, setViewMode] = useState<'mine' | 'all'>('mine');

  const [archiveOrders, setArchiveOrders] = useState<OrderArchive[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);

  // --- Copywriter Valg ---
  const [orderId, setOrderId] = useState("");
  const [orderAddress, setOrderAddress] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  
  const [propertyType, setPropertyType] = useState("Leilighet");
  const [targetAudience, setTargetAudience] = useState("Bred kjøpergruppe");
  const [tone, setTone] = useState("Varm og innbydende");
  const [length, setLength] = useState("Fyldig og detaljert");
  
  const [generatedCopy, setGeneratedCopy] = useState("");

  const [isRendering, setIsRendering] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressStatus, setProgressStatus] = useState("Processing...");

  // REFERANSEN SOM MANGLA ER NÅ PÅ PLASS!
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generer unik ID ved innlasting
  useEffect(() => {
    setOrderId(`CPY-${Math.random().toString(16).slice(2, 8).toUpperCase()}`);
  }, []);

  // --- FETCH ORDERS (Henter KUN jobber som har tekst) ---
  useEffect(() => {
    const fetchMyProjects = async () => {
      if (!user) return;
      
      let query = supabase
        .from('projects')
        .select('name, address, created_at, status, generated_copy')
        .order('created_at', { ascending: false });

      if (viewMode === 'mine') {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;
      if (!error && data) {
        // Filtrerer ut kun de som faktisk har en generert tekst
        const copyOrders = data.filter(p => p.generated_copy !== null && p.generated_copy.trim() !== "");
        setArchiveOrders(copyOrders.map(p => ({ 
          name: p.name, 
          address: p.address,
          date: new Date(p.created_at).toLocaleDateString('no-NO'), 
          status: 'completed', // Siden teksten finnes, er den ferdig
          hasCopy: true
        })));
      }
    };
    
    fetchMyProjects();

    const channel = supabase.channel('realtime-projects-archive').on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchMyProjects(); 
    }).subscribe();

    return () => { supabase.removeChannel(channel); };
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

  // --- GENERATE COPY LOGIC ---
  const startCopyGeneration = async () => {
    if (!orderId || uploadedFiles.length === 0) return;
    setIsRendering(true); setProgressPct(50); setProgressStatus("Analyzing Photos & Maps...");
    
    const fd = new FormData();
    fd.append('job_name', orderId);
    fd.append('address', orderAddress);
    
    // Vi baker alle valgene inn i 'tone' feltet for å slippe backend-endringer!
    const combinedInstructions = `${tone}. Eiendomstype: ${propertyType}. Målgruppe: ${targetAudience}.`;
    fd.append('tone', combinedInstructions);
    fd.append('length', length);
    
    if (user) fd.append('user_id', user.id);
    uploadedFiles.forEach(f => { fd.append('files', f.file); });

    try {
        const res = await fetch(`${API}/generate-copy/`, { method: 'POST', body: fd });
        const data = await res.json();
        
        setIsRendering(false); setProgressPct(100);
        if (data.status === 'success') {
            setGeneratedCopy(data.copy);
            viewOrder(orderId, data.copy); // Sender teksten direkte til visning
        } else {
            alert("Error generating copy: " + data.message);
        }
    } catch (error) { console.error(error); setIsRendering(false); }
  };

  // --- ACTIONS ---
  const viewOrder = async (name: string, directCopy?: string) => { 
      setSelectedOrder(name); 
      setGeneratedCopy("");
      
      if (directCopy) {
          setGeneratedCopy(directCopy);
      } else {
          // Henter teksten fra databasen hvis vi klikket på en gammel ordre
          const { data, error } = await supabase.from('projects').select('generated_copy').eq('name', name).single();
          if (!error && data && data.generated_copy) {
              setGeneratedCopy(data.generated_copy);
          }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteOrder = async (e: React.MouseEvent, orderName: string) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to permanently delete this project?`)) return;
    setArchiveOrders(prev => prev.filter(o => o.name !== orderName));
    if (selectedOrder === orderName) setSelectedOrder(null);
    if (user) await supabase.from('projects').delete().eq('name', orderName);
  };

  const filteredOrders = archiveOrders.filter(order => 
      order.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (order.address && order.address.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex flex-col bg-[#0B1120] text-white min-h-screen font-sans">
      <main className="max-w-6xl mx-auto w-full p-8 flex-1">
        
        {/* --- CREATION VIEW (Hvis ingen ordre er valgt) --- */}
        {!selectedOrder ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="mb-12 bg-[#0f172a] border border-slate-800 rounded-3xl p-8 shadow-xl flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-black text-white uppercase tracking-widest mb-4 flex items-center gap-4">
                            <span className="text-4xl">✍️</span> AI Copywriter
                        </h1>
                        <p className="text-slate-400 max-w-2xl">Upload photos and select your target audience to generate a professional real estate listing text.</p>
                    </div>
                    <div className="text-right border border-white/10 px-4 py-2 rounded-xl bg-white/5">
                        <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Order ID</p>
                        <p className="text-lg text-white font-black">{orderId}</p>
                    </div>
                </div>

                <div className="glass p-12 border border-slate-800 flex flex-col items-center gap-8 rounded-3xl bg-[#0f172a] shadow-2xl mb-12">
                  <div className="w-full max-w-2xl mx-auto space-y-4">
                      <label className="text-[10px] font-bold text-[#009183] uppercase tracking-[0.2em] block text-center mb-4">
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
                          placeholder="SØK ETTER ADRESSE..."
                          className="w-full bg-transparent border-b-2 border-slate-700 text-2xl font-black text-white outline-none focus:border-[#009183] uppercase pb-4 transition-colors text-center placeholder:text-slate-600"
                      />
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mt-6">
                      <div className="space-y-2">
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Eiendomstype</label>
                          <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-3 text-white font-bold text-xs outline-none focus:border-[#009183]">
                              <option value="Leilighet">Leilighet</option>
                              <option value="Enebolig">Enebolig</option>
                              <option value="Rekkehus">Rekkehus / Tomannsbolig</option>
                              <option value="Hytte">Hytte / Fritidsbolig</option>
                          </select>
                      </div>
                      <div className="space-y-2">
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Målgruppe</label>
                          <select value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-3 text-white font-bold text-xs outline-none focus:border-[#009183]">
                              <option value="Bred kjøpergruppe">Bred Kjøpergruppe</option>
                              <option value="Barnefamilier">Barnefamilier</option>
                              <option value="Unge par og etablerere">Unge Par</option>
                              <option value="Godt voksne / Seniorer">Godt Voksne</option>
                              <option value="Investorer">Investorer (Utleie)</option>
                          </select>
                      </div>
                      <div className="space-y-2">
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Tone & Stil</label>
                          <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-3 text-white font-bold text-xs outline-none focus:border-[#009183]">
                              <option value="Varm og innbydende">Varm & Innbydende</option>
                              <option value="Eksklusiv og luksuriøs">Eksklusiv & Luksuriøs</option>
                              <option value="Moderne og minimalistisk">Moderne & Kul</option>
                              <option value="Nøytral og profesjonell">Nøytral & Profesjonell</option>
                          </select>
                      </div>
                      <div className="space-y-2">
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Lengde</label>
                          <select value={length} onChange={(e) => setLength(e.target.value)} className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-3 text-white font-bold text-xs outline-none focus:border-[#009183]">
                              <option value="Fyldig og detaljert">Fyldig (Normal)</option>
                              <option value="Kort og presis">Kort & Punchy</option>
                          </select>
                      </div>
                  </div>

                  <div className="flex flex-col items-center mt-6">
                      <input type="file" multiple className="hidden" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} />
                      <button onClick={() => fileInputRef.current?.click()} className="px-10 py-3 bg-[#1e293b] border border-slate-600 text-white rounded-full font-black uppercase tracking-widest text-xs hover:bg-slate-700 transition-colors">
                          {uploadedFiles.length > 0 ? `${uploadedFiles.length} Images Selected` : 'Upload Photos'}
                      </button>
                  </div>

                  {uploadedFiles.length > 0 && orderAddress && (
                      <button onClick={startCopyGeneration} className="mt-2 px-16 py-5 bg-gradient-to-r from-[#009183] to-[#00b09f] text-white rounded-full font-black uppercase tracking-widest text-sm hover:scale-105 transition-transform shadow-[0_0_30px_rgba(0,145,131,0.4)]">
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
                              <tr><td colSpan={4} className="p-8 text-center text-slate-500 text-sm">No copy projects found.</td></tr>
                          ) : (
                              filteredOrders.map(order => ( 
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

                {isRendering && (
                  <div className="glass p-16 text-center space-y-8 animate-in fade-in duration-500 mb-8 rounded-3xl bg-[#0f172a]/50 border border-[#009183]/30 shadow-2xl">
                      <div className="text-6xl animate-bounce mb-4">✍️</div>
                      <p className="font-black uppercase tracking-[0.3em] text-sm text-[#009183] animate-pulse">{progressStatus}</p>
                      <div className="w-full max-w-2xl mx-auto bg-[#0B1120] h-4 rounded-full overflow-hidden p-1 border border-white/10"><div className="bg-gradient-to-r from-[#009183] to-[#00b09f] h-full rounded-full transition-all duration-700" style={{ width: `${progressPct}%` }}></div></div>
                  </div>
                )}

                {generatedCopy && !isRendering && (
                    <div className="bg-[#0f172a] rounded-3xl p-10 border border-[#009183]/30 shadow-2xl relative mt-4">
                        <button onClick={() => navigator.clipboard.writeText(generatedCopy)} className="absolute top-8 right-8 px-6 py-3 bg-[#009183] hover:bg-[#00b09f] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-lg">
                            Copy Text
                        </button>
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-8">Generated Prospekt</h4>
                        <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed whitespace-pre-wrap text-lg">
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