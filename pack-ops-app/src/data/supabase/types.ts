export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      action_items: {
        Row: {
          assigned_to: string | null
          automation_rule_id: string | null
          category: Database["public"]["Enums"]["action_item_category"]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          due_at: string | null
          entity_id: string
          entity_type: string
          id: string
          org_id: string
          priority: Database["public"]["Enums"]["action_item_priority"]
          resolved_at: string | null
          resolved_by: string | null
          snoozed_until: string | null
          status: Database["public"]["Enums"]["action_item_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          automation_rule_id?: string | null
          category: Database["public"]["Enums"]["action_item_category"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          due_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          org_id: string
          priority?: Database["public"]["Enums"]["action_item_priority"]
          resolved_at?: string | null
          resolved_by?: string | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["action_item_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          automation_rule_id?: string | null
          category?: Database["public"]["Enums"]["action_item_category"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          due_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          org_id?: string
          priority?: Database["public"]["Enums"]["action_item_priority"]
          resolved_at?: string | null
          resolved_by?: string | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["action_item_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_action_items_rule"
            columns: ["automation_rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      active_timers: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          job_id: string
          org_id: string
          started_at: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          job_id: string
          org_id: string
          started_at: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          job_id?: string
          org_id?: string
          started_at?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_timers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_timers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_timers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_active_timers_job"
            columns: ["org_id", "job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_active_timers_user"
            columns: ["org_id", "user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      app_settings: {
        Row: {
          anthropic_key: string | null
          gchat_members: string | null
          gchat_private_key: string | null
          gchat_service_account: string | null
          id: string
          logo_b64: string | null
          updated_at: string | null
        }
        Insert: {
          anthropic_key?: string | null
          gchat_members?: string | null
          gchat_private_key?: string | null
          gchat_service_account?: string | null
          id: string
          logo_b64?: string | null
          updated_at?: string | null
        }
        Update: {
          anthropic_key?: string | null
          gchat_members?: string | null
          gchat_private_key?: string | null
          gchat_service_account?: string | null
          id?: string
          logo_b64?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      app_state: {
        Row: {
          data: Json | null
          id: string
          updated_at: string | null
        }
        Insert: {
          data?: Json | null
          id: string
          updated_at?: string | null
        }
        Update: {
          data?: Json | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      assemblies: {
        Row: {
          created_at: string
          created_by: string | null
          default_labor_hours: number
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_labor_hours?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_labor_hours?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assemblies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assemblies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assemblies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_items: {
        Row: {
          assembly_id: string
          catalog_item_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          org_id: string
          quantity: number
          section_name: string | null
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assembly_id: string
          catalog_item_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          org_id: string
          quantity: number
          section_name?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assembly_id?: string
          catalog_item_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          org_id?: string
          quantity?: number
          section_name?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assembly_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_assembly_items_assembly"
            columns: ["org_id", "assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_assembly_items_catalog"
            columns: ["org_id", "catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      audit_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          entity_id: string
          entity_type: string
          field_name: string | null
          id: number
          new_value: string | null
          old_value: string | null
          operation: Database["public"]["Enums"]["audit_operation"]
          org_id: string
          row_snapshot: Json | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          entity_id: string
          entity_type: string
          field_name?: string | null
          id?: number
          new_value?: string | null
          old_value?: string | null
          operation: Database["public"]["Enums"]["audit_operation"]
          org_id: string
          row_snapshot?: Json | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          entity_id?: string
          entity_type?: string
          field_name?: string | null
          id?: number
          new_value?: string | null
          old_value?: string | null
          operation?: Database["public"]["Enums"]["audit_operation"]
          org_id?: string
          row_snapshot?: Json | null
        }
        Relationships: []
      }
      automation_rules: {
        Row: {
          action_config: Json
          action_type: Database["public"]["Enums"]["automation_action_type"]
          condition_config: Json | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          execution_count: number
          id: string
          is_builtin: boolean
          is_enabled: boolean
          is_muted: boolean
          last_evaluated_at: string | null
          name: string
          org_id: string
          trigger_config: Json
          trigger_type: Database["public"]["Enums"]["automation_trigger_type"]
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: Database["public"]["Enums"]["automation_action_type"]
          condition_config?: Json | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          execution_count?: number
          id?: string
          is_builtin?: boolean
          is_enabled?: boolean
          is_muted?: boolean
          last_evaluated_at?: string | null
          name: string
          org_id: string
          trigger_config?: Json
          trigger_type: Database["public"]["Enums"]["automation_trigger_type"]
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: Database["public"]["Enums"]["automation_action_type"]
          condition_config?: Json | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          execution_count?: number
          id?: string
          is_builtin?: boolean
          is_enabled?: boolean
          is_muted?: boolean
          last_evaluated_at?: string | null
          name?: string
          org_id?: string
          trigger_config?: Json
          trigger_type?: Database["public"]["Enums"]["automation_trigger_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_items: {
        Row: {
          aliases: string[]
          category: string | null
          cost_price: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          org_id: string
          sku: string | null
          unit: string
          unit_price: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aliases?: string[]
          category?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          org_id: string
          sku?: string | null
          unit?: string
          unit_price?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aliases?: string[]
          category?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          org_id?: string
          sku?: string | null
          unit?: string
          unit_price?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_name: string | null
          country: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          org_id: string
          phone: string | null
          postcode: string | null
          state: string | null
          tags: string[]
          type: Database["public"]["Enums"]["contact_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_name?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id: string
          phone?: string | null
          postcode?: string | null
          state?: string | null
          tags?: string[]
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_name?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          postcode?: string | null
          state?: string | null
          tags?: string[]
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: Database["public"]["Enums"]["document_category"]
          created_at: string
          deleted_at: string | null
          display_name: string
          entity_id: string
          entity_type: string
          file_size: number | null
          id: string
          mime_type: string | null
          org_id: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          deleted_at?: string | null
          display_name: string
          entity_id: string
          entity_type: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          org_id: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          entity_id?: string
          entity_type?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          org_id?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_events: {
        Row: {
          emitted_at: string
          emitted_by: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id: number
          org_id: string
          payload: Json
        }
        Insert: {
          emitted_at?: string
          emitted_by?: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id?: number
          org_id: string
          payload?: Json
        }
        Update: {
          emitted_at?: string
          emitted_by?: string | null
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: number
          org_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "entity_events_emitted_by_fkey"
            columns: ["emitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          deleted_at: string | null
          description: string
          expense_date: string
          id: string
          job_id: string
          org_id: string
          receipt_url: string | null
          rejected_reason: string | null
          status: Database["public"]["Enums"]["expense_status"]
          submitted_by: string
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          deleted_at?: string | null
          description: string
          expense_date?: string
          id?: string
          job_id: string
          org_id: string
          receipt_url?: string | null
          rejected_reason?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          submitted_by: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          deleted_at?: string | null
          description?: string
          expense_date?: string
          id?: string
          job_id?: string
          org_id?: string
          receipt_url?: string | null
          rejected_reason?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          submitted_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expenses_job"
            columns: ["org_id", "job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_expenses_submitted_by"
            columns: ["org_id", "submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      finance_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          institution: string | null
          is_active: boolean
          last_four: string | null
          name: string
          opening_balance: number
          org_id: string
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          institution?: string | null
          is_active?: boolean
          last_four?: string | null
          name: string
          opening_balance?: number
          org_id: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          institution?: string | null
          is_active?: boolean
          last_four?: string | null
          name?: string
          opening_balance?: number
          org_id?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_accounts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_ap_bills: {
        Row: {
          amount_outstanding: number
          amount_paid: number
          bill_date: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_intake_id: string | null
          due_date: string | null
          id: string
          org_id: string
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
          vendor_contact_id: string | null
          vendor_name: string
        }
        Insert: {
          amount_outstanding?: number
          amount_paid?: number
          bill_date?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_intake_id?: string | null
          due_date?: string | null
          id?: string
          org_id: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          vendor_contact_id?: string | null
          vendor_name: string
        }
        Update: {
          amount_outstanding?: number
          amount_paid?: number
          bill_date?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_intake_id?: string | null
          due_date?: string | null
          id?: string
          org_id?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          vendor_contact_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_ap_bills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_ap_bills_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_finance_ap_document"
            columns: ["org_id", "document_intake_id"]
            isOneToOne: false
            referencedRelation: "finance_document_intake"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_finance_ap_vendor"
            columns: ["org_id", "vendor_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      finance_ap_payments: {
        Row: {
          amount: number
          ap_bill_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          imported_transaction_id: string | null
          org_id: string
          paid_at: string
          reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          ap_bill_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          imported_transaction_id?: string | null
          org_id: string
          paid_at?: string
          reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          ap_bill_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          imported_transaction_id?: string | null
          org_id?: string
          paid_at?: string
          reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_ap_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_ap_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_finance_ap_payments_bill"
            columns: ["org_id", "ap_bill_id"]
            isOneToOne: false
            referencedRelation: "finance_ap_bills"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_finance_ap_payments_import"
            columns: ["org_id", "imported_transaction_id"]
            isOneToOne: false
            referencedRelation: "imported_transactions"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      finance_ar_invoices: {
        Row: {
          amount_outstanding: number
          amount_paid: number
          created_at: string
          customer_contact_id: string
          customer_name: string
          deleted_at: string | null
          due_date: string | null
          id: string
          invoice_id: string
          issue_date: string | null
          job_id: string | null
          job_label: string | null
          org_id: string
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          amount_outstanding?: number
          amount_paid?: number
          created_at?: string
          customer_contact_id: string
          customer_name: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          invoice_id: string
          issue_date?: string | null
          job_id?: string | null
          job_label?: string | null
          org_id: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          amount_outstanding?: number
          amount_paid?: number
          created_at?: string
          customer_contact_id?: string
          customer_name?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          invoice_id?: string
          issue_date?: string | null
          job_id?: string | null
          job_label?: string | null
          org_id?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_ar_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_finance_ar_customer"
            columns: ["org_id", "customer_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_finance_ar_invoice"
            columns: ["org_id", "invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_finance_ar_job"
            columns: ["org_id", "job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      finance_ar_payments: {
        Row: {
          amount: number
          ar_invoice_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          imported_transaction_id: string | null
          org_id: string
          paid_at: string
          reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          ar_invoice_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          imported_transaction_id?: string | null
          org_id: string
          paid_at?: string
          reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          ar_invoice_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          imported_transaction_id?: string | null
          org_id?: string
          paid_at?: string
          reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_ar_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_ar_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_finance_ar_payments_import"
            columns: ["org_id", "imported_transaction_id"]
            isOneToOne: false
            referencedRelation: "imported_transactions"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_finance_ar_payments_invoice"
            columns: ["org_id", "ar_invoice_id"]
            isOneToOne: false
            referencedRelation: "finance_ar_invoices"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      finance_categories: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          org_id: string
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          org_id: string
          type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          org_id?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_document_intake: {
        Row: {
          created_at: string
          deleted_at: string | null
          document_type: string
          document_type_confidence: number
          email_received_at: string | null
          email_subject: string | null
          external_source_id: string | null
          extracted_date: string | null
          extracted_invoice_number: string | null
          extracted_subtotal: number | null
          extracted_tax: number | null
          extracted_total: number | null
          extracted_vendor: string | null
          extraction_confidence: number
          extraction_method: string
          extraction_reviewed_at: string | null
          extraction_reviewed_by: string | null
          extraction_status: string
          file_name: string
          file_size: number | null
          gmail_attachment_id: string | null
          gmail_message_id: string | null
          id: string
          invoice_date_confidence: number
          invoice_number_confidence: number
          linked_imported_transaction_id: string | null
          linked_transaction_id: string | null
          mime_type: string | null
          normalized_vendor_contact_id: string | null
          ocr_error: string | null
          ocr_status: string
          org_id: string
          pdf_text_char_count: number
          pdf_text_extracted_at: string | null
          sender_email: string | null
          sender_name: string | null
          size_bytes: number | null
          source: string
          status: string
          storage_path: string
          subtotal_confidence: number
          suggested_category_id: string | null
          suggested_contact_id: string | null
          suggested_job_id: string | null
          suggestion_confidence: number
          suggestion_reason: string | null
          tax_confidence: number
          total_confidence: number
          updated_at: string
          uploaded_at: string | null
          uploaded_by: string | null
          vendor_confidence: number
          vendor_normalization_confidence: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          document_type?: string
          document_type_confidence?: number
          email_received_at?: string | null
          email_subject?: string | null
          external_source_id?: string | null
          extracted_date?: string | null
          extracted_invoice_number?: string | null
          extracted_subtotal?: number | null
          extracted_tax?: number | null
          extracted_total?: number | null
          extracted_vendor?: string | null
          extraction_confidence?: number
          extraction_method?: string
          extraction_reviewed_at?: string | null
          extraction_reviewed_by?: string | null
          extraction_status?: string
          file_name: string
          file_size?: number | null
          gmail_attachment_id?: string | null
          gmail_message_id?: string | null
          id?: string
          invoice_date_confidence?: number
          invoice_number_confidence?: number
          linked_imported_transaction_id?: string | null
          linked_transaction_id?: string | null
          mime_type?: string | null
          normalized_vendor_contact_id?: string | null
          ocr_error?: string | null
          ocr_status?: string
          org_id: string
          pdf_text_char_count?: number
          pdf_text_extracted_at?: string | null
          sender_email?: string | null
          sender_name?: string | null
          size_bytes?: number | null
          source?: string
          status?: string
          storage_path: string
          subtotal_confidence?: number
          suggested_category_id?: string | null
          suggested_contact_id?: string | null
          suggested_job_id?: string | null
          suggestion_confidence?: number
          suggestion_reason?: string | null
          tax_confidence?: number
          total_confidence?: number
          updated_at?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
          vendor_confidence?: number
          vendor_normalization_confidence?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          document_type?: string
          document_type_confidence?: number
          email_received_at?: string | null
          email_subject?: string | null
          external_source_id?: string | null
          extracted_date?: string | null
          extracted_invoice_number?: string | null
          extracted_subtotal?: number | null
          extracted_tax?: number | null
          extracted_total?: number | null
          extracted_vendor?: string | null
          extraction_confidence?: number
          extraction_method?: string
          extraction_reviewed_at?: string | null
          extraction_reviewed_by?: string | null
          extraction_status?: string
          file_name?: string
          file_size?: number | null
          gmail_attachment_id?: string | null
          gmail_message_id?: string | null
          id?: string
          invoice_date_confidence?: number
          invoice_number_confidence?: number
          linked_imported_transaction_id?: string | null
          linked_transaction_id?: string | null
          mime_type?: string | null
          normalized_vendor_contact_id?: string | null
          ocr_error?: string | null
          ocr_status?: string
          org_id?: string
          pdf_text_char_count?: number
          pdf_text_extracted_at?: string | null
          sender_email?: string | null
          sender_name?: string | null
          size_bytes?: number | null
          source?: string
          status?: string
          storage_path?: string
          subtotal_confidence?: number
          suggested_category_id?: string | null
          suggested_contact_id?: string | null
          suggested_job_id?: string | null
          suggestion_confidence?: number
          suggestion_reason?: string | null
          tax_confidence?: number
          total_confidence?: number
          updated_at?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
          vendor_confidence?: number
          vendor_normalization_confidence?: number
        }
        Relationships: [
          {
            foreignKeyName: "finance_document_intake_extraction_reviewed_by_fkey"
            columns: ["extraction_reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_document_intake_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_document_intake_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_finance_document_intake_category"
            columns: ["org_id", "suggested_category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_finance_document_intake_contact"
            columns: ["org_id", "suggested_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_finance_document_intake_imported_transaction"
            columns: ["org_id", "linked_imported_transaction_id"]
            isOneToOne: false
            referencedRelation: "imported_transactions"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_finance_document_intake_job"
            columns: ["org_id", "suggested_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_finance_document_intake_normalized_vendor"
            columns: ["org_id", "normalized_vendor_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_finance_document_intake_transaction"
            columns: ["org_id", "linked_transaction_id"]
            isOneToOne: false
            referencedRelation: "finance_transactions"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      finance_document_line_items: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          applied_catalog_item_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          document_intake_id: string
          extracted_at: string | null
          extraction_source: string
          id: string
          ignored_reason: string | null
          internal_cost: number
          match_confidence: number
          match_reason: string | null
          matched_catalog_item_id: string | null
          org_id: string
          quantity: number
          review_status: string
          supplier_price: number
          total: number
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          applied_catalog_item_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          document_intake_id: string
          extracted_at?: string | null
          extraction_source?: string
          id?: string
          ignored_reason?: string | null
          internal_cost?: number
          match_confidence?: number
          match_reason?: string | null
          matched_catalog_item_id?: string | null
          org_id: string
          quantity?: number
          review_status?: string
          supplier_price?: number
          total?: number
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          applied_catalog_item_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          document_intake_id?: string
          extracted_at?: string | null
          extraction_source?: string
          id?: string
          ignored_reason?: string | null
          internal_cost?: number
          match_confidence?: number
          match_reason?: string | null
          matched_catalog_item_id?: string | null
          org_id?: string
          quantity?: number
          review_status?: string
          supplier_price?: number
          total?: number
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_document_line_items_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_document_line_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_document_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_document_line_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_finance_document_line_items_applied"
            columns: ["org_id", "applied_catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_finance_document_line_items_document"
            columns: ["org_id", "document_intake_id"]
            isOneToOne: false
            referencedRelation: "finance_document_intake"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_finance_document_line_items_match"
            columns: ["org_id", "matched_catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      finance_import_batches: {
        Row: {
          created_at: string
          deleted_at: string | null
          file_name: string
          id: string
          imported_by: string | null
          org_id: string
          row_count: number
          source_account_id: string
          source_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          file_name: string
          id?: string
          imported_by?: string | null
          org_id: string
          row_count?: number
          source_account_id: string
          source_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          file_name?: string
          id?: string
          imported_by?: string | null
          org_id?: string
          row_count?: number
          source_account_id?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_import_batches_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_import_batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_finance_import_batches_account"
            columns: ["org_id", "source_account_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      finance_monthly_closes: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          draft_transactions_count: number
          id: string
          missing_receipts_count: number
          month: string
          org_id: string
          outstanding_bills_count: number
          outstanding_invoices_count: number
          possible_duplicates_count: number
          snoozed_review_items_count: number
          status: string
          uncategorized_transactions_count: number
          unreconciled_imports_count: number
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          draft_transactions_count?: number
          id?: string
          missing_receipts_count?: number
          month: string
          org_id: string
          outstanding_bills_count?: number
          outstanding_invoices_count?: number
          possible_duplicates_count?: number
          snoozed_review_items_count?: number
          status?: string
          uncategorized_transactions_count?: number
          unreconciled_imports_count?: number
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          draft_transactions_count?: number
          id?: string
          missing_receipts_count?: number
          month?: string
          org_id?: string
          outstanding_bills_count?: number
          outstanding_invoices_count?: number
          possible_duplicates_count?: number
          snoozed_review_items_count?: number
          status?: string
          uncategorized_transactions_count?: number
          unreconciled_imports_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_monthly_closes_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_monthly_closes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_monthly_closes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_reconciliation_sessions: {
        Row: {
          account_id: string
          closing_balance: number | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          end_date: string
          id: string
          imported_total: number
          matched_total: number
          opening_balance: number | null
          org_id: string
          start_date: string
          status: string
          unreconciled_total: number
          updated_at: string
        }
        Insert: {
          account_id: string
          closing_balance?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_date: string
          id?: string
          imported_total?: number
          matched_total?: number
          opening_balance?: number | null
          org_id: string
          start_date: string
          status?: string
          unreconciled_total?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          closing_balance?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_date?: string
          id?: string
          imported_total?: number
          matched_total?: number
          opening_balance?: number | null
          org_id?: string
          start_date?: string
          status?: string
          unreconciled_total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_reconciliation_sessions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_reconciliation_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_reconciliation_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_finance_reconciliation_account"
            columns: ["org_id", "account_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      finance_transactions: {
        Row: {
          account_id: string
          category_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_id: string | null
          id: string
          job_id: string | null
          memo: string | null
          org_id: string
          reference_number: string | null
          status: string
          subtotal: number
          tax: number
          total: number
          transaction_date: string
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          category_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          id?: string
          job_id?: string | null
          memo?: string | null
          org_id: string
          reference_number?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          transaction_date?: string
          type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          category_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          id?: string
          job_id?: string | null
          memo?: string | null
          org_id?: string
          reference_number?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          transaction_date?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_finance_transactions_account"
            columns: ["org_id", "account_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_finance_transactions_category"
            columns: ["org_id", "category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_finance_transactions_contact"
            columns: ["org_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_finance_transactions_document"
            columns: ["org_id", "document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_finance_transactions_job"
            columns: ["org_id", "job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      gmail_connections: {
        Row: {
          access_token_ciphertext: string
          connected_by: string | null
          created_at: string
          deleted_at: string | null
          gmail_email: string | null
          history_id: string | null
          id: string
          last_import_attachments_imported: number
          last_import_completed_at: string | null
          last_import_emails_scanned: number
          last_import_items_skipped: number
          last_import_started_at: string | null
          last_import_window_end_at: string | null
          last_import_window_start_at: string | null
          last_successful_import_at: string | null
          last_sync_at: string | null
          org_id: string
          refresh_token_ciphertext: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_ciphertext: string
          connected_by?: string | null
          created_at?: string
          deleted_at?: string | null
          gmail_email?: string | null
          history_id?: string | null
          id?: string
          last_import_attachments_imported?: number
          last_import_completed_at?: string | null
          last_import_emails_scanned?: number
          last_import_items_skipped?: number
          last_import_started_at?: string | null
          last_import_window_end_at?: string | null
          last_import_window_start_at?: string | null
          last_successful_import_at?: string | null
          last_sync_at?: string | null
          org_id: string
          refresh_token_ciphertext?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_ciphertext?: string
          connected_by?: string | null
          created_at?: string
          deleted_at?: string | null
          gmail_email?: string | null
          history_id?: string | null
          id?: string
          last_import_attachments_imported?: number
          last_import_completed_at?: string | null
          last_import_emails_scanned?: number
          last_import_items_skipped?: number
          last_import_started_at?: string | null
          last_import_window_end_at?: string | null
          last_import_window_start_at?: string | null
          last_successful_import_at?: string | null
          last_sync_at?: string | null
          org_id?: string
          refresh_token_ciphertext?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_connections_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_oauth_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          org_id: string
          requested_by: string
          state_hash: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          org_id: string
          requested_by: string
          state_hash: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          org_id?: string
          requested_by?: string
          state_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_oauth_states_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_oauth_states_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_transactions: {
        Row: {
          amount: number
          batch_id: string
          created_at: string
          deleted_at: string | null
          id: string
          linked_document_intake_id: string | null
          matched_transaction_id: string | null
          org_id: string
          raw_description: string
          raw_memo: string | null
          receipt_snoozed_until: string | null
          receipt_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_account_id: string
          status: string
          suggested_category_id: string | null
          suggested_contact_id: string | null
          suggested_job_id: string | null
          suggestion_confidence: number
          suggestion_reason: string | null
          transaction_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          batch_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          linked_document_intake_id?: string | null
          matched_transaction_id?: string | null
          org_id: string
          raw_description: string
          raw_memo?: string | null
          receipt_snoozed_until?: string | null
          receipt_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_account_id: string
          status?: string
          suggested_category_id?: string | null
          suggested_contact_id?: string | null
          suggested_job_id?: string | null
          suggestion_confidence?: number
          suggestion_reason?: string | null
          transaction_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          batch_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          linked_document_intake_id?: string | null
          matched_transaction_id?: string | null
          org_id?: string
          raw_description?: string
          raw_memo?: string | null
          receipt_snoozed_until?: string | null
          receipt_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_account_id?: string
          status?: string
          suggested_category_id?: string | null
          suggested_contact_id?: string | null
          suggested_job_id?: string | null
          suggestion_confidence?: number
          suggestion_reason?: string | null
          transaction_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_imported_transactions_account"
            columns: ["org_id", "source_account_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_imported_transactions_batch"
            columns: ["org_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "finance_import_batches"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_imported_transactions_category"
            columns: ["org_id", "suggested_category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_imported_transactions_contact"
            columns: ["org_id", "suggested_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_imported_transactions_document_intake"
            columns: ["org_id", "linked_document_intake_id"]
            isOneToOne: false
            referencedRelation: "finance_document_intake"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_imported_transactions_job"
            columns: ["org_id", "suggested_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_imported_transactions_transaction"
            columns: ["org_id", "matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "finance_transactions"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "imported_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imported_transactions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          org_id: string
          quantity: number
          section_name: string | null
          sort_order: number
          subtotal: number
          unit: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          org_id: string
          quantity?: number
          section_name?: string | null
          sort_order?: number
          subtotal?: number
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          org_id?: string
          quantity?: number
          section_name?: string | null
          sort_order?: number
          subtotal?: number
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_ili_invoice"
            columns: ["org_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "invoice_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          balance_due: number | null
          contact_id: string
          created_at: string
          created_by: string | null
          customer_notes: string | null
          deleted_at: string | null
          due_date: string | null
          id: string
          internal_notes: string | null
          job_id: string
          number: string
          org_id: string
          paid_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
          updated_by: string | null
          viewed_at: string | null
        }
        Insert: {
          amount_paid?: number
          balance_due?: number | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          customer_notes?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          internal_notes?: string | null
          job_id: string
          number: string
          org_id: string
          paid_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          updated_by?: string | null
          viewed_at?: string | null
        }
        Update: {
          amount_paid?: number
          balance_due?: number | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          customer_notes?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          internal_notes?: string | null
          job_id?: string
          number?: string
          org_id?: string
          paid_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          updated_by?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_invoices_contact"
            columns: ["org_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_invoices_job"
            columns: ["org_id", "job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          deleted_at: string | null
          id: string
          job_id: string
          org_id: string
          role: Database["public"]["Enums"]["job_assignment_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          job_id: string
          org_id: string
          role?: Database["public"]["Enums"]["job_assignment_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          job_id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["job_assignment_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_job_assignments_job"
            columns: ["org_id", "job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_job_assignments_user"
            columns: ["org_id", "user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "job_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_manual_actual_cost_lines: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          job_id: string
          note: string | null
          org_id: string
          quantity: number
          section_name: string | null
          total_cost: number
          unit_cost: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          id?: string
          job_id: string
          note?: string | null
          org_id: string
          quantity: number
          section_name?: string | null
          total_cost: number
          unit_cost: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          job_id?: string
          note?: string | null
          org_id?: string
          quantity?: number
          section_name?: string | null
          total_cost?: number
          unit_cost?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_job_manual_actual_cost_lines_job"
            columns: ["org_id", "job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "job_manual_actual_cost_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_manual_actual_cost_lines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_manual_actual_cost_lines_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_materials: {
        Row: {
          catalog_item_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          display_name: string | null
          id: string
          job_id: string
          kind: string
          markup_percent: number | null
          note: string | null
          org_id: string
          quantity: number
          section_name: string | null
          sku_snapshot: string | null
          source_assembly_id: string | null
          source_assembly_multiplier: number | null
          source_assembly_name: string | null
          unit_cost: number | null
          unit_sell: number | null
          unit_snapshot: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          catalog_item_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_name?: string | null
          id?: string
          job_id: string
          kind: string
          markup_percent?: number | null
          note?: string | null
          org_id: string
          quantity: number
          section_name?: string | null
          sku_snapshot?: string | null
          source_assembly_id?: string | null
          source_assembly_multiplier?: number | null
          source_assembly_name?: string | null
          unit_cost?: number | null
          unit_sell?: number | null
          unit_snapshot?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          catalog_item_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_name?: string | null
          id?: string
          job_id?: string
          kind?: string
          markup_percent?: number | null
          note?: string | null
          org_id?: string
          quantity?: number
          section_name?: string | null
          sku_snapshot?: string | null
          source_assembly_id?: string | null
          source_assembly_multiplier?: number | null
          source_assembly_name?: string | null
          unit_cost?: number | null
          unit_sell?: number | null
          unit_snapshot?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_job_materials_catalog"
            columns: ["org_id", "catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_job_materials_job"
            columns: ["org_id", "job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "job_materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_materials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_materials_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_types: {
        Row: {
          created_at: string
          created_by: string | null
          default_assembly_id: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          org_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_assembly_id?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          org_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_assembly_id?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          org_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_job_types_default_assembly"
            columns: ["org_id", "default_assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "job_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          contact_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          estimate_snapshot: Json | null
          estimated_cost: number | null
          estimated_hours: number | null
          field_name: string | null
          id: string
          internal_notes: string | null
          job_type_id: string | null
          number: string
          org_id: string
          postcode: string | null
          quote_id: string | null
          requires_full_crew_together: boolean
          scheduled_end: string | null
          scheduled_start: string | null
          state: string | null
          status: Database["public"]["Enums"]["job_status"]
          tags: string[]
          title: string
          updated_at: string
          updated_by: string | null
          waiting_reason:
            | Database["public"]["Enums"]["job_waiting_reason"]
            | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          estimate_snapshot?: Json | null
          estimated_cost?: number | null
          estimated_hours?: number | null
          field_name?: string | null
          id?: string
          internal_notes?: string | null
          job_type_id?: string | null
          number: string
          org_id: string
          postcode?: string | null
          quote_id?: string | null
          requires_full_crew_together?: boolean
          scheduled_end?: string | null
          scheduled_start?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          tags?: string[]
          title: string
          updated_at?: string
          updated_by?: string | null
          waiting_reason?:
            | Database["public"]["Enums"]["job_waiting_reason"]
            | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          estimate_snapshot?: Json | null
          estimated_cost?: number | null
          estimated_hours?: number | null
          field_name?: string | null
          id?: string
          internal_notes?: string | null
          job_type_id?: string | null
          number?: string
          org_id?: string
          postcode?: string | null
          quote_id?: string | null
          requires_full_crew_together?: boolean
          scheduled_end?: string | null
          scheduled_start?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
          waiting_reason?:
            | Database["public"]["Enums"]["job_waiting_reason"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_jobs_contact"
            columns: ["org_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_jobs_job_type"
            columns: ["org_id", "job_type_id"]
            isOneToOne: false
            referencedRelation: "job_types"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_jobs_quote"
            columns: ["org_id", "quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          contact_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          estimated_value: number | null
          follow_up_at: string | null
          id: string
          lost_at: string | null
          lost_reason: string | null
          notes: string | null
          org_id: string
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          title: string
          updated_at: string
          updated_by: string | null
          won_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          estimated_value?: number | null
          follow_up_at?: string | null
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          org_id: string
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
          won_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          estimated_value?: number | null
          follow_up_at?: string | null
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          org_id?: string
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_leads_contact"
            columns: ["org_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          entity_id: string
          entity_type: string
          id: string
          is_internal: boolean
          org_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          is_internal?: boolean
          org_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          is_internal?: boolean
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_counters: {
        Row: {
          counter_type: string
          last_value: number
          org_id: string
        }
        Insert: {
          counter_type: string
          last_value?: number
          org_id: string
        }
        Update: {
          counter_type?: string
          last_value?: number
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_counters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          id: string
          name: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          deleted_at: string | null
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          org_id: string
          received_at: string
          recorded_by: string | null
          reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          invoice_id: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          org_id: string
          received_at?: string
          recorded_by?: string | null
          reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          org_id?: string
          received_at?: string
          recorded_by?: string | null
          reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_payments_invoice"
            columns: ["org_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_line_items: {
        Row: {
          catalog_item_id: string | null
          created_at: string
          description: string
          discount_percent: number
          id: string
          line_kind: string
          line_total_cost: number
          line_total_sell: number
          note: string | null
          org_id: string
          quantity: number
          quote_id: string
          section_name: string | null
          sku: string | null
          sort_order: number
          source_type: string
          subtotal: number
          unit: string
          unit_cost: number
          unit_price: number
          unit_sell: number
          updated_at: string
        }
        Insert: {
          catalog_item_id?: string | null
          created_at?: string
          description: string
          discount_percent?: number
          id?: string
          line_kind?: string
          line_total_cost?: number
          line_total_sell?: number
          note?: string | null
          org_id: string
          quantity?: number
          quote_id: string
          section_name?: string | null
          sku?: string | null
          sort_order?: number
          source_type?: string
          subtotal?: number
          unit?: string
          unit_cost?: number
          unit_price?: number
          unit_sell?: number
          updated_at?: string
        }
        Update: {
          catalog_item_id?: string | null
          created_at?: string
          description?: string
          discount_percent?: number
          id?: string
          line_kind?: string
          line_total_cost?: number
          line_total_sell?: number
          note?: string | null
          org_id?: string
          quantity?: number
          quote_id?: string
          section_name?: string | null
          sku?: string | null
          sort_order?: number
          source_type?: string
          subtotal?: number
          unit?: string
          unit_cost?: number
          unit_price?: number
          unit_sell?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_qli_catalog_item"
            columns: ["org_id", "catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_qli_quote"
            columns: ["org_id", "quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "quote_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          contact_id: string
          created_at: string
          created_by: string | null
          customer_notes: string | null
          deleted_at: string | null
          expires_at: string | null
          id: string
          internal_notes: string | null
          job_type_id: string | null
          labor_cost_rate: number
          labor_rate: number
          labor_sell_rate: number
          lead_id: string | null
          number: string
          org_id: string
          parent_quote_id: string | null
          rejected_at: string | null
          rejection_reason: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tax_amount: number
          tax_rate: number
          title: string
          total: number
          updated_at: string
          updated_by: string | null
          version: number
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          customer_notes?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          internal_notes?: string | null
          job_type_id?: string | null
          labor_cost_rate?: number
          labor_rate?: number
          labor_sell_rate?: number
          lead_id?: string | null
          number: string
          org_id: string
          parent_quote_id?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          title: string
          total?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          customer_notes?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          internal_notes?: string | null
          job_type_id?: string | null
          labor_cost_rate?: number
          labor_rate?: number
          labor_sell_rate?: number
          lead_id?: string | null
          number?: string
          org_id?: string
          parent_quote_id?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          title?: string
          total?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_quotes_contact"
            columns: ["org_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_quotes_job_type"
            columns: ["org_id", "job_type_id"]
            isOneToOne: false
            referencedRelation: "job_types"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_quotes_lead"
            columns: ["org_id", "lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_quotes_parent"
            columns: ["org_id", "parent_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_hours: number
          end_at: string
          id: string
          job_id: string
          notes: string | null
          org_id: string
          start_at: string
          time_bucket: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_hours: number
          end_at: string
          id?: string
          job_id: string
          notes?: string | null
          org_id: string
          start_at: string
          time_bucket?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_hours?: number
          end_at?: string
          id?: string
          job_id?: string
          notes?: string | null
          org_id?: string
          start_at?: string
          time_bucket?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_schedule_blocks_job"
            columns: ["org_id", "job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_schedule_blocks_user"
            columns: ["org_id", "user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "schedule_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      status_transitions: {
        Row: {
          entity_id: string
          entity_type: string
          from_status: string | null
          id: number
          org_id: string
          reason: string | null
          to_status: string
          transitioned_at: string
          transitioned_by: string | null
        }
        Insert: {
          entity_id: string
          entity_type: string
          from_status?: string | null
          id?: number
          org_id: string
          reason?: string | null
          to_status: string
          transitioned_at?: string
          transitioned_by?: string | null
        }
        Update: {
          entity_id?: string
          entity_type?: string
          from_status?: string | null
          id?: number
          org_id?: string
          reason?: string | null
          to_status?: string
          transitioned_at?: string
          transitioned_by?: string | null
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          date: string
          deleted_at: string | null
          description: string | null
          end_time: string | null
          hourly_rate: number | null
          hours: number
          id: string
          is_billable: boolean
          job_id: string
          org_id: string
          rejected_reason: string | null
          section_name: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["time_entry_status"]
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          deleted_at?: string | null
          description?: string | null
          end_time?: string | null
          hourly_rate?: number | null
          hours: number
          id?: string
          is_billable?: boolean
          job_id: string
          org_id: string
          rejected_reason?: string | null
          section_name?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["time_entry_status"]
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          description?: string | null
          end_time?: string | null
          hourly_rate?: number | null
          hours?: number
          id?: string
          is_billable?: boolean
          job_id?: string
          org_id?: string
          rejected_reason?: string | null
          section_name?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["time_entry_status"]
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_time_entries_job"
            columns: ["org_id", "job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "fk_time_entries_user"
            columns: ["org_id", "user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "time_entries_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          deleted_at: string | null
          email: string
          full_name: string
          id: string
          invited_by: string | null
          org_id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          full_name: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          full_name?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_invites_accepted_user_id_fkey"
            columns: ["accepted_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          can_approve_time: boolean
          created_at: string
          deleted_at: string | null
          email: string
          full_name: string
          hourly_rate: number | null
          id: string
          is_active: boolean
          is_foreman: boolean
          org_id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          can_approve_time?: boolean
          created_at?: string
          deleted_at?: string | null
          email: string
          full_name: string
          hourly_rate?: number | null
          id: string
          is_active?: boolean
          is_foreman?: boolean
          org_id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          can_approve_time?: boolean
          created_at?: string
          deleted_at?: string | null
          email?: string
          full_name?: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          is_foreman?: boolean
          org_id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_unavailability: {
        Row: {
          created_at: string
          created_by: string | null
          day: string
          deleted_at: string | null
          id: string
          org_id: string
          reason: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day: string
          deleted_at?: string | null
          id?: string
          org_id: string
          reason?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day?: string
          deleted_at?: string | null
          id?: string
          org_id?: string
          reason?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_unavailability_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_unavailability_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_unavailability_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_unavailability_user_fkey"
            columns: ["org_id", "user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fn_archive_job: {
        Args: { p_deleted_at?: string; p_job_id: string }
        Returns: string
      }
      fn_can_approve_time: { Args: never; Returns: boolean }
      fn_claim_pending_user_invite: { Args: never; Returns: boolean }
      fn_create_invoice_from_snapshot: {
        Args: {
          p_contact_id: string
          p_customer_notes?: string
          p_due_date?: string
          p_internal_notes?: string
          p_job_id: string
          p_lines?: Json
          p_number: string
          p_org_id: string
          p_subtotal: number
          p_tax_amount: number
          p_tax_rate: number
          p_total: number
        }
        Returns: string
      }
      fn_current_org_id: { Args: never; Returns: string }
      fn_current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      fn_current_user_assigned_to_job: {
        Args: { p_job_id: string }
        Returns: boolean
      }
      fn_current_user_id: { Args: never; Returns: string }
      fn_delete_invoice_snapshot: {
        Args: { p_deleted_at?: string; p_invoice_id: string }
        Returns: string
      }
      fn_is_foreman: { Args: never; Returns: boolean }
      fn_next_org_number: {
        Args: { p_org_id: string; p_prefix: string; p_type: string }
        Returns: string
      }
      fn_reactivate_job_assignment: {
        Args: {
          p_assigned_by: string
          p_job_id: string
          p_role: string
          p_updated_at?: string
          p_user_id: string
        }
        Returns: string
      }
      fn_recalculate_invoice_state: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      fn_reset_workspace_data: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      fn_seed_builtin_rules: { Args: { p_org_id: string }; Returns: undefined }
      fn_soft_delete_assembly: {
        Args: { p_assembly_id: string; p_deleted_at?: string }
        Returns: string
      }
      fn_soft_delete_catalog_item: {
        Args: { p_catalog_item_id: string; p_deleted_at?: string }
        Returns: string
      }
      fn_soft_delete_document: {
        Args: { p_deleted_at?: string; p_document_id: string }
        Returns: string
      }
      fn_soft_delete_job_assignment: {
        Args: { p_deleted_at?: string; p_job_assignment_id: string }
        Returns: string
      }
      fn_soft_delete_job_manual_actual_cost_line: {
        Args: {
          p_deleted_at?: string
          p_job_manual_actual_cost_line_id: string
        }
        Returns: string
      }
      fn_soft_delete_job_material: {
        Args: { p_deleted_at?: string; p_job_material_id: string }
        Returns: string
      }
      fn_soft_delete_job_type: {
        Args: { p_deleted_at?: string; p_job_type_id: string }
        Returns: string
      }
      fn_soft_delete_lead: {
        Args: { p_deleted_at?: string; p_lead_id: string }
        Returns: string
      }
      fn_soft_delete_quote: {
        Args: { p_deleted_at?: string; p_quote_id: string }
        Returns: string
      }
      fn_soft_delete_schedule_block: {
        Args: { p_deleted_at?: string; p_schedule_block_id: string }
        Returns: string
      }
      fn_soft_delete_time_entry: {
        Args: { p_deleted_at?: string; p_time_entry_id: string }
        Returns: string
      }
      fn_valid_invoice_transition: {
        Args: {
          from_s: Database["public"]["Enums"]["invoice_status"]
          to_s: Database["public"]["Enums"]["invoice_status"]
        }
        Returns: boolean
      }
      fn_valid_job_transition: {
        Args: {
          from_s: Database["public"]["Enums"]["job_status"]
          to_s: Database["public"]["Enums"]["job_status"]
        }
        Returns: boolean
      }
      fn_valid_lead_transition: {
        Args: {
          from_s: Database["public"]["Enums"]["lead_status"]
          to_s: Database["public"]["Enums"]["lead_status"]
        }
        Returns: boolean
      }
      fn_valid_quote_transition: {
        Args: {
          from_s: Database["public"]["Enums"]["quote_status"]
          to_s: Database["public"]["Enums"]["quote_status"]
        }
        Returns: boolean
      }
      fn_valid_time_entry_transition: {
        Args: {
          from_s: Database["public"]["Enums"]["time_entry_status"]
          to_s: Database["public"]["Enums"]["time_entry_status"]
        }
        Returns: boolean
      }
      fn_validate_polymorphic_entity: {
        Args: { p_entity_id: string; p_entity_type: string; p_org_id: string }
        Returns: boolean
      }
      fn_write_initial_status_transition: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_org_id: string
          p_to_status: string
        }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      action_item_category:
        | "follow_up"
        | "approve_time"
        | "create_invoice"
        | "resolve_overdue"
        | "review_budget"
        | "schedule_job"
        | "other"
      action_item_priority: "low" | "normal" | "high" | "urgent"
      action_item_status: "open" | "snoozed" | "resolved" | "dismissed"
      audit_operation: "INSERT" | "UPDATE" | "DELETE"
      automation_action_type:
        | "create_action_item"
        | "send_notification"
        | "send_email"
        | "update_field"
        | "webhook_post"
      automation_trigger_type:
        | "status_changed"
        | "field_value"
        | "time_elapsed"
        | "no_activity"
        | "scheduled"
        | "webhook_received"
      contact_type: "person" | "company"
      document_category:
        | "permit"
        | "contract"
        | "signature"
        | "receipt"
        | "report"
        | "photo"
        | "other"
      expense_category:
        | "materials"
        | "equipment"
        | "subcontractor"
        | "fuel"
        | "permits"
        | "travel"
        | "other"
      expense_status: "pending" | "approved" | "rejected"
      invoice_status:
        | "draft"
        | "sent"
        | "viewed"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "void"
      job_assignment_role: "lead" | "technician" | "helper"
      job_status:
        | "scheduled"
        | "in_progress"
        | "waiting"
        | "work_complete"
        | "ready_to_invoice"
        | "invoiced"
        | "closed"
        | "cancelled"
      job_waiting_reason:
        | "parts"
        | "permit"
        | "customer_decision"
        | "weather"
        | "other"
      lead_source:
        | "referral"
        | "website"
        | "cold_call"
        | "repeat_customer"
        | "social_media"
        | "other"
      lead_status: "new" | "contacted" | "quoting" | "waiting" | "lost" | "won"
      payment_method:
        | "cash"
        | "check"
        | "bank_transfer"
        | "credit_card"
        | "stripe"
        | "other"
      quote_status:
        | "draft"
        | "sent"
        | "viewed"
        | "accepted"
        | "rejected"
        | "expired"
      time_entry_status: "pending" | "approved" | "rejected"
      user_role: "owner" | "office" | "field" | "bookkeeper"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      action_item_category: [
        "follow_up",
        "approve_time",
        "create_invoice",
        "resolve_overdue",
        "review_budget",
        "schedule_job",
        "other",
      ],
      action_item_priority: ["low", "normal", "high", "urgent"],
      action_item_status: ["open", "snoozed", "resolved", "dismissed"],
      audit_operation: ["INSERT", "UPDATE", "DELETE"],
      automation_action_type: [
        "create_action_item",
        "send_notification",
        "send_email",
        "update_field",
        "webhook_post",
      ],
      automation_trigger_type: [
        "status_changed",
        "field_value",
        "time_elapsed",
        "no_activity",
        "scheduled",
        "webhook_received",
      ],
      contact_type: ["person", "company"],
      document_category: [
        "permit",
        "contract",
        "signature",
        "receipt",
        "report",
        "photo",
        "other",
      ],
      expense_category: [
        "materials",
        "equipment",
        "subcontractor",
        "fuel",
        "permits",
        "travel",
        "other",
      ],
      expense_status: ["pending", "approved", "rejected"],
      invoice_status: [
        "draft",
        "sent",
        "viewed",
        "partially_paid",
        "paid",
        "overdue",
        "void",
      ],
      job_assignment_role: ["lead", "technician", "helper"],
      job_status: [
        "scheduled",
        "in_progress",
        "waiting",
        "work_complete",
        "ready_to_invoice",
        "invoiced",
        "closed",
        "cancelled",
      ],
      job_waiting_reason: [
        "parts",
        "permit",
        "customer_decision",
        "weather",
        "other",
      ],
      lead_source: [
        "referral",
        "website",
        "cold_call",
        "repeat_customer",
        "social_media",
        "other",
      ],
      lead_status: ["new", "contacted", "quoting", "waiting", "lost", "won"],
      payment_method: [
        "cash",
        "check",
        "bank_transfer",
        "credit_card",
        "stripe",
        "other",
      ],
      quote_status: [
        "draft",
        "sent",
        "viewed",
        "accepted",
        "rejected",
        "expired",
      ],
      time_entry_status: ["pending", "approved", "rejected"],
      user_role: ["owner", "office", "field", "bookkeeper"],
    },
  },
} as const
