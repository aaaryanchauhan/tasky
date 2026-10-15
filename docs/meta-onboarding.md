# Meta WhatsApp Cloud API — onboarding checklist

These are **manual, external steps**. The app cannot do them for you, and an existing WhatsApp Business *app* number cannot automatically be reused.

## 1. Accounts & number
- [ ] Meta Business portfolio created for Tiger Fitness; **business verification** started/completed.
- [ ] Meta developer app (type *Business*) with the **WhatsApp** product added.
- [ ] WhatsApp Business Account (WABA) exists; **billing / payment method** attached.
- [ ] Decide the number: a **dedicated number** for the API, *or* coexistence with the existing WhatsApp Business app number if Meta confirms it is eligible. A number registered on the Cloud API cannot also be used in the normal app unless coexistence applies.
- [ ] Display name approved; number verified.

## 2. Credentials → server environment (never commit, never put in the UI)
- [ ] `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`
- [ ] **System User** (Business settings → Users → System users) with the WABA assigned; generate a **permanent token** with `whatsapp_business_messaging` and `whatsapp_business_management` → `WHATSAPP_ACCESS_TOKEN`. (The 24-hour test token is for development only.)
- [ ] `WHATSAPP_APP_SECRET` = the app's *App secret* (used to verify `X-Hub-Signature-256`).
- [ ] `WHATSAPP_WEBHOOK_VERIFY_TOKEN` = a long random string you invent.
- [ ] `WHATSAPP_GRAPH_VERSION` = a current Graph API version; `WHATSAPP_TEMPLATE_LANGUAGE` = the language code you submit templates in.

## 3. Webhook
- [ ] Callback URL `https://<domain>/api/whatsapp/webhook`, verify token as above; **Verify and save**.
- [ ] Subscribe the WABA to the **messages** field (delivery statuses and replies such as STOP).

## 4. Templates (category **Utility**; Meta may re-classify)
Submit both with the *same language code* as `WHATSAPP_TEMPLATE_LANGUAGE`, body variables in this order: `{{1}}` first name, `{{2}}` amount in ₹ (no symbol), `{{3}}` due date (e.g. `5 Mar 2026`).

**`gym_fee_reminder`**
> Hi {{1}}! Your Tiger Fitness membership fee of ₹{{2}} is due on {{3}}. Please make your payment on time. Thank you, Tiger Fitness Gym.

**`gym_fee_overdue`**
> Hi {{1}}! Our records show that your Tiger Fitness membership fee of ₹{{2}}, due on {{3}}, is still pending. If you've already paid, please contact the gym. Thank you, Tiger Fitness Gym.

- [ ] Both show **Approved** (Settings → *Check connection with Meta* lists their status when `WHATSAPP_BUSINESS_ACCOUNT_ID` is set).

## 5. Development with Meta's test number
- [ ] Add your own phone to the test number's **allowed recipients**.
- [ ] Settings → *Send test message* (always available in dev; in production needs `WHATSAPP_ALLOW_TEST_SEND=true`). Confirm it arrives, and that the webhook moves it to *Delivered* (visible on **Reminders**).

## 6. Consent (the gym's responsibility)
- [ ] Decide and document how consent is collected (e.g. a clause on the signed enrolment form) and record it per member with its source.
- [ ] Provide a privacy notice; honour opt-outs (staff can untick consent; members can reply **STOP**).
- [ ] Follow WhatsApp Business messaging policy and applicable Indian law.

## 7. Go live
- [ ] Production env vars set; migrations applied; first admin created; Supabase signup disabled.
- [ ] Real plan prices entered; a few members added with consent recorded.
- [ ] One end-to-end test to a real, consenting recipient delivered.
- [ ] Settings → **Turn automatic reminders on**. First run: next 09:00 IST.
