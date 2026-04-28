import { FinancePage } from "@/features/finance/components/FinancePage";

type MoneyTab = "transactions" | "contacts" | "categories" | "accounts";

export function FinanceMoneyPage({ initialTab = "transactions" }: { initialTab?: MoneyTab }) {
  return <FinancePage initialTab={initialTab} />;
}
