# Database Backup Setup Guide

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [AWS S3 Setup](#aws-s3-setup)
4. [Environment Configuration](#environment-configuration)
5. [Installation](#installation)
6. [Testing Manual Backup](#testing-manual-backup)
7. [Automated Backup Setup](#automated-backup-setup)
8. [Monitoring Backups](#monitoring-backups)
9. [Backup Schedule Configuration](#backup-schedule-configuration)
10. [Backup Retention](#backup-retention)
11. [Troubleshooting](#troubleshooting)
12. [Recovery Process](#recovery-process)
13. [Security Considerations](#security-considerations)
14. [Production Recommendations](#production-recommendations)

## Overview

This guide explains how to set up automated SQLite database backups to Amazon S3 for your Tiequan PnL WebApp.

The backup system includes:
- Automated SQLite database backups to S3
- Configurable backup schedule (default: daily at 2 AM)
- Backup logging and monitoring
- Manual backup trigger via API
- Retention policy management

## Prerequisites

1. AWS Account with S3 access
2. Node.js environment
3. Your application deployed and running

## AWS S3 Setup

### 1. Create an S3 Bucket
```bash
aws s3 mb s3://your-unique-backup-bucket-name
```

### 2. Configure Bucket Policy (optional but recommended)
- Enable versioning for backup history
- Set up lifecycle rules for automatic cleanup
- Configure encryption (SSE-S3 or SSE-KMS)

### 3. Create IAM User with S3 Access
Go to AWS IAM console and create new user with programmatic access. Attach policy with S3 permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}
```

## Environment Configuration

Update your `.env` file with AWS credentials:

```bash
# AWS S3 Backup Configuration
S3_BUCKET_NAME=tiequan-portfolio-app-backup
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key

# Backup Schedule (cron pattern)
# Default: Daily at 2 AM
BACKUP_SCHEDULE="0 2 * * *"
BACKUP_RETENTION_DAYS=60
```

## Installation

```bash
pnpm install
```

The required dependencies are already added to `package.json`:
- `@aws-sdk/client-s3` - AWS S3 client
- `node-cron` - Cron job scheduling

## Testing Manual Backup

Run a manual backup to verify configuration:

```bash
pnpm run backup
```

Check the logs in `logs/backup.log` for success/failure messages.

## Automated Backup Setup

### Option A: Using the Built-in Service (Recommended for Development)

Start the backup service:

```bash
pnpm run backup-service
```

This will run the backup service in the foreground with scheduled backups.

### Option B: Using System Cron (Recommended for Production)

1. **Create a cron job:**
   ```bash
   crontab -e
   ```

2. **Add the backup schedule:**
   ```cron
   # Daily backup at 2 AM
   0 2 * * * cd /path/to/your/project && pnpm run backup
   ```

3. **Verify the cron job:**
   ```bash
   crontab -l
   ```

### Option C: Using PM2 (Recommended for Node.js Applications)

If you're using PM2 for process management:

1. **Add to ecosystem.config.js:**
   ```javascript
   module.exports = {
     apps: [
       {
         name: 'tiequan-pnl-webapp',
         script: 'pnpm',
         args: 'start',
         // ... your existing config
       },
       {
         name: 'backup-service',
         script: 'pnpm',
         args: 'run backup-service',
         watch: false,
         autorestart: true,
         max_memory_restart: '200M'
       }
     ]
   };
   ```

2. **Start with PM2:**
   ```bash
   pm2 start ecosystem.config.js
   ```

## Monitoring Backups

### Via API Endpoint

You can monitor backup status through the API:

```bash
# Trigger manual backup (requires auth unless /api/backup-public is added to PUBLIC_PATHS)
curl -X POST http://localhost:1373/api/backup-public

# View backup logs (requires auth unless /api/backup-public is added to PUBLIC_PATHS)
curl http://localhost:1373/api/backup-public

# Authenticated endpoint (requires login)
curl -X POST http://localhost:1373/api/backup
curl http://localhost:1373/api/backup
```

### Via Log Files

Check the backup logs:
```bash
tail -f logs/backup.log
```

## Backup Schedule Configuration

The backup schedule uses cron pattern syntax:

```
# ┌───────────── minute (0 - 59)
# │ ┌───────────── hour (0 - 23)
# │ │ ┌───────────── day of month (1 - 31)
# │ │ │ ┌───────────── month (1 - 12)
# │ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
# │ │ │ │ │
# * * * * *
```

Common schedules:
- `"0 2 * * *"` - Daily at 2 AM
- `"0 2 * * 0"` - Weekly on Sunday at 2 AM
- `"0 2 1 * *"` - Monthly on 1st at 2 AM
- `"*/30 * * * *"` - Every 30 minutes (for testing)

## Backup Retention

- Default retention: 60 days
- Configure via `BACKUP_RETENTION_DAYS` environment variable
- For production, consider implementing S3 lifecycle rules

## Troubleshooting

### Common Issues

#### 1. AWS Credentials Error
- Verify AWS credentials are correct
- Check IAM user permissions
- Ensure S3 bucket exists and is accessible

#### 2. Database File Not Found
- Check `DATABASE_URL` in your environment
- Verify the database file path exists

#### 3. Permission Errors
- Ensure the application has read access to the database file
- Check write permissions for the logs directory

### Debug Mode

Enable verbose logging by setting:
```bash
DEBUG=backup pnpm run backup
```

## Recovery Process

To restore from backup:

1. **Download backup from S3:**
   ```bash
   aws s3 cp s3://your-bucket-name/database-backups/backup-2023-12-01T02-00-00-000Z.db ./restored.db
   ```

2. **Replace current database:**
   ```bash
   # Stop your application
   # Backup current database
   cp prisma/dev.db prisma/dev.db.backup
   # Restore from backup
   cp restored.db prisma/dev.db
   # Restart application
   ```

## Security Considerations

### 1. AWS Credentials
- Store credentials securely (environment variables, AWS Secrets Manager)
- Use IAM roles when possible
- Rotate credentials regularly

### 2. S3 Security
- Enable S3 bucket encryption
- Use bucket policies to restrict access
- Enable S3 access logging

### 3. Network Security
- Use VPC endpoints for S3 access when possible
- Configure firewall rules appropriately

## Monitoring and Alerts

Consider setting up:
- CloudWatch alerts for backup failures
- Email notifications for backup status
- S3 event notifications for backup uploads

## Production Recommendations

1. **Use IAM Roles** instead of access keys when possible
2. **Enable S3 Versioning** for backup history
3. **Set up Lifecycle Policies** for automatic cleanup
4. **Monitor Backup Sizes** to manage storage costs
5. **Test Recovery Process** regularly
6. **Consider Cross-Region Replication** for critical data

## Support

If you encounter issues:
1. Check the backup logs in `logs/backup.log`
2. Verify AWS configuration and permissions
3. Test manual backup execution
4. Check system resources and network connectivity