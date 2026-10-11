import { createContext, useContext, useEffect, useMemo, useState } from 'react'

// The cart is display-only state. The server re-prices everything at checkout.
const CartContext = createContext(null)
const KEY = 'style-cart-v1'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items))
    } catch {
      /* storage unavailable: cart still works for this session */
    }
  }, [items])

  const value = useMemo(
    () => ({
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      subtotal: items.reduce((n, i) => n + i.price * i.quantity, 0),
      add(item) {
        setItems((cur) => {
          const found = cur.find((i) => i.variant_id === item.variant_id)
          if (found) {
            return cur.map((i) =>
              i.variant_id === item.variant_id ? { ...i, quantity: Math.min(i.quantity + item.quantity, 20) } : i,
            )
          }
          return [...cur, item]
        })
      },
      setQuantity(variantId, quantity) {
        setItems((cur) =>
          cur
            .map((i) => (i.variant_id === variantId ? { ...i, quantity: Math.max(0, Math.min(quantity, 20)) } : i))
            .filter((i) => i.quantity > 0),
        )
      },
      remove(variantId) {
        setItems((cur) => cur.filter((i) => i.variant_id !== variantId))
      },
      clear() {
        setItems([])
      },
    }),
    [items],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export const useCart = () => useContext(CartContext)
