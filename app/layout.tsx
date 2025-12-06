import './globals.css'

export const metadata = {
  title: 'Portfolio App',
  description: 'Portfolio tracking web application',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="h-full">{children}</body>
    </html>
  )
}