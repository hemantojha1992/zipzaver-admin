import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: { default: "Zipzaver Admin Panel ", template: "%s | Zipzaver Admin Panel" }, description: "Operations administration for Zipzaver Ride" };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
