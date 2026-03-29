import type { Metadata } from "next";
import { Inter, Montserrat } from "next/font/google";
import { ClerkProvider, SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({ 
  subsets: ["latin"], 
  variable: "--font-inter",
  display: 'swap',
});

const montserrat = Montserrat({ 
  subsets: ["latin"], 
  weight: ['400', '700', '900'],
  variable: "--font-montserrat",
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Pete's AI Studio | Pro V6.0",
  description: "Enterprise Real Estate AI Studio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${montserrat.variable} font-sans flex flex-col h-screen`}>
        <ClerkProvider>
          
          {/* Innloggingsmeny plassert øverst til høyre over alt annet */}
          <header className="absolute top-6 right-8 z-[9999] flex gap-4">
            <Show when="signed-out">
              <div className="bg-[#009183] text-white px-4 py-2 rounded-lg font-bold text-xs uppercase hover:bg-[#00b09f] transition-colors cursor-pointer">
                <SignInButton />
              </div>
              <div className="bg-[#0f172a] text-slate-300 border border-slate-700 px-4 py-2 rounded-lg font-bold text-xs uppercase hover:text-white transition-colors cursor-pointer">
                <SignUpButton />
              </div>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </header>

          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
