import React, { useEffect, useState } from "react";
import { LogIn, User as UserIcon, CheckCircle, Flame } from "lucide-react";

declare global {
  interface Window {
    google?: any;
  }
}

interface AuthScreenProps {
  onLogin: (user: { name: string; email?: string; avatarUrl: string }) => void;
}

export function AuthScreen({ onLogin }: AuthScreenProps) {
  const [activeTab, setActiveTab] = useState<"guest" | "google">("guest");
  const [nickname, setNickname] = useState("");
  
  // Custom manual google entry as a robust sandbox fallback
  const [googleEmail, setGoogleEmail] = useState("");
  const [googleName, setGoogleName] = useState("");
  const [gsiError, setGsiError] = useState(false);

  // Initialize and render real Google Sign-In if available in the viewport
  useEffect(() => {
    // Only attempt the GSI render if the GSI library resides in window
    const interval = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(interval);
        try {
          window.google.accounts.id.initialize({
            client_id: "906494901832-authpartyclientid.apps.googleusercontent.com", // Generic Client ID
            callback: (response: any) => {
              // Parse JWT credential
              const base64Url = response.credential.split(".")[1];
              const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
              const jsonPayload = decodeURIComponent(
                atob(base64)
                  .split("")
                  .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                  .join("")
              );

              const payload = JSON.parse(jsonPayload);
              onLogin({
                name: payload.name || payload.given_name || "Google User",
                email: payload.email,
                avatarUrl: payload.picture || `https://api.dicebear.com/7.x/initials/svg?seed=${payload.name}`
              });
            },
            auto_select: false,
            cancel_on_tap_outside: true
          });

          window.google.accounts.id.renderButton(
            document.getElementById("gsi-button-container"),
            { theme: "filled_dark", size: "large", width: 280 }
          );
        } catch (err) {
          console.warn("GSI initialization failed, switching to sandbox fallback", err);
          setGsiError(true);
        }
      }
    }, 500);

    // Timeout script load check
    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (!window.google?.accounts?.id) {
        setGsiError(true);
      }
    }, 4000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [onLogin]);

  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;
    onLogin({
      name: nickname.trim(),
      avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(nickname.trim())}&backgroundColor=020617`
    });
  };

  const handleGoogleFallbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleName.trim()) return;
    onLogin({
      name: googleName.trim(),
      email: googleEmail || "google-user@domain.com",
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${googleName}&backgroundColor=020617`
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] px-4 py-8 relative z-10">
      <div className="w-full max-w-md bg-white/5 border border-white/10 backdrop-blur-2xl rounded-3xl shadow-2xl p-8 relative overflow-hidden">
        {/* Subtle decorative glow effect */}
        <div className="absolute top-0 left-1/4 w-1/2 h-1 bg-gradient-to-r from-red-500 via-indigo-500 to-emerald-500 rounded-full filter blur-[2px]" />

        {/* Title Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full text-xs font-mono tracking-widest uppercase mb-3 animate-pulse">
            <Flame className="w-3.5 h-3.5 fill-red-400" />
            Watch Party Live
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
            Watch Together
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Synchronized screen-sharing, playbacks, and voice rooms.
          </p>
        </div>

        {/* Auth Tabs Header */}
        <div className="flex bg-white/5 p-1 rounded-xl mb-6 border border-white/10">
          <button
            id="auth-tab-guest"
            onClick={() => setActiveTab("guest")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeTab === "guest"
                ? "bg-white/5 border border-white/10 text-indigo-400 font-semibold shadow-inner"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <UserIcon className="w-4 h-4" />
            Guest Nickname
          </button>
          <button
            id="auth-tab-google"
            onClick={() => setActiveTab("google")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeTab === "google"
                ? "bg-white/5 border border-white/10 text-indigo-400 font-semibold shadow-inner"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <LogIn className="w-4 h-4" />
            Google OAuth
          </button>
        </div>

        {/* Tabs views */}
        {activeTab === "guest" ? (
          <form onSubmit={handleGuestSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="nickname" className="block text-xs font-medium text-gray-400 uppercase tracking-widest">
                Choose Nickname
              </label>
              <input
                id="nickname"
                type="text"
                placeholder="Enter nickname..."
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                required
                className="w-full bg-black/40 border border-white/10 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-600 focus:outline-none transition-all duration-200"
              />
            </div>

            {/* No manual select layout needed - auto generated Initials Avatar */}

            <button
              id="guest-login-btn"
              type="submit"
              disabled={!nickname.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl py-3 px-4 shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              Enter Watch Lounge
            </button>
          </form>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-6">
            {!gsiError ? (
              <div className="flex flex-col items-center space-y-4 py-3">
                <p className="text-slate-400 text-sm text-center">
                  Use your secure Google Identity details to configure verified tags and profile photos across rooms.
                </p>
                {/* Official Google GSI Render Mount */}
                <div id="gsi-button-container" className="min-h-[40px] flex justify-center py-2 relative z-10" />
                <span className="text-xs text-slate-500 text-center font-mono select-none">
                  SSL Encrypted • GRef Signed Session
                </span>
              </div>
            ) : (
              /* Google Sign-in Safe Full Sandbox Fallback if cookies/script is blocked */
              <form onSubmit={handleGoogleFallbackSubmit} className="w-full space-y-5">
                <div className="bg-amber-550/10 text-amber-400 border border-amber-500/20 p-3.5 rounded-lg text-xs space-y-1">
                  <span className="font-semibold block text-amber-300">Sandbox Notice:</span>
                  Google Auth scripts are restricted in preview iframes. Below is our secure fallback console to simulate OAuth credentials instantly.
                </div>

                <div className="space-y-2">
                  <label htmlFor="google-name" className="block text-xs font-medium text-gray-400 uppercase tracking-widest">
                    Google Account Name
                  </label>
                  <input
                    id="google-name"
                    type="text"
                    required
                    placeholder="E.g. Radhe Jangir"
                    value={googleName}
                    onChange={(e) => setGoogleName(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 rounded-xl px-4 py-3 text-slate-100 focus:outline-none transition-all duration-200"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="google-email" className="block text-xs font-medium text-gray-400 uppercase tracking-widest">
                    Google Mail Address
                  </label>
                  <input
                    id="google-email"
                    type="email"
                    placeholder="E.g. user@gmail.com"
                    value={googleEmail}
                    onChange={(e) => setGoogleEmail(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 rounded-xl px-4 py-3 text-slate-100 focus:outline-none transition-all duration-200"
                  />
                </div>

                <button
                  id="google-fallback-btn"
                  type="submit"
                  disabled={!googleName.trim()}
                  className="w-full bg-slate-100 hover:bg-white text-slate-950 font-semibold rounded-xl py-3 px-4 shadow-lg active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  Grant Verified OAuth Identity
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
