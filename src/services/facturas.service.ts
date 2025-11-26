// src/services/facturas.service.ts
import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import { pool } from "../db/connection";

const BASE_URL = process.env.API_BASE_URL as string;
const TOKEN = process.env.API_TOKEN as string;

interface FacturaVenta {
  cabecera: any;
  detalle: any;
  valores: any;
}

// Función auxiliar para parsear fecha del formato de la API
function parsearFechaAPI(fechaStr: string): Date {
  if (!fechaStr || typeof fechaStr !== "string") {
    return new Date();
  }

  // Si es formato ISO (contiene T), parsearlo directamente
  if (fechaStr.includes("T")) {
    return new Date(fechaStr);
  }

  // Dividir por espacio para separar fecha y hora
  const partes = fechaStr.trim().split(" ");
  const fechaParte = partes[0] || "";
  let horaParte = partes[1] || "00:00:00";

  if (!fechaParte) {
    return new Date();
  }

  // Parsear fecha en formato DD/MM/YYYY
  const fechaPartes = fechaParte.split("/");
  const dia = fechaPartes[0] || "01";
  const mes = fechaPartes[1] || "01";
  const anio = fechaPartes[2] || "1970";
  
  if (!dia || !mes || !anio) {
    return new Date();
  }

  // Formatear hora con padding - asegurar que tenga formato HH:mm:ss
  const partesTiempo = horaParte.split(":");
  const horas = String(partesTiempo[0] || "00").padStart(2, "0");
  const minutos = String(partesTiempo[1] || "00").padStart(2, "0");
  const segundos = String(partesTiempo[2] || "00").padStart(2, "0");
  const horaFormateada = `${horas}:${minutos}:${segundos}`;

  // Construir ISO string: YYYY-MM-DDTHH:mm:ss
  // Sin conversión de zona horaria - guardar exactamente como viene
  const diaStr = String(dia).padStart(2, "0");
  const mesStr = String(mes).padStart(2, "0");
  const anioStr = String(anio);
  const isoString = `${anioStr}-${mesStr}-${diaStr}T${horaFormateada}`;
  
  // Retornar como Date - PostgreSQL lo interpretará correctamente
  return new Date(isoString);
}

// Convertir fecha YYYY-MM-DD o ISO (2025-11-24T00:00:00.000Z) manteniendo el formato para la API
function convertirFechaParaAPI(fecha: string): string {
  // Si es formato ISO completo (con T y hora), devolverlo tal cual
  if (fecha.includes("T")) {
    return fecha;
  }
  // Si es solo YYYY-MM-DD, devolverlo tal cual
  return fecha;
}

// Función para convertir valores null/undefined a 0
function safeNumber(val: any, decimals: number = 2): number {
  const num = parseFloat(val || 0);
  return isNaN(num) ? 0 : parseFloat(num.toFixed(decimals));
}

/**
 * Sincroniza facturas de venta desde la API de Caldén Oil
 */
export async function sincronizarFacturas(fechaInicio: string, fechaFin: string): Promise<{
  registros: number;
  insertados: number;
  actualizados: number;
}> {
  const inicio = Date.now();
  let registrosTotal = 0;
  let insertadosTotal = 0;
  let actualizadosTotal = 0;

  try {
    const desdeFecha = convertirFechaParaAPI(fechaInicio);
    const hastaFecha = convertirFechaParaAPI(fechaFin);

    console.log(`📥 Sincronizando facturas desde ${desdeFecha} hasta ${hastaFecha}`);

    const url = `${BASE_URL}/Facturacion/GetFacturasVenta?desdeFecha=${desdeFecha}&hastaFecha=${hastaFecha}`;
    console.log(`🔗 URL de la API: ${url}`);
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    // Si hay error 500 o similar, loguearlo pero continuar con 0 registros
    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ Advertencia en API (${response.status}):`, errorText.substring(0, 300));
      console.log(`📊 Se obtuvieron 0 facturas (error en la API externa)`);
      return {
        registros: 0,
        insertados: 0,
        actualizados: 0,
      };
    }

    const xmlText = await response.text();
    
    // Validar que la respuesta sea XML válido
    if (!xmlText || xmlText.trim().length === 0) {
      console.log(`📊 Se obtuvieron 0 facturas (respuesta vacía)`);
      return {
        registros: 0,
        insertados: 0,
        actualizados: 0,
      };
    }

    console.log(`📝 Respuesta recibida (${xmlText.length} caracteres)`);
    console.log(`📝 Primeros 300 caracteres:`, xmlText.substring(0, 300));
    
    const parsedData = await parseStringPromise(xmlText, { mergeAttrs: true, explicitArray: false });
    console.log(`✅ XML parseado correctamente`);
    console.log(`📋 Estructura raíz:`, Object.keys(parsedData || {}));
    
    // Extraer facturas del XML parseado - intentar múltiples caminos
    let facturas: FacturaVenta[] = [];
    
    // Intenta varios caminos posibles en la estructura XML
    if (parsedData?.root?.FacturasVenta) {
      facturas = Array.isArray(parsedData.root.FacturasVenta) 
        ? parsedData.root.FacturasVenta 
        : [parsedData.root.FacturasVenta];
    } else if (parsedData?.FacturasVenta) {
      facturas = Array.isArray(parsedData.FacturasVenta) 
        ? parsedData.FacturasVenta 
        : [parsedData.FacturasVenta];
    } else if (parsedData?.ArrayOfFacturasVenta?.FacturasVenta) {
      facturas = Array.isArray(parsedData.ArrayOfFacturasVenta.FacturasVenta)
        ? parsedData.ArrayOfFacturasVenta.FacturasVenta
        : [parsedData.ArrayOfFacturasVenta.FacturasVenta];
    }
    
    console.log(`📊 Se obtuvieron ${facturas.length} facturas`);

    for (const factura of facturas) {
      const cab = factura.cabecera;
      const det = factura.detalle;
      const val = factura.valores;

      const fechaParsada = parsearFechaAPI(cab.Fecha);
      fechaParsada.setHours(fechaParsada.getHours() - 2);

      console.log(`📄 Fecha factura: ${cab.Fecha}`);
      console.log(`📄 Fecha factura Original: ${fechaParsada}`);

      // Insertar o actualizar cabecera
      const resultCab = await pool.query(
        `INSERT INTO facturas_venta (
          id_factura, tipo_comprobante, punto_venta, fecha, codigo, razon_social,
          numero_documento, domicilio, localidad, id_localidad, codigo_postal,
          patente, moneda, tipo_pago, neto_gravado, neto_no_gravado, iva,
          impuesto_interno, tasas, tasa_vial, jurisdiccion, percepcion_iibb,
          percepcion_iva, otras_percepciones, total, id_cliente_seleccionado,
          id_estacion, chofer, id_movimiento_fac, id_movimiento_cancelado
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30
        )
        ON CONFLICT (tipo_comprobante, punto_venta, numero)
        DO UPDATE SET
          fecha = EXCLUDED.fecha,
          razon_social = EXCLUDED.razon_social,
          total = EXCLUDED.total,
          id_movimiento_fac = EXCLUDED.id_movimiento_fac,
          id_movimiento_cancelado = EXCLUDED.id_movimiento_cancelado
        RETURNING id_factura, (xmax = 0) AS insertado`,
        [
          parseInt(cab.Numero || 0),
          cab.TipoComprobante,
          parseInt(cab.PuntoVenta || 0),
          parsearFechaAPI(cab.Fecha),
          cab.Codigo || null,
          cab.RazonSocial || null,
          cab.NumeroDocumento || null,
          cab.Domicilio || null,
          cab.Localidad || null,
          cab.IdLocalidad?._xsi?.nil === "true" ? null : cab.IdLocalidad,
          parseInt(cab.CodigoPostal || 0) || null,
          cab.Patente || null,
          cab.Moneda || "PES",
          cab.TipoPago || null,
          safeNumber(cab.NetoGravado),
          safeNumber(cab.NetoNoGravado),
          safeNumber(cab.IVA),
          safeNumber(cab.ImpuestoInterno),
          safeNumber(cab.Tasas),
          safeNumber(cab.TasaVial),
          cab.Jurisdiccion !== undefined && cab.Jurisdiccion !== null ? parseInt(cab.Jurisdiccion) : null,
          safeNumber(cab.PercepcionIIBB),
          safeNumber(cab.PercepcionIVA),
          safeNumber(cab.OtrasPercepciones),
          safeNumber(cab.Total),
          cab.IdClienteSeleccionado?._xsi?.nil === "true" ? null : cab.IdClienteSeleccionado,
          parseInt(cab.IdEstacion || 0) || null,
          cab.Chofer || null,
          parseInt(cab.idMovimientoFac || 0) || null,
          cab.IdMovimientoCancelado !== undefined && cab.IdMovimientoCancelado !== null ? parseInt(cab.IdMovimientoCancelado) : null,
        ]
      );

      const idFactura = resultCab.rows[0].id_factura;
      const esNuevo = resultCab.rows[0].insertado;

      registrosTotal++;
      if (esNuevo) insertadosTotal++;
      else actualizadosTotal++;

      // Insertar valores (medios de pago)
      await pool.query(
        `INSERT INTO facturas_venta_valores (
          id_factura, efectivo, cheques_propios, cheques_terceros,
          tarjetas, transferencias, debito_automatico
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id_factura) DO UPDATE SET
          efectivo = EXCLUDED.efectivo,
          cheques_terceros = EXCLUDED.cheques_terceros,
          tarjetas = EXCLUDED.tarjetas`,
        [
          idFactura,
          safeNumber(val.Efectivo),
          parseInt(val.ChequesPropios || 0),
          safeNumber(val.ChequesTerceros),
          safeNumber(val.Tarjetas),
          parseInt(val.Transferencias || 0),
          parseInt(val.DebitoAutomatico || 0),
        ]
      );

      // Insertar detalles
      const detalles = Array.isArray(det?.Detalle) ? det.Detalle : det?.Detalle ? [det.Detalle] : [];

      for (const d of detalles) {
        const idCierreTurno = parseInt(d.IdCierreTurno || 0);
        
        // Solo insertar si existe el cierre de turno
        if (idCierreTurno > 0) {
          await pool.query(
            `INSERT INTO facturas_venta_detalle (
              id_factura, cantidad, codigo_articulo, descripcion_articulo,
              id_grupo_articulo, descripcion_grupo, precio, iva_unitario,
              impuesto_interno_unitario, tasas_unitario, tasa_vial_unitario,
              costo_unitario, id_articulo, id_caja, identificador_caja,
              id_cierre_turno, total_neto, neto_unitario, total_iva,
              total_impuesto_interno, total_tasas, total_tasa_vial,
              alicuota_iva, total_renglon
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
            )
            ON CONFLICT DO NOTHING`,
            [
              idFactura,
              safeNumber(d.Cantidad, 4),
              safeNumber(d.CodigoArticulo, 4),
              d.DescripcionArticulo || null,
              parseInt(d.IdGrupoArticulo || 0) || null,
              d.DescripcionGrupo || null,
              safeNumber(d.Precio, 4),
              safeNumber(d.IvaUnitario, 4),
              safeNumber(d.ImpuestoInternoUnitario, 4),
              safeNumber(d.TasasUnitario, 4),
              safeNumber(d.TasaVialUnitario, 4),
              safeNumber(d.CostoUnitario, 4),
              parseInt(d.IdArticulo || 0) || null,
              parseInt(d.IdCaja || 0) || null,
              d.IdentificadorCaja || null,
              idCierreTurno,
              safeNumber(d.TotalNeto),
              safeNumber(d.NetoUnitario, 4),
              safeNumber(d.TotalIva),
              safeNumber(d.TotalImpuestoInterno),
              safeNumber(d.TotalTasas),
              safeNumber(d.TotalTasaVial),
              d.AlicuotaIva || null,
              safeNumber(d.TotalRenglon),
            ]
          );
        }
      }

      // Insertar cupones de tarjeta si existen
      const cupones = Array.isArray(cab.CuponesTarjeta?.CuponTarjeta)
        ? cab.CuponesTarjeta.CuponTarjeta
        : cab.CuponesTarjeta?.CuponTarjeta
        ? [cab.CuponesTarjeta.CuponTarjeta]
        : [];

      for (const cupon of cupones) {
        await pool.query(
          `INSERT INTO facturas_venta_cupones_tarjeta (
            id_factura, id_tarjeta, tarjeta, caja_tarjeta, numero_cupon,
            fecha_cupon, total_tarjetas, numero_lote, numero_tarjeta, codigo_aprobacion
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT DO NOTHING`,
          [
            idFactura,
            parseInt(cupon.IdTarjeta || 0) || null,
            cupon.Tarjeta || null,
            cupon.CajaTarjeta || null,
            parseInt(cupon.NumeroCupon || 0) || null,
            cupon.FechaCupon || null,
            safeNumber(cupon.TotalTarjetas),
            cupon.NumeroLote || null,
            parseInt(cupon.NumeroTarjeta || 0) || null,
            cupon.CodigoAprobacion || null,
          ]
        );
      }
    }

    const duracion = (Date.now() - inicio) / 1000;

    // Registrar log
    await pool.query(
      `INSERT INTO logs_ingesta (
        fecha, registros_insertados, estado, mensaje_error
      ) VALUES (NOW(), $1, 'EXITO - FACTURAS', 'Insertados: ${insertadosTotal}, Actualizados: ${actualizadosTotal}, Duración: ${duracion.toFixed(1)}s')`,
      [registrosTotal]
    );

    console.log(`✅ Facturas sincronizadas: ${insertadosTotal} nuevas, ${actualizadosTotal} actualizadas (${duracion.toFixed(1)}s)`);

    return {
      registros: registrosTotal,
      insertados: insertadosTotal,
      actualizados: actualizadosTotal,
    };
  } catch (error) {
    const mensaje = (error as Error).message;

    await pool.query(
      `INSERT INTO logs_ingesta (fecha, registros_insertados, estado, mensaje_error)
       VALUES (NOW(), $1, 'ERROR - FACTURAS', $2)`,
      [registrosTotal, mensaje]
    );

    throw error;
  }
}