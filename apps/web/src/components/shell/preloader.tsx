"use client";

import { FileAudio, FileImage, FileText, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ShaderField } from "@/components/visuals/shader-field";
import { BrandMark } from "./brand-mark";

const PHASES = [
  "Waking the secure workspace",
  "Connecting evidence and workflow services",
  "Restoring your live operational context",
];

export function PortalPreloader() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setPhase(1), 1_200),
      window.setTimeout(() => setPhase(2), 3_200),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, []);

  return (
    <main className="portal-preloader" role="status" aria-live="polite" aria-label="Loading OpsWeave">
      <div className="preloader-grid" aria-hidden="true" />
      <div className="preloader-aura" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden="true">
        <ShaderField variant="aurora" speed={0.6} />
      </div>

      <section className="preloader-content">
        <div className="preloader-mark" aria-hidden="true">
          <span className="preloader-orbit orbit-one"><FileText /></span>
          <span className="preloader-orbit orbit-two"><FileImage /></span>
          <span className="preloader-orbit orbit-three"><FileAudio /></span>
          <span className="preloader-orbit orbit-four"><ShieldCheck /></span>
          <BrandMark size={74} radius={24} />
          <i className="preloader-ring ring-one" />
          <i className="preloader-ring ring-two" />
        </div>

        <div className="preloader-brand">
          <strong>OpsWeave</strong>
          <span>Evidence to governed execution</span>
        </div>

        <div className="preloader-progress" aria-hidden="true"><span /></div>

        <AnimatePresence mode="wait">
          <motion.p
            key={phase}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            {PHASES[phase]}
            <span className="loading-dots"><i /><i /><i /></span>
          </motion.p>
        </AnimatePresence>

        <small>Serverless resources may take a moment after inactivity.</small>
      </section>
    </main>
  );
}

export function AmbientBackdrop() {
  return (
    <div aria-hidden="true">
      <span className="ambient-glow one" />
      <span className="ambient-glow two" />
      <span className="ambient-glow three" />
    </div>
  );
}
