# Guía de Implementación - Seguimiento de Peso y Reportes

## 1. Resumen de Implementación

Esta guía detalla la implementación paso a paso de las nuevas funcionalidades de seguimiento de peso, historial de progreso y generación de reportes PDF para la aplicación Gym Tracker.

## 2. Fases de Desarrollo

### Fase 1: Preparación de Base de Datos y Tipos
### Fase 2: Componentes de Registro de Peso
### Fase 3: Sistema de Gráficos y Visualización
### Fase 4: Generación de Reportes PDF
### Fase 5: Mejoras de UI/UX y Optimización

## 3. Fase 1: Preparación de Base de Datos y Tipos

### 3.1 Actualización de Esquema de Base de Datos

```sql
-- Archivo: supabase/migrations/add_workout_sessions.sql

-- Crear tabla de sesiones de entrenamiento
CREATE TABLE workout_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  day_id UUID REFERENCES training_days(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla de ejercicios por sesión
CREATE TABLE session_exercises (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES workout_sessions(id) ON DELETE CASCADE NOT NULL,
  exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE NOT NULL,
  weight_used DECIMAL(10, 2),
  sets_completed INTEGER DEFAULT 0,
  reps_completed TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices y políticas RLS (ver archivo de arquitectura técnica)
```

### 3.2 Actualización de Tipos TypeScript

```typescript
// Archivo: types/database.ts - Agregar nuevos tipos

export interface WorkoutSession {
  id: string;
  day_id: string;
  started_at: string;
  completed_at?: string;
  notes?: string;
  created_at: string;
  session_exercises?: SessionExercise[];
}

export interface SessionExercise {
  id: string;
  session_id: string;
  exercise_id: string;
  weight_used?: number;
  sets_completed: number;
  reps_completed?: string;
  notes?: string;
  created_at: string;
  exercise?: Exercise;
}

export interface WeightEntry {
  id: string;
  exercise_id: string;
  weight: number;
  notes?: string;
  created_at: string;
}

export interface ProgressStats {
  exercise_id: string;
  exercise_name: string;
  total_sessions: number;
  max_weight: number;
  min_weight: number;
  average_weight: number;
  latest_weight: number;
  weight_progression: number;
}

export interface ReportConfig {
  start_date: string;
  end_date: string;
  exercise_ids: string[];
  include_charts: boolean;
  include_statistics: boolean;
  report_title?: string;
}
```

### 3.3 Schemas de Validación con Zod

```typescript
// Archivo: lib/validations/weight.ts

import { z } from 'zod';

export const weightEntrySchema = z.object({
  exercise_id: z.string().uuid(),
  weight: z.number().min(0).max(1000),
  notes: z.string().optional()
});

export const sessionExerciseSchema = z.object({
  exercise_id: z.string().uuid(),
  weight_used: z.number().min(0).max(1000).optional(),
  sets_completed: z.number().min(0).max(20),
  reps_completed: z.string().optional(),
  notes: z.string().optional()
});

export const reportConfigSchema = z.object({
  start_date: z.string().datetime(),
  end_date: z.string().datetime(),
  exercise_ids: z.array(z.string().uuid()).min(1),
  include_charts: z.boolean().default(true),
  include_statistics: z.boolean().default(true),
  report_title: z.string().optional()
});

export type WeightEntryInput = z.infer<typeof weightEntrySchema>;
export type SessionExerciseInput = z.infer<typeof sessionExerciseSchema>;
export type ReportConfigInput = z.infer<typeof reportConfigSchema>;
```

## 4. Fase 2: Componentes de Registro de Peso

### 4.1 Store Zustand para Gestión de Estado

```typescript
// Archivo: stores/workoutStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient } from '@/utils/supabase/client';
import type { WorkoutSession, SessionExercise, WeightEntry } from '@/types/database';

interface WorkoutStore {
  currentSession: WorkoutSession | null;
  sessionExercises: Map<string, SessionExercise>;
  isLoading: boolean;
  error: string | null;

  // Actions
  startWorkoutSession: (dayId: string) => Promise<void>;
  recordWeight: (exerciseId: string, weight: number, setIndex: number) => Promise<void>;
  completeSet: (exerciseId: string, setIndex: number, reps: string) => Promise<void>;
  completeWorkoutSession: () => Promise<void>;
  loadCurrentSession: (dayId: string) => Promise<void>;
  clearSession: () => void;
}

export const useWorkoutStore = create<WorkoutStore>()(n  persist(
    (set, get) => ({
      currentSession: null,
      sessionExercises: new Map(),
      isLoading: false,
      error: null,

      startWorkoutSession: async (dayId: string) => {
        set({ isLoading: true, error: null });
        const supabase = createClient();
        
        try {
          const { data, error } = await supabase
            .from('workout_sessions')
            .insert({ day_id: dayId })
            .select()
            .single();

          if (error) throw error;
          
          set({ currentSession: data, isLoading: false });
        } catch (error) {
          set({ error: (error as Error).message, isLoading: false });
        }
      },

      recordWeight: async (exerciseId: string, weight: number, setIndex: number) => {
        const { currentSession } = get();
        if (!currentSession) return;

        const supabase = createClient();
        
        try {
          // Registrar en progress_history
          await supabase
            .from('progress_history')
            .insert({
              exercise_id: exerciseId,
              weight: weight
            });

          // Actualizar session_exercises
          const sessionExercises = get().sessionExercises;
          const key = `${exerciseId}-${setIndex}`;
          const existing = sessionExercises.get(key);
          
          const updatedExercise = {
            ...existing,
            exercise_id: exerciseId,
            session_id: currentSession.id,
            weight_used: weight,
            sets_completed: (existing?.sets_completed || 0) + 1
          };

          sessionExercises.set(key, updatedExercise);
          set({ sessionExercises: new Map(sessionExercises) });
        } catch (error) {
          set({ error: (error as Error).message });
        }
      },

      completeSet: async (exerciseId: string, setIndex: number, reps: string) => {
        const sessionExercises = get().sessionExercises;
        const key = `${exerciseId}-${setIndex}`;
        const existing = sessionExercises.get(key);
        
        if (existing) {
          existing.reps_completed = reps;
          sessionExercises.set(key, existing);
          set({ sessionExercises: new Map(sessionExercises) });
        }
      },

      completeWorkoutSession: async () => {
        const { currentSession, sessionExercises } = get();
        if (!currentSession) return;

        const supabase = createClient();
        
        try {
          // Marcar sesión como completada
          await supabase
            .from('workout_sessions')
            .update({ completed_at: new Date().toISOString() })
            .eq('id', currentSession.id);

          // Guardar todos los ejercicios de la sesión
          const exercisesToSave = Array.from(sessionExercises.values())
            .filter(ex => ex.weight_used && ex.weight_used > 0);

          if (exercisesToSave.length > 0) {
            await supabase
              .from('session_exercises')
              .insert(exercisesToSave);
          }

          set({ 
            currentSession: null, 
            sessionExercises: new Map(),
            isLoading: false 
          });
        } catch (error) {
          set({ error: (error as Error).message });
        }
      },

      loadCurrentSession: async (dayId: string) => {
        const supabase = createClient();
        
        try {
          const { data } = await supabase
            .from('workout_sessions')
            .select('*')
            .eq('day_id', dayId)
            .is('completed_at', null)
            .order('started_at', { ascending: false })
            .limit(1)
            .single();

          if (data) {
            set({ currentSession: data });
          }
        } catch (error) {
          // No hay sesión activa, esto es normal
        }
      },

      clearSession: () => {
        set({ 
          currentSession: null, 
          sessionExercises: new Map(),
          error: null 
        });
      }
    }),
    {
      name: 'workout-session',
      partialize: (state) => ({ 
        currentSession: state.currentSession,
        sessionExercises: Array.from(state.sessionExercises.entries())
      }),
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.sessionExercises)) {
          state.sessionExercises = new Map(state.sessionExercises);
        }
      }
    }
  )
);
```

### 4.2 Componente de Input de Peso

```typescript
// Archivo: components/WeightInput.tsx

import React, { useState, useEffect } from 'react';
import { Plus, Minus, Weight } from 'lucide-react';
import { useWorkoutStore } from '@/stores/workoutStore';

interface WeightInputProps {
  exerciseId: string;
  exerciseName: string;
  setIndex: number;
  previousWeight?: number;
  onWeightChange?: (weight: number) => void;
}

export function WeightInput({ 
  exerciseId, 
  exerciseName, 
  setIndex, 
  previousWeight = 0,
  onWeightChange 
}: WeightInputProps) {
  const [weight, setWeight] = useState(previousWeight);
  const [isRecording, setIsRecording] = useState(false);
  const { recordWeight } = useWorkoutStore();

  const handleWeightChange = (newWeight: number) => {
    const validWeight = Math.max(0, Math.min(1000, newWeight));
    setWeight(validWeight);
    onWeightChange?.(validWeight);
  };

  const handleRecordWeight = async () => {
    if (weight <= 0) return;
    
    setIsRecording(true);
    try {
      await recordWeight(exerciseId, weight, setIndex);
    } catch (error) {
      console.error('Error recording weight:', error);
    } finally {
      setIsRecording(false);
    }
  };

  const increment = (amount: number) => {
    handleWeightChange(weight + amount);
  };

  const decrement = (amount: number) => {
    handleWeightChange(weight - amount);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <Weight className="h-4 w-4 text-gray-500 mr-2" />
          <span className="text-sm font-medium text-gray-700">
            {exerciseName} - Serie {setIndex + 1}
          </span>
        </div>
        {previousWeight > 0 && (
          <span className="text-xs text-gray-500">
            Anterior: {previousWeight}kg
          </span>
        )}
      </div>

      <div className="flex items-center justify-center space-x-3">
        {/* Botones de decremento */}
        <div className="flex flex-col space-y-1">
          <button
            onClick={() => decrement(10)}
            className="w-8 h-8 bg-red-100 text-red-600 rounded-md hover:bg-red-200 transition-colors flex items-center justify-center text-xs font-medium"
          >
            -10
          </button>
          <button
            onClick={() => decrement(2.5)}
            className="w-8 h-8 bg-red-50 text-red-500 rounded-md hover:bg-red-100 transition-colors flex items-center justify-center text-xs"
          >
            -2.5
          </button>
        </div>

        <button
          onClick={() => decrement(1)}
          className="w-10 h-10 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors flex items-center justify-center"
        >
          <Minus className="h-4 w-4" />
        </button>

        {/* Input de peso */}
        <div className="flex flex-col items-center">
          <input
            type="number"
            value={weight}
            onChange={(e) => handleWeightChange(parseFloat(e.target.value) || 0)}
            className="w-20 h-12 text-center text-lg font-bold border-2 border-blue-200 rounded-lg focus:border-blue-500 focus:outline-none"
            step="0.5"
            min="0"
            max="1000"
          />
          <span className="text-xs text-gray-500 mt-1">kg</span>
        </div>

        <button
          onClick={() => increment(1)}
          className="w-10 h-10 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors flex items-center justify-center"
        >
          <Plus className="h-4 w-4" />
        </button>

        {/* Botones de incremento */}
        <div className="flex flex-col space-y-1">
          <button
            onClick={() => increment(10)}
            className="w-8 h-8 bg-green-100 text-green-600 rounded-md hover:bg-green-200 transition-colors flex items-center justify-center text-xs font-medium"
          >
            +10
          </button>
          <button
            onClick={() => increment(2.5)}
            className="w-8 h-8 bg-green-50 text-green-500 rounded-md hover:bg-green-100 transition-colors flex items-center justify-center text-xs"
          >
            +2.5
          </button>
        </div>
      </div>

      {/* Botón de registrar */}
      <button
        onClick={handleRecordWeight}
        disabled={weight <= 0 || isRecording}
        className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
      >
        {isRecording ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
        ) : (
          'Registrar Peso'
        )}
      </button>
    </div>
  );
}
```

### 4.3 Componente de Sesión de Entrenamiento

```typescript
// Archivo: components/WorkoutSession.tsx

import React, { useEffect, useState } from 'react';
import { useWorkoutStore } from '@/stores/workoutStore';
import { WeightInput } from './WeightInput';
import { Play, Square, CheckCircle } from 'lucide-react';
import type { TrainingDay, Exercise } from '@/types/database';

interface WorkoutSessionProps {
  trainingDay: TrainingDay;
}

export function WorkoutSession({ trainingDay }: WorkoutSessionProps) {
  const {
    currentSession,
    startWorkoutSession,
    completeWorkoutSession,
    loadCurrentSession,
    isLoading
  } = useWorkoutStore();
  
  const [completedSets, setCompletedSets] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    loadCurrentSession(trainingDay.id);
  }, [trainingDay.id, loadCurrentSession]);

  const handleStartSession = async () => {
    await startWorkoutSession(trainingDay.id);
  };

  const handleCompleteSession = async () => {
    if (confirm('¿Estás seguro de que quieres finalizar esta sesión de entrenamiento?')) {
      await completeWorkoutSession();
    }
  };

  const markSetCompleted = (exerciseId: string, setIndex: number) => {
    const key = `${exerciseId}-${setIndex}`;
    const newCompletedSets = new Map(completedSets);
    newCompletedSets.set(key, true);
    setCompletedSets(newCompletedSets);
  };

  const isSetCompleted = (exerciseId: string, setIndex: number) => {
    const key = `${exerciseId}-${setIndex}`;
    return completedSets.get(key) || false;
  };

  if (!currentSession) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {trainingDay.day_name}
          </h2>
          <p className="text-gray-600 mb-6">
            ¿Listo para comenzar tu entrenamiento?
          </p>
          <button
            onClick={handleStartSession}
            disabled={isLoading}
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            <Play className="h-5 w-5 mr-2" />
            {isLoading ? 'Iniciando...' : 'Iniciar Entrenamiento'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header de sesión activa */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse mr-3"></div>
            <div>
              <h2 className="text-lg font-semibold text-green-800">
                Sesión Activa: {trainingDay.day_name}
              </h2>
              <p className="text-sm text-green-600">
                Iniciada: {new Date(currentSession.started_at).toLocaleTimeString()}
              </p>
            </div>
          </div>
          <button
            onClick={handleCompleteSession}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Square className="h-4 w-4 mr-2" />
            Finalizar Sesión
          </button>
        </div>
      </div>

      {/* Lista de ejercicios */}
      <div className="space-y-6">
        {trainingDay.exercises?.map((exercise) => (
          <div key={exercise.id} className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              {exercise.name}
            </h3>
            <p className="text-gray-600 mb-4">
              {exercise.sets} series × {exercise.reps} repeticiones
            </p>

            {/* Series del ejercicio */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: exercise.sets }, (_, setIndex) => (
                <div key={setIndex} className="relative">
                  <WeightInput
                    exerciseId={exercise.id}
                    exerciseName={exercise.name}
                    setIndex={setIndex}
                    onWeightChange={() => markSetCompleted(exercise.id, setIndex)}
                  />
                  {isSetCompleted(exercise.id, setIndex) && (
                    <div className="absolute -top-2 -right-2">
                      <CheckCircle className="h-6 w-6 text-green-500 bg-white rounded-full" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## 5. Fase 3: Sistema de Gráficos y Visualización

### 5.1 Instalación de Dependencias

```bash
npm install chart.js react-chartjs-2 date-fns
npm install --save-dev @types/chart.js
```

### 5.2 Configuración de Chart.js

```typescript
// Archivo: lib/chartConfig.ts

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export const defaultChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top' as const,
    },
    tooltip: {
      mode: 'index' as const,
      intersect: false,
    },
  },
  scales: {
    x: {
      display: true,
      title: {
        display: true,
        text: 'Fecha'
      }
    },
    y: {
      display: true,
      title: {
        display: true,
        text: 'Peso (kg)'
      },
      beginAtZero: false
    }
  },
  interaction: {
    mode: 'nearest' as const,
    axis: 'x' as const,
    intersect: false
  }
};
```

### 5.3 Componente de Gráfico de Progreso

```typescript
// Archivo: components/ProgressChart.tsx

import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { defaultChartOptions } from '@/lib/chartConfig';
import type { WeightEntry } from '@/types/database';

interface ProgressChartProps {
  data: WeightEntry[];
  exerciseName: string;
  height?: number;
}

export function ProgressChart({ data, exerciseName, height = 300 }: ProgressChartProps) {
  const chartData = useMemo(() => {
    const sortedData = [...data].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const labels = sortedData.map(entry => 
      format(parseISO(entry.created_at), 'dd/MM', { locale: es })
    );
    
    const weights = sortedData.map(entry => entry.weight);
    
    // Calcular línea de tendencia
    const trendLine = calculateTrendLine(weights);

    return {
      labels,
      datasets: [
        {
          label: 'Peso Registrado',
          data: weights,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.1
        },
        {
          label: 'Tendencia',
          data: trendLine,
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        }
      ]
    };
  }, [data]);

  const options = useMemo(() => ({
    ...defaultChartOptions,
    plugins: {
      ...defaultChartOptions.plugins,
      title: {
        display: true,
        text: `Progreso de ${exerciseName}`,
        font: {
          size: 16,
          weight: 'bold'
        }
      }
    }
  }), [exerciseName]);

  if (data.length === 0) {
    return (
      <div 
        className="flex items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-300"
        style={{ height }}
      >
        <p className="text-gray-500">No hay datos de progreso disponibles</p>
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <Line data={chartData} options={options} />
    </div>
  );
}

// Función auxiliar para calcular línea de tendencia
function calculateTrendLine(data: number[]): number[] {
  if (data.length < 2) return data;
  
  const n = data.length;
  const sumX = data.reduce((sum, _, i) => sum + i, 0);
  const sumY = data.reduce((sum, y) => sum + y, 0);
  const sumXY = data.reduce((sum, y, i) => sum + i * y, 0);
  const sumXX = data.reduce((sum, _, i) => sum + i * i, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  return data.map((_, i) => slope * i + intercept);
}
```

## 6. Fase 4: Generación de Reportes PDF

### 6.1 Instalación de Dependencias para PDF

```bash
npm install jspdf html2canvas
npm install --save-dev @types/jspdf
```

### 6.2 Servicio de Generación de PDF

```typescript
// Archivo: lib/pdfGenerator.ts

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ProgressStats, ReportConfig } from '@/types/database';

export class PDFReportGenerator {
  private pdf: jsPDF;
  private pageHeight: number;
  private pageWidth: number;
  private currentY: number;
  private margin: number;

  constructor() {
    this.pdf = new jsPDF('p', 'mm', 'a4');
    this.pageHeight = this.pdf.internal.pageSize.height;
    this.pageWidth = this.pdf.internal.pageSize.width;
    this.currentY = 20;
    this.margin = 20;
  }

  async generateReport(
    config: ReportConfig,
    stats: ProgressStats[],
    chartElements?: HTMLElement[]
  ): Promise<Blob> {
    // Header del reporte
    this.addHeader(config);
    
    // Resumen ejecutivo
    this.addExecutiveSummary(stats);
    
    // Estadísticas por ejercicio
    for (const stat of stats) {
      this.checkPageBreak(60);
      this.addExerciseStats(stat);
    }
    
    // Agregar gráficos si están disponibles
    if (config.include_charts && chartElements) {
      await this.addCharts(chartElements);
    }
    
    // Footer
    this.addFooter();
    
    return new Blob([this.pdf.output('blob')], { type: 'application/pdf' });
  }

  private addHeader(config: ReportConfig) {
    // Título principal
    this.pdf.setFontSize(24);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text(config.report_title || 'Reporte de Progreso', this.margin, this.currentY);
    
    this.currentY += 15;
    
    // Información del período
    this.pdf.setFontSize(12);
    this.pdf.setFont('helvetica', 'normal');
    const startDate = format(new Date(config.start_date), 'dd/MM/yyyy', { locale: es });
    const endDate = format(new Date(config.end_date), 'dd/MM/yyyy', { locale: es });
    this.pdf.text(`Período: ${startDate} - ${endDate}`, this.margin, this.currentY);
    
    this.currentY += 10;
    this.pdf.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}`, this.margin, this.currentY);
    
    this.currentY += 20;
    
    // Línea separadora
    this.pdf.setDrawColor(200, 200, 200);
    this.pdf.line(this.margin, this.currentY, this.pageWidth - this.margin, this.currentY);
    this.currentY += 15;
  }

  private addExecutiveSummary(stats: ProgressStats[]) {
    this.pdf.setFontSize(16);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text('Resumen Ejecutivo', this.margin, this.currentY);
    this.currentY += 15;
    
    const totalExercises = stats.length;
    const avgProgression = stats.reduce((sum, stat) => sum + stat.weight_progression, 0) / totalExercises;
    const totalSessions = stats.reduce((sum, stat) => sum + stat.total_sessions, 0);
    
    this.pdf.setFontSize(12);
    this.pdf.setFont('helvetica', 'normal');
    
    const summaryData = [
      `• Total de ejercicios analizados: ${totalExercises}`,
      `• Total de sesiones registradas: ${totalSessions}`,
      `• Progreso promedio de peso: ${avgProgression.toFixed(1)}%`,
      `• Ejercicio con mayor progreso: ${this.getBestExercise(stats)}`,
      `• Consistencia promedio: ${this.getAverageConsistency(stats).toFixed(1)}%`
    ];
    
    summaryData.forEach(line => {
      this.pdf.text(line, this.margin, this.currentY);
      this.currentY += 8;
    });
    
    this.currentY += 15;
  }

  private addExerciseStats(stat: ProgressStats) {
    // Título del ejercicio
    this.pdf.setFontSize(14);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text(stat.exercise_name, this.margin, this.currentY);
    this.currentY += 12;
    
    // Estadísticas en formato tabla
    this.pdf.setFontSize(10);
    this.pdf.setFont('helvetica', 'normal');
    
    const statsData = [
      ['Sesiones totales:', stat.total_sessions.toString()],
      ['Peso máximo:', `${stat.max_weight} kg`],
      ['Peso mínimo:', `${stat.min_weight} kg`],
      ['Peso promedio:', `${stat.average_weight.toFixed(1)} kg`],
      ['Peso actual:', `${stat.latest_weight} kg`],
      ['Progreso:', `${stat.weight_progression.toFixed(1)}%`],
      ['Consistencia:', `${stat.consistency_score.toFixed(1)}%`]
    ];
    
    const colWidth = 60;
    statsData.forEach(([label, value]) => {
      this.pdf.text(label, this.margin, this.currentY);
      this.pdf.text(value, this.margin + colWidth, this.currentY);
      this.currentY += 6;
    });
    
    this.currentY += 10;
  }

  private async addCharts(chartElements: HTMLElement[]) {
    this.checkPageBreak(100);
    
    this.pdf.setFontSize(16);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text('Gráficos de Progreso', this.margin, this.currentY);
    this.currentY += 20;
    
    for (const element of chartElements) {
      this.checkPageBreak(120);
      
      try {
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff'
        });
        
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = this.pageWidth - (this.margin * 2);
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        this.pdf.addImage(imgData, 'PNG', this.margin, this.currentY, imgWidth, imgHeight);
        this.currentY += imgHeight + 15;
      } catch (error) {
        console.error('Error adding chart to PDF:', error);
      }
    }
  }

  private addFooter() {
    const pageCount = this.pdf.getNumberOfPages();
    
    for (let i = 1; i <= pageCount; i++) {
      this.pdf.setPage(i);
      this.pdf.setFontSize(8);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.text(
        `Página ${i} de ${pageCount}`,
        this.pageWidth - this.margin - 20,
        this.pageHeight - 10
      );
      this.pdf.text(
        'Generado por Gym Tracker',
        this.margin,
        this.pageHeight - 10
      );
    }
  }

  private checkPageBreak(requiredSpace: number) {
    if (this.currentY + requiredSpace > this.pageHeight - 30) {
      this.pdf.addPage();
      this.currentY = 20;
    }
  }

  private getBestExercise(stats: ProgressStats[]): string {
    const best = stats.reduce((prev, current) => 
      prev.weight_progression > current.weight_progression ? prev : current
    );
    return `${best.exercise_name} (${best.weight_progression.toFixed(1)}%)`;
  }

  private getAverageConsistency(stats: ProgressStats[]): number {
    return stats.reduce((sum, stat) => sum + stat.consistency_score, 0) / stats.length;
  }
}
```

### 6.3 Componente de Generador de Reportes

```typescript
// Archivo: components/ReportGenerator.tsx

import React, { useState, useRef } from 'react';
import { Calendar, Download, FileText, Settings } from 'lucide-react';
import { PDFReportGenerator } from '@/lib/pdfGenerator';
import { ProgressChart } from './ProgressChart';
import { createClient } from '@/utils/supabase/client';
import type { ReportConfig, ProgressStats, Exercise } from '@/types/database';

export function ReportGenerator() {
  const [config, setConfig] = useState<Partial<ReportConfig>>({
    start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    include_charts: true,
    include_statistics: true,
    report_title: 'Reporte Mensual de Progreso'
  });
  
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [stats, setStats] = useState<ProgressStats[]>([]);
  
  const chartsRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const loadExercises = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('exercises')
        .select(`
          id,
          name,
          training_days!inner(user_id)
        `)
        .eq('training_days.user_id', user.id);

      if (error) throw error;
      setExercises(data || []);
    } catch (error) {
      console.error('Error loading exercises:', error);
    }
  };

  const generateReport = async () => {
    if (selectedExercises.length === 0) {
      alert('Por favor selecciona al menos un ejercicio');
      return;
    }

    setIsGenerating(true);
    
    try {
      // Obtener estadísticas
      const statsPromises = selectedExercises.map(async (exerciseId) => {
        const { data, error } = await supabase
          .rpc('get_exercise_progress_stats', {
            p_exercise_id: exerciseId,
            p_start_date: config.start_date,
            p_end_date: config.end_date
          });

        if (error) throw error;
        
        const exercise = exercises.find(e => e.id === exerciseId);
        return {
          ...data[0],
          exercise_id: exerciseId,
          exercise_name: exercise?.name || 'Ejercicio desconocido'
        };
      });

      const statsResults = await Promise.all(statsPromises);
      setStats(statsResults);

      // Generar PDF
      const generator = new PDFReportGenerator();
      const chartElements = config.include_charts 
        ? Array.from(chartsRef.current?.querySelectorAll('.chart-container') || [])
        : undefined;

      const pdfBlob = await generator.generateReport(
        config as ReportConfig,
        statsResults,
        chartElements as HTMLElement[]
      );

      // Descargar PDF
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-progreso-${config.start_date}-${config.end_date}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Error al generar el reporte. Por favor intenta de nuevo.');
    } finally {
      setIsGenerating(false);
    }
  };

  React.useEffect(() => {
    loadExercises();
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center mb-6">
          <FileText className="h-6 w-6 text-blue-600 mr-3" />
          <h2 className="text-2xl font-bold text-gray-900">Generador de Reportes</h2>
        </div>

        {/* Configuración del reporte */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Título del Reporte
            </label>
            <input
              type="text"
              value={config.report_title || ''}
              onChange={(e) => setConfig({ ...config, report_title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha Inicio
              </label>
              <input
                type="date"
                value={config.start_date?.split('T')[0] || ''}
                onChange={(e) => setConfig({ ...config, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha Fin
              </label>
              <input
                type="date"
                value={config.end_date?.split('T')[0] || ''}
                onChange={(e) => setConfig({ ...config, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Selección de ejercicios */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Ejercicios a Incluir
          </label>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto border border-gray-200 rounded-md p-3">
            {exercises.map((exercise) => (
              <label key={exercise.id} className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedExercises.includes(exercise.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedExercises([...selectedExercises, exercise.id]);
                    } else {
                      setSelectedExercises(selectedExercises.filter(id => id !== exercise.id));
                    }
                  }}
                  className="mr-2"
                />
                <span className="text-sm">{exercise.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Opciones adicionales */}
        <div className="flex items-center space-x-6 mb-6">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={config.include_charts || false}
              onChange={(e) => setConfig({ ...config, include_charts: e.target.checked })}
              className="mr-2"
            />
            <span className="text-sm">Incluir gráficos</span>
          </label>
          
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={config.include_statistics || false}
              onChange={(e) => setConfig({ ...config, include_statistics: e.target.checked })}
              className="mr-2"
            />
            <span className="text-sm">Incluir estadísticas detalladas</span>
          </label>
        </div>

        {/* Botón de generar */}
        <button
          onClick={generateReport}
          disabled={isGenerating || selectedExercises.length === 0}
          className="w-full md:w-auto inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
          ) : (
            <Download className="h-5 w-5 mr-2" />
          )}
          {isGenerating ? 'Generando...' : 'Generar Reporte PDF'}
        </button>
      </div>

      {/* Preview de gráficos (oculto, solo para captura) */}
      {config.include_charts && (
        <div ref={chartsRef} className="hidden">
          {stats.map((stat) => (
            <div key={stat.exercise_id} className="chart-container mb-8">
              <ProgressChart
                data={[]} // Aquí cargarías los datos reales
                exerciseName={stat.exercise_name}
                height={300}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

## 7. Fase 5: Integración y Mejoras Finales

### 7.1 Actualización del Dashboard Principal

```typescript
// Archivo: app/dashboard/page.tsx - Modificaciones principales

// Agregar imports
import { WorkoutSession } from '@/components/WorkoutSession';
import { ProgressChart } from '@/components/ProgressChart';
import { ReportGenerator } from '@/components/ReportGenerator';
import { useWorkoutStore } from '@/stores/workoutStore';

// Agregar estado para vista activa
const [activeView, setActiveView] = useState<'routine' | 'workout' | 'progress' | 'reports'>('routine');
const [selectedDayForWorkout, setSelectedDayForWorkout] = useState<TrainingDay | null>(null);

// Agregar navegación en el header
<nav className="flex space-x-4 mb-6">
  <button
    onClick={() => setActiveView('routine')}
    className={`px-4 py-2 rounded-lg transition-colors ${
      activeView === 'routine' 
        ? 'bg-blue-600 text-white' 
        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    }`}
  >
    Rutinas
  </button>
  <button
    onClick={() => setActiveView('workout')}
    className={`px-4 py-2 rounded-lg transition-colors ${
      activeView === 'workout' 
        ? 'bg-blue-600 text-white' 
        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    }`}
  >
    Entrenar
  </button>
  <button
    onClick={() => setActiveView('progress')}
    className={`px-4 py-2 rounded-lg transition-colors ${
      activeView === 'progress' 
        ? 'bg-blue-600 text-white' 
        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    }`}
  >
    Progreso
  </button>
  <button
    onClick={() => setActiveView('reports')}
    className={`px-4 py-2 rounded-lg transition-colors ${
      activeView === 'reports' 
        ? 'bg-blue-600 text-white' 
        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    }`}
  >
    Reportes
  </button>
</nav>

// Renderizado condicional del contenido
{activeView === 'routine' && (
  // Contenido actual de rutinas
)}

{activeView === 'workout' && (
  <div>
    {selectedDayForWorkout ? (
      <WorkoutSession trainingDay={selectedDayForWorkout} />
    ) : (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {trainingDays.map((day) => (
          <div key={day.id} className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">{day.day_name}</h3>
            <p className="text-gray-600 mb-4">
              {day.exercises.length} ejercicios
            </p>
            <button
              onClick={() => setSelectedDayForWorkout(day)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Comenzar Entrenamiento
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
)}

{activeView === 'progress' && (
  // Componente de progreso con gráficos
)}

{activeView === 'reports' && (
  <ReportGenerator />
)}
```

### 7.2 Optimizaciones de Performance

```typescript
// Archivo: hooks/useProgressData.ts

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { WeightEntry, ProgressStats } from '@/types/database';

export function useProgressData(exerciseId?: string) {
  const [data, setData] = useState<WeightEntry[]>([]);
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const supabase = createClient();

  const fetchProgressData = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Obtener historial de peso
      const { data: progressData, error: progressError } = await supabase
        .from('progress_history')
        .select('*')
        .eq('exercise_id', id)
        .order('created_at', { ascending: true });

      if (progressError) throw progressError;

      // Obtener estadísticas
      const { data: statsData, error: statsError } = await supabase
        .rpc('get_exercise_progress_stats', {
          p_exercise_id: id
        });

      if (statsError) throw statsError;

      setData(progressData || []);
      setStats(statsData?.[0] || null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (exerciseId) {
      fetchProgressData(exerciseId);
    }
  }, [exerciseId, fetchProgressData]);

  return {
    data,
    stats,
    isLoading,
    error,
    refetch: () => exerciseId && fetchProgressData(exerciseId)
  };
}
```

## 8. Checklist de Implementación

### ✅ Fase 1: Base de Datos
- [ ] Ejecutar migración de nuevas tablas
- [ ] Actualizar tipos TypeScript
- [ ] Crear schemas de validación Zod
- [ ] Probar políticas RLS

### ✅ Fase 2: Registro de Peso
- [ ] Implementar store Zustand
- [ ] Crear componente WeightInput
- [ ] Desarrollar WorkoutSession
- [ ] Integrar con dashboard existente

### ✅ Fase 3: Gráficos
- [ ] Instalar dependencias Chart.js
- [ ] Configurar Chart.js
- [ ] Crear componente ProgressChart
- [ ] Implementar hook useProgressData

### ✅ Fase 4: Reportes PDF
- [ ] Instalar dependencias PDF
- [ ] Desarrollar PDFReportGenerator
- [ ] Crear componente ReportGenerator
- [ ] Probar generación de reportes

### ✅ Fase 5: Integración
- [ ] Actualizar navegación del dashboard
- [ ] Optimizar performance
- [ ] Pruebas de usuario
- [ ] Documentación final

## 9. Consideraciones de Deployment

1. **Variables de Entorno**: Verificar configuración de Supabase
2. **Dependencias**: Asegurar que todas las librerías estén en package.json
3. **Migraciones**: Ejecutar migraciones de base de datos en producción
4. **Performance**: Monitorear carga de gráficos y generación de PDF
5. **Backup**: Respaldar datos antes del deployment

## 10. Próximos Pasos

Después de la implementación básica, considerar:

1. **Notificaciones**: Recordatorios de entrenamiento
2. **Análisis Avanzado**: IA para recomendaciones de peso
3. **Social**: Compartir progreso con amigos
4. **Wearables**: Integración con dispositivos fitness
5. **Offline**: Funcionalidad sin conexión