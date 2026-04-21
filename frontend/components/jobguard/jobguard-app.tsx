"use client"

import { useState, useCallback, useEffect } from "react"
import { Header } from "./header"
import { HomeScreen } from "./home-screen"
import { ScanningScreen } from "./scanning-screen"
import { ResultsScreen } from "./results-screen"
import { HistoryScreen } from "./history-screen"
import { ExportScreen } from "./export-screen"
import { ResumeScreen } from "./resume-screen"
import { AboutScreen } from "./about-screen"
import { Onboarding } from "./onboarding"
import type { Screen, ScanResult, ScanHistoryItem } from "@/lib/jobguard-types"
import type { ScanRequestPayload } from "@/lib/api"
import { getScan, getHistory, setAccessToken } from "@/lib/api"

export function JobGuardApp() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("home")
  const [currentResult, setCurrentResult] = useState<ScanResult | null>(null)
  const [pendingScanPayload, setPendingScanPayload] = useState<ScanRequestPayload | null>(null)
  const [history, setHistory] = useState<ScanHistoryItem[]>([])
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null)
  const [currentTabUrl, setCurrentTabUrl] = useState<string>("")
  const [hasToken, setHasToken] = useState<boolean>(true)
  const [scanRequestId, setScanRequestId] = useState<string | null>(null)
  const [scanStep, setScanStep] = useState<string>("extract")
  const [scanError, setScanError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const inExtensionFrame = typeof window !== "undefined" && window.parent !== window

  // Extract access token from ?t=... on mount and seed the api client.
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const token = params.get("t")
    if (token) {
      setAccessToken(token)
      setHasToken(true)
    } else {
      // Only enforce token presence when an API URL is configured (i.e., prod).
      const apiUrl = process.env.NEXT_PUBLIC_API_URL
      setHasToken(!apiUrl || apiUrl.includes("localhost"))
    }
  }, [])

  // Listen for messages from the extension side panel (scan results, auto-fill status).
  useEffect(() => {
    if (typeof window === "undefined") return
    const listener = (event: MessageEvent) => {
      const d = event.data
      if (!d || typeof d !== "object") return
      if (d.type === "JOBGUARD_PLATFORM") {
        setDetectedPlatform(d.platform || null)
        setCurrentTabUrl(d.url || "")
      } else if (d.type === "SCAN_PROGRESS") {
        setScanStep(d.step || "extract")
      } else if (d.type === "SCAN_COMPLETE" && (!scanRequestId || d.requestId === scanRequestId)) {
        const result = d.result as ScanResult
        if (result?.timestamp && typeof result.timestamp === "string") {
          result.timestamp = new Date(result.timestamp) as unknown as Date
        }
        setCurrentResult(result)
        setScanError(null)
        setScanRequestId(null)
        setCurrentScreen("results")
      } else if (d.type === "SCAN_ERROR" && (!scanRequestId || d.requestId === scanRequestId)) {
        setScanError(d.error || "Scan failed")
        setScanRequestId(null)
      } else if (d.type === "AUTOFILL_COMPLETE") {
        const filled = d.filled ?? 0
        const missing = (d.missing ?? []).length
        setBanner(
          `Filled ${filled} field${filled === 1 ? "" : "s"}${missing ? ` · ${missing} not found` : ""}`
        )
        window.setTimeout(() => setBanner(null), 4000)
      } else if (d.type === "AUTOFILL_ERROR") {
        setBanner(d.error || "Auto-fill failed")
        window.setTimeout(() => setBanner(null), 6000)
      }
    }
    window.addEventListener("message", listener)
    // Ask the extension for the active tab's platform on mount.
    try {
      window.parent?.postMessage({ type: "JOBGUARD_GET_PLATFORM" }, "*")
    } catch {}
    return () => window.removeEventListener("message", listener)
  }, [scanRequestId])

  // First-run onboarding: show if we're in the extension and the user has
  // neither a stored resume nor dismissed the overlay before.
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!inExtensionFrame) return
    const listener = (event: MessageEvent) => {
      const d = event.data
      if (!d || d.type !== "JOBGUARD_ONBOARDING_STATUS") return
      if (d.hasResume) return // skip if they've already set up a resume
      if (d.dismissed) return
      setShowOnboarding(true)
    }
    window.addEventListener("message", listener)
    try {
      window.parent?.postMessage({ type: "JOBGUARD_GET_ONBOARDING_STATUS" }, "*")
    } catch {}
    return () => window.removeEventListener("message", listener)
  }, [inExtensionFrame])

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false)
    try {
      window.parent?.postMessage({ type: "JOBGUARD_DISMISS_ONBOARDING" }, "*")
    } catch {}
  }, [])

  const showBanner = useCallback((msg: string, ms = 4000) => {
    setBanner(msg)
    window.setTimeout(() => setBanner(null), ms)
  }, [])

  const [historyLoading, setHistoryLoading] = useState(false)

  // Load history from API on mount and when returning to history
  useEffect(() => {
    if (currentScreen !== "history") return
    setHistoryLoading(true)
    getHistory()
      .then((items) => setHistory(items))
      .catch((e) => showBanner(`Couldn't load history: ${e?.message || "network error"}`))
      .finally(() => setHistoryLoading(false))
  }, [currentScreen, showBanner])

  // Extension handoff: open with ?scanId=xxx to load and show that result
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const scanId = params.get("scanId")
    if (!scanId) return
    getScan(scanId)
      .then((result) => {
        setCurrentResult(result)
        setCurrentScreen("results")
      })
      .catch((e) => {
        showBanner(`Couldn't load scan: ${e?.message || "not found"}`)
      })
  }, [showBanner])

  const handleNavigate = useCallback((screen: Screen) => {
    setCurrentScreen(screen)
  }, [])

  const handleScan = useCallback((payload?: ScanRequestPayload | null) => {
    setScanError(null)
    setScanStep("extract")
    if (inExtensionFrame) {
      // Let the extension side panel drive extraction + backend call.
      const rid = Math.random().toString(36).slice(2)
      setScanRequestId(rid)
      setPendingScanPayload(null)
      setCurrentScreen("scanning")
      try {
        window.parent?.postMessage({ type: "SCAN_REQUEST", requestId: rid }, "*")
      } catch {}
      // Timeout: if no response in 45s, surface a retryable error.
      const timeoutMs = 45_000
      window.setTimeout(() => {
        setScanRequestId((current) => {
          if (current === rid) {
            setScanError(
              "Scan is taking too long. The backend may be waking up — try again in a moment."
            )
            return null
          }
          return current
        })
      }, timeoutMs)
      return
    }
    // Standalone dev mode: if a payload was provided, fetch directly; else show help screen.
    setPendingScanPayload(payload ?? null)
    setCurrentScreen("scanning")
  }, [inExtensionFrame])

  const handleAutofill = useCallback(() => {
    if (!inExtensionFrame) {
      setBanner("Open this page inside the JobGuard Chrome extension to auto-fill forms.")
      window.setTimeout(() => setBanner(null), 5000)
      return
    }
    setBanner("Filling form…")
    const rid = Math.random().toString(36).slice(2)
    try {
      window.parent?.postMessage({ type: "AUTOFILL_REQUEST", requestId: rid }, "*")
    } catch {}
  }, [inExtensionFrame])

  const handleScanComplete = useCallback((result: ScanResult) => {
    setCurrentResult(result)
    setCurrentScreen("results")
  }, [])

  const handleExport = useCallback(() => {
    setCurrentScreen("export")
  }, [])

  const handleSelectScan = useCallback((id: string) => {
    getScan(id)
      .then((result) => {
        setCurrentResult(result)
        setCurrentScreen("results")
      })
      .catch((e) => showBanner(`Couldn't load that scan: ${e?.message || "not found"}`))
  }, [showBanner])

  const handleBack = useCallback(() => {
    setCurrentScreen("home")
  }, [])

  if (!hasToken) {
    const openSettings = () => {
      try {
        window.parent?.postMessage({ type: "JOBGUARD_OPEN_SETTINGS" }, "*")
      } catch {}
    }
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-5">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Access restricted</h1>
            <p className="text-muted-foreground mt-2 leading-relaxed text-sm">
              JobGuard reports are only viewable through the Chrome extension.
              Open Settings and paste your access token, then reload this page.
            </p>
          </div>
          {inExtensionFrame && (
            <button
              type="button"
              onClick={openSettings}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Open Settings
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header currentScreen={currentScreen} onNavigate={handleNavigate} />
      {banner && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-lg px-4 py-2 text-sm text-foreground shadow-lg max-w-[90%]">
          {banner}
        </div>
      )}
      {showOnboarding && (
        <Onboarding
          onDismiss={dismissOnboarding}
          onGoToResume={() => setCurrentScreen("resume")}
          onGoToSheets={() => setCurrentScreen("export")}
        />
      )}
      
      <main>
        {currentScreen === "home" && (
          <HomeScreen
            onScan={() => handleScan()}
            onAutofill={inExtensionFrame ? handleAutofill : undefined}
            detectedPlatform={detectedPlatform}
          />
        )}
        
        {currentScreen === "scanning" && (
          <ScanningScreen
            listingPayload={pendingScanPayload}
            onComplete={handleScanComplete}
            onBack={handleBack}
            awaitingExtension={inExtensionFrame && scanRequestId !== null}
            externalError={scanError}
            onRetry={() => handleScan()}
          />
        )}
        
        {currentScreen === "results" && currentResult && (
          <ResultsScreen result={currentResult} onExport={handleExport} onBack={handleBack} />
        )}
        
        {currentScreen === "history" && (
          <HistoryScreen
            history={history}
            onSelectScan={handleSelectScan}
            onBack={handleBack}
            loading={historyLoading}
          />
        )}
        
        {currentScreen === "export" && (
          <ExportScreen onBack={handleBack} currentResult={currentResult} />
        )}

        {currentScreen === "resume" && (
          <ResumeScreen onBack={handleBack} />
        )}
        
        {currentScreen === "about" && (
          <AboutScreen onBack={handleBack} />
        )}
      </main>
    </div>
  )
}
