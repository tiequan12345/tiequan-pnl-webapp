const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [{
    name: 'tiequan-pnl-webapp',
    script: 'npm',
    args: 'run start',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: process.env.DATABASE_URL,
      FINNHUB_API_KEY: process.env.FINNHUB_API_KEY,
      COINGECKO_API_KEY: process.env.COINGECKO_API_KEY,
      S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
      S3_REGION: process.env.S3_REGION,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      BACKUP_SCHEDULE: process.env.BACKUP_SCHEDULE,
      BACKUP_RETENTION_DAYS: process.env.BACKUP_RETENTION_DAYS,
    },
  }]
};
