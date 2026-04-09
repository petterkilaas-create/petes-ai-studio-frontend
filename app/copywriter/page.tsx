"use client";

import { useState, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import Autocomplete from "react-google-autocomplete";

type UploadedImage = { id: string; file: File; url: string };

export default function CopywriterPage() {
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States
  const [address, setAddress] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);

  // Handle Drag & Drop / File Selection
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

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleFileUpload(e.dataTransfer.files);
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  // Den EKTE funksjonen som snakker med backenden din
  const generateCopy = async () => {
    if (!address || images.length === 0) {
        alert("Du må legge inn både en adresse og minst ett bilde!");
        return;
    }
    
    setIsGenerating(true);
    setGeneratedText("");
    
    // Bygg en FormData for å sende adresse og filer til backenden
    const formData = new FormData();
    formData.append("address", address);
    images.forEach((img) => {
      formData.append("files", img.file);
    });

    try {
      const API_URL = "https://petes-ai-studio-backend-v2-32654019163.europe-north1.run.app";
      const response = await fetch(`${API_URL}/generate-copy/`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Feil i backend");
      
      const data = await response.json();
      setGeneratedText(data.copy); // Dytter den ekte teksten fra Gemini inn i editoren
    } catch (error) {
      setGeneratedText("Beklager, noe gikk galt under analysen av bildene. Sjekk at backenden kjører.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(generatedText);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col font-sans p-8">
      <div className="max-w-7xl mx-auto w-full">
        
        {/* HEADER */}
        <div className="mb-10 animate-in fade-in slide-in-from-top-4 duration-500">
          <h1 className="text-4xl font-black text-white uppercase tracking-widest flex items-center gap-4 mb-2">
            <span className="text-5xl">✍️</span> AI Copywriter
          </h1>
          <p className="text-slate-400 max-w-2xl text-sm leading-relaxed">
            Slipp skrivesperren. Last opp alle bildene fra boligen, bekreft adressen, og la AI-en vår analysere materialer og nabolag for å skrive et selgende Finn.no-prospekt på få sekunder.
          </p>
        </div>

        {/* MAIN TWO-COLUMN LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          
          {/* LEFT COLUMN: INPUT */}
          <div className="space-y-6 animate-in fade-in slide-in-from-left-8 duration-700">
            
            {/* Step 1: Address */}
            <div className="bg-[#0f172a] rounded-[2rem] p-8 border border-white/5 shadow-xl">
              <h2 className="text-xs font-black text-[#009183] uppercase tracking-widest mb-6">Trinn 1: Eiendommens Adresse</h2>
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
                placeholder="SØK ETTER ADRESSE HER..."
                className="w-full bg-[#0B1120] border border-slate-700 rounded-xl p-4 text-white font-bold uppercase text-sm outline-none focus:border-[#009183] transition-colors"
              />
              {address && (
                <div className="mt-4 p-4 bg-[#009183]/10 border border-[#009183]/30 rounded-xl">
                  <p className="text-[10px] text-[#00ff83] uppercase font-bold tracking-wider">📍 Valgt lokasjon:</p>
                  <p className="text-white font-black">{address}</p>
                </div>
              )}
            </div>

            {/* Step 2: Images */}
            <div className="bg-[#0f172a] rounded-[2rem] p-8 border border-white/5 shadow-xl">
              <div className="flex justify-between items-end mb-6">
                <h2 className="text-xs font-black text-[#009183] uppercase tracking-widest">Trinn 2: Bildegrunnlag</h2>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{images.length} BILDER VALGT</span>
              </div>

              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[150px] border-2 border-dashed border-slate-700 hover:border-[#009183] rounded-2xl flex flex-col items-center justify-center p-8 cursor-pointer bg-[#0B1120]/50 transition-colors group mb-6"
              >
                <span className="text-3xl mb-3 group-hover:scale-110 transition-transform">📸</span>
                <p className="text-slate-300 font-bold text-sm uppercase tracking-wider text-center">Klikk eller dra bilder hit</p>
                <p className="text-slate-500 text-[10px] uppercase tracking-widest mt-2 text-center">Last opp hele mappen for best resultat</p>
                <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => handleFileUpload(e.target.files)} />
              </div>

              {/* Image Grid Preview */}
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

            {/* Action Button */}
            <button 
              onClick={generateCopy}
              disabled={isGenerating || !address || images.length === 0}
              className="w-full py-5 bg-gradient-to-r from-[#009183] to-[#00b09f] hover:from-[#00b09f] hover:to-[#009183] text-white rounded-[2rem] font-black uppercase tracking-widest text-sm shadow-[0_0_30px_rgba(0,145,131,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-1"
            >
              ✨ Generer Boligprospekt
            </button>
          </div>

          {/* RIGHT COLUMN: OUTPUT / EDITOR */}
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
                  {copySuccess ? "✓ Kopiert!" : "📋 Kopier Tekst"}
                </button>
              )}
            </div>

            <div className="flex-1 p-8 bg-[#0B1120] m-4 rounded-2xl border border-white/5 overflow-y-auto">
              {isGenerating ? (
                <div className="h-full flex flex-col items-center justify-center space-y-6">
                  <div className="w-12 h-12 border-4 border-[#009183] border-t-transparent rounded-full animate-spin"></div>
                  <div className="text-center">
                    <p className="text-[#009183] font-black uppercase tracking-widest text-xs animate-pulse mb-2">Analyserer arkitektur...</p>
                    <p className="text-slate-500 text-[10px] uppercase tracking-widest">Henter lokaldata fra Entur & Google Maps</p>
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
                  <p className="text-white font-bold uppercase tracking-widest text-sm mb-2">Editor Venter</p>
                  <p className="text-slate-400 text-xs leading-relaxed">Fyll inn adresse og last opp bilder til venstre for å generere et unikt og skreddersydd boligprospekt.</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}