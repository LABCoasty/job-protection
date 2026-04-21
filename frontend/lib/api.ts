import type { ListingSnapshot, ScanResult, ScanHistoryItem } from "./jobguard-types"

const getBaseUrl = () =>
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : "http://localhost:8000"

export type ScanRequestPayload = ListingSnapshot & { description?: string | null }

export type ScanResponse = { scanId: string; result: ScanResult }

export async function postScan(payload: ScanRequestPayload): Promise<ScanResponse> {
  const res = await fetch(`${getBaseUrl()}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Scan failed: ${res.status} ${text}`)
  }
  const data = await res.json()
  if (data.result?.timestamp) {
    data.result.timestamp = new Date(data.result.timestamp)
  }
  return data
}

export async function getScan(scanId: string): Promise<ScanResult> {
  const res = await fetch(`${getBaseUrl()}/scan/${encodeURIComponent(scanId)}`)
  if (!res.ok) {
    if (res.status === 404) throw new Error("Scan not found")
    const text = await res.text()
    throw new Error(`Failed to load scan: ${res.status} ${text}`)
  }
  const data = await res.json()
  if (data.timestamp) data.timestamp = new Date(data.timestamp)
  return data
}

export async function getHistory(): Promise<ScanHistoryItem[]> {
  const res = await fetch(`${getBaseUrl()}/history`)
  if (!res.ok) {
    return []
  }
  const data = await res.json()
  if (!Array.isArray(data)) return []
  return data.map((item: ScanHistoryItem & { timestamp?: string }) => {
    if (item.timestamp && typeof item.timestamp === "string") {
      return { ...item, timestamp: new Date(item.timestamp) }
    }
    return item
  })
}
