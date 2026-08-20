import {
  useGetLearningLabVideos,
  useCreateLearningLabVideo,
  useUpdateLearningLabVideo,
  useDeleteLearningLabVideo,
  getGetLearningLabVideosQueryKey,
  type LearningLabVideo,
} from "@workspace/api-client-react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { GraduationCap, Plus, Edit2, Trash2, Save, CalendarDays } from "lucide-react"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"
import { formatPacificTime } from "@/lib/utils"
import { DeleteConfirmDialog } from "@/components/shared/delete-confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function apiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data?: unknown }).data
    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "string"
    ) {
      return (data as { error: string }).error
    }
  }
  return error instanceof Error ? error.message : fallback
}

// Quick client-side sanity check so obviously wrong links get feedback
// before a round-trip. The server does the authoritative validation.
function looksLikeVideoUrl(raw: string): boolean {
  let input = raw.trim()
  if (!input) return false
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`
  try {
    const host = new URL(input).hostname.toLowerCase().replace(/^www\.|^m\./, "")
    return ["youtube.com", "youtu.be", "youtube-nocookie.com", "vimeo.com", "player.vimeo.com"].includes(host)
  } catch {
    return false
  }
}

export function AdminLearningLab() {
  const { data: videos, isLoading } = useGetLearningLabVideos()
  const createVideo = useCreateLearningLabVideo()
  const updateVideo = useUpdateLearningLabVideo()
  const deleteVideo = useDeleteLearningLabVideo()

  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  // Editor state
  const [title, setTitle] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const [publishedOn, setPublishedOn] = useState("")
  const [description, setDescription] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  const urlLooksWrong = videoUrl.trim() !== "" && !looksLikeVideoUrl(videoUrl)

  const handleOpenNew = () => {
    setEditingId(null)
    setTitle("")
    setVideoUrl("")
    setPublishedOn(new Date().toISOString().split("T")[0])
    setDescription("")
    setFormError(null)
    setEditorOpen(true)
  }

  const handleOpenEdit = (video: LearningLabVideo) => {
    setEditingId(video.id)
    setTitle(video.title)
    setVideoUrl(video.videoUrl)
    setPublishedOn(video.publishedOn)
    setDescription(video.description)
    setFormError(null)
    setEditorOpen(true)
  }

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetLearningLabVideosQueryKey() })

  const handleSave = () => {
    setFormError(null)
    if (!title.trim()) {
      setFormError("A title is required.")
      return
    }
    if (!looksLikeVideoUrl(videoUrl)) {
      setFormError("Paste a YouTube or Vimeo video link (for example https://www.youtube.com/watch?v=... or https://vimeo.com/...).")
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedOn)) {
      setFormError("A publication date is required.")
      return
    }
    const payload = {
      title: title.trim(),
      videoUrl: videoUrl.trim(),
      publishedOn,
      description: description.trim(),
    }
    const onError = (error: unknown) => {
      setFormError(apiErrorMessage(error, "The video could not be saved."))
    }
    if (editingId) {
      updateVideo.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          toast({ title: "Video updated" })
          setEditorOpen(false)
          refresh()
        },
        onError,
      })
    } else {
      createVideo.mutate({ data: payload }, {
        onSuccess: () => {
          toast({ title: "Video added" })
          setEditorOpen(false)
          refresh()
        },
        onError,
      })
    }
  }

  const handleDelete = (id: number) => {
    deleteVideo.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Video deleted" })
        refresh()
      },
    })
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary mb-1">Training</p>
            <h1 className="text-3xl font-serif font-bold text-foreground">Learning Lab</h1>
            <p className="text-muted-foreground mt-1">Video walkthroughs of common workflows in the app.</p>
          </div>
          <Button onClick={handleOpenNew}>
            <Plus className="h-4 w-4 mr-2" />
            Add Video
          </Button>
        </div>

        {!isLoading && videos?.length === 0 && (
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center space-y-3 text-center">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <GraduationCap className="h-6 w-6 text-muted-foreground/60" />
                </div>
                <p className="text-muted-foreground font-medium">No tutorial videos yet.</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Record a walkthrough, upload it to YouTube or Vimeo, then paste the link here to share it with the team.
                </p>
                <Button variant="outline" size="sm" onClick={handleOpenNew}>
                  Add your first video
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {videos?.map((video) => (
            <Card key={video.id} className="overflow-hidden flex flex-col">
              <div className="aspect-video bg-black">
                {video.embedUrl ? (
                  <iframe
                    src={video.embedUrl}
                    title={video.title}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-white/70 px-4 text-center">
                    This video link can't be embedded. Edit the entry and paste a YouTube or Vimeo link.
                  </div>
                )}
              </div>
              <CardContent className="p-5 flex-1 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-serif font-bold text-lg text-foreground leading-snug">{video.title}</h2>
                  <div className="flex gap-1 -mt-1 -mr-2 shrink-0">
                    <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 hover:bg-primary/10" onClick={() => handleOpenEdit(video)} title="Edit video">
                      <Edit2 className="h-4 w-4 text-primary" />
                    </Button>
                    <DeleteConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" title="Delete video">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      }
                      title="Delete Video"
                      description={`Are you sure you want to delete "${video.title}"? This only removes the card here — the video stays on YouTube/Vimeo.`}
                      confirmLabel="Delete Video"
                      onConfirm={() => handleDelete(video.id)}
                      pending={deleteVideo.isPending}
                    />
                  </div>
                </div>
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatPacificTime(video.publishedOn)}
                </p>
                {video.description && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{video.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Add / Edit Dialog */}
        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Video" : "Add Video"}</DialogTitle>
              <DialogDescription>
                Paste a YouTube or Vimeo link — the video plays right on this page. Unlisted and privacy-restricted links work too.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="video-url">Video Link</Label>
                <Input
                  id="video-url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
                {urlLooksWrong && (
                  <p className="text-sm text-destructive">
                    Only YouTube and Vimeo links are supported.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="video-title">Title</Label>
                <Input
                  id="video-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Sending logistics emails"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="video-date">Publication Date</Label>
                <Input
                  id="video-date"
                  type="date"
                  value={publishedOn}
                  onChange={(e) => setPublishedOn(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="video-description">Description</Label>
                <Textarea
                  id="video-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this walkthrough cover?"
                  rows={3}
                />
              </div>
              {formError && (
                <p className="text-sm text-destructive" role="alert">{formError}</p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={createVideo.isPending || updateVideo.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {editingId ? "Save Changes" : "Add Video"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  )
}
