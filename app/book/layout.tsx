export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen antialiased">
      <link
        rel="preconnect"
        href="https://fonts.googleapis.com"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap"
        rel="stylesheet"
      />
      <style>{`
        .bk-root, .bk-root button, .bk-root input, .bk-root select, .bk-root textarea {
          font-family: "DM Sans", system-ui, sans-serif;
        }
        .bk-root .font-serif, .bk-root h1, .bk-root h2 {
          font-family: Fraunces, Georgia, serif;
        }
      `}</style>
      {children}
    </div>
  )
}
