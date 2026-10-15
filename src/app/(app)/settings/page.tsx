import { ConnectionCheck, GymForm, PlanPriceForm, RemindersToggle, TestSend } from "@/components/settings-forms";
import { Badge } from "@/components/ui/badge";
import { Card, PageHeader, SectionTitle } from "@/components/ui/card";
import { TEMPLATE_NAMES } from "@/lib/reminders";
import { testSendAllowed, whatsappEnvStatus } from "@/lib/env";
import { getGymSettings, requireAdmin } from "@/server/auth";
import { getPlans } from "@/server/queries";

export const metadata = { title: "Plans & settings" };
export const dynamic = "force-dynamic";

function EnvRow({ name, ok }: { name: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <code className="min-w-0 truncate text-sm">{name}</code>
      <Badge tone={ok ? "good" : "bad"}>{ok ? "Set" : "Missing"}</Badge>
    </li>
  );
}

export default async function SettingsPage() {
  const { supabase } = await requireAdmin();
  const [settings, plans] = await Promise.all([getGymSettings(), getPlans(supabase)]);
  const env = whatsappEnvStatus();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader title="Plans & settings" />

      <section aria-labelledby="plans-h" className="space-y-3">
        <SectionTitle>
          <span id="plans-h">Membership plans</span>
        </SectionTitle>
        <p className="text-sm text-ink-soft">
          List prices pre-fill when you assign a plan. Changing one never alters existing members&apos; agreed fees or bills already generated.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id}>
              <PlanPriceForm
                plan={{ id: p.id, name: p.name, durationMonths: p.duration_months, pricePaise: p.list_price_paise, updatedAt: p.updated_at }}
              />
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="gym-h" className="space-y-3">
        <SectionTitle>
          <span id="gym-h">Gym details</span>
        </SectionTitle>
        <Card>
          <GymForm gymName={settings.gym_name} timezone={settings.timezone} />
        </Card>
      </section>

      <section aria-labelledby="auto-h" className="space-y-3">
        <SectionTitle>
          <span id="auto-h">Automatic WhatsApp reminders</span>
        </SectionTitle>
        <Card>
          <RemindersToggle enabled={settings.reminders_enabled} />
        </Card>
      </section>

      <section aria-labelledby="wa-h" className="space-y-3">
        <SectionTitle>
          <span id="wa-h">WhatsApp integration</span>
        </SectionTitle>
        <Card className="space-y-4">
          <p className="text-sm text-ink-soft">
            Credentials live in server environment variables and are never shown or editable here. This panel only reports whether they are present.
          </p>
          <ul className="divide-y divide-line">
            <EnvRow name="WHATSAPP_ACCESS_TOKEN" ok={env.accessToken} />
            <EnvRow name="WHATSAPP_PHONE_NUMBER_ID" ok={env.phoneNumberId} />
            <EnvRow name="WHATSAPP_BUSINESS_ACCOUNT_ID" ok={env.businessAccountId} />
            <EnvRow name="WHATSAPP_WEBHOOK_VERIFY_TOKEN" ok={env.webhookVerifyToken} />
            <EnvRow name="WHATSAPP_APP_SECRET" ok={env.appSecret} />
            <EnvRow name="CRON_SECRET" ok={env.cronSecret} />
            <EnvRow name="SUPABASE_SERVICE_ROLE_KEY" ok={env.serviceRoleKey} />
          </ul>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="font-semibold text-ink-soft">Graph API version</dt>
              <dd>{env.graphVersion}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink-soft">Template language</dt>
              <dd>{env.templateLanguage}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink-soft">Due-date template</dt>
              <dd>
                <code>{TEMPLATE_NAMES.before_due}</code>
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink-soft">Overdue template</dt>
              <dd>
                <code>{TEMPLATE_NAMES.overdue}</code>
              </dd>
            </div>
          </dl>
          <p className="text-sm text-ink-soft">
            Webhook callback URL: <code>/api/whatsapp/webhook</code> on your deployed domain.
          </p>
          <ConnectionCheck />
          <hr className="border-line" />
          <TestSend allowed={testSendAllowed()} />
        </Card>
      </section>
    </div>
  );
}
