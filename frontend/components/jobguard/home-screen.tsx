"use client"

import { Scan, Shield, Building2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface HomeScreenProps {
  onScan: () => void
  detectedPlatform: string | null
}

export function HomeScreen({ onScan, detectedPlatform }: HomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-60px)] px-4 py-8">
      <div className="w-full max-w-sm space-y-8 text-center">
        {/* Hero */}
        <div className="space-y-4">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Shield className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Trust Check for Job Posts</h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Verify job listings before you apply. Get risk scores and evidence-based analysis.
            </p>
          </div>
        </div>

        {/* Platform Detection */}
        {detectedPlatform && (
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground">Detected:</span>
            <Badge variant="secondary" className="text-xs font-medium">
              {detectedPlatform}
            </Badge>
          </div>
        )}

        {/* Scan Button */}
        <Button
          size="lg"
          className="w-full h-14 text-base font-semibold gap-3"
          onClick={onScan}
        >
          <Scan className="w-5 h-5" />
          Scan this listing
        </Button>

        {/* Features */}
        <div className="grid grid-cols-2 gap-3 pt-4">
          <div className="p-4 rounded-xl bg-card border border-border space-y-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Detect scams, ghost jobs & misleading listings
            </p>
          </div>
          <div className="p-4 rounded-xl bg-card border border-border space-y-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Verify company legitimacy & reputation signals
            </p>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground/70 px-4">
          We analyze job post quality + company legitimacy signals to help you make informed decisions.
        </p>
      </div>
    </div>
  )
}
