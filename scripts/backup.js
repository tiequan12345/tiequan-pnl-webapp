const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const cron = require('node-cron');

// Load environment variables from .env file
require('dotenv').config();

// Configuration - always use the correct path from project root
const projectRoot = path.join(__dirname, '..');
const logsDir = path.join(__dirname, '../logs');

// Create logs directory if it doesn't exist
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  
  // Write to log file
  const logFile = path.join(logsDir, 'backup.log');
  fs.appendFileSync(logFile, logMessage);
}

let DATABASE_PATH = process.env.DATABASE_URL?.replace('file:', '');

// If the resulting path is relative or doesn't exist, use the default prisma location
if (!DATABASE_PATH || !path.isAbsolute(DATABASE_PATH) || !fs.existsSync(DATABASE_PATH)) {
  const defaultPath = path.join(projectRoot, 'prisma', 'dev.db');
  log(`Defaulting to database path: ${defaultPath}`);
  DATABASE_PATH = defaultPath;
}
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const BACKUP_SCHEDULE = process.env.BACKUP_SCHEDULE || '0 2 * * *'; // Daily at 2 AM
const BACKUP_RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS) || 60;

// Validate required environment variables
if (!S3_BUCKET || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.error('Missing required AWS environment variables:');
  console.error('- S3_BUCKET_NAME:', S3_BUCKET ? '✓' : '✗');
  console.error('- AWS_ACCESS_KEY_ID:', AWS_ACCESS_KEY_ID ? '✓' : '✗');
  console.error('- AWS_SECRET_ACCESS_KEY:', AWS_SECRET_ACCESS_KEY ? '✓' : '✗');
  console.error('\nPlease set these environment variables in your .env file');
  process.exit(1);
}

// Initialize S3 client
const s3Client = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

async function backupToS3() {
  try {
    log('Starting database backup...');
    log(`Looking for database at: ${DATABASE_PATH}`);
    log(`Database path exists: ${fs.existsSync(DATABASE_PATH)}`);
    
    // List all files in the directory to debug
    const dbDir = path.dirname(DATABASE_PATH);
    if (fs.existsSync(dbDir)) {
      const files = fs.readdirSync(dbDir);
      log(`Files in ${dbDir}: ${files.join(', ')}`);
    } else {
      log(`Directory ${dbDir} does not exist`);
    }
    
    // Check if database file exists
    if (!fs.existsSync(DATABASE_PATH)) {
      throw new Error(`Database file not found at: ${DATABASE_PATH}`);
    }

    // Create backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup-${timestamp}.db`;
    
    // Read database file
    const dbBuffer = fs.readFileSync(DATABASE_PATH);
    
    // Upload to S3
    const uploadParams = {
      Bucket: S3_BUCKET,
      Key: `database-backups/${backupFileName}`,
      Body: dbBuffer,
      ContentType: 'application/x-sqlite3',
      Metadata: {
        'backup-date': new Date().toISOString(),
        'original-db-path': DATABASE_PATH,
        'db-size-bytes': dbBuffer.length.toString(),
      },
    };

    const command = new PutObjectCommand(uploadParams);
    const result = await s3Client.send(command);
    
    log(`Backup successful: ${backupFileName} (${dbBuffer.length} bytes)`);
    log(`S3 ETag: ${result.ETag}`);
    
    // Clean up old backups (simple cleanup based on retention days)
    await cleanupOldBackups();
    
    return {
      success: true,
      fileName: backupFileName,
      size: dbBuffer.length,
      timestamp: new Date().toISOString(),
    };
    
  } catch (error) {
    log(`Backup failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

async function cleanupOldBackups() {
  try {
    // Note: This is a simplified cleanup. In production, you might want to
    // list objects in S3 and delete ones older than retention period
    log(`Cleanup configured for ${BACKUP_RETENTION_DAYS} days retention`);
  } catch (error) {
    log(`Cleanup failed: ${error.message}`);
  }
}

// Manual backup execution
if (require.main === module) {
  backupToS3()
    .then(result => {
      if (result.success) {
        log('Backup completed successfully');
        process.exit(0);
      } else {
        log('Backup failed');
        process.exit(1);
      }
    })
    .catch(error => {
      log(`Unexpected error: ${error.message}`);
      process.exit(1);
    });
}

// Scheduled backup (for when running as a service)
function startScheduledBackups() {
  log(`Starting scheduled backups with cron pattern: ${BACKUP_SCHEDULE}`);
  
  cron.schedule(BACKUP_SCHEDULE, async () => {
    log('Running scheduled backup...');
    await backupToS3();
  });
  
  log('Backup scheduler started');
}

module.exports = {
  backupToS3,
  startScheduledBackups,
};