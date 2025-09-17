export interface Profile {
  id: string;
  email: string;
  username?: string;
  created_at: string;
  updated_at: string;
}

export interface TrainingDay {
  id: string;
  user_id: string;
  day_name: string;
  day_order: number;
  created_at: string;
  updated_at: string;
  exercises?: Exercise[];
}

export interface Exercise {
  id: string;
  day_id: string;
  name: string;
  sets: number;
  reps: string;
  order_index: number;
  created_at: string;
  updated_at: string;
  progress_history?: ProgressHistory[];
}

export interface ProgressHistory {
  id: string;
  exercise_id: string;
  weight: number;
  notes?: string;
  created_at: string;
}