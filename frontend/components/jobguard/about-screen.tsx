"use client"

import { Shield, AlertTriangle, Lock, Eye, FlaskConical, Github, Settings } from "lucide-react"

interface AboutScreenProps {
  onBack: () => void
}

export function AboutScreen({ onBack }: AboutScreenProps) {
  return (
    <div className="min-h-[calc(100vh-60px)]">
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">About JobGuard</h2>
            <p className="text-sm text-muted-foreground mt-1">Version 1.0.0</p>
          </div>
        </div>

        {/* Mission */}
        <div className="p-4 rounded-xl bg-card border border-border space-y-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Research-Based Tool</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            JobGuard is a research-based tool designed to help job seekers identify potentially 
            problematic job listings. We analyze posting patterns, company signals, and common 
            scam indicators to provide risk assessments.
          </p>
        </div>

        {/* Disclaimers */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            Important Disclaimers
          </h3>
          <div className="space-y-2">
            {[
              "JobGuard is not 100% foolproof. Always do your own research before applying or sharing personal information.",
              "We are not responsible for decisions you make based on this tool. Use the information as one of many data points in your job search.",
              "Risk scores are estimates based on available signals and may not reflect the actual legitimacy of a listing.",
            ].map((text, i) => (
              <div key={i} className="p-3 rounded-lg bg-warning/5 border border-warning/10">
                <p className="text-sm text-foreground leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Privacy */}
        <div className="p-4 rounded-xl bg-card border border-border space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-success" />
            <h3 className="font-semibold text-sm text-foreground">Your Privacy</h3>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-success mt-1">•</span>
              We do not sell your personal data.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-success mt-1">•</span>
              We only analyze the job listing page content visible to you.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-success mt-1">•</span>
              Scan history is stored locally on your device.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-success mt-1">•</span>
              Google Sheets export requires explicit permission and can be revoked anytime.
            </li>
          </ul>
        </div>

        {/* What We Analyze */}
        <div className="p-4 rounded-xl bg-card border border-border space-y-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">What We Analyze</h3>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              Job posting content, structure, and language patterns
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              Presence of key information (salary, requirements, benefits)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              Company web presence and domain consistency
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              Known scam patterns and red flag indicators
            </li>
          </ul>
        </div>

        {/* Open settings */}
        <button
          type="button"
          onClick={() => {
            try {
              window.parent?.postMessage({ type: "JOBGUARD_OPEN_SETTINGS" }, "*")
            } catch {}
          }}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-card border border-border hover:border-primary/60 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Settings className="w-4 h-4 text-primary" />
            Open settings
          </div>
          <span className="text-xs text-muted-foreground">
            Sheets · Resume · Application tracking
          </span>
        </button>

        {/* Source */}
        <a
          href="https://github.com/LABCoasty/job-protection"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between p-3 rounded-xl bg-card border border-border hover:border-primary/60 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Github className="w-4 h-4" />
            Open source on GitHub
          </div>
          <span className="text-xs text-muted-foreground">LABCoasty/job-protection</span>
        </a>

        {/* Footer */}
        <p className="text-xs text-center text-muted-foreground/70 pt-4">
          Built with care to help job seekers stay safe. Stay vigilant, stay informed.
        </p>
      </div>
    </div>
  )
}
