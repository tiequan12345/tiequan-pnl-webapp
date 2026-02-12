import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_: NextRequest) {
  try {
    // Execute the backup script
    const scriptPath = path.join(process.cwd(), 'scripts', 'backup.js');
    const { stdout, stderr } = await execAsync(`node ${scriptPath}`);
    
    if (stderr && stderr.includes('Backup failed')) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Backup failed',
          details: stderr 
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Backup completed successfully',
      output: stdout
    });
    
  } catch (error) {
    console.error('Backup API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to execute backup',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_: NextRequest) {
  try {
    // Read backup logs
    const fs = require('fs');
    const logPath = path.join(process.cwd(), 'logs', 'backup.log');
    
    if (!fs.existsSync(logPath)) {
      return NextResponse.json({
        success: true,
        logs: [],
        message: 'No backup logs found'
      });
    }
    
    const logContent = fs.readFileSync(logPath, 'utf8');
    const logLines = logContent.split('\n').filter((line: string) => line.trim());
    
    // Get last 50 log entries
    const recentLogs = logLines.slice(-50);
    
    return NextResponse.json({
      success: true,
      logs: recentLogs,
      totalLogs: logLines.length
    });
    
  } catch (error) {
    console.error('Backup logs API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to retrieve backup logs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}