"use client"

import { useState, useCallback, useEffect } from "react"
import { Header } from "./header"
import { HomeScreen } from "./home-screen"
import { ScanningScreen } from "./scanning-screen"
import { ResultsScreen } from "./results-screen"
import { HistoryScreen } from "./history-screen"
import { ExportScreen } from "./export-screen"
import { AboutScreen } from "./about-screen"
import type { Screen, ScanResult, ScanHistoryItem } from "@/lib/jobguard-types"
import type { ScanRequestPayload } from "@/lib/api"
import { getScan, getHistory } from "@/lib/api"

export function JobGuardApp() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("home")
  const [currentResult, setCurrentResult] = useState<ScanResult | null>(null)
  const [pendingScanPayload, setPendingScanPayload] = useState<ScanRequestPayload | null>(null)
  const [history, setHistory] = useState<ScanHistoryItem[]>([])
  const [detectedPlatform] = useState<string | null>("LinkedIn")

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
    setPendingScanPayload(payload ?? null)
    setCurrentScreen("scanning")
  }, [])

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

  return (
    <div className="min-h-screen bg-background">
      <Header currentScreen={currentScreen} onNavigate={handleNavigate} />
      
      <main>
        {currentScreen === "home" && (
          <HomeScreen onScan={() => handleScan()} detectedPlatform={detectedPlatform} />
        )}
        
        {currentScreen === "scanning" && (
          <ScanningScreen
            listingPayload={pendingScanPayload}
            onComplete={handleScanComplete}
            onBack={handleBack}
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
        
        {currentScreen === "about" && (
          <AboutScreen onBack={handleBack} />
        )}
      </main>
    </div>
  )
}
