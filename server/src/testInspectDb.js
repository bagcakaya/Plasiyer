import { getDbPool } from './db.js';

/**
 * ERP12 MSSQL Tablo Keşif ve Eşleştirme Aracı
 * Bu script çalıştırıldığında veritabanındaki Cari, Stok ve Sipariş tablolarını ve kolonlarını listeler.
 */
async function inspectDatabase() {
  console.log('🔍 ERP12 Veritabanı Tablo Keşfi Başlatılıyor...\n');

  try {
    const pool = await getDbPool();

    // 1. Cari ile ilgili tabloları ara
    console.log('--- [1] CARİ İLE İLGİLİ TABLOLAR ---');
    const cariTables = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE' 
        AND (TABLE_NAME LIKE '%CARI%' OR TABLE_NAME LIKE '%CASABIT%' OR TABLE_NAME LIKE '%CUSTOMER%')
      ORDER BY TABLE_NAME
    `);
    cariTables.recordset.forEach((row) => console.log(`  📁 ${row.TABLE_NAME}`));

    // 2. Stok ile ilgili tabloları ara
    console.log('\n--- [2] STOK İLE İLGİLİ TABLOLAR ---');
    const stokTables = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE' 
        AND (TABLE_NAME LIKE '%STOK%' OR TABLE_NAME LIKE '%STSABIT%' OR TABLE_NAME LIKE '%PRODUCT%' OR TABLE_NAME LIKE '%ITEM%')
      ORDER BY TABLE_NAME
    `);
    stokTables.recordset.forEach((row) => console.log(`  📦 ${row.TABLE_NAME}`));

    // 3. Sipariş ile ilgili tabloları ara
    console.log('\n--- [3] SİPARİŞ İLE İLGİLİ TABLOLAR ---');
    const siparisTables = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE' 
        AND (TABLE_NAME LIKE '%SIPARIS%' OR TABLE_NAME LIKE '%SIP%' OR TABLE_NAME LIKE '%ORDER%')
      ORDER BY TABLE_NAME
    `);
    siparisTables.recordset.forEach((row) => console.log(`  📋 ${row.TABLE_NAME}`));

    console.log('\n✅ Keşif tamamlandı! Tablo isimlerini server/src/erpSchemaConfig.js dosyasından eşleştirebilirsiniz.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Veritabanı incelenirken hata oluştu:', err.message);
    console.log('\n💡 İpucu: server/.env dosyasındaki DB_SERVER, DB_USER, DB_PASSWORD ve DB_NAME ayarlarını kontrol ediniz.');
    process.exit(1);
  }
}

inspectDatabase();
