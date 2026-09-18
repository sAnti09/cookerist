// Generated via the Supabase MCP server's generate_typescript_types --
// regenerate the same way after any schema migration (see CLAUDE.md's
// "Sync backend (Supabase)" and "Account-less identity layer" sections).
// Do not hand-edit.

export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

export type Database = {
	// Allows to automatically instantiate createClient with right options
	// instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
	__InternalSupabase: {
		PostgrestVersion: "14.5";
	};
	public: {
		Tables: {
			devices: {
				Row: {
					created_at: string;
					id: string;
					last_seen_at: string | null;
					secret_hash: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					id?: string;
					last_seen_at?: string | null;
					secret_hash: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					id?: string;
					last_seen_at?: string | null;
					secret_hash?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "devices_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "users";
						referencedColumns: ["id"];
					},
				];
			};
			grocery_lists: {
				Row: {
					created_at: string;
					data: Json;
					deleted_at: string | null;
					id: string;
					owner_id: string;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					data: Json;
					deleted_at?: string | null;
					id: string;
					owner_id: string;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					data?: Json;
					deleted_at?: string | null;
					id?: string;
					owner_id?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "grocery_lists_owner_id_fkey";
						columns: ["owner_id"];
						isOneToOne: false;
						referencedRelation: "users";
						referencedColumns: ["id"];
					},
				];
			};
			meal_plans: {
				Row: {
					created_at: string;
					data: Json;
					deleted_at: string | null;
					id: string;
					owner_id: string;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					data: Json;
					deleted_at?: string | null;
					id: string;
					owner_id: string;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					data?: Json;
					deleted_at?: string | null;
					id?: string;
					owner_id?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "meal_plans_owner_id_fkey";
						columns: ["owner_id"];
						isOneToOne: false;
						referencedRelation: "users";
						referencedColumns: ["id"];
					},
				];
			};
			pairing_codes: {
				Row: {
					code_hash: string;
					created_at: string;
					expires_at: string;
					id: string;
					used_at: string | null;
					user_id: string;
				};
				Insert: {
					code_hash: string;
					created_at?: string;
					expires_at: string;
					id?: string;
					used_at?: string | null;
					user_id: string;
				};
				Update: {
					code_hash?: string;
					created_at?: string;
					expires_at?: string;
					id?: string;
					used_at?: string | null;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "pairing_codes_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "users";
						referencedColumns: ["id"];
					},
				];
			};
			recipes: {
				Row: {
					created_at: string;
					data: Json;
					deleted_at: string | null;
					id: string;
					owner_id: string;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					data: Json;
					deleted_at?: string | null;
					id: string;
					owner_id: string;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					data?: Json;
					deleted_at?: string | null;
					id?: string;
					owner_id?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "recipes_owner_id_fkey";
						columns: ["owner_id"];
						isOneToOne: false;
						referencedRelation: "users";
						referencedColumns: ["id"];
					},
				];
			};
			resource_share_codes: {
				Row: {
					code_hash: string;
					created_at: string;
					expires_at: string;
					id: string;
					owner_id: string;
					resource_id: string;
					resource_table: string;
					used_at: string | null;
				};
				Insert: {
					code_hash: string;
					created_at?: string;
					expires_at: string;
					id?: string;
					owner_id: string;
					resource_id: string;
					resource_table: string;
					used_at?: string | null;
				};
				Update: {
					code_hash?: string;
					created_at?: string;
					expires_at?: string;
					id?: string;
					owner_id?: string;
					resource_id?: string;
					resource_table?: string;
					used_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: "resource_share_codes_owner_id_fkey";
						columns: ["owner_id"];
						isOneToOne: false;
						referencedRelation: "users";
						referencedColumns: ["id"];
					},
				];
			};
			resource_shares: {
				Row: {
					created_at: string;
					grantee_id: string;
					id: string;
					owner_id: string;
					resource_id: string;
					resource_table: string;
				};
				Insert: {
					created_at?: string;
					grantee_id: string;
					id?: string;
					owner_id: string;
					resource_id: string;
					resource_table: string;
				};
				Update: {
					created_at?: string;
					grantee_id?: string;
					id?: string;
					owner_id?: string;
					resource_id?: string;
					resource_table?: string;
				};
				Relationships: [
					{
						foreignKeyName: "resource_shares_grantee_id_fkey";
						columns: ["grantee_id"];
						isOneToOne: false;
						referencedRelation: "users";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "resource_shares_owner_id_fkey";
						columns: ["owner_id"];
						isOneToOne: false;
						referencedRelation: "users";
						referencedColumns: ["id"];
					},
				];
			};
			users: {
				Row: {
					created_at: string;
					id: string;
				};
				Insert: {
					created_at?: string;
					id?: string;
				};
				Update: {
					created_at?: string;
					id?: string;
				};
				Relationships: [];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			[_ in never]: never;
		};
		Enums: {
			[_ in never]: never;
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
	keyof Database,
	"public"
>];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		| keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
				DefaultSchema["Views"])
		? (DefaultSchema["Tables"] &
				DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema["Tables"]
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
		? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema["Tables"]
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
		? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends
		| keyof DefaultSchema["Enums"]
		| { schema: keyof DatabaseWithoutInternals },
	EnumName extends DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
		: never = never,
> = DefaultSchemaEnumNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
		? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
		: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
		| keyof DefaultSchema["CompositeTypes"]
		| { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
		: never = never,
> = PublicCompositeTypeNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
		? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
		: never;

export const Constants = {
	public: {
		Enums: {},
	},
} as const;
