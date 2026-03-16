import * as mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

export function getCafe24Pool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.CAFE24_DB_HOST || 'skyautosvc.co.kr',
      port: parseInt(process.env.CAFE24_DB_PORT || '3306'),
      user: process.env.CAFE24_DB_USER || 'yangjaehee',
      password: process.env.CAFE24_DB_PASSWORD,
      database: process.env.CAFE24_DB_NAME || 'yangjaehee',
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 10000,
      // 카페24 DB는 EUC-KR일 수 있음
      charset: 'utf8mb4',
    });
  }
  return pool;
}
