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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value?: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          appointment_at: string
          created_at: string
          customer_name: string
          id: string
          notes: string
          phone: string
          service: string
          status: string
          store_id: string | null
        }
        Insert: {
          appointment_at: string
          created_at?: string
          customer_name?: string
          id?: string
          notes?: string
          phone?: string
          service?: string
          status?: string
          store_id?: string | null
        }
        Update: {
          appointment_at?: string
          created_at?: string
          customer_name?: string
          id?: string
          notes?: string
          phone?: string
          service?: string
          status?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_services: {
        Row: {
          active: boolean
          created_at: string
          emoji: string
          guide: string
          id: string
          name: string
          price_points: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          emoji?: string
          guide?: string
          id?: string
          name: string
          price_points?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          emoji?: string
          guide?: string
          id?: string
          name?: string
          price_points?: number
        }
        Relationships: []
      }
      brains: {
        Row: {
          created_at: string
          emoji: string
          id: string
          in_mother: boolean
          instructions: string
          is_kingdom: boolean
          knowledge: string
          library_tag: string
          name: string
          scopes: string[]
          short_desc: string
          source: string
          specialty: string
          store_id: string
          uses: number
          voice_name: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          in_mother?: boolean
          instructions?: string
          is_kingdom?: boolean
          knowledge?: string
          library_tag?: string
          name: string
          scopes?: string[]
          short_desc?: string
          source?: string
          specialty?: string
          store_id: string
          uses?: number
          voice_name?: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          in_mother?: boolean
          instructions?: string
          is_kingdom?: boolean
          knowledge?: string
          library_tag?: string
          name?: string
          scopes?: string[]
          short_desc?: string
          source?: string
          specialty?: string
          store_id?: string
          uses?: number
          voice_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "brains_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_messages: {
        Row: {
          channel: string
          created_at: string
          customer_name: string
          customer_phone: string
          direction: string
          id: string
          replied: boolean
          store_id: string | null
          text: string
        }
        Insert: {
          channel?: string
          created_at?: string
          customer_name?: string
          customer_phone?: string
          direction?: string
          id?: string
          replied?: boolean
          store_id?: string | null
          text?: string
        }
        Update: {
          channel?: string
          created_at?: string
          customer_name?: string
          customer_phone?: string
          direction?: string
          id?: string
          replied?: boolean
          store_id?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_messages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          auto_reply: boolean
          connected: boolean
          created_at: string
          id: string
          label: string
          platform: string
          store_id: string | null
        }
        Insert: {
          auto_reply?: boolean
          connected?: boolean
          created_at?: string
          id?: string
          label?: string
          platform: string
          store_id?: string | null
        }
        Update: {
          auto_reply?: boolean
          connected?: boolean
          created_at?: string
          id?: string
          label?: string
          platform?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channels_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          admin_reply: string
          created_at: string
          details: string
          id: string
          status: string
          store_id: string | null
          subject: string
          user_id: string
        }
        Insert: {
          admin_reply?: string
          created_at?: string
          details?: string
          id?: string
          status?: string
          store_id?: string | null
          subject: string
          user_id?: string
        }
        Update: {
          admin_reply?: string
          created_at?: string
          details?: string
          id?: string
          status?: string
          store_id?: string | null
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_messages: {
        Row: {
          created_at: string
          id: string
          matched_rule_id: string | null
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          matched_rule_id?: string | null
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          matched_rule_id?: string | null
          text?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          channel: string
          created_at: string
          id: string
          last_message: string
          last_seen: string | null
          name: string
          notes: string
          phone: string
          purchases: string
          rating: number
          store_id: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          last_message?: string
          last_seen?: string | null
          name?: string
          notes?: string
          phone?: string
          purchases?: string
          rating?: number
          store_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          last_message?: string
          last_seen?: string | null
          name?: string
          notes?: string
          phone?: string
          purchases?: string
          rating?: number
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_golden: {
        Row: {
          created_at: string
          id: string
          mood: string
          path: string
          score: number
          speed: number
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          mood?: string
          path: string
          score?: number
          speed?: number
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          mood?: string
          path?: string
          score?: number
          speed?: number
          text?: string
        }
        Relationships: []
      }
      factory_logs: {
        Row: {
          created_at: string
          id: string
          summary: string
          trained: number
        }
        Insert: {
          created_at?: string
          id?: string
          summary?: string
          trained?: number
        }
        Update: {
          created_at?: string
          id?: string
          summary?: string
          trained?: number
        }
        Relationships: []
      }
      factory_notes: {
        Row: {
          created_at: string
          id: string
          say: string
          word: string
        }
        Insert: {
          created_at?: string
          id?: string
          say: string
          word: string
        }
        Update: {
          created_at?: string
          id?: string
          say?: string
          word?: string
        }
        Relationships: []
      }
      factory_retrain: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_score: number
          note: string
          status: string
          text: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_score?: number
          note?: string
          status?: string
          text: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_score?: number
          note?: string
          status?: string
          text?: string
        }
        Relationships: []
      }
      kingdom_pricing: {
        Row: {
          created_at: string
          dammar: number | null
          id: string
          is_editable: boolean
          overhead_points: number
          profit: number | null
          profit_multiplier: number
          selling_price: number | null
          service_name: string
          supplier_cost_points: number
          supplier_name: string
        }
        Insert: {
          created_at?: string
          dammar?: number | null
          id?: string
          is_editable?: boolean
          overhead_points?: number
          profit?: number | null
          profit_multiplier?: number
          selling_price?: number | null
          service_name: string
          supplier_cost_points?: number
          supplier_name?: string
        }
        Update: {
          created_at?: string
          dammar?: number | null
          id?: string
          is_editable?: boolean
          overhead_points?: number
          profit?: number | null
          profit_multiplier?: number
          selling_price?: number | null
          service_name?: string
          supplier_cost_points?: number
          supplier_name?: string
        }
        Relationships: []
      }
      media_library: {
        Row: {
          code: string
          created_at: string
          id: string
          kind: string
          mime: string
          path: string
          store_id: string
          title: string
          transcript: string
        }
        Insert: {
          code?: string
          created_at?: string
          id?: string
          kind?: string
          mime?: string
          path: string
          store_id: string
          title?: string
          transcript?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          kind?: string
          mime?: string
          path?: string
          store_id?: string
          title?: string
          transcript?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_library_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_brain_overrides: {
        Row: {
          content: string
          created_at: string
          id: string
          merchant_id: string
          mother_brain_id: string
          reply_id: string | null
          type: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          merchant_id?: string
          mother_brain_id: string
          reply_id?: string | null
          type: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          merchant_id?: string
          mother_brain_id?: string
          reply_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_brain_overrides_mother_brain_id_fkey"
            columns: ["mother_brain_id"]
            isOneToOne: false
            referencedRelation: "brains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_brain_overrides_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "reply_library"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_brain_usage: {
        Row: {
          brain_id: string | null
          created_at: string
          id: string
          is_active: boolean
          merchant_id: string
          platform: string | null
          reply_id: string | null
          toggle_key: string
          usage_type: string | null
          voice_mode: string | null
        }
        Insert: {
          brain_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          merchant_id?: string
          platform?: string | null
          reply_id?: string | null
          toggle_key: string
          usage_type?: string | null
          voice_mode?: string | null
        }
        Update: {
          brain_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          merchant_id?: string
          platform?: string | null
          reply_id?: string | null
          toggle_key?: string
          usage_type?: string | null
          voice_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_brain_usage_brain_id_fkey"
            columns: ["brain_id"]
            isOneToOne: false
            referencedRelation: "brains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_brain_usage_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "reply_library"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_payments: {
        Row: {
          amount_paid: number
          approval_token: string
          created_at: string
          currency: string
          expires_at: string
          id: string
          points_calculated: number
          processed_at: string | null
          receipt_url: string | null
          status: string
          store_id: string
          transaction_number: string
          user_id: string
        }
        Insert: {
          amount_paid: number
          approval_token?: string
          created_at?: string
          currency: string
          expires_at?: string
          id?: string
          points_calculated: number
          processed_at?: string | null
          receipt_url?: string | null
          status?: string
          store_id: string
          transaction_number: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          approval_token?: string
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          points_calculated?: number
          processed_at?: string | null
          receipt_url?: string | null
          status?: string
          store_id?: string
          transaction_number?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          price: number
          store_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          price?: number
          store_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          price?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      profits_log: {
        Row: {
          cost_points: number
          dammar: number
          date: string
          id: string
          profit_earned: number
          service_used: string
          store_id: string | null
          user_id: string | null
        }
        Insert: {
          cost_points: number
          dammar: number
          date?: string
          id?: string
          profit_earned: number
          service_used: string
          store_id?: string | null
          user_id?: string | null
        }
        Update: {
          cost_points?: number
          dammar?: number
          date?: string
          id?: string
          profit_earned?: number
          service_used?: string
          store_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profits_log_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      reply_library: {
        Row: {
          created_at: string
          id: string
          reply_text: string
          store_id: string
          tag: string
          trigger_text: string
        }
        Insert: {
          created_at?: string
          id?: string
          reply_text: string
          store_id: string
          tag?: string
          trigger_text: string
        }
        Update: {
          created_at?: string
          id?: string
          reply_text?: string
          store_id?: string
          tag?: string
          trigger_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "reply_library_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          active: boolean
          bio: string
          business_type: string
          created_at: string
          id: string
          name: string
          owner_id: string
          plan: string
          whatsapp: string
        }
        Insert: {
          active?: boolean
          bio?: string
          business_type?: string
          created_at?: string
          id?: string
          name?: string
          owner_id: string
          plan?: string
          whatsapp?: string
        }
        Update: {
          active?: boolean
          bio?: string
          business_type?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          plan?: string
          whatsapp?: string
        }
        Relationships: []
      }
      studio_audio: {
        Row: {
          chars: number
          created_at: string
          id: string
          path: string
          store_id: string
          text: string
          voice_id: string
          voice_name: string
        }
        Insert: {
          chars?: number
          created_at?: string
          id?: string
          path: string
          store_id: string
          text: string
          voice_id: string
          voice_name?: string
        }
        Update: {
          chars?: number
          created_at?: string
          id?: string
          path?: string
          store_id?: string
          text?: string
          voice_id?: string
          voice_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_audio_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_voices: {
        Row: {
          created_at: string
          fish_id: string
          id: string
          name: string
          store_id: string
        }
        Insert: {
          created_at?: string
          fish_id: string
          id?: string
          name: string
          store_id: string
        }
        Update: {
          created_at?: string
          fish_id?: string
          id?: string
          name?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_voices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      topup_requests: {
        Row: {
          amount_sar: number
          created_at: string
          id: string
          points: number
          reference: string
          status: string
          store_id: string
        }
        Insert: {
          amount_sar?: number
          created_at?: string
          id?: string
          points: number
          reference?: string
          status?: string
          store_id: string
        }
        Update: {
          amount_sar?: number
          created_at?: string
          id?: string
          points?: number
          reference?: string
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topup_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      training_rules: {
        Row: {
          category: string
          created_at: string
          id: string
          response_text: string
          store_id: string | null
          trigger_text: string
          use_count: number
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          response_text: string
          store_id?: string | null
          trigger_text: string
          use_count?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          response_text?: string
          store_id?: string | null
          trigger_text?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_rules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wa_autoreply: {
        Row: {
          created_at: string
          enabled: boolean
          instance: string
          source: string
          store_id: string
          voice: boolean
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          instance: string
          source?: string
          store_id: string
          voice?: boolean
        }
        Update: {
          created_at?: string
          enabled?: boolean
          instance?: string
          source?: string
          store_id?: string
          voice?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "wa_autoreply_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_inbox: {
        Row: {
          created_at: string
          error: string
          from_number: string
          instance: string
          msg_id: string
          reply: string
          status: string
          store_id: string | null
          text: string
        }
        Insert: {
          created_at?: string
          error?: string
          from_number?: string
          instance: string
          msg_id: string
          reply?: string
          status?: string
          store_id?: string | null
          text?: string
        }
        Update: {
          created_at?: string
          error?: string
          from_number?: string
          instance?: string
          msg_id?: string
          reply?: string
          status?: string
          store_id?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_inbox_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string
          store_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason?: string
          store_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          store_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_payment: { Args: { _token: string }; Returns: Json }
      create_payment: {
        Args: {
          _amount: number
          _currency: string
          _receipt: string
          _store: string
          _txn: string
        }
        Returns: {
          id: string
          points: number
          token: string
        }[]
      }
      ensure_wallet: { Args: { _store: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      kingdom_brains: {
        Args: never
        Returns: {
          emoji: string
          id: string
          name: string
          reply_count: number
          short_desc: string
        }[]
      }
      kingdom_replies: {
        Args: { _brain: string }
        Returns: {
          id: string
          reply_text: string
          trigger_text: string
        }[]
      }
      review_topup: {
        Args: { _approve: boolean; _id: string }
        Returns: undefined
      }
      spend_points: {
        Args: { _amount: number; _reason: string; _store: string }
        Returns: number
      }
      spend_points_system: {
        Args: { _amount: number; _reason: string; _store: string }
        Returns: number
      }
      spend_service: {
        Args: { _service: string; _store: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "merchant"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "merchant"],
    },
  },
} as const
