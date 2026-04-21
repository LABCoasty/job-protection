import type { ScanResult, ScanHistoryItem, JobPostSignal, CompanySignal, ListingSnapshot } from "./jobguard-types"

export const mockSnapshot: ListingSnapshot = {
  jobTitle: "Senior Software Engineer",
  companyName: "TechFlow Solutions",
  platform: "LinkedIn",
  pageUrl: "https://linkedin.com/jobs/view/123456",
  location: "Remote (US)",
  employmentType: "Full-time",
  postedDate: "3 days ago",
  applicantCount: "127 applicants",
  salaryMentioned: false,
  responsibilitiesPresent: true,
  requirementsPresent: true,
  benefitsPresent: false,
  contactInfo: "careers@techflow-jobs.net",
  recruiterVisible: "Sarah Miller",
  descriptionLength: 450,
}

export const mockJobPostSignals: JobPostSignal[] = [
  {
    id: "1",
    status: "good",
    label: "Has clear responsibilities",
    evidence: "Lists 6 specific job duties including \"architect scalable systems\" and \"mentor junior developers\"",
  },
  {
    id: "2",
    status: "good",
    label: "Has requirements",
    evidence: "Specifies 5+ years experience, specific tech stack (React, Node.js, AWS)",
  },
  {
    id: "3",
    status: "warn",
    label: "No salary info",
    evidence: "No salary range or compensation details found in the listing",
  },
  {
    id: "4",
    status: "bad",
    label: "External email in description",
    evidence: "Found: careers@techflow-jobs.net (domain doesn't match company)",
  },
  {
    id: "5",
    status: "warn",
    label: "Urgent language detected",
    evidence: "Contains phrases: \"immediate hire\", \"apply ASAP\"",
  },
  {
    id: "6",
    status: "good",
    label: "Description length adequate",
    evidence: "450 words - within normal range for detailed job posting",
  },
  {
    id: "7",
    status: "warn",
    label: "Repost pattern detected",
    evidence: "Similar listing found posted 2 weeks ago, then again 1 week ago",
  },
]

export const mockCompanySignals: CompanySignal[] = [
  {
    id: "1",
    status: "good",
    label: "Official website found",
    evidence: "https://techflowsolutions.com - active site with SSL certificate",
  },
  {
    id: "2",
    status: "warn",
    label: "Domain mismatch detected",
    evidence: "Email domain (techflow-jobs.net) differs from company site (techflowsolutions.com)",
  },
  {
    id: "3",
    status: "good",
    label: "Has About/Contact page",
    evidence: "Found /about and /contact pages with physical address listed",
  },
  {
    id: "4",
    status: "good",
    label: "LinkedIn company page exists",
    evidence: "1,200 followers, 45 employees listed, active posts",
  },
  {
    id: "5",
    status: "warn",
    label: "Limited business registry info",
    evidence: "Company not found in state business registry databases",
  },
  {
    id: "6",
    status: "warn",
    label: "Mixed reputation signals",
    evidence: "3.2/5 on Glassdoor (12 reviews), some mention hiring process issues",
  },
]

export const mockScanResult: ScanResult = {
  id: "scan-001",
  timestamp: new Date(),
  trustScore: 62,
  riskLevel: "medium",
  primaryWarning: "Medium risk: External email domain mismatch and missing salary info suggest caution. Verify company directly before proceeding.",
  snapshot: mockSnapshot,
  jobPostSignals: mockJobPostSignals,
  companySignals: mockCompanySignals,
}

export const mockScanHistory: ScanHistoryItem[] = [
  {
    id: "scan-001",
    jobTitle: "Senior Software Engineer",
    companyName: "TechFlow Solutions",
    trustScore: 62,
    riskLevel: "medium",
    timestamp: new Date(),
    platform: "LinkedIn",
  },
  {
    id: "scan-002",
    jobTitle: "Product Manager",
    companyName: "Acme Corp",
    trustScore: 89,
    riskLevel: "low",
    timestamp: new Date(Date.now() - 86400000),
    platform: "Indeed",
  },
  {
    id: "scan-003",
    jobTitle: "Data Analyst - Remote",
    companyName: "FastGrowth Inc",
    trustScore: 34,
    riskLevel: "high",
    timestamp: new Date(Date.now() - 172800000),
    platform: "LinkedIn",
  },
  {
    id: "scan-004",
    jobTitle: "Marketing Coordinator",
    companyName: "Global Brands LLC",
    trustScore: 78,
    riskLevel: "low",
    timestamp: new Date(Date.now() - 259200000),
    platform: "Glassdoor",
  },
  {
    id: "scan-005",
    jobTitle: "DevOps Engineer",
    companyName: "CloudNine Systems",
    trustScore: 45,
    riskLevel: "medium",
    timestamp: new Date(Date.now() - 345600000),
    platform: "Company Site",
  },
]
