# Your own database as a backup copy

## The important point
This project is already permanently linked to the current cloud database. It can't be fully switched to your new database (kingdom-sales). And the key you sent is only the public one: it can't create tables or copy data.

So the safe approach: the site keeps running on the current cloud, and your new database holds a **full backup copy** that belongs to you and stays separate from any subscription.

## What I will build
1. **A "back up to my database" button** in the Queen's control panel. It copies the rules, voices, conversations, settings, and media list to kingdom-sales.
2. **An automatic daily backup** that runs once a day, so you never lose anything.
3. **A "download backup file" button** that saves a complete copy to your phone.
4. A small panel showing the date of the last backup and how many records it holds.

No existing feature will be deleted or changed.

## What I need from you after approval
- **The secret key (service_role / secret)** from the same keys page in your account. I'll ask for it through a secure form; don't paste it in the chat.
- Running one table-setup script once in your new database. I'll give you the script ready to copy.

## Technical details
- Store the public key and the address `https://uoeqwbmeikbbamfkoryd.supabase.co` in the code, and the secret key as a secret (EXT_DB_SECRET).
- A server function for admin only (role check) that reads tables by store_id and writes them in batches (upsert) to the external database.
- A daily scheduled route under /api/public/ protected by a secret token.
- A JSON export of all tables, available to admin only.
