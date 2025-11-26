// src/api/reportes.ts

export async function fetchReporteSubdiario({ fechaInicio, fechaFin }: { fechaInicio?: string, fechaFin?: string }) {
  const params = new URLSearchParams();
  if (fechaInicio) params.append("fechaInicio", fechaInicio);
  if (fechaFin) params.append("fechaFin", fechaFin);
  const res = await fetch(`/api/reportes/subdiario?${params.toString()}`);
  if (!res.ok) throw new Error("Error al obtener subdiario");
  const json = await res.json();
  return json.data;
}
