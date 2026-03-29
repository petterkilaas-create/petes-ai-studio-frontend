import type { Metadata } from "next";
import { Inter, Montserrat } from "next/font/google";
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
        {children}
      </body>
    </html>
  );
}