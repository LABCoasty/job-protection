export type RiskLevel = "low" | "medium" | "high"

export type SignalStatus = "good" | "warn" | "bad"

export interface JobPostSignal {
  id: string
  status: SignalStatus
  label: string
  evidence: string
}

export interface CompanySignal {
  id: string
  status: SignalStatus
  label: string
  evidence: string
}

export interface ListingSnapshot {
  jobTitle: string
  companyName: string
  platform: string
  pageUrl: string
  location: string
  employmentType: string
  postedDate: string
  applicantCount: string
  salaryMentioned: boolean
  responsibilitiesPresent: boolean
  requirementsPresent: boolean
  benefitsPresent: boolean
  contactInfo: string | null
  recruiterVisible: string | null
  descriptionLength: number
}

export interface ResumeMatch {
  score: number
  summary: string
  strengths: string[]
  gaps: string[]
}

export interface ScanResult {
  id: string
  timestamp: Date
  trustScore: number
  riskLevel: RiskLevel
  primaryWarning: string
  snapshot: ListingSnapshot
  jobPostSignals: JobPostSignal[]
  companySignals: CompanySignal[]
  resumeMatch?: ResumeMatch | null
}

export interface ScanHistoryItem {
  id: string
  jobTitle: string
  companyName: string
  trustScore: number
  riskLevel: RiskLevel
  timestamp: Date
  platform: string
}

export type Screen = "home" | "scanning" | "results" | "history" | "export" | "resume" | "about"
