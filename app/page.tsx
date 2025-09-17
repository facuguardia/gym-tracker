import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Dumbbell } from 'lucide-react';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="max-w-4xl w-full text-center space-y-8">
        <div className="flex justify-center mb-8">
          <div className="bg-blue-600 p-4 rounded-full shadow-lg">
            <Dumbbell className="h-16 w-16 text-white" />
          </div>
        </div>
        
        <h1 className="text-5xl md:text-6xl font-bold text-gray-900">
          Bienvenido a <span className="text-blue-600">GymTracker</span>
        </h1>
        
        <p className="text-xl md:text-2xl text-gray-600 max-w-2xl mx-auto">
          Tu compañero perfecto para seguir y mejorar tus rutinas de gimnasio.
          Registra tu progreso, visualiza tu evolución y alcanza tus metas.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
          <Link
            href="/auth/register"
            className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md"
          >
            Comenzar Ahora
          </Link>
          <Link
            href="/auth/login"
            className="bg-white text-blue-600 border-2 border-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors shadow-md"
          >
            Ya tengo cuenta
          </Link>
        </div>
        
        <div className="mt-16 grid md:grid-cols-3 gap-8 text-left">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="font-bold text-lg mb-2">📊 Seguimiento Detallado</h3>
            <p className="text-gray-600">
              Registra pesos, series y repeticiones para cada ejercicio.
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="font-bold text-lg mb-2">📈 Visualiza tu Progreso</h3>
            <p className="text-gray-600">
              Gráficos claros que muestran tu evolución a lo largo del tiempo.
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="font-bold text-lg mb-2">📱 Diseño Móvil</h3>
            <p className="text-gray-600">
              Interfaz optimizada para usar cómodamente desde tu teléfono en el gimnasio.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}