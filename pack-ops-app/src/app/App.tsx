import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider } from "@/app/providers/auth-provider";
import { OrgProvider } from "@/app/providers/org-provider";
import { AuthGate } from "@/features/auth/components/AuthGate";
import { ConfirmProvider, ToastProvider } from "@/ui";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OrgProvider>
          <ToastProvider>
            <ConfirmProvider>
              <AuthGate />
            </ConfirmProvider>
          </ToastProvider>
        </OrgProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
