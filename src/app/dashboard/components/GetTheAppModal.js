"use client";

import { useState, useEffect } from "react";

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isAndroid() {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

export default function GetTheAppModal({ onClose }) {
  const [dontShow, setDontShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [appUrl, setAppUrl] = useState("");
  const [platform, setPlatform] = useState("iphone"); // iphone | android

  useEffect(() => {
    setAppUrl(window.location.origin + "/dashboard");
    if (isAndroid()) setPlatform("android");
    else setPlatform("iphone");
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = appUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    if (dontShow) {
      localStorage.setItem("hideGetTheApp", "true");
    }
    onClose();
  };

  const iphoneSteps = [
    { num: 1, text: "Open this link on your iPhone (copy it below)" },
    { num: 2, text: <>Tap the <strong>Share</strong> button <span className="inline-block text-lg align-middle">⬆️</span> at the bottom of Safari</> },
    { num: 3, text: <>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong></> },
    { num: 4, text: <>Tap <strong>&quot;Add&quot;</strong> — that&apos;s it!</> },
  ];

  const androidSteps = [
    { num: 1, text: "Open this link on your phone (copy it below)" },
    { num: 2, text: <>Tap the <strong>three-dot menu</strong> <span className="inline-block text-lg align-middle">⋮</span> in Chrome</> },
    { num: 3, text: <>Tap <strong>&quot;Add to Home Screen&quot;</strong> or <strong>&quot;Install App&quot;</strong></> },
    { num: 4, text: <>Tap <strong>&quot;Add&quot;</strong> — done!</> },
  ];

  const steps = platform === "android" ? androidSteps : iphoneSteps;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={handleClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6">
            {/* Header */}
            <div className="text-center mb-5">
              <div className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center text-3xl" style={{ background: "linear-gradient(135deg, #e8927c, #d4735d)" }}>
                <span className="text-white font-bold text-xl">O+</span>
              </div>
              <h2 className="font-display text-xl font-bold text-gray-900">
                Get OPTAVIA+ on your phone!
              </h2>
              <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                Access your clients, leads, and calendar right from your home screen — just like a real app.
              </p>
            </div>

            {/* Platform toggle */}
            <div className="flex bg-gray-100 rounded-xl p-0.5 mb-5">
              <button
                onClick={() => setPlatform("iphone")}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition min-h-[44px] touch-manipulation ${
                  platform === "iphone"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                iPhone
              </button>
              <button
                onClick={() => setPlatform("android")}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition min-h-[44px] touch-manipulation ${
                  platform === "android"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Android
              </button>
            </div>

            {/* Steps */}
            <div className="space-y-3 mb-5">
              {steps.map((step) => (
                <div key={step.num} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#E8735A] text-white flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                    {step.num}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed pt-0.5">
                    {step.text}
                  </p>
                </div>
              ))}
            </div>

            {/* Copy URL box */}
            <div className="bg-[#faf7f2] rounded-xl p-3 mb-5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Your app link</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 font-medium truncate">
                  {appUrl}
                </div>
                <button
                  onClick={handleCopy}
                  className="flex-shrink-0 px-4 py-2.5 bg-[#E8735A] hover:bg-[#d4634d] text-white rounded-xl text-sm font-bold transition-all duration-150 active:scale-95 min-h-[44px] min-w-[44px] touch-manipulation"
                >
                  {copied ? "Copied!" : "Copy Link"}
                </button>
              </div>
            </div>

            {/* Don't show again */}
            <label className="flex items-center gap-2.5 cursor-pointer mb-4 touch-manipulation">
              <input
                type="checkbox"
                checked={dontShow}
                onChange={(e) => setDontShow(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-[#E8735A] focus:ring-[#E8735A]/30"
              />
              <span className="text-sm text-gray-500">Don&apos;t show this again</span>
            </label>

            {/* Close */}
            <button
              onClick={handleClose}
              className="w-full text-center py-3 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors min-h-[44px] touch-manipulation"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
