"""Pydantic schemas aligned with frontend jobguard-types.ts."""

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class RiskLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class SignalStatus(str, Enum):
    good = "good"
    warn = "warn"
    bad = "bad"


class JobPostSignal(BaseModel):
    id: str
    status: Literal["good", "warn", "bad"]
    label: str
    evidence: str


class CompanySignal(BaseModel):
    id: str
    status: Literal["good", "warn", "bad"]
    label: str
    evidence: str


class ListingSnapshot(BaseModel):
    jobTitle: str
    companyName: str
    platform: str
    pageUrl: str
    location: str
    employmentType: str
    postedDate: str
    applicantCount: str
    salaryMentioned: bool
    responsibilitiesPresent: bool
    requirementsPresent: bool
    benefitsPresent: bool
    contactInfo: str | None = None
    recruiterVisible: str | None = None
    descriptionLength: int


class ScanRequest(BaseModel):
    """Request body for POST /scan: snapshot + optional raw description for AI."""

    jobTitle: str
    companyName: str
    platform: str
    pageUrl: str
    location: str = ""
    employmentType: str = ""
    postedDate: str = ""
    applicantCount: str = ""
    salaryMentioned: bool = False
    responsibilitiesPresent: bool = False
    requirementsPresent: bool = False
    benefitsPresent: bool = False
    contactInfo: str | None = None
    recruiterVisible: str | None = None
    descriptionLength: int = 0
    description: str | None = None  # raw text for Ollama


class ScanResult(BaseModel):
    id: str
    timestamp: datetime
    trustScore: int
    riskLevel: Literal["low", "medium", "high"]
    primaryWarning: str
    snapshot: ListingSnapshot
    jobPostSignals: list[JobPostSignal]
    companySignals: list[CompanySignal]


class ScanResponse(BaseModel):
    scanId: str
    result: ScanResult


class ScanHistoryItem(BaseModel):
    id: str
    jobTitle: str
    companyName: str
    trustScore: int
    riskLevel: Literal["low", "medium", "high"]
    timestamp: datetime
    platform: str
