"use client"

import { useEffect, useState } from "react"
import { Shield, FileText, FileSpreadsheet, Scan, ChevronRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface OnboardingProps {
  onDismiss: () => void
  onGoToResume: () => void
  onGoToSheets: () => void
}

type Step = {
  icon: typeof Shield
  title: string
  body: string
  cta: string
}

export function Onboarding({ onDismiss, onGoToResume, onGoToSheets }: OnboardingProps) {
  const [index, setIndex] = useState(0)

  // Lock body scroll while the overlay is up.
  useEffect(() => {
    if (typeof document === "undefined") return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const steps: Step[] = [
    {
      icon: FileText,
      title: "Add your resume",
      body: "Upload a PDF, DOCX, or paste your resume text. JobGuard uses it to gauge how well each listing fits you, and to auto-fill application forms.",
      cta: "Add resume",
    },
    {
      icon: FileSpreadsheet,
      title: "Log scans to Google Sheets (optional)",
      body: "Connect a Google account to auto-append every scan to your own JobGuard Scans sheet. Skip this step if you'd rather keep everything local.",
      cta: "Connect Sheets",
    },
    {
      icon: Scan,
      title: "Scan your first listing",
      body: "Open a LinkedIn or Indeed job posting, then click Scan. You'll get a trust score, company deep-dive, and a resume-to-job fit assessment.",
      cta: "Get started",
    },
  ]

  const step = steps[index]
  const Icon = step.icon
  const isLast = index === steps.length - 1

  function next() {
    if (index === 0) {
      // Jump straight to resume
      onGoToResume()
      onDismiss()
      return
    }
    if (index === 1) {
      onGoToSheets()
      onDismiss()
      return
    }
    onDismiss()
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5">
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-3 top-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Skip onboarding"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 pt-1">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Welcome to JobGuard
          </span>
        </div>

        <div className="space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Icon className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">{step.title}</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{step.body}</p>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1.5 pt-1">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === index ? "w-6 bg-primary" : "w-2 bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Skip for now
          </Button>
          <div className="flex items-center gap-2">
            {!isLast && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
                className="gap-1"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button size="sm" onClick={next}>
              {step.cta}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
