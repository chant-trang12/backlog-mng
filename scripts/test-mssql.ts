// Set MSSQL environment variables before importing database module
process.env.DB_CLIENT = 'mssql';
process.env.MSSQL_SERVER = process.env.MSSQL_SERVER || '127.0.0.1';
process.env.MSSQL_PORT = process.env.MSSQL_PORT || '1433';
process.env.MSSQL_USER = process.env.MSSQL_USER || 'sa';
process.env.MSSQL_PASSWORD = process.env.MSSQL_PASSWORD || 'StrongPassword123!';
process.env.MSSQL_DATABASE = process.env.MSSQL_DATABASE || 'backlog_mng';
process.env.MSSQL_ENCRYPT = 'false';
process.env.MSSQL_TRUST_SERVER_CERTIFICATE = 'true';
process.env.MSSQL_REQUEST_TIMEOUT = '30000';

async function main() {
  console.log('1. Importing database module with DB_CLIENT=mssql...');
  const { db, initDatabase } = await import('../src/db/database.ts');

  console.log(`2. Connecting to SQL Server [${process.env.MSSQL_SERVER}:${process.env.MSSQL_PORT}], DB: ${process.env.MSSQL_DATABASE}...`);
  const versionRes = await db.raw('SELECT @@VERSION as version, DB_NAME() as current_db');
  console.log('✅ Connected successfully!');
  console.log(' - Engine:', versionRes[0].version.split('\n')[0]);
  console.log(' - Current Database:', versionRes[0].current_db);

  console.log('\n3. Running auto-migration (initDatabase) to create all 18 tables...');
  await initDatabase();
  console.log('✅ Auto-migration completed successfully!');

  console.log('\n4. Verifying created tables in SQL Server:');
  const tables = await db.raw(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME"
  );
  console.log(`Found ${tables.length} tables in '${process.env.MSSQL_DATABASE}':`);
  tables.forEach((t: any, index: number) => {
    console.log(`  [${String(index + 1).padStart(2, ' ')}] ${t.TABLE_NAME}`);
  });

  console.log('\n5. Testing CRUD operations on SQL Server:');
  // INSERT
  await db('periods').insert({
    year: 2026,
    month: 12,
    label: 'Tháng 12/2026 Test',
  });
  console.log('✅ Inserted record successfully into [periods]!');

  // SELECT
  const fetched = await db('periods').where({ year: 2026, month: 12 }).first();
  console.log('✅ Queried record from SQL Server:', {
    id: fetched.id,
    year: fetched.year,
    month: fetched.month,
    label: fetched.label,
    created_at: fetched.created_at,
  });

  // UPDATE
  await db('periods').where({ id: fetched.id }).update({ label: 'Tháng 12/2026 Updated' });
  const updated = await db('periods').where({ id: fetched.id }).first();
  console.log(`✅ Updated record label to: ${updated.label}`);

  // Also test inserting a team and a task under this period
  const [team] = await db('teams').insert({
    period_id: fetched.id,
    name: 'Team Dev Test',
  }).returning('id');
  console.log('✅ Inserted team under period!');

  // DELETE period (tests cascading delete!)
  await db('periods').where({ id: fetched.id }).del();
  const checkDeleted = await db('periods').where({ id: fetched.id }).first();
  const checkTeamDeleted = await db('teams').where({ period_id: fetched.id }).first();
  console.log(`✅ Deleted period (exists: ${!!checkDeleted}, team cascade deleted: ${!checkTeamDeleted})`);

  await db.destroy();
  console.log('\n🎉 ALL MSSQL TESTS PASSED! Ready for production deployment on SQL Server!');
}

main().catch((err) => {
  console.error('❌ MSSQL Test failed:', err);
  process.exit(1);
});
