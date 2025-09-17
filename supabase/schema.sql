-- Crear tabla de perfiles de usuario
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Crear tabla de días de entrenamiento
CREATE TABLE training_days (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  day_name TEXT NOT NULL,
  day_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Crear tabla de ejercicios
CREATE TABLE exercises (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  day_id UUID REFERENCES training_days(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  sets INTEGER NOT NULL DEFAULT 3,
  reps TEXT NOT NULL DEFAULT '12',
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Crear tabla de historial de progreso
CREATE TABLE progress_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE NOT NULL,
  weight DECIMAL(10, 2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX idx_training_days_user_id ON training_days(user_id);
CREATE INDEX idx_exercises_day_id ON exercises(day_id);
CREATE INDEX idx_progress_history_exercise_id ON progress_history(exercise_id);
CREATE INDEX idx_progress_history_created_at ON progress_history(created_at);

-- Habilitar Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_history ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad para profiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Políticas de seguridad para training_days
CREATE POLICY "Users can view own training days" ON training_days
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own training days" ON training_days
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own training days" ON training_days
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own training days" ON training_days
  FOR DELETE USING (auth.uid() = user_id);

-- Políticas de seguridad para exercises
CREATE POLICY "Users can view own exercises" ON exercises
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM training_days
      WHERE training_days.id = exercises.day_id
      AND training_days.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own exercises" ON exercises
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM training_days
      WHERE training_days.id = exercises.day_id
      AND training_days.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own exercises" ON exercises
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM training_days
      WHERE training_days.id = exercises.day_id
      AND training_days.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own exercises" ON exercises
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM training_days
      WHERE training_days.id = exercises.day_id
      AND training_days.user_id = auth.uid()
    )
  );

-- Políticas de seguridad para progress_history
CREATE POLICY "Users can view own progress" ON progress_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM exercises
      JOIN training_days ON training_days.id = exercises.day_id
      WHERE exercises.id = progress_history.exercise_id
      AND training_days.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own progress" ON progress_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM exercises
      JOIN training_days ON training_days.id = exercises.day_id
      WHERE exercises.id = progress_history.exercise_id
      AND training_days.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own progress" ON progress_history
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM exercises
      JOIN training_days ON training_days.id = exercises.day_id
      WHERE exercises.id = progress_history.exercise_id
      AND training_days.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own progress" ON progress_history
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM exercises
      JOIN training_days ON training_days.id = exercises.day_id
      WHERE exercises.id = progress_history.exercise_id
      AND training_days.user_id = auth.uid()
    )
  );

-- Función para crear automáticamente un perfil cuando un usuario se registra
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'username');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para ejecutar la función cuando se crea un nuevo usuario
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();