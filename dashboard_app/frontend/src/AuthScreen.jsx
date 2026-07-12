import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  ChevronRight,
  Check,
  AlertCircle,
  Lock as LockIcon,
  BadgeCheck,
  Wifi,
} from "lucide-react";

/**
 * JINDAL STEEL & POWER — Enterprise Command Console
 * Shared visual shell for both Login and Signup. All backend behavior is
 * injected via props — this file owns layout, motion, and validation UI
 * only. See Login.jsx / Signup.jsx for the actual fetch() calls.
 */

const GRID = 44;

function useParallax() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      setPos({ x, y });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  return pos;
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/* ---------------------------------- background layers ---------------------------------- */

function Particles({ count = 24 }) {
  const particles = useRef(
    Array.from({ length: count }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 1 + Math.random() * 2.2,
      delay: Math.random() * 14,
      dur: 13 + Math.random() * 10,
      drift: (Math.random() - 0.5) * 60,
      opacity: 0.12 + Math.random() * 0.3,
    }))
  ).current;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full bg-orange-200"
          style={{
            left: `${p.left}%`,
            bottom: "-10px",
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            filter: "blur(0.3px)",
            animation: `ember-rise ${p.dur}s linear ${p.delay}s infinite`,
            "--drift": `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

function Skyline() {
  return (
    <svg
      className="absolute bottom-0 left-0 w-[140%] md:w-full h-[34%] opacity-0"
      viewBox="0 0 1600 300"
      preserveAspectRatio="none"
      style={{
        animation:
          "skyline-rise 1.4s cubic-bezier(0.16,1,0.3,1) 0.2s forwards, pan-slow 36s ease-in-out infinite alternate 1.4s",
      }}
    >
      <defs>
        <linearGradient id="skylineFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0B1B30" stopOpacity="0" />
          <stop offset="100%" stopColor="#050B14" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="furnaceGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F97316" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#F97316" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="1600" height="300" fill="url(#skylineFade)" opacity="0.001" />
      <ellipse cx="640" cy="300" rx="260" ry="70" fill="url(#furnaceGlow)">
        <animate attributeName="opacity" values="0.5;0.85;0.5" dur="4.5s" repeatCount="indefinite" />
      </ellipse>
      <g fill="#0A1A2E">
        <rect x="0" y="170" width="120" height="130" />
        <rect x="110" y="120" width="40" height="180" />
        <rect x="160" y="150" width="90" height="150" />
        <rect x="260" y="90" width="26" height="210" />
        <rect x="300" y="180" width="160" height="120" />
        <polygon points="300,180 380,120 460,180" />
        <rect x="470" y="140" width="30" height="160" />
        <rect x="510" y="200" width="220" height="100" />
        <rect x="560" y="70" width="18" height="230" />
        <rect x="610" y="70" width="18" height="230" />
        <rect x="740" y="160" width="60" height="140" />
        <rect x="810" y="190" width="240" height="110" />
        <rect x="860" y="100" width="24" height="200" />
        <rect x="1060" y="130" width="34" height="170" />
        <rect x="1100" y="175" width="150" height="125" />
        <polygon points="1100,175 1175,110 1250,175" />
        <rect x="1260" y="150" width="22" height="150" />
        <rect x="1290" y="195" width="180" height="105" />
        <rect x="1330" y="90" width="16" height="210" />
        <rect x="1370" y="90" width="16" height="210" />
        <rect x="1480" y="165" width="120" height="135" />
      </g>
      <g fill="none" stroke="#1C3453" strokeWidth="3">
        <path d="M0 288 H1600" />
        <path d="M0 294 H1600" strokeDasharray="2 10" opacity="0.6" />
      </g>
      <g opacity="0.9">
        {[555, 605, 1330, 1370].map((x, i) => (
          <g key={x}>
            <rect x={x} y={60 + (i % 2) * 8} width="16" height={240 - (i % 2) * 8} fill="#0A1A2E" />
            {[0, 1, 2, 3].map((band) => (
              <rect
                key={band}
                x={x}
                y={60 + (i % 2) * 8 + band * 30}
                width="16"
                height="15"
                fill={band % 2 === 0 ? "#B91C1C" : "#E5E7EB"}
                opacity="0.5"
              />
            ))}
          </g>
        ))}
      </g>
      <g>
        <circle cx="568" cy="66" r="3.4" fill="#F97316" opacity="0.85">
          <animate attributeName="opacity" values="0.3;0.9;0.3" dur="3.2s" repeatCount="indefinite" />
        </circle>
        <circle cx="619" cy="66" r="3" fill="#F97316" opacity="0.7">
          <animate attributeName="opacity" values="0.85;0.25;0.85" dur="2.6s" repeatCount="indefinite" />
        </circle>
        <circle cx="1338" cy="86" r="3.2" fill="#F97316" opacity="0.8">
          <animate attributeName="opacity" values="0.25;0.8;0.25" dur="3.8s" repeatCount="indefinite" />
        </circle>
      </g>
    </svg>
  );
}

function ConveyorStreaks() {
  return (
    <div className="absolute bottom-0 left-0 w-full h-10 overflow-hidden opacity-40 pointer-events-none">
      <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="absolute top-1/2 -translate-y-1/2 h-[2px] w-16 rounded-full"
          style={{
            left: "-10%",
            background: "linear-gradient(90deg, transparent, #F97316, transparent)",
            animation: `conveyor 5.5s linear ${i * 1.1}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function BlueprintGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <svg
        className="absolute inset-0 opacity-0"
        width="140%"
        height="140%"
        style={{ animation: "grid-fade 2s ease-out 0.1s forwards, grid-drift 60s linear infinite" }}
      >
        <defs>
          <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#7FB2FF" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" opacity="0.045" />
      </svg>
      <div
        className="absolute inset-x-0 h-40"
        style={{
          top: "-10%",
          background:
            "linear-gradient(180deg, transparent, rgba(91,160,242,0.08) 45%, rgba(91,160,242,0.16) 50%, rgba(91,160,242,0.08) 55%, transparent)",
          animation: "scan-line 9s ease-in-out 2s infinite",
        }}
      />
    </div>
  );
}

function ConnectionNodes() {
  const nodes = [
    { x: "12%", y: "18%" },
    { x: "22%", y: "34%" },
    { x: "8%", y: "52%" },
    { x: "88%", y: "22%" },
    { x: "92%", y: "44%" },
    { x: "80%", y: "62%" },
  ];
  return (
    <svg className="absolute inset-0 w-full h-full opacity-[0.11] pointer-events-none">
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r="3" fill="#5BA0F2">
            <animate attributeName="r" values="2.4;3.6;2.4" dur={`${3 + i * 0.4}s`} repeatCount="indefinite" />
          </circle>
          {i < nodes.length - 1 && (
            <line
              x1={n.x}
              y1={n.y}
              x2={nodes[(i + 1) % nodes.length].x}
              y2={nodes[(i + 1) % nodes.length].y}
              stroke="#5BA0F2"
              strokeWidth="0.6"
              strokeDasharray="4 6"
            >
              <animate attributeName="stroke-dashoffset" from="0" to="20" dur="4s" repeatCount="indefinite" />
            </line>
          )}
        </g>
      ))}
    </svg>
  );
}

function CadAnnotations() {
  return (
    <svg className="hidden md:block absolute inset-0 w-full h-full opacity-[0.09] pointer-events-none" fontFamily="monospace">
      <g stroke="#7FB2FF" strokeWidth="0.7">
        <line x1="6%" y1="12%" x2="6%" y2="88%" strokeDasharray="1 5" />
        <line x1="4.4%" y1="12%" x2="7.6%" y2="12%" />
        <line x1="4.4%" y1="88%" x2="7.6%" y2="88%" />
      </g>
      <text x="3%" y="50%" fill="#7FB2FF" fontSize="9" transform="rotate(-90 48 340)">
        SEC-4471-A · ROLLING MILL AXIS
      </text>
      <text x="82%" y="8%" fill="#7FB2FF" fontSize="9">
        REV. 12.4 — GRID 44mm
      </text>
    </svg>
  );
}

/* ---------------------------------- brand / logo ---------------------------------- */

function Logomark({ size = 42 }) {
  return (
    <div className="flex items-center gap-3 select-none" style={{ animation: "logo-breathe 5s ease-in-out 1.6s infinite" }}>
      <img
        src="/photo/logo2.png"
        alt="Jindal Steel & Power"
        // Removed bg-white and rounded-2xl since there is no background box anymore
        className="shrink-0 object-contain"
        style={{
          width: size,
          height: size,
          // Swapped box-shadow for filter drop-shadow so the glow wraps the logo shape, not a square box
          filter: "drop-shadow(0 0 12px rgba(249,115,22,0.35)) drop-shadow(0 4px 6px rgba(0,0,0,0.35))",
        }}
      />
      <div className="leading-tight">
        <div
          className="font-bold tracking-wide text-white text-[16px] md:text-[17px]"
          style={{ fontFamily: "Poppins, sans-serif" }}
        >
          JINDAL
        </div>
        <div className="text-[9px] md:text-[10px] tracking-[0.24em] text-slate-300/90 font-semibold -mt-0.5">
          STEEL &amp; POWER
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  const now = useClock();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
  return (
    <div className="hidden sm:flex items-center gap-4 text-[11px] text-slate-400 tracking-wide">
      <span className="flex items-center gap-1.5 text-emerald-300/90">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
        </span>
        SYSTEMS ONLINE
      </span>
      <span className="w-px h-3 bg-white/10" />
      <span className="font-mono">
        {date} · {time}
      </span>
    </div>
  );
}

/* ---------------------------------- input field ---------------------------------- */

function FloatingField({
  id,
  type,
  label,
  icon: Icon,
  value,
  onChange,
  showToggle,
  visible,
  onToggle,
  delay,
  error,
  valid,
  shake,
  autoComplete,
}) {
  const [focused, setFocused] = useState(false);
  const filled = value.length > 0;
  const borderClass = error
    ? "border-red-400/70 shadow-[0_0_0_4px_rgba(248,113,113,0.12)] bg-red-500/[0.04]"
    : valid
      ? "border-emerald-400/60 shadow-[0_0_0_4px_rgba(52,211,153,0.10)] bg-white/[0.06]"
      : focused
        ? "border-blue-400/80 shadow-[0_0_0_4px_rgba(59,130,246,0.15)] bg-white/[0.09]"
        : "border-white/10 bg-white/[0.05] hover:border-white/20";

  return (
    <motion.div
      className="relative"
      style={shake ? { animation: "field-shake 0.45s ease" } : {}}
    >
      <div className={`relative flex items-center rounded-2xl border transition-all duration-300 ${borderClass}`}>
        <Icon
          className={`ml-4 shrink-0 transition-colors duration-300 ${error ? "text-red-300" : valid ? "text-emerald-300" : focused ? "text-blue-300" : "text-slate-400"
            }`}
          size={19}
        />
        <div className="relative flex-1 pl-3 pr-3 pt-5 pb-2">
          <label
            htmlFor={id}
            className={`absolute left-3 transition-all duration-200 pointer-events-none font-medium tracking-wide ${focused || filled
              ? `top-1.5 text-[10px] ${error ? "text-red-300" : valid ? "text-emerald-300" : "text-blue-300"}`
              : "top-1/2 -translate-y-1/2 text-sm text-slate-400"
              }`}
          >
            {label}
          </label>
          <input
            id={id}
            name={id}
            type={showToggle ? (visible ? "text" : "password") : type}
            value={value}
            onChange={onChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="w-full bg-transparent outline-none text-white text-sm placeholder-transparent"
            autoComplete={autoComplete || "off"}
          />
        </div>
        {valid && !showToggle && (
          <Check size={16} className="mr-4 text-emerald-400 shrink-0" style={{ animation: "pop-in 0.3s ease" }} />
        )}
        {showToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="mr-4 text-slate-400 hover:text-slate-200 transition-colors"
            tabIndex={-1}
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </div>
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-1.5 mt-1 text-[11px] text-red-300 pl-1"
        >
          <AlertCircle size={12} />
          {error}
        </motion.div>
      )}
    </motion.div>
  );
}

/* ---------------------------------- ripple button ---------------------------------- */

function useRipple() {
  const [ripples, setRipples] = useState([]);
  const trigger = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setRipples((r) => [...r, { id, x, y }]);
    setTimeout(() => setRipples((r) => r.filter((ripple) => ripple.id !== id)), 650);
  }, []);
  return [ripples, trigger];
}

/* ---------------------------------- main shared shell ---------------------------------- */

/**
 * Props:
 * - mode: "login" | "signup"
 * - onSubmit: async ({ name?, email, password }) => void
 *     Should throw an Error(message) on failure (invalid credentials,
 *     server error, etc). On success it should perform its own
 *     navigation/redirect — this component just shows the success state
 *     briefly before your redirect takes over.
 * - footerPrompt / footerLinkText / footerLinkTo: text + <Link> target
 *   for the "New here? / Already have an account?" line.
 */
export default function AuthScreen({
  mode = "login",
  onSubmit,
  footerPrompt,
  footerLinkText,
  footerLinkTo,
  FooterLink, // pass react-router's <Link> component in to avoid coupling this file to react-router
}) {
  const isSignup = mode === "signup";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [shakeFields, setShakeFields] = useState({});
  const [success, setSuccess] = useState(false);
  const parallax = useParallax();
  const [ripples, triggerRipple] = useRipple();
  const progressTimer = useRef(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => () => progressTimer.current && clearInterval(progressTimer.current), []);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const nameValid = !isSignup || name.trim().length > 1;
  const passwordValid = password.length >= (isSignup ? 8 : 1);

  const validate = () => {
    const errs = {};
    if (isSignup && !nameValid) errs.name = "Enter your full name";
    if (!emailValid) errs.email = "Enter a valid email address";
    if (isSignup && password.length < 8) errs.password = "Use at least 8 characters";
    else if (!password) errs.password = "Password is required";
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const errs = validate();
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      setShakeFields(errs);
      setTimeout(() => setShakeFields({}), 500);
      return;
    }
    setFieldErrors({});
    setFormError("");
    setLoading(true);
    setProgress(0);

    // Trickle progress up to ~88% while the real request is in flight,
    // then snap to 100% when it resolves — avoids a fake fixed duration.
    progressTimer.current = setInterval(() => {
      setProgress((p) => (p < 88 ? p + (88 - p) * 0.12 : p));
    }, 150);

    try {
      await onSubmit({ name, email, password, remember });
      clearInterval(progressTimer.current);
      setProgress(100);
      setSuccess(true);
      // onSubmit is expected to navigate; this just lets the success
      // state render for a beat before that navigation takes effect.
      setTimeout(() => {
        setLoading(false);
        setSuccess(false);
      }, 700);
    } catch (err) {
      clearInterval(progressTimer.current);
      setLoading(false);
      setProgress(0);
      setFormError(err?.message || "Something went wrong. Please try again.");
      setShakeFields({ email: true, password: true });
      setTimeout(() => setShakeFields({}), 500);
    }
  };

  return (
    <div className="relative w-full min-h-screen overflow-hidden bg-[#081A2F] font-sans">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700;800&display=swap');
        * { font-family: 'Inter', sans-serif; }
        .font-display { font-family: 'Poppins', sans-serif; }

        @keyframes rise-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes card-in { 0% { opacity: 0; transform: translateY(30px) scale(0.95); } 70% { opacity: 1; } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes card-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes logo-drop { 0% { opacity: 0; transform: translateY(-24px); } 60% { opacity: 1; transform: translateY(4px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes logo-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.035); } }
        @keyframes zoom-slow { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes pan-slow { 0% { transform: translateX(0); } 100% { transform: translateX(-6%); } }
        @keyframes skyline-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 0.92; transform: translateY(0); } }
        @keyframes grid-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes grid-drift { 0% { transform: translate(0,0); } 100% { transform: translate(-${GRID}px, -${GRID}px); } }
        @keyframes scan-line { 0% { top: -10%; opacity: 0; } 8% { opacity: 1; } 45% { opacity: 1; } 55% { top: 105%; opacity: 0; } 100% { top: 105%; opacity: 0; } }
        @keyframes drift-fog { 0% { transform: translateX(-10%); opacity: 0.16; } 50% { opacity: 0.28; } 100% { transform: translateX(10%); opacity: 0.16; } }
        @keyframes ember-rise { 0% { transform: translate(0,0); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 0.4; } 100% { transform: translate(var(--drift), -110vh); opacity: 0; } }
        @keyframes conveyor { 0% { left: -10%; } 100% { left: 110%; } }
        @keyframes ray-sweep { 0%, 100% { opacity: 0.05; transform: rotate(8deg) translateX(0); } 50% { opacity: 0.13; transform: rotate(8deg) translateX(30px); } }
        @keyframes pulse-soft { 0%, 100% { box-shadow: 0 0 0 0 rgba(249,115,22,0), 0 10px 34px -6px rgba(37,99,235,0.55); } 50% { box-shadow: 0 0 0 8px rgba(37,99,235,0), 0 14px 44px -4px rgba(37,99,235,0.75); } }
        @keyframes shine-sweep { 0% { transform: translateX(-130%) skewX(-20deg); } 100% { transform: translateX(230%) skewX(-20deg); } }
        @keyframes field-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(3px); } }
        @keyframes pop-in { 0% { transform: scale(0.4); opacity: 0; } 70% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes ripple-out { from { transform: scale(0); opacity: 0.45; } to { transform: scale(3.2); opacity: 0; } }
        @keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes check-draw { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      `}</style>

      {/* ================= BACKGROUND ================= */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(120% 90% at 20% 0%, #173B66 0%, #0F2748 45%, #081A2F 100%)",
          animation: "zoom-slow 30s ease-in-out infinite",
        }}
      >
        <div
          className="absolute -top-1/4 left-1/3 w-[60%] h-[160%] bg-gradient-to-b from-blue-200/35 via-transparent to-transparent blur-3xl"
          style={{ animation: "ray-sweep 17s ease-in-out infinite" }}
        />
        <div
          className="absolute -top-1/4 right-0 w-[40%] h-[140%] bg-gradient-to-b from-orange-200/10 via-transparent to-transparent blur-3xl"
          style={{ animation: "ray-sweep 21s ease-in-out infinite reverse" }}
        />
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[70%] h-[50%] bg-blue-400/10 blur-3xl rounded-full"
          style={{ animation: "zoom-slow 22s ease-in-out infinite reverse" }}
        />

        <BlueprintGrid />
        <ConnectionNodes />
        <CadAnnotations />

        <div
          style={{ transform: `translate(${parallax.x * -8}px, ${parallax.y * -4}px)`, transition: "transform 0.4s ease-out" }}
          className="absolute inset-0"
        >
          <Skyline />
        </div>

        <ConveyorStreaks />

        <div
          className="absolute bottom-0 left-0 w-[140%] h-40 bg-gradient-to-t from-slate-400/20 to-transparent blur-2xl"
          style={{ animation: "drift-fog 23s ease-in-out infinite" }}
        />
        <div
          className="absolute bottom-0 right-0 w-[120%] h-28 bg-gradient-to-t from-slate-300/10 to-transparent blur-2xl"
          style={{ animation: "drift-fog 27s ease-in-out infinite reverse" }}
        />

        <Particles />

        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-500"
          style={{
            background: `radial-gradient(420px at ${50 + parallax.x * 22}% ${50 + parallax.y * 22}%, rgba(91,160,242,0.09), transparent 70%)`,
          }}
        />

        <div className="absolute inset-0 bg-[radial-gradient(38%_46%_at_50%_46%,rgba(8,26,47,0)_0%,rgba(5,14,26,0.55)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_40%,transparent_35%,rgba(3,9,18,0.78)_100%)]" />
      </div>

      {/* ================= TOP BAR ================= */}
      <div
        className="absolute top-6 inset-x-6 md:top-8 md:inset-x-10 z-20 flex items-center justify-between opacity-0"
        style={{ animation: "logo-drop 0.8s cubic-bezier(0.34,1.56,0.64,1) 0.15s forwards" }}
      >
        <Logomark />
        <StatusBar />
      </div>

      {/* ================= LOADING OVERLAY ================= */}
      {loading && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050d18]/80 backdrop-blur-md"
          style={{ animation: "overlay-in 0.35s ease forwards" }}
        >
          <div className="flex flex-col items-center gap-5 w-64">
            {success ? (
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 12.5L9.5 18L20 6"
                    stroke="#34D399"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="24"
                    style={{ animation: "check-draw 0.5s ease forwards" }}
                  />
                </svg>
              </div>
            ) : (
              <Loader2 className="animate-spin text-blue-400" size={34} />
            )}
            <div className="text-slate-200 text-sm font-medium tracking-wide">
              {success ? (isSignup ? "Account Created" : "Access Granted") : isSignup ? "Creating your account..." : "Authenticating..."}
            </div>
            <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${success ? 100 : progress}%`,
                  background: "linear-gradient(90deg,#2563EB,#3B82F6,#60A5FA)",
                  transition: "width 0.15s linear",
                }}
              />
            </div>
            <div className="text-[11px] text-slate-500 font-mono tracking-wide">VERIFYING CREDENTIALS · SEC-256</div>
          </div>
        </div>
      )}

      {/* ================= CENTER CONTENT ================= */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-28">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={mounted ? { opacity: 1, y: 0, scale: 1 } : {}}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.35 }}
          style={{
            transform: `translate(${parallax.x * 3}px, ${parallax.y * 2}px)`,
            animation: mounted ? "card-float 6s ease-in-out 1.2s infinite" : "none",
          }}
        >
          <div className="group relative">
            {/* Glow halo — decorative, no layout impact */}
            <div className="absolute -inset-4 rounded-[36px] bg-blue-500/15 blur-2xl opacity-60 group-hover:opacity-90 transition-opacity duration-500 pointer-events-none" />

            <div
              className="relative rounded-[30px] p-[1px] transition-all duration-500 group-hover:-translate-y-1"
              style={{
                background: "linear-gradient(155deg, rgba(255,255,255,0.22), rgba(255,255,255,0.03) 40%, rgba(59,130,246,0.18))",
                boxShadow: "0 30px 80px -20px rgba(0,0,0,0.65), 0 12px 30px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)",
              }}
            >
              {/* Card body — sm:p-6 (24px) → md:p-10 (40px) */}
              <div
                className="relative rounded-[29px] p-6 sm:p-8 md:p-10 overflow-hidden"
                style={{
                  background: "linear-gradient(155deg, rgba(255,255,255,0.10), rgba(255,255,255,0.045) 60%, rgba(255,255,255,0.02))",
                  backdropFilter: "blur(28px)",
                  WebkitBackdropFilter: "blur(28px)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 0 40px rgba(59,130,246,0.05)",
                }}
              >
                {/* Decorative: inner light sheen — absolute, no layout impact */}
                <div className="absolute -top-1/2 -left-1/4 w-2/3 h-full bg-gradient-to-br from-white/10 to-transparent rotate-12 pointer-events-none" />

                {/* Decorative: corner brackets — absolute, no layout impact */}
                {[
                  "top-3 left-3 border-t border-l rounded-tl-lg",
                  "top-3 right-3 border-t border-r rounded-tr-lg",
                  "bottom-3 left-3 border-b border-l rounded-bl-lg",
                  "bottom-3 right-3 border-b border-r rounded-br-lg",
                ].map((cls, i) => (
                  <span key={i} className={`absolute w-4 h-4 border-blue-300/30 pointer-events-none ${cls}`} />
                ))}

                {/* Card content — single flex column with gap controls ALL vertical spacing */}
                <motion.div
                  className="relative flex flex-col gap-5"
                  variants={{
                    hidden: { opacity: 0 },
                    show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.5 } },
                  }}
                  initial="hidden"
                  animate={mounted ? "show" : "hidden"}
                >
                  {/* Secure badge row */}
                  <motion.div
                    className="flex items-center gap-2"
                    variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
                  >
                    <ShieldCheck size={15} className="text-emerald-400" />
                    <span className="text-[11px] tracking-[0.2em] text-emerald-300/90 font-medium">SECURE DASHBOARD ACCESS</span>
                    <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[9px] tracking-wide text-slate-400">
                      <Wifi size={10} className="text-emerald-400" /> JSP
                    </span>
                  </motion.div>

                  {/* Heading + subtitle */}
                  <motion.div
                    className="flex flex-col gap-1.5"
                    variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
                  >
                    <h1 className="font-display text-[34px] md:text-[38px] font-bold text-white tracking-[-0.02em] leading-[1.05]">
                      {isSignup ? "Create Account" : "Welcome Back"}
                    </h1>
                    <p className="text-gray-400 text-[13.5px]">
                      {isSignup ? "Register for the Jindal Steel Power Plant Dashboard" : "Access your Jindal Steel Power Plant Dashboard"}
                    </p>
                  </motion.div>

                  {/* Form error banner */}
                  {formError && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-400/30 text-red-200 text-[13px]"
                    >
                      <AlertCircle size={15} className="shrink-0" />
                      {formError}
                    </motion.div>
                  )}

                  {/* Form fields — gap-4 controls spacing between all fields */}
                  <motion.form
                    onSubmit={handleSubmit}
                    className="flex flex-col gap-4"
                    noValidate
                    variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.45 } } }}
                  >
                    {isSignup && (
                      <FloatingField
                        id="name"
                        type="text"
                        label="Full Name"
                        icon={User}
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: "" }));
                        }}
                        delay={0}
                        error={fieldErrors.name}
                        valid={nameValid && name.length > 0}
                        shake={shakeFields.name}
                        autoComplete="name"
                      />
                    )}
                    <FloatingField
                      id="email"
                      type="email"
                      label="Email Address"
                      icon={Mail}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: "" }));
                      }}
                      delay={0}
                      error={fieldErrors.email}
                      valid={emailValid && email.length > 0}
                      shake={shakeFields.email}
                      autoComplete="email"
                    />
                    <FloatingField
                      id="password"
                      type="password"
                      label="Password"
                      icon={Lock}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: "" }));
                      }}
                      showToggle
                      visible={showPassword}
                      onToggle={() => setShowPassword((v) => !v)}
                      delay={0}
                      error={fieldErrors.password}
                      valid={passwordValid && password.length > 0 && !fieldErrors.password}
                      shake={shakeFields.password}
                      autoComplete={isSignup ? "new-password" : "current-password"}
                    />

                    {/* Remember me / Forgot password row */}
                    {!isSignup && (
                      <div className="flex items-center justify-between text-sm">
                        <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
                          <span
                            onClick={() => setRemember((v) => !v)}
                            className={`flex items-center justify-center w-4 h-4 rounded border transition-all duration-200 ${remember ? "bg-blue-500 border-blue-500 scale-105" : "border-white/30 bg-white/5"
                              }`}
                          >
                            {remember && (
                              <svg width="10" height="8" viewBox="0 0 10 8" fill="none" style={{ animation: "pop-in 0.25s ease" }}>
                                <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          Remember Me
                        </label>
                        <a href="#" className="text-blue-300 hover:text-blue-200 transition-colors">
                          Forgot Password?
                        </a>
                      </div>
                    )}

                    {/* Submit button */}
                    <button
                      type="submit"
                      disabled={loading}
                      onClick={triggerRipple}
                      className="relative w-full rounded-full py-3.5 font-semibold text-white overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] active:scale-[0.97] disabled:opacity-90"
                      style={{
                        background: "linear-gradient(135deg,#2563EB,#3B82F6)",
                        backgroundSize: "150% 150%",
                        animation: mounted ? "pulse-soft 4.5s ease-in-out 2.6s infinite" : "none",
                      }}
                    >
                      {ripples.map((r) => (
                        <span
                          key={r.id}
                          className="absolute rounded-full bg-white/40 pointer-events-none"
                          style={{ left: r.x - 6, top: r.y - 6, width: 12, height: 12, animation: "ripple-out 0.65s ease-out forwards" }}
                        />
                      ))}
                      <span
                        className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent pointer-events-none"
                        style={{ animation: "shine-sweep 4.5s ease-in-out 2s infinite" }}
                      />
                      <span className="relative z-10 flex items-center justify-center gap-2 text-sm tracking-wide">
                        {isSignup ? "Create Account" : "Sign In to Dashboard"}
                        <ChevronRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
                      </span>
                    </button>
                  </motion.form>

                  {/* Footer link */}
                  <motion.p
                    className="text-center text-sm text-slate-400"
                    variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.45 } } }}
                  >
                    {footerPrompt}{" "}
                    {FooterLink ? (
                      <FooterLink to={footerLinkTo} className="text-orange-300 hover:text-orange-200 font-medium transition-colors">
                        {footerLinkText}
                      </FooterLink>
                    ) : (
                      <a href={footerLinkTo} className="text-orange-300 hover:text-orange-200 font-medium transition-colors">
                        {footerLinkText}
                      </a>
                    )}
                  </motion.p>
                </motion.div>
              </div>
            </div>
          </div>

          <motion.div
            className="flex flex-col items-center gap-2.5 pt-6"
            initial={{ opacity: 0, y: 8 }}
            animate={mounted ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 1.2, duration: 0.5 }}
          >
            <p className="text-[11px] text-slate-500 tracking-wide">
              Powered by <span className="text-slate-400">Jindal Steel Digital Solutions</span>
            </p>
            <div className="flex items-center gap-4 text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <LockIcon size={11} className="text-slate-500" /> Secure Connection
              </span>
              <span className="w-px h-3 bg-white/10" />
              <span className="flex items-center gap-1">
                <BadgeCheck size={11} className="text-slate-500" /> ISO 27001
              </span>
              <span className="w-px h-3 bg-white/10" />
              <span className="flex items-center gap-1">
                <ShieldCheck size={11} className="text-slate-500" /> Enterprise Access
              </span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
