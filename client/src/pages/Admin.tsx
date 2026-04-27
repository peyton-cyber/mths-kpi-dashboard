import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth, type AuthUser } from "@/lib/useAuth";
import { DEPARTMENTS } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Shield,
  ShieldCheck,
  Trash2,
  Users,
  UserCog,
  Building2,
  KeyRound,
  Eye,
  EyeOff,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type AdminUser = AuthUser & { lastLogin?: string };

const DEPT_LABELS: Record<string, string> = {
  all: "All Dashboards",
  acquisitions: "Acquisitions",
  transactions: "Transactions",
  dispositions: "Dispositions",
  lead_managers: "Lead Managers",
  marketing: "Marketing",
  leadership: "Leadership",
};

export default function Admin() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [showCode, setShowCode] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [editingCode, setEditingCode] = useState(false);

  // Fetch current access code
  const { data: codeData } = useQuery<{ accessCode: string }>({
    queryKey: ["/api/admin/access-code"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/access-code");
      return res.json();
    },
  });

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/users");
      return res.json();
    },
  });

  const updateCode = useMutation({
    mutationFn: async (accessCode: string) => {
      await apiRequest("POST", "/api/admin/access-code", { accessCode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/access-code"] });
      toast({ title: "Access code updated" });
      setEditingCode(false);
      setNewCode("");
    },
    onError: () => {
      toast({ title: "Failed to update access code", variant: "destructive" });
    },
  });

  const updateDepts = useMutation({
    mutationFn: async ({
      id,
      departments,
    }: {
      id: number;
      departments: string;
    }) => {
      await apiRequest("PATCH", `/api/admin/users/${id}/departments`, {
        departments,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Departments updated" });
    },
  });

  const toggleAdmin = useMutation({
    mutationFn: async ({ id, isAdmin }: { id: number; isAdmin: boolean }) => {
      await apiRequest("PATCH", `/api/admin/users/${id}/admin`, { isAdmin });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Admin status updated" });
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User removed" });
    },
  });

  function toggleDept(user: AdminUser, dept: string) {
    const current = user.departments.split(",").filter(Boolean);
    let next: string[];

    if (dept === "all") {
      next = current.includes("all") ? [] : ["all"];
    } else {
      const withoutAll = current.filter((d) => d !== "all");
      if (withoutAll.includes(dept)) {
        next = withoutAll.filter((d) => d !== dept);
      } else {
        next = [...withoutAll, dept];
      }
      const specificDepts = DEPARTMENTS.filter((d) => d !== "all");
      if (specificDepts.every((d) => next.includes(d))) {
        next = ["all"];
      }
    }

    if (next.length === 0) next = ["all"];
    updateDepts.mutate({ id: user.id, departments: next.join(",") });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground animate-pulse">
          Loading users...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "hsl(var(--baby-blue-100))" }}
        >
          <UserCog
            className="h-5 w-5"
            style={{ color: "hsl(var(--baby-blue-600))" }}
          />
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-tight">User Management</h2>
          <p className="text-xs text-muted-foreground">
            Manage team access and dashboard permissions
          </p>
        </div>
      </div>

      {/* Access Code Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4" style={{ color: "hsl(var(--baby-blue-500))" }} />
            Team Access Code
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Share this code with your team so they can log in. You can change it anytime.
          </p>
          {!editingCode ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2 bg-muted/50 border rounded-lg px-4 py-2.5">
                <code className="text-sm font-mono font-semibold tracking-wider flex-1">
                  {showCode ? (codeData?.accessCode || "...") : "••••••••"}
                </code>
                <button
                  onClick={() => setShowCode(!showCode)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-toggle-code-visibility"
                >
                  {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingCode(true);
                  setNewCode(codeData?.accessCode || "");
                }}
                data-testid="button-change-code"
              >
                Change
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Enter new access code (min 4 characters)"
                className="flex-1 font-mono"
                data-testid="input-new-code"
                autoFocus
              />
              <Button
                size="sm"
                disabled={newCode.length < 4}
                onClick={() => updateCode.mutate(newCode)}
                data-testid="button-save-code"
                className="gap-1"
              >
                <Check className="h-3.5 w-3.5" />
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingCode(false);
                  setNewCode("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 px-5 flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold num">{users.length}</div>
              <div className="text-[11px] text-muted-foreground">
                Total Users
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5 flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold num">
                {users.filter((u) => u.isAdmin).length}
              </div>
              <div className="text-[11px] text-muted-foreground">Admins</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5 flex items-center gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold num">
                {
                  new Set(
                    users.flatMap((u) =>
                      u.departments.split(",").filter(Boolean)
                    )
                  ).size
                }
              </div>
              <div className="text-[11px] text-muted-foreground">
                Active Depts
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4" style={{ color: "hsl(var(--baby-blue-500))" }} />
            Team Members
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="divide-y">
            {users.map((user) => {
              const depts = user.departments.split(",").filter(Boolean);
              const isSelf = user.id === me?.id;

              return (
                <div
                  key={user.id}
                  className="px-6 py-4 flex items-start gap-4"
                  data-testid={`row-user-${user.id}`}
                >
                  {/* Avatar */}
                  <div className="shrink-0">
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                      style={{
                        backgroundColor: "hsl(var(--baby-blue-500))",
                      }}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">
                        {user.name}
                      </span>
                      {user.isAdmin && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Admin
                        </Badge>
                      )}
                      {isSelf && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          You
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </div>
                    {user.lastLogin && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Last login:{" "}
                        {new Date(user.lastLogin).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                    )}

                    {/* Department toggles */}
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {DEPARTMENTS.map((dept) => {
                        const active =
                          depts.includes("all") || depts.includes(dept);
                        return (
                          <button
                            key={dept}
                            onClick={() => toggleDept(user, dept)}
                            data-testid={`button-dept-${dept}-${user.id}`}
                            className={cn(
                              "text-[11px] px-2.5 py-1 rounded-md border transition-colors font-medium",
                              active
                                ? "border-transparent text-white"
                                : "border-border text-muted-foreground hover:border-foreground/20"
                            )}
                            style={
                              active
                                ? {
                                    backgroundColor:
                                      dept === "all"
                                        ? "hsl(var(--baby-blue-600))"
                                        : "hsl(var(--baby-blue-500))",
                                  }
                                : undefined
                            }
                          >
                            {DEPT_LABELS[dept] || dept}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        Admin
                      </span>
                      <Switch
                        checked={user.isAdmin}
                        disabled={isSelf}
                        onCheckedChange={(checked) =>
                          toggleAdmin.mutate({
                            id: user.id,
                            isAdmin: checked,
                          })
                        }
                        data-testid={`switch-admin-${user.id}`}
                      />
                    </div>

                    {!isSelf && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-600"
                        onClick={() => {
                          if (
                            confirm(
                              `Remove ${user.name} from the dashboard?`
                            )
                          ) {
                            deleteUser.mutate(user.id);
                          }
                        }}
                        data-testid={`button-delete-${user.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {users.length === 0 && (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                No team members have logged in yet. Share the access code with your team.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
