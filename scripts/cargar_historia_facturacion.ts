// scripts/cargar_historia_facturacion.ts
import dotenv from 'dotenv';
import { sincronizarFacturas } from '../src/services/facturas.service';
import { sincronizarRecibos } from '../src/services/recibos.service';

dotenv.config();

/**
 * Script para cargar la historia completa de facturas y recibos desde 2020
 * Ejecutar con: npm run cargar-historia
 * o: ts-node scripts/cargar_historia_facturacion.ts
 */

async function cargarHistoriaCompleta() {
  console.log('🚀 Iniciando carga de historia completa desde 2020...\n');

  const fechaInicio = '2020-01-01';
  const hoy = new Date();
  const fechaFin = hoy.toISOString().split('T')[0];

  console.log(`📅 Período: ${fechaInicio} hasta ${fechaFin}`);
  console.log('📊 Dividiendo en períodos mensuales para evitar timeouts\n');

  const periodos = generarPeriodosMensuales(fechaInicio, fechaFin);
  console.log(`📆 Total de períodos a procesar: ${periodos.length}\n`);

  let totalFacturasInsertadas = 0;
  let totalFacturasActualizadas = 0;
  let totalRecibosInsertados = 0;
  let totalRecibosActualizados = 0;
  let errores = 0;

  for (let i = 0; i < periodos.length; i++) {
    const periodo = periodos[i];
    const progreso = ((i + 1) / periodos.length * 100).toFixed(1);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📅 Período ${i + 1}/${periodos.length} (${progreso}%)`);
    console.log(`   Desde: ${periodo.inicio}`);
    console.log(`   Hasta: ${periodo.fin}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    try {
      // Sincronizar facturas
      console.log('📄 Sincronizando facturas...');
      const resultFacturas = await sincronizarFacturas(periodo.inicio, periodo.fin);
      totalFacturasInsertadas += resultFacturas.insertados;
      totalFacturasActualizadas += resultFacturas.actualizados;
      console.log(`   ✅ ${resultFacturas.insertados} facturas nuevas`);
      console.log(`   🔄 ${resultFacturas.actualizados} facturas actualizadas`);

      // Sincronizar recibos
      console.log('\n🧾 Sincronizando recibos...');
      const resultRecibos = await sincronizarRecibos(periodo.inicio, periodo.fin);
      totalRecibosInsertados += resultRecibos.insertados;
      totalRecibosActualizados += resultRecibos.actualizados;
      console.log(`   ✅ ${resultRecibos.insertados} recibos nuevos`);
      console.log(`   🔄 ${resultRecibos.actualizados} recibos actualizados`);

      // Pausa breve entre períodos para no sobrecargar la API
      if (i < periodos.length - 1) {
        console.log('\n⏳ Esperando 2 segundos antes del siguiente período...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      errores++;
      console.error(`\n❌ Error en período ${periodo.inicio} - ${periodo.fin}:`);
      console.error(`   ${(error as Error).message}`);
      console.log('   ⚠️  Continuando con el siguiente período...');
    }
  }

  console.log('\n\n');
  console.log('═══════════════════════════════════════════════════');
  console.log('          📊 RESUMEN DE CARGA COMPLETADA           ');
  console.log('═══════════════════════════════════════════════════');
  console.log(`\n📄 FACTURAS:`);
  console.log(`   ✅ Nuevas:        ${totalFacturasInsertadas.toLocaleString()}`);
  console.log(`   🔄 Actualizadas:  ${totalFacturasActualizadas.toLocaleString()}`);
  console.log(`   📊 Total:         ${(totalFacturasInsertadas + totalFacturasActualizadas).toLocaleString()}`);
  
  console.log(`\n🧾 RECIBOS:`);
  console.log(`   ✅ Nuevos:        ${totalRecibosInsertados.toLocaleString()}`);
  console.log(`   🔄 Actualizados:  ${totalRecibosActualizados.toLocaleString()}`);
  console.log(`   📊 Total:         ${(totalRecibosInsertados + totalRecibosActualizados).toLocaleString()}`);
  
  console.log(`\n📆 Períodos procesados: ${periodos.length}`);
  if (errores > 0) {
    console.log(`⚠️  Períodos con errores: ${errores}`);
  }
  console.log('\n═══════════════════════════════════════════════════\n');

  if (errores === 0) {
    console.log('✅ Carga histórica completada exitosamente!\n');
  } else {
    console.log('⚠️  Carga completada con algunos errores. Revisa los logs.\n');
  }

  process.exit(errores > 0 ? 1 : 0);
}

function generarPeriodosMensuales(
  fechaInicio: string,
  fechaFin: string
): Array<{ inicio: string; fin: string }> {
  const periodos: Array<{ inicio: string; fin: string }> = [];
  let actual = new Date(fechaInicio);
  const fin = new Date(fechaFin);

  while (actual <= fin) {
    const inicioMes = new Date(actual.getFullYear(), actual.getMonth(), 1);
    const finMes = new Date(actual.getFullYear(), actual.getMonth() + 1, 0);

    // Ajustar si el último mes está incompleto
    if (finMes > fin) {
      finMes.setTime(fin.getTime());
    }

    periodos.push({
      inicio: inicioMes.toISOString().split('T')[0],
      fin: finMes.toISOString().split('T')[0],
    });

    // Avanzar al siguiente mes
    actual.setMonth(actual.getMonth() + 1);
  }

  return periodos;
}

// Ejecutar
cargarHistoriaCompleta().catch((error) => {
  console.error('\n❌ Error fatal:', error);
  process.exit(1);
});