import "../styles/globals.css";

export const metadata = {
  title: "Optavia Plus — Coach CRM",
  description: "Your coaching business, simplified.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#faf7f2]">
        {children}
      </body>
    </html>
  );
}
