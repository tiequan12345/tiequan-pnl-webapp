import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';

// Force this route to be dynamic to avoid static generation issues
export const dynamic = 'force-dynamic';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(dbUrl);
  } catch (error) {
    console.error('Invalid DATABASE_URL', error);
    return NextResponse.json({ error: 'Invalid DATABASE_URL' }, { status: 400 });
  }

  if (parsed.protocol !== 'file:') {
    return NextResponse.json({ error: 'DATABASE_URL must be a file: URL to export the DB' }, { status: 400 });
  }

  const decodedPath = decodeURIComponent(parsed.pathname);
  let dbPath = path.resolve(decodedPath);
  
  // Check if the database file exists at the resolved path
  try {
    await fs.promises.stat(dbPath);
  } catch {
    // If the original path doesn't exist, try the prisma directory
    // The URL parser might treat relative paths as absolute, so we need to handle this
    const cleanPath = decodedPath.replace(/^\//, ''); // Remove leading slash if present
    const prismaDbPath = path.resolve('prisma', cleanPath);
    try {
      await fs.promises.stat(prismaDbPath);
      dbPath = prismaDbPath;
    } catch {
      // If that doesn't work either, try the original relative path
      const relativePath = path.resolve(cleanPath);
      try {
        await fs.promises.stat(relativePath);
        dbPath = relativePath;
      } catch {
        // Neither path works, keep original dbPath for error reporting
      }
    }
  }

  try {
    const stats = await fs.promises.stat(dbPath);
    if (!stats.isFile()) {
      return NextResponse.json({ error: 'Database path is not a file' }, { status: 400 });
    }
  } catch (error) {
    console.error('Database file not found', error);
    return NextResponse.json({ error: 'Database file not found' }, { status: 404 });
  }

  try {
    const nodeStream = fs.createReadStream(dbPath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${path.basename(dbPath)}"`,
      },
    });
  } catch (error) {
    console.error('Failed to stream database file', error);
    return NextResponse.json({ error: 'Failed to export database' }, { status: 500 });
  }
}