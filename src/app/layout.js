import "../styles/globals.css";
import RegisterSW from "./register-sw";

export const metadata = {
  title: "Optavia Plus — Coach CRM",
  description: "Your coaching business, simplified.",
  manifest: "/manifest.json",
  themeColor: "#e8927c",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "OPTAVIA+",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  },
  icons: {
    apple: "/icons/icon-192x192.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#faf7f2]">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
