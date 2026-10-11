import { useCallback, useState } from 'react'
import { api, kes, STATUS_LABELS } from '../api.js'

const NEXT = ['processing', 'dispatched', 'delivered', 'cancelled', 'refunded']

// Minimal order desk. Protected by the ADMIN_TOKEN set on the server.
export default function Admin() {
  const [token, setToken] = useState(() => sessionStorage.getItem('style-admin') || '')
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState('')

  const headers = { 'X-Admin-Token': token }

  const load = useCallback(async () => {
    try {
      setOrders(await api('/admin/orders', { headers: { 'X-Admin-Token': token } }))
      sessionStorage.setItem('style-admin', token)
      setError('')
    } catch (e) {
      setError(e.message)
      setOrders(null)
    }
  }, [token])

  const update = async (ref, body) => {
    try {
      const updated = await api(`/admin/orders/${ref}`, { method: 'PATCH', body, headers })
      setOrders((cur) => cur.map((o) => (o.reference === ref ? updated : o)))
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="container section">
      <h1>Order desk</h1>
      <div className="code-row">
        <input type="password" placeholder="Admin token" value={token} onChange={(e) => setToken(e.target.value)} />
        <button className="btn" onClick={load}>Load orders</button>
      </div>
      {error && <p className="error">{error}</p>}
      {orders && orders.length === 0 && <p className="muted">No orders yet.</p>}
      <div className="admin-list">
        {(orders || []).map((o) => (
          <div className="panel" key={o.reference}>
            <p><strong>{o.reference}</strong> · {kes(o.total)} · <em>{STATUS_LABELS[o.status] || o.status}</em></p>
            <p className="small">{o.customer_name} · {o.phone} · {o.email}<br />{o.address}, {o.town}, {o.county}</p>
            <p className="small">{o.items.map((i) => `${i.quantity}× ${i.product_name} (${i.colour}, ${i.size}, ${i.fulfilment})`).join(' | ')}</p>
            {o.paid_at && (
              <div className="code-row">
                <select value="" onChange={(e) => e.target.value && update(o.reference, { status: e.target.value })}>
                  <option value="">Set status…</option>
                  {NEXT.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input placeholder="Tracking number" defaultValue={o.tracking_number || ''}
                  onBlur={(e) => e.target.value !== (o.tracking_number || '') && update(o.reference, { tracking_number: e.target.value })} />
              </div>
            )}
            <details><summary className="small">Audit trail</summary>
              {o.events.map((ev, i) => <p className="small muted" key={i}>{ev.at} · {ev.kind} · {ev.detail}</p>)}
            </details>
          </div>
        ))}
      </div>
    </div>
  )
}
