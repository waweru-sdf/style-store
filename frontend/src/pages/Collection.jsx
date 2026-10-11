import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, COLLECTION_NAMES } from '../api.js'
import ProductCard from '../components/ProductCard.jsx'

export default function Collection() {
  const { collection } = useParams()
  const [products, setProducts] = useState(null)
  const [error, setError] = useState('')
  const [sort, setSort] = useState('')
  const [size, setSize] = useState('')
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    setProducts(null)
    setSize('')
  }, [collection])

  useEffect(() => {
    const params = new URLSearchParams({ collection })
    if (sort) params.set('sort', sort)
    if (size) params.set('size', size)
    if (available) params.set('available', '1')
    api(`/products?${params}`).then(setProducts).catch((e) => setError(e.message))
  }, [collection, sort, size, available])

  // Size options come from the whole collection, so choosing one size doesn't hide the others.
  const [sizes, setSizes] = useState([])
  useEffect(() => {
    api(`/products?collection=${collection}`)
      .then((all) => setSizes([...new Set(all.flatMap((p) => p.sizes))]))
      .catch(() => setSizes([]))
  }, [collection])

  if (!COLLECTION_NAMES[collection]) return <div className="container section"><h1>Collection not found</h1></div>

  return (
    <div className="container section">
      <p className="eyebrow">Collection</p>
      <h1>{COLLECTION_NAMES[collection]}</h1>
      <div className="filters">
        <label>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="">Featured</option>
            <option value="new">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
        </label>
        <label>
          Size
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="">All sizes</option>
            {sizes.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} /> In stock only
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      {!products && !error && <p className="muted">Loading…</p>}
      {products && products.length === 0 && <p className="muted">No items match those filters.</p>}
      <div className="grid">{(products || []).map((p) => <ProductCard key={p.slug} product={p} />)}</div>
    </div>
  )
}
