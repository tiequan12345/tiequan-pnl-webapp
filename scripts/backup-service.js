const { startScheduledBackups } = require('./backup');

// Start the backup service
startScheduledBackups();

// Keep the process running
console.log('Backup service is running. Press Ctrl+C to stop.');

process.on('SIGINT', () => {
  console.log('\nBackup service stopped.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nBackup service terminated.');
  process.exit(0);
});