import { pool } from "../db/connection";
import { parseStringPromise } from "xml2js";
import fetch from "node-fetch";

const BASE_URL = process.env.API_BASE_URL as string;
const TOKEN = process.env.API_TOKEN as string;

function asArray(val: any): any[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

// Helper robusto para extraer arrays de contenedores XML
function getArrayFromContainer(container: any, childKey: string): any[] {
  if (!container) return [];
  if (container[childKey]) return asArray(container[childKey]);
  if (Array.isArray(container)) return container;
  
  const lowerKey = childKey.toLowerCase();
  const keys = Object.keys(container);
  const foundKey = keys.find(k => k.toLowerCase() === lowerKey);
  if (foundKey) return asArray(container[foundKey]);
  
  return [];
}

async function parseXMLResponse(xmlData: string): Promise<any> {
  try {
    return await parseStringPromise(xmlData, {
      explicitArray: false,
      ignoreAttrs: true,
    });
  } catch (e) {
    console.error("Error parsing XML:", e);
    return null;
  }
}

function safeNumber(val: any, decimals: number = 2): number {
  const num = parseFloat(val || 0);
  return isNaN(num) ? 0 : parseFloat(num.toFixed(decimals));
}

function parsearFechaAPI(fechaStr: string): Date {
  if (!fechaStr) return new Date();
  const d = new Date(fechaStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

function parsearFechaCupon(fechaStr: string): Date | null {
  if (!fechaStr) return null;
  try {
    const parts = fechaStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s(\d{2}):(\d{2}):(\d{2})/);
    if (parts) {
      const isoString = `${parts[3]}-${parts[2]}-${parts[1]}T${parts[4]}:${parts[5]}:${parts[6]}`;
      return new Date(isoString);
    }
    const d = new Date(fechaStr);
    return isNaN(d.getTime()) ? null : d;
  } catch (e) {
    return null;
  }
}

export async function sincronizarFacturas(fechaInicio: string, fechaFin: string) {
  const inicio = Date.now();
  let registrosTotal = 0;
  let insertadosTotal = 0;
  let actualizadosTotal = 0;

  try {
    const url = `${BASE_URL}/Facturacion/GetFacturasVenta?desdeFecha=${fechaInicio}&hastaFecha=${fechaFin}`;
    console.log(`GET Facturas (XML): ${url}`);
    
    const response = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${TOKEN}`,
        "Accept": "application/xml"
      },
    });

    if (!response.ok) {
      console.warn(`API Error (${response.status}): ${await response.text()}`);
      return { registros: 0, insertados: 0, actualizados: 0 };
    }

    const xmlText = await response.text();
    const result = await parseXMLResponse(xmlText);

    const rawData = result?.ArrayOfFacturasVenta?.FacturasVenta;
    
    if (!rawData) {
      console.log(`0 facturas encontradas (XML vacío o estructura diferente).`);
      return { registros: 0, insertados: 0, actualizados: 0 };
    }

    const facturas = asArray(rawData);
    console.log(`Procesando ${facturas.length} facturas...`);

    for (const fRaw of facturas) {
      registrosTotal++;

      const cabecera = fRaw.cabecera || fRaw.Cabecera || {};
      const containerDetalle = fRaw.detalle || fRaw.Detalle;
      const itemsDetalle = getArrayFromContainer(containerDetalle, 'Detalle');
      const itemValores = fRaw.valores || fRaw.Valores || {};
      const containerCupones = fRaw.cuponesTarjetas || fRaw.CuponesTarjetas || 
                               itemValores.cuponesTarjetas || itemValores.CuponesTarjetas;
      const itemsCupones = getArrayFromContainer(containerCupones, 'Tarjetas');

      const f = {
        ...cabecera,
        Valores: itemValores,
        Detalle: itemsDetalle,
        Cupones: itemsCupones,
      };

      const idFacturaReal = f.IdFactura || f.Numero || 0;

      const resultCab = await pool.query(
        `INSERT INTO facturas_venta (
          tipo_comprobante, punto_venta, numero, fecha, codigo, razon_social,
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
          id_movimiento_fac = EXCLUDED.id_movimiento_fac
        RETURNING id_factura, (xmax = 0) AS insertado`,
        [
          f.TipoComprobante || "FAC",
          parseInt(f.PuntoVenta || 0),
          parseInt(idFacturaReal), 
          parsearFechaAPI(f.FechaEmision || f.Fecha),
          f.Codigo || null,
          f.NombreCliente || f.RazonSocial || null,
          f.NumeroDocumento || null,
          f.Domicilio || null,
          f.Localidad || null,
          parseInt(f.IdLocalidad || 0) || null,
          parseInt(f.CodigoPostal || 0) || null,
          f.Patente || null,
          f.Moneda || "PES",
          f.TipoPago || null,
          safeNumber(f.NetoGravado),
          safeNumber(f.NetoNoGravado),
          safeNumber(f.IVA),
          safeNumber(f.ImpuestoInterno),
          safeNumber(f.Tasas),
          safeNumber(f.TasaVial),
          f.Jurisdiccion ? parseInt(f.Jurisdiccion) : null,
          safeNumber(f.PercepcionIIBB),
          safeNumber(f.PercepcionIVA),
          safeNumber(f.OtrasPercepciones),
          safeNumber(f.MontoTotal || f.Total),
          f.IdClienteSeleccionado || null,
          parseInt(f.IdEstacion || 0) || null,
          f.Chofer || null,
          parseInt(f.idMovimientoFac || 0) || null,
          f.IdMovimientoCancelado ? parseInt(f.IdMovimientoCancelado) : null,
        ]
      );

      const dbIdFactura = resultCab.rows[0].id_factura;
      const esNuevo = resultCab.rows[0].insertado;

      if (esNuevo) insertadosTotal++;
      else actualizadosTotal++;

      const val = f.Valores; 
      await pool.query(
        `INSERT INTO facturas_venta_valores (
          id_factura, efectivo, cheques_propios, cheques_terceros,
          tarjetas, transferencias, debito_automatico
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id_factura) DO UPDATE SET
          efectivo = EXCLUDED.efectivo,
          tarjetas = EXCLUDED.tarjetas`,
        [
          dbIdFactura,
          safeNumber(val.Efectivo),
          parseInt(val.ChequesPropios || 0),
          safeNumber(val.ChequesTerceros),
          safeNumber(val.Tarjetas),
          parseInt(val.Transferencias || 0),
          parseInt(val.DebitoAutomatico || 0),
        ]
      );

      const totalCuponesReal = f.Cupones.reduce((sum: number, c: any) => sum + safeNumber(c.TotalTarjetas), 0);
      const accion = esNuevo ? "INSERTADO" : "ACTUALIZADO";
      const infoComprobante = `${f.TipoComprobante} ${f.PuntoVenta}-${f.Numero}`;
      console.log(`[${accion}] ${infoComprobante} | ID DB: ${dbIdFactura}`);
      
      if(safeNumber(val.Efectivo) > 0 || safeNumber(val.Tarjetas) > 0 || totalCuponesReal > 0) {
         console.log(`   -> [Valores] Efec: ${safeNumber(val.Efectivo)} | Tarj(XML): ${safeNumber(val.Tarjetas)} | Cup(Calc): ${totalCuponesReal}`);
      }

      
      // Limpiar detalles viejos de esta factura para evitar duplicados y errores
      await pool.query(`DELETE FROM facturas_venta_detalle WHERE id_factura = $1`, [dbIdFactura]);

      const detalles = f.Detalle;
      for (const d of detalles) {
        const resDet = await pool.query(
          `INSERT INTO facturas_venta_detalle (
            id_movimientos_detalle_fac, id_factura, cantidad, codigo_articulo, descripcion_articulo,
            id_grupo_articulo, descripcion_grupo, precio, iva_unitario,
            impuesto_interno_unitario, tasas_unitario, tasa_vial_unitario,
            costo_unitario, id_articulo, id_caja, identificador_caja,
            id_cierre_turno, total_neto, neto_unitario, total_iva,
            total_impuesto_interno, total_tasas, total_tasa_vial,
            alicuota_iva, total_renglon
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
          )`,
          [
            parseInt(d.IdMovimientosDetalleFac || 0),
            dbIdFactura,
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
            parseInt(d.IdCierreTurno || 0),
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

        if (resDet.rowCount && resDet.rowCount > 0) {
            console.log(`      -> [Detalle] ${d.DescripcionArticulo?.trim()} (Cant: ${d.Cantidad}) | $${d.TotalRenglon}`);
        }
      }

      // Limpiar detalles viejos de esta facturas_venta_cupones_tarjeta para evitar duplicados y errores
      await pool.query(`DELETE FROM facturas_venta_cupones_tarjeta WHERE id_factura = $1`, [dbIdFactura]);

      for (const c of f.Cupones) {
        const resCup = await pool.query(
          `INSERT INTO facturas_venta_cupones_tarjeta (
            id_factura, id_tarjeta, tarjeta, caja_tarjeta, numero_cupon,
            fecha_cupon, total_tarjetas, numero_lote, numero_tarjeta, codigo_aprobacion
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            dbIdFactura,
            parseInt(c.idTarjeta || 0),
            c.Tarjeta || null,
            c.CajaTarjeta || null,
            c.NumeroCupon || null,
            parsearFechaCupon(c.FechaCupon), 
            safeNumber(c.TotalTarjetas),
            c.NumeroLote || null,
            c.NumeroTarjeta || null,
            c.CodigoAprobacion || null
          ]
        );
        
        if (resCup.rowCount && resCup.rowCount > 0) {
            console.log(`      -> [Cupón NEW] ${c.Tarjeta} ($${c.TotalTarjetas})`);
        }
      }
    }

    const duracion = (Date.now() - inicio) / 1000;
    
    await pool.query(
      `INSERT INTO logs_ingesta (fecha, registros_insertados, estado, mensaje_error)
       VALUES (NOW(), $1, 'EXITO - FACTURAS', 'Insertados: ${insertadosTotal}, Actualizados: ${actualizadosTotal}, Duración: ${duracion.toFixed(1)}s')`,
      [registrosTotal]
    );

    return { registros: registrosTotal, insertados: insertadosTotal, actualizados: actualizadosTotal };

  } catch (error) {
    await pool.query(
      `INSERT INTO logs_ingesta (fecha, registros_insertados, estado, mensaje_error)
       VALUES (NOW(), 0, 'ERROR - FACTURAS', $1)`,
      [(error as Error).message]
    );
    throw error;
  }
}
