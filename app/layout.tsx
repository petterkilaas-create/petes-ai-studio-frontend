import "./globals.css";
import { ClerkProvider, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="no">
        <body className="bg-[#0B1120] text-white">
          <header className="sticky top-0 z-[100] bg-[#0f172a]/80 backdrop-blur-md border-b border-white/5 px-8 py-4 flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-3 group">
                <div className="w-8 h-8 bg-[#0B1120] border border-[#009183]/50 rounded-lg flex items-center justify-center font-black text-[#009183] text-sm group-hover:bg-[#009183] group-hover:text-white transition-colors">P</div>
                <span className="font-black text-white uppercase tracking-widest hidden md:block text-xs">The Studio</span>
              </Link>
              <nav className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <Link href="/express" className="hover:text-[#009183] transition-colors">⚡ Express</Link>
                <Link href="/staging" className="hover:text-[#00ff83] transition-colors">🛋️ Staging</Link>
                <Link href="/video" className="hover:text-purple-400 transition-colors">🎬 Video</Link>
                <div className="w-px h-4 bg-slate-700"></div>
                <Link href="/orders" className="hover:text-white transition-colors">📁 Orders</Link>
              </nav>
            </div>
            <UserButton />
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
