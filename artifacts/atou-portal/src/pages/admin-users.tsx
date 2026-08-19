import { useGetAdminUsers, useCreateAdminUser, useDeleteAdminUser, useUpdateAdminUser, useGetAdminMe, getGetAdminUsersQueryKey } from "@workspace/api-client-react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/shared/password-input"
import { KeyRound, Trash2, UserPlus } from "lucide-react"
import { useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { useQueryClient } from "@tanstack/react-query"
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

export function AdminUsers() {
  const { data: users } = useGetAdminUsers()
  const { data: me } = useGetAdminMe()
  const createUser = useCreateAdminUser()
  const deleteUser = useDeleteAdminUser()
  
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    createUser.mutate({ data: { email, password } }, {
      onSuccess: () => {
        setEmail("")
        setPassword("")
        toast({ title: "User created successfully" })
        queryClient.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() })
      },
      onError: (err: any) => {
        toast({ title: "Error creating user", description: err?.message, variant: "destructive" })
      }
    })
  }

  const handleDelete = (id: number) => {
    deleteUser.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "User removed" })
        queryClient.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() })
      }
    })
  }

  const updateUser = useUpdateAdminUser()
  const [resetTarget, setResetTarget] = useState<{ id: number; email: string } | null>(null)
  const [newPassword, setNewPassword] = useState("")

  const closeReset = () => {
    setResetTarget(null)
    setNewPassword("")
  }

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetTarget) return
    updateUser.mutate({ id: resetTarget.id, data: { password: newPassword } }, {
      onSuccess: () => {
        toast({ title: "Password updated", description: `${resetTarget.email} can now sign in with the new password.` })
        closeReset()
      },
      onError: (err: any) => {
        toast({ title: "Error updating password", description: err?.data?.error ?? err?.message, variant: "destructive" })
      }
    })
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary mb-1">Access Control</p>
          <h1 className="text-3xl font-serif font-bold text-foreground">Admin Accounts</h1>
          <p className="text-muted-foreground mt-1">Manage who can access this dashboard.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Add New Admin</CardTitle>
            <CardDescription>They will log in with their email and password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="space-y-2 flex-1 w-full">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2 flex-1 w-full">
                <Label htmlFor="password">Password (min 8 chars)</Label>
                <PasswordInput id="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
              </div>
              <Button type="submit" disabled={createUser.isPending} className="w-full sm:w-auto">
                <UserPlus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map(user => (
                <TableRow key={user.id} className="group hover:bg-muted/30 transition-colors">
                  <TableCell className="font-bold text-foreground">
                    {user.email} {user.id === me?.id && <span className="text-xs font-bold uppercase tracking-wider ml-2 bg-secondary/10 text-secondary border border-secondary/15 px-2 py-0.5 rounded-full">You</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm font-medium">
                    {formatPacificTime(user.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full h-8 text-primary hover:text-primary hover:bg-primary/10"
                        onClick={() => setResetTarget({ id: user.id, email: user.email })}
                      >
                        <KeyRound className="h-4 w-4 mr-1.5" />
                        Reset Password
                      </Button>
                      {user.id !== me?.id && (
                        <DeleteConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" title="Remove user">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title="Remove Admin User"
                          description={`Are you sure you want to remove ${user.email}? They will immediately lose access to the dashboard.`}
                          confirmLabel="Remove User"
                          onConfirm={() => handleDelete(user.id)}
                          pending={deleteUser.isPending}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Dialog open={resetTarget !== null} onOpenChange={(open) => { if (!open) closeReset() }}>
          <DialogContent className="rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Set a new password for {resetTarget?.email}. They'll use it the next time they sign in.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-new-password">New Password (min 8 chars)</Label>
                <PasswordInput
                  id="reset-new-password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-full" onClick={closeReset}>
                  Cancel
                </Button>
                <Button type="submit" className="rounded-full" disabled={newPassword.length < 8 || updateUser.isPending}>
                  {updateUser.isPending ? "Saving..." : "Set New Password"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  )
}