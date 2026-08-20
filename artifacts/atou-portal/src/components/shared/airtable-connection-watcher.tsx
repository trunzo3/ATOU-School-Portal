import { useEffect, useRef } from "react"
import {
  useGetAirtableStatus,
  getGetAirtableStatusQueryKey,
  type AirtableStatus,
} from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"

// How often the admin portal re-checks the Airtable connection while a tab
// is open. The server only probes Airtable when sync is allowed there, so
// this polling never touches Airtable from an isolated dev environment.
const POLL_EVERY_MS = 60 * 1000

// Connection alerts stay on screen until dismissed — an admin who looks up
// a minute later should still see that the connection changed. (A very
// large finite duration, because Radix handles Infinity inconsistently.)
const STICKY_TOAST_MS = 1000 * 60 * 60

/**
 * Watches the Airtable connection from anywhere in the admin area and pops
 * a toast whenever it changes: connection lost/restored, and a sync pass
 * starting to fail or recovering. The first status after load only sets the
 * baseline — alerts fire on CHANGES, never on the initial state.
 *
 * Render it once inside the admin layout (signed-in admins only, so the
 * poll can't 401 on public pages). It renders nothing.
 */
export function AirtableConnectionWatcher() {
  const { toast } = useToast()
  const { data } = useGetAirtableStatus({
    query: {
      queryKey: getGetAirtableStatusQueryKey(),
      refetchInterval: POLL_EVERY_MS,
      // A stale-but-cached status is fine while the server restarts; the
      // previous data sticks around, so a blip never fires a false alert.
      retry: false,
    },
  })
  const previous = useRef<AirtableStatus | null>(null)

  useEffect(() => {
    if (!data) return
    const last = previous.current
    previous.current = data
    if (!last) return // first load: baseline only

    if (last.connected !== data.connected) {
      if (data.connected) {
        toast({
          duration: STICKY_TOAST_MS,
          title: "Airtable connection restored",
          description: "Sync with the Airtable Workshops table is working again.",
        })
      } else {
        toast({
          duration: STICKY_TOAST_MS,
          variant: "destructive",
          title: "Airtable connection lost",
          description:
            data.syncAllowed
              ? "The portal can't reach Airtable right now. Answer changes will stop syncing until the connection is restored."
              : "Airtable sync is now disabled in this environment.",
        })
      }
      return
    }

    // Same connection state, but the latest sync pass flipped between
    // succeeding and failing — that's a connection-quality change too.
    if (last.lastSyncOk !== data.lastSyncOk && data.lastSyncOk !== null) {
      if (data.lastSyncOk === false) {
        toast({
          duration: STICKY_TOAST_MS,
          variant: "destructive",
          title: "Airtable sync failed",
          description: data.lastSyncMessage ?? "The last sync pass did not finish cleanly.",
        })
      } else if (last.lastSyncOk === false) {
        toast({
          duration: STICKY_TOAST_MS,
          title: "Airtable sync recovered",
          description: data.lastSyncMessage ?? "The latest sync pass finished cleanly.",
        })
      }
    }
  }, [data, toast])

  return null
}
