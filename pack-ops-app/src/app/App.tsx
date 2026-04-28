import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider } from "@/app/providers/auth-provider";
import { OrgProvider } from "@/app/providers/org-provider";
import { AuthGate } from "@/features/auth/components/AuthGate";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OrgProvider>
          <AuthGate />
        </OrgProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
