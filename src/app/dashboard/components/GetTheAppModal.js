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
    setAppUrl("https://optaviaplus.com");
    if (isAndroid()) setPlatform("android");
    else setPlatform("iphone");
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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
                Add OPTAVIA+ to Your Phone
              </h2>
              <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                It works just like an app from the App Store — right on your home screen!
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
                iPhone / iPad
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
            {platform === "iphone" ? (
              <div className="space-y-4 mb-5">
                <StepCard num={1}>
                  Open <strong>optaviaplus.com</strong> in <strong>Safari</strong>
                  <span className="block text-xs text-gray-400 mt-1">
                    (It must be Safari — this won&apos;t work in Chrome or other browsers on iPhone)
                  </span>
                </StepCard>
                <StepCard num={2}>
                  Tap the <strong>Share button</strong> at the bottom of the screen
                  <span className="block mt-2 text-center">
                    <span className="inline-block bg-blue-50 border-2 border-blue-200 rounded-xl px-4 py-2 text-2xl">
                      &#x2B06;&#xFE0F;
                    </span>
                  </span>
                  <span className="block text-xs text-gray-400 mt-1.5 text-center">
                    It&apos;s the square with an arrow pointing up
                  </span>
                </StepCard>
                <StepCard num={3}>
                  Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong>
                  <span className="block mt-2 text-center">
                    <span className="inline-block bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-2 text-sm font-semibold text-gray-700">
                      + Add to Home Screen
                    </span>
                  </span>
                </StepCard>
                <StepCard num={4}>
                  Tap <strong>&quot;Add&quot;</strong> in the top right corner
                  <span className="block text-xs text-green-600 font-semibold mt-1">
                    Done! You&apos;ll see the OPTAVIA+ icon on your home screen.
                  </span>
                </StepCard>
              </div>
            ) : (
              <div className="space-y-4 mb-5">
                <StepCard num={1}>
                  Open <strong>optaviaplus.com</strong> in <strong>Chrome</strong>
                </StepCard>
                <StepCard num={2}>
                  Tap the <strong>three dots</strong> in the top-right corner
                  <span className="block mt-2 text-center">
                    <span className="inline-block bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-2 text-2xl tracking-widest font-bold text-gray-600">
                      &#8942;
                    </span>
                  </span>
                  <span className="block text-xs text-gray-400 mt-1.5 text-center">
                    Three vertical dots at the top of Chrome
                  </span>
                </StepCard>
                <StepCard num={3}>
                  Tap <strong>&quot;Add to Home screen&quot;</strong> or <strong>&quot;Install app&quot;</strong>
                  <span className="block text-xs text-gray-400 mt-1">
                    (The wording depends on your phone — both do the same thing)
                  </span>
                </StepCard>
                <StepCard num={4}>
                  Tap <strong>&quot;Install&quot;</strong> or <strong>&quot;Add&quot;</strong>
                  <span className="block text-xs text-green-600 font-semibold mt-1">
                    Done! You&apos;ll see the OPTAVIA+ icon on your home screen.
                  </span>
                </StepCard>
              </div>
            )}

            {/* Copy URL box */}
            <div className="bg-[#faf7f2] rounded-xl p-3 mb-5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                Send this link to your phone
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 font-medium truncate">
                  optaviaplus.com
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

            {/* Got it */}
            <button
              onClick={handleClose}
              className="w-full py-3.5 bg-[#E8735A] hover:bg-[#d4634d] text-white rounded-xl text-base font-bold transition-all duration-150 active:scale-[0.98] min-h-[44px] touch-manipulation mb-2"
            >
              Got it!
            </button>

            {/* Maybe Later */}
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

function StepCard({ num, children }) {
  return (
    <div className="flex items-start gap-3 bg-gray-50 rounded-xl p-3.5">
      <div className="w-8 h-8 rounded-full bg-[#E8735A] text-white flex items-center justify-center text-base font-bold flex-shrink-0">
        {num}
      </div>
      <p className="font-body text-[15px] text-gray-700 leading-relaxed pt-0.5">
        {children}
      </p>
    </div>
  );
}
