export function Page({ title, subtitle, actions, children }) {
  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1>{title}</h1>
          {subtitle && <div className="page__sub">{subtitle}</div>}
        </div>
        {actions}
      </div>
      <div className="stack">{children}</div>
    </div>
  )
}
