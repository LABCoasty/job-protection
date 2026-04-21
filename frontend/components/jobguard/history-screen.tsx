"use client"

import { Clock, ChevronRight, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { ScanHistoryItem, RiskLevel } from "@/lib/jobguard-types"
import { cn } from "@/lib/utils"

interface HistoryScreenProps {
  history: ScanHistoryItem[]
  onSelectScan: (id: string) => void
  onBack: () => void
  loading?: boolean
}

function getRiskBadgeStyle(level: RiskLevel) {
  switch (level) {
    case "low":
      return "bg-success/10 text-success border-success/20"
    case "medium":
      return "bg-warning/10 text-warning border-warning/20"
    case "high":
      return "bg-danger/10 text-danger border-danger/20"
  }
}

function getScoreColor(score: number): string {
  if (score >= 70) return "text-success"
  if (score >= 40) return "text-warning"
  return "text-danger"
}

function formatDate(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60))
      return `${diffMins} min ago`
    }
    return `${diffHours}h ago`
  }
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString()
}

export function HistoryScreen({ history, onSelectScan, onBack, loading = false }: HistoryScreenProps) {
  return (
    <div className="min-h-[calc(100vh-60px)]">
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Recent Scans</h2>
              <p className="text-xs text-muted-foreground">{history.length} scans in history</p>
            </div>
          </div>
          {history.length > 0 && (
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-danger">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* History List */}
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-full p-4 rounded-xl bg-card border border-border flex items-center gap-3 animate-pulse"
              >
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-muted rounded" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                  <div className="flex gap-2">
                    <div className="h-4 w-14 bg-muted rounded-full" />
                    <div className="h-3 w-20 bg-muted rounded" />
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <div className="h-7 w-10 bg-muted rounded" />
                  <div className="h-4 w-12 bg-muted rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto">
              <Clock className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-foreground font-medium">No scans yet</p>
              <p className="text-sm text-muted-foreground">Your scan history will appear here</p>
            </div>
            <Button variant="outline" onClick={onBack}>
              Scan your first listing
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelectScan(item.id)}
                className="w-full p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-foreground truncate">{item.jobTitle}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{item.companyName}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        {item.platform}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(item.timestamp)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className={cn("text-2xl font-bold", getScoreColor(item.trustScore))}>
                        {item.trustScore}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn("ml-2 text-xs", getRiskBadgeStyle(item.riskLevel))}
                      >
                        {item.riskLevel.charAt(0).toUpperCase() + item.riskLevel.slice(1)}
                      </Badge>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
