import { Request, Response } from "express";
import { pool } from "../db/connection";

// Convierte cualquier valor a número seguro (0 si null, undefined, string vacío, NaN)
const safeNumber = (val: any) => Number(val) || 0;

// Subdiario: una fila por día, columnas fijas por producto/categoría
export const getReporteSubdiario = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    console.log("🔍 [DEBUG] getReporteSubdiario - Inicio");
    console.log("🔍 [DEBUG] Query params recibidos:", { fechaInicio, fechaFin });
    console.log("🔍 [DEBUG] URL completa:", req.url);
    console.log("🔍 [DEBUG] Método HTTP:", req.method);

    const query = `
      SELECT
        m.fecha::date,
        m.estacion_id,
        m.nombre_estacion,
        m.caja_id,
        m.nombre_caja,
        d.categoria,
        d.nombre,
        SUM(m.cantidad) AS litros,
        SUM(m.importe) AS importe,
        COALESCE(ct.total_efectivo_recaudado, 0) AS total_efectivo_recaudado,
        COALESCE(ct.importe_ventas_totales_contado, 0) AS importe_ventas_totales_contado
      FROM datos_metricas m
      JOIN dim_producto d USING (producto_id)
      LEFT JOIN cierres_turno ct ON ct.fecha::date = m.fecha::date AND ct.id_estacion = m.estacion_id AND ct.id_caja = m.caja_id
      WHERE ($1::date IS NULL OR m.fecha >= $1::date)
        AND ($2::date IS NULL OR m.fecha <= $2::date)
      GROUP BY m.fecha::date, m.estacion_id, m.nombre_estacion, m.caja_id, m.nombre_caja, d.categoria, d.nombre, ct.total_efectivo_recaudado, ct.importe_ventas_totales_contado
      ORDER BY m.fecha::date, m.estacion_id, m.caja_id, d.categoria;
    `;

    const params = [fechaInicio || null, fechaFin || null];
    console.log("🔍 [DEBUG] Parámetros de consulta SQL:", params);
    console.log("🔍 [DEBUG] Ejecutando consulta SQL...");

    const { rows } = await pool.query(query, params);
    
    console.log("🔍 [DEBUG] Consulta ejecutada exitosamente");
    console.log("🔍 [DEBUG] Número de registros obtenidos:", rows.length);
    console.log("🔍 [DEBUG] Primeros 3 registros (muestra):", rows.slice(0, 3));

    const response = { ok: true, data: rows };
    console.log("🔍 [DEBUG] Enviando respuesta. Total registros:", rows.length);
    
    res.status(200).json(response);
    console.log("✅ [DEBUG] Respuesta enviada exitosamente");
  } catch (error) {
    console.error("❌ [DEBUG] Error en reporte subdiario:", (error as Error).message);
    console.error("❌ [DEBUG] Stack trace:", (error as Error).stack);
    res.status(500).json({ 
      error: "Error al obtener reporte subdiario",
      detalle: (error as Error).message 
    });
  }
};

// Reporte agrupado por empresa (unidades-empresa)
export const getReporteUnidadesEmpresa = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("🔍 [DEBUG] getReporteUnidadesEmpresa - Inicio");
    console.log("🔍 [DEBUG] Query params recibidos:", req.query);

    let { fechaInicio, fechaFin } = req.query;

    // Si no se pasan fechas, usar el mes actual
    if (!fechaInicio || !fechaFin) {
      console.log("🔍 [DEBUG] No se proporcionaron fechas, usando mes actual");
      const now = new Date();
      const primerDiaMes = new Date(now.getFullYear(), now.getMonth(), 1);
      const yyyy = primerDiaMes.getFullYear();
      const mm = String(primerDiaMes.getMonth() + 1).padStart(2, '0');
      const dd = String(primerDiaMes.getDate()).padStart(2, '0');
      fechaInicio = `${yyyy}-${mm}-${dd}`;
      const yyyy2 = now.getFullYear();
      const mm2 = String(now.getMonth() + 1).padStart(2, '0');
      const dd2 = String(now.getDate()).padStart(2, '0');
      fechaFin = `${yyyy2}-${mm2}-${dd2}`;
      console.log("🔍 [DEBUG] Fechas calculadas (mes actual):", { fechaInicio, fechaFin });
    }

    // Consulta agrupada por empresa
    const query = `
      SELECT
        e.empresa_id,
        e.nombre AS nombre_empresa,
        COUNT(DISTINCT m.estacion_id) AS total_estaciones,
        COUNT(DISTINCT m.caja_id) AS total_cajas,
        SUM(m.cantidad) AS total_unidades,
        SUM(m.importe) AS total_importe,
        COUNT(DISTINCT m.fecha::date) AS dias_con_actividad
      FROM datos_metricas m
      JOIN empresas e ON e.empresa_id = m.empresa_id
      WHERE ($1::date IS NULL OR m.fecha >= $1::date)
        AND ($2::date IS NULL OR m.fecha <= $2::date)
      GROUP BY e.empresa_id, e.nombre
      ORDER BY e.nombre;
    `;

    const params = [fechaInicio || null, fechaFin || null];
    console.log("🔍 [DEBUG] Parámetros de consulta SQL:", params);
    console.log("🔍 [DEBUG] Ejecutando consulta SQL...");

    const { rows } = await pool.query(query, params);

    console.log("🔍 [DEBUG] Consulta ejecutada exitosamente");
    console.log("🔍 [DEBUG] Número de empresas encontradas:", rows.length);
    console.log("🔍 [DEBUG] Primeras 3 empresas (muestra):", rows.slice(0, 3));

    const data = rows.map((r: any) => ({
      empresa_id: Number(r.empresa_id),
      nombre_empresa: r.nombre_empresa,
      total_estaciones: Number(r.total_estaciones || 0),
      total_cajas: Number(r.total_cajas || 0),
      total_unidades: Number(r.total_unidades || 0),
      total_importe: Number(r.total_importe || 0),
      dias_con_actividad: Number(r.dias_con_actividad || 0)
    }));

    const response = { ok: true, data };
    console.log("🔍 [DEBUG] Enviando respuesta. Total empresas:", data.length);

    res.status(200).json(response);
    console.log("✅ [DEBUG] Respuesta enviada exitosamente");
  } catch (error) {
    console.error("❌ [DEBUG] Error en getReporteUnidadesEmpresa:", (error as Error).message);
    console.error("❌ [DEBUG] Stack trace:", (error as Error).stack);
    res.status(500).json({ 
      error: "Error al obtener reporte unidades-empresa",
      detalle: (error as Error).message 
    });
  }
};

export const getReporteMensual = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("🔍 [DEBUG] getReporteMensual - Inicio");
    console.log("🔍 [DEBUG] Query params recibidos:", req.query);
    console.log("🔍 [DEBUG] URL completa:", req.url);
    console.log("🔍 [DEBUG] Método HTTP:", req.method);

    let { fechaInicio, fechaFin } = req.query;
    console.log("🔍 [DEBUG] Fechas antes de procesamiento:", { fechaInicio, fechaFin });

    // Si no se pasan fechas, usar el mes en curso
    if (!fechaInicio || !fechaFin) {
      console.log("🔍 [DEBUG] No se proporcionaron fechas, usando mes actual");
      const now = new Date();
      const primerDiaMes = new Date(now.getFullYear(), now.getMonth(), 1);
      const yyyy = primerDiaMes.getFullYear();
      const mm = String(primerDiaMes.getMonth() + 1).padStart(2, '0');
      const dd = String(primerDiaMes.getDate()).padStart(2, '0');
      fechaInicio = `${yyyy}-${mm}-${dd}`;
      const yyyy2 = now.getFullYear();
      const mm2 = String(now.getMonth() + 1).padStart(2, '0');
      const dd2 = String(now.getDate()).padStart(2, '0');
      fechaFin = `${yyyy2}-${mm2}-${dd2}`;
      console.log("🔍 [DEBUG] Fechas calculadas (mes actual):", { fechaInicio, fechaFin });
    }

    // Consulta los totales generales desde cierres_turno
    const queryTotales = `
      SELECT
        fecha::date AS fecha,
        id_estacion,
        nombre_estacion,
        caja_id,
        nombre_caja,
        total_efectivo_recaudado,
        importe_ventas_totales_contado
      FROM cierres_turno
      WHERE fecha >= $1 AND fecha <= $2
      ORDER BY fecha::date, id_estacion, caja_id;
    `;

    const params = [fechaInicio, fechaFin];
    console.log("🔍 [DEBUG] Parámetros de consulta SQL:", params);
    console.log("🔍 [DEBUG] Ejecutando consulta SQL...");

    const { rows } = await pool.query(queryTotales, params);

    console.log("🔍 [DEBUG] Consulta ejecutada exitosamente");
    console.log("🔍 [DEBUG] Número de registros obtenidos:", rows.length);
    console.log("🔍 [DEBUG] Primeros 3 registros (muestra):", rows.slice(0, 3));

    const response = { ok: true, data: rows };
    console.log("🔍 [DEBUG] Enviando respuesta. Total registros:", rows.length);

    res.status(200).json(response);
    console.log("✅ [DEBUG] Respuesta enviada exitosamente");
  } catch (error) {
    console.error("❌ [DEBUG] Error al obtener reporte mensual:", (error as Error).message);
    console.error("❌ [DEBUG] Stack trace:", (error as Error).stack);
    res.status(500).json({ 
      error: "Error al obtener reporte mensual",
      detalle: (error as Error).message 
    });
  }
};

// Facturación diaria por cliente
export const getFacturacionDiariaCliente = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM "facturacion_diaria_cliente"');
    // Normalizar y filtrar los campos
    const normalizados = rows.map(row => ({
      fecha: row.fecha,
      razon_social: row.razon_social,
      localidad: row.localidad,
      tipo_pago: row.tipo_pago,
      neto_gravado: Number(row.neto_gravado) || 0,
      impuesto_interno: Number(row.impuesto_interno) || 0,
      tasas: Number(row.tasas) || 0,
      tasas_viales: Number(row.tasas_viales) || 0,
      juristiccion: Number(row.juristiccion) || 0,
      percepcion_iibb: Number(row.percepcion_iibb) || 0,
      percepcion_iva: Number(row.percepcion_iva) || 0,
      otras_percepciones: Number(row.otras_percepciones) || 0,
      total: Number(row.total) || 0
    }));
    // Log de los primeros 3 registros normalizados
    console.log('Cliente normalizados:', normalizados.slice(0, 3));
    res.json({ ok: true, data: normalizados });
  } catch (error) {
    res.status(500).json({ error: "Error al obtener facturación diaria cliente", detalle: (error as Error).message });
  }
};

// Facturación diaria GNC
export const getFacturacionDiariaGNC = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM "facturacion_diaria_GNC"');
      console.log("🔍 [DEBUG] Primeros 3 registros de facturacion_diaria_GNC:", rows.slice(0, 3));
    // Normaliza y asegura tipos
    const data = rows.map((row: any) => ({
      anio: row.anio,
      mes_numero: row.mes_numero,
      nombre_dia: row.nombre_dia,
      fecha: row.fecha,
      gnc: Number(row.gnc ?? 0),
      gnc_ac: Number(row.gnc_ac ?? 0),
      total_gnc_dinero: Number(row.total_gnc_dinero ?? 0)
    }));
    console.log("🔍 [DEBUG] Respuesta GNC normalizada:", data.slice(0, 3));
    res.json({ ok: true, data });
  } catch (error) {
    console.error("❌ [DEBUG] Error en facturación diaria GNC:", (error as Error).message);
    res.status(500).json({ error: "Error al obtener facturación diaria GNC", detalle: (error as Error).message });
  }
};



// Facturación diaria líquidos
export const getFacturacionDiariaLiquidos = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM "facturacion_diaria_liquidos"');
    // Normalizar los campos numéricos
    const normalizados = rows.map(row => ({
      anio: row.anio,
      mes_numero: row.mes_numero,
      nombre_dia: row.nombre_dia,
      fecha: row.fecha,
      qn_ac: Number(row.qn_ac) || 0,
      quantium_nafta: Number(row.quantium_nafta) || 0,
      s_ac: Number(row.s_ac) || 0,
      super: Number(row.super) || 0,
      diesel_x10_liviano_ac: Number(row.diesel_x10_liviano_ac) || 0,
      diesel_x10_liviano: Number(row.diesel_x10_liviano) || 0,
      diesel_x10_pesado_ac: Number(row.diesel_x10_pesado_ac) || 0,
      diesel_x10_pesado: Number(row.diesel_x10_pesado) || 0,
      quantium_diesel_x10_liviano_ac: Number(row.quantium_diesel_x10_liviano_ac) || 0,
      quantium_diesel_x10_liviano: Number(row.quantium_diesel_x10_liviano) || 0,
      quantium_diesel_x10_pesado_ac: Number(row.quantium_diesel_x10_pesado_ac) || 0,
      quantium_diesel_x10_pesado: Number(row.quantium_diesel_x10_pesado) || 0,
      total_dinero_dia: Number(row.total_dinero_dia) || 0
    }));
    // Log de los primeros 3 registros normalizados
    console.log('Liquidos normalizados:', normalizados.slice(0, 3));
    res.json({ ok: true, data: normalizados });
  } catch (error) {
    res.status(500).json({ error: "Error al obtener facturación diaria líquidos", detalle: (error as Error).message });
  }
};

// Facturación diaria otros
export const getFacturacionDiariaOtros = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM "facturacion_diaria_otros"');
    // Normalizar y filtrar los campos
    const normalizados = rows.map(row => ({
      anio: row.anio,
      mes_numero: row.mes_numero,
      nombre_dia: row.nombre_dia,
      fecha: row.fecha,
      eco_blue: Number(row.eco_blue) || 0,
      lubricantes: Number(row.lubricantes) || 0,
      otros: Number(row.otros) || 0,
      total_otros_dinero: Number(row.total_otros_dinero) || 0
    }));
    // Log de los primeros 3 registros normalizados
    console.log('Otros normalizados:', normalizados.slice(0, 3));
    res.json({ ok: true, data: normalizados });
  } catch (error) {
    res.status(500).json({ error: "Error al obtener facturación diaria otros", detalle: (error as Error).message });
  }
};

// Facturación diaria shop
export const getFacturacionDiariaShop = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM "facturacion_diaria_shop"');
    // Normalizar y filtrar los campos
    const normalizados = rows.map(row => ({
      anio: row.anio,
      mes_numero: row.mes_numero,
      nombre_dia: row.nombre_dia,
      fecha: row.fecha,
      cortesias_discriminado: Number(row.cortesias_discriminado) || 0,
      total_comidas: Number(row.total_comidas) || 0,
      total_liquidos: Number(row.total_liquidos) || 0,
      total_kiosco: Number(row.total_kiosco) || 0,
      total_venta_dia: Number(row.total_venta_dia) || 0
    }));
    // Log de los primeros 3 registros normalizados
    console.log('Shop normalizados:', normalizados.slice(0, 3));
    res.json({ ok: true, data: normalizados });
  } catch (error) {
    res.status(500).json({ error: "Error al obtener facturación diaria shop", detalle: (error as Error).message });
  }
};

// Recibo diario por cliente
export const getReciboDiarioCliente = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM recibo_diario_cliente');
    res.json({ ok: true, data: rows });
  } catch (error) {
    res.status(500).json({ error: "Error al obtener recibo diario cliente", detalle: (error as Error).message });
  }
};
