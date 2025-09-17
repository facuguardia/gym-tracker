import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const exerciseId = searchParams.get('exerciseId');
  
  if (!exerciseId) {
    return NextResponse.json({ error: 'Exercise ID is required' }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });

  try {
    // Obtener el historial de pesos del ejercicio
    const { data: progressHistory, error: progressError } = await supabase
      .from('progress_history')
      .select('*')
      .eq('exercise_id', exerciseId)
      .order('created_at', { ascending: true });

    if (progressError) {
      throw progressError;
    }

    // Obtener información del ejercicio
    const { data: exerciseData, error: exerciseError } = await supabase
      .from('exercises')
      .select('name, weight')
      .eq('id', exerciseId)
      .single();

    if (exerciseError) {
      throw exerciseError;
    }

    return NextResponse.json({
      exercise: exerciseData,
      progressHistory
    });
  } catch (error) {
    console.error('Error fetching progress history:', error);
    return NextResponse.json({ error: 'Failed to fetch progress history' }, { status: 500 });
  }
}