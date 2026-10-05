export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Sin conexión</h1>
      <p className="mt-2 max-w-sm text-slate-500">
        Estás offline. Algunas funciones estarán disponibles cuando vuelva la red.
      </p>
    </div>
  );
}
