import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

// Draft copy for a first release. STYLE should review these (especially the legal pages) before launch.
const PAGES = {
  about: {
    title: 'About STYLE',
    body: [
      'STYLE E-Fashion House is a Kenyan online fashion store for women, mothers and kids. Her Style. Their Style. Your Style.',
      'We stock a curated mix of pieces we hold ourselves and pieces fulfilled by trusted suppliers, so you get a wider choice with honest dispatch times.',
    ],
  },
  delivery: {
    title: 'Delivery policy',
    body: [
      'We deliver across Kenya using local courier services. The delivery fee depends on your area and is shown at checkout before you pay.',
      'Nairobi: 1-2 working days. Nairobi metro: 2-3 working days. Major towns: 3-4 working days. Rest of Kenya: 4-6 working days.',
      'Items held in our own stock usually dispatch within 1-2 working days. Supplier-fulfilled items are confirmed with the supplier after payment and typically dispatch in 5-8 working days. We will tell you if anything is delayed.',
      'Once your order is dispatched we will share a courier tracking number.',
    ],
  },
  returns: {
    title: 'Returns & exchanges',
    body: [
      'If something is not right, tell us within 7 days of delivery. Items must be unworn, unwashed and have their tags attached.',
      'We offer exchanges for size or fault. Refunds are made to the original payment method through Paystack once we have received and checked the item.',
      'For hygiene reasons we cannot accept returns on underwear, swimwear or personalised items.',
    ],
  },
  privacy: {
    title: 'Privacy policy',
    body: [
      'We collect the details you give us at checkout (name, email, phone, delivery address) to process and deliver your order and to send order updates.',
      'Card and mobile-money details are entered on Paystack and are never stored by us. We share your delivery details with our courier and suppliers only to fulfil your order.',
      'You can ask us to see, correct or delete your personal data by contacting us at the email on our Contact page.',
    ],
  },
  terms: {
    title: 'Terms & conditions',
    body: [
      'By placing an order you agree to these terms. All prices are in Kenyan shillings (KES). An order is confirmed only after your payment has been successfully verified.',
      'We may cancel and refund an order if an item turns out to be unavailable. Delivery times are estimates, not guarantees.',
    ],
  },
  faq: {
    title: 'FAQs',
    faq: [
      ['How do I pay?', 'Securely online through Paystack. You see your full total, including delivery, before you pay.'],
      ['When is my order confirmed?', 'As soon as your payment is verified. You will get an order reference and a confirmation email.'],
      ['Why do some items take longer?', 'Some items are fulfilled by our suppliers. We confirm availability after payment and show a realistic dispatch estimate.'],
      ['Can I exchange a size?', 'Yes, within 7 days of delivery. See our returns policy.'],
      ['Do you deliver outside Kenya?', 'Not at the moment. We deliver across Kenya only.'],
    ],
  },
  contact: { title: 'Contact us', contact: true },
}

const CONTACT_EMAIL = 'hello@example.co.ke' // TODO: replace with STYLE's real address

export default function Info() {
  const { page } = useParams()
  const data = PAGES[page]
  const [msg, setMsg] = useState({ name: '', email: '', message: '' })

  if (!data) return <div className="container section"><h1>Page not found</h1></div>

  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Message from ' + msg.name)}&body=${encodeURIComponent(msg.message + '\n\n' + msg.email)}`

  return (
    <div className="container section narrow">
      <h1>{data.title}</h1>
      {data.body && data.body.map((p, i) => <p key={i}>{p}</p>)}
      {data.faq && data.faq.map(([q, a]) => (
        <details key={q}><summary>{q}</summary><p>{a}</p></details>
      ))}
      {data.contact && (
        <>
          <p>Email us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will get back to you within one working day.</p>
          <div className="checkout-form">
            <label>Name<input value={msg.name} onChange={(e) => setMsg({ ...msg, name: e.target.value })} /></label>
            <label>Email<input type="email" value={msg.email} onChange={(e) => setMsg({ ...msg, email: e.target.value })} /></label>
            <label>Message<textarea rows="5" value={msg.message} onChange={(e) => setMsg({ ...msg, message: e.target.value })} /></label>
            <a className="btn" href={mailto}>Send email</a>
          </div>
        </>
      )}
      <p className="muted small"><Link to="/">← Back to shop</Link></p>
    </div>
  )
}
