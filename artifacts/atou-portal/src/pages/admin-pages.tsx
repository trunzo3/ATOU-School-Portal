import { useGetAdminPages, useCreatePage, useUpdatePage, useDeletePage, exportPages, getGetAdminPagesQueryKey } from "@workspace/api-client-react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileText, Plus, Download, Edit2, Trash2, Globe, EyeOff, Save } from "lucide-react"
import { useState, useRef, useEffect } from "react"
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
  DialogTrigger,
} from "@/components/ui/dialog"

// Simple contentEditable rich text editor
function RichTextEditor({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      // Only set if different to avoid cursor jumping
      if (!editorRef.current.contains(document.activeElement)) {
        editorRef.current.innerHTML = value || ""
      }
    }
  }, [value])

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
    }
  }

  const exec = (command: string, val?: string) => {
    document.execCommand(command, false, val)
    handleInput()
    editorRef.current?.focus()
  }

  return (
    <div className="border rounded-xl overflow-hidden bg-card focus-within:ring-2 focus-within:ring-ring/35">
      <div className="bg-muted/50 border-b p-2 flex gap-2 flex-wrap">
        <Button type="button" variant="outline" size="sm" onClick={() => exec('bold')} className="h-8 w-8 p-0 font-bold">B</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => exec('underline')} className="h-8 w-8 p-0 underline">U</Button>
        <div className="w-px h-8 bg-border mx-1" />
        <Button type="button" variant="outline" size="sm" onClick={() => exec('insertUnorderedList')} className="h-8 px-2 text-xs">Bullet</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => exec('insertOrderedList')} className="h-8 px-2 text-xs">Num</Button>
        <div className="w-px h-8 bg-border mx-1" />
        <select className="text-sm border rounded-lg px-2 h-8 bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(e) => exec('fontSize', e.target.value)} defaultValue="">
          <option value="" disabled>Size</option>
          <option value="3">Normal</option>
          <option value="5">Large</option>
          <option value="7">Huge</option>
        </select>
      </div>
      <div 
        ref={editorRef}
        className="min-h-[200px] max-h-[500px] overflow-y-auto p-4 prose prose-sm max-w-none focus:outline-none"
        contentEditable
        onInput={handleInput}
        data-placeholder="Start typing..."
      />
    </div>
  )
}

export function AdminPages() {
  const { data: pages } = useGetAdminPages()
  const createPage = useCreatePage()
  const updatePage = useUpdatePage()
  const deletePage = useDeletePage()
  
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  
  // Editor state
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [body, setBody] = useState("")
  const [published, setPublished] = useState(false)

  const handleOpenNew = () => {
    setEditingId(null)
    setTitle("")
    setSlug("")
    setBody("")
    setPublished(false)
    setEditorOpen(true)
  }

  const handleOpenEdit = (page: any) => {
    setEditingId(page.id)
    setTitle(page.title)
    setSlug(page.slug)
    setBody(page.body)
    setPublished(page.published)
    setEditorOpen(true)
  }

  const handleSave = () => {
    if (!title || !slug) {
      toast({ title: "Title and slug are required", variant: "destructive" })
      return
    }

    const payload = { title, slug, body, published }

    if (editingId) {
      updatePage.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          toast({ title: "Page updated" })
          setEditorOpen(false)
          queryClient.invalidateQueries({ queryKey: getGetAdminPagesQueryKey() })
        }
      })
    } else {
      createPage.mutate({ data: { ...payload, sortOrder: pages ? pages.length : 0 } }, {
        onSuccess: () => {
          toast({ title: "Page created" })
          setEditorOpen(false)
          queryClient.invalidateQueries({ queryKey: getGetAdminPagesQueryKey() })
        }
      })
    }
  }

  const handleTogglePublish = (id: number, currentStatus: boolean) => {
    updatePage.mutate({ id, data: { published: !currentStatus } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAdminPagesQueryKey() })
      }
    })
  }

  const handleDelete = (id: number) => {
    deletePage.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Page deleted" })
        queryClient.invalidateQueries({ queryKey: getGetAdminPagesQueryKey() })
      }
    })
  }

  const handleExport = async () => {
    try {
      const data = await exportPages()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `atou-pages-export-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast({ title: "Export failed", variant: "destructive" })
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary mb-1">Portal Content</p>
            <h1 className="text-3xl font-serif font-bold text-foreground">Info Pages</h1>
            <p className="text-muted-foreground mt-1">Manage content accessible via the school portal.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export All
            </Button>
            <Button onClick={handleOpenNew}>
              <Plus className="h-4 w-4 mr-2" />
              New Page
            </Button>
          </div>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Path / Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                        <FileText className="h-6 w-6 text-muted-foreground/60" />
                      </div>
                      <p className="text-muted-foreground font-medium">No pages created yet.</p>
                      <Button variant="outline" size="sm" onClick={handleOpenNew}>
                        Create your first page
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : pages?.map(page => (
                <TableRow key={page.id} className="group hover:bg-muted/30 transition-colors">
                  <TableCell className="font-bold text-foreground">{page.title}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">/s/CODE/pages/{page.slug}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={page.published} 
                        onCheckedChange={() => handleTogglePublish(page.id, page.published)} 
                      />
                      {page.published ? (
                        <span className="text-xs font-bold uppercase tracking-wider flex items-center text-primary"><Globe className="h-3.5 w-3.5 mr-1"/> Published</span>
                      ) : (
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center"><EyeOff className="h-3.5 w-3.5 mr-1"/> Draft</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground font-medium">{formatPacificTime(page.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 hover:bg-primary/10" onClick={() => handleOpenEdit(page)}>
                        <Edit2 className="h-4 w-4 text-primary" />
                      </Button>
                      <DeleteConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" title="Delete page">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        title="Delete Page"
                        description={`Are you sure you want to delete "${page.title}"? Schools will no longer be able to read it.`}
                        confirmLabel="Delete Page"
                        onConfirm={() => handleDelete(page.id)}
                        pending={deletePage.isPending}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Editor Dialog */}
        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="max-w-3xl h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Page" : "New Page"}</DialogTitle>
              <DialogDescription>Content will be readable by schools within their portal.</DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Page Title</Label>
                  <Input 
                    value={title} 
                    onChange={e => {
                      setTitle(e.target.value)
                      if (!editingId && !slug) {
                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''))
                      }
                    }} 
                    placeholder="e.g. Workshop Expectations" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>URL Slug</Label>
                  <Input 
                    value={slug} 
                    onChange={e => setSlug(e.target.value)} 
                    placeholder="e.g. workshop-expectations" 
                  />
                </div>
              </div>
              
              <div className="space-y-2 flex-1 flex flex-col min-h-0">
                <Label>Page Content</Label>
                <RichTextEditor value={body} onChange={setBody} />
              </div>
              
              <div className="flex items-center space-x-2 pt-2 border-t mt-4">
                <Switch id="publish-toggle" checked={published} onCheckedChange={setPublished} />
                <Label htmlFor="publish-toggle">Publish immediately (visible to schools)</Label>
              </div>
            </div>

            <DialogFooter className="mt-auto pt-4 border-t">
              <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={createPage.isPending || updatePage.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Save Page
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  )
}