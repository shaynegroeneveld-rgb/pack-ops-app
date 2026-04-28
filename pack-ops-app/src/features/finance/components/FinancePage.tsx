import { type ChangeEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import { useAuthContext } from "@/app/contexts/auth-context";
import type { Contact } from "@/domain/contacts/types";
import {
  FINANCE_ACCOUNT_TYPES,
  FINANCE_CATEGORY_TYPES,
  FINANCE_TRANSACTION_STATUSES,
  FINANCE_TRANSACTION_TYPES,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceTransaction,
  type FinanceTransactionFilter,
} from "@/domain/finance/types";
import {
  badgeStyle,
  brand,
  cardStyle,
  feedbackStyle,
  pageHeaderStyle,
  pageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionTitleStyle,
  subtitleStyle,
  titleStyle,
} from "@/features/shared/ui/mobile-styles";
import { useFinanceSlice } from "@/features/finance/hooks/use-finance-slice";

type FinanceTab = "transactions" | "contacts" | "categories" | "accounts";

const FINANCE_TAB_LABELS: Record<FinanceTab, string> = {
  transactions: "Transactions",
  contacts: "Contacts",
  categories: "Categories",
  accounts: "Accounts",
};

interface AccountDraft {
  id?: FinanceAccount["id"];
  name: string;
  type: FinanceAccount["type"];
  institution: string;
  lastFour: string;
  openingBalance: string;
  isActive: boolean;
}

interface CategoryDraft {
  id?: FinanceCategory["id"];
  name: string;
  type: FinanceCategory["type"];
  description: string;
  isActive: boolean;
}

interface ContactDraft {
  id?: Contact["id"];
  type: Contact["type"];
  displayName: string;
  companyName: string;
  email: string;
  phone: string;
  notes: string;
}

interface TransactionDraft {
  id?: FinanceTransaction["id"];
  type: FinanceTransaction["type"];
  status: FinanceTransaction["status"];
  transactionDate: string;
  contactId: string;
  accountId: string;
  categoryId: string;
  jobId: string;
  documentId: string;
  memo: string;
  referenceNumber: string;
  subtotal: string;
  tax: string;
  total: string;
}

const inputStyle = {
  width: "100%",
  minHeight: "42px",
  border: `1px solid ${brand.border}`,
  borderRadius: "10px",
  padding: "10px 12px",
  fontSize: "14px",
  color: brand.text,
  background: "#ffffff",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  display: "grid",
  gap: "6px",
  color: brand.textSoft,
  fontSize: "12px",
  fontWeight: 700,
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function emptyAccountDraft(): AccountDraft {
  return {
    name: "",
    type: "bank",
    institution: "",
    lastFour: "",
    openingBalance: "0",
    isActive: true,
  };
}

function emptyCategoryDraft(): CategoryDraft {
  return {
    name: "",
    type: "expense",
    description: "",
    isActive: true,
  };
}

function emptyContactDraft(): ContactDraft {
  return {
    type: "company",
    displayName: "",
    companyName: "",
    email: "",
    phone: "",
    notes: "",
  };
}

function emptyTransactionDraft(accounts: FinanceAccount[], categories: FinanceCategory[]): TransactionDraft {
  return {
    type: "expense",
    status: "posted",
    transactionDate: today(),
    contactId: "",
    accountId: accounts[0]?.id ?? "",
    categoryId: categories.find((category) => category.type === "expense")?.id ?? categories[0]?.id ?? "",
    jobId: "",
    documentId: "",
    memo: "",
    referenceNumber: "",
    subtotal: "0",
    tax: "0",
    total: "0",
  };
}

export function FinancePage({ initialTab = "transactions" }: { initialTab?: FinanceTab }) {
  const { currentUser } = useAuthContext();
  const [activeTab, setActiveTab] = useState<FinanceTab>(initialTab);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [transactionFilter, setTransactionFilter] = useState<FinanceTransactionFilter>({
    search: "",
    type: "all",
    status: "all",
    accountId: "all",
    categoryId: "all",
  });
  const [accountDraft, setAccountDraft] = useState<AccountDraft | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [contactDraft, setContactDraft] = useState<ContactDraft | null>(null);
  const [transactionDraft, setTransactionDraft] = useState<TransactionDraft | null>(null);

  if (!currentUser) {
    return null;
  }

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const finance = useFinanceSlice(currentUser, transactionFilter);
  const accounts = useMemo(() => finance.accountsQuery.data ?? [], [finance.accountsQuery.data]);
  const categories = useMemo(() => finance.categoriesQuery.data ?? [], [finance.categoriesQuery.data]);
  const contacts = useMemo(() => finance.contactsQuery.data ?? [], [finance.contactsQuery.data]);
  const transactions = useMemo(() => finance.transactionsQuery.data ?? [], [finance.transactionsQuery.data]);
  const jobs = useMemo(() => finance.jobsQuery.data ?? [], [finance.jobsQuery.data]);
  const documents = useMemo(() => finance.documentsQuery.data ?? [], [finance.documentsQuery.data]);

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);

  if (!finance.canManageFinance) {
    return (
      <section style={pageStyle()}>
        <div style={cardStyle()}>
          <h1 style={sectionTitleStyle()}>Finance</h1>
          <p style={subtitleStyle()}>Finance records are available to owner, office, and bookkeeper roles.</p>
        </div>
      </section>
    );
  }

  function updateTransactionMoney(next: Partial<TransactionDraft>) {
    setTransactionDraft((current) => {
      if (!current) {
        return current;
      }
      const merged = { ...current, ...next };
      const subtotal = Number(merged.subtotal || 0);
      const tax = Number(merged.tax || 0);
      if (Number.isFinite(subtotal) && Number.isFinite(tax) && (next.subtotal !== undefined || next.tax !== undefined)) {
        merged.total = (Math.round((subtotal + tax) * 100) / 100).toString();
      }
      return merged;
    });
  }

  async function saveAccount() {
    if (!accountDraft) {
      return;
    }
    try {
      const payload = {
        name: accountDraft.name,
        type: accountDraft.type,
        institution: accountDraft.institution || null,
        lastFour: accountDraft.lastFour || null,
        openingBalance: Number(accountDraft.openingBalance || 0),
        isActive: accountDraft.isActive,
      };
      if (accountDraft.id) {
        await finance.updateAccount.mutateAsync({ id: accountDraft.id, ...payload });
        setFeedback({ tone: "success", text: "Account updated." });
      } else {
        await finance.createAccount.mutateAsync(payload);
        setFeedback({ tone: "success", text: "Account created." });
      }
      setAccountDraft(null);
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Account save failed." });
    }
  }

  async function saveCategory() {
    if (!categoryDraft) {
      return;
    }
    try {
      const payload = {
        name: categoryDraft.name,
        type: categoryDraft.type,
        description: categoryDraft.description || null,
        isActive: categoryDraft.isActive,
      };
      if (categoryDraft.id) {
        await finance.updateCategory.mutateAsync({ id: categoryDraft.id, ...payload });
        setFeedback({ tone: "success", text: "Category updated." });
      } else {
        await finance.createCategory.mutateAsync(payload);
        setFeedback({ tone: "success", text: "Category created." });
      }
      setCategoryDraft(null);
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Category save failed." });
    }
  }

  async function saveContact() {
    if (!contactDraft) {
      return;
    }
    try {
      const payload = {
        type: contactDraft.type,
        displayName: contactDraft.displayName,
        companyName: contactDraft.companyName || null,
        email: contactDraft.email || null,
        phone: contactDraft.phone || null,
        notes: contactDraft.notes || null,
      };
      if (contactDraft.id) {
        await finance.updateContact.mutateAsync({ id: contactDraft.id, ...payload });
        setFeedback({ tone: "success", text: "Contact updated." });
      } else {
        await finance.createContact.mutateAsync(payload);
        setFeedback({ tone: "success", text: "Contact created." });
      }
      setContactDraft(null);
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Contact save failed." });
    }
  }

  async function saveTransaction() {
    if (!transactionDraft) {
      return;
    }
    try {
      const payload = {
        type: transactionDraft.type,
        status: transactionDraft.status,
        transactionDate: transactionDraft.transactionDate,
        contactId: transactionDraft.contactId ? (transactionDraft.contactId as FinanceTransaction["contactId"]) : null,
        accountId: transactionDraft.accountId as FinanceTransaction["accountId"],
        categoryId: transactionDraft.categoryId as FinanceTransaction["categoryId"],
        jobId: transactionDraft.jobId ? (transactionDraft.jobId as FinanceTransaction["jobId"]) : null,
        documentId: transactionDraft.documentId ? (transactionDraft.documentId as FinanceTransaction["documentId"]) : null,
        memo: transactionDraft.memo || null,
        referenceNumber: transactionDraft.referenceNumber || null,
        subtotal: Number(transactionDraft.subtotal || 0),
        tax: Number(transactionDraft.tax || 0),
        total: Number(transactionDraft.total || 0),
      };
      if (transactionDraft.id) {
        await finance.updateTransaction.mutateAsync({ id: transactionDraft.id, ...payload });
        setFeedback({ tone: "success", text: "Transaction updated." });
      } else {
        await finance.createTransaction.mutateAsync(payload);
        setFeedback({ tone: "success", text: "Transaction created." });
      }
      setTransactionDraft(null);
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Transaction save failed." });
    }
  }

  function setSelectFilter(event: ChangeEvent<HTMLSelectElement>) {
    setTransactionFilter((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  return (
    <section style={pageStyle()}>
      <header style={pageHeaderStyle()}>
        <div>
          <h1 style={titleStyle()}>Finance</h1>
          <p style={subtitleStyle()}>Capture income and expenses with clean links to contacts, accounts, categories, jobs, and documents.</p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {(["transactions", "contacts", "categories", "accounts"] as const).map((tab) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={secondaryButtonStyle(activeTab === tab)}>
              {FINANCE_TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </header>

      {feedback ? <div style={feedbackStyle(feedback.tone)}>{feedback.text}</div> : null}

      {activeTab === "transactions" ? (
        <div style={{ display: "grid", gap: "16px" }}>
          <section style={cardStyle()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <h2 style={sectionTitleStyle()}>Transactions</h2>
              <button type="button" style={primaryButtonStyle()} onClick={() => setTransactionDraft(emptyTransactionDraft(accounts, categories))}>
                New transaction
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", marginTop: "14px" }}>
              <label style={labelStyle}>
                Search
                <input
                  style={inputStyle}
                  value={transactionFilter.search ?? ""}
                  onChange={(event) => setTransactionFilter((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Memo or reference"
                />
              </label>
              <label style={labelStyle}>
                Type
                <select name="type" style={inputStyle} value={transactionFilter.type ?? "all"} onChange={setSelectFilter}>
                  <option value="all">All</option>
                  {FINANCE_TRANSACTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Status
                <select name="status" style={inputStyle} value={transactionFilter.status ?? "all"} onChange={setSelectFilter}>
                  <option value="all">All</option>
                  {FINANCE_TRANSACTION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Account
                <select name="accountId" style={inputStyle} value={transactionFilter.accountId ?? "all"} onChange={setSelectFilter}>
                  <option value="all">All</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Category
                <select name="categoryId" style={inputStyle} value={transactionFilter.categoryId ?? "all"} onChange={setSelectFilter}>
                  <option value="all">All</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
            </div>
          </section>

          {transactionDraft ? (
            <section style={cardStyle()}>
              <h3 style={sectionTitleStyle()}>{transactionDraft.id ? "Edit transaction" : "Create transaction"}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px", marginTop: "14px" }}>
                <label style={labelStyle}>Type<select style={inputStyle} value={transactionDraft.type} onChange={(event) => setTransactionDraft({ ...transactionDraft, type: event.target.value as TransactionDraft["type"] })}>{FINANCE_TRANSACTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                <label style={labelStyle}>Status<select style={inputStyle} value={transactionDraft.status} onChange={(event) => setTransactionDraft({ ...transactionDraft, status: event.target.value as TransactionDraft["status"] })}>{FINANCE_TRANSACTION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
                <label style={labelStyle}>Date<input type="date" style={inputStyle} value={transactionDraft.transactionDate} onChange={(event) => setTransactionDraft({ ...transactionDraft, transactionDate: event.target.value })} /></label>
                <label style={labelStyle}>Contact<select style={inputStyle} value={transactionDraft.contactId} onChange={(event) => setTransactionDraft({ ...transactionDraft, contactId: event.target.value })}><option value="">None</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</select></label>
                <label style={labelStyle}>Account<select required style={inputStyle} value={transactionDraft.accountId} onChange={(event) => setTransactionDraft({ ...transactionDraft, accountId: event.target.value })}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                <label style={labelStyle}>Category<select required style={inputStyle} value={transactionDraft.categoryId} onChange={(event) => setTransactionDraft({ ...transactionDraft, categoryId: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                <label style={labelStyle}>Job link<select style={inputStyle} value={transactionDraft.jobId} onChange={(event) => setTransactionDraft({ ...transactionDraft, jobId: event.target.value })}><option value="">None</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.number} · {job.title}</option>)}</select></label>
                <label style={labelStyle}>Document link<select style={inputStyle} value={transactionDraft.documentId} onChange={(event) => setTransactionDraft({ ...transactionDraft, documentId: event.target.value })}><option value="">None</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.fileName}</option>)}</select></label>
                <label style={labelStyle}>Reference<input style={inputStyle} value={transactionDraft.referenceNumber} onChange={(event) => setTransactionDraft({ ...transactionDraft, referenceNumber: event.target.value })} /></label>
                <label style={labelStyle}>Subtotal<input type="number" step="0.01" style={inputStyle} value={transactionDraft.subtotal} onChange={(event) => updateTransactionMoney({ subtotal: event.target.value })} /></label>
                <label style={labelStyle}>Tax<input type="number" step="0.01" style={inputStyle} value={transactionDraft.tax} onChange={(event) => updateTransactionMoney({ tax: event.target.value })} /></label>
                <label style={labelStyle}>Total<input type="number" step="0.01" style={inputStyle} value={transactionDraft.total} onChange={(event) => setTransactionDraft({ ...transactionDraft, total: event.target.value })} /></label>
                <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>Memo<textarea style={{ ...inputStyle, minHeight: "76px" }} value={transactionDraft.memo} onChange={(event) => setTransactionDraft({ ...transactionDraft, memo: event.target.value })} /></label>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
                <button type="button" style={primaryButtonStyle()} onClick={() => void saveTransaction()}>Save transaction</button>
                <button type="button" style={secondaryButtonStyle()} onClick={() => setTransactionDraft(null)}>Cancel</button>
              </div>
            </section>
          ) : null}

          <section style={cardStyle()}>
            <div style={{ display: "grid", gap: "10px" }}>
              {transactions.map((transaction) => (
                <article key={transaction.id} style={{ border: `1px solid ${brand.border}`, borderRadius: "12px", padding: "12px", display: "grid", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div>
                      <strong>{transaction.memo || transaction.referenceNumber || "Untitled transaction"}</strong>
                      <div style={{ color: brand.textSoft, fontSize: "13px" }}>
                        {transaction.transactionDate} · {accountById.get(transaction.accountId)?.name ?? "Account"} · {categoryById.get(transaction.categoryId)?.name ?? "Category"}
                      </div>
                      <div style={{ color: brand.textSoft, fontSize: "13px" }}>
                        {transaction.contactId ? contactById.get(transaction.contactId)?.displayName ?? "No contact" : "No contact"}
                      </div>
                    </div>
                    <div style={{ display: "grid", justifyItems: "end", gap: "6px" }}>
                      <strong>{money(transaction.total)}</strong>
                      <span style={badgeStyle(transaction.type === "income" ? "#ecfdf3" : "#fff7ed", transaction.type === "income" ? "#166534" : "#9a3412")}>{transaction.type} · {transaction.status}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button type="button" style={secondaryButtonStyle()} onClick={() => setTransactionDraft({
                      id: transaction.id,
                      type: transaction.type,
                      status: transaction.status,
                      transactionDate: transaction.transactionDate,
                      contactId: transaction.contactId ?? "",
                      accountId: transaction.accountId,
                      categoryId: transaction.categoryId,
                      jobId: transaction.jobId ?? "",
                      documentId: transaction.documentId ?? "",
                      memo: transaction.memo ?? "",
                      referenceNumber: transaction.referenceNumber ?? "",
                      subtotal: transaction.subtotal.toString(),
                      tax: transaction.tax.toString(),
                      total: transaction.total.toString(),
                    })}>Edit</button>
                    <button type="button" style={secondaryButtonStyle()} onClick={() => void finance.archiveTransaction.mutateAsync(transaction.id)}>Archive</button>
                  </div>
                </article>
              ))}
              {transactions.length === 0 ? <p style={{ color: brand.textSoft }}>No transactions match this view.</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "accounts" ? (
        <CrudPanel title="Accounts" buttonLabel="New account" onCreate={() => setAccountDraft(emptyAccountDraft())}>
          {accountDraft ? (
            <EditorGrid>
              <label style={labelStyle}>Name<input style={inputStyle} value={accountDraft.name} onChange={(event) => setAccountDraft({ ...accountDraft, name: event.target.value })} /></label>
              <label style={labelStyle}>Type<select style={inputStyle} value={accountDraft.type} onChange={(event) => setAccountDraft({ ...accountDraft, type: event.target.value as AccountDraft["type"] })}>{FINANCE_ACCOUNT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
              <label style={labelStyle}>Institution<input style={inputStyle} value={accountDraft.institution} onChange={(event) => setAccountDraft({ ...accountDraft, institution: event.target.value })} /></label>
              <label style={labelStyle}>Last four<input style={inputStyle} value={accountDraft.lastFour} onChange={(event) => setAccountDraft({ ...accountDraft, lastFour: event.target.value })} /></label>
              <label style={labelStyle}>Opening balance<input type="number" step="0.01" style={inputStyle} value={accountDraft.openingBalance} onChange={(event) => setAccountDraft({ ...accountDraft, openingBalance: event.target.value })} /></label>
              <label style={{ ...labelStyle, alignContent: "end" }}><span><input type="checkbox" checked={accountDraft.isActive} onChange={(event) => setAccountDraft({ ...accountDraft, isActive: event.target.checked })} /> Active</span></label>
              <FormActions onSave={() => void saveAccount()} onCancel={() => setAccountDraft(null)} />
            </EditorGrid>
          ) : null}
          <ListGrid>
            {accounts.map((account) => <Row key={account.id} title={account.name} meta={`${account.type} · ${account.institution ?? "No institution"} · ${account.isActive ? "active" : "inactive"}`} amount={money(account.openingBalance)} onEdit={() => setAccountDraft({ id: account.id, name: account.name, type: account.type, institution: account.institution ?? "", lastFour: account.lastFour ?? "", openingBalance: account.openingBalance.toString(), isActive: account.isActive })} onArchive={() => void finance.archiveAccount.mutateAsync(account.id)} />)}
          </ListGrid>
        </CrudPanel>
      ) : null}

      {activeTab === "categories" ? (
        <CrudPanel title="Categories" buttonLabel="New category" onCreate={() => setCategoryDraft(emptyCategoryDraft())}>
          {categoryDraft ? (
            <EditorGrid>
              <label style={labelStyle}>Name<input style={inputStyle} value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} /></label>
              <label style={labelStyle}>Type<select style={inputStyle} value={categoryDraft.type} onChange={(event) => setCategoryDraft({ ...categoryDraft, type: event.target.value as CategoryDraft["type"] })}>{FINANCE_CATEGORY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
              <label style={labelStyle}>Description<input style={inputStyle} value={categoryDraft.description} onChange={(event) => setCategoryDraft({ ...categoryDraft, description: event.target.value })} /></label>
              <label style={{ ...labelStyle, alignContent: "end" }}><span><input type="checkbox" checked={categoryDraft.isActive} onChange={(event) => setCategoryDraft({ ...categoryDraft, isActive: event.target.checked })} /> Active</span></label>
              <FormActions onSave={() => void saveCategory()} onCancel={() => setCategoryDraft(null)} />
            </EditorGrid>
          ) : null}
          <ListGrid>
            {categories.map((category) => <Row key={category.id} title={category.name} meta={`${category.type} · ${category.isDefault ? "default" : "custom"} · ${category.isActive ? "active" : "inactive"}`} onEdit={() => setCategoryDraft({ id: category.id, name: category.name, type: category.type, description: category.description ?? "", isActive: category.isActive })} onArchive={() => void finance.archiveCategory.mutateAsync(category.id)} />)}
          </ListGrid>
        </CrudPanel>
      ) : null}

      {activeTab === "contacts" ? (
        <CrudPanel title="Contacts" buttonLabel="New contact" onCreate={() => setContactDraft(emptyContactDraft())}>
          {contactDraft ? (
            <EditorGrid>
              <label style={labelStyle}>Type<select style={inputStyle} value={contactDraft.type} onChange={(event) => setContactDraft({ ...contactDraft, type: event.target.value as ContactDraft["type"] })}><option value="company">company</option><option value="person">person</option></select></label>
              <label style={labelStyle}>Name<input style={inputStyle} value={contactDraft.displayName} onChange={(event) => setContactDraft({ ...contactDraft, displayName: event.target.value })} /></label>
              <label style={labelStyle}>Company<input style={inputStyle} value={contactDraft.companyName} onChange={(event) => setContactDraft({ ...contactDraft, companyName: event.target.value })} /></label>
              <label style={labelStyle}>Email<input style={inputStyle} value={contactDraft.email} onChange={(event) => setContactDraft({ ...contactDraft, email: event.target.value })} /></label>
              <label style={labelStyle}>Phone<input style={inputStyle} value={contactDraft.phone} onChange={(event) => setContactDraft({ ...contactDraft, phone: event.target.value })} /></label>
              <label style={labelStyle}>Notes<input style={inputStyle} value={contactDraft.notes} onChange={(event) => setContactDraft({ ...contactDraft, notes: event.target.value })} /></label>
              <FormActions onSave={() => void saveContact()} onCancel={() => setContactDraft(null)} />
            </EditorGrid>
          ) : null}
          <ListGrid>
            {contacts.map((contact) => <Row key={contact.id} title={contact.displayName} meta={`${contact.type} · ${contact.email ?? "no email"} · ${contact.phone ?? "no phone"}`} onEdit={() => setContactDraft({ id: contact.id, type: contact.type, displayName: contact.displayName, companyName: contact.companyName ?? "", email: contact.email ?? "", phone: contact.phone ?? "", notes: contact.notes ?? "" })} onArchive={() => void finance.archiveContact.mutateAsync(contact.id)} />)}
          </ListGrid>
        </CrudPanel>
      ) : null}
    </section>
  );
}

function CrudPanel(props: { title: string; buttonLabel: string; onCreate: () => void; children: ReactNode }) {
  return (
    <section style={{ ...cardStyle(), display: "grid", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <h2 style={sectionTitleStyle()}>{props.title}</h2>
        <button type="button" style={primaryButtonStyle()} onClick={props.onCreate}>{props.buttonLabel}</button>
      </div>
      {props.children}
    </section>
  );
}

function EditorGrid(props: { children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>{props.children}</div>;
}

function ListGrid(props: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: "10px" }}>{props.children}</div>;
}

function FormActions(props: { onSave: () => void; onCancel: () => void }) {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "end", flexWrap: "wrap" }}>
      <button type="button" style={primaryButtonStyle()} onClick={props.onSave}>Save</button>
      <button type="button" style={secondaryButtonStyle()} onClick={props.onCancel}>Cancel</button>
    </div>
  );
}

function Row(props: { title: string; meta: string; amount?: string; onEdit: () => void; onArchive: () => void }) {
  return (
    <article style={{ border: `1px solid ${brand.border}`, borderRadius: "12px", padding: "12px", display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
      <div>
        <strong>{props.title}</strong>
        <div style={{ color: brand.textSoft, fontSize: "13px" }}>{props.meta}</div>
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        {props.amount ? <strong>{props.amount}</strong> : null}
        <button type="button" style={secondaryButtonStyle()} onClick={props.onEdit}>Edit</button>
        <button type="button" style={secondaryButtonStyle()} onClick={props.onArchive}>Archive</button>
      </div>
    </article>
  );
}
