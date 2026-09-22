export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen antialiased">
      {children}
    </div>
  )
}
