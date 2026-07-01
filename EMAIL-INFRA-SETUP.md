# Email Infrastructure — replyflow.pro Setup Guide
Generated: 2026-07-01

## Domain Assignments

| Domain                    | Provider     | Provider Account | Mailcow Relay       |
|---------------------------|--------------|------------------|---------------------|
| engage.replyflow.pro      | ZeptoMail    | Account 1        | ✅ [127.0.0.1]:2525 |
| advisory.replyflow.pro    | ZeptoMail    | Account 1        | ✅ [127.0.0.1]:2525 |
| connect.replyflow.pro     | Mailtrap     | Account 2773141  | ✅ [127.0.0.1]:2525 |
| growth.replyflow.pro      | Brevo        | Account 1        | ✅ [127.0.0.1]:2525 |
| insights.replyflow.pro    | Brevo        | Account 2        | ✅ [127.0.0.1]:2525 |

---

## Mailcow Mailboxes (10 per domain) ✅ DONE

Password for all new mailboxes: `ReplyFlow2026!Secure`

**engage.replyflow.pro** (ZeptoMail)
- david, fortune, mike, ruben, treasure (original)
- alex, james, sophia, emma, liam (new — 512 MB quota each)

**advisory.replyflow.pro** (ZeptoMail)
- david, fortune, mike, ruben, treasure (original)
- alex, james, sophia, emma, liam (new — 512 MB quota each)

**connect.replyflow.pro** (Mailtrap)
- david, fortune, mike, ruben, treasure, alex (6 — quotas reduced to 512 MB)
- james, sophia, emma, liam (new — 256 MB quota each)
Total: 10 mailboxes

**growth.replyflow.pro** (Brevo #1)
- david, fortune, mike, ruben, treasure (original)
- alex, james, sophia, emma, liam (new — 512 MB quota each)

**insights.replyflow.pro** (Brevo #2)
- david, fortune, mike, ruben, treasure (original)
- alex, james, sophia, emma, liam (new — 512 MB quota each)

---

## DNS Records — Add to Hostinger (replyflow.pro zone)

> ⚠️ Hostinger API is blocked from this server's IP (Cloudflare error 1016).
> Add these MANUALLY at: Hostinger → Domains → replyflow.pro → DNS Zone

### 1. engage.replyflow.pro → ZeptoMail

| TYPE | NAME | VALUE | TTL |
|------|------|-------|-----|
| MX | engage.replyflow.pro | 10 admin.mail.replyflow.pro | 3600 |
| TXT | engage.replyflow.pro | v=spf1 include:zeptomail.net ~all | 3600 |
| TXT | dkim._domainkey.engage.replyflow.pro | v=DKIM1;k=rsa;t=s;s=email;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkvfxUeCyKJqAAsOktu0hUckM41fn75Gjy8uHXZUbeCM0lQbXQ0xWWXSjbK5TjOttIScpmw572qcsa3bJRcWY1KOX6jUDzK/l1WnZUQPSCI/0NhykhXI29nvUPb7MENXPvPopxVLLC15po3jKm+dn9jijWvpkD7YK3ysCZFk4kV5C+eehaqnbsh1P8oqaP3OQVRJSnwSAsIbO6tYX1mN04yDveA7mnsSoGulqnjcBcsExlPWeH0yA8W+YAwXOGOeg3HVSscEj/BNMx5D1QyWRiJ0YDXRNb5uad+SnLzrWBwo+vPJsdqMFR8/cDqsw6/vTuo7vQ4UnjvoXvNkaM21PJQIDAQAB | 3600 |
| TXT | _dmarc.engage.replyflow.pro | v=DMARC1; p=quarantine; rua=mailto:dmarc@engage.replyflow.pro; pct=100 | 3600 |

### 2. advisory.replyflow.pro → ZeptoMail

| TYPE | NAME | VALUE | TTL |
|------|------|-------|-----|
| MX | advisory.replyflow.pro | 10 admin.mail.replyflow.pro | 3600 |
| TXT | advisory.replyflow.pro | v=spf1 include:zeptomail.net ~all | 3600 |
| TXT | dkim._domainkey.advisory.replyflow.pro | v=DKIM1;k=rsa;t=s;s=email;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAn2wcF6O1nq7kaZn9Er9rt12Hfx+jo+X32f4rJWeUIYtihuVSArlE9AzK+BGP1I29mnFoePDTCxTcN9HXht9BiZgiSZbwiha3uve1IaIBmI6+aACXoAMiuqDciuHVdQvbu8JzvHW3BvzmhqKdauZJ3b5KGJWlX7rtpvImu3wPNdfLtupXQUNpcMFY7IqEBD+79Pkelk98+3pwEz/9W9Vcaws+BlihebfRWcM9+pndJ6E+ISJl5s3tJhS4621fTCiX5IVD4r5bbmBAg8JH0JBf9wphR97F80PIlh2MsyJeIsUTM6S1/S28V8NrP37BZxTlFXPOBB6CJNaFIiswA923bwIDAQAB | 3600 |
| TXT | _dmarc.advisory.replyflow.pro | v=DMARC1; p=quarantine; rua=mailto:dmarc@advisory.replyflow.pro; pct=100 | 3600 |

### 3. connect.replyflow.pro → Mailtrap

| TYPE | NAME | VALUE | TTL |
|------|------|-------|-----|
| MX | connect.replyflow.pro | 10 admin.mail.replyflow.pro | 3600 |
| TXT | connect.replyflow.pro | v=spf1 include:_spf.smtp.mailtrap.live ~all | 3600 |
| CNAME | rwmt1._domainkey.connect.replyflow.pro | rwmt1.dkim.smtp.mailtrap.live | 3600 |
| CNAME | rwmt2._domainkey.connect.replyflow.pro | rwmt2.dkim.smtp.mailtrap.live | 3600 |
| TXT | _dmarc.connect.replyflow.pro | v=DMARC1; p=none; rua=mailto:dmarc@smtp.mailtrap.live; rf=afrf; pct=100 | 3600 |

### 4. growth.replyflow.pro → Brevo Account 1

| TYPE | NAME | VALUE | TTL |
|------|------|-------|-----|
| MX | growth.replyflow.pro | 10 admin.mail.replyflow.pro | 3600 |
| TXT | growth.replyflow.pro | v=spf1 include:spf.sendinblue.com ~all | 3600 |
| TXT | dkim._domainkey.growth.replyflow.pro | v=DKIM1;k=rsa;t=s;s=email;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAp+H0k0MBNuNOnxRWqHk4QLxFXxOxN7i34IgUwqJy8rbyntvoL0YRWBqPDDi2j1vLTldwkTX+mHhClq/I9V2b3j/BDkYO1rVn5Um+opkju6+1NtOP2X3JDAxGHyDjkYY5ZBQloBWbef9Aric2wuU4MrjaC0iwUgxqhMNRprgBSHBQa0SaHY+/REiBsF61QbNHegDHzW9fGt7WZeIexF5mxg17KDMkZoICSyAJaMORkDXVUm2LYxShbvDd35Y8q1EwnvHu5GZ7UIVvo3Oa6wkJ3BKOvJabqe4+KWBMi5F91Lnq84Z0JGupc/UhhvyoaEx2VQpPzvlMIB55TiNNnu0fQQIDAQAB | 3600 |
| TXT | _dmarc.growth.replyflow.pro | v=DMARC1; p=quarantine; rua=mailto:dmarc@growth.replyflow.pro; pct=100 | 3600 |

### 5. insights.replyflow.pro → Brevo Account 2

| TYPE | NAME | VALUE | TTL |
|------|------|-------|-----|
| MX | insights.replyflow.pro | 10 admin.mail.replyflow.pro | 3600 |
| TXT | insights.replyflow.pro | v=spf1 include:spf.sendinblue.com ~all | 3600 |
| TXT | dkim._domainkey.insights.replyflow.pro | v=DKIM1;k=rsa;t=s;s=email;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArpGExewTIhXWU5NyoEh/4uIJ6kITQfTgzflcnse7j798RZdRxjOwkTEHaLA/DYJnDxe73MmLJSrt5oMK/gyoXO073nqS7kLb0wn+zvQsL7ZnjG6EdqAhBr60tSwkTA8DQhzH0I3+I9N9QdrKibjc6NKQx9oJmizB9D8Kt7FIbeAE0cHaVXd48gCACwkMTnnerN7a6kiraAPx4dLmQtlDcWS45iutW77Jw4NvM0L3UGS4KJFbuCYwk1optsGq4qLmeSOkEnT5mbXZTeq3t7Y6ftTZq0V2byrkTxmiLx0hhR3pMnSE3E9DBNbTDtCRDIlvvsXfpqBWHAYJ1YX0kxtFdQIDAQAB | 3600 |
| TXT | _dmarc.insights.replyflow.pro | v=DMARC1; p=quarantine; rua=mailto:dmarc@insights.replyflow.pro; pct=100 | 3600 |

---

## SMTP Provider Setup — What's Still Needed

### 🔵 ZeptoMail (engage + advisory)
**Status: ❌ Credit exhausted — can't send**
1. Top up credits at https://mail.zoho.com/zm/
2. Go to ZeptoMail → Mail Agents → Add Sending Domain
3. Add `engage.replyflow.pro` → get their DKIM TXT → add to Hostinger
4. Add `advisory.replyflow.pro` → same
5. SMTP settings (once credits restored):
   - Host: `smtp.zeptomail.com`
   - Port: `587`
   - Username: `emailapikey`
   - Password: (the send mail token — Zoho-enczapikey wSsVR...)

### 🟡 Mailtrap (connect)
**Status: ❌ Account only has sandbox — Email Sending product not subscribed**
1. Go to Mailtrap → Email Sending → Get Started
2. Subscribe to Email Sending (separate from sandbox)
3. Add domain `connect.replyflow.pro`
4. They'll give you SMTP credentials (different from sandbox):
   - Host: `live.smtp.mailtrap.io`
   - Port: `587`
   - Username / Password from their panel
5. Sandbox-only SMTP (for testing, not real delivery):
   - Host: `sandbox.smtp.mailtrap.io`
   - Port: `587`
   - Username: `540b6bfbc95f8f`
   - Password: `9cae0889f3dc38`

### 🟢 Brevo (growth + insights)
**Status: ❌ IP 34.105.11.45 not whitelisted**
1. Log in to BOTH Brevo accounts
2. Go to: Settings → Security → Authorized IPs
   URL: https://app.brevo.com/security/authorised_ips
3. Add IP: `34.105.11.45` to both accounts
4. Come back and I'll use the API to:
   - Add growth.replyflow.pro to Account 1
   - Add insights.replyflow.pro to Account 2
   - Get their DKIM records
   - Retrieve SMTP credentials

---

## Relay Architecture

```
Your App (Lead Finder SMTP Multiplexer :2525)
       ↓
Mailcow → relay all → [127.0.0.1]:2525
       ↓ routes by sender domain
engage/* advisory/* → ZeptoMail (smtp.zeptomail.com:587)
connect/*            → Mailtrap  (live.smtp.mailtrap.io:587)
growth/*             → Brevo #1  (smtp-relay.brevo.com:587)
insights/*           → Brevo #2  (smtp-relay.brevo.com:587)
```

