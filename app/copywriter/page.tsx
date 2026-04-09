"use client";

import { useState, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import Autocomplete from "react-google-autocomplete";

type UploadedImage = { id: string; file: File; url: string };

export default function CopywriterPage() {
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [address, setAddress] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);

  // --- NEW: COMPRESSION HELPER ---
 const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          // Vi går ned til 1000px for å være helt trygge på 32MB-grensen
          const MAX_WIDTH = 1000; 
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Vi senker kvaliteten til 0.5 (50%) for å spare masse plass
          canvas.toBlob((blob) => {
            resolve(blob as Blob);
          }, "image/jpeg", 0.5); 
        };
      };
    });
  };

  const handleFileUpload = (files: FileList | null) => {
    if (!files) return;
    const newImages: UploadedImage[] = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith("image/")) {
        newImages.push({
          id: Math.random().toString(36).substring(2, 9),
          file: files[i],
          url: URL.createObjectURL(files[i]),
        });
      }
    }
    setImages((prev) => [...prev, ...newImages]);
  };

  const generateCopy = async () => {
    if (!address || images.length === 0) {
      alert("Please provide both an address and at least one image!");
      return;
    }

    setIsGenerating(true);
    setGeneratedText("");

    const formData = new FormData();
    formData.append("address", address);

    try {
      // Compress all images in parallel before sending
      const compressedBlobs = await Promise.all(
        images.map((img) => compressImage(img.file))
      );

      compressedBlobs.forEach((blob, index) => {
        formData.append("files", blob, `image_${index}.jpg`);
      });

      const API_URL = "https://petes-ai-studio-backend-v2-32654019163.europe-north1.run.app";
      const response = await fetch(`${API_URL}/generate-copy/`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.status === "error") {
        setGeneratedText(`🚨 BACKEND ERROR:\n\n${data.message}\n\nTechnical Trace:\n${data.trace}`);
        return;
      }

      setGeneratedText(data.copy);
    } catch (error) {
      setGeneratedText(`Connection Error! Request was likely too large or timed out. Try uploading slightly fewer images. Error: ${error}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // ... (rest of the functions: handleDrop, removeImage, handleCopyText stay the same)
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleFileUpload(e.dataTransfer.files);
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(generatedText);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col font-sans p-8">
      <div className="max-w-7xl mx-auto w-full">
        <div className="mb-10 animate-in fade-in slide-in-from-top-4 duration-500">
          <h1 className="text-4xl font-black text-white uppercase tracking-widest flex items-center gap-4 mb-2">
            <span className="text-5xl">✍️</span> AI Copywriter
          </h1>
          <p className="text-slate-400 max-w-2xl text-sm leading-relaxed">
            Eliminate writer's block. Upload property photos, confirm the address, and let our AI analyze materials and location to write a compelling real estate listing in seconds.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="space-y-6 animate-in fade-in slide-in-from-left-8 duration-700">
            <div className="bg-[#0f172a] rounded-[2rem] p-8 border border-white/5 shadow-xl">
              <h2 className="text-xs font-black text-[#009183] uppercase tracking-widest mb-6">Step 1: Property Address</h2>
              <Autocomplete
                apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
                onPlaceSelected={(place) => {
                  if (place && place.formatted_address) {
                    setAddress(place.formatted_address);
                  }
                }}
                options={{
                  types: ["address"],
                  componentRestrictions: { country: "no" },
                }}
                placeholder="SEARCH FOR ADDRESS HERE..."
                className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-4 text-white font-bold uppercase text-sm outline-none focus:border-[#009183] transition-colors"
              />
              {address && (
                <div className="mt-4 p-4 bg-[#009183]/10 border border-[#009183]/30 rounded-xl">
                  <p className="text-[10px] text-[#00ff83] uppercase font-bold tracking-wider">📍 Selected Location:</p>
                  <p className="text-white font-black">{address}</p>
                </div>
              )}
            </div>

            <div className="bg-[#0f172a] rounded-[2rem] p-8 border border-white/5 shadow-xl">
              <div className="flex justify-between items-end mb-6">
                <h2 className="text-xs font-black text-[#009183] uppercase tracking-widest">Step 2: Visual Context</h2>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{images.length} IMAGES SELECTED</span>
              </div>

              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[150px] border-2 border-dashed border-slate-700 hover:border-[#009183] rounded-2xl flex flex-col items-center justify-center p-8 cursor-pointer bg-[#0B1120]/50 transition-colors group mb-6"
              >
                <span className="text-3xl mb-3 group-hover:scale-110 transition-transform">📸</span>
                <p className="text-slate-300 font-bold text-sm uppercase tracking-wider text-center">Click or drag images here</p>
                <p className="text-slate-500 text-[10px] uppercase tracking-widest mt-2 text-center">Upload the full gallery for best results</p>
                <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => handleFileUpload(e.target.files)} />
              </div>

              {images.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {images.map((img) => (
                    <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden border border-slate-700 group">
                      <img src={img.url} alt="upload" className="w-full h-full object-cover" />
                      <button onClick={(e) => { e.stopPropagation(); removeImage(img.id); }} className="absolute top-1 right-1 bg-red-500/80 text-white w-5 h-5 rounded-full text-[8px] font-black opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">X</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button 
              onClick={generateCopy}
              disabled={isGenerating || !address || images.length === 0}
              className="w-full py-5 bg-gradient-to-r from-[#009183] to-[#00b09f] hover:from-[#00b09f] hover:to-[#009183] text-white rounded-[2rem] font-black uppercase tracking-widest text-sm shadow-[0_0_30px_rgba(0,145,131,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-1"
            >
              {isGenerating ? "Compressing & Analyzing..." : "✨ Generate Listing Copy"}
            </button>
          </div>

          <div className="bg-[#0f172a] rounded-[2rem] border border-white/5 shadow-xl flex flex-col h-[800px] animate-in fade-in slide-in-from-right-8 duration-700">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#1e293b]/50 rounded-t-[2rem]">
              <h2 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                <span className="text-[#00ff83] animate-pulse">●</span> AI Editor
              </h2>
              {generatedText && (
                <button 
                  onClick={handleCopyText}
                  className="px-6 py-2 bg-[#009183] text-white text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-[#00b09f] transition-colors"
                >
                  {copySuccess ? "✓ Copied!" : "📋 Copy Text"}
                </button>
              )}
            </div>

            <div className="flex-1 p-8 bg-[#0B1120] m-4 rounded-2xl border border-white/5 overflow-y-auto">
              {isGenerating ? (
                <div className="h-full flex flex-col items-center justify-center space-y-6">
                  <div className="w-12 h-12 border-4 border-[#009183] border-t-transparent rounded-full animate-spin"></div>
                  <div className="text-center">
                    <p className="text-[#009183] font-black uppercase tracking-widest text-xs animate-pulse mb-2">Analyzing Architecture...</p>
                    <p className="text-slate-500 text-[10px] uppercase tracking-widest">Resizing images for analysis & gathering insights</p>
                  </div>
                </div>
              ) : generatedText ? (
                <textarea 
                  value={generatedText}
                  onChange={(e) => setGeneratedText(e.target.value)}
                  className="w-full h-full bg-transparent text-slate-300 outline-none resize-none font-serif text-lg leading-relaxed whitespace-pre-wrap custom-scrollbar"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-10">
                  <span className="text-6xl mb-6">📄</span>
                  <p className="text-white font-bold uppercase tracking-widest text-sm mb-2">Editor Ready</p>
                  <p className="text-slate-400 text-xs leading-relaxed">Enter an address and upload photos to generate a unique, tailored property description.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}