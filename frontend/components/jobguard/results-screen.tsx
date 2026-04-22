"use client"

import { useState } from "react"
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  FileSpreadsheet,
  ChevronRight,
  Briefcase,
  Building2,
  MapPin,
  Clock,
  Users,
  DollarSign,
  FileText,
  ListChecks,
  Gift,
  Mail,
  User,
  Globe,
  FileCheck,
  Search,
  Shield,
  Check,
  Send,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import type { ScanResult, SignalStatus, RiskLevel } from "@/lib/jobguard-types"
import { cn } from "@/lib/utils"

interface ResultsScreenProps {
  result: ScanResult
  onExport: () => void
  onBack: () => void
  onMarkApplied?: () => void
  appliedState?: "idle" | "pending" | "done"
}

function getScoreColor(score: number): string {
  if (score >= 70) return "text-success"
  if (score >= 40) return "text-warning"
  return "text-danger"
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

function getSignalIcon(status: SignalStatus) {
  switch (status) {
    case "good":
      return <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
    case "warn":
      return <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
    case "bad":
      return <XCircle className="w-4 h-4 text-danger shrink-0" />
  }
}

function getSignalBg(status: SignalStatus) {
  switch (status) {
    case "good":
      return "bg-success/5 border-success/10"
    case "warn":
      return "bg-warning/5 border-warning/10"
    case "bad":
      return "bg-danger/5 border-danger/10"
  }
}

const nextSteps = [
  { icon: Globe, text: "Verify company domain and careers page" },
  { icon: User, text: "Check recruiter profile (if present)" },
  { icon: Shield, text: "Never send SSN/bank info early" },
  { icon: Mail, text: "Validate interview process (no Telegram-only)" },
  { icon: Search, text: "Cross-check job exists on company site" },
  { icon: Building2, text: "Search company on registry/directories" },
]

// Strip the extension's "Unknown (extract from description)" hint, which
// should never reach end users — it's only a signal to the LLM.
function cleanUnknown(value: string | undefined | null): string {
  if (!value) return ""
  const v = value.trim()
  if (/^unknown\s*\(extract/i.test(v)) return ""
  if (v === "Unknown title" || v === "Unknown company") return ""
  return v
}

export function ResultsScreen({
  result,
  onExport,
  onBack,
  onMarkApplied,
  appliedState = "idle",
}: ResultsScreenProps) {
  const { trustScore, riskLevel, primaryWarning, snapshot, jobPostSignals, companySignals, resumeMatch } = result
  const displayTitle = cleanUnknown(snapshot.jobTitle) || "Untitled listing"
  const displayCompany = cleanUnknown(snapshot.companyName) || "Unnamed company"
  const [copied, setCopied] = useState(false)

  async function copyToClipboard() {
    const payload = {
      trustScore,
      riskLevel,
      primaryWarning,
      jobTitle: snapshot.jobTitle,
      companyName: snapshot.companyName,
      url: snapshot.pageUrl,
      jobPostSignals: jobPostSignals.map((s) => ({ status: s.status, label: s.label, evidence: s.evidence })),
      companySignals: companySignals.map((s) => ({ status: s.status, label: s.label, evidence: s.evidence })),
      resumeMatch: resumeMatch && resumeMatch.score > 0 ? resumeMatch : undefined,
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked in some extension contexts; fail quietly.
    }
  }

  const jobSignalCounts = {
    good: jobPostSignals.filter((s) => s.status === "good").length,
    warn: jobPostSignals.filter((s) => s.status === "warn").length,
    bad: jobPostSignals.filter((s) => s.status === "bad").length,
  }

  const companySignalCounts = {
    good: companySignals.filter((s) => s.status === "good").length,
    warn: companySignals.filter((s) => s.status === "warn").length,
    bad: companySignals.filter((s) => s.status === "bad").length,
  }

  return (
    <div className="pb-24">
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Trust Score */}
        <div className="text-center space-y-3">
          <div className="relative w-32 h-32 mx-auto">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-muted/30"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray={`${trustScore * 2.83} 283`}
                strokeLinecap="round"
                className={getScoreColor(trustScore)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn("text-4xl font-bold", getScoreColor(trustScore))}>{trustScore}</span>
              <span className="text-xs text-muted-foreground">Trust Score</span>
            </div>
          </div>
          <Badge variant="outline" className={cn("text-sm px-3 py-1", getRiskBadgeStyle(riskLevel))}>
            {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk
          </Badge>
        </div>

        {/* Primary Warning */}
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex gap-3">
            <AlertTriangle
              className={cn(
                "w-5 h-5 shrink-0 mt-0.5",
                riskLevel === "high" && "text-danger",
                riskLevel === "medium" && "text-warning",
                riskLevel === "low" && "text-success"
              )}
            />
            <p className="text-sm text-foreground leading-relaxed">{primaryWarning}</p>
          </div>
        </div>

        {/* Listing Snapshot */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-muted-foreground" />
            Listing Snapshot
          </h3>
          <div className="p-4 rounded-xl bg-card border border-border space-y-3">
            <div>
              <h4 className="font-semibold text-foreground">{displayTitle}</h4>
              <p className="text-sm text-muted-foreground">{displayCompany}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Badge variant="secondary" className="text-xs">{snapshot.platform}</Badge>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                {snapshot.location}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Briefcase className="w-3.5 h-3.5" />
                {snapshot.employmentType}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                {snapshot.postedDate}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                <Users className="w-3.5 h-3.5" />
                {snapshot.applicantCount}
              </div>
            </div>
            <div className="border-t border-border pt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <DollarSign className={cn("w-3.5 h-3.5", snapshot.salaryMentioned ? "text-success" : "text-warning")} />
                  <span className="text-muted-foreground">Salary: {snapshot.salaryMentioned ? "Yes" : "No"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ListChecks className={cn("w-3.5 h-3.5", snapshot.responsibilitiesPresent ? "text-success" : "text-warning")} />
                  <span className="text-muted-foreground">Duties: {snapshot.responsibilitiesPresent ? "Yes" : "No"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className={cn("w-3.5 h-3.5", snapshot.requirementsPresent ? "text-success" : "text-warning")} />
                  <span className="text-muted-foreground">Reqs: {snapshot.requirementsPresent ? "Yes" : "No"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Gift className={cn("w-3.5 h-3.5", snapshot.benefitsPresent ? "text-success" : "text-warning")} />
                  <span className="text-muted-foreground">Benefits: {snapshot.benefitsPresent ? "Yes" : "No"}</span>
                </div>
              </div>
              {snapshot.contactInfo && (
                <div className="flex items-center gap-2 text-xs text-warning">
                  <Mail className="w-3.5 h-3.5" />
                  <span>{snapshot.contactInfo}</span>
                </div>
              )}
              {snapshot.recruiterVisible && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <User className="w-3.5 h-3.5" />
                  <span>Recruiter: {snapshot.recruiterVisible}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Resume Match (only if a resume was sent) */}
        {resumeMatch && resumeMatch.score > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              Resume Match
            </h3>
            <div className="p-4 rounded-xl bg-card border border-border space-y-3">
              <div className="flex items-center gap-4">
                <div className={cn("text-3xl font-bold tabular-nums", getScoreColor(resumeMatch.score))}>
                  {resumeMatch.score}
                  <span className="text-base text-muted-foreground font-medium">/100</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed flex-1">{resumeMatch.summary}</p>
              </div>
              {resumeMatch.strengths.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-success">Strengths</p>
                  <ul className="space-y-1">
                    {resumeMatch.strengths.map((s, i) => (
                      <li key={i} className="text-xs text-foreground flex gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {resumeMatch.gaps.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-warning">Gaps</p>
                  <ul className="space-y-1">
                    {resumeMatch.gaps.map((g, i) => (
                      <li key={i} className="text-xs text-foreground flex gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Evidence Breakdown */}
        <Accordion type="multiple" defaultValue={["job-signals", "company-signals"]} className="space-y-3">
          {/* Job Post Signals */}
          <AccordionItem value="job-signals" className="border border-border rounded-xl overflow-hidden bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center justify-between w-full pr-2">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">Job Post Signals</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-success">{jobSignalCounts.good}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-warning">{jobSignalCounts.warn}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-danger">{jobSignalCounts.bad}</span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-2">
              {jobPostSignals.map((signal) => (
                <div
                  key={signal.id}
                  className={cn("p-3 rounded-lg border", getSignalBg(signal.status))}
                >
                  <div className="flex items-start gap-2">
                    {getSignalIcon(signal.status)}
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{signal.label}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{signal.evidence}</p>
                    </div>
                  </div>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>

          {/* Company Signals */}
          <AccordionItem value="company-signals" className="border border-border rounded-xl overflow-hidden bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center justify-between w-full pr-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">Company Legitimacy Signals</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-success">{companySignalCounts.good}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-warning">{companySignalCounts.warn}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-danger">{companySignalCounts.bad}</span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-2">
              {companySignals.map((signal) => (
                <div
                  key={signal.id}
                  className={cn("p-3 rounded-lg border", getSignalBg(signal.status))}
                >
                  <div className="flex items-start gap-2">
                    {getSignalIcon(signal.status)}
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{signal.label}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{signal.evidence}</p>
                    </div>
                  </div>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>

          {/* Next Steps */}
          <AccordionItem value="next-steps" className="border border-border rounded-xl overflow-hidden bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <span className="font-semibold text-sm">Recommended Next Steps</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-2">
                {nextSteps.map((step, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border"
                  >
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <step.icon className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-sm text-foreground">{step.text}</span>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Fixed Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-3">
        <div className="max-w-md mx-auto space-y-2">
          {onMarkApplied && (
            <Button
              size="sm"
              onClick={onMarkApplied}
              disabled={appliedState !== "idle"}
              className="w-full gap-2"
            >
              {appliedState === "done" ? (
                <>
                  <Check className="w-4 h-4" /> Logged to sheet
                </>
              ) : appliedState === "pending" ? (
                "Logging…"
              ) : (
                <>
                  <Send className="w-4 h-4" /> Mark as applied
                </>
              )}
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={copyToClipboard} className="gap-2">
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy JSON"}
            </Button>
            <Button variant="outline" size="sm" onClick={onExport} className="gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              Export
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
