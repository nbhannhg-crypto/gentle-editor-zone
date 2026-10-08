# Kingdom expansion: additions only, nothing removed

The request is very large, so the work is split into 4 phases. Each phase gets tested before the next one starts. Nothing that exists today gets deleted. The current wallet and the existing 100 points stay as they are.

## Phase 1: Jeeb top-up and the Mother Kingdom (payments and profit)
- New top-up page: pick a currency ($ / SAR / YER) and type any amount. The page shows the points right away (×1000 / ×240 / ×1.714).
- An orange card with the Jeeb wallet number 113581 and a copy button, the masked name, and payment instructions.
- Transaction number is required and can only be used once. Receipt upload is optional.
- After you press confirm, the request is saved and a WhatsApp button opens with a ready message to your number +967712474671. It includes a one-time approval link that expires after 24 hours.
- Approval page: the first press adds the points and shows "✅ تم الشحن". A second press shows "⚠️ تمت المعالجة مسبقاً" with the date.
- The customer gets an instant "تم شحن رصيدك 🎉" notice.
- A 100-point gift for every new account, recorded in the transaction history.
- 👑 The "Mother Kingdom" page for the owner: a table of services with supplier cost, operating cost (+500), profit (double or custom), and selling price. You can edit it, and the totals show at the top.
- A profit log on every deduction, plus a "رصيدك 💎" bar at the top for signed-in users.

## Phase 2: Kingdom of Brains, the Mother Brain
- A pulsing orange 🧠 مملكة العقول button next to the library button.
- A large Mother Brain card with up to 10 inner brains (sales, reply, design...) that you name yourself.
- Each brain has: ▶️ run, 📚 link a library, 🎙️ pick a voice, and 💬 where it replies from.
- "Where it replies from" options: chosen numbers, all numbers, the last 10 numbers, only the sender, WhatsApp only, platforms only, or everywhere. You can add up to 20 options.
- A giant reply library of up to 100,000 lines, with fast upload, search, and filtering.

## Phase 3: Libraries and WhatsApp
- A voice and video library: upload, record live, auto-transcribe Saudi speech to text, and search. "Reply with a voice from the library" works from any brain.
- A design library for unlimited images and videos, with an optional code for each one.
- WhatsApp connection shows your site name instead of the provider's, with conversations shown inside the site, picking a number or adding one by hand, and voice-to-text.

## Phase 4: The living site and complaints
- A 🎤 microphone on the main text boxes and a voice assistant for commands ("راسلي هذا الرقم", "قولي له...").
- A complaints office with a form and status tracking.
- A final test of all services and a list of new ideas.

## Things to know up front (being honest with you)
- **Automatic WhatsApp to your number:** a wa.me link doesn't send by itself. It opens WhatsApp for the customer and they press send. A real automatic message needs your site number connected first. I'll set up both: the link now, and automatic sending once the number is connected.
- **A live WhatsApp call from the site:** WhatsApp doesn't allow a provider to make a real live call. The available option is a button that opens a call in the customer's WhatsApp, or the existing Kingdom Call.
- **Instagram, Facebook, and TikTok:** official connection needs approval from each platform. I'll add the connection screens and the steps, but actual replies on them won't work until each platform approves.
- **Points:** I'll use the current wallet instead of a new balance column, so the existing balances don't get split.
- **Credits:** each phase uses build credits. I suggest building one phase at a time.

## Technical details
- New tables: pending_payments (unique txn, token + expires_at), kingdom_pricing, profits_log, mother_brains, sub_brains, reply_scopes (json), reply_library, voice_library, design_library, complaints. All with RLS and GRANTs.
- Approval goes through the server route /api/public/approve?token=..., which validates the token and expiry inside a database function. Crediting goes through the existing wallets/wallet_transactions. Notifications use Realtime on wallet_transactions.
- Signup gift comes from a trigger on stores, or from getOrCreateMyStore via a database function.
- Media goes in private storage buckets, and transcription uses the existing transcription model.
