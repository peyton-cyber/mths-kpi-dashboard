import { ReactNode } from "react";
import { AuthContext, useAuthState } from "@/lib/useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthState();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
