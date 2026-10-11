import { useState } from 'react'

import { Page } from '../components/Page'
import { api, money } from '../lib/api'
import { useAsync } from '../lib/useAsync'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December']

const iso = (d) => d.toISOString().slice(0, 10)
const shiftDay = (date, days) => {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return iso(d)
}

/**
 * Cash flow statement (FR-18, US-13).
 *
 * Monthly answers "how did the month go". Daily answers "how did today go" — the same
 * statement over a one-day period, so both come from one calculation rather than two
 * that could drift apart.
 */
export function Report() {
  const now = new Date()
  const [mode, setMode] = useState('monthly')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [day, setDay] = useState(iso(now))

  return (
    <Page
      title="Cash flow report"
      subtitle={mode === 'monthly' ? 'A month at a time' : 'A single day, with the entries behind it'}
      actions={
        <div className="toggle">
          <button type="button" aria-pressed={mode === 'monthly'} onClick={() => setMode('monthly')}>
            Monthly
          </button>
          <button type="button" aria-pressed={mode === 'daily'} onClick={() => setMode('daily')}>
            Daily
          </button>
        </div>
      }
    >
      {mode === 'monthly'
        ? <Monthly year={year} month={month} setYear={setYear} setMonth={setMonth} />
        : <Daily day={day} setDay={setDay} />}
    </Page>
  )
}

function Monthly({ year, month, setYear, setMonth }) {
  const report = useAsync(() => api.report(year, month), [year, month])
  const d = report.data

  return (
    <>
      <section className="panel">
        <div className="panel__body" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <label className="field" style={{ minWidth: 170 }}>
            <span className="label">Month</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 120 }}>
            <span className="label">Year</span>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </label>
        </div>
      </section>

      {report.loading && <div className="center muted">Loading…</div>}
      {report.error && <div className="formerror">{report.error}</div>}
      {d && <><Statement d={d} /><Breakdowns d={d} /></>}
    </>
  )
}

function Daily({ day, setDay }) {
  const report = useAsync(() => api.dailyReport(day), [day])
  const d = report.data
  const today = iso(new Date())

  return (
    <>
      <section className="panel">
        <div className="panel__body" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setDay(shiftDay(day, -1))}>← Previous day</button>
          <label className="field" style={{ minWidth: 190 }}>
            <span className="label">Date</span>
            <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} />
          </label>
          <button className="btn" disabled={day >= today} onClick={() => setDay(shiftDay(day, 1))}>
            Next day →
          </button>
          <button className="btn" onClick={() => setDay(today)}>Today</button>
        </div>
      </section>

      {report.loading && <div className="center muted">Loading…</div>}
      {report.error && <div className="formerror">{report.error}</div>}

      {d && (
        <>
          <Statement d={d} />

          <section className="panel">
            <div className="panel__head">
              <h2>Entries on this day</h2>
              <span className="label">{d.transaction_count} recorded</span>
            </div>
            <table className="ledger">
              <tbody>
                {d.transactions.length === 0 && (
                  <tr>
                    <td className="center muted">
                      Nothing was recorded on {d.period}. The balance carried straight through.
                    </td>
                  </tr>
                )}
                {d.transactions.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div>{t.description}</div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {t.category} · {t.account} · {t.method}
                      </div>
                    </td>
                    <td className={`right money ${t.type === 'income' ? 'pos' : 'neg'}`}>
                      {money(t.signed_minor, { sign: t.type === 'income' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {d.transaction_count > 0 && <Breakdowns d={d} />}
        </>
      )}
    </>
  )
}

function Statement({ d }) {
  const positive = d.net_minor >= 0
  return (
    <section className="panel panel--accent">
      <div className="panel__head">
        <h2>{d.period}</h2>
        <span className="label">{d.start === d.end ? 'one day' : `${d.start} to ${d.end}`}</span>
      </div>
      <table className="ledger">
        <tbody>
          <tr>
            <td>Opening balance</td>
            <td className="right money">{money(d.opening_balance_minor)}</td>
          </tr>
          <tr>
            <td>Money in</td>
            <td className="right money pos">{money(d.money_in_minor, { sign: true })}</td>
          </tr>
          <tr>
            <td>Money out</td>
            <td className="right money neg">{money(-d.money_out_minor)}</td>
          </tr>
          <tr>
            <td>Net movement</td>
            <td className={`right money ${positive ? 'pos' : 'neg'}`}>
              {money(d.net_minor, { sign: positive })}
            </td>
          </tr>
          <tr>
            <td><strong>Closing balance</strong></td>
            <td className="right money"><strong>{money(d.closing_balance_minor)}</strong></td>
          </tr>
        </tbody>
      </table>
      <div className="panel__body" style={{ paddingTop: 0 }}>
        <span className="formnote">
          Opening plus net equals closing. All three come from the same ledger, so the
          statement reconciles by construction rather than by agreement.
        </span>
      </div>
    </section>
  )
}

function Breakdowns({ d }) {
  return (
    <div className="cols-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <Breakdown title="Money in by category" rows={d.income_by_category} />
      <Breakdown title="Money out by category" rows={d.expense_by_category} />
    </div>
  )
}

function Breakdown({ title, rows }) {
  const total = rows.reduce((a, r) => a + r.total_minor, 0)
  return (
    <section className="panel">
      <div className="panel__head">
        <h2>{title}</h2>
        <span className="label">{money(total)}</span>
      </div>
      <table className="ledger">
        <tbody>
          {rows.length === 0 && <tr><td className="center muted">Nothing in this period.</td></tr>}
          {rows.map((r) => (
            <tr key={r.category}>
              <td>{r.category}</td>
              <td className="right money">{money(r.total_minor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
