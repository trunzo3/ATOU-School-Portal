import { useGetAdminUsers, useCreateAdminUser, useDeleteAdminUser, useGetAdminMe, getGetAdminUsersQueryKey } from "@workspace/api-client-react"
import { AdminLayout } from "@/components/layout/admin-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { Trash2, UserPlus } from "lucide-react"
import { useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { useQueryClient } from "@tanstack/react-query"
import { formatPacificTime } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

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

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-foreground">Admin Accounts</h1>
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
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2 flex-1 w-full">
                <Label htmlFor="password">Password (min 8 chars)</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
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
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.email} {user.id === me?.id && <span className="text-xs ml-2 bg-primary/10 text-primary px-2 py-0.5 rounded-full">You</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatPacificTime(user.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {user.id !== me?.id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Admin User</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove {user.email}? They will immediately lose access to the dashboard.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(user.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Remove User
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AdminLayout>
  )
}