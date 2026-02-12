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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      awards: {
        Row: {
          award_key: string
          award_type: string
          created_at: string
          description: string
          earned_at: string
          icon: string
          id: string
          metadata: Json | null
          tier: string
          title: string
          user_id: string
        }
        Insert: {
          award_key: string
          award_type: string
          created_at?: string
          description?: string
          earned_at?: string
          icon?: string
          id?: string
          metadata?: Json | null
          tier?: string
          title: string
          user_id: string
        }
        Update: {
          award_key?: string
          award_type?: string
          created_at?: string
          description?: string
          earned_at?: string
          icon?: string
          id?: string
          metadata?: Json | null
          tier?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      biometric_samples: {
        Row: {
          confidence: number | null
          created_at: string
          date_time: string
          hr_bpm: number | null
          hrv_rmssd_ms: number | null
          id: string
          notes: string | null
          resp_rate_rpm: number | null
          source: string
          spo2_pct: number | null
          user_id: string
          vo2max_mlkgmin: number | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          date_time?: string
          hr_bpm?: number | null
          hrv_rmssd_ms?: number | null
          id?: string
          notes?: string | null
          resp_rate_rpm?: number | null
          source?: string
          spo2_pct?: number | null
          user_id: string
          vo2max_mlkgmin?: number | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          date_time?: string
          hr_bpm?: number | null
          hrv_rmssd_ms?: number | null
          id?: string
          notes?: string | null
          resp_rate_rpm?: number | null
          source?: string
          spo2_pct?: number | null
          user_id?: string
          vo2max_mlkgmin?: number | null
        }
        Relationships: []
      }
      body_measurements: {
        Row: {
          bicep_left_cm: number | null
          bicep_right_cm: number | null
          body_fat_pct: number | null
          calf_left_cm: number | null
          calf_right_cm: number | null
          chest_cm: number | null
          created_at: string
          date: string
          hips_cm: number | null
          id: string
          neck_cm: number | null
          notes: string | null
          shoulders_cm: number | null
          thigh_left_cm: number | null
          thigh_right_cm: number | null
          updated_at: string
          user_id: string
          waist_cm: number | null
        }
        Insert: {
          bicep_left_cm?: number | null
          bicep_right_cm?: number | null
          body_fat_pct?: number | null
          calf_left_cm?: number | null
          calf_right_cm?: number | null
          chest_cm?: number | null
          created_at?: string
          date: string
          hips_cm?: number | null
          id?: string
          neck_cm?: number | null
          notes?: string | null
          shoulders_cm?: number | null
          thigh_left_cm?: number | null
          thigh_right_cm?: number | null
          updated_at?: string
          user_id: string
          waist_cm?: number | null
        }
        Update: {
          bicep_left_cm?: number | null
          bicep_right_cm?: number | null
          body_fat_pct?: number | null
          calf_left_cm?: number | null
          calf_right_cm?: number | null
          chest_cm?: number | null
          created_at?: string
          date?: string
          hips_cm?: number | null
          id?: string
          neck_cm?: number | null
          notes?: string | null
          shoulders_cm?: number | null
          thigh_left_cm?: number | null
          thigh_right_cm?: number | null
          updated_at?: string
          user_id?: string
          waist_cm?: number | null
        }
        Relationships: []
      }
      daily_logs: {
        Row: {
          active_kcal: number | null
          active_minutes: number | null
          acwr: number | null
          carbs_g: number | null
          created_at: string
          date: string
          fat_g: number | null
          fiber_g: number | null
          id: string
          kcal: number | null
          protein_g: number | null
          readiness_explain: string | null
          readiness_recommendation: string | null
          readiness_score: number | null
          readiness_status: string | null
          sleep_duration_min: number | null
          sleep_quality: number | null
          steps: number | null
          supplement_planned: number | null
          supplement_taken: number | null
          updated_at: string
          user_id: string
          volume_load: number | null
          workout_count: number | null
        }
        Insert: {
          active_kcal?: number | null
          active_minutes?: number | null
          acwr?: number | null
          carbs_g?: number | null
          created_at?: string
          date: string
          fat_g?: number | null
          fiber_g?: number | null
          id?: string
          kcal?: number | null
          protein_g?: number | null
          readiness_explain?: string | null
          readiness_recommendation?: string | null
          readiness_score?: number | null
          readiness_status?: string | null
          sleep_duration_min?: number | null
          sleep_quality?: number | null
          steps?: number | null
          supplement_planned?: number | null
          supplement_taken?: number | null
          updated_at?: string
          user_id: string
          volume_load?: number | null
          workout_count?: number | null
        }
        Update: {
          active_kcal?: number | null
          active_minutes?: number | null
          acwr?: number | null
          carbs_g?: number | null
          created_at?: string
          date?: string
          fat_g?: number | null
          fiber_g?: number | null
          id?: string
          kcal?: number | null
          protein_g?: number | null
          readiness_explain?: string | null
          readiness_recommendation?: string | null
          readiness_score?: number | null
          readiness_status?: string | null
          sleep_duration_min?: number | null
          sleep_quality?: number | null
          steps?: number | null
          supplement_planned?: number | null
          supplement_taken?: number | null
          updated_at?: string
          user_id?: string
          volume_load?: number | null
          workout_count?: number | null
        }
        Relationships: []
      }
      exercises: {
        Row: {
          common_mistakes: string[] | null
          created_at: string
          equipment: string | null
          form_cues: string[] | null
          id: string
          muscle_group: string
          name: string
          updated_at: string
          user_id: string | null
          video_url: string | null
        }
        Insert: {
          common_mistakes?: string[] | null
          created_at?: string
          equipment?: string | null
          form_cues?: string[] | null
          id?: string
          muscle_group?: string
          name: string
          updated_at?: string
          user_id?: string | null
          video_url?: string | null
        }
        Update: {
          common_mistakes?: string[] | null
          created_at?: string
          equipment?: string | null
          form_cues?: string[] | null
          id?: string
          muscle_group?: string
          name?: string
          updated_at?: string
          user_id?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      food_items: {
        Row: {
          brand: string | null
          carbs_g: number
          created_at: string
          fat_g: number
          fiber_g: number
          id: string
          is_favorite: boolean | null
          kcal: number
          name: string
          price_per_serving: number | null
          protein_g: number
          serving_g: number
          tags: string[] | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          brand?: string | null
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          id?: string
          is_favorite?: boolean | null
          kcal?: number
          name: string
          price_per_serving?: number | null
          protein_g?: number
          serving_g?: number
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          brand?: string | null
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          id?: string
          is_favorite?: boolean | null
          kcal?: number
          name?: string
          price_per_serving?: number | null
          protein_g?: number
          serving_g?: number
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      habit_nudges: {
        Row: {
          created_at: string
          enabled: boolean | null
          frequency_cap: number | null
          id: string
          message: string
          priority: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean | null
          frequency_cap?: number | null
          id?: string
          message?: string
          priority?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean | null
          frequency_cap?: number | null
          id?: string
          message?: string
          priority?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meal_entries: {
        Row: {
          created_at: string
          date_time: string
          id: string
          meal_type: string
          total_carbs_g: number
          total_fat_g: number
          total_fiber_g: number
          total_kcal: number
          total_protein_g: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_time?: string
          id?: string
          meal_type?: string
          total_carbs_g?: number
          total_fat_g?: number
          total_fiber_g?: number
          total_kcal?: number
          total_protein_g?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_time?: string
          id?: string
          meal_type?: string
          total_carbs_g?: number
          total_fat_g?: number
          total_fiber_g?: number
          total_kcal?: number
          total_protein_g?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meal_entry_items: {
        Row: {
          carbs_g: number
          created_at: string
          fat_g: number
          fiber_g: number
          food_item_id: string | null
          food_name: string
          id: string
          kcal: number
          meal_entry_id: string
          protein_g: number
          servings: number
        }
        Insert: {
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          food_item_id?: string | null
          food_name?: string
          id?: string
          kcal?: number
          meal_entry_id: string
          protein_g?: number
          servings?: number
        }
        Update: {
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          food_item_id?: string | null
          food_name?: string
          id?: string
          kcal?: number
          meal_entry_id?: string
          protein_g?: number
          servings?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_entry_items_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_entry_items_meal_entry_id_fkey"
            columns: ["meal_entry_id"]
            isOneToOne: false
            referencedRelation: "meal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_items: {
        Row: {
          carbs_g: number | null
          created_at: string
          day_index: number
          fat_g: number | null
          food_item_id: string | null
          food_name: string
          id: string
          kcal: number | null
          meal_plan_id: string
          meal_type: string
          protein_g: number | null
          serving_g: number | null
        }
        Insert: {
          carbs_g?: number | null
          created_at?: string
          day_index?: number
          fat_g?: number | null
          food_item_id?: string | null
          food_name?: string
          id?: string
          kcal?: number | null
          meal_plan_id: string
          meal_type?: string
          protein_g?: number | null
          serving_g?: number | null
        }
        Update: {
          carbs_g?: number | null
          created_at?: string
          day_index?: number
          fat_g?: number | null
          food_item_id?: string | null
          food_name?: string
          id?: string
          kcal?: number | null
          meal_plan_id?: string
          meal_type?: string
          protein_g?: number | null
          serving_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_items_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_items_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          created_at: string
          end_date: string | null
          goal: string | null
          id: string
          meals_per_day: number | null
          name: string
          start_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          goal?: string | null
          id?: string
          meals_per_day?: number | null
          name?: string
          start_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          goal?: string | null
          id?: string
          meals_per_day?: number | null
          name?: string
          start_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity_level: string | null
          allergies: string[] | null
          created_at: string
          dietary_preference: string | null
          disliked_foods: string[] | null
          dob: string | null
          goal: string | null
          height_cm: number | null
          id: string
          macro_carbs_g: number | null
          macro_fat_g: number | null
          macro_fiber_g: number | null
          macro_protein_g: number | null
          name: string
          onboarding_completed: boolean | null
          sex: string | null
          sleep_target_bedtime: string | null
          sleep_target_hours: number | null
          sleep_target_waketime: string | null
          tdee_target_kcal: number | null
          training_level: string | null
          units_height: string | null
          units_weight: string | null
          updated_at: string
          user_id: string
          water_target_ml: number | null
          weight_kg: number | null
          work_type: string | null
        }
        Insert: {
          activity_level?: string | null
          allergies?: string[] | null
          created_at?: string
          dietary_preference?: string | null
          disliked_foods?: string[] | null
          dob?: string | null
          goal?: string | null
          height_cm?: number | null
          id?: string
          macro_carbs_g?: number | null
          macro_fat_g?: number | null
          macro_fiber_g?: number | null
          macro_protein_g?: number | null
          name?: string
          onboarding_completed?: boolean | null
          sex?: string | null
          sleep_target_bedtime?: string | null
          sleep_target_hours?: number | null
          sleep_target_waketime?: string | null
          tdee_target_kcal?: number | null
          training_level?: string | null
          units_height?: string | null
          units_weight?: string | null
          updated_at?: string
          user_id: string
          water_target_ml?: number | null
          weight_kg?: number | null
          work_type?: string | null
        }
        Update: {
          activity_level?: string | null
          allergies?: string[] | null
          created_at?: string
          dietary_preference?: string | null
          disliked_foods?: string[] | null
          dob?: string | null
          goal?: string | null
          height_cm?: number | null
          id?: string
          macro_carbs_g?: number | null
          macro_fat_g?: number | null
          macro_fiber_g?: number | null
          macro_protein_g?: number | null
          name?: string
          onboarding_completed?: boolean | null
          sex?: string | null
          sleep_target_bedtime?: string | null
          sleep_target_hours?: number | null
          sleep_target_waketime?: string | null
          tdee_target_kcal?: number | null
          training_level?: string | null
          units_height?: string | null
          units_weight?: string | null
          updated_at?: string
          user_id?: string
          water_target_ml?: number | null
          weight_kg?: number | null
          work_type?: string | null
        }
        Relationships: []
      }
      progress_photos: {
        Row: {
          created_at: string
          date: string
          id: string
          notes: string | null
          photo_url: string
          pose: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          photo_url: string
          pose?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          photo_url?: string
          pose?: string | null
          user_id?: string
        }
        Relationships: []
      }
      routine_days: {
        Row: {
          created_at: string
          day_of_week: number
          id: string
          is_deload: boolean | null
          is_rest: boolean | null
          notes: string | null
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          id?: string
          is_deload?: boolean | null
          is_rest?: boolean | null
          notes?: string | null
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          id?: string
          is_deload?: boolean | null
          is_rest?: boolean | null
          notes?: string | null
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_days_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      sleep_logs: {
        Row: {
          bedtime: string
          caffeine_cutoff_time: string | null
          created_at: string
          deep_min: number | null
          id: string
          light_min: number | null
          quality: number | null
          rem_min: number | null
          screen_off_time: string | null
          updated_at: string
          user_id: string
          waketime: string
        }
        Insert: {
          bedtime: string
          caffeine_cutoff_time?: string | null
          created_at?: string
          deep_min?: number | null
          id?: string
          light_min?: number | null
          quality?: number | null
          rem_min?: number | null
          screen_off_time?: string | null
          updated_at?: string
          user_id: string
          waketime: string
        }
        Update: {
          bedtime?: string
          caffeine_cutoff_time?: string | null
          created_at?: string
          deep_min?: number | null
          id?: string
          light_min?: number | null
          quality?: number | null
          rem_min?: number | null
          screen_off_time?: string | null
          updated_at?: string
          user_id?: string
          waketime?: string
        }
        Relationships: []
      }
      supplement_intake_logs: {
        Row: {
          created_at: string
          date_time: string
          dose_override: string | null
          id: string
          supplement_id: string
          taken: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date_time?: string
          dose_override?: string | null
          id?: string
          supplement_id: string
          taken?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string
          date_time?: string
          dose_override?: string | null
          id?: string
          supplement_id?: string
          taken?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplement_intake_logs_supplement_id_fkey"
            columns: ["supplement_id"]
            isOneToOne: false
            referencedRelation: "supplements"
            referencedColumns: ["id"]
          },
        ]
      }
      supplements: {
        Row: {
          category: string | null
          created_at: string
          cycle_mode: string | null
          cycle_off_weeks: number | null
          cycle_on_weeks: number | null
          cycle_start_date: string | null
          dose_text: string | null
          id: string
          name: string
          notes: string | null
          timing: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          cycle_mode?: string | null
          cycle_off_weeks?: number | null
          cycle_on_weeks?: number | null
          cycle_start_date?: string | null
          dose_text?: string | null
          id?: string
          name: string
          notes?: string | null
          timing?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          cycle_mode?: string | null
          cycle_off_weeks?: number | null
          cycle_on_weeks?: number | null
          cycle_start_date?: string | null
          dose_text?: string | null
          id?: string
          name?: string
          notes?: string | null
          timing?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      water_logs: {
        Row: {
          amount_ml: number
          created_at: string
          date: string
          id: string
          logged_at: string
          user_id: string
        }
        Insert: {
          amount_ml?: number
          created_at?: string
          date?: string
          id?: string
          logged_at?: string
          user_id: string
        }
        Update: {
          amount_ml?: number
          created_at?: string
          date?: string
          id?: string
          logged_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wearable_sources: {
        Row: {
          connected: boolean | null
          created_at: string
          id: string
          last_sync: string | null
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connected?: boolean | null
          created_at?: string
          id?: string
          last_sync?: string | null
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connected?: boolean | null
          created_at?: string
          id?: string
          last_sync?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_challenges: {
        Row: {
          challenge_key: string
          completed: boolean
          completed_at: string | null
          created_at: string
          current_value: number
          description: string
          icon: string
          id: string
          reward_tier: string
          reward_title: string | null
          target_value: number
          title: string
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          challenge_key: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          current_value?: number
          description?: string
          icon?: string
          id?: string
          reward_tier?: string
          reward_title?: string | null
          target_value?: number
          title: string
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          challenge_key?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          current_value?: number
          description?: string
          icon?: string
          id?: string
          reward_tier?: string
          reward_title?: string | null
          target_value?: number
          title?: string
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      weekly_reviews: {
        Row: {
          avg_kcal: number | null
          avg_protein_g: number | null
          avg_sleep_min: number | null
          created_at: string
          id: string
          insights: Json | null
          readiness_avg: number | null
          recommendations: Json | null
          updated_at: string
          user_id: string
          week_start_date: string
          workout_completion_pct: number | null
        }
        Insert: {
          avg_kcal?: number | null
          avg_protein_g?: number | null
          avg_sleep_min?: number | null
          created_at?: string
          id?: string
          insights?: Json | null
          readiness_avg?: number | null
          recommendations?: Json | null
          updated_at?: string
          user_id: string
          week_start_date: string
          workout_completion_pct?: number | null
        }
        Update: {
          avg_kcal?: number | null
          avg_protein_g?: number | null
          avg_sleep_min?: number | null
          created_at?: string
          id?: string
          insights?: Json | null
          readiness_avg?: number | null
          recommendations?: Json | null
          updated_at?: string
          user_id?: string
          week_start_date?: string
          workout_completion_pct?: number | null
        }
        Relationships: []
      }
      weight_logs: {
        Row: {
          created_at: string
          date: string
          id: string
          notes: string | null
          user_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          user_id: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
      workout_sessions: {
        Row: {
          created_at: string
          date_time: string
          id: string
          pain_flags: Json | null
          pr_detected: boolean | null
          session_rpe: number | null
          sets: Json
          template_id: string | null
          template_name: string | null
          updated_at: string
          user_id: string
          volume_load: number
        }
        Insert: {
          created_at?: string
          date_time?: string
          id?: string
          pain_flags?: Json | null
          pr_detected?: boolean | null
          session_rpe?: number | null
          sets?: Json
          template_id?: string | null
          template_name?: string | null
          updated_at?: string
          user_id: string
          volume_load?: number
        }
        Update: {
          created_at?: string
          date_time?: string
          id?: string
          pain_flags?: Json | null
          pr_detected?: boolean | null
          session_rpe?: number | null
          sets?: Json
          template_id?: string | null
          template_name?: string | null
          updated_at?: string
          user_id?: string
          volume_load?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_templates: {
        Row: {
          created_at: string
          exercises: Json
          id: string
          name: string
          type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exercises?: Json
          id?: string
          name: string
          type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exercises?: Json
          id?: string
          name?: string
          type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
