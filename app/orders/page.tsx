"use client";

import { useState, useEffect } from "react";
import { useUser, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { supabase } from "../../supabaseClient"; 

const API = "https://petes-ai-studio-backend-v2-32654019163.europe-north1.run.app";

type OrderArchive = { name: string; date: string; status: string; };
type GalleryImage = { name: string; url: string; type: 'image' | 'video'; raw?: string; edited?: string; approved?: boolean; };

export default function OrdersPage() {
  const { user } = useUser();

  const [archiveOrders, setArchiveOrders] = useState<OrderArchive[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  
  // States for viewing a specific order
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [isLoadingGallery, setIsLoadingGallery] = useState(false);

  // Compare Modal
  const [activeModal, setActiveModal] = useState<'none' | 'compare'>('none');
  const [compareData, setCompareData] = useState({ raw: "", edited: "" });

  // --- FETCH ORDERS & REALTIME LISTENER ---
  useEffect(() => {
    const fetchMyProjects = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('projects')
        .select('name, created_at, status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const formattedOrders = data.map(p => ({
          name: p.name,
          date: new Date(p.created_at).toLocaleDateString('no-NO'),
          status: p.status || 'processing'
        }));
        setArchiveOrders(formattedOrders);
      }
    };

    fetchMyProjects();

    if (!user) return;

    const channel = supabase
      .channel('realtime-projects-archive')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as any;
            setArchiveOrders(prev => prev.map(o => o.name === updated.name ? { ...o, status: updated.status } : o));
          } else if (payload.eventType === 'INSERT') {
            const inserted = payload.new as any;
            setArchiveOrders(prev => {
              if (!prev.find(o => o.name === inserted.name)) {
                return [{ name: inserted.name, date: new Date(inserted.created_at).toLocaleDateString('no-NO'), status: inserted.status }, ...prev];
              }
              return prev;
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // --- ACTIONS ---
  const viewOrder = async (name: string) => { 
      setSelectedOrder(name);
      setIsLoadingGallery(true);
      setGalleryImages([]);
      try { 
          const res = await fetch(`${API}/list-finished/?job_name=${name}&t=${Date.now()}`, { cache: 'no-store' }); 
          const data = await res.json(); 
          setGalleryImages(data.images); 
      } catch (e) { 
          console.error(e); 
      } finally {
          setIsLoadingGallery(false);
      }
  };

  const deleteOrder = async (e: React.MouseEvent, orderName: string) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to permanently delete "${orderName}"?`)) return;
    
    // Optimistic UI update
    setArchiveOrders(prev => prev.filter(o => o.name !== orderName));
    if (selectedOrder === orderName) setSelectedOrder(null);

    if (user) await supabase.from('projects').delete().eq('name', orderName).eq('user_id', user.id);
    const fd = new FormData(); fd.append('job_name', orderName); fd.append('image_name', ''); 
    fetch(`${API}/delete-image/`, { method: 'POST', body: fd }).catch(console.error);
  };

  const renameOrder = async (e: React.MouseEvent, oldName: string) => {
    e.stopPropagation();
    const newNameRaw = window.prompt("Enter new project name:", oldName);
    if (!newNameRaw || newNameRaw === oldName) return;
    const newName = newNameRaw.replace(/ /g, "_");
    
    // Optimistic UI update
    setArchiveOrders(prev => prev.map(o => o.name === oldName ? { ...o, name: newName } : o));
    if (selectedOrder === oldName) setSelectedOrder(newName);

    if (user) await supabase.from('projects').update({ name: newName }).eq('name', oldName).eq('user_id', user.id);
    const fd = new FormData(); fd.append('old_name', oldName); fd.append('new_name', newName);
    fetch(`${API}/rename-order/`, { method: 'POST', body: fd }).catch(console.error);
  };

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

  const filteredOrders = archiveOrders.filter(order => order.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col font-sans">
      
      {/* HEADER */}
      <header className="bg-[#0f172a] border-b border-white/5 px-8 py-4 flex justify-between items-center z-50 sticky top-0">
        <Link href="/" className="text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
            <span>←</span> Back to Studio
        </Link>
        <div className="flex items-center gap-6">
            <UserButton appearance={{ elements: { userButtonAvatarBox: "w-10 h-10 border-2 border-[#009183]/50" } }} />
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full p-8">
        
        {!selectedOrder ? (
            /* --- ORDER LIST VIEW --- */
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-end mb-8">
                    <div>
                        <h1 className="text-3xl font-black text-white uppercase tracking-widest mb-2">My Orders</h1>
                        <p className="text-slate-400 text-sm">View, download, and manage your processed projects.</p>
                    </div>
                    <input type="text" placeholder="Search projects..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-64 bg-[#0f172a] rounded-xl px-4 py-3 text-xs text-white outline-none border border-slate-700 focus:border-[#009183]" />
                </div>

                <div className="bg-[#0f172a] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[#1e293b] border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                                <th className="p-5">Project Name</th>
                                <th className="p-5">Date</th>
                                <th className="p-5">Status</th>
                                <th className="p-5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-slate-500 text-sm">No projects found.</td>
                                </tr>
                            ) : (
                                filteredOrders.map(order => (
                                    <tr key={order.name} onClick={() => viewOrder(order.name)} className="border-b border-slate-800/50 hover:bg-[#1e293b]/50 cursor-pointer transition-colors group">
                                        <td className="p-5 font-bold text-white flex items-center gap-3">
                                            <span className="text-xl group-hover:scale-110 transition-transform">{order.name.includes('FILM') || order.name.includes('video') ? '🎬' : order.name.includes('STAGING') ? '🛋️' : '⚡'}</span>
                                            {order.name}
                                        </td>
                                        <td className="p-5 text-slate-400 text-sm">{order.date}</td>
                                        <td className="p-5">
                                            {order.status === 'completed' ? (
                                                <span className="bg-green-900/30 text-green-400 border border-green-500/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Completed</span>
                                            ) : (
                                                <span className="bg-yellow-900/30 text-yellow-400 border border-yellow-500/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse">Processing</span>
                                            )}
                                        </td>
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
            /* --- SINGLE ORDER GALLERY VIEW --- */
            <div className="animate-in fade-in duration-500">
                <div className="flex justify-between items-end border-b border-white/10 pb-6 mb-10">
                    <div>
                        <button onClick={() => setSelectedOrder(null)} className="text-[#009183] hover:text-white text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2 transition-colors"><span>←</span> Back to List</button>
                        <h3 className="text-3xl font-black text-white uppercase">{selectedOrder}</h3>
                    </div>
                    <button onClick={() => window.location.href = `${API}/download-zip/${selectedOrder}`} className="px-6 py-3 bg-white text-[#0B1120] rounded-full font-black uppercase tracking-widest text-[10px] hover:bg-[#009183] hover:text-white transition-all shadow-lg">Download ZIP</button>
                </div>

                {isLoadingGallery ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-8 h-8 border-4 border-[#009183]/30 border-t-[#009183] rounded-full animate-spin"></div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Loading Media...</p>
                    </div>
                ) : galleryImages.length === 0 ? (
                    <div className="text-center py-20 text-slate-500">No images or videos found for this project.</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pb-20">
                        {galleryImages.map((item) => (
                            <div key={item.name} className="group flex flex-col bg-[#0f172a] rounded-[2rem] p-4 border border-white/5 shadow-xl">
                                <div className="relative aspect-[3/2] rounded-[1.5rem] overflow-hidden bg-black mb-4 cursor-pointer" onClick={() => { if(item.type !== 'video') { setCompareData({raw: item.raw || item.url, edited: item.url}); setActiveModal('compare'); }}}>
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
                                <div className="flex justify-between items-center px-2">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{item.name}</span>
                                    <button onClick={() => handleDownloadSingle(item.url, item.name)} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full text-[9px] font-black uppercase tracking-widest transition-colors">Download</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}
      </main>

      {/* COMPARE MODAL */}
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
