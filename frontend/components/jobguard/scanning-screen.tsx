"use client"

import { useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ScanResult } from "@/lib/jobguard-types"
import type { ScanRequestPayload } from "@/lib/api"
import { postScan } from "@/lib/api"
import { Button } from "@/components/ui/button"

interface ScanningScreenProps {
  listingPayload: ScanRequestPayload | null
  onComplete: (result: ScanResult) => void
  onBack: () => void
  // When true, the extension side panel is driving the scan; we just animate
  // while it extracts + calls the backend, and jobguard-app will navigate us
  // to Results when SCAN_COMPLETE arrives. Don't try to postScan ourselves.
  awaitingExtension?: boolean
  // Error bubbled up from the parent (SCAN_ERROR); renders instead of the steps.
  externalError?: string | null
  // Called when the user clicks "Try again" from the error state.
  onRetry?: () => void
}

const scanSteps = [
  "Extracting listing details",
  "Evaluating posting signals",
  "Validating company signals",
  "Building report",
]

export function ScanningScreen({
  listingPayload,
  onComplete,
  onBack,
  awaitingExtension = false,
  externalError = null,
  onRetry,
}: ScanningScreenProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showUseExtension, setShowUseExtension] = useState(false)

  useEffect(() => {
    if (awaitingExtension) {
      // Parent handles everything. Just loop the step animation so the user
      // sees progress until SCAN_COMPLETE arrives.
      const interval = setInterval(() => {
        setCurrentStep((prev) => (prev + 1) % scanSteps.length)
      }, 900)
      return () => clearInterval(interval)
    }
    if (listingPayload?.jobTitle) {
      setError(null)
      const stepInterval = setInterval(() => {
        setCurrentStep((prev) => (prev >= scanSteps.length - 1 ? prev : prev + 1))
      }, 800)
      postScan(listingPayload)
        .then(({ result }) => {
          if (result.timestamp && typeof result.timestamp === "string") {
            result.timestamp = new Date(result.timestamp) as unknown as Date
          }
          onComplete(result)
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Scan failed")
        })
        .finally(() => clearInterval(stepInterval))
      return () => clearInterval(stepInterval)
    }
    // No payload, no extension: show steps then prompt to use the extension.
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= scanSteps.length - 1) {
          clearInterval(interval)
          setTimeout(() => setShowUseExtension(true), 600)
          return prev
        }
        return prev + 1
      })
    }, 800)
    return () => clearInterval(interval)
  }, [listingPayload, onComplete, awaitingExtension])

  const displayError = externalError || error

  if (showUseExtension) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-60px)] px-4 py-6">
        <div className="w-full max-w-md space-y-6 text-center">
          <p className="text-sm text-muted-foreground">
            To scan a job listing, use the JobGuard Chrome extension on a LinkedIn or Indeed job page.
          </p>
          <Button variant="outline" onClick={onBack}>
            Back to home
          </Button>
        </div>
      </div>
    )
  }

  if (displayError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-60px)] px-4 py-6">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
            <span className="text-destructive text-2xl leading-none">!</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{displayError}</p>
          </div>
          <div className="flex flex-col gap-2">
            {onRetry && <Button onClick={onRetry}>Try again</Button>}
            <Button variant="outline" onClick={onBack}>
              Back to home
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-60px)] px-4 py-6">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* Spinner */}
        <div className="relative w-24 h-24 mx-auto">
          <div className="absolute inset-0 rounded-full border-4 border-border" />
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <div className="absolute inset-4 rounded-full bg-card flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-foreground">Analyzing Listing</h2>
          <p className="text-sm text-muted-foreground mt-1">Please wait while we evaluate this job post</p>
        </div>

        {/* Steps */}
        <div className="space-y-3 text-left">
          {scanSteps.map((step, index) => (
            <div
              key={step}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg transition-all duration-300",
                index < currentStep && "bg-success/10",
                index === currentStep && "bg-primary/10",
                index > currentStep && "opacity-40"
              )}
            >
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors",
                  index < currentStep && "bg-success text-success-foreground",
                  index === currentStep && "bg-primary text-primary-foreground",
                  index > currentStep && "bg-muted text-muted-foreground"
                )}
              >
                {index < currentStep ? (
                  <Check className="w-3.5 h-3.5" />
                ) : index === currentStep ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span className="text-xs font-medium">{index + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-sm font-medium transition-colors",
                  index <= currentStep ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
