import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowRight, ChevronLeft, ChevronRight, CirclePlay, Dumbbell, HeartPulse, MoonStar, ShieldCheck, Sparkles, Waves, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import logoAscnd from "@/assets/logo-ascnd.png";
import "./Index.css";

const scenes = [
  { kicker: "01 — THE SYSTEM", title: ["Your body.", "Understood."], copy: "Training, nutrition, sleep, and recovery — connected in one intelligent system.", label: "A clearer picture of you" },
  { kicker: "02 — TRAIN WITH INTENT", title: ["Every rep", "has a reason."], copy: "Build consistency with training that fits your goals, not another generic plan.", label: "Training, made personal" },
  { kicker: "03 — RECOVER SMARTER", title: ["Progress", "is a rhythm."], copy: "Read the signals behind your energy, sleep, and readiness. Know when to push — and when to reset.", label: "Strength meets recovery" },
  { kicker: "04 — BECOME ASCND", title: ["Small moves.", "Higher standards."], copy: "Make the everyday work visible. Turn better choices into a stronger version of you.", label: "Your next level starts here" },
];

const featureList = [
  { icon: Dumbbell, name: "Training", text: "A plan with purpose", stat: "01" },
  { icon: Waves, name: "Nutrition", text: "Fuel that adds up", stat: "02" },
  { icon: MoonStar, name: "Recovery", text: "Rest is part of the work", stat: "03" },
  { icon: HeartPulse, name: "Readiness", text: "Listen to the signals", stat: "04" },
];

function OrbitalArt({ scene }: { scene: number }) {
  return (
    <div className={`ascnd-orbit-art ascnd-orbit-art--${scene}`} aria-hidden="true">
      <div className="ascnd-halo ascnd-halo-a" />
      <div className="ascnd-halo ascnd-halo-b" />
      <div className="ascnd-orbit ascnd-orbit-outer"><span /><i /></div>
      <div className="ascnd-orbit ascnd-orbit-inner"><span /><i /></div>
      <div className="ascnd-core">
        <div className="ascnd-core-light" />
        <img src={logoAscnd} alt="" />
      </div>
      <div className="ascnd-float ascnd-float-top"><Sparkles size={14} /><span>MOVE WITH INTENT</span></div>
      <div className="ascnd-float ascnd-float-right"><span className="ascnd-float-dot" />{scene === 2 ? "RECOVERY / READY" : scene === 1 ? "TRAIN / REPEAT" : scene === 3 ? "CONSISTENCY / UP" : "SYSTEM / ACTIVE"}</div>
      <div className="ascnd-orbit-caption"><span>ASCND®</span><span>PERFORMANCE, CONNECTED</span></div>
      <div className="ascnd-grid-glow" />
    </div>
  );
}

function MiniAppPreview() {
  const [tab, setTab] = useState("Today");
  const [done, setDone] = useState(false);
  return (
    <div className="ascnd-app-preview">
      <div className="ascnd-device-top"><span /><span>ASCND</span><span className="ascnd-live"><i /> LIVE SYSTEM</span></div>
      <div className="ascnd-preview-greeting"><small>YOUR DAILY PICTURE</small><h3>Build your baseline.</h3><p>One day at a time. One signal at a time.</p></div>
      <div className="ascnd-score-card">
        <div><span className="ascnd-eyebrow">READINESS</span><div className="ascnd-score">86<span>/100</span></div><p><i /> Looking good today</p></div>
        <svg viewBox="0 0 100 100" role="img" aria-label="Illustrative readiness ring"><circle cx="50" cy="50" r="39" /><circle className="ascnd-progress-ring" cx="50" cy="50" r="39" /></svg>
      </div>
      <div className="ascnd-preview-label"><span>YOUR PILLARS</span><span>VIEW ALL ↗</span></div>
      <div className="ascnd-preview-grid">
        {featureList.slice(0,3).map(({icon:Icon,name,text},i)=><div className="ascnd-preview-tile" key={name}><span className="ascnd-tile-icon"><Icon size={15}/></span><b>{name}</b><small>{text}</small><span className="ascnd-mini-line" style={{"--line":`${64+i*12}%`} as React.CSSProperties}/></div>)}
      </div>
      <button className={`ascnd-preview-action ${done?"is-done":""}`} onClick={()=>setDone(v=>!v)}><span>{done ? "TODAY’S INTENTION SET" : "SET TODAY’S INTENTION"}</span>{done ? <ShieldCheck size={16}/> : <ArrowRight size={16}/>}</button>
      <div className="ascnd-preview-tabs">{["Today","Nutrition","Training","Progress"].map(t=><button key={t} onClick={()=>setTab(t)} className={tab===t?"active":""}>{t}</button>)}</div>
      <div className="ascnd-preview-tab-note">{tab === "Today" ? "Your day, in context." : tab === "Nutrition" ? "Fuel your next session." : tab === "Training" ? "Make every set count." : "See how far you’ve come."}</div>
    </div>
  );
}

const Index = () => {
  const [scene, setScene] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const touchStart = useRef<{x:number;y:number}|null>(null);
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const goToScene = (next:number) => setScene(Math.max(0, Math.min(scenes.length - 1, next)));

  useEffect(() => {
    const onKey = (e:KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); goToScene(scene+1); }
      if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); goToScene(scene-1); }
      if (e.key === "Home") goToScene(0);
      if (e.key === "End") goToScene(scenes.length-1);
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[scene]);

  const touchBegin = (e:React.TouchEvent) => { touchStart.current={x:e.touches[0].clientX,y:e.touches[0].clientY}; };
  const touchFinish = (e:React.TouchEvent) => {
    if(!touchStart.current) return;
    const dx=e.changedTouches[0].clientX-touchStart.current.x;
    const dy=e.changedTouches[0].clientY-touchStart.current.y;
    if(Math.abs(dy)>48 && Math.abs(dy)>Math.abs(dx)*1.05) goToScene(scene+(dy<0?1:-1));
    touchStart.current=null;
  };

  return (
    <div className="ascnd-story" onTouchStart={touchBegin} onTouchEnd={touchFinish}>
      <div className="ascnd-noise" aria-hidden="true" />
      <header className="ascnd-nav">
        <button className="ascnd-wordmark" onClick={()=>goToScene(0)} aria-label="ASCND home"><img src={logoAscnd} alt="" /><span>ASCND<span className="ascnd-reg">®</span></span></button>
        <nav className={menuOpen?"is-open":""} aria-label="Main navigation">
          <button onClick={()=>{goToScene(1);setMenuOpen(false)}}>The Method</button><button onClick={()=>{goToScene(2);setMenuOpen(false)}}>Recovery</button><button onClick={()=>{goToScene(3);setMenuOpen(false)}}>The Standard</button>
        </nav>
        <button className="ascnd-nav-cta" onClick={()=>navigate("/auth")}>Enter ASCND <ArrowRight size={14}/></button>
        <button className="ascnd-menu-toggle" aria-label="Toggle menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)}><span/><span/></button>
      </header>

      <main className="ascnd-story-stage">
        <AnimatePresence mode="wait" initial={false}>
          <motion.section key={scene} className={`ascnd-scene ascnd-scene-${scene}`} initial={reduceMotion?{opacity:0}:{opacity:0,y:30,filter:"blur(7px)"}} animate={{opacity:1,y:0,filter:"blur(0px)"}} exit={reduceMotion?{opacity:0}:{opacity:0,y:-22,filter:"blur(5px)"}} transition={{duration:reduceMotion?.15:.62,ease:[.22,1,.36,1]}} aria-label={scenes[scene].label}>
            <div className="ascnd-copy-column">
              <motion.div className="ascnd-kicker" initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} transition={{delay:.12,duration:.45}}><span className="ascnd-kicker-line"/>{scenes[scene].kicker}</motion.div>
              <h1>{scenes[scene].title[0]}<br/><em>{scenes[scene].title[1]}</em></h1>
              <p className="ascnd-lede">{scenes[scene].copy}</p>
              <div className="ascnd-hero-actions">
                <button className="ascnd-button-primary" onClick={()=>navigate("/auth")}>Discover your system <ArrowRight size={16}/></button>
                <button className="ascnd-button-quiet" onClick={()=>goToScene((scene+1)%scenes.length)}><CirclePlay size={17}/> Explore the story</button>
              </div>
              <div className="ascnd-proof-row"><div className="ascnd-proof-icon"><Zap size={15}/></div><div><b>BUILT AROUND YOU</b><span>Training · Fuel · Recovery · Progress</span></div></div>
            </div>
            <div className="ascnd-art-column"><OrbitalArt scene={scene}/></div>
          </motion.section>
        </AnimatePresence>
        <div className="ascnd-scene-bottom">
          <div className="ascnd-scene-label"><span>SCROLL TO EXPLORE</span><span className="ascnd-label-rule"/></div>
          <div className="ascnd-scene-controls">
            <div className="ascnd-scene-count"><span>0{scene+1}</span><span className="ascnd-count-divider"/>0{scenes.length}</div>
            <div className="ascnd-scene-dots">{scenes.map((s,i)=><button key={s.kicker} className={i===scene?"active":""} onClick={()=>goToScene(i)} aria-label={`Go to scene ${i+1}`} aria-current={i===scene?"step":undefined}/>)}</div>
            <div className="ascnd-scene-arrows"><button aria-label="Previous scene" disabled={scene===0} onClick={()=>goToScene(scene-1)}><ChevronLeft size={17}/></button><button aria-label="Next scene" disabled={scene===scenes.length-1} onClick={()=>goToScene(scene+1)}><ChevronRight size={17}/></button></div>
          </div>
        </div>
      </main>

      <aside className="ascnd-edge-note"><span>INTENTION OVER NOISE</span><span className="ascnd-edge-line"/><span>EST. FOR THE LONG GAME</span></aside>
      <footer className="ascnd-footer"><span>© 2026 ASCND PERFORMANCE SYSTEM</span><span>BUILT FOR YOUR NEXT VERSION <ArrowDown size={12}/></span></footer>

      <AnimatePresence>
        {scene===3 && <motion.div className="ascnd-feature-overlay" initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} exit={{opacity:0,y:24}} transition={{duration:.4}}>
          <div className="ascnd-feature-panel">
            <div className="ascnd-feature-head"><span>THE FOUR PILLARS</span><span>01 — 04</span></div>
            <div className="ascnd-feature-grid">{featureList.map(({icon:Icon,name,text,stat})=><button key={name} onClick={()=>navigate("/auth")}><span className="ascnd-feature-number">{stat}</span><Icon size={19}/><b>{name}</b><small>{text}</small></button>)}</div>
            <div className="ascnd-preview-wrap"><MiniAppPreview/><div className="ascnd-preview-aside"><span className="ascnd-kicker-line"/><p className="ascnd-eyebrow">ONE SYSTEM. YOUR WHOLE PICTURE.</p><h2>Less noise.<br/><em>More signal.</em></h2><p>Your habits don’t happen in isolation. ASCND brings the pieces together so your next step feels clearer.</p><button className="ascnd-button-primary" onClick={()=>navigate("/auth")}>Start your journey <ArrowRight size={15}/></button></div></div>
          </div>
        </motion.div>}
      </AnimatePresence>
    </div>
  );
};

export default Index;
