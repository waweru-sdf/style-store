// Thin fetch wrapper. All money values are whole Kenyan shillings (KES).
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Something went wrong. Please try again.')
    err.status = res.status
    throw err
  }
  return data
}

export const kes = (n) => `KES ${Number(n || 0).toLocaleString('en-KE')}`

export const COLLECTION_NAMES = {
  women: 'STYLE WOMAN',
  mama: 'STYLE MAMA',
  kids: 'STYLE KIDS',
  sets: 'Matching Sets & Gifts',
}

export const STATUS_LABELS = {
  pending_payment: 'Awaiting payment',
  payment_failed: 'Payment failed',
  payment_review: 'Payment under review',
  paid: 'Paid. We are preparing your order',
  processing: 'Processing',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}
