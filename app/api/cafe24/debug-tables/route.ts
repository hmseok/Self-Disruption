import { NextRequest, NextResponse } from 'next/server'
import { getCafe24Pool } from '../lib/db'

export async function GET(request: NextRequest) {
  try {
    const pool = getCafe24Pool()
    const connection = await pool.getConnection()

    try {
      const results: Record<string, any> = {}

      // 1. pmccarsm structure
      console.log('Querying: SHOW COLUMNS FROM pmccarsm')
      const [pmccarsm_columns] = await connection.query('SHOW COLUMNS FROM pmccarsm')
      results.pmccarsm_columns = pmccarsm_columns

      // 2. pmccustm structure
      console.log('Querying: SHOW COLUMNS FROM pmccustm')
      const [pmccustm_columns] = await connection.query('SHOW COLUMNS FROM pmccustm')
      results.pmccustm_columns = pmccustm_columns

      // 3. Sample pmccarsm rows (5)
      console.log('Querying: SELECT * FROM pmccarsm LIMIT 5')
      const [pmccarsm_samples] = await connection.query('SELECT * FROM pmccarsm LIMIT 5')
      results.pmccarsm_samples = pmccarsm_samples

      // 4. Sample pmccustm rows (5)
      console.log('Querying: SELECT * FROM pmccustm LIMIT 5')
      const [pmccustm_samples] = await connection.query('SELECT * FROM pmccustm LIMIT 5')
      results.pmccustm_samples = pmccustm_samples

      // 5. Sample acrotpth rows with full data
      console.log('Querying: SELECT * FROM acrotpth WHERE otptgndt = "20260318" LIMIT 3')
      const [acrotpth_samples] = await connection.query(
        'SELECT * FROM acrotpth WHERE otptgndt = "20260318" LIMIT 3'
      )
      results.acrotpth_samples = acrotpth_samples

      // 6. Try join: acrotpth -> pmccarsm via otptgpid
      console.log('Querying: SELECT a.otptacnu, a.otptgpid, a.otptchid, c.* FROM acrotpth a LEFT JOIN pmccarsm c ON a.otptgpid = c.carscode WHERE a.otptgndt = "20260318" LIMIT 3')
      try {
        const [join_attempt1] = await connection.query(
          'SELECT a.otptacnu, a.otptgpid, a.otptchid, c.* FROM acrotpth a LEFT JOIN pmccarsm c ON a.otptgpid = c.carscode WHERE a.otptgndt = "20260318" LIMIT 3'
        )
        results.join_attempt_gmpid_carscode = join_attempt1
      } catch (e: any) {
        results.join_attempt_gmpid_carscode = { error: e.message }
      }

      // 7. Check acrotpth columns to understand structure
      console.log('Querying: SHOW COLUMNS FROM acrotpth')
      const [acrotpth_columns] = await connection.query('SHOW COLUMNS FROM acrotpth')
      results.acrotpth_columns = acrotpth_columns

      // 8. List all tables with 'car' in the name
      console.log('Querying: SHOW TABLES LIKE "%car%"')
      const [car_tables] = await connection.query('SHOW TABLES LIKE "%car%"')
      results.car_tables = car_tables

      // 9. List all tables with 'cust' in the name
      console.log('Querying: SHOW TABLES LIKE "%cust%"')
      const [cust_tables] = await connection.query('SHOW TABLES LIKE "%cust%"')
      results.cust_tables = cust_tables

      // 10. Try alternative join keys: otptchid, otptidno
      console.log('Querying: SELECT a.otptacnu, a.otptgpid, a.otptchid, a.otptidno FROM acrotpth a WHERE a.otptgndt = "20260318" LIMIT 3')
      const [acrotpth_keys] = await connection.query(
        'SELECT a.otptacnu, a.otptgpid, a.otptchid, a.otptidno FROM acrotpth a WHERE a.otptgndt = "20260318" LIMIT 3'
      )
      results.acrotpth_key_candidates = acrotpth_keys

      // 11. Try join: acrotpth -> pmccarsm via otptchid
      console.log('Querying: SELECT a.otptacnu, a.otptgpid, a.otptchid, c.* FROM acrotpth a LEFT JOIN pmccarsm c ON a.otptchid = c.carscode WHERE a.otptgndt = "20260318" LIMIT 3')
      try {
        const [join_attempt2] = await connection.query(
          'SELECT a.otptacnu, a.otptgpid, a.otptchid, c.* FROM acrotpth a LEFT JOIN pmccarsm c ON a.otptchid = c.carscode WHERE a.otptgndt = "20260318" LIMIT 3'
        )
        results.join_attempt_chid_carscode = join_attempt2
      } catch (e: any) {
        results.join_attempt_chid_carscode = { error: e.message }
      }

      // 12. Try join: acrotpth -> pmccustm via otptchid (customer link)
      console.log('Querying: SELECT a.otptacnu, a.otptgpid, a.otptchid, u.* FROM acrotpth a LEFT JOIN pmccustm u ON a.otptchid = u.custcode WHERE a.otptgndt = "20260318" LIMIT 3')
      try {
        const [join_attempt3] = await connection.query(
          'SELECT a.otptacnu, a.otptgpid, a.otptchid, u.* FROM acrotpth a LEFT JOIN pmccustm u ON a.otptchid = u.custcode WHERE a.otptgndt = "20260318" LIMIT 3'
        )
        results.join_attempt_chid_custcode = join_attempt3
      } catch (e: any) {
        results.join_attempt_chid_custcode = { error: e.message }
      }

      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        results,
      })
    } finally {
      connection.release()
    }
  } catch (e: any) {
    console.error('Debug query error:', e.message, e.stack)
    return NextResponse.json(
      {
        success: false,
        error: e.message,
        stack: process.env.NODE_ENV === 'development' ? e.stack : undefined,
      },
      { status: 500 }
    )
  }
}
