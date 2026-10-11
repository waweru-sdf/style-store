import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import Collection from './pages/Collection.jsx'
import Product from './pages/Product.jsx'
import Cart from './pages/Cart.jsx'
import Checkout from './pages/Checkout.jsx'
import Order from './pages/Order.jsx'
import MockPay from './pages/MockPay.jsx'
import Info from './pages/Info.jsx'
import Admin from './pages/Admin.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/shop/:collection" element={<Collection />} />
        <Route path="/product/:slug" element={<Product />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/order/:reference" element={<Order />} />
        <Route path="/mock-pay/:reference" element={<MockPay />} />
        <Route path="/info/:page" element={<Info />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<div className="container section"><h1>Page not found</h1></div>} />
      </Route>
    </Routes>
  )
}
