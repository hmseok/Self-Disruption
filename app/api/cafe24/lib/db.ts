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
      charset: 'utf8mb4',
      // Buffer → String 자동 변환 (MariaDB 호환)
      typeCast: function (field: any, next: any) {
        if (field.type === 'VAR_STRING' || field.type === 'STRING' || field.type === 'VARCHAR' ||
            field.type === 'BLOB' || field.type === 'TINY_BLOB' || field.type === 'MEDIUM_BLOB' ||
            field.type === 'LONG_BLOB') {
          const val = field.buffer();
          if (val === null) return null;
          return val.toString('utf8');
        }
        return next();
      },
    });
  }
  return pool;
}
