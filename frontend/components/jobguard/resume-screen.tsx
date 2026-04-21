"use client"

import { useEffect, useRef, useState } from "react"
import { FileText, Upload, Trash2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { uploadResumeFile } from "@/lib/api"

interface ResumeScreenProps {
  onBack: () => void
}

export function ResumeScreen({ onBack }: ResumeScreenProps) {
  const [text, setText] = useState("")
  const [storedLength, setStoredLength] = useState<number | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [parsed, setParsed] = useState<null | {
    name?: string
    email?: string
    phone?: string
    skills?: string[]
    yearsOfExperience?: string
    currentTitle?: string
    topCompanies?: string[]
  }>(null)
  const [parsing, setParsing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Load any existing resume via the extension bridge (panel.js).
  useEffect(() => {
    if (typeof window === "undefined") return
    const listener = (event: MessageEvent) => {
      const d = event.data
      if (!d || typeof d !== "object") return
      if (d.type === "JOBGUARD_RESUME_DATA") {
        setText(d.text || "")
        setStoredLength(typeof d.length === "number" ? d.length : null)
        setUpdatedAt(d.updatedAt || null)
        setParsed(d.parsed || null)
      } else if (d.type === "JOBGUARD_RESUME_PARSED") {
        setParsed(d.parsed || null)
        setParsing(false)
        setStatus(d.parsed ? "Parsed" : "Could not parse resume")
      }
    }
    window.addEventListener("message", listener)
    try {
      window.parent?.postMessage({ type: "JOBGUARD_GET_RESUME" }, "*")
    } catch {}
    return () => window.removeEventListener("message", listener)
  }, [])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const name = f.name.toLowerCase()
    const isText = name.endsWith(".txt") || name.endsWith(".md") || f.type.startsWith("text/")
    setStatus(`Reading ${f.name}…`)
    try {
      let content = ""
      if (isText) {
        content = await f.text()
      } else {
        // PDF, DOCX: send to backend for text extraction.
        content = await uploadResumeFile(f)
      }
      if (!content.trim()) {
        setStatus(`Extracted 0 characters from ${f.name}. Try a different file.`)
        return
      }
      setText(content)
      setStatus(`Loaded ${f.name} (${content.length.toLocaleString()} chars) — click Save to store`)
    } catch (err) {
      setStatus(`Could not read file: ${(err as Error).message}`)
    }
  }

  function save() {
    const trimmed = text.trim()
    if (!trimmed) {
      setStatus("Paste resume text or upload a .txt file first")
      return
    }
    try {
      window.parent?.postMessage(
        { type: "JOBGUARD_SAVE_RESUME", text: trimmed },
        "*"
      )
      setStatus("Saved")
    } catch {
      setStatus("Could not save")
    }
  }

  function clear() {
    try {
      window.parent?.postMessage({ type: "JOBGUARD_CLEAR_RESUME" }, "*")
      setText("")
      setStoredLength(null)
      setUpdatedAt(null)
      setParsed(null)
      if (fileRef.current) fileRef.current.value = ""
      setStatus("Cleared")
    } catch {}
  }

  function parseNow() {
    const trimmed = text.trim()
    if (!trimmed) {
      setStatus("Save a resume first, then parse")
      return
    }
    setParsing(true)
    setStatus("Parsing…")
    try {
      window.parent?.postMessage({ type: "JOBGUARD_PARSE_RESUME", text: trimmed }, "*")
    } catch {
      setParsing(false)
      setStatus("Could not reach extension")
    }
  }

  return (
    <div className="min-h-[calc(100vh-60px)]">
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Your resume</h2>
            <p className="text-xs text-muted-foreground">
              Stored locally in the extension. Used on every scan to gauge job fit.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload PDF / DOCX / TXT
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFile}
              className="hidden"
            />
            <Button variant="default" size="sm" onClick={save} className="gap-2">
              <Save className="w-4 h-4" />
              Save
            </Button>
            <Button variant="outline" size="sm" onClick={parseNow} disabled={parsing}>
              {parsing ? "Parsing…" : "Parse"}
            </Button>
            <Button variant="ghost" size="sm" onClick={clear} className="gap-2 text-danger hover:text-danger">
              <Trash2 className="w-4 h-4" />
              Clear
            </Button>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your resume here — name, contact, summary, skills, experience, education."
            className="w-full min-h-[220px] p-3 rounded-md bg-background border border-border text-sm text-foreground font-sans resize-y"
          />

          <div className="text-xs text-muted-foreground">
            {storedLength !== null ? (
              <>Stored: {storedLength.toLocaleString()} chars{updatedAt ? ` · updated ${new Date(updatedAt).toLocaleString()}` : ""}</>
            ) : (
              <>Nothing saved yet.</>
            )}
          </div>

          {status && <div className="text-xs text-primary">{status}</div>}
        </div>

        {parsed && (
          <div className="p-4 rounded-xl bg-card border border-border space-y-3">
            <p className="text-sm font-semibold text-foreground">Parsed profile</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {parsed.name && (<><div className="text-muted-foreground">Name</div><div className="text-foreground">{parsed.name}</div></>)}
              {parsed.email && (<><div className="text-muted-foreground">Email</div><div className="text-foreground break-all">{parsed.email}</div></>)}
              {parsed.phone && (<><div className="text-muted-foreground">Phone</div><div className="text-foreground">{parsed.phone}</div></>)}
              {parsed.currentTitle && (<><div className="text-muted-foreground">Current title</div><div className="text-foreground">{parsed.currentTitle}</div></>)}
              {parsed.yearsOfExperience && (<><div className="text-muted-foreground">Experience</div><div className="text-foreground">{parsed.yearsOfExperience}</div></>)}
            </div>
            {parsed.skills && parsed.skills.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">Skills</div>
                <div className="flex flex-wrap gap-1.5">
                  {parsed.skills.slice(0, 24).map((s, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {parsed.topCompanies && parsed.topCompanies.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">Recent companies</div>
                <div className="flex flex-wrap gap-1.5">
                  {parsed.topCompanies.slice(0, 6).map((c, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
