-- Agregar política INSERT faltante para la tabla profiles
-- Esto permite que los usuarios puedan crear sus propios perfiles

CREATE POLICY "Users can create own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Verificar que todas las políticas estén correctas
-- Esta consulta mostrará todas las políticas existentes para profiles
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
-- FROM pg_policies 
-- WHERE tablename = 'profiles';