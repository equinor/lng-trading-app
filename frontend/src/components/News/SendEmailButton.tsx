// frontend/src/components/News/SendEmailButton.tsx
import { useState } from "react"
import { Mail } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import { RequestStatus } from "@/components/News/RequestStatus"
import useCustomToast from "@/hooks/useCustomToast"
import { sendEmailSummary } from "@/services/news/news_api"

const DEFAULT_RECIPIENTS = ["csee@equinor.com"]

export function SendEmailButton({
  dateFrom,
  dateTo,
  categories = [],
}: { dateFrom: string; dateTo: string; categories?: string[] }) {
  const [open, setOpen] = useState(false)
  const [recipients, setRecipients] = useState<string[]>(DEFAULT_RECIPIENTS)
  const [newEmail, setNewEmail] = useState("")
  const [sending, setSending] = useState(false)
  const { showErrorToast } = useCustomToast()

  const addRecipient = () => {
    const trimmed = newEmail.trim().toLowerCase()
    if (trimmed?.includes("@") && !recipients.includes(trimmed)) {
      setRecipients([...recipients, trimmed])
      setNewEmail("")
    }
  }

  const removeRecipient = (email: string) => {
    setRecipients(recipients.filter((r) => r !== email))
  }

  const handleSend = async () => {
    if (recipients.length === 0) return
    setSending(true)
    try {
      for (const recipient of recipients) {
        await sendEmailSummary(recipient, dateFrom || undefined, dateTo || undefined, categories)
      }
      setOpen(false)
    } catch {
      showErrorToast("Failed to send the news summary. Please try again.")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!sending) setOpen(next) }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5">
          <Mail className="h-3.5 w-3.5" />
          Email
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send News Summary</DialogTitle>
          <DialogDescription>
            Email the current sentiment summary to the recipients below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex flex-wrap gap-1.5">
            {recipients.map((email) => (
              <Badge key={email} variant="secondary" className="gap-1 pr-1">
                {email}
                <button
                  type="button"
                  className="ml-1 rounded-full hover:bg-muted-foreground/20 px-1 text-xs"
                  disabled={sending}
                  onClick={() => removeRecipient(email)}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="Add recipient..."
              value={newEmail}
              disabled={sending}
              onChange={(e) => setNewEmail(e.target.value)}
              className="h-9"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRecipient() } }}
            />
            <Button type="button" variant="secondary" size="sm" className="h-9" onClick={addRecipient} disabled={sending || !newEmail.trim()}>
              Add
            </Button>
          </div>
        </div>

        <DialogFooter>
          {sending && <RequestStatus>Sending summary...</RequestStatus>}
          <Button type="button" variant="ghost" disabled={sending} onClick={() => setOpen(false)}>Cancel</Button>
          <LoadingButton type="button" onClick={handleSend} loading={sending} disabled={recipients.length === 0}>
            {sending ? "Sending..." : `Send to ${recipients.length} recipient${recipients.length !== 1 ? "s" : ""}`}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
