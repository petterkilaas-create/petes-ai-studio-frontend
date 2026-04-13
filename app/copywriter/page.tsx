"use client";

import { useState, useEffect, useRef } from "react";
import { useUser, useAuth } from "@clerk/nextjs"; 
import { supabase } from "../../supabaseClient"; 
import Autocomplete from "react-google-autocomplete";

const API = "https://petes-ai-studio-backend-v2-32654019163.europe-north1.run.app";

type OrderArchive = { name: string; address?: string; date: string; status: string; hasCopy: boolean; };
type UploadedFile = { id: string; file: File; url: string; };

export default function CopywriterPage() {
  const { user } = useUser();
  const { getToken } = useAuth(); // VIP Pass for Clerk!
  
  const [viewMode, setViewMode] = useState<'mine' | 'all'>('mine');

  // --- STATE FOR HISTORIKK ---
  const [archiveOrders, setArchiveOrders] = useState<OrderArchive[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [pastOrderModal, setPastOrderModal] = useState<{name: string, address: string, text: string} | null>(null);

  // --- STATE FOR AKTIV ORDRE ---
  const [orderId, setOrderId] = useState("");
  const [orderAddress, setOrderAddress] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  
  const [propertyType, setPropertyType] = useState("Leilighet");
  const [targetAudience, setTargetAudience] = useState("Bred kjøpergruppe");
  const [tone, setTone] = useState("Varm og innbydende");
  const [length, setLength] = useState("Fyldig og detaljert");
  
  const [sessionTexts, setSessionTexts] = useState<{version: number, text: string}[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOrderId(`CPY-${Math.random().toString(16).slice(2, 8).toUpperCase()}`);
  }, []);

  // --- FETCH ORDERS (Skuddsikker standard-fetch) ---
  const fetchMyProjects = async () => {
    if (!user) return;
    let query = supabase.from('projects')
        .select('name, address, created_at, status, generated_copy')
        .order('created_at', { ascending: false });
        
    if (viewMode === 'mine') query = query.eq('user_id', user.id);

    const { data, error } = await query;
    if (!error && data) {
      const copyOrders = data.filter(p => p.generated_copy !== null && p.generated_copy.trim() !== "");
      setArchiveOrders(copyOrders.map(p => ({ 
        name: p.name, address: p.address, date: new Date(p.created_at).toLocaleDateString('no-NO'), status: 'completed', hasCopy: true
      })));
    }
  };

  useEffect(() => {
    fetchMyProjects();
  }, [user, viewMode]);

  // --- OPPLASTING & DRAG/DROP ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    addFiles(e.target.files);
  };

  const handleDropZone = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const addFiles = (files: FileList | File[]) => {
    const newFiles: UploadedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith("image/")) {
        newFiles.push({ id: "img_" + Math.random().toString(36).substr(2, 9), file: files[i], url: URL.createObjectURL(files[i]) });
      }
    }
    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id: string) => setUploadedFiles(prev => prev.filter(f => f.id !== id));

  // --- GENERER PROSPEKT (Sikker & Synkron) ---
  const startCopyGeneration = async () => {
    if (!orderId || uploadedFiles.length === 0) return;
    setIsGenerating(true);
    
    const currentVersion = sessionTexts.length + 1;
    const versionedJobName = `${orderId}-V${currentVersion}`;

    const fd = new FormData();
    fd.append('job_name', versionedJobName);
    fd.append('address', orderAddress);
    
    const combinedInstructions = `${tone}. Eiendomstype: ${propertyType}. Målgruppe: ${targetAudience}.`;
    fd.append('tone', combinedInstructions);
    fd.append('length', length);
    
    if (user) fd.append('user_id', user.id);
    uploadedFiles.forEach(f => { fd.append('files', f.file); });

    try {
        const token = await getToken(); 
        const res = await fetch(`${API}/generate-copy/`, { 
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${token}` }, // Dørvakt på plass!
            body: fd 
        });
        const data = await res.json();
        
        if (data.status === 'success') {
            setSessionTexts(prev => [{version: currentVersion, text: data.copy}, ...prev]);
            fetchMyProjects(); // Oppdaterer historikken umiddelbart!
        } else {
            alert("Error generating copy: " + data.message);
        }
    } catch (error) { 
        console.error(error); 
    } finally {
        setIsGenerating(false);
    }
  };

  const viewPastOrder = async (name: string, address: string) => { 
      const { data, error } = await supabase.from('projects').select('generated_copy').eq('name', name).single();
      if (!error && data && data.generated_copy) {
          setPastOrderModal({ name, address, text: data.generated_copy });
      }
  };

  const deleteOrder = async (e: React.MouseEvent, orderName: string) => {
    e.stopPropagation();
    if (!window.confirm(`Sikker på at du vil slette dette prosjektet?`)) return;
    setArchiveOrders(prev => prev.filter(o => o.name !== orderName));
    if (user) await supabase.from('projects').delete().eq('name', orderName);
  };

  const filteredOrders = archiveOrders.filter(order => 
      order.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (order.address && order.address.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex flex-col bg-[#0B1120] text-white min-h-screen font-sans relative">
      <main className="max-w-6xl mx-auto w-full p-8 flex-1">
        
        {/* --- TOP HEADER --- */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-12 bg-[#0f172a] border border-slate-800 rounded-3xl p-8 shadow-xl flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-widest mb-4 flex items-center gap-4">
                        <span className="text-4xl">✍️</span> AI Copywriter
                    </h1>
                    <p className="text-slate-400 max-w-2xl">Last opp bilder, velg målgruppe, og la AI-en skrive et overbevisende prospekt for deg.</p>
                </div>
                <div className="text-right border border-white/10 px-4 py-2 rounded-xl bg-white/5">
                    <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Order ID</p>
                    <p className="text-lg text-white font-black">{orderId}</p>
                </div>
            </div>

            {/* --- GENERATOR FORM --- */}
            <div className="glass p-12 border border-slate-800 flex flex-col items-center gap-8 rounded-3xl bg-[#0f172a] shadow-2xl mb-12 relative overflow-hidden">
              
              {/* Laste-overlay hvis den jobber */}
              {isGenerating && (
                  <div className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center animate-in fade-in">
                      <div className="text-6xl animate-bounce mb-6">✍️</div>
                      <p className="text-[#009183] font-black uppercase tracking-[0.3em] text-lg animate-pulse">Lager magi...</p>
                      <p className="text-slate-400 text-xs mt-2 font-bold uppercase tracking-widest">Dette tar typisk 10-15 sekunder</p>
                  </div>
              )}

              <div className="w-full max-w-2xl mx-auto space-y-4">
                  <label className="text-[10px] font-bold text-[#009183] uppercase tracking-[0.2em] block text-center mb-4">
                      📍 Eiendommens Adresse
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
                      <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-3 text-white font-bold text-xs outline-none focus:border-[#009183] cursor-pointer">
                          <option value="Leilighet">Leilighet</option>
                          <option value="Enebolig">Enebolig</option>
                          <option value="Rekkehus">Rekkehus / Tomannsbolig</option>
                          <option value="Hytte">Hytte / Fritidsbolig</option>
                      </select>
                  </div>
                  <div className="space-y-2">
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Målgruppe</label>
                      <select value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-3 text-white font-bold text-xs outline-none focus:border-[#009183] cursor-pointer">
                          <option value="Bred kjøpergruppe">Bred Kjøpergruppe</option>
                          <option value="Barnefamilier">Barnefamilier</option>
                          <option value="Unge par og etablerere">Unge Par</option>
                          <option value="Godt voksne / Seniorer">Godt Voksne</option>
                          <option value="Investorer">Investorer (Utleie)</option>
                      </select>
                  </div>
                  <div className="space-y-2">
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Tone & Stil</label>
                      <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-3 text-white font-bold text-xs outline-none focus:border-[#009183] cursor-pointer">
                          <option value="Varm og innbydende">Varm & Innbydende</option>
                          <option value="Eksklusiv og luksuriøs">Eksklusiv & Luksuriøs</option>
                          <option value="Moderne og minimalistisk">Moderne & Kul</option>
                          <option value="Nøytral og profesjonell">Nøytral & Profesjonell</option>
                      </select>
                  </div>
                  <div className="space-y-2">
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Lengde</label>
                      <select value={length} onChange={(e) => setLength(e.target.value)} className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-3 text-white font-bold text-xs outline-none focus:border-[#009183] cursor-pointer">
                          <option value="Fyldig og detaljert">Fyldig (Normal)</option>
                          <option value="Kort og presis">Kort & Punchy</option>
                      </select>
                  </div>
              </div>

              <div 
                  onDragOver={(e) => e.preventDefault()} 
                  onDrop={handleDropZone}
                  className="w-full border-2 border-dashed border-slate-700 bg-[#0B1120] rounded-2xl p-8 flex flex-col items-center justify-center transition-colors hover:border-[#009183]/50"
              >
                  <input type="file" multiple className="hidden" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} />
                  <div className="text-center">
                      <div className="text-4xl mb-4">📸</div>
                      <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-4">Dra og slipp bilder her</p>
                      <button onClick={() => fileInputRef.current?.click()} className="px-8 py-3 bg-[#1e293b] text-white rounded-full font-black uppercase tracking-widest text-xs hover:bg-slate-700 transition-colors">
                          Eller velg filer
                      </button>
                  </div>

                  {uploadedFiles.length > 0 && (
                      <div className="grid grid-cols-4 md:grid-cols-6 gap-4 mt-8 w-full">
                          {uploadedFiles.map(f => (
                              <div key={f.id} className="relative aspect-square bg-black rounded-xl overflow-hidden border border-slate-700 group">
                                  <img src={f.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="upload" />
                                  <button onClick={() => removeFile(f.id)} className="absolute top-2 right-2 bg-red-500/90 text-white rounded-full w-6 h-6 flex items-center justify-center text-[10px] font-black z-10 hover:bg-red-600 hover:scale-110 transition-all">X</button>
                              </div>
                          ))}
                      </div>
                  )}
              </div>

              <button 
                  onClick={startCopyGeneration} 
                  disabled={uploadedFiles.length === 0 || !orderAddress}
                  className={`mt-4 px-16 py-5 rounded-full font-black uppercase tracking-widest text-sm transition-all shadow-lg ${uploadedFiles.length === 0 || !orderAddress ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-[#009183] to-[#00b09f] text-white hover:scale-105 shadow-[#009183]/30'}`}
              >
                  Generate Prospekt
              </button>
              {(!orderAddress || uploadedFiles.length === 0) && (
                  <p className="text-[10px] text-[#ef4444] font-bold uppercase tracking-widest -mt-4">Du må fylle inn adresse og laste opp bilder.</p>
              )}
          </div>

          {/* --- RESULTS AREA --- */}
          {sessionTexts.length > 0 && (
              <div className="space-y-8 mb-20 animate-in fade-in duration-500">
                  {sessionTexts.map((st) => (
                      <div key={st.version} className="bg-[#0f172a] rounded-3xl p-10 border border-[#009183]/30 shadow-2xl relative">
                          <div className="absolute top-8 right-8 flex items-center gap-4">
                              <span className="px-4 py-2 bg-[#009183]/10 text-[#009183] rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#009183]/30">Versjon {st.version}</span>
                              <button onClick={() => navigator.clipboard.writeText(st.text)} className="px-6 py-2 bg-[#009183] hover:bg-[#00b09f] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-lg">
                                  Kopier Tekst
                              </button>
                          </div>
                          <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-8">Resultat ({targetAudience} - {tone})</h4>
                          <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed whitespace-pre-wrap text-lg">
                              {st.text}
                          </div>
                      </div>
                  ))}
              </div>
          )}

          {/* --- LISTE OVER TIDLIGERE TEKSTER --- */}
          <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4 mt-20 pt-10 border-t border-slate-800">
              <div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-2">Historikk</h2>
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                  <input type="text" placeholder="Søk ID eller Adresse..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full md:w-64 bg-[#0f172a] rounded-xl px-4 py-3 text-xs text-white outline-none border border-slate-700 focus:border-[#009183]" />
              </div>
          </div>

          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl shadow-xl mb-20 overflow-hidden">
              <table className="w-full text-left border-collapse">
                  <thead><tr className="bg-[#1e293b] border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-400 font-bold"><th className="p-5">Project</th><th className="p-5">Date</th><th className="p-5">Status</th><th className="p-5 text-right">Actions</th></tr></thead>
                  <tbody>
                      {filteredOrders.length === 0 ? (
                          <tr><td colSpan={4} className="p-8 text-center text-slate-500 text-sm">Ingen tidligere tekster funnet.</td></tr>
                      ) : (
                          filteredOrders.filter(o => o.name.startsWith('CPY')).map(order => ( 
                              <tr key={order.name} onClick={() => viewPastOrder(order.name, order.address || "Ukjent Adresse")} className="border-b border-slate-800/50 hover:bg-[#1e293b]/50 cursor-pointer transition-colors group">
                                  <td className="p-5 font-bold text-white flex flex-col justify-center">
                                      <div className="flex items-center gap-3">
                                          <span className="text-xl group-hover:scale-110 transition-transform">✍️</span>
                                          <span>{order.name}</span>
                                      </div>
                                      {order.address && <span className="text-[10px] text-slate-400 mt-1 ml-9 uppercase tracking-widest font-normal">{order.address}</span>}
                                  </td>
                                  <td className="p-5 text-slate-400 text-sm">{order.date}</td>
                                  <td className="p-5"><span className="bg-green-900/30 text-green-400 border border-green-500/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Lagret</span></td>
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
      </main>

      {/* --- MODAL FOR HISTORIKK --- */}
      {pastOrderModal && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-8" onClick={() => setPastOrderModal(null)}>
            <div className="bg-[#0f172a] rounded-3xl p-10 border border-slate-700 shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto relative" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-start border-b border-slate-800 pb-6 mb-8">
                    <div>
                        <p className="text-[#009183] font-bold text-xs tracking-widest mb-1">{pastOrderModal.name}</p>
                        <h2 className="text-2xl font-black text-white uppercase tracking-widest">{pastOrderModal.address}</h2>
                    </div>
                    <div className="flex gap-4">
                        <button onClick={() => navigator.clipboard.writeText(pastOrderModal.text)} className="px-6 py-3 bg-[#009183] hover:bg-[#00b09f] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-lg">Kopier Tekst</button>
                        <button onClick={() => setPastOrderModal(null)} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">Lukk</button>
                    </div>
                </div>
                <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed whitespace-pre-wrap text-lg">
                    {pastOrderModal.text}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}