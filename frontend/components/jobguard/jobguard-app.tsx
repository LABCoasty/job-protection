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
import type { Screen, ScanResult, ScanHistoryItem } from "@/lib/jobguard-types"
import type { ScanRequestPayload } from "@/lib/api"
import { getScan, getHistory, setAccessToken } from "@/lib/api"

export function JobGuardApp() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("home")
  const [currentResult, setCurrentResult] = useState<ScanResult | null>(null)
  const [pendingScanPayload, setPendingScanPayload] = useState<ScanRequestPayload | null>(null)
  const [history, setHistory] = useState<ScanHistoryItem[]>([])
  const [detectedPlatform] = useState<string | null>("LinkedIn")
  const [hasToken, setHasToken] = useState<boolean>(true)
  const [scanRequestId, setScanRequestId] = useState<string | null>(null)
  const [scanStep, setScanStep] = useState<string>("extract")
  const [scanError, setScanError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

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
      if (d.type === "SCAN_PROGRESS") {
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
        window.setTimeout(() => setBanner(null), 5000)
      }
    }
    window.addEventListener("message", listener)
    return () => window.removeEventListener("message", listener)
  }, [scanRequestId])

  // Load history from API on mount and when returning to history
  useEffect(() => {
    if (currentScreen === "history") {
      getHistory().then(setHistory).catch(() => {})
    }
  }, [currentScreen])

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
      .catch(() => {
        // Leave on home or show error toast
      })
  }, [])

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
      .catch(() => {})
  }, [])

  const handleBack = useCallback(() => {
    setCurrentScreen("home")
  }, [])

  if (!hasToken) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Access restricted</h1>
          <p className="text-muted-foreground">
            JobGuard reports are only viewable through the JobGuard Chrome extension.
            Install the extension, configure your access token in its options, and open a
            scan from there.
          </p>
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
          />
        )}
        
        {currentScreen === "export" && (
          <ExportScreen onBack={handleBack} />
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
