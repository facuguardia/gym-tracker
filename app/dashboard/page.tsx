'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { 
  Plus, 
  Edit, 
  Trash2, 
  LogOut, 
  Dumbbell, 
  Calendar,
  Target,
  Hash
} from 'lucide-react';

interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  order_index: number;
}

interface TrainingDay {
  id: string;
  day_name: string;
  day_order: number;
  exercises: Exercise[];
}

interface User {
  id: string;
  email: string;
  username?: string;
  user_metadata?: {
    username?: string;
    full_name?: string;
  };
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [trainingDays, setTrainingDays] = useState<TrainingDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDay, setShowAddDay] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState<string | null>(null);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [editingExercise, setEditingExercise] = useState<string | null>(null);
  const [newDayName, setNewDayName] = useState('');
  const [newExercise, setNewExercise] = useState({
    name: '',
    sets: 3,
    reps: '12'
  });
  const [editDayName, setEditDayName] = useState('');
  const [editExerciseData, setEditExerciseData] = useState({
    name: '',
    sets: 3,
    reps: '12'
  });
  
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }
      
      // Check if user profile exists, create if it doesn't
      await ensureUserProfile(user);
      
      setUser(user);
      await fetchTrainingDays(user.id);
    } catch (error) {
      console.error('Error checking user:', error);
      router.push('/auth/login');
    } finally {
      setLoading(false);
    }
  };

  const ensureUserProfile = async (user: any) => {
    try {
      console.log('Checking user profile for:', user.id);
      console.log('User metadata:', user.user_metadata);
      
      // Check if profile exists
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('id', user.id)
        .single();

      // If profile doesn't exist, create it
      if (checkError && checkError.code === 'PGRST116') {
        console.log('Profile does not exist, creating new profile...');
        const username = user.user_metadata?.username || user.user_metadata?.full_name || null;
        
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email,
            username: username
          });

        if (insertError) {
          console.error('Error creating user profile:', insertError);
          alert('Error al crear el perfil de usuario. Por favor, intenta de nuevo.');
          throw insertError;
        }
        console.log('Profile created successfully');
      } else if (checkError) {
        console.error('Error checking user profile:', checkError);
        alert('Error al verificar el perfil de usuario.');
        throw checkError;
      } else {
        console.log('Profile exists:', existingProfile);
      }
    } catch (error) {
      console.error('Error ensuring user profile:', error);
      throw error;
    }
  };

  const fetchTrainingDays = async (userId: string) => {
    try {
      const { data: days, error: daysError } = await supabase
        .from('training_days')
        .select('*')
        .eq('user_id', userId)
        .order('day_order');

      if (daysError) throw daysError;

      const daysWithExercises = await Promise.all(
        (days || []).map(async (day) => {
          const { data: exercises, error: exercisesError } = await supabase
            .from('exercises')
            .select('*')
            .eq('day_id', day.id)
            .order('order_index');

          if (exercisesError) throw exercisesError;

          return {
            ...day,
            exercises: exercises || []
          };
        })
      );

      setTrainingDays(daysWithExercises);
    } catch (error) {
      console.error('Error fetching training days:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const addTrainingDay = async () => {
    if (!newDayName.trim() || !user) {
      alert('Por favor, ingresa un nombre para el día de entrenamiento.');
      return;
    }

    try {
      console.log('Adding training day for user:', user.id);
      console.log('Day name:', newDayName.trim());
      
      const { data, error } = await supabase
        .from('training_days')
        .insert({
          user_id: user.id,
          day_name: newDayName.trim(),
          day_order: trainingDays.length
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding training day:', error);
        alert(`Error al agregar el día de entrenamiento: ${error.message}`);
        throw error;
      }

      console.log('Training day added successfully:', data);
      setTrainingDays([...trainingDays, { ...data, exercises: [] }]);
      setNewDayName('');
      setShowAddDay(false);
      alert('¡Día de entrenamiento agregado exitosamente!');
    } catch (error) {
      console.error('Error adding training day:', error);
    }
  };

  const updateTrainingDay = async (dayId: string) => {
    if (!editDayName.trim()) return;

    try {
      const { error } = await supabase
        .from('training_days')
        .update({ day_name: editDayName.trim() })
        .eq('id', dayId);

      if (error) throw error;

      setTrainingDays(trainingDays.map(day => 
        day.id === dayId ? { ...day, day_name: editDayName.trim() } : day
      ));
      setEditingDay(null);
      setEditDayName('');
    } catch (error) {
      console.error('Error updating training day:', error);
    }
  };

  const deleteTrainingDay = async (dayId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este día de entrenamiento?')) return;

    try {
      const { error } = await supabase
        .from('training_days')
        .delete()
        .eq('id', dayId);

      if (error) throw error;

      setTrainingDays(trainingDays.filter(day => day.id !== dayId));
    } catch (error) {
      console.error('Error deleting training day:', error);
    }
  };

  const addExercise = async (dayId: string) => {
    if (!newExercise.name.trim()) return;

    try {
      const day = trainingDays.find(d => d.id === dayId);
      const { data, error } = await supabase
        .from('exercises')
        .insert({
          day_id: dayId,
          name: newExercise.name.trim(),
          sets: newExercise.sets,
          reps: newExercise.reps,
          order_index: day?.exercises.length || 0
        })
        .select()
        .single();

      if (error) throw error;

      setTrainingDays(trainingDays.map(day => 
        day.id === dayId 
          ? { ...day, exercises: [...day.exercises, data] }
          : day
      ));
      setNewExercise({ name: '', sets: 3, reps: '12' });
      setShowAddExercise(null);
    } catch (error) {
      console.error('Error adding exercise:', error);
    }
  };

  const updateExercise = async (exerciseId: string, dayId: string) => {
    if (!editExerciseData.name.trim()) return;

    try {
      const { error } = await supabase
        .from('exercises')
        .update({
          name: editExerciseData.name.trim(),
          sets: editExerciseData.sets,
          reps: editExerciseData.reps
        })
        .eq('id', exerciseId);

      if (error) throw error;

      setTrainingDays(trainingDays.map(day => 
        day.id === dayId 
          ? {
              ...day, 
              exercises: day.exercises.map(ex => 
                ex.id === exerciseId 
                  ? { ...ex, ...editExerciseData }
                  : ex
              )
            }
          : day
      ));
      setEditingExercise(null);
      setEditExerciseData({ name: '', sets: 3, reps: '12' });
    } catch (error) {
      console.error('Error updating exercise:', error);
    }
  };

  const deleteExercise = async (exerciseId: string, dayId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este ejercicio?')) return;

    try {
      const { error } = await supabase
        .from('exercises')
        .delete()
        .eq('id', exerciseId);

      if (error) throw error;

      setTrainingDays(trainingDays.map(day => 
        day.id === dayId 
          ? { ...day, exercises: day.exercises.filter(ex => ex.id !== exerciseId) }
          : day
      ));
    } catch (error) {
      console.error('Error deleting exercise:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Dumbbell className="h-12 w-12 text-blue-600 mx-auto animate-pulse" />
          <p className="mt-4 text-gray-600">Cargando tu rutina...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Dumbbell className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-2xl font-bold text-gray-900">GymTracker</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Hola, {user?.user_metadata?.username || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuario'}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                <LogOut className="h-4 w-4 mr-1" />
                Salir
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Mi Rutina de Entrenamiento</h2>
            <p className="text-gray-600 mt-1">Gestiona tus días de entrenamiento y ejercicios</p>
          </div>
          <button
            onClick={() => setShowAddDay(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5 mr-2" />
            Agregar Día
          </button>
        </div>

        {/* Add Day Form */}
        {showAddDay && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Agregar Nuevo Día de Entrenamiento</h3>
            <div className="flex gap-4">
              <input
                type="text"
                value={newDayName}
                onChange={(e) => setNewDayName(e.target.value)}
                placeholder="Nombre del día (ej: Pecho y Tríceps)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && addTrainingDay()}
              />
              <button
                onClick={addTrainingDay}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Guardar
              </button>
              <button
                onClick={() => {
                  setShowAddDay(false);
                  setNewDayName('');
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Training Days */}
        {trainingDays.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">
              No tienes días de entrenamiento aún
            </h3>
            <p className="text-gray-500 mb-6">
              Comienza agregando tu primer día de entrenamiento
            </p>
            <button
              onClick={() => setShowAddDay(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Agregar Primer Día
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {trainingDays.map((day) => (
              <div key={day.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                {/* Day Header */}
                <div className="bg-blue-50 px-6 py-4 border-b">
                  {editingDay === day.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editDayName}
                        onChange={(e) => setEditDayName(e.target.value)}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                        onKeyPress={(e) => e.key === 'Enter' && updateTrainingDay(day.id)}
                      />
                      <button
                        onClick={() => updateTrainingDay(day.id)}
                        className="px-2 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => {
                          setEditingDay(null);
                          setEditDayName('');
                        }}
                        className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold text-gray-900">{day.day_name}</h3>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setEditingDay(day.id);
                            setEditDayName(day.day_name);
                          }}
                          className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteTrainingDay(day.id)}
                          className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Exercises */}
                <div className="p-6">
                  {day.exercises.length === 0 ? (
                    <p className="text-gray-500 text-sm mb-4">No hay ejercicios aún</p>
                  ) : (
                    <div className="space-y-3 mb-4">
                      {day.exercises.map((exercise) => (
                        <div key={exercise.id} className="border border-gray-200 rounded-lg p-3">
                          {editingExercise === exercise.id ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={editExerciseData.name}
                                onChange={(e) => setEditExerciseData({...editExerciseData, name: e.target.value})}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                placeholder="Nombre del ejercicio"
                              />
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  value={editExerciseData.sets}
                                  onChange={(e) => setEditExerciseData({...editExerciseData, sets: parseInt(e.target.value) || 0})}
                                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                                  placeholder="Sets"
                                  min="1"
                                />
                                <input
                                  type="text"
                                  value={editExerciseData.reps}
                                  onChange={(e) => setEditExerciseData({...editExerciseData, reps: e.target.value})}
                                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                  placeholder="Reps"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => updateExercise(exercise.id, day.id)}
                                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                                >
                                  Guardar
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingExercise(null);
                                    setEditExerciseData({ name: '', sets: 3, reps: '12' });
                                  }}
                                  className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900">{exercise.name}</h4>
                                <div className="flex items-center text-sm text-gray-600 mt-1">
                                  <Hash className="h-3 w-3 mr-1" />
                                  <span>{exercise.sets} sets</span>
                                  <Target className="h-3 w-3 ml-3 mr-1" />
                                  <span>{exercise.reps} reps</span>
                                </div>
                              </div>
                              <div className="flex gap-1 ml-2">
                                <button
                                  onClick={() => {
                                    setEditingExercise(exercise.id);
                                    setEditExerciseData({
                                      name: exercise.name,
                                      sets: exercise.sets,
                                      reps: exercise.reps
                                    });
                                  }}
                                  className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
                                >
                                  <Edit className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => deleteExercise(exercise.id, day.id)}
                                  className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Exercise Form */}
                  {showAddExercise === day.id ? (
                    <div className="border-t pt-4">
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={newExercise.name}
                          onChange={(e) => setNewExercise({...newExercise, name: e.target.value})}
                          placeholder="Nombre del ejercicio"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={newExercise.sets}
                            onChange={(e) => setNewExercise({...newExercise, sets: parseInt(e.target.value) || 0})}
                            placeholder="Sets"
                            className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            min="1"
                          />
                          <input
                            type="text"
                            value={newExercise.reps}
                            onChange={(e) => setNewExercise({...newExercise, reps: e.target.value})}
                            placeholder="Reps (ej: 12, 8-10)"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => addExercise(day.id)}
                            className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 transition-colors"
                          >
                            Agregar
                          </button>
                          <button
                            onClick={() => {
                              setShowAddExercise(null);
                              setNewExercise({ name: '', sets: 3, reps: '12' });
                            }}
                            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-400 transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddExercise(day.id)}
                      className="w-full flex items-center justify-center px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar Ejercicio
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}