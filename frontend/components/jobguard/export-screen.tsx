"use client"

import { useEffect, useState } from "react"
import {
  FileSpreadsheet,
  Link2,
  Unlink,
  ExternalLink,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import type { ScanResult } from "@/lib/jobguard-types"

interface ExportScreenProps {
  onBack: () => void
  currentResult: ScanResult | null
}

function cleanUnknownValue(value: string | null | undefined): string {
  if (!value) return ""
  const v = value.trim()
  if (/^unknown\s*\(extract/i.test(v)) return ""
  return v
}

const cleanTitle = (v: string | null | undefined) => cleanUnknownValue(v) || "this listing"
const cleanCompany = (v: string | null | undefined) => cleanUnknownValue(v) || "the company"

export function ExportScreen({ currentResult }: ExportScreenProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null)
  const [autoExport, setAutoExport] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const listener = (event: MessageEvent) => {
      const d = event.data
      if (!d || typeof d !== "object") return
      if (d.type === "JOBGUARD_GOOGLE_STATUS") {
        setIsConnected(Boolean(d.connected))
        setSpreadsheetUrl(d.spreadsheetUrl || null)
        setAutoExport(Boolean(d.autoLog))
      } else if (d.type === "JOBGUARD_EXPORT_RESULT") {
        setBusy(false)
        if (d.ok) {
          setStatus("Appended to your JobGuard Scans sheet.")
        } else {
          setStatus(d.error || "Export failed.")
        }
      }
    }
    window.addEventListener("message", listener)
    try {
      window.parent?.postMessage({ type: "JOBGUARD_GET_GOOGLE_STATUS" }, "*")
    } catch {}
    return () => window.removeEventListener("message", listener)
  }, [])

  function connect() {
    try {
      window.parent?.postMessage({ type: "JOBGUARD_CONNECT_GOOGLE" }, "*")
    } catch {}
  }

  function disconnect() {
    try {
      window.parent?.postMessage({ type: "JOBGUARD_DISCONNECT_GOOGLE" }, "*")
    } catch {}
  }

  function toggleAutoLog(next: boolean) {
    setAutoExport(next)
    try {
      window.parent?.postMessage({ type: "JOBGUARD_SET_AUTOLOG", value: next }, "*")
    } catch {}
  }

  function exportNow() {
    if (!currentResult) return
    setBusy(true)
    setStatus("Appending to your sheet…")
    try {
      window.parent?.postMessage(
        { type: "JOBGUARD_EXPORT_NOW", result: currentResult },
        "*"
      )
    } catch {
      setBusy(false)
      setStatus("Could not reach the extension.")
    }
  }

  return (
    <div className="min-h-[calc(100vh-60px)]">
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Export to Google Sheets</h2>
            <p className="text-xs text-muted-foreground">
              We'll append every scan to a dedicated <span className="font-medium">JobGuard Scans</span> sheet in your Drive.
            </p>
          </div>
        </div>

        {/* Connection */}
        <div className="p-4 rounded-xl bg-card border border-border space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  isConnected ? "bg-success/10" : "bg-muted/30"
                }`}
              >
                {isConnected ? (
                  <Link2 className="w-4 h-4 text-success" />
                ) : (
                  <Unlink className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {isConnected ? "Connected to Google Sheets" : "Not connected"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {isConnected
                    ? spreadsheetUrl
                      ? "Your JobGuard Scans sheet is ready."
                      : "Sheet will be created on your next scan."
                    : "Connect to log every scan to your own Google Sheet."}
                </p>
              </div>
            </div>
            <Button
              variant={isConnected ? "outline" : "default"}
              size="sm"
              onClick={isConnected ? disconnect : connect}
            >
              {isConnected ? "Disconnect" : "Connect"}
            </Button>
          </div>

          {isConnected && spreadsheetUrl && (
            <a
              href={spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              Open sheet <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* Auto-log toggle */}
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <Label htmlFor="auto-export" className="text-sm font-medium text-foreground">
                Auto-log every scan
              </Label>
              <p className="text-xs text-muted-foreground">
                Adds a row to your sheet automatically after each successful scan.
              </p>
            </div>
            <Switch
              id="auto-export"
              checked={autoExport}
              onCheckedChange={toggleAutoLog}
              disabled={!isConnected}
            />
          </div>
        </div>

        {/* Export current result */}
        <div className="p-4 rounded-xl bg-card border border-border space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Export this scan</p>
            <p className="text-xs text-muted-foreground mt-1">
              {currentResult
                ? `Append "${cleanTitle(currentResult.snapshot.jobTitle)}" at ${cleanCompany(currentResult.snapshot.companyName)} to your sheet.`
                : "Run a scan first — then come back here to append it manually."}
            </p>
          </div>
          <Button
            className="w-full"
            onClick={exportNow}
            disabled={!isConnected || !currentResult || busy}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            {busy ? "Appending…" : "Export now"}
          </Button>
          {status && (
            <div className="flex items-center gap-2 text-xs text-foreground">
              {status.startsWith("Appended") && (
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              )}
              <span>{status}</span>
            </div>
          )}
        </div>

        {/* Columns info */}
        <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-2.5">
          <p className="text-xs font-medium text-foreground">Columns written to the sheet</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              "Scanned At",
              "Job Title",
              "Company",
              "URL",
              "Platform",
              "Trust Score",
              "Risk Level",
              "Primary Warning",
              "Applied At",
              "Notes",
            ].map((col) => (
              <span
                key={col}
                className="text-[11px] px-2 py-0.5 rounded bg-secondary text-secondary-foreground"
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
