"use client"

import { Shield, History, FileSpreadsheet, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Screen } from "@/lib/jobguard-types"

interface HeaderProps {
  currentScreen: Screen
  onNavigate: (screen: Screen) => void
}

export function Header({ currentScreen, onNavigate }: HeaderProps) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-md mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => onNavigate("home")}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg text-foreground">JobGuard</span>
          </button>
          
          <nav className="flex items-center gap-1">
            <Button
              variant={currentScreen === "history" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => onNavigate("history")}
              aria-label="Scan History"
            >
              <History className="h-4 w-4" />
            </Button>
            <Button
              variant={currentScreen === "export" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => onNavigate("export")}
              aria-label="Export to Google Sheets"
            >
              <FileSpreadsheet className="h-4 w-4" />
            </Button>
            <Button
              variant={currentScreen === "about" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => onNavigate("about")}
              aria-label="About JobGuard"
            >
              <Info className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </div>
    </header>
  )
}
