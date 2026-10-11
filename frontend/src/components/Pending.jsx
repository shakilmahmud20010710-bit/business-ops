/**
 * Shown where a dashboard figure is waiting on a cashflow function.
 * Names the file and function instead of leaving a blank panel.
 */
export function Pending({ title, fn, question, children }) {
  return (
    <div className="callout">
      <div className="callout__title">{title}</div>
      <p>{question}</p>
      <p style={{ marginTop: 8 }}>
        Waiting on <code>{fn}</code> in <code>backend/app/cashflow.py</code>
      </p>
      {children}
    </div>
  )
}
