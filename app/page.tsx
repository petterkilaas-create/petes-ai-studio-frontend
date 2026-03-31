"use client";

import { useState, useRef, useEffect } from "react";
import { useUser, UserButton } from "@clerk/nextjs";
import { supabase } from "../supabaseClient"; 

const API = "https://petes-ai-studio-backend-v2-32654019163.europe-north1.run.app";

type UploadedFile = { id: string; file: File; url: string; type: string; style: string; prompt: string; maskBlob: Blob | null; };
type StagingRoom = { id: string; style: string; hero_img_id: string | null; images: string[]; };

type GalleryImage = { 
  name: string; 
  url: string; 
  type: 'image' | 'video'; 
  raw?: string; 
  edited?: string; 
  approved?: boolean; 
  video?: string; 
};

type OrderArchive = { name: string; date: string; status: string; };

export default function Home() {
  const { user } = useUser();

  const [currentMode, setCurrentMode] = useState<'express' | 'staging'>('express');
  const [jobName, setJobName] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [stagingRooms, setStagingRooms] = useState<StagingRoom[]>([]);
  const [roomCounter, setRoomCounter] = useState(0);
  const [archiveOrders, setArchiveOrders] = useState<OrderArchive[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [globalType, setGlobalType] = useState("exterior");
  const [globalStyle, setGlobalStyle] = useState("dusk_blue_hour");

  const [isRendering, setIsRendering] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressStatus, setProgressStatus] = useState("Processing...");
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);

  const [activeModal, setActiveModal] = useState<'none' | 'mask' | 'retouch' | 'compare' | 'rerender' | 'video'>('none');
  const [currentCanvasImgId, setCurrentCanvasImgId] = useState("");
  const [brushSize, setBrushSize] = useState(50);
  const [retouchPrompt, setRetouchPrompt] = useState("");
  const [saveAsNew, setSaveAsNew] = useState(true);
  const [rerenderData, setRerenderData] = useState({ type: "exterior", style: "dusk_blue_hour", prompt: "" });
  const [compareData, setCompareData] = useState({ raw: "", edited: "" });
  
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
      .channel('realtime-projects')
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

    return () => {
        supabase.removeChannel(channel);
        if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [user]);

  useEffect(() => {
      const activeOrder = archiveOrders.find(o => o.name === jobName);
      if ((activeOrder?.status === 'completed' || activeOrder?.status === 'finished') && isRendering) {
          setIsRendering(false);
          if (pollTimer.current) clearTimeout(pollTimer.current);
          loadGallery(jobName);
      }
  }, [archiveOrders, jobName, isRendering]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (!jobName) setJobName(`JOB-${new Date().getTime().toString().slice(-4)}`);
    const newFiles: UploadedFile[] = [];
    for (let i = 0; i < e.target.files.length; i++) {
      if (e.target.files[i].type.startsWith("image/")) {
        newFiles.push({ id: "img_" + Math.random().toString(36).substr(2, 9), file: e.target.files[i], url: URL.createObjectURL(e.target.files[i]), type: globalType, style: globalStyle, prompt: "", maskBlob: null });
      }
    }
    setUploadedFiles(prev => [...prev, ...newFiles]);
    if (currentMode === 'staging' && stagingRooms.length === 0) addRoom();
  };

  const removeFile = (id: string) => { setUploadedFiles(prev => prev.filter(f => f.id !== id)); };
  const updateFileField = (id: string, field: keyof UploadedFile, value: any) => { setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f)); };
  const applyExpressAll = () => { setUploadedFiles(prev => prev.map(f => ({ ...f, type: globalType, style: globalStyle, prompt: "" }))); };
  
  const createNewJob = () => { 
      if (pollTimer.current) clearTimeout(pollTimer.current);
      setJobName(""); setUploadedFiles([]); setStagingRooms([]); setRoomCounter(0); setGalleryImages([]); setIsRendering(false); setProgressPct(0); setActiveModal('none'); 
  };

  const addRoom = () => { const newId = roomCounter + 1; setRoomCounter(newId); setStagingRooms(prev => [...prev, { id: `room_${newId}`, style: "staging_scandi", hero_img_id: null, images: [] }]); };
  const handleDragStart = (e: React.DragEvent<HTMLElement>, imgId: string) => { e.dataTransfer.setData("text/plain", imgId); e.dataTransfer.effectAllowed = "move"; (e.target as HTMLElement).style.opacity = "0.5"; };
  const handleDragEnd = (e: React.DragEvent<HTMLElement>) => { (e.target as HTMLElement).style.opacity = "1"; };
  const handleDragOver = (e: React.DragEvent<HTMLElement>) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; e.currentTarget.classList.add("dragover"); };
  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => { e.currentTarget.classList.remove("dragover"); };
  const handleDrop = (e: React.DragEvent<HTMLElement>, targetRoomId: string) => {
    e.preventDefault(); e.currentTarget.classList.remove("dragover");
    const imgId = e.dataTransfer.getData("text/plain"); if (!imgId) return;
    setStagingRooms(prev => {
        let updated = prev.map(room => {
            if (room.images.includes(imgId)) {
                const newImages = room.images.filter(id => id !== imgId);
                return { ...room, images: newImages, hero_img_id: room.hero_img_id === imgId ? (newImages[0] || null) : room.hero_img_id };
            } return room;
        });
        if (targetRoomId !== 'unassigned') {
            updated = updated.map(room => {
                if (room.id === targetRoomId && !room.images.includes(imgId)) {
                    return { ...room, images: [...room.images, imgId], hero_img_id: !room.hero_img_id ? imgId : room.hero_img_id };
                } return room;
            });
        }
        return updated;
    });
  };

  const setHero = (roomId: string, imgId: string) => { setStagingRooms(prev => prev.map(r => r.id === roomId ? { ...r, hero_img_id: imgId } : r)); };
  const updateRoomStyle = (roomId: string, newStyle: string) => { setStagingRooms(prev => prev.map(r => r.id === roomId ? { ...r, style: newStyle } : r)); };

  const deleteOrder = async (e: React.MouseEvent, orderName: string) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to permanently delete the project "${orderName}"?`)) return;
    if (user) { await supabase.from('projects').delete().eq('name', orderName).eq('user_id', user.id); }
    const fd = new FormData(); fd.append('job_name', orderName); fd.append('image_name', ''); 
    fetch(`${API}/delete-image/`, { method: 'POST', body: fd }).catch(console.error);
    if (jobName === orderName) createNewJob();
  };

  const renameOrder = async (e: React.MouseEvent, oldName: string) => {
    e.stopPropagation();
    const newNameRaw = window.prompt("Enter new project name:", oldName);
    if (!newNameRaw || newNameRaw === oldName) return;
    const newName = newNameRaw.replace(/ /g, "_");
    if (user) { await supabase.from('projects').update({ name: newName }).eq('name', oldName).eq('user_id', user.id); }
    const fd = new FormData(); fd.append('old_name', oldName); fd.append('new_name', newName);
    fetch(`${API}/rename-order/`, { method: 'POST', body: fd }).catch(console.error);
    if (jobName === oldName) { setJobName(newName); loadGallery(newName); }
  };

  const deleteSingleImage = async (imgName: string) => {
      if (!window.confirm("Are you sure you want to permanently delete this image?")) return;
      const fd = new FormData(); fd.append('job_name', jobName); fd.append('image_name', imgName);
      try {
          await fetch(`${API}/delete-image/`, { method: 'POST', body: fd });
          setGalleryImages(prev => prev.filter(img => img.name !== imgName));
      } catch (e) { console.error("Failed to delete image:", e); }
  };

  const openCanvasStudio = (imgIdOrName: string, mode: 'mask' | 'retouch', customUrl: string | null = null) => {
    setCurrentCanvasImgId(imgIdOrName); setActiveModal(mode); setBrushSize(50);
    let targetUrl = customUrl;
    if (!targetUrl) { const fileObj = uploadedFiles.find(f => f.id === imgIdOrName); if (fileObj) targetUrl = fileObj.url; }
    if (targetUrl) {
      const image = new Image(); image.crossOrigin = "Anonymous";
      image.onload = () => { bgImg.current = image; initCanvas(); };
      image.src = targetUrl;
    }
  };

  const initCanvas = () => {
    const canvas = canvasRef.current; const hiddenCanvas = hiddenMaskCanvasRef.current;
    if (!canvas || !hiddenCanvas || !bgImg.current) return;
    canvas.width = hiddenCanvas.width = bgImg.current.width; canvas.height = hiddenCanvas.height = bgImg.current.height;
    const hiddenCtx = hiddenCanvas.getContext('2d'); if (hiddenCtx) hiddenCtx.clearRect(0, 0, hiddenCanvas.width, hiddenCanvas.height);
    undoStack.current = []; saveCanvasState(); renderCanvas();
  };

  const saveCanvasState = () => {
    const hiddenCanvas = hiddenMaskCanvasRef.current; if (!hiddenCanvas) return;
    const ctx = hiddenCanvas.getContext('2d'); if (!ctx) return;
    if (undoStack.current.length > 50) undoStack.current.shift();
    undoStack.current.push(ctx.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height));
  };

  const undoCanvas = () => {
    const hiddenCanvas = hiddenMaskCanvasRef.current; if (!hiddenCanvas || undoStack.current.length <= 1) return;
    undoStack.current.pop(); const ctx = hiddenCanvas.getContext('2d');
    if (ctx) { ctx.putImageData(undoStack.current[undoStack.current.length - 1], 0, 0); renderCanvas(); }
  };

  const clearCanvas = () => {
    const hiddenCanvas = hiddenMaskCanvasRef.current; if (!hiddenCanvas) return;
    const ctx = hiddenCanvas.getContext('2d'); if (ctx) ctx.clearRect(0, 0, hiddenCanvas.width, hiddenCanvas.height);
    undoStack.current = []; saveCanvasState(); renderCanvas();
  };

  const renderCanvas = () => {
    const canvas = canvasRef.current; const hiddenCanvas = hiddenMaskCanvasRef.current;
    if (!canvas || !hiddenCanvas || !bgImg.current) return;
    const ctx = canvas.getContext('2d'); const hiddenCtx = hiddenCanvas.getContext('2d');
    if (!ctx || !hiddenCtx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bgImg.current, 0, 0, canvas.width, canvas.height);
    const tempCanvas = document.createElement('canvas'); tempCanvas.width = canvas.width; tempCanvas.height = canvas.height;
    const tCtx = tempCanvas.getContext('2d'); if (!tCtx) return;
    const imgData = hiddenCtx.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height);
    const overlayData = tCtx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < imgData.data.length; i += 4) {
      if (imgData.data[i + 3] > 10) {
        overlayData.data[i] = activeModal === 'mask' ? 0 : 239; overlayData.data[i + 1] = activeModal === 'mask' ? 255 : 68; overlayData.data[i + 2] = activeModal === 'mask' ? 131 : 68; overlayData.data[i + 3] = 120;
      }
    }
    tCtx.putImageData(overlayData, 0, 0); ctx.drawImage(tempCanvas, 0, 0);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => { 
    isDrawing.current = true; 
    const canvas = canvasRef.current; const hiddenCanvas = hiddenMaskCanvasRef.current;
    if (!canvas || !hiddenCanvas) return;
    const ctx = canvas.getContext('2d'); const hiddenCtx = hiddenCanvas.getContext('2d');
    if (!ctx || !hiddenCtx) return;
    const rect = canvas.getBoundingClientRect(); const x = (e.clientX - rect.left) * (canvas.width / rect.width); const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    ctx.beginPath(); ctx.moveTo(x, y); hiddenCtx.beginPath(); hiddenCtx.moveTo(x, y);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (cursorRef.current) { cursorRef.current.style.left = `${e.clientX}px`; cursorRef.current.style.top = `${e.clientY}px`; }
    if (isDrawing.current) drawOnCanvas(e);
  };
  
  const handleCanvasMouseUp = () => { if (isDrawing.current) { saveCanvasState(); isDrawing.current = false; renderCanvas(); } };

  const drawOnCanvas = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current; const hiddenCanvas = hiddenMaskCanvasRef.current;
    if (!canvas || !hiddenCanvas || !isDrawing.current) return;
    const ctx = canvas.getContext('2d'); const hiddenCtx = hiddenCanvas.getContext('2d');
    if (!ctx || !hiddenCtx) return;
    const rect = canvas.getBoundingClientRect(); const x = (e.clientX - rect.left) * (canvas.width / rect.width); const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    hiddenCtx.lineWidth = brushSize; hiddenCtx.lineCap = 'round'; hiddenCtx.lineJoin = 'round'; hiddenCtx.strokeStyle = 'rgba(255, 255, 255, 1.0)'; hiddenCtx.lineTo(x, y); hiddenCtx.stroke(); 
    ctx.lineWidth = brushSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = activeModal === 'mask' ? 'rgba(0, 255, 131, 0.4)' : 'rgba(239, 68, 68, 0.4)'; ctx.lineTo(x, y); ctx.stroke(); 
  };

  const saveFloorMask = () => {
    const canvas = canvasRef.current; const hiddenCanvas = hiddenMaskCanvasRef.current;
    if (!canvas || !hiddenCanvas) return;
    const apiCanvas = document.createElement('canvas'); apiCanvas.width = canvas.width; apiCanvas.height = canvas.height;
    const aCtx = apiCanvas.getContext('2d'); if (!aCtx) return;
    aCtx.fillStyle = 'black'; aCtx.fillRect(0, 0, apiCanvas.width, apiCanvas.height);
    const hiddenCtx = hiddenCanvas.getContext('2d'); if (!hiddenCtx) return;
    const maskData = hiddenCtx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < maskData.data.length; i += 4) { if (maskData.data[i + 3] > 10) { maskData.data[i] = 255; maskData.data[i + 1] = 255; maskData.data[i + 2] = 255; maskData.data[i + 3] = 255; } }
    aCtx.putImageData(maskData, 0, 0);
    apiCanvas.toBlob((b) => { setUploadedFiles(prev => prev.map(f => f.id === currentCanvasImgId ? { ...f, maskBlob: b } : f)); setActiveModal('none'); }, 'image/png');
  };

  const submitRetouch = async () => {
      if(!retouchPrompt) return;
      setActiveModal('none');
      setArchiveOrders(prev => prev.map(o => o.name === jobName ? { ...o, status: 'processing' } : o));
      if (user) await supabase.from('projects').update({ status: 'processing' }).eq('name', jobName).eq('user_id', user.id);
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
          const fd = new FormData(); fd.append('job_name', jobName); fd.append('image_name', currentCanvasImgId); fd.append('prompt', retouchPrompt); fd.append('mask_file', b, 'mask.png'); fd.append('save_new', saveAsNew.toString()); 
          try { await fetch(`${API}/execute-retouch/`, { method:'POST', body:fd }); pollProgress(jobName); } catch(e) { console.error(e); }
      }, 'image/png');
  };

  const handleDownloadSingle = async (url: string, filename: string) => {
      try {
          const response = await fetch(url); const blob = await response.blob(); const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a'); link.href = blobUrl; link.download = filename || 'file';
          document.body.appendChild(link); link.click(); document.body.removeChild(link); setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      } catch (error) { window.open(url, '_blank'); }
  };

  const startExpressRender = async () => {
    if (!jobName || uploadedFiles.length === 0) return;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    const safeJobName = jobName.replace(/ /g, "_"); setJobName(safeJobName);
    setIsRendering(true); setProgressPct(0); setProgressStatus("Uploading to cloud...");
    const fd = new FormData(); fd.append('job_name', safeJobName);
    const cfg: any = {}; uploadedFiles.forEach(f => { fd.append('files', f.file); cfg[f.file.name] = { type: f.type, style: f.style, prompt: f.prompt }; });
    fd.append('config', JSON.stringify(cfg));
    try { 
        await fetch(`${API}/start-job/`, { method: 'POST', body: fd }); 
        if (user) await supabase.from('projects').insert([{ name: safeJobName, user_id: user.id, status: 'processing' }]);
        pollProgress(safeJobName); 
    } catch (error) { console.error(error); }
  };

  const startStagingRender = async () => {
      if (!jobName) return;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      const safeJobName = jobName.replace(/ /g, "_"); setJobName(safeJobName);
      setIsRendering(true); setProgressPct(0); setProgressStatus("Analyzing Spatial Data...");
      const fd = new FormData(); fd.append('job_name', safeJobName);
      const cfg: any = {};
      stagingRooms.forEach(room => {
          room.images.forEach(imgId => {
              const f = uploadedFiles.find(x => x.id === imgId);
              if (f) { fd.append('files', f.file); if (f.maskBlob) fd.append('files', f.maskBlob, `MASK_${f.file.name}.png`); cfg[f.file.name] = { room_id: room.id, is_hero: room.hero_img_id === imgId, style: room.style }; }
          });
      });
      fd.append('config', JSON.stringify(cfg));
      try { 
          await fetch(`${API}/start-staging-job/`, { method: 'POST', body: fd }); 
          if (user) await supabase.from('projects').insert([{ name: safeJobName, user_id: user.id, status: 'processing' }]);
          pollProgress(safeJobName); 
      } catch (error) { console.error(error); }
  };

  const pollProgress = async (pollingJobName: string) => {
    try {
        const r = await fetch(`${API}/batch-progress/?job_name=${pollingJobName}`, { cache: 'no-store' }); 
        const s = await r.json();
        if (s.total > 0 && s.status !== 'finished') {
            setProgressPct((s.completed / s.total) * 100); 
            setProgressStatus(`Processing... ${s.completed} / ${s.total}`);
        }
    } catch (e) { console.error(e); }
    pollTimer.current = setTimeout(() => pollProgress(pollingJobName), 2000);
  };

  const viewOrder = async (name: string) => { 
      if (pollTimer.current) clearTimeout(pollTimer.current);
      setIsRendering(false); setJobName(name); setUploadedFiles([]); setStagingRooms([]); setGalleryImages([]); 
      loadGallery(name);
  };

  const loadGallery = async (name: string) => { 
      try { 
          const res = await fetch(`${API}/list-finished/?job_name=${name}`, { cache: 'no-store' }); 
          const data = await res.json(); 
          setGalleryImages(data.images); 
      } catch (e) { console.error(e); } 
  };

  const approveImage = async (imgName: string) => { const fd = new FormData(); fd.append('job_name', jobName); fd.append('image_name', imgName); await fetch(`${API}/approve-image/`, { method:'POST', body:fd }); loadGallery(jobName); };

  const submitRerender = async () => {
      setActiveModal('none');
      setArchiveOrders(prev => prev.map(o => o.name === jobName ? { ...o, status: 'processing' } : o));
      if (user) await supabase.from('projects').update({ status: 'processing' }).eq('name', jobName).eq('user_id', user.id);
      setIsRendering(true); setProgressPct(0); setProgressStatus("Initializing Re-Render...");
      const fd = new FormData(); fd.append('job_name', jobName); fd.append('image_name', currentCanvasImgId); fd.append('image_type', rerenderData.type); fd.append('style', rerenderData.style); fd.append('prompt', rerenderData.prompt);
      try { await fetch(`${API}/re-render-single/`, { method: 'POST', body: fd }); pollProgress(jobName); } catch(e) { console.error(e); }
  };

  const submitVideo = async () => {
      setActiveModal('none');
      setArchiveOrders(prev => prev.map(o => o.name === jobName ? { ...o, status: 'processing' } : o));
      if (user) await supabase.from('projects').update({ status: 'processing' }).eq('name', jobName).eq('user_id', user.id);
      setIsRendering(true); setProgressPct(0); setProgressStatus("Generating Cinematic Video Magic...");
      const fd = new FormData(); fd.append('job_name', jobName); fd.append('image_name', currentCanvasImgId); fd.append('prompt', videoPrompt);
      try { await fetch(`${API}/generate-video/`, { method: 'POST', body: fd }); pollProgress(jobName); } catch(e) { console.error(e); }
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

  const assignedImageIds = stagingRooms.flatMap(r => r.images);
  const unassignedFiles = uploadedFiles.filter(f => !assignedImageIds.includes(f.id));
  const filteredOrders = archiveOrders.filter(order => order.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <>
      <div ref={cursorRef} id="brushCursor" style={{ display: activeModal === 'mask' || activeModal === 'retouch' ? 'block' : 'none', width: brushSize, height: brushSize }} className="fixed border-2 border-[#00ff83]/80 rounded-full pointer-events-none z-[9999] -translate-x-1/2 -translate-y-1/2 bg-[#00ff83]/20 mix-blend-difference"></div>
      <canvas ref={hiddenMaskCanvasRef} style={{ display: 'none' }}></canvas>

      <header className="bg-[#0f172a] border-b border-white/5 px-8 py-4 flex justify-between items-center z-50">
        <div className="flex items-center gap-4 group cursor-pointer" onClick={() => window.location.reload()}>
          <div className="w-10 h-10 bg-[#0B1120] border border-[#009183]/30 rounded-xl flex items-center justify-center font-black text-[#009183] text-xl">P</div>
          <h1 className="text-lg font-black text-white montserrat tracking-widest uppercase">Pete&apos;s <span className="text-[#009183]">AI</span> Studio</h1>
        </div>
        <div className="flex bg-[#0B1120] p-1 rounded-xl border border-slate-700">
          <button onClick={() => setCurrentMode('express')} className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${currentMode === 'express' ? 'bg-[#009183] text-white' : 'text-slate-500 hover:text-white'}`}>⚡ Express</button>
          <button onClick={() => setCurrentMode('staging')} className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${currentMode === 'staging' ? 'bg-[#009183] text-white' : 'text-slate-500 hover:text-white'}`}>🛋️ Staging</button>
        </div>
        <div className="flex items-center gap-6">
            <UserButton appearance={{ elements: { userButtonAvatarBox: "w-10 h-10 border-2 border-[#009183]/50 hover:border-[#009183] transition-all" } }} />
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <aside className="w-80 bg-[#0f172a]/50 border-r border-white/5 flex flex-col p-6 z-10">
          <button onClick={createNewJob} className="w-full py-4 bg-[#009183] text-white font-black uppercase text-sm tracking-widest rounded-xl hover:bg-[#00b09f] mb-8 transition-colors">+ New Project</button>
          <div className="mb-4">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Archive</h2>
            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-[#0B1120] rounded-xl px-4 py-3 text-[10px] text-white outline-none border border-slate-700 focus:border-[#009183] placeholder-slate-600 uppercase tracking-widest font-bold" />
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {filteredOrders.map(order => (
                <div key={order.name} onClick={() => viewOrder(order.name)} className="cursor-pointer p-4 rounded-xl bg-[#0f172a]/50 hover:bg-[#1e293b] border border-white/5 hover:border-white/20 transition-all flex flex-col gap-3 group">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[11px] font-black text-slate-200 uppercase group-hover:text-[#009183] transition-colors">{order.name}</p>
                            <p className="text-[9px] text-slate-500 font-bold">{order.date}</p>
                        </div>
                        <button onClick={(e) => deleteOrder(e, order.name)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all" title="Delete Project">🗑️</button>
                    </div>
                </div>
            ))}
          </div>
        </aside>

        <section className="flex-1 overflow-y-auto p-12 bg-[#0B1120] relative">
            <div className="max-w-6xl mx-auto space-y-8">
                {uploadedFiles.length === 0 && galleryImages.length === 0 && (
                  <div className="glass p-16 border-2 border-dashed border-slate-700 flex flex-col items-center gap-8">
                      <input type="text" value={jobName} onChange={(e) => setJobName(e.target.value)} placeholder="PROJECT NAME" className="w-full max-w-lg text-center bg-transparent border-b-2 border-slate-700 text-4xl font-black montserrat text-white outline-none focus:border-[#009183] uppercase pb-3" />
                      <input type="file" multiple className="hidden" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} />
                      <button onClick={() => fileInputRef.current?.click()} className="px-12 py-4 bg-white text-[#0B1120] rounded-xl font-black uppercase text-xs cursor-pointer hover:bg-[#009183] hover:text-white transition-all">Upload Images</button>
                  </div>
                )}

                {uploadedFiles.length > 0 && currentMode === 'express' && !isRendering && galleryImages.length === 0 && (
                  <div className="space-y-8">
                      <div className="grid grid-cols-3 gap-6">
                        {uploadedFiles.map((file) => (
                          <div key={file.id} className="bg-[#0f172a] rounded-xl overflow-hidden border border-slate-700 relative flex flex-col">
                            <button onClick={() => removeFile(file.id)} className="absolute top-2 right-2 bg-red-500/80 text-white rounded-full w-6 h-6 flex items-center justify-center text-[10px] font-black z-10 hover:bg-red-600">X</button>
                            <img src={file.url} alt={`Upload ${file.id}`} className="aspect-[3/2] object-cover" />
                            <div className="p-3 flex flex-col gap-2">
                                <div className="flex gap-2">
                                    <select value={file.type} onChange={(e) => updateFileField(file.id, 'type', e.target.value)} className="w-1/2 bg-[#0B1120] text-slate-300 rounded-lg px-2 py-2 text-[9px] font-bold uppercase border border-slate-700 outline-none"><option value="exterior">Exterior</option><option value="interior">Interior</option><option value="drone">Drone</option></select>
                                    <select value={file.style} onChange={(e) => updateFileField(file.id, 'style', e.target.value)} className="w-1/2 bg-[#0B1120] text-slate-300 rounded-lg px-2 py-2 text-[9px] font-bold uppercase border border-slate-700 outline-none">
                                        <optgroup label="Lighting"><option value="weather_rain_to_sun">Rain to Sun</option><option value="sunny_midday">Sunny Midday</option><option value="dusk_blue_hour">Blue Hour</option><option value="dusk_purple_orange">Purple Dusk</option><option value="early_morning">Early Morning</option></optgroup>
                                        <optgroup label="Season"><option value="winter">Winter</option><option value="autumn">Autumn</option><option value="spring">Spring</option><option value="summer">Summer</option></optgroup>
                                        <optgroup label="Staging"><option value="staging_scandi">Scandi</option><option value="staging_luxury">Luxury</option><option value="staging_outdoor">Outdoor Lounge</option></optgroup>
                                    </select>
                                </div>
                                <input type="text" placeholder="Custom prompt..." value={file.prompt} onChange={(e) => updateFileField(file.id, 'prompt', e.target.value)} className="w-full bg-[#0B1120] rounded-lg px-3 py-2 text-[10px] text-white outline-none border border-slate-700 focus:border-[#009183]" />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-8 flex justify-between items-center bg-[#0f172a] p-6 rounded-2xl border border-white/5">
                          <div className="flex gap-4">
                              <select value={globalType} onChange={(e) => setGlobalType(e.target.value)} className="bg-[#0B1120] text-slate-300 rounded-xl px-4 py-3 text-[10px] font-bold uppercase border border-slate-700 outline-none"><option value="exterior">Exterior</option><option value="interior">Interior</option><option value="drone">Drone</option></select>
                              <select value={globalStyle} onChange={(e) => setGlobalStyle(e.target.value)} className="bg-[#0B1120] text-slate-300 rounded-xl px-4 py-3 text-[10px] font-bold uppercase border border-slate-700 outline-none"><option value="weather_rain_to_sun">Rain to Sun</option><option value="sunny_midday">Sunny Midday</option><option value="dusk_blue_hour">Blue Hour</option><option value="staging_scandi">Scandi Staging</option></select>
                              <button onClick={applyExpressAll} className="bg-slate-800 text-white px-6 rounded-xl text-[10px] font-black uppercase">Assign All</button>
                          </div>
                          <button onClick={startExpressRender} className="px-10 py-4 bg-[#009183] text-white font-black uppercase text-xs rounded-xl hover:bg-[#00b09f] shadow-[0_0_15px_rgba(0,145,131,0.3)]">Start Render</button>
                      </div>
                  </div>
                )}

                {uploadedFiles.length > 0 && currentMode === 'staging' && !isRendering && galleryImages.length === 0 && (
                  <div className="glass p-8 bg-[#0f172a]/50 border border-[#009183]/30">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="font-bold uppercase text-xs tracking-widest text-[#009183]">Spatial Staging</h2>
                        <button onClick={addRoom} className="px-4 py-2 border border-[#009183] text-[#009183] text-[10px] font-black uppercase rounded-lg">+ Add Room</button>
                    </div>
                    <div className="flex gap-8">
                        <div className="w-1/3 bg-[#0B1120] p-4 rounded-xl border border-slate-800">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Unassigned</h3>
                            <div className="flex flex-wrap gap-2 p-2 min-h-[150px]" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, 'unassigned')}>
                                {unassignedFiles.map(file => (
                                    <img key={file.id} src={file.url} alt={`Unassigned ${file.id}`} draggable onDragStart={(e) => handleDragStart(e, file.id)} onDragEnd={handleDragEnd} className="w-20 h-20 object-cover rounded-lg border border-slate-700" />
                                ))}
                            </div>
                        </div>
                        <div className="w-2/3 space-y-6">
                            {stagingRooms.map((room, index) => (
                                <div key={room.id} className="bg-[#0B1120] p-5 rounded-xl border border-slate-800" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, room.id)}>
                                    <div className="flex justify-between items-center mb-4"><h3 className="text-[10px] font-black text-white uppercase tracking-widest">Room {index + 1}</h3><select value={room.style} onChange={(e) => updateRoomStyle(room.id, e.target.value)} className="bg-[#0f172a] text-slate-300 rounded px-2 py-1 text-[9px] font-bold uppercase border border-slate-700 outline-none"><option value="staging_scandi">Scandi</option><option value="staging_luxury">Luxury</option></select></div>
                                    <div className="flex flex-wrap gap-4 p-4 min-h-[150px]">
                                        {room.images.map(imgId => {
                                            const file = uploadedFiles.find(f => f.id === imgId);
                                            if (!file) return null;
                                            const isHero = room.hero_img_id === imgId;
                                            return (
                                                <div key={file.id} className="relative w-24 h-24 group">
                                                    <img src={file.url} alt={`Staging ${file.id}`} draggable onDragStart={(e) => handleDragStart(e, file.id)} className={`w-full h-full object-cover rounded-lg border-2 ${isHero ? 'border-yellow-400' : 'border-slate-700'}`} />
                                                    <div onClick={() => openCanvasStudio(file.id, 'mask')} className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-lg cursor-pointer transition-opacity"><span className="text-white text-[8px] font-black uppercase border border-white px-2 py-1 rounded">🖌️ Mask</span></div>
                                                    <div onClick={() => setHero(room.id, file.id)} className={`absolute -top-2 -left-2 text-2xl z-20 cursor-pointer ${isHero ? '' : 'grayscale'}`}>⭐️</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="mt-8 flex justify-end"><button onClick={startStagingRender} className="px-10 py-4 bg-[#009183] text-white font-black uppercase text-xs rounded-xl">Start Staging</button></div>
                  </div>
                )}

                {isRendering && activeModal === 'none' && (
                  <div className="glass p-16 text-center space-y-8 animate-in fade-in duration-500 mb-8">
                      <p className="font-black montserrat uppercase tracking-[0.3em] text-sm text-[#009183] animate-pulse">{progressStatus}</p>
                      <div className="w-full max-w-2xl mx-auto bg-[#0B1120] h-4 rounded-full overflow-hidden p-1 border border-white/10"><div className="bg-gradient-to-r from-[#009183] to-[#00b09f] h-full rounded-full transition-all duration-700" style={{ width: `${progressPct}%` }}></div></div>
                  </div>
                )}

                {galleryImages.length > 0 && (
                    <div className="animate-in fade-in slide-in-from-bottom-10 duration-500">
                        <div className="flex justify-between items-end border-b border-white/10 pb-6 mb-10">
                            <div className="flex items-center gap-4">
                                <h3 className="text-4xl font-black text-white montserrat uppercase">{jobName}</h3>
                                <button onClick={(e) => renameOrder(e, jobName)} className="text-slate-500 hover:text-white text-xl transition-colors pb-1" title="Rename Project">✏️</button>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={(e) => deleteOrder(e, jobName)} className="px-6 py-3 bg-red-950/30 text-red-400 border border-red-900/50 rounded-xl font-black uppercase text-[10px] hover:bg-red-600 hover:text-white transition-colors">Delete Project</button>
                                <button onClick={() => window.location.href = `${API}/download-zip/${jobName}`} className="px-6 py-3 bg-white text-[#0B1120] rounded-xl font-black uppercase text-[10px] hover:bg-[#009183] hover:text-white transition-colors">Export ZIP</button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-10 pb-20">
                            {galleryImages.map((item) => (
                                <div key={item.name} className="group space-y-3">
                                    <div className="relative aspect-[3/2] rounded-[1.5rem] overflow-hidden bg-[#0f172a] shadow-2xl border border-white/5 cursor-pointer hover:scale-[1.02] transition-all duration-300">
                                        <button onClick={(e) => { e.stopPropagation(); deleteSingleImage(item.name); }} className="absolute top-4 right-4 bg-red-950/80 text-red-400 hover:text-white rounded-full w-8 h-8 flex items-center justify-center text-xs font-black z-30 opacity-0 group-hover:opacity-100 transition-all shadow-lg border border-red-900/50">🗑️</button>
                                        {item.type === 'video' ? (
                                            <>
                                                <video src={item.url} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover z-10" />
                                                <div className="absolute top-4 left-4 bg-purple-600 text-white text-[9px] font-black px-3 py-1.5 rounded shadow-lg z-30 uppercase tracking-widest border border-purple-400/50">🎬 Cinematic Video</div>
                                            </>
                                        ) : (
                                            <div onClick={() => { setCompareData({raw: item.raw || item.url, edited: item.url}); setActiveModal('compare'); }}>
                                                <img src={item.url} className="w-full h-full object-cover" alt={`Render ${item.name}`} />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 flex items-center justify-center pointer-events-none z-20"><span className="opacity-0 group-hover:opacity-100 text-white font-bold bg-black/50 px-4 py-2 rounded-full transition-opacity backdrop-blur-sm">Click to Compare</span></div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        {item.type === 'image' && (
                                            <>
                                                {item.approved ? <div className="flex-1 py-3 bg-[#009183]/20 text-[#00b09f] font-black uppercase text-[10px] text-center rounded-xl border border-[#009183]/30">Approved</div> : <><button onClick={() => approveImage(item.name)} className="flex-1 py-3 bg-[#009183] text-white font-black uppercase text-[10px] rounded-xl hover:bg-[#00b09f] transition-all">Approve 4K</button><button onClick={() => openCanvasStudio(item.name, 'retouch', item.url)} className="flex-1 py-3 bg-[#0f172a] border border-slate-700 text-slate-300 font-black uppercase text-[10px] rounded-xl hover:bg-slate-800 transition-colors">Retouch</button></>}
                                            </>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleDownloadSingle(item.url, item.name)} className="flex-1 py-2.5 bg-[#0B1120] border border-slate-800 text-slate-400 font-bold uppercase text-[9px] rounded-xl hover:bg-slate-800 hover:text-white transition-colors">Download {item.type}</button>
                                        {item.type === 'image' && <button onClick={() => { setCurrentCanvasImgId(item.name); setActiveModal('rerender'); }} className="flex-1 py-2.5 bg-[#0B1120] border border-slate-800 text-slate-400 font-bold uppercase text-[9px] rounded-xl hover:bg-slate-800 hover:text-white transition-colors">Re-Render</button>}
                                    </div>
                                    {item.type === 'image' && (
                                        <div className="flex mt-1"><button onClick={() => { setCurrentCanvasImgId(item.name); setActiveModal('video'); }} className="flex-1 py-3 bg-purple-900/30 border border-purple-700/50 text-purple-400 font-black uppercase text-[10px] rounded-xl hover:bg-purple-800 hover:text-white shadow-[0_0_15px_rgba(147,51,234,0.15)] transition-all">🎬 Animate with Veo AI</button></div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </section>
      </main>

      {/* --- ALL MODALS --- */}
      {(activeModal === 'mask' || activeModal === 'retouch') && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center gap-6">
            <div className="flex justify-between items-center w-[85vw] max-w-[1100px]"><h2 className="text-2xl font-black text-white uppercase montserrat tracking-widest text-[#009183]">{activeModal === 'mask' ? 'Paint Floor Area' : 'Retouch Studio'}</h2><button onClick={() => setActiveModal('none')} className="text-slate-400 font-bold uppercase text-xs hover:text-white transition-colors">Close</button></div>
            <div className="relative w-[85vw] max-w-[1100px] aspect-[3/2] bg-black border border-white/10 rounded-3xl overflow-hidden shadow-2xl" onMouseMove={handleCanvasMouseMove} onMouseDown={handleCanvasMouseDown} onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp}><canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-10 cursor-none"></canvas></div>
            <div className="w-[85vw] max-w-[1100px] flex gap-5 bg-[#0f172a] p-4 rounded-2xl items-center shadow-2xl border border-white/10">
                <div className="flex flex-col gap-1 w-40 pl-2"><label className="text-slate-400 text-[9px] font-bold uppercase tracking-widest">Brush: <span className="text-white">{brushSize}</span>px</label><input type="range" min="5" max="200" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="accent-[#009183] cursor-pointer" /></div>
                <div className="w-px h-8 bg-slate-700 mx-2"></div>
                <button onClick={undoCanvas} className="px-5 py-3 bg-[#0B1120] border border-slate-700 text-white font-bold text-xs rounded-xl">Undo</button>
                <button onClick={clearCanvas} className="px-5 py-3 bg-red-900/20 text-red-400 font-bold text-xs rounded-xl border border-red-900/50">Reset</button>
                {activeModal === 'mask' ? (
                  <>
                    <div className="flex-1 text-center text-slate-400 text-[10px] font-bold uppercase tracking-widest">Only green areas will receive furniture</div>
                    <button onClick={saveFloorMask} className="px-8 py-3 bg-[#009183] text-white font-black uppercase text-xs rounded-xl">Save Mask</button>
                  </>
                ) : (
                  <>
                    <label className="flex items-center gap-2 text-slate-300 text-xs font-bold cursor-pointer ml-auto mr-4"><input type="checkbox" checked={saveAsNew} onChange={(e) => setSaveAsNew(e.target.checked)} className="w-4 h-4 accent-[#009183]" /> Save as new</label>
                    <input type="text" value={retouchPrompt} onChange={(e) => setRetouchPrompt(e.target.value)} placeholder="Instruction..." className="flex-1 max-w-sm bg-[#0B1120] rounded-xl p-3 text-sm text-white outline-none border border-slate-700 focus:border-[#009183]" />
                    <button onClick={submitRetouch} className="px-8 py-3 bg-[#009183] text-white font-black uppercase text-xs rounded-xl">Execute</button>
                  </>
                )}
            </div>
        </div>
      )}

      {activeModal === 'video' && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center gap-6">
            <div className="bg-[#0f172a] rounded-3xl p-8 shadow-2xl border border-purple-500/30 w-[500px]">
                <div className="flex justify-between items-center mb-8"><h2 className="text-xl font-black text-white uppercase montserrat tracking-wider text-purple-400">🎬 Video Magic</h2><button onClick={() => setActiveModal('none')} className="text-slate-500 hover:text-white font-bold uppercase text-xs">Cancel</button></div>
                <div className="space-y-6">
                    <div><label className="text-[10px] font-bold text-purple-300 uppercase tracking-widest mb-3 block">Director's Prompt</label><textarea rows={3} value={videoPrompt} onChange={(e) => setVideoPrompt(e.target.value)} className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-4 text-white text-sm outline-none focus:border-purple-500 transition-colors resize-none" /></div>
                    <div className="text-xs text-slate-400 italic">Highly realistic 8-second cinematic camera movement.</div>
                    <button onClick={submitVideo} className="w-full py-4 mt-4 bg-purple-600 text-white font-black uppercase text-xs rounded-xl shadow-[0_0_20px_rgba(147,51,234,0.4)]">Action! 🎬</button>
                </div>
            </div>
        </div>
      )}

      {activeModal === 'rerender' && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center gap-6">
            <div className="bg-[#0f172a] rounded-3xl p-8 shadow-2xl border border-white/10 w-[500px]">
                <div className="flex justify-between items-center mb-8"><h2 className="text-xl font-black text-white uppercase montserrat tracking-wider">Re-Render</h2><button onClick={() => setActiveModal('none')} className="text-slate-500 hover:text-white font-bold uppercase text-xs">Cancel</button></div>
                <div className="space-y-6">
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">Image Type</label><select value={rerenderData.type} onChange={(e) => setRerenderData({...rerenderData, type: e.target.value})} className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-4 text-white font-bold uppercase text-xs outline-none focus:border-[#009183]"><option value="exterior">Exterior</option><option value="interior">Interior</option><option value="drone">Drone</option></select></div>
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">New Style</label><select value={rerenderData.style} onChange={(e) => setRerenderData({...rerenderData, style: e.target.value})} className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-4 text-white font-bold uppercase text-xs outline-none focus:border-[#009183]"><optgroup label="Lighting"><option value="weather_rain_to_sun">Rain to Sun</option><option value="dusk_blue_hour">Blue Hour</option></optgroup><optgroup label="Staging"><option value="staging_scandi">Scandi</option></optgroup></select></div>
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
    </>
  );
}