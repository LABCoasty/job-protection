"use client"

import { useEffect, useState } from "react"
import { FileSpreadsheet, Check, ChevronDown, Link2, Unlink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ExportScreenProps {
  onBack: () => void
}

export function ExportScreen({ onBack }: ExportScreenProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [autoExport, setAutoExport] = useState(false)
  const [selectedSheet, setSelectedSheet] = useState("")
  const [selectedTab, setSelectedTab] = useState("")

  // Ask the parent (extension side panel) for the current Google Sheets connection
  // state on mount. The parent handles chrome.identity since iframes can't.
  useEffect(() => {
    if (typeof window === "undefined") return
    const listener = (event: MessageEvent) => {
      const data = event.data
      if (!data || data.type !== "JOBGUARD_GOOGLE_STATUS") return
      setIsConnected(Boolean(data.connected))
      setConnectedEmail(data.email || null)
      setAutoExport(Boolean(data.autoLog))
    }
    window.addEventListener("message", listener)
    try {
      window.parent?.postMessage({ type: "JOBGUARD_GET_GOOGLE_STATUS" }, "*")
    } catch {}
    return () => window.removeEventListener("message", listener)
  }, [])

  function requestConnect() {
    try {
      window.parent?.postMessage({ type: "JOBGUARD_CONNECT_GOOGLE" }, "*")
    } catch {}
  }

  function requestDisconnect() {
    try {
      window.parent?.postMessage({ type: "JOBGUARD_DISCONNECT_GOOGLE" }, "*")
    } catch {}
  }

  function requestToggleAutoLog(next: boolean) {
    setAutoExport(next)
    try {
      window.parent?.postMessage({ type: "JOBGUARD_SET_AUTOLOG", value: next }, "*")
    } catch {}
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
            <p className="text-xs text-muted-foreground">Save your scan data for analysis</p>
          </div>
        </div>

        {/* Connection Status */}
        <div className="p-4 rounded-xl bg-card border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isConnected ? "bg-success/10" : "bg-muted/30"}`}>
                {isConnected ? (
                  <Link2 className="w-4 h-4 text-success" />
                ) : (
                  <Unlink className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {isConnected ? "Connected to Google" : "Not connected"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isConnected
                    ? connectedEmail || "Signed in via extension"
                    : "Connect to export scan data"}
                </p>
              </div>
            </div>
            <Button
              variant={isConnected ? "outline" : "default"}
              size="sm"
              onClick={isConnected ? requestDisconnect : requestConnect}
            >
              {isConnected ? "Disconnect" : "Connect Google"}
            </Button>
          </div>
        </div>

        {/* Auto Export Toggle */}
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="auto-export" className="text-sm font-medium text-foreground">
                Auto-export after every scan
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically save results to your spreadsheet
              </p>
            </div>
            <Switch
              id="auto-export"
              checked={autoExport}
              onCheckedChange={requestToggleAutoLog}
              disabled={!isConnected}
            />
          </div>
        </div>

        {/* Sheet Selection */}
        {isConnected && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Select Spreadsheet</Label>
              <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a spreadsheet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="job-tracker">Job Application Tracker</SelectItem>
                  <SelectItem value="scam-research">Scam Research Data</SelectItem>
                  <SelectItem value="new">+ Create new spreadsheet</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedSheet && selectedSheet !== "new" && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Select Sheet/Tab</Label>
                <Select value={selectedTab} onValueChange={setSelectedTab}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a tab" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sheet1">Sheet1</SelectItem>
                    <SelectItem value="jobguard-scans">JobGuard Scans</SelectItem>
                    <SelectItem value="new-tab">+ Create new tab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button className="w-full" disabled={!selectedSheet}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export Now
            </Button>
          </div>
        )}

        {/* Export Columns Info */}
        <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
          <p className="text-xs font-medium text-foreground">Exported columns:</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              "timestamp",
              "platform",
              "job_title",
              "company_name",
              "url",
              "trust_score",
              "risk_label",
              "top_flags",
              "job_signals",
              "company_signals",
            ].map((col) => (
              <span
                key={col}
                className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground font-mono"
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
